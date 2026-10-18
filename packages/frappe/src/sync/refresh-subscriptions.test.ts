import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrappeCollection } from '../collection';
import type { ListOptions } from '../core/types';
import { SyncModule as PublicSyncModule } from '../index';

import { Order, defaultPageLength } from './types';
import type { SubscriptionQuery } from './types';

import { SyncModule } from './index';

vi.mock(import('@repo/platform'), () => ({
  isNative: false,
  isServer: true,
  isWindowDefined: false,
  onAppFocus: () => () => {},
  onOnline: () => () => {},
  onVisibilityChange: () => () => {},
}));
const row = (name: string, title = name) => ({
  name,
  title,
  doctype: 'Item',
  modified: '2026-09-09T01:00:00Z',
});
type Row = ReturnType<typeof row>;
type ListResult = Row[] | { data: Row[]; cursor: string };

describe('SyncModule.refreshSubscriptions', () => {
  const instances: SyncModule[] = [];
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    try {
      for (const cleanup of cleanups.splice(0)) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- teardown runs in registration order
        await cleanup();
      }
    } finally {
      for (const sync of instances.splice(0)) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- teardown runs in registration order
        await sync.dispose();
      }
    }
  });
  const setup = () => {
    const db = {
      getDocList: vi
        .fn<(doctype: string, options?: ListOptions) => Promise<ListResult>>()
        .mockResolvedValue([row('a'), row('b')]),
    };
    const sync = new SyncModule(db as never, undefined);
    instances.push(sync);
    return { db, sync };
  };

  it('replaces mounted collection membership and clears authoritative empty snapshots', async () => {
    const { db, sync } = setup();
    const subscribe = vi.spyOn(sync, 'subscribe');
    const collection = createFrappeCollection<ReturnType<typeof row>>('Item', { sync });
    cleanups.push(async () => {
      await collection.cleanup();
    });
    await collection.preload();
    const originalCollection = collection;
    const { subscriptionId: id } = await subscribe.mock.results[0].value;
    const observed: string[][] = [];
    const stopObserving = sync.subscribeStore(() => {
      observed.push(sync.getDocsForSubscription(id).map((doc) => doc.name));
    });
    cleanups.push(async () => {
      stopObserving();
    });
    db.getDocList.mockResolvedValue({
      data: [row('b', 'updated'), row('c')],
      cursor: 'replacement-cursor',
    });
    const [result] = await sync.refreshSubscriptions();
    expect(result.ok).toBe(true);
    expect(result.subscriptionId).toBe(id);
    expect(collection).toBe(originalCollection);
    expect(
      [...collection.state.values()]
        .map(({ name, title }) => ({ name, title }))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    ).toStrictEqual([
      { name: 'b', title: 'updated' },
      { name: 'c', title: 'c' },
    ]);
    expect(observed).toStrictEqual([['b', 'c']]);
    expect(sync.getSubscription(id)?.cursor).toBe('replacement-cursor');
    expect(sync.getDocFromCache('Item', 'a')).toStrictEqual(row('a'));
    db.getDocList.mockResolvedValue([]);
    await expect(sync.refreshSubscriptions()).resolves.toStrictEqual([result]);
    expect([...collection.state.values()]).toStrictEqual([]);
    expect(sync.getSubscription(result.subscriptionId)?.boundaries).toBeUndefined();
    expect(collection).toBe(originalCollection);
    expect(observed).toStrictEqual([['b', 'c'], []]);
    expect(subscribe).toHaveBeenCalledOnce();
    expect(sync.getSubscription(id)).toMatchObject({
      id,
      docIds: [],
      metadata: { itemsBeforePage: 0, itemsAfterPage: 0 },
    });
    expect(sync.getSubscription(id)?.cursor).toBeUndefined();
    expect(sync.getSubscription(id)?.checkpoint).toBeUndefined();
  });

  it('retains data and checkpoint on failure and preserves the query', async () => {
    const { db, sync } = setup();
    db.getDocList.mockResolvedValue({ data: [row('a'), row('b')], cursor: 'committed-cursor' });
    const query = {
      doctype: 'Item',
      fields: ['title'],
      filters: { enabled: 1 },
      orderBy: [{ field: 'title', order: Order.Desc }],
      limit: 3,
      limitStart: 6,
    };
    const { subscriptionId } = await sync.subscribe(query);
    const before = structuredClone(sync.getSubscription(subscriptionId));
    const error = new Error('offline');
    db.getDocList.mockRejectedValue(error);
    const results = await sync.refreshSubscriptions();
    expect(results).toStrictEqual([{ subscriptionId, ok: false, error }]);
    expect(results[0].error).toBe(error);
    expect(sync.getSubscription(subscriptionId)).toStrictEqual({ ...before, stale: true });
    expect(db.getDocList.mock.calls).toStrictEqual(
      Array.from({ length: 2 }, () => [
        'Item',
        {
          fields: ['title', 'modified', 'name'],
          filters: { enabled: 1 },
          orderBy: [{ field: 'title', order: Order.Desc }],
          limit: 3,
          limitStart: 6,
        },
      ]),
    );
    expect(sync.getDocsForSubscription(subscriptionId)).toStrictEqual([row('a'), row('b')]);
  });

  it('coalesces overlapping requests into a trailing authoritative fetch', async () => {
    const { db, sync } = setup();
    const { subscriptionId } = await sync.subscribe({ doctype: 'Item' });
    const first = Promise.withResolvers<Row[]>();
    const last = Promise.withResolvers<Row[]>();
    db.getDocList.mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    const one = sync.refreshSubscriptions();
    await vi.waitFor(() => {
      expect(db.getDocList).toHaveBeenCalledTimes(2);
    });
    const two = sync.refreshSubscriptions();
    await Promise.resolve();
    first.resolve([row('old')]);
    await vi.waitFor(() => {
      expect(db.getDocList).toHaveBeenCalledTimes(3);
    });
    expect(sync.getDocsForSubscription(subscriptionId)).toStrictEqual([row('a'), row('b')]);
    last.resolve([row('new')]);
    await expect(one).resolves.toStrictEqual(await two);
    expect(sync.getDocsForSubscription(subscriptionId)).toStrictEqual([row('new')]);
  });

  it('does not resurrect an unsubscribed request or modify its cached rows', async () => {
    const { db, sync } = setup();
    const { subscriptionId } = await sync.subscribe({ doctype: 'Item' });
    const pending = Promise.withResolvers<Row[]>();
    db.getDocList.mockReturnValueOnce(pending.promise);
    const refresh = sync.refreshSubscriptions();
    await vi.waitFor(() => {
      expect(db.getDocList).toHaveBeenCalledTimes(2);
    });
    sync.unsubscribe(subscriptionId);
    pending.resolve([row('a', 'obsolete')]);
    const [refreshed] = await refresh;
    expect(refreshed.ok).toBe(false);
    expect(sync.getSubscription(subscriptionId)).toBeUndefined();
    expect(sync.getDocFromCache('Item', 'a')).toStrictEqual(row('a'));
  });

  it('filters active doctypes and explicitly declines progressive refresh', async () => {
    const { db, sync } = setup();
    await sync.subscribe({ doctype: 'Item' });
    const progressive = await sync.subscribe({ doctype: 'Paged', progressive: true });
    const before = structuredClone(sync.getSubscription(progressive.subscriptionId));
    const pageBefore = structuredClone(sync.getPageInfo(progressive.subscriptionId));
    expect(db.getDocList).toHaveBeenCalledTimes(2);
    db.getDocList.mockClear();
    await expect(sync.refreshSubscriptions({ doctypes: [] })).resolves.toStrictEqual([]);
    await expect(sync.refreshSubscriptions({ doctypes: ['Unknown'] })).resolves.toStrictEqual([]);
    expect(db.getDocList).not.toHaveBeenCalled();
    const [itemResult] = await sync.refreshSubscriptions({ doctypes: ['Item'] });
    expect(itemResult.ok).toBe(true);
    expect(db.getDocList).toHaveBeenCalledOnce();
    const result = await sync.refreshSubscriptions({ doctypes: ['Paged'] });
    expect(sync.getSubscription(progressive.subscriptionId)).toStrictEqual(before);
    expect(sync.getPageInfo(progressive.subscriptionId)).toStrictEqual(pageBefore);
    expect(result).toStrictEqual([
      {
        subscriptionId: progressive.subscriptionId,
        ok: false,
        error: new Error('Snapshot refresh does not support progressive subscriptions'),
      },
    ]);
    expect(db.getDocList).toHaveBeenCalledOnce();
  });

  it('exports the public runtime constructor', () => {
    expect(PublicSyncModule).toBe(SyncModule);
    expect(PublicSyncModule.prototype).toHaveProperty('refreshSubscriptions', expect.any(Function));
  });

  it.each([
    [undefined, undefined, defaultPageLength],
    [undefined, 8, defaultPageLength],
    [null, 4, defaultPageLength],
    [0, 0, 0],
    [7, 2, 7],
  ])('preserves query window limit=%s offset=%s', async (limit, limitStart, expectedLimit) => {
    const { sync, db } = setup();
    const query: SubscriptionQuery = {
      doctype: 'Item',
      fields: ['title', 'name', 'title'],
      filters: { enabled: 1 },
      orderBy: [{ field: 'title', order: Order.Desc }],
    };
    if (limit !== undefined) {
      // `null` stands in for an untyped caller passing no usable limit.
      query.limit = limit!;
    }
    if (limitStart !== undefined) {
      query.limitStart = limitStart;
    }
    const { subscriptionId } = await sync.subscribe(query);
    expect(sync.getSubscription(subscriptionId)?.boundaries?.pageSize).toBe(expectedLimit);
    db.getDocList.mockResolvedValue({
      data: [row('z'), { ...row('b'), modified: '2026-09-09T02:00:00Z' }],
      cursor: 'new-cursor',
    });
    await sync.refreshSubscriptions();
    const expectedOptions: ListOptions = {
      fields: ['title', 'name', 'modified'],
      filters: query.filters,
      orderBy: query.orderBy,
      limit: expectedLimit,
    };
    if (limitStart !== undefined) {
      expectedOptions.limitStart = limitStart;
    }
    expect(db.getDocList.mock.calls).toStrictEqual(Array.from({ length: 2 }, () => ['Item', expectedOptions]));
    expect(sync.getSubscription(subscriptionId)).toMatchObject({
      docIds: ['z', 'b'],
      cursor: 'new-cursor',
      checkpoint: '2026-09-09T02:00:00Z',
      boundaries: { pageSize: expectedLimit, offset: limitStart ?? 0 },
    });
  });

  const subscribeSingleName = async (status: number) => {
    const db = {
      getDoc: vi.fn<(doctype: string, name: string) => Promise<Row>>().mockResolvedValue(row('a')),
      getDocList: vi.fn<(doctype: string, options?: ListOptions) => Promise<ListResult>>(),
    };
    const sync = new SyncModule(db as never, undefined);
    instances.push(sync);
    const { subscriptionId } = await sync.subscribe({ doctype: 'Item', filters: { name: 'a' } });
    const before = structuredClone(sync.getSubscription(subscriptionId));
    const error = Object.assign(new Error('getDoc failed'), { status });
    db.getDoc.mockRejectedValue(error);
    const results = await sync.refreshSubscriptions();
    expect(db.getDoc.mock.calls).toStrictEqual([
      ['Item', 'a'],
      ['Item', 'a'],
    ]);
    expect(db.getDocList).not.toHaveBeenCalled();
    expect(sync.getDocFromCache('Item', 'a')).toStrictEqual(row('a'));
    return { sync, subscriptionId, before, error, results };
  };

  it('handles single-name getDoc status 404 as an authoritative empty result', async () => {
    const { sync, subscriptionId, results } = await subscribeSingleName(404);
    expect(results).toStrictEqual([{ subscriptionId, ok: true }]);
    expect(sync.getDocsForSubscription(subscriptionId)).toStrictEqual([]);
    expect(sync.getSubscription(subscriptionId)?.boundaries).toBeUndefined();
  });

  it('handles single-name getDoc status 403 as a stale failure', async () => {
    const { sync, subscriptionId, before, error, results } = await subscribeSingleName(403);
    expect(results).toStrictEqual([{ subscriptionId, ok: false, error }]);
    expect(sync.getSubscription(subscriptionId)).toStrictEqual({ ...before, stale: true });
  });

  it('returns independent success, failure and progressive refusal', async () => {
    const { sync, db } = setup();
    const item = await sync.subscribe({ doctype: 'Item' });
    const other = await sync.subscribe({ doctype: 'Other' });
    const progressive = await sync.subscribe({ doctype: 'Paged', progressive: true });
    const before = structuredClone(sync.getSubscription(progressive.subscriptionId));
    const pageBefore = structuredClone(sync.getPageInfo(progressive.subscriptionId));
    const error = new Error('offline');
    db.getDocList.mockRejectedValueOnce(error).mockResolvedValueOnce([row('success')]);
    await expect(sync.refreshSubscriptions()).resolves.toStrictEqual([
      { subscriptionId: item.subscriptionId, ok: false, error },
      { subscriptionId: other.subscriptionId, ok: true },
      {
        subscriptionId: progressive.subscriptionId,
        ok: false,
        error: new Error('Snapshot refresh does not support progressive subscriptions'),
      },
    ]);
    expect(sync.getSubscription(progressive.subscriptionId)).toStrictEqual(before);
    expect(sync.getPageInfo(progressive.subscriptionId)).toStrictEqual(pageBefore);
    expect(db.getDocList).toHaveBeenCalledTimes(5);
  });

  it.each(['resetCache', 'dispose'] as const)('invalidates a pending refresh on %s', async (action) => {
    const { sync, db } = setup();
    const { subscriptionId } = await sync.subscribe({ doctype: 'Item' });
    const pending = Promise.withResolvers<Row[]>();
    const started = Promise.withResolvers<boolean>();
    db.getDocList.mockImplementationOnce(async () => {
      started.resolve(true);
      return await pending.promise;
    });
    const result = sync.refreshSubscriptions();
    await started.promise;
    await sync[action]();
    pending.resolve([row('a', 'obsolete'), row('obsolete')]);
    const [invalidated] = await result;
    expect(invalidated.ok).toBe(false);
    expect(sync.getSubscription(subscriptionId)).toBeUndefined();
    expect(sync.getDocFromCache('Item', 'a')).toBeUndefined();
    expect(sync.getDocFromCache('Item', 'obsolete')).toBeUndefined();
  });
});

import { afterEach, expect, it, vi, test } from 'vitest';

import { createFrappeCollection } from '../collection';
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
const instances: SyncModule[] = [];
const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) {
      await cleanup();
    }
  } finally {
    for (const sync of instances.splice(0)) {
      await sync.dispose();
    }
  }
});
const row = (name: string, title = name) => ({
  name,
  title,
  doctype: 'Item',
  modified: '2026-09-09T01:00:00Z',
});
function setup() {
  const db = { getDocList: vi.fn().mockResolvedValue([row('a'), row('b')]) };
  const sync = new SyncModule(db as never, undefined);
  instances.push(sync);
  return { db, sync };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('replaces mounted collection membership and clears authoritative empty snapshots', async () => {
  const { db, sync } = setup();
  const subscribe = vi.spyOn(sync, 'subscribe');
  const collection = createFrappeCollection<ReturnType<typeof row>>('Item', { sync });
  cleanups.push(async () => await collection.cleanup());
  await collection.preload();
  const originalCollection = collection;
  const id = (await subscribe.mock.results[0].value).subscriptionId;
  const observed: string[][] = [];
  cleanups.push(
    sync.subscribeStore(() => {
      observed.push(sync.getDocsForSubscription(id).map((doc) => doc.name));
    }),
  );
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
      .sort((a, b) => a.name.localeCompare(b.name)),
  ).toEqual([
    { name: 'b', title: 'updated' },
    { name: 'c', title: 'c' },
  ]);
  expect(observed).toEqual([['b', 'c']]);
  expect(sync.getSubscription(id)?.cursor).toBe('replacement-cursor');
  expect(sync.getDocFromCache('Item', 'a')).toEqual(row('a'));
  db.getDocList.mockResolvedValue([]);
  await expect(sync.refreshSubscriptions()).resolves.toEqual([result]);
  expect([...collection.state.values()]).toEqual([]);
  expect(sync.getSubscription(result.subscriptionId)?.boundaries).toBeUndefined();
  expect(collection).toBe(originalCollection);
  expect(observed).toEqual([['b', 'c'], []]);
  expect(subscribe).toHaveBeenCalledOnce();
  expect(sync.getSubscription(id)).toMatchObject({
    id,
    docIds: [],
    metadata: { itemsBeforePage: 0, itemsAfterPage: 0 },
  });
  expect(sync.getSubscription(id)?.cursor).toBeUndefined();
  expect(sync.getSubscription(id)?.checkpoint).toBeUndefined();
});

test('retains data and checkpoint on failure and preserves the query', async () => {
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
  expect(results).toEqual([{ subscriptionId, ok: false, error }]);
  expect(results[0].error).toBe(error);
  expect(sync.getSubscription(subscriptionId)).toEqual({ ...before, stale: true });
  expect(db.getDocList.mock.calls).toEqual(
    Array(2).fill([
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
  expect(sync.getDocsForSubscription(subscriptionId)).toEqual([row('a'), row('b')]);
});

test('coalesces overlapping requests into a trailing authoritative fetch', async () => {
  const { db, sync } = setup();
  const { subscriptionId } = await sync.subscribe({ doctype: 'Item' });
  const first = deferred<ReturnType<typeof row>[]>();
  const last = deferred<ReturnType<typeof row>[]>();
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
  expect(sync.getDocsForSubscription(subscriptionId)).toEqual([row('a'), row('b')]);
  last.resolve([row('new')]);
  await expect(one).resolves.toEqual(await two);
  expect(sync.getDocsForSubscription(subscriptionId)).toEqual([row('new')]);
});

test('does not resurrect an unsubscribed request or modify its cached rows', async () => {
  const { db, sync } = setup();
  const { subscriptionId } = await sync.subscribe({ doctype: 'Item' });
  const pending = deferred<ReturnType<typeof row>[]>();
  db.getDocList.mockReturnValueOnce(pending.promise);
  const refresh = sync.refreshSubscriptions();
  await vi.waitFor(() => {
    expect(db.getDocList).toHaveBeenCalledTimes(2);
  });
  sync.unsubscribe(subscriptionId);
  pending.resolve([row('a', 'obsolete')]);
  expect((await refresh)[0].ok).toBe(false);
  expect(sync.getSubscription(subscriptionId)).toBeUndefined();
  expect(sync.getDocFromCache('Item', 'a')).toEqual(row('a'));
});

test('filters active doctypes and explicitly declines progressive refresh', async () => {
  const { db, sync } = setup();
  await sync.subscribe({ doctype: 'Item' });
  const progressive = await sync.subscribe({ doctype: 'Paged', progressive: true });
  const before = structuredClone(sync.getSubscription(progressive.subscriptionId));
  const pageBefore = structuredClone(sync.getPageInfo(progressive.subscriptionId));
  expect(db.getDocList).toHaveBeenCalledTimes(2);
  db.getDocList.mockClear();
  await expect(sync.refreshSubscriptions({ doctypes: [] })).resolves.toEqual([]);
  await expect(sync.refreshSubscriptions({ doctypes: ['Unknown'] })).resolves.toEqual([]);
  expect(db.getDocList).not.toHaveBeenCalled();
  expect((await sync.refreshSubscriptions({ doctypes: ['Item'] }))[0].ok).toBe(true);
  expect(db.getDocList).toHaveBeenCalledOnce();
  const result = await sync.refreshSubscriptions({ doctypes: ['Paged'] });
  expect(sync.getSubscription(progressive.subscriptionId)).toEqual(before);
  expect(sync.getPageInfo(progressive.subscriptionId)).toEqual(pageBefore);
  expect(result).toEqual([
    {
      subscriptionId: progressive.subscriptionId,
      ok: false,
      error: new Error('Snapshot refresh does not support progressive subscriptions'),
    },
  ]);
  expect(db.getDocList).toHaveBeenCalledOnce();
});

test('exports the public runtime constructor', () => {
  expect(PublicSyncModule).toBe(SyncModule);
  expect(PublicSyncModule.prototype.refreshSubscriptions).toBeTypeOf('function');
});

test.each([
  [undefined, undefined, defaultPageLength],
  [undefined, 8, defaultPageLength],
  [null, 4, defaultPageLength],
  [0, 0, 0],
  [7, 2, 7],
])('preserves query window limit=%s offset=%s', async (limit, limitStart, expectedLimit) => {
  const { sync, db } = setup();
  const query = {
    doctype: 'Item',
    fields: ['title', 'name', 'title'],
    filters: { enabled: 1 },
    orderBy: [{ field: 'title', order: Order.Desc }],
    ...(limit === undefined ? {} : { limit }),
    ...(limitStart === undefined ? {} : { limitStart }),
  } as SubscriptionQuery;
  const { subscriptionId } = await sync.subscribe(query);
  expect(sync.getSubscription(subscriptionId)?.boundaries?.pageSize).toBe(expectedLimit);
  db.getDocList.mockResolvedValue({
    data: [row('z'), { ...row('b'), modified: '2026-09-09T02:00:00Z' }],
    cursor: 'new-cursor',
  });
  await sync.refreshSubscriptions();
  expect(db.getDocList.mock.calls).toEqual(
    Array(2).fill([
      'Item',
      {
        fields: ['title', 'name', 'modified'],
        filters: query.filters,
        orderBy: query.orderBy,
        limit: expectedLimit,
        ...(limitStart === undefined ? {} : { limitStart }),
      },
    ]),
  );
  expect(sync.getSubscription(subscriptionId)).toMatchObject({
    docIds: ['z', 'b'],
    cursor: 'new-cursor',
    checkpoint: '2026-09-09T02:00:00Z',
    boundaries: { pageSize: expectedLimit, offset: limitStart ?? 0 },
  });
});

test.each([404, 403])('handles single-name getDoc status %s', async (status) => {
  const db = { getDoc: vi.fn().mockResolvedValue(row('a')), getDocList: vi.fn() };
  const sync = new SyncModule(db as never, undefined);
  instances.push(sync);
  const { subscriptionId } = await sync.subscribe({ doctype: 'Item', filters: { name: 'a' } });
  const before = structuredClone(sync.getSubscription(subscriptionId));
  const error = Object.assign(new Error('getDoc failed'), { status });
  db.getDoc.mockRejectedValue(error);
  await expect(sync.refreshSubscriptions()).resolves.toEqual([
    { subscriptionId, ok: status === 404, ...(status === 404 ? {} : { error }) },
  ]);
  expect(db.getDoc.mock.calls).toEqual([
    ['Item', 'a'],
    ['Item', 'a'],
  ]);
  expect(db.getDocList).not.toHaveBeenCalled();
  if (status === 404) {
    expect(sync.getDocsForSubscription(subscriptionId)).toEqual([]);
    expect(sync.getSubscription(subscriptionId)?.boundaries).toBeUndefined();
  } else {
    expect(sync.getSubscription(subscriptionId)).toEqual({ ...before, stale: true });
  }
  expect(sync.getDocFromCache('Item', 'a')).toEqual(row('a'));
});

test('returns independent success, failure and progressive refusal', async () => {
  const { sync, db } = setup();
  const item = await sync.subscribe({ doctype: 'Item' });
  const other = await sync.subscribe({ doctype: 'Other' });
  const progressive = await sync.subscribe({ doctype: 'Paged', progressive: true });
  const before = structuredClone(sync.getSubscription(progressive.subscriptionId));
  const pageBefore = structuredClone(sync.getPageInfo(progressive.subscriptionId));
  const error = new Error('offline');
  db.getDocList.mockRejectedValueOnce(error).mockResolvedValueOnce([row('success')]);
  await expect(sync.refreshSubscriptions()).resolves.toEqual([
    { subscriptionId: item.subscriptionId, ok: false, error },
    { subscriptionId: other.subscriptionId, ok: true },
    {
      subscriptionId: progressive.subscriptionId,
      ok: false,
      error: new Error('Snapshot refresh does not support progressive subscriptions'),
    },
  ]);
  expect(sync.getSubscription(progressive.subscriptionId)).toEqual(before);
  expect(sync.getPageInfo(progressive.subscriptionId)).toEqual(pageBefore);
  expect(db.getDocList).toHaveBeenCalledTimes(5);
});

test.each(['resetCache', 'dispose'] as const)('invalidates a pending refresh on %s', async (action) => {
  const { sync, db } = setup();
  const { subscriptionId } = await sync.subscribe({ doctype: 'Item' });
  const pending = deferred<ReturnType<typeof row>[]>();
  const started = deferred<void>();
  db.getDocList.mockImplementationOnce(async () => {
    started.resolve();
    return await pending.promise;
  });
  const result = sync.refreshSubscriptions();
  await started.promise;
  await sync[action]();
  pending.resolve([row('a', 'obsolete'), row('obsolete')]);
  expect((await result)[0].ok).toBe(false);
  expect(sync.getSubscription(subscriptionId)).toBeUndefined();
  expect(sync.getDocFromCache('Item', 'a')).toBeUndefined();
  expect(sync.getDocFromCache('Item', 'obsolete')).toBeUndefined();
});

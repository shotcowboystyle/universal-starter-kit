import { describe, expect, it, vi, test } from 'vitest';

import { NormalizedCache } from './normalizedCache';
import { SubscriptionManager } from './subscriptionManager';
import type { SyncOptions } from './types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const row = (name: string, title = name) => ({
  name,
  title,
  doctype: 'Item',
  modified: '2026-09-09T01:00:00Z',
});
const query = { doctype: 'Item' };
async function setup(options: SyncOptions = {}) {
  const db = { getDocList: vi.fn().mockResolvedValue([row('a')]) };
  const cache = new NormalizedCache();
  const manager = new SubscriptionManager(db as never, cache, options);
  const { subscriptionId: id } = await manager.subscribe(query);
  return { db, cache, manager, id };
}
function pending(db: Awaited<ReturnType<typeof setup>>['db']) {
  const response = deferred<ReturnType<typeof row>[]>();
  const started = deferred<void>();
  db.getDocList.mockImplementationOnce(async () => {
    started.resolve();
    return await response.promise;
  });
  return { ...response, started: started.promise };
}

describe('snapshot refresh lifecycle', () => {
  it.each(['resolve', 'reject'] as const)(
    'invalidates pre-detach refresh that later %ss after re-adoption',
    async (outcome) => {
      const { manager, db, cache, id } = await setup({ persistKey: 'lifecycle' });
      const old = pending(db);
      const oldResult = manager.refreshSubscriptions();
      await old.started;
      manager.unsubscribe(id);
      const fresh = pending(db);
      const adopted = await manager.subscribe(query);
      expect(adopted.subscriptionId).toBe(id);
      expect(adopted.rows).toEqual([row('a')]);
      await fresh.started;
      fresh.resolve([row('a', 'new-adoption')]);
      await expect(adopted.refresh).resolves.toMatchObject({ ok: true });
      if (outcome === 'resolve') {
        old.resolve([row('a', 'obsolete-before-detach'), row('obsolete')]);
      } else {
        old.reject(new Error('old failure'));
      }
      expect((await oldResult)[0].ok).toBe(false);
      expect(manager.getDocsForSubscription(id)).toEqual([row('a', 'new-adoption')]);
      expect(cache.get({ doctype: 'Item', name: 'obsolete' })).toBeUndefined();
      expect(manager.getSubscription(id)?.stale).toBe(false);
    },
  );

  it('does not let an old finally erase the new adoption operation', async () => {
    const { manager, db, cache, id } = await setup({ persistKey: 'lifecycle' });
    const old = pending(db);
    const oldResult = manager.refreshSubscriptions();
    await old.started;
    manager.unsubscribe(id);
    const adoption = pending(db);
    const adopted = await manager.subscribe(query);
    await adoption.started;
    old.resolve([row('obsolete')]);
    expect((await oldResult)[0].ok).toBe(false);
    const trailing = pending(db);
    const explicit = manager.refreshSubscriptions();
    expect(db.getDocList).toHaveBeenCalledTimes(3);
    adoption.resolve([row('discarded-adoption')]);
    await trailing.started;
    expect(cache.get({ doctype: 'Item', name: 'discarded-adoption' })).toBeUndefined();
    expect(manager.getDocsForSubscription(id)).toEqual([row('a')]);
    trailing.resolve([row('final')]);
    await expect(adopted.refresh).resolves.toEqual((await explicit)[0]);
    expect(manager.getDocsForSubscription(id)).toEqual([row('final')]);
    expect(db.getDocList).toHaveBeenCalledTimes(4);
  });

  it.each([false, true])(
    'coalesces requests and retains the committed snapshot when trailing fails=%s',
    async (fails) => {
      const { manager, db, cache, id } = await setup();
      const before = structuredClone(manager.getSubscription(id));
      const first = pending(db);
      const one = manager.refreshSubscriptions();
      await first.started;
      const last = pending(db);
      const two = manager.refreshSubscriptions();
      const three = manager.refreshSubscriptions();
      first.resolve([row('a', 'discarded'), row('obsolete')]);
      await last.started;
      expect(cache.get({ doctype: 'Item', name: 'obsolete' })).toBeUndefined();
      expect(manager.getDocsForSubscription(id)).toEqual([row('a')]);
      const error = new Error('trailing failed');
      if (fails) {
        last.reject(error);
      } else {
        last.resolve([row('final')]);
      }
      const results = await Promise.all([one, two, three]);
      expect(results).toEqual(Array(3).fill([{ subscriptionId: id, ok: !fails, ...(fails ? { error } : {}) }]));
      if (fails) {
        for (const result of results) {
          expect(result[0].error).toBe(error);
        }
      }
      expect(db.getDocList).toHaveBeenCalledTimes(3);
      if (fails) {
        expect(manager.getSubscription(id)).toEqual({ ...before, stale: true });
      } else {
        expect(manager.getDocsForSubscription(id)).toEqual([row('final')]);
      }
      await manager.refreshSubscriptions();
      expect(db.getDocList).toHaveBeenCalledTimes(4);
    },
  );

  it('trails a failed attempt only when another caller requested it', async () => {
    const { manager, db, id } = await setup();
    const first = pending(db);
    const one = manager.refreshSubscriptions();
    await first.started;
    const last = pending(db);
    const two = manager.refreshSubscriptions();
    first.reject(new Error('superseded failure'));
    await last.started;
    last.resolve([row('final')]);
    await expect(one).resolves.toEqual(await two);
    expect(manager.getDocsForSubscription(id)).toEqual([row('final')]);
    expect(db.getDocList).toHaveBeenCalledTimes(3);
  });

  it('joins an adoption already fetching and discards its superseded rows', async () => {
    const { manager, db, cache, id } = await setup({ persistKey: 'lifecycle' });
    manager.unsubscribe(id);
    const adoption = pending(db);
    const adopted = await manager.subscribe(query);
    await adoption.started;
    const last = pending(db);
    const explicit = manager.refreshSubscriptions();
    adoption.resolve([row('obsolete')]);
    await last.started;
    expect(cache.get({ doctype: 'Item', name: 'obsolete' })).toBeUndefined();
    last.resolve([row('final')]);
    await expect(adopted.refresh).resolves.toEqual((await explicit)[0]);
    expect(manager.getDocsForSubscription(id)).toEqual([row('final')]);
  });

  it('invalidates the last release without corrupting cached documents', async () => {
    const { manager, db, cache, id } = await setup();
    const read = pending(db);
    const result = manager.refreshSubscriptions();
    await read.started;
    manager.unsubscribe(id);
    read.resolve([row('a', 'obsolete'), row('new')]);
    expect((await result)[0].ok).toBe(false);
    expect(manager.getSubscription(id)).toBeUndefined();
    expect(cache.get({ doctype: 'Item', name: 'a' })).toEqual(row('a'));
    expect(cache.get({ doctype: 'Item', name: 'new' })).toBeUndefined();
  });

  it('keeps shared refreshes active until the last consumer releases', async () => {
    const { manager, db, id } = await setup();
    expect((await manager.subscribe(query)).subscriptionId).toBe(id);
    const first = pending(db);
    const one = manager.refreshSubscriptions();
    await first.started;
    manager.unsubscribe(id);
    first.resolve([row('updated')]);
    await expect(one).resolves.toEqual([{ subscriptionId: id, ok: true }]);
    const last = pending(db);
    const two = manager.refreshSubscriptions();
    await last.started;
    manager.unsubscribe(id);
    last.resolve([row('obsolete')]);
    expect((await two)[0].ok).toBe(false);
    expect(manager.getSubscription(id)).toBeUndefined();
  });

  it('invalidates clear and allows a subsequent activation', async () => {
    const { manager, db, cache, id } = await setup();
    const old = pending(db);
    const result = manager.refreshSubscriptions();
    await old.started;
    manager.clear();
    cache.clear();
    const fresh = await manager.subscribe(query);
    old.resolve([row('a', 'obsolete'), row('obsolete')]);
    expect((await result)[0].ok).toBe(false);
    expect(manager.getSubscription(id)).toBeUndefined();
    expect(manager.getDocsForSubscription(fresh.subscriptionId)).toEqual([row('a')]);
    expect(cache.get({ doctype: 'Item', name: 'obsolete' })).toBeUndefined();
  });

  it('does not seed in the microtask between HTTP completion and acceptance', async () => {
    const { manager, db, cache, id } = await setup();
    const first = pending(db);
    const one = manager.refreshSubscriptions();
    await first.started;
    const last = pending(db);
    first.resolve([row('obsolete')]);
    const two = Promise.resolve().then(async () => await manager.refreshSubscriptions());
    await last.started;
    expect(cache.get({ doctype: 'Item', name: 'obsolete' })).toBeUndefined();
    expect(manager.getDocsForSubscription(id)).toEqual([row('a')]);
    last.resolve([row('final')]);
    await expect(one).resolves.toEqual(await two);
  });

  it('allows different subscriptions to finish independently', async () => {
    const { manager, db, id } = await setup();
    const second = await manager.subscribe({ doctype: 'Other' });
    const slow = pending(db);
    const fast = pending(db);
    const result = manager.refreshSubscriptions();
    await Promise.all([slow.started, fast.started]);
    fast.resolve([row('fast')]);
    await Promise.resolve();
    await Promise.resolve();
    expect(manager.getSubscription(second.subscriptionId)?.docIds).toEqual(['fast']);
    expect(manager.getSubscription(id)?.docIds).toEqual(['a']);
    slow.resolve([row('slow')]);
    expect((await result).every((entry) => entry.ok)).toBe(true);
  });
});

test('excludes dormant restored subscriptions and selects each shared id once', async () => {
  const { manager, db, id } = await setup();
  await manager.subscribe(query);
  manager.restoreSubscription({ id: 'dormant', query: { doctype: 'Dormant' }, docIds: ['cached'] });
  await expect(manager.refreshSubscriptions({ doctypes: ['Dormant'] })).resolves.toEqual([]);
  await expect(manager.refreshSubscriptions({ doctypes: [] })).resolves.toEqual([]);
  expect(db.getDocList).toHaveBeenCalledOnce();
  await expect(manager.refreshSubscriptions()).resolves.toEqual([{ subscriptionId: id, ok: true }]);
  expect(db.getDocList).toHaveBeenCalledTimes(2);
  manager.unsubscribe(id);
  manager.unsubscribe(id);
  expect(manager.getSubscription(id)).toBeUndefined();
});

test('retains cached projections and documents outside the refreshed membership', async () => {
  const { manager, db, cache, id } = await setup();
  cache.upsert({ ...row('a'), detail: 'other view' });
  db.getDocList.mockResolvedValueOnce([row('b')]);
  const other = await manager.subscribe({ doctype: 'Item', filters: { enabled: 1 } });
  db.getDocList.mockResolvedValueOnce([{ name: 'a', title: 'projected' }]).mockResolvedValueOnce([]);
  await manager.refreshSubscriptions();
  expect(manager.getDocsForSubscription(id)).toEqual([{ ...row('a', 'projected'), detail: 'other view' }]);
  expect(manager.getDocsForSubscription(other.subscriptionId)).toEqual([]);
  expect(cache.get({ doctype: 'Item', name: 'b' })).toEqual(row('b'));
});

test('shares the first read when callers arrive before it starts', async () => {
  const { manager, db, id } = await setup();
  const first = pending(db);
  const one = manager.refreshSubscriptions();
  const two = manager.refreshSubscriptions();
  await first.started;
  first.resolve([row('final')]);
  await expect(one).resolves.toEqual(await two);
  expect(manager.getDocsForSubscription(id)).toEqual([row('final')]);
  expect(db.getDocList).toHaveBeenCalledTimes(2);
});

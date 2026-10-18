import { describe, expect, it, vi } from 'vitest';

import type { ListOptions } from '../core/types';

import { NormalizedCache } from './normalized-cache';
import { SubscriptionManager } from './subscription-manager';
import type { SyncOptions } from './types';

const row = (name: string, title = name) => ({
  name,
  title,
  doctype: 'Item',
  modified: '2026-09-09T01:00:00Z',
});
type Row = ReturnType<typeof row>;
const query = { doctype: 'Item' };
const setup = async (options: SyncOptions = {}) => {
  const db = {
    getDocList: vi
      .fn<(doctype: string, options?: ListOptions) => Promise<Partial<Row>[]>>()
      .mockResolvedValue([row('a')]),
  };
  const cache = new NormalizedCache();
  const manager = new SubscriptionManager(db as never, cache, options);
  const { subscriptionId: id } = await manager.subscribe(query);
  return { db, cache, manager, id };
};
const pending = (db: Awaited<ReturnType<typeof setup>>['db']) => {
  const response = Promise.withResolvers<Row[]>();
  const started = Promise.withResolvers<boolean>();
  db.getDocList.mockImplementationOnce(async () => {
    started.resolve(true);
    return await response.promise;
  });
  return { ...response, started: started.promise };
};
/** Starts the trailing refresh behind a coalesced first read; the trailing read fails when `fails`. */
const coalesceWithTrailing = async (fails: boolean) => {
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
  expect(manager.getDocsForSubscription(id)).toStrictEqual([row('a')]);
  const error = new Error('trailing failed');
  if (fails) {
    last.reject(error);
  } else {
    last.resolve([row('final')]);
  }
  const results = await Promise.all([one, two, three]);
  expect(db.getDocList).toHaveBeenCalledTimes(3);
  return { manager, db, id, before, error, results };
};

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
      expect(adopted.rows).toStrictEqual([row('a')]);
      await fresh.started;
      fresh.resolve([row('a', 'new-adoption')]);
      await expect(adopted.refresh).resolves.toMatchObject({ ok: true });
      if (outcome === 'resolve') {
        old.resolve([row('a', 'obsolete-before-detach'), row('obsolete')]);
      } else {
        old.reject(new Error('old failure'));
      }
      const [oldOutcome] = await oldResult;
      expect(oldOutcome.ok).toBe(false);
      expect(manager.getDocsForSubscription(id)).toStrictEqual([row('a', 'new-adoption')]);
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
    const [oldOutcome] = await oldResult;
    expect(oldOutcome.ok).toBe(false);
    const trailing = pending(db);
    const explicit = manager.refreshSubscriptions();
    expect(db.getDocList).toHaveBeenCalledTimes(3);
    adoption.resolve([row('discarded-adoption')]);
    await trailing.started;
    expect(cache.get({ doctype: 'Item', name: 'discarded-adoption' })).toBeUndefined();
    expect(manager.getDocsForSubscription(id)).toStrictEqual([row('a')]);
    trailing.resolve([row('final')]);
    const [explicitResult] = await explicit;
    await expect(adopted.refresh).resolves.toStrictEqual(explicitResult);
    expect(manager.getDocsForSubscription(id)).toStrictEqual([row('final')]);
    expect(db.getDocList).toHaveBeenCalledTimes(4);
  });

  it('coalesces requests and commits the trailing snapshot', async () => {
    const { manager, db, id, results } = await coalesceWithTrailing(false);
    expect(results).toStrictEqual(Array.from({ length: 3 }, () => [{ subscriptionId: id, ok: true }]));
    expect(manager.getDocsForSubscription(id)).toStrictEqual([row('final')]);
    await manager.refreshSubscriptions();
    expect(db.getDocList).toHaveBeenCalledTimes(4);
  });

  it('coalesces requests and retains the committed snapshot when the trailing read fails', async () => {
    const { manager, db, id, before, error, results } = await coalesceWithTrailing(true);
    expect(results).toStrictEqual(Array.from({ length: 3 }, () => [{ subscriptionId: id, ok: false, error }]));
    for (const [result] of results) {
      expect(result.error).toBe(error);
    }
    expect(manager.getSubscription(id)).toStrictEqual({ ...before, stale: true });
    await manager.refreshSubscriptions();
    expect(db.getDocList).toHaveBeenCalledTimes(4);
  });

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
    await expect(one).resolves.toStrictEqual(await two);
    expect(manager.getDocsForSubscription(id)).toStrictEqual([row('final')]);
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
    const [explicitResult] = await explicit;
    await expect(adopted.refresh).resolves.toStrictEqual(explicitResult);
    expect(manager.getDocsForSubscription(id)).toStrictEqual([row('final')]);
  });

  it('invalidates the last release without corrupting cached documents', async () => {
    const { manager, db, cache, id } = await setup();
    const read = pending(db);
    const result = manager.refreshSubscriptions();
    await read.started;
    manager.unsubscribe(id);
    read.resolve([row('a', 'obsolete'), row('new')]);
    const [outcome] = await result;
    expect(outcome.ok).toBe(false);
    expect(manager.getSubscription(id)).toBeUndefined();
    expect(cache.get({ doctype: 'Item', name: 'a' })).toStrictEqual(row('a'));
    expect(cache.get({ doctype: 'Item', name: 'new' })).toBeUndefined();
  });

  it('keeps shared refreshes active until the last consumer releases', async () => {
    const { manager, db, id } = await setup();
    const shared = await manager.subscribe(query);
    expect(shared.subscriptionId).toBe(id);
    const first = pending(db);
    const one = manager.refreshSubscriptions();
    await first.started;
    manager.unsubscribe(id);
    first.resolve([row('updated')]);
    await expect(one).resolves.toStrictEqual([{ subscriptionId: id, ok: true }]);
    const last = pending(db);
    const two = manager.refreshSubscriptions();
    await last.started;
    manager.unsubscribe(id);
    last.resolve([row('obsolete')]);
    const [outcome] = await two;
    expect(outcome.ok).toBe(false);
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
    const [outcome] = await result;
    expect(outcome.ok).toBe(false);
    expect(manager.getSubscription(id)).toBeUndefined();
    expect(manager.getDocsForSubscription(fresh.subscriptionId)).toStrictEqual([row('a')]);
    expect(cache.get({ doctype: 'Item', name: 'obsolete' })).toBeUndefined();
  });

  it('does not seed in the microtask between HTTP completion and acceptance', async () => {
    const { manager, db, cache, id } = await setup();
    const first = pending(db);
    const one = manager.refreshSubscriptions();
    await first.started;
    const last = pending(db);
    first.resolve([row('obsolete')]);
    const two = (async () => {
      // Requests the refresh one microtask later, between HTTP completion and acceptance.
      await Promise.resolve();
      return await manager.refreshSubscriptions();
    })();
    await last.started;
    expect(cache.get({ doctype: 'Item', name: 'obsolete' })).toBeUndefined();
    expect(manager.getDocsForSubscription(id)).toStrictEqual([row('a')]);
    last.resolve([row('final')]);
    await expect(one).resolves.toStrictEqual(await two);
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
    expect(manager.getSubscription(second.subscriptionId)?.docIds).toStrictEqual(['fast']);
    expect(manager.getSubscription(id)?.docIds).toStrictEqual(['a']);
    slow.resolve([row('slow')]);
    const outcomes = await result;
    expect(outcomes.every((entry) => entry.ok)).toBe(true);
  });

  it('excludes dormant restored subscriptions and selects each shared id once', async () => {
    const { manager, db, id } = await setup();
    await manager.subscribe(query);
    manager.restoreSubscription({ id: 'dormant', query: { doctype: 'Dormant' }, docIds: ['cached'] });
    await expect(manager.refreshSubscriptions({ doctypes: ['Dormant'] })).resolves.toStrictEqual([]);
    await expect(manager.refreshSubscriptions({ doctypes: [] })).resolves.toStrictEqual([]);
    expect(db.getDocList).toHaveBeenCalledOnce();
    await expect(manager.refreshSubscriptions()).resolves.toStrictEqual([{ subscriptionId: id, ok: true }]);
    expect(db.getDocList).toHaveBeenCalledTimes(2);
    manager.unsubscribe(id);
    manager.unsubscribe(id);
    expect(manager.getSubscription(id)).toBeUndefined();
  });

  it('retains cached projections and documents outside the refreshed membership', async () => {
    const { manager, db, cache, id } = await setup();
    cache.upsert({ ...row('a'), detail: 'other view' });
    db.getDocList.mockResolvedValueOnce([row('b')]);
    const other = await manager.subscribe({ doctype: 'Item', filters: { enabled: 1 } });
    db.getDocList.mockResolvedValueOnce([{ name: 'a', title: 'projected' }]).mockResolvedValueOnce([]);
    await manager.refreshSubscriptions();
    expect(manager.getDocsForSubscription(id)).toStrictEqual([{ ...row('a', 'projected'), detail: 'other view' }]);
    expect(manager.getDocsForSubscription(other.subscriptionId)).toStrictEqual([]);
    expect(cache.get({ doctype: 'Item', name: 'b' })).toStrictEqual(row('b'));
  });

  it('shares the first read when callers arrive before it starts', async () => {
    const { manager, db, id } = await setup();
    const first = pending(db);
    const one = manager.refreshSubscriptions();
    const two = manager.refreshSubscriptions();
    await first.started;
    first.resolve([row('final')]);
    await expect(one).resolves.toStrictEqual(await two);
    expect(manager.getDocsForSubscription(id)).toStrictEqual([row('final')]);
    expect(db.getDocList).toHaveBeenCalledTimes(2);
  });
});

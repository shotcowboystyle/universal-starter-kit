/**
 * Cold-offline restore behavior: persisted snapshots must serve reads after a
 * reload with no network (cache-first subscribe with re-adoption), restored
 * subscriptions must not accumulate across reloads (adoption + TTL GC), and
 * queued mutations must replay on app focus.
 *
 * These specs simulate "reloads" by creating successive SyncModule instances
 * that share one in-memory KVStorage (standing in for IndexedDB/MMKV).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackfillScope, Operation } from './types';
import type { KVStorage, SubscriptionQuery, SyncOptions } from './types';

import { SyncModule } from './index';

/** In-memory KVStorage that survives across simulated reloads. */
class MemoryKV implements KVStorage {
  store = new Map<string, string>();
  async getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  async removeItem(key: string) {
    this.store.delete(key);
  }
}

const PERSIST_KEY = 'offline-restore-test';

const seedDocs = [
  { name: 't1', doctype: 'ToDo', modified: '2024-01-01T10:00:00', description: 'one' },
  { name: 't2', doctype: 'ToDo', modified: '2024-01-01T11:00:00', description: 'two' },
];

// Keep the literal shape/key-order identical everywhere: query-key matching
// (re-adoption) relies on stable JSON serialization of the query object.
const todoQuery: SubscriptionQuery = { doctype: 'ToDo', fields: ['description'] };

type SeedDoc = (typeof seedDocs)[number];

interface CdcPage {
  rows: SeedDoc[];
  checkpoint: string;
  deleted?: { name: string }[];
  has_more?: boolean;
}

const createMockDb = (): any => ({
  getDoc: vi.fn<() => Promise<SeedDoc>>().mockResolvedValue(seedDocs[0]),
  getDocList: vi.fn<() => Promise<SeedDoc[]>>().mockResolvedValue(seedDocs),
  createDoc: vi.fn<() => Promise<SeedDoc>>().mockResolvedValue(seedDocs[0]),
  updateDoc: vi.fn<() => Promise<SeedDoc>>().mockResolvedValue(seedDocs[0]),
  deleteDoc: vi.fn<() => Promise<Record<string, never>>>().mockResolvedValue({}),
  backfill: vi.fn<() => Promise<CdcPage>>().mockResolvedValue({ rows: [], checkpoint: '2024-01-02T00:00:00' }),
});

const snapshotFromStorage = (kv: MemoryKV) => {
  const raw = kv.store.get(PERSIST_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
};

/** Flushes the 50ms debounced persistence save. */
const flushSave = async () => {
  await vi.advanceTimersByTimeAsync(60);
};

describe('offline restore (persistKey)', () => {
  let modules: SyncModule[];

  beforeEach(() => {
    vi.useFakeTimers();
    modules = [];
    localStorage.clear();
  });

  afterEach(async () => {
    await Promise.all(
      modules.map(async (sync) => {
        await sync.dispose();
      }),
    );
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createSync = (db: any, options: SyncOptions = {}) => {
    const sync = new SyncModule(db, undefined, options);
    modules.push(sync);
    return sync;
  };

  /** Session 1: subscribe online and persist a snapshot into `kv`. */
  const seedSnapshot = async (kv: MemoryKV) => {
    const db = createMockDb();
    const sync = createSync(db, { persistKey: PERSIST_KEY, storage: kv });
    const result = await sync.subscribe(todoQuery);
    await flushSave();
    await sync.dispose();
    return result;
  };

  describe('cold-offline reads (cache-first subscribe)', () => {
    it('serves restored cache when the reload is offline, keeps checkpoint, and marks the sub stale', async () => {
      const kv = new MemoryKV();
      const first = await seedSnapshot(kv);
      expect(snapshotFromStorage(kv).subs).toHaveLength(1);

      // Cold reload with no network: every fetch fails
      const offlineDb = createMockDb();
      offlineDb.getDocList.mockRejectedValue(new Error('network down'));
      const sync = createSync(offlineDb, { persistKey: PERSIST_KEY, storage: kv });

      const result = await sync.subscribe(todoQuery);

      // The restored subscription was adopted, not replaced
      expect(result.subscriptionId).toBe(first.subscriptionId);
      expect(result.checkpoint).toBe(first.checkpoint);
      // Cached rows render immediately
      expect(result.rows.map((row) => row.name)).toStrictEqual(['t1', 't2']);
      expect((result.rows[0] as any).description).toBe('one');

      // The background refresh fails without rejecting and flags staleness
      const refresh = await result.refresh!;
      expect(refresh.ok).toBe(false);
      // The cached membership keeps serving after the failed refresh
      expect(sync.getDocsForSubscription(result.subscriptionId).map((row) => row.name)).toStrictEqual(['t1', 't2']);
      const sub = sync.getSubscription(result.subscriptionId);
      expect(sub?.stale).toBe(true);
      // Restored CDC checkpoint is preserved for the next backfill drain
      expect(sub?.checkpoint).toBe(first.checkpoint);
    });

    it('catches up from the restored checkpoint on the next backfill trigger and clears stale', async () => {
      const kv = new MemoryKV();
      const first = await seedSnapshot(kv);

      const offlineDb = createMockDb();
      offlineDb.getDocList.mockRejectedValue(new Error('network down'));
      const sync = createSync(offlineDb, { persistKey: PERSIST_KEY, storage: kv });
      const result = await sync.subscribe(todoQuery);
      await result.refresh!;
      expect(sync.getSubscription(result.subscriptionId)?.stale).toBe(true);

      // Network returns: the CDC drain resumes from the restored checkpoint
      offlineDb.backfill.mockResolvedValue({
        rows: [{ name: 't3', doctype: 'ToDo', modified: '2024-01-01T12:00:00', description: 'three' }],
        deleted: [],
        checkpoint: '2024-01-01T12:00:00|t3',
        has_more: false,
      });
      await sync.backfill({ scope: BackfillScope.All });

      expect(offlineDb.backfill).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'ToDo', modifiedAfter: first.checkpoint }),
      );
      const sub = sync.getSubscription(result.subscriptionId);
      expect(sub?.stale).toBe(false);
      expect(sub?.checkpoint).toBe('2024-01-01T12:00:00|t3');
    });

    it('refreshes an adopted subscription from the network when the reload is online', async () => {
      const kv = new MemoryKV();
      const first = await seedSnapshot(kv);

      const freshDocs = [
        { name: 't2', doctype: 'ToDo', modified: '2024-01-01T11:00:00', description: 'two' },
        { name: 't9', doctype: 'ToDo', modified: '2024-01-03T09:00:00', description: 'nine' },
      ];
      const onlineDb = createMockDb();
      onlineDb.getDocList.mockResolvedValue(freshDocs);
      const sync = createSync(onlineDb, { persistKey: PERSIST_KEY, storage: kv });

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);
      const result = await sync.subscribe(todoQuery);

      // Immediate render still comes from the cache (stale-while-revalidate)
      expect(result.subscriptionId).toBe(first.subscriptionId);
      expect(result.rows.map((row) => row.name)).toStrictEqual(['t1', 't2']);

      listener.mockClear();
      const refresh = await result.refresh!;
      expect(refresh.ok).toBe(true);
      // Store listeners were notified so collections re-read the fresh rows
      expect(listener).toHaveBeenCalledWith();

      const sub = sync.getSubscription(result.subscriptionId);
      expect(sub?.stale).toBe(false);
      // Membership replaced by the authoritative fetch, checkpoint recomputed
      expect(sync.getDocsForSubscription(result.subscriptionId).map((row) => row.name)).toStrictEqual(['t2', 't9']);
      expect(sub?.checkpoint).toBe('2024-01-03T09:00:00');
    });

    it('still rejects for queries with no restored subscription (honest error surfacing)', async () => {
      const kv = new MemoryKV();
      await seedSnapshot(kv);

      const offlineDb = createMockDb();
      offlineDb.getDocList.mockRejectedValue(new Error('network down'));
      const sync = createSync(offlineDb, { persistKey: PERSIST_KEY, storage: kv });

      await expect(sync.subscribe({ doctype: 'Note' })).rejects.toThrow('network down');
    });

    it('adopts even when subscribe() is called before the async snapshot load finishes', async () => {
      const kv = new MemoryKV();
      const first = await seedSnapshot(kv);
      const raw = kv.store.get(PERSIST_KEY)!;

      // Storage with a slow (100ms) read, like a busy IndexedDB
      const slowKv: KVStorage = {
        getItem: async () => {
          const { promise, resolve } = Promise.withResolvers<string>();
          setTimeout(() => {
            resolve(raw);
          }, 100);
          return await promise;
        },
        setItem: async () => {},
        removeItem: async () => {},
      };
      const offlineDb = createMockDb();
      offlineDb.getDocList.mockRejectedValue(new Error('network down'));
      const sync = createSync(offlineDb, { persistKey: PERSIST_KEY, storage: slowKv });

      const pending = sync.subscribe(todoQuery);
      await vi.advanceTimersByTimeAsync(150);
      const result = await pending;

      expect(result.subscriptionId).toBe(first.subscriptionId);
      expect(result.rows.map((row) => row.name)).toStrictEqual(['t1', 't2']);
    });
  });

  describe('re-adoption and GC (no orphan growth)', () => {
    it('keeps exactly one subscription per query across repeated reload cycles', async () => {
      const kv = new MemoryKV();
      const subscriptionIds: string[] = [];

      /** One app session: subscribe, settle the refresh, persist, dispose. */
      const runCycle = async () => {
        const db = createMockDb();
        const sync = createSync(db, { persistKey: PERSIST_KEY, storage: kv });
        const result = await sync.subscribe(todoQuery);
        subscriptionIds.push(result.subscriptionId);
        if (result.refresh) {
          await result.refresh;
        }
        await flushSave();

        // One subscription in memory, one in the snapshot — every cycle
        expect(sync.__debug().subscriptions).toHaveLength(1);
        expect(snapshotFromStorage(kv).subs).toHaveLength(1);

        await sync.dispose();
      };

      for (let cycle = 0; cycle < 3; cycle += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each reload cycle must start after the previous one persisted
        await runCycle();
      }
      // Every cycle re-adopted the same subscription
      expect(subscriptionIds).toHaveLength(3);
      expect(new Set(subscriptionIds).size).toBe(1);
    });

    it('collapses duplicate snapshot entries from pre-fix versions (last wins)', async () => {
      const kv = new MemoryKV();
      // Simulate a legacy snapshot polluted by orphan accumulation
      kv.store.set(
        PERSIST_KEY,
        JSON.stringify({
          subs: [
            { id: 'legacy-1', query: todoQuery, checkpoint: '2024-01-01T08:00:00', docIds: ['t1'] },
            { id: 'legacy-2', query: todoQuery, checkpoint: '2024-01-01T09:00:00', docIds: ['t1'] },
            {
              id: 'legacy-3',
              query: todoQuery,
              checkpoint: '2024-01-01T10:00:00',
              docIds: ['t1', 't2'],
            },
          ],
          cache: {
            ToDo: {
              byId: { t1: seedDocs[0], t2: seedDocs[1] },
              allIds: ['t1', 't2'],
            },
          },
          journal: [],
          temp: [],
        }),
      );

      const offlineDb = createMockDb();
      offlineDb.getDocList.mockRejectedValue(new Error('network down'));
      const sync = createSync(offlineDb, { persistKey: PERSIST_KEY, storage: kv });

      const result = await sync.subscribe(todoQuery);
      // Last snapshot entry (most recent session) won the dedupe
      expect(result.subscriptionId).toBe('legacy-3');
      expect(result.checkpoint).toBe('2024-01-01T10:00:00');
      expect(sync.__debug().subscriptions).toHaveLength(1);

      await flushSave();
      expect(snapshotFromStorage(kv).subs).toHaveLength(1);
    });

    it('keeps unadopted restored subscriptions within the TTL and GCs them after it', async () => {
      const kv = new MemoryKV();
      await seedSnapshot(kv);

      const db = createMockDb();
      const sync = createSync(db, {
        persistKey: PERSIST_KEY,
        storage: kv,
        restoredSubscriptionTTL: 1000,
      });
      // Subscribe a DIFFERENT query; the restored subscription stays unadopted
      await sync.subscribe({ doctype: 'Note' });
      await flushSave();

      // Within the TTL the restored sub is retained (and persisted) so a
      // later offline navigation can still adopt it
      let snapshot = snapshotFromStorage(kv);
      expect(snapshot.subs).toHaveLength(2);
      expect(sync.__debug().subscriptions.filter((sub) => sub.restored)).toHaveLength(1);

      // After the TTL, the next snapshot write GCs it
      await vi.advanceTimersByTimeAsync(1100);
      await sync.subscribe({ doctype: 'Comment' });
      await flushSave();

      snapshot = snapshotFromStorage(kv);
      // Note + Comment
      expect(snapshot.subs).toHaveLength(2);
      expect(snapshot.subs.map((sub: any) => sub.query.doctype).toSorted()).toStrictEqual(['Comment', 'Note']);
      expect(sync.__debug().subscriptions.filter((sub) => sub.restored)).toHaveLength(0);
    });

    it('excludes unadopted restored subscriptions from backfill fan-out', async () => {
      const kv = new MemoryKV();
      await seedSnapshot(kv);

      const db = createMockDb();
      const sync = createSync(db, { persistKey: PERSIST_KEY, storage: kv });
      await sync.subscribe({ doctype: 'Note' });

      db.backfill.mockClear();
      await sync.backfill({ scope: BackfillScope.All });

      // Only the live Note subscription drained; the restored subscription did not
      expect(db.backfill).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ doctype: 'Note' }));
    });
  });

  describe('detach on unsubscribe (persistKey only)', () => {
    it('retains a released subscription for cache-first re-adoption', async () => {
      const kv = new MemoryKV();
      const db = createMockDb();
      const sync = createSync(db, { persistKey: PERSIST_KEY, storage: kv });

      const first = await sync.subscribe(todoQuery);
      sync.unsubscribe(first.subscriptionId);

      // Still in memory as a dormant restored subscription
      const debugSubs = sync.__debug().subscriptions;
      expect(debugSubs).toHaveLength(1);
      expect(debugSubs[0].restored).toBe(true);

      // Excluded from backfill while detached
      db.backfill.mockClear();
      await sync.backfill({ scope: BackfillScope.All });
      expect(db.backfill).not.toHaveBeenCalled();

      // Remount re-adopts: same id, cached rows immediately
      db.getDocList.mockClear();
      const second = await sync.subscribe(todoQuery);
      expect(second.subscriptionId).toBe(first.subscriptionId);
      expect(second.rows.map((row) => row.name)).toStrictEqual(['t1', 't2']);
      expect(second.refresh).toBeDefined();
      await second.refresh!;
      expect(db.getDocList).toHaveBeenCalledOnce();
      expect(sync.__debug().subscriptions[0].restored).toBe(false);
    });

    it('without persistKey, unsubscribe deletes the subscription (unchanged behavior)', async () => {
      const db = createMockDb();
      const sync = createSync(db, {});

      const result = await sync.subscribe(todoQuery);
      expect(result.refresh).toBeUndefined();
      sync.unsubscribe(result.subscriptionId);

      expect(sync.__debug().subscriptions).toHaveLength(0);
      expect(sync.getSubscription(result.subscriptionId)).toBeUndefined();
    });
  });

  describe('journal replay on app focus', () => {
    it('replays queued mutations when the app regains focus', async () => {
      const db = createMockDb();
      const sync = createSync(db, {});
      await sync.subscribe(todoQuery);

      // Mutation fails (server unreachable) and stays queued in the journal
      db.updateDoc.mockRejectedValueOnce(new Error('fetch failed'));
      await expect(
        sync.mutate({
          mutationId: 'm-focus-1',
          operation: Operation.Update,
          doc: { doctype: 'ToDo', name: 't1', description: 'edited' } as any,
        }),
      ).rejects.toThrow('fetch failed');
      expect(db.updateDoc).toHaveBeenCalledOnce();

      // Foreground transition (web focus / RN AppState active) triggers replay
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(500);

      expect(db.updateDoc).toHaveBeenCalledTimes(2);
      expect(db.updateDoc.mock.calls[1][0]).toStrictEqual(
        expect.objectContaining({ doctype: 'ToDo', name: 't1', client_mutation_id: 'm-focus-1' }),
      );
    });

    it('does not start a replay cycle on focus when the journal is empty', async () => {
      const db = createMockDb();
      const onReplayStart = vi.fn<() => void>();
      const sync = createSync(db, { onReplayStart });
      await sync.subscribe(todoQuery);

      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(500);

      expect(onReplayStart).not.toHaveBeenCalled();
    });
  });
});

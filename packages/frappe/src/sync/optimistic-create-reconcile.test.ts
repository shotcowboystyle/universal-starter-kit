/**
 * Optimistic create → server row identity reconciliation.
 *
 * Regression suite for the "optimistic insert row lingers beside the realtime
 * server row" bug (p-results/fix-backoffice-resilience.md gap 3 known limit):
 * the live wire wraps whitelisted method returns as `{message: {...doc}}`, so
 * `createDoc().name` was undefined and the temporary→real remap never ran —
 * the temp row stayed in membership forever, the realtime row was inserted
 * alongside (2 UI rows / 1 server doc), the temp row's mutations 404'd, and
 * with realtime unhealthy the post-create refetch of the temp name 404'd and
 * rolled back a server-confirmed create (the insert-side sibling of the
 * delete-refetch rollback bug).
 *
 * These specs run the REAL engine stack — SubscriptionManager,
 * NormalizedCache, MutationJournal, RehydrationManager, RealtimeHandler,
 * MutationEngine — over a scripted DbModule, so the ack/realtime race is
 * exercised end-to-end in both orders (subscription-manager.test.ts pattern:
 * real internals, mocked db).
 */
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';
import type { Handler, RealtimeModule } from '../realtime';

import { MutationEngine } from './mutation-engine';
import { MutationJournal } from './mutation-journal';
import { NormalizedCache } from './normalized-cache';
import { RealtimeHandler } from './realtime';
import { RehydrationManager } from './rehydration';
import { SubscriptionManager } from './subscription-manager';
import { Operation } from './types';
import type { CreateMutation } from './types';

type Doc = FrappeDoc<FrappeDocData>;
/** A realtime handler as the engine registers it; awaited so async handlers settle. */
type ListHandler = (payload: Parameters<Handler>[0]) => Promise<void> | void;
type GetDoc = (doctype: string, name: string) => Promise<Doc>;
type GetDocList = (doctype: string) => Promise<Doc[]>;
type CreateDoc = (doc: Partial<Doc>) => Promise<Doc>;
type Backfill = () => Promise<{ rows: Doc[]; checkpoint?: string }>;

interface Harness {
  engine: MutationEngine;
  subscriptionManager: SubscriptionManager;
  cache: NormalizedCache;
  journal: MutationJournal;
  db: {
    getDoc: Mock<GetDoc>;
    getDocList: Mock<GetDocList>;
    createDoc: Mock<CreateDoc>;
    updateDoc: Mock<() => Promise<void>>;
    deleteDoc: Mock<() => Promise<void>>;
    backfill: Mock<Backfill>;
  };
  /** Server-side rows the mocked db serves (list + getDoc). */
  serverRows: Doc[];
  /** Fires a realtime list_update the way the socket would. */
  emitListUpdate: (name: string) => Promise<void>;
  realtimeHealthy: { value: boolean };
  dispose: () => void;
}

const createHarness = (): Harness => {
  const serverRows: Doc[] = [];
  const realtimeHealthy = { value: true };

  const db = {
    getDoc: vi.fn<GetDoc>(async (doctype, name) => {
      const row = serverRows.find((doc) => doc.doctype === doctype && doc.name === name);
      if (!row) {
        const error = new Error(`${doctype}/${name} not found`) as Error & { status: number };
        error.status = 404;
        throw error;
      }
      return { ...row };
    }),
    getDocList: vi.fn<GetDocList>(async (doctype) =>
      serverRows.filter((doc) => doc.doctype === doctype).map((doc) => ({ ...doc })),
    ),
    createDoc: vi.fn<CreateDoc>(),
    updateDoc: vi.fn<() => Promise<void>>(),
    deleteDoc: vi.fn<() => Promise<void>>(),
    backfill: vi.fn<Backfill>(async () => ({ rows: [] })),
  };

  const realtimeHandlers = new Map<string, ListHandler>();
  const realtime = {
    isHealthy: () => realtimeHealthy.value,
    on: (event: string, handler: ListHandler) => {
      realtimeHandlers.set(event, handler);
    },
    subscribeList: vi.fn<RealtimeModule['subscribeList']>(),
    unsubscribeList: vi.fn<RealtimeModule['unsubscribeList']>(),
    disconnect: vi.fn<RealtimeModule['disconnect']>(),
  } as unknown as RealtimeModule;

  const cache = new NormalizedCache({});
  const journal = new MutationJournal({ enableAutoCleanup: false });
  const subscriptionManager = new SubscriptionManager(db as unknown as DbModule, cache, {});
  const rehydrationManager = new RehydrationManager(db as unknown as DbModule, cache, subscriptionManager, journal);
  const engine = new MutationEngine(
    db as unknown as DbModule,
    realtime,
    cache,
    journal,
    subscriptionManager,
    rehydrationManager,
    {},
  );
  const realtimeHandler = new RealtimeHandler(
    db as unknown as DbModule,
    realtime,
    cache,
    subscriptionManager,
    rehydrationManager,
    {},
  );

  return {
    engine,
    subscriptionManager,
    cache,
    journal,
    db,
    serverRows,
    emitListUpdate: async (name: string) => {
      await realtimeHandlers.get('list_update')?.({ doctype: 'TestDoc', name });
    },
    realtimeHealthy,
    dispose: () => {
      engine.dispose();
      realtimeHandler.dispose();
      rehydrationManager.clear();
      journal.dispose();
    },
  };
};

const serverDoc = (name: string): Doc => ({
  doctype: 'TestDoc',
  name,
  title: 'Created',
  modified: '2024-01-01T10:00:00',
});

const createMutation = (doc: Partial<Doc>, mutationId = 'create-1'): CreateMutation<FrappeDocData> => ({
  mutationId,
  operation: Operation.Create,
  doc: { doctype: 'TestDoc', ...doc } as Doc,
  affected: [],
});

describe('optimistic create reconciliation (engine-level)', () => {
  let harness: Harness;
  let subscriptionId: string;

  const rowNames = () => harness.subscriptionManager.getDocsForSubscription(subscriptionId).map((doc) => doc.name);
  const docIds = () => [...(harness.subscriptionManager.getSubscription(subscriptionId)?.docIds ?? [])];

  beforeEach(async () => {
    vi.useFakeTimers();
    harness = createHarness();
    const result = await harness.subscriptionManager.subscribe({
      doctype: 'TestDoc',
      fields: ['name', 'title', 'modified'],
    });
    ({ subscriptionId } = result);
  });

  afterEach(() => {
    harness.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('server ack reconciles the optimistic row to a single server-named row', async () => {
    harness.db.createDoc.mockImplementation(async () => {
      harness.serverRows.push(serverDoc('real-1'));
      return serverDoc('real-1');
    });

    const mutation = createMutation({ name: 'new-todo-placeholder' });
    const mutatePromise = harness.engine.mutate(mutation);

    // Optimistic state: the placeholder row is live immediately.
    expect(docIds()).toStrictEqual(['new-todo-placeholder']);
    expect(rowNames()).toStrictEqual(['new-todo-placeholder']);

    await mutatePromise;

    // Ack reconciled identity: exactly one row, under the server name, and
    // the row resolves from the cache (the ack payload seeded it — no wait
    // for the realtime echo).
    expect(docIds()).toStrictEqual(['real-1']);
    expect(rowNames()).toStrictEqual(['real-1']);
    expect(harness.cache.get({ doctype: 'TestDoc', name: 'new-todo-placeholder' })).toBeUndefined();
    expect(harness.engine.getTemporaryIdToRealNameMap().get('new-todo-placeholder')).toBe('real-1');

    // The idempotency machinery rides the first attempt.
    expect(harness.db.createDoc).toHaveBeenCalledWith(expect.objectContaining({ client_mutation_id: 'create-1' }));
  });

  it('reconciles when the realtime insert arrives BEFORE the REST ack', async () => {
    const ack = Promise.withResolvers<Doc>();
    harness.db.createDoc.mockImplementation(async () => {
      // Server commits immediately (realtime will observe the row); only the
      // HTTP response is still in flight.
      harness.serverRows.push(serverDoc('real-2'));
      return await ack.promise;
    });

    const mutation = createMutation({ name: 'new-todo-racer' });
    const mutatePromise = harness.engine.mutate(mutation);
    await vi.advanceTimersByTimeAsync(0);
    expect(docIds()).toStrictEqual(['new-todo-racer']);

    // Realtime beats the ack: the doctype-room event lands and the page
    // refresh it schedules runs while the create is still pending.
    await harness.emitListUpdate('real-2');
    await vi.advanceTimersByTimeAsync(600);

    // Pre-ack the engine honestly shows both: the unmatched server row and
    // the still-pending optimistic row (they cannot be correlated until the
    // ack names the create).
    expect(docIds().toSorted()).toStrictEqual(['new-todo-racer', 'real-2']);

    ack.resolve(serverDoc('real-2'));
    await mutatePromise;

    // Ack lands: the temp row is dropped rather than remapped onto the
    // already-present server row — exactly one row, no duplicates.
    expect(docIds()).toStrictEqual(['real-2']);
    expect(rowNames()).toStrictEqual(['real-2']);
    expect(harness.cache.get({ doctype: 'TestDoc', name: 'new-todo-racer' })).toBeUndefined();

    // Late rehydrations stay idempotent.
    await vi.advanceTimersByTimeAsync(1000);
    expect(docIds()).toStrictEqual(['real-2']);
  });

  it('reconciles when the REST ack lands BEFORE the realtime insert', async () => {
    harness.db.createDoc.mockImplementation(async () => {
      harness.serverRows.push(serverDoc('real-3'));
      return serverDoc('real-3');
    });

    await harness.engine.mutate(createMutation({ name: 'new-todo-early-ack' }));
    expect(docIds()).toStrictEqual(['real-3']);

    // The realtime echo for the same doc arrives afterwards — membership
    // already contains the server name, so nothing duplicates.
    await harness.emitListUpdate('real-3');
    await vi.advanceTimersByTimeAsync(1000);

    expect(docIds()).toStrictEqual(['real-3']);
    expect(rowNames()).toStrictEqual(['real-3']);
  });

  it('acks a create with an engine-generated temp name without sending the temp name', async () => {
    harness.db.createDoc.mockImplementation(async () => {
      harness.serverRows.push(serverDoc('real-4'));
      return serverDoc('real-4');
    });

    const mutation = createMutation({});
    const mutatePromise = harness.engine.mutate(mutation);
    const optimisticIds = docIds();
    expect(optimisticIds).toHaveLength(1);
    expect(optimisticIds[0]).toMatch(/^tmp_/u);

    await mutatePromise;

    // The generated temp id was never sent to the server…
    expect(harness.db.createDoc.mock.calls[0][0].name).toBeUndefined();
    // …and the ack still reconciled it away.
    expect(docIds()).toStrictEqual(['real-4']);
    expect(harness.cache.get({ doctype: 'TestDoc', name: optimisticIds[0] })).toBeUndefined();
  });

  it('does not roll back a server-confirmed create when realtime is unhealthy', async () => {
    // The insert-side sibling of the delete-refetch rollback bug: with the
    // socket down, the post-mutation refetch used to target the PRE-remap
    // temporary name → guaranteed 404 → journal.fail + rollback of a create
    // the server had already committed.
    harness.realtimeHealthy.value = false;
    harness.db.createDoc.mockImplementation(async () => {
      harness.serverRows.push(serverDoc('real-5'));
      return serverDoc('real-5');
    });

    await expect(harness.engine.mutate(createMutation({ name: 'new-todo-offline-socket' }))).resolves.not.toThrow();

    expect(docIds()).toStrictEqual(['real-5']);
    expect(rowNames()).toStrictEqual(['real-5']);
    // The temp name was never refetched (it would 404).
    expect(harness.db.getDoc).not.toHaveBeenCalledWith('TestDoc', 'new-todo-offline-socket');
    // confirmed → removed
    expect(harness.journal.get('create-1')).toBeUndefined();
  });

  it('confirms (not rolls back) a create whose ack carries no document name', async () => {
    // Custom endpoints (and the pre-fix live envelope) can yield an ack
    // without a usable name. The engine then cannot remap — but it must NOT
    // refetch the temporary name (guaranteed 404) and roll back a create
    // the server just confirmed. The optimistic row stays until realtime /
    // backfill reconciles it.
    harness.realtimeHealthy.value = false;
    harness.db.createDoc.mockResolvedValue({} as Doc);

    await expect(harness.engine.mutate(createMutation({ name: 'new-todo-nameless-ack' }))).resolves.not.toThrow();

    expect(harness.db.getDoc).not.toHaveBeenCalled();
    // confirmed → removed
    expect(harness.journal.get('create-1')).toBeUndefined();
    expect(docIds()).toStrictEqual(['new-todo-nameless-ack']);
    expect(rowNames()).toStrictEqual(['new-todo-nameless-ack']);
  });

  it('rolls back a rejected create (temp row evicted from membership and cache)', async () => {
    harness.db.createDoc.mockRejectedValue(
      Object.assign(new Error('Validation failed'), {
        status: 417,
      }),
    );

    await expect(harness.engine.mutate(createMutation({ name: 'new-todo-rejected' }))).rejects.toThrow(
      'Validation failed',
    );

    expect(docIds()).toStrictEqual([]);
    expect(rowNames()).toStrictEqual([]);
    expect(harness.cache.get({ doctype: 'TestDoc', name: 'new-todo-rejected' })).toBeUndefined();
  });

  it('rolls back a rejected create even when the realtime row already landed', async () => {
    // Rejection while a foreign-looking server row is present (e.g. another
    // user's concurrent insert): only the optimistic temp row is rolled
    // back — the authoritative server row stays.
    harness.serverRows.push(serverDoc('real-other'));
    const ack = Promise.withResolvers<Doc>();
    harness.db.createDoc.mockImplementation(async () => await ack.promise);

    const mutatePromise = harness.engine.mutate(createMutation({ name: 'new-todo-doomed' }));
    // Observe the rejection now so it is never unhandled.
    let rejection: unknown;
    const settled = (async () => {
      try {
        await mutatePromise;
      } catch (error) {
        rejection = error;
      }
    })();
    await vi.advanceTimersByTimeAsync(0);
    await harness.emitListUpdate('real-other');
    await vi.advanceTimersByTimeAsync(600);
    expect(docIds().toSorted()).toStrictEqual(['new-todo-doomed', 'real-other']);

    ack.reject(Object.assign(new Error('Server said no'), { status: 417 }));
    await settled;
    expect(rejection).toBeInstanceOf(Error);

    expect(docIds()).toStrictEqual(['real-other']);
    expect(rowNames()).toStrictEqual(['real-other']);
    expect(harness.cache.get({ doctype: 'TestDoc', name: 'new-todo-doomed' })).toBeUndefined();
  });
});

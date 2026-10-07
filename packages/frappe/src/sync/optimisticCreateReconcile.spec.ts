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
 * exercised end-to-end in both orders (subscriptionManager.spec.ts pattern:
 * real internals, mocked db).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';
import type { RealtimeModule } from '../realtime';

import { MutationEngine } from './mutationEngine';
import { MutationJournal } from './mutationJournal';
import { NormalizedCache } from './normalizedCache';
import { RealtimeHandler } from './realtime';
import { RehydrationManager } from './rehydration';
import { SubscriptionManager } from './subscriptionManager';
import { Operation } from './types';
import type { CreateMutation } from './types';

type Doc = FrappeDoc<FrappeDocData>;

interface Harness {
  engine: MutationEngine;
  subscriptionManager: SubscriptionManager;
  cache: NormalizedCache;
  journal: MutationJournal;
  db: {
    getDoc: ReturnType<typeof vi.fn>;
    getDocList: ReturnType<typeof vi.fn>;
    createDoc: ReturnType<typeof vi.fn>;
    updateDoc: ReturnType<typeof vi.fn>;
    deleteDoc: ReturnType<typeof vi.fn>;
    backfill: ReturnType<typeof vi.fn>;
  };
  /** Server-side rows the mocked db serves (list + getDoc). */
  serverRows: Doc[];
  /** Fires a realtime list_update the way the socket would. */
  emitListUpdate: (name: string) => Promise<void>;
  realtimeHealthy: { value: boolean };
  dispose: () => void;
}

function createHarness(): Harness {
  const serverRows: Doc[] = [];
  const realtimeHealthy = { value: true };

  const db = {
    getDoc: vi.fn(async (doctype: string, name: string) => {
      const row = serverRows.find((doc) => doc.doctype === doctype && doc.name === name);
      if (!row) {
        const error = new Error(`${doctype}/${name} not found`) as Error & { status: number };
        error.status = 404;
        throw error;
      }
      return { ...row };
    }),
    getDocList: vi.fn(async (doctype: string) =>
      serverRows.filter((doc) => doc.doctype === doctype).map((doc) => ({ ...doc })),
    ),
    createDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    backfill: vi.fn(async () => ({ rows: [], checkpoint: undefined })),
  };

  const realtimeHandlers = new Map<string, (payload: unknown) => Promise<void> | void>();
  const realtime = {
    isHealthy: () => realtimeHealthy.value,
    on: (event: string, handler: (payload: unknown) => Promise<void> | void) => {
      realtimeHandlers.set(event, handler);
    },
    subscribeList: vi.fn(),
    unsubscribeList: vi.fn(),
    disconnect: vi.fn(),
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
}

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
    subscriptionId = result.subscriptionId;
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
    expect(docIds()).toEqual(['new-todo-placeholder']);
    expect(rowNames()).toEqual(['new-todo-placeholder']);

    await mutatePromise;

    // Ack reconciled identity: exactly one row, under the server name, and
    // the row resolves from the cache (the ack payload seeded it — no wait
    // for the realtime echo).
    expect(docIds()).toEqual(['real-1']);
    expect(rowNames()).toEqual(['real-1']);
    expect(harness.cache.get({ doctype: 'TestDoc', name: 'new-todo-placeholder' })).toBeUndefined();
    expect(harness.engine.getTemporaryIdToRealNameMap().get('new-todo-placeholder')).toBe('real-1');

    // The idempotency machinery rides the first attempt.
    expect(harness.db.createDoc).toHaveBeenCalledWith(expect.objectContaining({ client_mutation_id: 'create-1' }));
  });

  it('reconciles when the realtime insert arrives BEFORE the REST ack', async () => {
    let resolveAck: (doc: Doc) => void = () => {};
    harness.db.createDoc.mockImplementation(async () => {
      // Server commits immediately (realtime will observe the row); only the
      // HTTP response is still in flight.
      harness.serverRows.push(serverDoc('real-2'));
      return await new Promise<Doc>((resolve) => {
        resolveAck = resolve;
      });
    });

    const mutation = createMutation({ name: 'new-todo-racer' });
    const mutatePromise = harness.engine.mutate(mutation);
    await vi.advanceTimersByTimeAsync(0);
    expect(docIds()).toEqual(['new-todo-racer']);

    // Realtime beats the ack: the doctype-room event lands and the page
    // refresh it schedules runs while the create is still pending.
    await harness.emitListUpdate('real-2');
    await vi.advanceTimersByTimeAsync(600);

    // Pre-ack the engine honestly shows both: the unmatched server row and
    // the still-pending optimistic row (they cannot be correlated until the
    // ack names the create).
    expect([...docIds()].sort()).toEqual(['new-todo-racer', 'real-2']);

    resolveAck(serverDoc('real-2'));
    await mutatePromise;

    // Ack lands: the temp row is dropped rather than remapped onto the
    // already-present server row — exactly one row, no duplicates.
    expect(docIds()).toEqual(['real-2']);
    expect(rowNames()).toEqual(['real-2']);
    expect(harness.cache.get({ doctype: 'TestDoc', name: 'new-todo-racer' })).toBeUndefined();

    // Late rehydrations stay idempotent.
    await vi.advanceTimersByTimeAsync(1000);
    expect(docIds()).toEqual(['real-2']);
  });

  it('reconciles when the REST ack lands BEFORE the realtime insert', async () => {
    harness.db.createDoc.mockImplementation(async () => {
      harness.serverRows.push(serverDoc('real-3'));
      return serverDoc('real-3');
    });

    await harness.engine.mutate(createMutation({ name: 'new-todo-early-ack' }));
    expect(docIds()).toEqual(['real-3']);

    // The realtime echo for the same doc arrives afterwards — membership
    // already contains the server name, so nothing duplicates.
    await harness.emitListUpdate('real-3');
    await vi.advanceTimersByTimeAsync(1000);

    expect(docIds()).toEqual(['real-3']);
    expect(rowNames()).toEqual(['real-3']);
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
    expect(optimisticIds[0]).toMatch(/^tmp_/);

    await mutatePromise;

    // The generated temp id was never sent to the server…
    expect(harness.db.createDoc.mock.calls[0][0].name).toBeUndefined();
    // …and the ack still reconciled it away.
    expect(docIds()).toEqual(['real-4']);
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

    expect(docIds()).toEqual(['real-5']);
    expect(rowNames()).toEqual(['real-5']);
    // The temp name was never refetched (it would 404).
    expect(harness.db.getDoc).not.toHaveBeenCalledWith('TestDoc', 'new-todo-offline-socket');
    expect(harness.journal.get('create-1')).toBeUndefined(); // confirmed → removed
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
    expect(harness.journal.get('create-1')).toBeUndefined(); // confirmed → removed
    expect(docIds()).toEqual(['new-todo-nameless-ack']);
    expect(rowNames()).toEqual(['new-todo-nameless-ack']);
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

    expect(docIds()).toEqual([]);
    expect(rowNames()).toEqual([]);
    expect(harness.cache.get({ doctype: 'TestDoc', name: 'new-todo-rejected' })).toBeUndefined();
  });

  it('rolls back a rejected create even when the realtime row already landed', async () => {
    // Rejection while a foreign-looking server row is present (e.g. another
    // user's concurrent insert): only the optimistic temp row is rolled
    // back — the authoritative server row stays.
    harness.serverRows.push(serverDoc('real-other'));
    let rejectAck: (err: unknown) => void = () => {};
    harness.db.createDoc.mockImplementation(
      async () =>
        await new Promise((_resolve, reject) => {
          rejectAck = reject;
        }),
    );

    const mutatePromise = harness.engine.mutate(createMutation({ name: 'new-todo-doomed' }));
    const settled = mutatePromise.catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    await harness.emitListUpdate('real-other');
    await vi.advanceTimersByTimeAsync(600);
    expect([...docIds()].sort()).toEqual(['new-todo-doomed', 'real-other']);

    rejectAck(Object.assign(new Error('Server said no'), { status: 417 }));
    await expect(settled).resolves.toBeInstanceOf(Error);

    expect(docIds()).toEqual(['real-other']);
    expect(rowNames()).toEqual(['real-other']);
    expect(harness.cache.get({ doctype: 'TestDoc', name: 'new-todo-doomed' })).toBeUndefined();
  });
});

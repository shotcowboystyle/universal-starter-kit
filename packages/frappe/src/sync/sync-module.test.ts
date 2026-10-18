import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';

import { frappeSyncSequence } from './mutation-journal';
import { Operation } from './types';
import type { SubscriptionQuery, SyncOptions } from './types';

import { SyncModule } from './index';

vi.mock(import('@repo/platform'), () => ({
  isNative: false,
  onAppFocus: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  onOnline: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  onVisibilityChange: vi.fn<() => () => void>(() => vi.fn<() => void>()),
}));

type ServerDoc = FrappeDoc<FrappeDocData>;

/** Wire payload for captured realtime handlers. */
interface DocPayload {
  doctype: string;
  name: string;
}

/** Flushes chained microtasks without advancing fake timers. */
const flushMicrotasks = async (rounds = 10) => {
  for (let i = 0; i < rounds; i += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each round drains one microtask hop
    await Promise.resolve();
  }
};

describe(SyncModule, () => {
  let sync: SyncModule;
  let mockDb: any;
  let mockRealtime: any;

  const mockDocs = [
    { name: 'doc1', doctype: 'TestDoc', modified: '2024-01-01T09:00:00', title: 'Doc 1' },
    { name: 'doc2', doctype: 'TestDoc', modified: '2024-01-01T10:00:00', title: 'Doc 2' },
  ];

  let uuidCount = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    uuidCount = 0;

    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: vi.fn<() => string>(() => {
          uuidCount += 1;
          return `uuid-${uuidCount}`;
        }),
      },
      writable: true,
    });

    mockDb = {
      getDoc: vi.fn<() => Promise<ServerDoc>>().mockResolvedValue(mockDocs[0]),
      getDocList: vi.fn<() => Promise<ServerDoc[]>>().mockResolvedValue(mockDocs),
      createDoc: vi.fn<() => Promise<ServerDoc>>().mockResolvedValue(mockDocs[0]),
      updateDoc: vi.fn<() => Promise<ServerDoc>>().mockResolvedValue(mockDocs[0]),
      deleteDoc: vi.fn<() => Promise<object>>().mockResolvedValue({}),
      backfill: vi
        .fn<() => Promise<{ rows: ServerDoc[]; checkpoint: string }>>()
        .mockResolvedValue({ rows: [], checkpoint: '2024-01-01T12:00:00' }),
      call: { post: vi.fn<() => Promise<object>>().mockResolvedValue({}) },
    };

    mockRealtime = {
      on: vi.fn<() => Promise<void>>(),
      off: vi.fn<() => void>(),
      emit: vi.fn<() => void>(),
      isHealthy: vi.fn<() => boolean>(() => false),
      connect: vi.fn<() => void>(),
      disconnect: vi.fn<() => void>(),
      subscribeList: vi.fn<() => Promise<void>>().mockResolvedValue(),
      unsubscribeList: vi.fn<() => void>(),
    };
  });

  afterEach(async () => {
    await sync?.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const createSync = (options: SyncOptions = {}) => new SyncModule(mockDb, mockRealtime, options);

  describe('createdName (MPO-333)', () => {
    it('names the document the server created under a temporary name', async () => {
      mockDb.createDoc.mockResolvedValue({
        name: 'a1b2c3',
        doctype: 'TestDoc',
        modified: '2024-01-01T11:00:00',
        title: 'hash named',
      });
      sync = createSync();
      expect(sync.createdName('new-1')).toBeUndefined();
      await sync.mutate({
        mutationId: 'create-hash',
        operation: Operation.Create,
        doc: { name: 'new-1', doctype: 'TestDoc', title: 'hash named' },
      });
      expect(sync.createdName('new-1')).toBe('a1b2c3');
      expect(sync.createdName('new-2')).toBeUndefined();
    });
  });

  describe('automatic journal storage', () => {
    it("reads HTTP rows during SSR with Node's incomplete localStorage object", async () => {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- stubGlobal requires the value; undefined simulates SSR
      vi.stubGlobal('window', undefined);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- stubGlobal requires the value; undefined simulates SSR
      vi.stubGlobal('document', undefined);
      vi.stubGlobal('localStorage', {});

      sync = createSync();
      const { subscriptionId } = await sync.subscribe({ doctype: 'TestDoc' });

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', expect.anything());
      expect(sync.getDocsForSubscription(subscriptionId)).toHaveLength(2);
    });

    it.each([undefined, {}, { getItem: () => null }])(
      'initializes when browser storage is missing or incomplete: %j',
      async (storage) => {
        vi.stubGlobal('localStorage', storage);
        sync = createSync();
        await sync.mutate({
          mutationId: 'memory-only',
          operation: Operation.Create,
          doc: { name: 'new-row', doctype: 'TestDoc', title: 'new row' },
        });
        expect(mockDb.createDoc).toHaveBeenCalledWith(expect.objectContaining({ name: 'new-row', doctype: 'TestDoc' }));
      },
    );

    it('initializes when the browser storage getter throws SecurityError', () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });

      sync = createSync();
      expect(sync).toBeInstanceOf(SyncModule);
    });

    it('does not read process-wide storage during SSR even if it is usable', () => {
      const getItem = vi.fn<() => string>(() => '99');
      // oxlint-disable-next-line unicorn/no-useless-undefined -- stubGlobal requires the value; undefined simulates SSR
      vi.stubGlobal('window', undefined);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- stubGlobal requires the value; undefined simulates SSR
      vi.stubGlobal('document', undefined);
      vi.stubGlobal('localStorage', { getItem, setItem: vi.fn<() => void>() });

      sync = createSync();

      expect(getItem).not.toHaveBeenCalled();
    });

    it('preserves sequence numbers across instances with usable browser storage', async () => {
      const values = new Map<string, string>([[frappeSyncSequence, '40']]);
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      });
      const mutation = {
        operation: Operation.Create as const,
        doc: { name: 'new-row', doctype: 'TestDoc', title: 'new row' },
      };
      sync = createSync();
      await sync.mutate({ ...mutation, mutationId: 'stored-41' });
      expect(values.get(frappeSyncSequence)).toBe('41');
      await sync.dispose();

      sync = createSync();
      await sync.mutate({ ...mutation, mutationId: 'stored-42' });
      expect(values.get(frappeSyncSequence)).toBe('42');
    });
  });

  describe('subscribeStore and emit', () => {
    it('subscribeStore adds listener and subscribe triggers emit which calls listener', async () => {
      sync = createSync();
      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      const query: SubscriptionQuery = { doctype: 'TestDoc', fields: ['title'] };
      await sync.subscribe(query);

      expect(listener).toHaveBeenCalledWith();
    });

    it('unsubscribe function removes listener', async () => {
      sync = createSync();
      const listener = vi.fn<() => void>();
      const unsub = sync.subscribeStore(listener);

      unsub();

      const query: SubscriptionQuery = { doctype: 'TestDoc', fields: ['title'] };
      await sync.subscribe(query);

      expect(listener).not.toHaveBeenCalled();
    });

    it('multiple listeners all called on emit', async () => {
      sync = createSync();
      const listener1 = vi.fn<() => void>();
      const listener2 = vi.fn<() => void>();
      const listener3 = vi.fn<() => void>();
      sync.subscribeStore(listener1);
      sync.subscribeStore(listener2);
      sync.subscribeStore(listener3);

      const query: SubscriptionQuery = { doctype: 'TestDoc', fields: ['title'] };
      await sync.subscribe(query);

      expect(listener1).toHaveBeenCalledWith();
      expect(listener2).toHaveBeenCalledWith();
      expect(listener3).toHaveBeenCalledWith();
    });
  });

  describe('dispose', () => {
    it('clears store listeners after dispose', async () => {
      sync = createSync();
      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      await sync.dispose();
      listener.mockClear();

      await sync.subscribe({ doctype: 'TestDoc' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('clears cdcInterval timer on dispose', async () => {
      sync = createSync({ cdcInterval: 100 });
      await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      mockDb.backfill.mockClear();
      await vi.advanceTimersByTimeAsync(250);
      const callsBefore = mockDb.backfill.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(0);

      await sync.dispose();
      mockDb.backfill.mockClear();

      await vi.advanceTimersByTimeAsync(500);

      expect(mockDb.backfill).not.toHaveBeenCalled();
    });
  });

  describe('cdcInterval', () => {
    it('fires backfill periodically at the configured interval', async () => {
      sync = createSync({ cdcInterval: 500 });
      await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      mockDb.backfill.mockClear();

      await vi.advanceTimersByTimeAsync(1500);

      expect(mockDb.backfill).toHaveBeenCalledTimes(3);
    });
  });

  describe('resetCache', () => {
    it('clears subscriptions so getSubscription returns undefined', async () => {
      sync = createSync();

      const { subscriptionId } = await sync.subscribe({
        doctype: 'TestDoc',
        fields: ['title'],
      });

      expect(sync.getSubscription(subscriptionId)).toBeDefined();

      sync.resetCache();

      expect(sync.getSubscription(subscriptionId)).toBeUndefined();
    });

    it('notifies store listeners on reset', async () => {
      sync = createSync();
      const listener = vi.fn<() => void>();

      await sync.subscribe({ doctype: 'TestDoc' });
      sync.subscribeStore(listener);

      sync.resetCache();

      expect(listener).toHaveBeenCalledWith();
    });
  });

  describe('realtime events bridge to store listeners', () => {
    let eventHandlers: Record<string, (payload?: DocPayload) => Promise<void> | void>;

    beforeEach(() => {
      eventHandlers = {};
      mockRealtime.on.mockImplementation(async (event: string, handler: any) => {
        eventHandlers[event] = handler;
      });
    });

    it('notifies store listeners after a remote doc_update reconciles', async () => {
      sync = createSync();
      await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      mockDb.getDoc.mockResolvedValueOnce({
        name: 'doc1',
        doctype: 'TestDoc',
        title: 'Doc 1 edited',
        modified: '2024-01-01T11:00:00',
      });
      await eventHandlers.doc_update?.({ doctype: 'TestDoc', name: 'doc1' });

      expect(listener).toHaveBeenCalledWith();
    });

    it('notifies store listeners after a remote list_update reconciles', async () => {
      sync = createSync();
      await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      await eventHandlers.list_update?.({ doctype: 'TestDoc', name: 'doc2' });

      expect(listener).toHaveBeenCalledWith();
    });

    it('notifies store listeners after doc_deleted evicts the row', async () => {
      sync = createSync();
      const { subscriptionId } = await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });
      expect(sync.getDocsForSubscription(subscriptionId).map((d) => d.name)).toContain('doc1');

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      await eventHandlers.doc_deleted?.({ doctype: 'TestDoc', name: 'doc1' });

      expect(listener).toHaveBeenCalledWith();
      expect(sync.getDocsForSubscription(subscriptionId).map((d) => d.name)).not.toContain('doc1');
    });

    it('flips getConnectionState and notifies listeners on connect/disconnect', async () => {
      sync = createSync();
      expect(sync.getConnectionState()).toStrictEqual({ connected: false, everConnected: false });

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      await eventHandlers.connected?.();
      expect(sync.getConnectionState()).toStrictEqual({ connected: true, everConnected: true });
      expect(listener).toHaveBeenCalledWith();

      listener.mockClear();
      await eventHandlers.disconnect?.();
      expect(sync.getConnectionState()).toStrictEqual({ connected: false, everConnected: true });
      expect(listener).toHaveBeenCalledWith();
    });

    it('forwards realtime events to subscribeRealtimeEvents listeners and unsubscribes', async () => {
      sync = createSync();
      const events: { type: string; payload?: unknown }[] = [];
      const unsubscribe = sync.subscribeRealtimeEvents((event) =>
        events.push(event as { type: string; payload?: unknown }),
      );

      await eventHandlers.list_update?.({ doctype: 'TestDoc', name: 'doc2' });
      expect(events.some((e) => e.type === 'list_update')).toBe(true);

      unsubscribe();
      events.length = 0;
      await eventHandlers.list_update?.({ doctype: 'TestDoc', name: 'doc2' });
      expect(events).toHaveLength(0);
    });

    it('chains a consumer-provided onRealtimeEvent option alongside listeners', async () => {
      const onRealtimeEvent = vi.fn<NonNullable<SyncOptions['onRealtimeEvent']>>();
      sync = createSync({ onRealtimeEvent });

      await eventHandlers.doc_update?.({ doctype: 'TestDoc', name: 'doc1' });

      expect(onRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'doc_update' }));
    });

    it('watchDoctype/unwatchDoctype join and leave the doctype room', () => {
      sync = createSync();
      sync.watchDoctype('TestDoc');
      expect(mockRealtime.subscribeList).toHaveBeenCalledWith('TestDoc');

      sync.unwatchDoctype('TestDoc');
      expect(mockRealtime.unsubscribeList).toHaveBeenCalledWith('TestDoc');
    });

    it('notifies store listeners after debounced rehydration runs (remote create)', async () => {
      sync = createSync();
      await sync.subscribe({
        doctype: 'TestDoc',
        fields: ['title'],
        filters: { status: 'Open' },
      });

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      // A brand-new doc matching the filters triggers RemoteCreate rehydration
      mockDb.getDoc.mockResolvedValueOnce({
        name: 'doc3',
        doctype: 'TestDoc',
        status: 'Open',
        title: 'Doc 3',
        modified: '2024-01-01T12:00:00',
      });
      await eventHandlers.doc_update?.({ doctype: 'TestDoc', name: 'doc3' });
      listener.mockClear();

      // RemoteCreate rehydration is debounced (~500ms) then refreshes the page
      await vi.advanceTimersByTimeAsync(1000);

      expect(listener).toHaveBeenCalledWith();
    });
  });

  describe('getPage and getNextBatch emit', () => {
    it('getPage notifies store listeners', async () => {
      sync = createSync();

      const { subscriptionId } = await sync.subscribe({
        doctype: 'TestDoc',
        fields: ['title'],
        progressive: true,
        limit: 10,
      });

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      await sync.getPage(subscriptionId, 1);

      expect(listener).toHaveBeenCalledWith();
    });

    it('getNextBatch notifies store listeners', async () => {
      sync = createSync();

      const { subscriptionId } = await sync.subscribe({
        doctype: 'TestDoc',
        fields: ['title'],
        progressive: true,
        limit: 10,
      });

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      await sync.getNextBatch(subscriptionId, 'doc1', 5);

      expect(listener).toHaveBeenCalledWith();
    });
  });

  // The optimistic paint contract: store listeners MUST be notified when the
  // optimistic state is applied — strictly before the server ack resolves —
  // otherwise subscribeStore consumers only repaint after the round trip and
  // the in-memory store's whole reason to exist is defeated.
  describe('optimistic emit timing', () => {
    it('notifies store listeners on optimistic create BEFORE the server ack', async () => {
      const createAck = Promise.withResolvers<ServerDoc>();
      vi.spyOn(mockDb, 'createDoc').mockReturnValue(createAck.promise);
      sync = createSync();
      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      const mutatePromise = sync.mutate({
        mutationId: 'm-create',
        operation: Operation.Create,
        doc: { doctype: 'TestDoc', title: 'optimistic' } as any,
      });
      await flushMicrotasks();

      // Server still hasn't answered…
      expect(mockDb.createDoc).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'TestDoc', title: 'optimistic' }),
      );
      // …but the optimistic apply already painted.
      expect(listener).toHaveBeenCalledWith();

      createAck.resolve({ name: 'SRV-1', doctype: 'TestDoc', title: 'optimistic' });
      await mutatePromise;
    });

    it('notifies store listeners on optimistic update BEFORE the server ack', async () => {
      const updateAck = Promise.withResolvers<ServerDoc>();
      vi.spyOn(mockDb, 'updateDoc').mockReturnValue(updateAck.promise);
      sync = createSync();
      const { subscriptionId } = await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      const mutatePromise = sync.mutate({
        mutationId: 'm-update',
        operation: Operation.Update,
        doc: { doctype: 'TestDoc', name: 'doc1', title: 'edited' } as any,
      });
      await flushMicrotasks();

      expect(listener).toHaveBeenCalledWith();
      // The optimistic value is readable from the store during the round trip.
      const rows = sync.getDocsForSubscription<{ name: string; doctype: string; title?: string }>(subscriptionId);
      expect(rows.find((d) => d.name === 'doc1')?.title).toBe('edited');

      updateAck.resolve({ name: 'doc1', doctype: 'TestDoc', title: 'edited' });
      await mutatePromise;
    });

    it('evicts optimistically on delete BEFORE the server ack (and notifies)', async () => {
      const deleteAck = Promise.withResolvers<object>();
      vi.spyOn(mockDb, 'deleteDoc').mockReturnValue(deleteAck.promise);
      sync = createSync();
      const { subscriptionId } = await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });
      expect(sync.getDocsForSubscription(subscriptionId).map((d) => d.name)).toContain('doc1');

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);

      const mutatePromise = sync.mutate({
        mutationId: 'm-delete',
        operation: Operation.Delete,
        doc: { doctype: 'TestDoc', name: 'doc1' } as any,
      });
      await flushMicrotasks();

      expect(listener).toHaveBeenCalledWith();
      expect(sync.getDocsForSubscription(subscriptionId).map((d) => d.name)).not.toContain('doc1');

      deleteAck.resolve({});
      await mutatePromise;
    });
  });

  // Custom server transport: mutation.execute replaces ONLY the server call
  // (for desk RPCs a REST insert can't reproduce, e.g. add_comment) — the
  // optimistic apply, temp→real remap, rollback, and ledger are unchanged.
  describe('custom transport (mutation.execute)', () => {
    it('paints optimistically before the transport ack and remaps on it', async () => {
      const executeAck = Promise.withResolvers<ServerDoc>();
      const execute = vi.fn<() => Promise<ServerDoc>>(async () => await executeAck.promise);
      sync = createSync();
      const { subscriptionId } = await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      const mutatePromise = sync.mutate({
        mutationId: 'm-transport',
        operation: Operation.Create,
        doc: { doctype: 'TestDoc', name: 'local:1', title: 'via rpc' } as any,
        execute,
      });
      await flushMicrotasks();

      // Optimistic row visible under its local identity, ack still pending.
      expect(sync.getDocsForSubscription(subscriptionId).map((d) => d.name)).toContain('local:1');
      expect(execute).toHaveBeenCalledWith();
      expect(mockDb.createDoc).not.toHaveBeenCalled();

      executeAck.resolve({
        name: 'SRV-9',
        doctype: 'TestDoc',
        title: 'via rpc',
        modified: '2024-01-01T12:00:00',
      });
      await mutatePromise;

      // Temp identity remapped to the server-assigned name — exactly once.
      const names = sync.getDocsForSubscription(subscriptionId).map((d) => d.name);
      expect(names).toContain('SRV-9');
      expect(names).not.toContain('local:1');
      expect(names.filter((n) => n === 'SRV-9')).toHaveLength(1);
    });

    it('rolls back the optimistic row when the transport rejects', async () => {
      const execute = vi.fn<() => Promise<ServerDoc>>().mockRejectedValue(new Error('no permission'));
      sync = createSync();
      const { subscriptionId } = await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      await expect(
        sync.mutate({
          mutationId: 'm-transport-fail',
          operation: Operation.Create,
          doc: { doctype: 'TestDoc', name: 'local:2', title: 'rejected' } as any,
          execute,
        }),
      ).rejects.toThrow('no permission');

      expect(sync.getDocsForSubscription(subscriptionId).map((d) => d.name)).not.toContain('local:2');
      const failed = sync.getMutationEntries('TestDoc');
      expect(failed).toHaveLength(1);
      expect(failed[0].error).toBe('no permission');
    });

    it('skips request batching for transport mutations', async () => {
      const execute = vi.fn<() => Promise<ServerDoc>>().mockResolvedValue({
        name: 'SRV-10',
        doctype: 'TestDoc',
        title: 'x',
      });
      sync = createSync({ enableBatching: true });

      await sync.mutate({
        mutationId: 'm-transport-nobatch',
        operation: Operation.Create,
        doc: { doctype: 'TestDoc', name: 'local:3', title: 'x' } as any,
        execute,
      });

      expect(execute).toHaveBeenCalledWith();
      // Neither the batch RPC nor the REST create ran.
      expect(mockDb.call.post).not.toHaveBeenCalled();
      expect(mockDb.createDoc).not.toHaveBeenCalled();
    });
  });

  describe('mutation ledger (getMutationEntries / dismissMutation)', () => {
    it('exposes a failed mutation with its error, and dismiss drops it', async () => {
      vi.spyOn(mockDb, 'updateDoc').mockRejectedValue(new Error('Validation failed'));
      sync = createSync();
      await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      await expect(
        sync.mutate({
          mutationId: 'm-fail',
          operation: Operation.Update,
          doc: { doctype: 'TestDoc', name: 'doc1', title: 'rejected' } as any,
        }),
      ).rejects.toThrow('Validation failed');

      const failed = sync.getMutationEntries('TestDoc');
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        id: 'm-fail',
        doctype: 'TestDoc',
        docname: 'doc1',
        error: 'Validation failed',
      });

      const listener = vi.fn<() => void>();
      sync.subscribeStore(listener);
      sync.dismissMutation('m-fail');
      expect(sync.getMutationEntries('TestDoc')).toHaveLength(0);
      expect(listener).toHaveBeenCalledWith();
    });

    it('rolls the optimistic update back when the server rejects', async () => {
      vi.spyOn(mockDb, 'updateDoc').mockRejectedValue(new Error('boom'));
      sync = createSync();
      const { subscriptionId } = await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      await expect(
        sync.mutate({
          mutationId: 'm-rollback',
          operation: Operation.Update,
          doc: { doctype: 'TestDoc', name: 'doc1', title: 'never lands' } as any,
        }),
      ).rejects.toThrow('boom');

      const rows = sync.getDocsForSubscription<{ name: string; doctype: string; title?: string }>(subscriptionId);
      expect(rows.find((d) => d.name === 'doc1')?.title).toBe('Doc 1');
    });

    it('scopes entries by doctype', async () => {
      vi.spyOn(mockDb, 'updateDoc').mockRejectedValue(new Error('nope'));
      sync = createSync();
      await sync.subscribe({ doctype: 'TestDoc', fields: ['title'] });

      await expect(
        sync.mutate({
          mutationId: 'm-a',
          operation: Operation.Update,
          doc: { doctype: 'TestDoc', name: 'doc1', title: 'x' } as any,
        }),
      ).rejects.toThrow('nope');

      expect(sync.getMutationEntries('OtherDoc')).toHaveLength(0);
      expect(sync.getMutationEntries()).toHaveLength(1);
    });
  });
});

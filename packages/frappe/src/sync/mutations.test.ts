// oxlint-disable typescript/unbound-method -- every collaborator is a vi.fn() mock object asserted by reference (expect(mock.method)); none of them use `this`
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDocData } from '../common/types';
import type { DbModule } from '../db';
import type { RealtimeModule } from '../realtime';

import { MutationEngine } from './mutation-engine';
import type { MutationJournal } from './mutation-journal';
import type { NormalizedCache } from './normalized-cache';
import type { RehydrationManager } from './rehydration';
import type { SubscriptionManager } from './subscription-manager';
import { Operation, Status } from './types';
import type { CreateMutation, DeleteMutation, SyncOptions, UpdateMutation } from './types';

describe(MutationEngine, () => {
  let mutationEngine: MutationEngine;
  let mockDb: DbModule;
  let mockRealtime: RealtimeModule;
  let mockCache: NormalizedCache;
  let mockJournal: MutationJournal;
  let mockSubscriptionManager: SubscriptionManager;
  let options: SyncOptions;

  beforeEach(() => {
    mockDb = {
      getDoc: vi.fn<DbModule['getDoc']>(),
      createDoc: vi.fn<DbModule['createDoc']>(),
      deleteDoc: vi.fn<DbModule['deleteDoc']>(),
      updateDoc: vi.fn<DbModule['updateDoc']>(),
      getCount: vi.fn<DbModule['getCount']>(),
    } as unknown as DbModule;
    mockRealtime = {
      isHealthy: vi.fn<RealtimeModule['isHealthy']>().mockReturnValue(true),
      on: vi.fn<RealtimeModule['on']>(),
      off: vi.fn<RealtimeModule['off']>(),
      emit: vi.fn<RealtimeModule['emit']>(),
    } as unknown as RealtimeModule;
    mockCache = {
      get: vi.fn<NormalizedCache['get']>(),
      upsert: vi.fn<NormalizedCache['upsert']>(),
      remove: vi.fn<NormalizedCache['remove']>(),
      clear: vi.fn<NormalizedCache['clear']>(),
    } as unknown as NormalizedCache;
    mockJournal = {
      add: vi.fn<MutationJournal['add']>(),
      confirm: vi.fn<MutationJournal['confirm']>(),
      fail: vi.fn<MutationJournal['fail']>(),
      listPending: vi.fn<MutationJournal['listPending']>().mockReturnValue([]),
      clear: vi.fn<MutationJournal['clear']>(),
      get: vi.fn<MutationJournal['get']>(),
      remove: vi.fn<MutationJournal['remove']>(),
    } as unknown as MutationJournal;
    mockSubscriptionManager = {
      getAllSubscriptions: vi.fn<SubscriptionManager['getAllSubscriptions']>().mockReturnValue(new Map()),
      getSubscription: vi.fn<SubscriptionManager['getSubscription']>(),
      updateSubscriptionMembership: vi.fn<SubscriptionManager['updateSubscriptionMembership']>(),
      removeFromAllSubscriptions: vi.fn<SubscriptionManager['removeFromAllSubscriptions']>(),
    } as unknown as SubscriptionManager;
    options = {
      batchSize: 10,
      batchDelay: 100,
      versionField: 'modified',
      onMutationStart: vi.fn<NonNullable<SyncOptions['onMutationStart']>>(),
      onMutationSuccess: vi.fn<NonNullable<SyncOptions['onMutationSuccess']>>(),
      onMutationError: vi.fn<NonNullable<SyncOptions['onMutationError']>>(),
      onConflict: vi.fn<NonNullable<SyncOptions['onConflict']>>(),
    };
    const mockRehydrationManager = {
      scheduleRehydration: vi.fn<RehydrationManager['scheduleRehydration']>(),
      registerTempIdMapping: vi.fn<RehydrationManager['registerTempIdMapping']>(),
    } as any;
    mutationEngine = new MutationEngine(
      mockDb,
      mockRealtime,
      mockCache,
      mockJournal,
      mockSubscriptionManager,
      mockRehydrationManager,
      options,
    );
  });

  describe('mutate', () => {
    it('should handle create operation', async () => {
      const mutation: CreateMutation<FrappeDocData> = {
        mutationId: 'mut-1',
        operation: Operation.Create,
        doc: {
          doctype: 'Task',
          name: 'temp-id',
          title: 'New Task',
          status: 'Open',
        },
        affected: [],
      };
      const createdDoc = {
        doctype: 'Task',
        name: 'TASK-001',
        title: 'New Task',
        status: 'Open',
        modified: '2025-01-01 10:00:00',
      };
      vi.mocked(mockDb.createDoc).mockResolvedValue(createdDoc);
      await mutationEngine.mutate(mutation);
      expect(mockJournal.add).toHaveBeenCalledWith(
        'mut-1',
        expect.objectContaining({
          doctype: 'Task',
          operation: Operation.Create,
          values: {
            doctype: 'Task',
            name: 'temp-id',
            title: 'New Task',
            status: 'Open',
          },
          status: Status.Pending,
        }),
      );
      // createDoc now takes just the doc object
      expect(mockDb.createDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'Task',
          title: 'New Task',
          status: 'Open',
        }),
      );
      expect(mockJournal.confirm).toHaveBeenCalledWith('mut-1');
      expect(options.onMutationSuccess).toHaveBeenCalledWith(mutation);
    });

    it('should throw error for update without docname', async () => {
      const mutation: UpdateMutation<FrappeDocData> = {
        mutationId: 'mut-4',
        operation: Operation.Update,
        doc: { doctype: 'Task', name: '' },
        affected: [],
      } as UpdateMutation<FrappeDocData>;
      await expect(mutationEngine.mutate(mutation)).rejects.toThrow('docname is required for update/delete operations');
    });

    it('should throw error for delete without docname', async () => {
      const mutation: DeleteMutation<FrappeDocData> = {
        mutationId: 'mut-5',
        operation: Operation.Delete,
        doc: { doctype: 'Task', name: '' },
        affected: [],
      } as DeleteMutation<FrappeDocData>;
      await expect(mutationEngine.mutate(mutation)).rejects.toThrow('docname is required for update/delete operations');
    });
  });

  describe('replayPending', () => {
    it('should replay pending mutations in order', async () => {
      const pending1 = {
        id: 'mut-1',
        entry: {
          mutationId: 'mut-1',
          doctype: 'Task',
          docname: 'TASK-001',
          operation: Operation.Update,
          values: { doctype: 'Task', name: 'TASK-001', status: 'InProgress' },
          version: '2025-01-01 09:00:00',
          status: Status.Pending,
        },
      };
      const pending2 = {
        id: 'mut-2',
        entry: {
          mutationId: 'mut-2',
          doctype: 'Task',
          docname: 'TASK-002',
          operation: Operation.Update,
          values: { doctype: 'Task', name: 'TASK-002', status: 'Completed' },
          version: '2025-01-01 09:30:00',
          status: Status.Pending,
        },
      };
      vi.mocked(mockJournal.listPending).mockReturnValue([pending1, pending2]);
      vi.mocked(mockDb.updateDoc).mockResolvedValue({
        doctype: 'Task',
        name: 'TASK-001',
      });
      await mutationEngine.replayPending();
      expect(mockDb.updateDoc).toHaveBeenCalledTimes(2);
      // updateDoc now takes a single doc object with client_mutation_id and base_modified
      expect(mockDb.updateDoc).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          doctype: 'Task',
          name: 'TASK-001',
          status: 'InProgress',
          client_mutation_id: 'mut-1',
          base_modified: '2025-01-01 09:00:00',
        }),
      );
      expect(mockDb.updateDoc).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          doctype: 'Task',
          name: 'TASK-002',
          status: 'Completed',
          client_mutation_id: 'mut-2',
          base_modified: '2025-01-01 09:30:00',
        }),
      );
    });

    it('should handle create operations during replay', async () => {
      const pending = {
        id: 'mut-1',
        entry: {
          mutationId: 'mut-1',
          doctype: 'Task',
          operation: Operation.Create,
          values: {
            doctype: 'Task',
            name: 'temp-id',
            title: 'New Task',
            status: 'Open',
          },
          status: Status.Pending,
        },
      };
      vi.mocked(mockJournal.listPending).mockReturnValue([pending]);
      vi.mocked(mockDb.createDoc).mockResolvedValue({
        doctype: 'Task',
        name: 'TASK-001',
      } as FrappeDocData);
      await mutationEngine.replayPending();
      // createDoc now takes a single doc object with client_mutation_id
      expect(mockDb.createDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'Task',
          title: 'New Task',
          status: 'Open',
          client_mutation_id: 'mut-1',
        }),
      );
    });

    it('should handle delete operations during replay', async () => {
      const pending = {
        id: 'mut-1',
        entry: {
          mutationId: 'mut-1',
          doctype: 'Task',
          docname: 'TASK-001',
          operation: Operation.Delete,
          status: Status.Pending,
        },
      };
      vi.mocked(mockJournal.listPending).mockReturnValue([pending]);
      vi.mocked(mockDb.deleteDoc).mockResolvedValue({
        message: 'Deleted successfully',
      });
      await mutationEngine.replayPending();
      // deleteDoc now takes a single doc object with client_mutation_id
      expect(mockDb.deleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'Task',
          name: 'TASK-001',
          client_mutation_id: 'mut-1',
        }),
      );
    });

    it('should handle errors during replay', async () => {
      const pending = {
        id: 'mut-1',
        entry: {
          mutationId: 'mut-1',
          doctype: 'Task',
          docname: 'TASK-001',
          operation: Operation.Update,
          values: { doctype: 'Task', name: 'TASK-001', status: 'InProgress' },
          status: Status.Failed,
          retryCount: 1,
        },
      };
      const error = new Error('Network error');
      vi.mocked(mockJournal.listPending).mockReturnValue([pending]);
      vi.mocked(mockDb.updateDoc).mockRejectedValue(error);
      await mutationEngine.replayPending();
      expect(mockJournal.fail).toHaveBeenCalledWith('mut-1', { message: 'Network error' });
    });
  });

  describe('batching', () => {
    it('should respect batch configuration', async () => {
      const batchingOptions: SyncOptions = {
        ...options,

        batchSize: 2,
        batchDelay: 50,
      };
      const mockRehydrationManager = {
        scheduleRehydration: vi.fn<RehydrationManager['scheduleRehydration']>(),
        registerTempIdMapping: vi.fn<RehydrationManager['registerTempIdMapping']>(),
      } as any;
      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockCache,
        mockJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        batchingOptions,
      );
      const mutation1: CreateMutation<FrappeDocData> = {
        mutationId: 'mut-1',
        operation: Operation.Create,
        doc: { doctype: 'Task', name: 'temp-1', title: 'Task 1' },
        affected: [],
      };
      const mutation2: CreateMutation<FrappeDocData> = {
        mutationId: 'mut-2',
        operation: Operation.Create,
        doc: { doctype: 'Task', name: 'temp-2', title: 'Task 2' },
        affected: [],
      };
      vi.mocked(mockDb.createDoc).mockResolvedValue({
        doctype: 'Task',
        name: 'TASK-001',
      });
      const promise1 = mutationEngine.mutate(mutation1);
      const promise2 = mutationEngine.mutate(mutation2);
      await Promise.all([promise1, promise2]);
      expect(mockJournal.add).toHaveBeenCalledTimes(2);
    });
  });
});

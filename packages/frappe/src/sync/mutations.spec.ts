import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDocData } from '../common/types';
import type { DbModule } from '../db';
import type { RealtimeModule } from '../realtime';

import { MutationEngine } from './mutationEngine';
import type { MutationJournal } from './mutationJournal';
import type { NormalizedCache } from './normalizedCache';
import type { SubscriptionManager } from './subscriptionManager';
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
      getDoc: vi.fn(),
      setValue: vi.fn(),
      createDoc: vi.fn(),
      deleteDoc: vi.fn(),
      updateDoc: vi.fn(),
      exists: vi.fn(),
      searchLink: vi.fn(),
      getList: vi.fn(),
      getCount: vi.fn(),
      getCachedDoc: vi.fn(),
      getCachedDocList: vi.fn(),
      insertDoc: vi.fn(),
      saveDoc: vi.fn(),
      submitDoc: vi.fn(),
      cancelDoc: vi.fn(),
      getApiCount: vi.fn(),
      getApiList: vi.fn(),
      getApi: vi.fn(),
      postApi: vi.fn(),
      putApi: vi.fn(),
      deleteApi: vi.fn(),
    } as unknown as DbModule;
    mockRealtime = {
      isHealthy: vi.fn().mockReturnValue(true),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      socketio: undefined,
    } as unknown as RealtimeModule;
    mockCache = {
      get: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      getAll: vi.fn(),
      has: vi.fn(),
      update: vi.fn(),
    } as unknown as NormalizedCache;
    mockJournal = {
      add: vi.fn(),
      confirm: vi.fn(),
      fail: vi.fn(),
      listPending: vi.fn().mockReturnValue([]),
      clear: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(),
      remove: vi.fn(),
    } as unknown as MutationJournal;
    mockSubscriptionManager = {
      getAllSubscriptions: vi.fn().mockReturnValue(new Map()),
      addSubscription: vi.fn(),
      removeSubscription: vi.fn(),
      getSubscription: vi.fn(),
      updateSubscription: vi.fn(),
      updateSubscriptionMembership: vi.fn(),
      processOptimisticCreate: vi.fn(),
      processDocumentDelete: vi.fn(),
      removeFromAllSubscriptions: vi.fn(),
    } as unknown as SubscriptionManager;
    options = {
      batchSize: 10,
      batchDelay: 100,
      versionField: 'modified',
      onMutationStart: vi.fn(),
      onMutationSuccess: vi.fn(),
      onMutationError: vi.fn(),
      onConflict: vi.fn(),
    };
    const mockRehydrationManager = {
      scheduleRehydration: vi.fn(),
      registerTempIdMapping: vi.fn(),
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
        scheduleRehydration: vi.fn(),
        registerTempIdMapping: vi.fn(),
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

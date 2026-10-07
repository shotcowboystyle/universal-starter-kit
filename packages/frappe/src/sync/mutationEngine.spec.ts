import type { MockedObject } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';
import type { RealtimeModule } from '../realtime';

import { MutationEngine } from './mutationEngine';
import type { MutationJournal, Pending } from './mutationJournal';
import type { NormalizedCache } from './normalizedCache';
import type { RehydrationManager } from './rehydration';
import type { SubscriptionManager } from './subscriptionManager';
import { RehydrationReason, Operation, Status } from './types';
import type { CreateMutation, DeleteMutation, SyncOptions, Subscription, UpdateMutation } from './types';

describe(MutationEngine, () => {
  let mutationEngine: MutationEngine;
  let mockDb: MockedObject<DbModule>;
  let mockRealtime: MockedObject<RealtimeModule>;
  let mockNormalizedCache: MockedObject<NormalizedCache>;
  let mockMutationJournal: MockedObject<MutationJournal>;
  let mockSubscriptionManager: MockedObject<SubscriptionManager>;
  let mockRehydrationManager: MockedObject<RehydrationManager>;

  const mockDoc: FrappeDoc<FrappeDocData> = {
    name: 'test-doc',
    doctype: 'TestDoc',
    title: 'Test Document',
    modified: '2024-01-01T10:00:00',
    creation: '2024-01-01T09:00:00',
    owner: 'test-user',
    modified_by: 'test-user',
  };

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock database module
    const mockCall = {
      post: vi.fn().mockResolvedValue({ results: [] }),
    };
    mockDb = {
      getDoc: vi.fn().mockResolvedValue(mockDoc),
      createDoc: vi.fn().mockResolvedValue({ ...mockDoc, name: 'real-doc' }),
      updateDoc: vi.fn().mockResolvedValue({ ...mockDoc, title: 'Updated' }),
      deleteDoc: vi.fn().mockResolvedValue(),
      call: mockCall,
    } as any;

    // Mock realtime module
    mockRealtime = {
      isHealthy: vi.fn().mockReturnValue(true),
    } as any;

    // Mock normalized cache
    mockNormalizedCache = {
      get: vi.fn().mockReturnValue(mockDoc),
      upsert: vi.fn(),
      remove: vi.fn(),
    } as any;

    // Mock mutation journal
    mockMutationJournal = {
      add: vi.fn(),
      confirm: vi.fn(),
      fail: vi.fn(),
      get: vi.fn().mockReturnValue({
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: mockDoc,
        operation: Operation.Update,
        version: '2024-01-01T10:00:00',
        status: Status.Pending,
        snapshot: mockDoc,
      }),
      listPending: vi.fn().mockReturnValue([]),
    } as any;

    // Mock subscription manager
    const mockSubscription: Subscription = {
      id: 'sub1',
      query: {
        doctype: 'TestDoc',
        fields: ['*'],
        filters: {},
        limit: 20,
      },
      docIds: ['doc1', 'doc2'],
      checkpoint: 'checkpoint1',
      metadata: {},
    };

    mockSubscriptionManager = {
      getAllSubscriptions: vi.fn().mockReturnValue(new Map([['sub1', mockSubscription]])),
      updateSubscriptionMembership: vi.fn().mockReturnValue([]),
      removeFromAllSubscriptions: vi.fn().mockReturnValue(['sub1']),
      insertDocumentIntoSubscription: vi.fn(),
    } as any;

    // Mock rehydration manager
    mockRehydrationManager = {
      scheduleRehydration: vi.fn(),
      registerTempIdMapping: vi.fn(),
    } as any;

    // Mock global objects
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: vi.fn().mockReturnValue('uuid-12345'),
      },
      writable: true,
    });

    Object.defineProperty(global, 'navigator', {
      value: {
        onLine: true,
      },
      writable: true,
    });

    // Mock console methods
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
      );

      expect(mutationEngine).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const options: SyncOptions = {
        batchSize: 20,
        batchDelay: 200,
        versionField: 'timestamp',
      };

      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        options,
      );

      expect(mutationEngine).toBeDefined();
    });

    it('should handle missing realtime module', () => {
      mutationEngine = new MutationEngine(
        mockDb,
        undefined,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
      );

      expect(mutationEngine).toBeDefined();
    });
  });

  describe('mutate', () => {
    beforeEach(() => {
      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );
    });

    describe('create mutations', () => {
      it('should handle create mutations successfully', async () => {
        const mutation: CreateMutation<FrappeDocData> = {
          mutationId: 'mut1',
          operation: Operation.Create,
          doc: {
            doctype: 'TestDoc',
            name: 'temp-doc',
            title: 'New Document',
          },
          version: undefined,
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        expect(mockNormalizedCache.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            doctype: 'TestDoc',
            name: 'temp-doc',
            title: 'New Document',
          }),
        );
        // createDoc now takes a single doc object
        expect(mockDb.createDoc).toHaveBeenCalledWith(
          expect.objectContaining({
            doctype: 'TestDoc',
          }),
        );
        expect(mockMutationJournal.confirm).toHaveBeenCalledWith('mut1');
      });

      it('should handle create without provided name', async () => {
        const mutation: CreateMutation<FrappeDocData> = {
          mutationId: 'mut2',
          operation: Operation.Create,
          doc: {
            doctype: 'TestDoc',
            title: 'New Document',
          } as any,
          version: undefined,
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        expect(mockNormalizedCache.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            doctype: 'TestDoc',
            name: expect.stringContaining('tmp_'),
            title: 'New Document',
          }),
        );
      });

      it('should handle temporary to real ID mapping', async () => {
        const mutation: CreateMutation<FrappeDocData> = {
          mutationId: 'mut3',
          operation: Operation.Create,
          doc: {
            doctype: 'TestDoc',
            name: 'temp-doc',
            title: 'New Document',
          },
          version: undefined,
          affected: [],
        };

        mockDb.createDoc.mockResolvedValue({
          ...mockDoc,
          name: 'real-doc-123',
        });

        await mutationEngine.mutate(mutation);

        expect(mockRehydrationManager.registerTempIdMapping).toHaveBeenCalledWith('temp-doc', 'real-doc-123');
        expect(mockNormalizedCache.remove).toHaveBeenCalledWith({
          doctype: 'TestDoc',
          name: 'temp-doc',
        });
      });

      it('should schedule rehydration for affected subscriptions', async () => {
        const mutation: CreateMutation<FrappeDocData> = {
          mutationId: 'mut4',
          operation: Operation.Create,
          doc: {
            doctype: 'TestDoc',
            name: 'temp-doc',
            title: 'New Document',
          },
          version: undefined,
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        expect(mockRehydrationManager.scheduleRehydration).toHaveBeenCalledWith(
          expect.any(Object),
          RehydrationReason.Create,
        );
      });
    });

    describe('update mutations', () => {
      it('should handle update mutations successfully', async () => {
        const mutation: UpdateMutation<FrappeDocData> = {
          mutationId: 'mut5',
          operation: Operation.Update,
          doc: {
            doctype: 'TestDoc',
            name: 'test-doc',
            title: 'Updated Title',
          },
          version: '2024-01-01T10:00:00',
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        expect(mockNormalizedCache.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            doctype: 'TestDoc',
            name: 'test-doc',
            title: 'Updated Title',
          }),
        );
        // updateDoc now takes a single doc object
        expect(mockDb.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({
            doctype: 'TestDoc',
            name: 'test-doc',
            title: 'Updated Title',
          }),
        );
        expect(mockMutationJournal.confirm).toHaveBeenCalledWith('mut5');
      });

      it('should throw error for update without docname', async () => {
        const mutation: UpdateMutation<FrappeDocData> = {
          mutationId: 'mut6',
          operation: Operation.Update,
          doc: {
            doctype: 'TestDoc',
            title: 'Updated Title',
          } as any,
          version: undefined,
          affected: [],
        };

        await expect(mutationEngine.mutate(mutation)).rejects.toThrow(
          'docname is required for update/delete operations',
        );
      });

      it('should determine version from cached document', async () => {
        const mutation: UpdateMutation<FrappeDocData> = {
          mutationId: 'mut7',
          operation: Operation.Update,
          doc: {
            doctype: 'TestDoc',
            name: 'test-doc',
            title: 'Updated Title',
          },
          version: undefined,
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        // updateDoc now takes a single doc object
        expect(mockDb.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({
            doctype: 'TestDoc',
            name: 'test-doc',
          }),
        );
      });

      it('should fetch document for version when not cached', async () => {
        mockNormalizedCache.get.mockReturnValue(undefined as any);
        mockDb.getDoc.mockResolvedValue({
          doctype: 'TestDoc',
          name: 'test-doc',
          title: 'Original Title',
          modified: '2024-01-01T10:00:00',
        });

        const mutation: UpdateMutation<FrappeDocData> = {
          mutationId: 'mut8',
          operation: Operation.Update,
          doc: {
            doctype: 'TestDoc',
            name: 'test-doc',
            title: 'Updated Title',
          },
          version: undefined,
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        expect(mockDb.getDoc).toHaveBeenCalledWith('TestDoc', 'test-doc');
        expect(mockNormalizedCache.upsert).toHaveBeenCalledWith();
      });

      it('should handle preflight fetch failures gracefully', async () => {
        mockNormalizedCache.get.mockReturnValue(undefined as any);
        mockDb.getDoc.mockRejectedValue(new Error('Network error'));

        const mutation: UpdateMutation<FrappeDocData> = {
          mutationId: 'mut9',
          operation: Operation.Update,
          doc: {
            doctype: 'TestDoc',
            name: 'test-doc',
            title: 'Updated Title',
          },
          version: undefined,
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        // updateDoc now takes a single doc object
        expect(mockDb.updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({
            doctype: 'TestDoc',
            name: 'test-doc',
          }),
        );
      });
    });

    describe('delete mutations', () => {
      it('should handle delete mutations successfully', async () => {
        const mutation: DeleteMutation<FrappeDocData> = {
          mutationId: 'mut10',
          operation: Operation.Delete,
          doc: {
            doctype: 'TestDoc',
            name: 'test-doc',
          },
          version: '2024-01-01T10:00:00',
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        expect(mockNormalizedCache.remove).toHaveBeenCalledWith({
          doctype: 'TestDoc',
          name: 'test-doc',
        });
        expect(mockSubscriptionManager.removeFromAllSubscriptions).toHaveBeenCalledWith('TestDoc', 'test-doc');
        // deleteDoc now takes a single doc object
        expect(mockDb.deleteDoc).toHaveBeenCalledWith(
          expect.objectContaining({
            doctype: 'TestDoc',
            name: 'test-doc',
          }),
        );
        expect(mockMutationJournal.confirm).toHaveBeenCalledWith('mut10');
      });

      it('should schedule rehydration for affected subscriptions', async () => {
        const mockSubscription: Subscription = {
          id: 'sub1',
          query: {
            doctype: 'TestDoc',
            fields: ['*'],
            filters: {},
            limit: 20,
          },
          docIds: ['test-doc', 'doc2'],
          checkpoint: 'checkpoint1',
          metadata: {},
        };
        mockSubscriptionManager.getAllSubscriptions.mockReturnValue(new Map([['sub1', mockSubscription]]));

        const mutation: DeleteMutation<FrappeDocData> = {
          mutationId: 'mut11',
          operation: Operation.Delete,
          doc: {
            doctype: 'TestDoc',
            name: 'test-doc',
          },
          version: undefined,
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        expect(mockRehydrationManager.scheduleRehydration).toHaveBeenCalledWith(
          expect.any(Object),
          RehydrationReason.Delete,
        );
      });

      it('should throw error for delete without docname', async () => {
        const mutation: DeleteMutation<FrappeDocData> = {
          mutationId: 'mut12',
          operation: Operation.Delete,
          doc: {
            doctype: 'TestDoc',
          } as any,
          version: undefined,
          affected: [],
        };

        await expect(mutationEngine.mutate(mutation)).rejects.toThrow(
          'docname is required for update/delete operations',
        );
      });
    });

    describe('callback integration', () => {
      it('should call mutation lifecycle callbacks', async () => {
        const callbacks = {
          onMutationStart: vi.fn(),
          onMutationSuccess: vi.fn(),
          onOptimisticApply: vi.fn(),
        };

        mutationEngine = new MutationEngine(
          mockDb,
          mockRealtime,
          mockNormalizedCache,
          mockMutationJournal,
          mockSubscriptionManager,
          mockRehydrationManager,
          callbacks,
        );

        const mutation: UpdateMutation<FrappeDocData> = {
          mutationId: 'mut13',
          operation: Operation.Update,
          doc: {
            doctype: 'TestDoc',
            name: 'test-doc',
            title: 'Updated',
          },
          version: undefined,
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        expect(callbacks.onMutationStart).toHaveBeenCalledWith(mutation);
        expect(callbacks.onMutationSuccess).toHaveBeenCalledWith(mutation);
        expect(callbacks.onOptimisticApply).toHaveBeenCalledWith({
          doctype: 'TestDoc',
          name: 'test-doc',
          operation: Operation.Update,
        });
      });
    });

    describe('realtime integration', () => {
      it('should refetch documents when realtime is unhealthy', async () => {
        mockRealtime.isHealthy.mockReturnValue(false);

        const mutation: UpdateMutation<FrappeDocData> = {
          mutationId: 'mut14',
          operation: Operation.Update,
          doc: {
            doctype: 'TestDoc',
            name: 'test-doc',
            title: 'Updated',
          },
          version: undefined,
          affected: [{ doctype: 'RelatedDoc', name: 'related-doc' }],
        };

        await mutationEngine.mutate(mutation);

        // Should refetch the main document and affected documents
        expect(mockDb.getDoc).toHaveBeenCalledWith('TestDoc', 'test-doc');
        expect(mockDb.getDoc).toHaveBeenCalledWith('RelatedDoc', 'related-doc');
      });

      it('should not refetch when realtime is healthy', async () => {
        mockRealtime.isHealthy.mockReturnValue(true);
        mockDb.getDoc.mockClear(); // Clear any preflight calls

        const mutation: UpdateMutation<FrappeDocData> = {
          mutationId: 'mut15',
          operation: Operation.Update,
          doc: {
            doctype: 'TestDoc',
            name: 'test-doc',
            title: 'Updated',
          },
          version: '2024-01-01T10:00:00',
          affected: [],
        };

        await mutationEngine.mutate(mutation);

        // Should not fetch the document after successful mutation
        expect(mockDb.getDoc).not.toHaveBeenCalled();
      });

      it('should not refetch the deleted doc itself on delete when realtime is unhealthy', async () => {
        // Regression: the post-mutation refetch used to include the DELETED
        // doc — the server 404s, routing a confirmed delete into the
        // error/rollback path (surfaced by FrappeTreeView's live delete spec
        // running against a realtime-less fixture sync module).
        mockRealtime.isHealthy.mockReturnValue(false);
        mockDb.getDoc.mockClear();
        mockDb.getDoc.mockImplementation(async (doctype: string, name: string) => {
          if (doctype === 'TestDoc' && name === 'test-doc') {
            throw new Error(`Document ${doctype}/${name} not found`);
          }
          return { ...mockDoc, doctype, name };
        });

        const mutation: DeleteMutation<FrappeDocData> = {
          mutationId: 'mut-del-refetch',
          operation: Operation.Delete,
          doc: { doctype: 'TestDoc', name: 'test-doc' },
          version: undefined,
          affected: [{ doctype: 'RelatedDoc', name: 'related-doc' }],
        };

        await mutationEngine.mutate(mutation);

        // The tombstoned doc is never refetched…
        expect(mockDb.getDoc).not.toHaveBeenCalledWith('TestDoc', 'test-doc');
        // …while related docs still refresh.
        expect(mockDb.getDoc).toHaveBeenCalledWith('RelatedDoc', 'related-doc');
        expect(mockMutationJournal.confirm).toHaveBeenCalledWith('mut-del-refetch');
        expect(mockMutationJournal.fail).not.toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          onMutationError: vi.fn(),
          onConflict: vi.fn(),
        },
      );
    });

    it('should handle server errors', async () => {
      const error = new Error('Server error');
      mockDb.createDoc.mockRejectedValue(error);

      const mutation: CreateMutation<FrappeDocData> = {
        mutationId: 'mut16',
        operation: Operation.Create,
        doc: {
          doctype: 'TestDoc',
          name: 'temp-doc',
          title: 'New Document',
        },
        version: undefined,
        affected: [],
      };

      await expect(mutationEngine.mutate(mutation)).rejects.toThrow('Server error');
      expect(mockMutationJournal.fail).toHaveBeenCalledWith('mut16', {
        message: 'Server error',
      });
    });

    it('should handle conflict errors (409)', async () => {
      const error = { status: 409 };
      mockDb.updateDoc.mockRejectedValue(error);

      const mutation: UpdateMutation<FrappeDocData> = {
        mutationId: 'mut17',
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: 'test-doc',
          title: 'Updated',
        },
        version: '2024-01-01T09:00:00',
        affected: [],
      };

      await expect(mutationEngine.mutate(mutation)).rejects.toEqual(error);
      expect(mockDb.getDoc).toHaveBeenCalledWith('TestDoc', 'test-doc');
    });

    it('should handle snapshot rollback on error', async () => {
      const error = new Error('Update failed');
      mockDb.updateDoc.mockRejectedValue(error);

      const mutation: UpdateMutation<FrappeDocData> = {
        mutationId: 'mut18',
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: 'test-doc',
          title: 'Updated',
        },
        version: undefined,
        affected: [],
      };

      await expect(mutationEngine.mutate(mutation)).rejects.toThrow('Update failed');

      // Should restore snapshot wholesale (replace, not merge)
      expect(mockNormalizedCache.upsert).toHaveBeenCalledWith(mockDoc, { replace: true });
    });

    it('should not rollback when offline', async () => {
      Object.defineProperty(global, 'navigator', {
        value: { onLine: false },
        writable: true,
      });

      const error = new Error('Network error');
      mockDb.updateDoc.mockRejectedValue(error);

      const mutation: UpdateMutation<FrappeDocData> = {
        mutationId: 'mut19',
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: 'test-doc',
          title: 'Updated',
        },
        version: undefined,
        affected: [],
      };

      await expect(mutationEngine.mutate(mutation)).rejects.toThrow('Network error');

      // Should not restore snapshot when offline
      const upsertCalls = mockNormalizedCache.upsert.mock.calls;
      const rollbackCall = upsertCalls.find(
        (call) => call[0] === mockDoc && upsertCalls.indexOf(call) > 0, // Not the initial optimistic update
      );
      expect(rollbackCall).toBeUndefined();
    });

    it('should handle failed create mutations', async () => {
      const error = new Error('Create failed');
      mockDb.createDoc.mockRejectedValue(error);

      const subscription = {
        id: 'sub1',
        query: { doctype: 'TestDoc' },
        docIds: ['temp-doc', 'other-doc'],
      } as any;

      mockSubscriptionManager.getAllSubscriptions.mockReturnValue(new Map([['sub1', subscription]]));

      const mutation: CreateMutation<FrappeDocData> = {
        mutationId: 'mut20',
        operation: Operation.Create,
        doc: {
          doctype: 'TestDoc',
          name: 'temp-doc',
          title: 'New Document',
        },
        version: undefined,
        affected: [],
      };

      await expect(mutationEngine.mutate(mutation)).rejects.toThrow('Create failed');

      // Should remove temporary document from subscriptions
      expect(subscription.docIds).toEqual(['other-doc']);
    });
  });

  describe('replayPending', () => {
    beforeEach(() => {
      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          onReplayStart: vi.fn(),
          onReplayComplete: vi.fn(),
          onConflict: vi.fn(),
          onMutationError: vi.fn(),
        },
      );
    });

    it('should replay pending create mutations', async () => {
      const pendingEntry: Pending = {
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: { doctype: 'TestDoc', name: 'test-doc', title: 'Test' },
        operation: Operation.Create,
        version: undefined,
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut21', entry: pendingEntry }]);

      await mutationEngine.replayPending();

      // createDoc now takes a single doc object with client_mutation_id
      expect(mockDb.createDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'TestDoc',
          client_mutation_id: 'mut21',
        }),
      );
      expect(mockMutationJournal.confirm).toHaveBeenCalledWith('mut21');
    });

    it('should replay pending update mutations', async () => {
      const pendingEntry: Pending = {
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: { doctype: 'TestDoc', name: 'test-doc', title: 'Updated' },
        operation: Operation.Update,
        version: '2024-01-01T10:00:00',
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut22', entry: pendingEntry }]);

      await mutationEngine.replayPending();

      // updateDoc now takes a single doc object with client_mutation_id and base_modified
      expect(mockDb.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'TestDoc',
          name: 'test-doc',
          client_mutation_id: 'mut22',
          base_modified: '2024-01-01T10:00:00',
        }),
      );
      expect(mockMutationJournal.confirm).toHaveBeenCalledWith('mut22');
    });

    it('should replay pending delete mutations', async () => {
      const pendingEntry: Pending = {
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: undefined,
        operation: Operation.Delete,
        version: undefined,
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut23', entry: pendingEntry }]);

      await mutationEngine.replayPending();

      // deleteDoc now takes a single doc object with client_mutation_id
      expect(mockDb.deleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'TestDoc',
          name: 'test-doc',
          client_mutation_id: 'mut23',
        }),
      );
      expect(mockMutationJournal.confirm).toHaveBeenCalledWith('mut23');
    });

    it('should handle replay conflicts', async () => {
      const pendingEntry: Pending = {
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: { doctype: 'TestDoc', name: 'test-doc', title: 'Updated' },
        operation: Operation.Update,
        version: '2024-01-01T10:00:00',
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut24', entry: pendingEntry }]);

      mockDb.updateDoc.mockRejectedValue({ status: 409 });

      await mutationEngine.replayPending();

      const options = mutationEngine as any;
      expect(options.options.onConflict).toHaveBeenCalledWith({
        doctype: 'TestDoc',
        name: 'test-doc',
      });
    });

    it('should handle replay auth errors', async () => {
      const pendingEntry: Pending = {
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: { doctype: 'TestDoc', name: 'test-doc', title: 'Updated' },
        operation: Operation.Update,
        version: undefined,
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut25', entry: pendingEntry }]);

      mockDb.updateDoc.mockRejectedValue({ status: 401 });

      await mutationEngine.replayPending();

      // Should not confirm or fail, keeping in journal
      expect(mockMutationJournal.confirm).not.toHaveBeenCalledWith('mut25');
      expect(mockMutationJournal.fail).not.toHaveBeenCalledWith('mut25');
    });

    it('should handle permanent replay errors', async () => {
      const pendingEntry: Pending = {
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: { doctype: 'TestDoc', name: 'test-doc', title: 'Updated' },
        operation: Operation.Update,
        version: undefined,
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut26', entry: pendingEntry }]);

      mockDb.updateDoc.mockRejectedValue({ status: 400 });

      await mutationEngine.replayPending();

      expect(mockMutationJournal.fail).toHaveBeenCalledWith(
        'mut26',
        expect.objectContaining({ message: expect.any(String) }),
      );
    });

    it('should call replay callbacks', async () => {
      mockMutationJournal.listPending.mockReturnValue([]);

      await mutationEngine.replayPending();

      const options = mutationEngine as any;
      expect(options.options.onReplayStart).toHaveBeenCalledWith();
      expect(options.options.onReplayComplete).toHaveBeenCalledWith({
        anyFailed: false,
      });
    });
  });

  describe('temporary ID management', () => {
    beforeEach(() => {
      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );
    });

    it('should return temporary ID mappings', () => {
      const tempMap = mutationEngine.getTemporaryIdToRealNameMap();
      expect(tempMap).toBeInstanceOf(Map);
    });

    it('should clear temporary mappings', () => {
      // Add some mappings first
      const tempMap = mutationEngine.getTemporaryIdToRealNameMap();
      tempMap.set('temp1', 'real1');

      mutationEngine.clearTemporaryMappings();

      expect(tempMap.size).toBe(0);
    });
  });

  describe('cleanup and disposal', () => {
    beforeEach(() => {
      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );
    });

    it('should dispose of resources', () => {
      const tempMap = mutationEngine.getTemporaryIdToRealNameMap();
      tempMap.set('temp1', 'real1');

      mutationEngine.dispose();

      expect(tempMap.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );
    });

    it('should handle missing crypto.randomUUID', async () => {
      (global as any).crypto = undefined;

      const mutation: CreateMutation<FrappeDocData> = {
        mutationId: 'no-crypto',
        operation: Operation.Create,
        doc: {
          doctype: 'TestDoc',
          title: 'New Document',
        } as any,
        version: undefined,
        affected: [],
      };

      mockSubscriptionManager.getAllSubscriptions = vi.fn().mockReturnValue(new Map());
      await expect(mutationEngine.mutate(mutation)).resolves.not.toThrow();
    });

    it('should handle undefined navigator', async () => {
      (global as any).navigator = undefined;

      const error = new Error('Update failed');
      mockDb.updateDoc.mockRejectedValue(error);

      const mutation: UpdateMutation<FrappeDocData> = {
        mutationId: 'no-navigator',
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: 'test-doc',
          title: 'Updated',
        },
        version: undefined,
        affected: [],
      };

      await expect(mutationEngine.mutate(mutation)).rejects.toThrow('Update failed');

      // Should still attempt snapshot rollback (upsert is called twice: once for optimistic update, once for rollback)
      expect(mockNormalizedCache.upsert).toHaveBeenCalledTimes(2);
      // Last call should be the rollback with original snapshot (wholesale replace)
      expect(mockNormalizedCache.upsert).toHaveBeenLastCalledWith(mockDoc, { replace: true });
    });

    it('should handle custom version fields', async () => {
      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          versionFields: {
            TestDoc: 'timestamp',
          },
        },
      );

      const docWithTimestamp = {
        ...mockDoc,
        timestamp: '2024-01-01T12:00:00',
      };

      mockNormalizedCache.get.mockReturnValue(docWithTimestamp);

      const mutation: UpdateMutation<FrappeDocData> = {
        mutationId: 'custom-version',
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: 'test-doc',
          title: 'Updated',
        },
        version: undefined,
        affected: [],
      };

      await mutationEngine.mutate(mutation);

      // updateDoc now takes a single doc object
      expect(mockDb.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'TestDoc',
          name: 'test-doc',
        }),
      );
    });
  });

  describe('buildMergeConfig', () => {
    it('should apply field merge config via handleConflict auto-merge', async () => {
      const onConflict = vi.fn();
      const baseDoc = {
        ...mockDoc,
        priority: 5,
      };

      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          fieldMergeConfig: {
            TestDoc: { priority: 'max' as any },
          },
          onConflict,
          onMutationError: vi.fn(),
        },
      );

      mockNormalizedCache.get.mockReturnValue(baseDoc);

      mockMutationJournal.get.mockReturnValue({
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: { ...baseDoc, priority: 8 },
        operation: Operation.Update,
        version: '2024-01-01T10:00:00',
        status: Status.Pending,
        snapshot: baseDoc,
      });

      mockDb.updateDoc.mockRejectedValueOnce({ status: 409 }).mockResolvedValueOnce({ ...baseDoc, priority: 10 });

      const serverDoc = { ...baseDoc, priority: 10, modified: '2024-01-01T11:00:00' };
      mockDb.getDoc.mockResolvedValue(serverDoc);

      const mutation: UpdateMutation<FrappeDocData> = {
        mutationId: 'merge-test',
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: 'test-doc',
          priority: 8,
        },
        version: '2024-01-01T10:00:00',
        affected: [],
      };

      await expect(mutationEngine.mutate(mutation)).rejects.toEqual({ status: 409 });

      expect(mockDb.updateDoc).toHaveBeenCalledTimes(2);
      const retryCall = mockDb.updateDoc.mock.calls[1][0];
      expect(retryCall.priority).toBe(10); // max(5, 8, 10)

      expect(mockMutationJournal.confirm).toHaveBeenCalledWith('merge-test');
      expect(onConflict).not.toHaveBeenCalled();
    });
  });

  describe('handleConflict auto-merge', () => {
    it('should auto-merge disjoint updates', async () => {
      const onConflict = vi.fn();

      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          onConflict,
          onMutationError: vi.fn(),
        },
      );

      const baseDoc = { ...mockDoc, title: 'Original Title', status: 'Draft' };
      mockNormalizedCache.get.mockReturnValue(baseDoc);

      mockMutationJournal.get.mockReturnValue({
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: { ...baseDoc, title: 'Client Title' },
        operation: Operation.Update,
        version: '2024-01-01T10:00:00',
        status: Status.Pending,
        snapshot: baseDoc,
      });

      mockDb.updateDoc.mockRejectedValueOnce({ status: 409 }).mockResolvedValueOnce({ ...mockDoc });

      const serverDoc = { ...baseDoc, status: 'Approved', modified: '2024-01-01T11:00:00' };
      mockDb.getDoc.mockResolvedValue(serverDoc);

      const mutation: UpdateMutation<FrappeDocData> = {
        mutationId: 'disjoint-test',
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: 'test-doc',
          title: 'Client Title',
        },
        version: '2024-01-01T10:00:00',
        affected: [],
      };

      await expect(mutationEngine.mutate(mutation)).rejects.toEqual({ status: 409 });

      expect(mockDb.updateDoc).toHaveBeenCalledTimes(2);
      const retryCall = mockDb.updateDoc.mock.calls[1][0];
      expect(retryCall.title).toBe('Client Title');
      expect(retryCall.status).toBe('Approved');

      expect(mockMutationJournal.confirm).toHaveBeenCalledWith('disjoint-test');
      expect(onConflict).not.toHaveBeenCalled();
    });

    it('should delegate overlapping conflicts to onConflict', async () => {
      const onConflict = vi.fn();

      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          onConflict,
          onMutationError: vi.fn(),
        },
      );

      const baseDoc = { ...mockDoc, title: 'Original Title' };
      mockNormalizedCache.get.mockReturnValue(baseDoc);

      mockMutationJournal.get.mockReturnValue({
        doctype: 'TestDoc',
        docname: 'test-doc',
        values: { ...baseDoc, title: 'Client Title' },
        operation: Operation.Update,
        version: '2024-01-01T10:00:00',
        status: Status.Pending,
        snapshot: baseDoc,
      });

      mockDb.updateDoc.mockRejectedValue({ status: 409 });

      const serverDoc = { ...baseDoc, title: 'Server Title', modified: '2024-01-01T11:00:00' };
      mockDb.getDoc.mockResolvedValue(serverDoc);

      const mutation: UpdateMutation<FrappeDocData> = {
        mutationId: 'overlap-test',
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: 'test-doc',
          title: 'Client Title',
        },
        version: '2024-01-01T10:00:00',
        affected: [],
      };

      await expect(mutationEngine.mutate(mutation)).rejects.toEqual({ status: 409 });

      expect(onConflict).toHaveBeenCalledWith({
        doctype: 'TestDoc',
        name: 'test-doc',
      });

      expect(mockDb.updateDoc).toHaveBeenCalledOnce();
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry for each pending mutation during replay', async () => {
      const onRetry = vi.fn();

      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          onRetry,
          onReplayStart: vi.fn(),
          onReplayComplete: vi.fn(),
        },
      );

      const pendingEntries = [
        {
          id: 'retry-1',
          entry: {
            doctype: 'TestDoc',
            docname: 'doc-1',
            values: { doctype: 'TestDoc', name: 'doc-1', title: 'Doc 1' },
            operation: Operation.Update,
            version: '2024-01-01T10:00:00',
            status: Status.Pending,
          } as Pending,
        },
        {
          id: 'retry-2',
          entry: {
            doctype: 'TestDoc',
            docname: 'doc-2',
            values: { doctype: 'TestDoc', name: 'doc-2', title: 'Doc 2' },
            operation: Operation.Create,
            version: undefined,
            status: Status.Pending,
          } as Pending,
        },
      ];

      mockMutationJournal.listPending.mockReturnValue(pendingEntries);

      const replayPromise = mutationEngine.replayPending();
      await vi.advanceTimersByTimeAsync(1000);
      await replayPromise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith({ id: 'retry-1', operation: Operation.Update });
      expect(onRetry).toHaveBeenCalledWith({ id: 'retry-2', operation: Operation.Create });
    });
  });

  describe('batch mutations', () => {
    it('should batch mutations and flush after batchDelay', async () => {
      (mockDb as any).batchMutations = vi.fn().mockResolvedValue([
        { success: true, data: { ...mockDoc, name: 'test-doc-1', title: 'Title 1' } },
        { success: true, data: { ...mockDoc, name: 'test-doc-2', title: 'Title 2' } },
        { success: true, data: { ...mockDoc, name: 'test-doc-3', title: 'Title 3' } },
      ]);

      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          enableBatching: true,
          batchDelay: 50,
          batchMaxSize: 10,
        },
      );

      mockNormalizedCache.get.mockImplementation((ref: any) => ({
        ...mockDoc,
        name: ref.name,
        modified: '2024-01-01T10:00:00',
      }));

      const mutations: UpdateMutation<FrappeDocData>[] = [1, 2, 3].map((i) => ({
        mutationId: `batch-${i}`,
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: `test-doc-${i}`,
          title: `Title ${i}`,
        },
        version: '2024-01-01T10:00:00',
        affected: [],
      }));

      const promises = mutations.map(async (m) => await mutationEngine.mutate(m));
      await vi.advanceTimersByTimeAsync(100);
      await Promise.all(promises);

      expect((mockDb as any).batchMutations).toHaveBeenCalledOnce();
      expect((mockDb as any).batchMutations).toHaveBeenCalledWith(
        expect.objectContaining({
          mutations: expect.arrayContaining([
            expect.objectContaining({ type: 'update', doctype: 'TestDoc', name: 'test-doc-1' }),
            expect.objectContaining({ type: 'update', doctype: 'TestDoc', name: 'test-doc-2' }),
            expect.objectContaining({ type: 'update', doctype: 'TestDoc', name: 'test-doc-3' }),
          ]),
        }),
      );
    });

    it('should flush immediately when batchMaxSize is reached and keep remaining pending', async () => {
      (mockDb as any).batchMutations = vi
        .fn()
        .mockResolvedValueOnce([
          { success: true, data: { ...mockDoc, name: 'test-doc-1' } },
          { success: true, data: { ...mockDoc, name: 'test-doc-2' } },
          { success: true, data: { ...mockDoc, name: 'test-doc-3' } },
        ])
        .mockResolvedValueOnce([{ success: true, data: { ...mockDoc, name: 'test-doc-4' } }]);

      mutationEngine = new MutationEngine(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          enableBatching: true,
          batchDelay: 50,
          batchMaxSize: 3,
        },
      );

      mockNormalizedCache.get.mockImplementation((ref: any) => ({
        ...mockDoc,
        name: ref.name,
        modified: '2024-01-01T10:00:00',
      }));

      const mutations: UpdateMutation<FrappeDocData>[] = [1, 2, 3, 4].map((i) => ({
        mutationId: `batch-${i}`,
        operation: Operation.Update,
        doc: {
          doctype: 'TestDoc',
          name: `test-doc-${i}`,
          title: `Title ${i}`,
        },
        version: '2024-01-01T10:00:00',
        affected: [],
      }));

      const promises = mutations.map(async (m) => await mutationEngine.mutate(m));
      await vi.advanceTimersByTimeAsync(100);
      await Promise.all(promises);

      expect((mockDb as any).batchMutations).toHaveBeenCalledTimes(2);
      expect((mockDb as any).batchMutations.mock.calls[0][0].mutations).toHaveLength(3);
      expect((mockDb as any).batchMutations.mock.calls[1][0].mutations).toHaveLength(1);
    });
  });
});

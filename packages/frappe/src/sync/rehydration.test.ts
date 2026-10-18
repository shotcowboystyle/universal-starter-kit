import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeDoc, FrappeDocData } from '../common/types';

import type { Pending } from './mutation-journal';
import { RehydrationManager } from './rehydration';
import { Operation, Order, PendingRehydrationType, RehydrationReason, RehydrationStrategyType, Status } from './types';
import type { Subscription } from './types';

describe(RehydrationManager, () => {
  let rehydrationManager: RehydrationManager;
  let mockDb: any;
  let mockCache: any;
  let mockSubscriptionManager: any;
  let mockMutationJournal: any;

  const mockDoc: FrappeDoc<FrappeDocData> = {
    name: 'test-doc',
    doctype: 'TestDoc',
    title: 'Test Document',
    modified: '2024-01-01T10:00:00',
    creation: '2024-01-01T09:00:00',
    owner: 'test-user',
    modified_by: 'test-user',
  };

  const mockSubscription: Subscription = {
    id: 'sub1',
    query: {
      doctype: 'TestDoc',
      fields: ['*'],
      filters: {},
      orderBy: { field: 'modified', order: Order.Desc },
      limit: 20,
    },
    docIds: ['doc1', 'doc2', 'doc3'],
    checkpoint: 'checkpoint1',
    metadata: {},
    boundaries: {
      firstItem: { ...mockDoc, name: 'doc1' },
      lastItem: { ...mockDoc, name: 'doc3' },
      offset: 0,
      pageSize: 20,
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock database module
    mockDb = {
      getDoc: vi.fn<() => Promise<FrappeDoc<FrappeDocData>>>().mockResolvedValue(mockDoc),
      getDocList: vi.fn<() => Promise<FrappeDoc<FrappeDocData>[]>>().mockResolvedValue([
        { ...mockDoc, name: 'fresh-doc1' },
        { ...mockDoc, name: 'fresh-doc2' },
        { ...mockDoc, name: 'fresh-doc3' },
      ]),
    } as any;

    // Mock normalized cache
    mockCache = {
      upsert: vi.fn<(doc: FrappeDoc<FrappeDocData>) => void>(),
      get: vi.fn<() => FrappeDoc<FrappeDocData>>().mockReturnValue(mockDoc),
      remove: vi.fn<() => void>(),
    } as any;

    // Mock subscription manager
    mockSubscriptionManager = {
      getSubscription: vi.fn<() => Subscription>().mockReturnValue(mockSubscription),
      resortSubscriptionDocIds: vi.fn<(subscription: Subscription) => void>(),
    } as any;

    // Mock mutation journal
    mockMutationJournal = {
      listPending: vi.fn<() => { id: string; entry: Pending }[]>().mockReturnValue([]),
    } as any;

    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset mockSubscription mutable state for test isolation
    mockSubscription.docIds = ['doc1', 'doc2', 'doc3'];
    delete mockSubscription.pendingRehydration;
    mockSubscription.boundaries = {
      firstItem: { ...mockDoc, name: 'doc1' },
      lastItem: { ...mockDoc, name: 'doc3' },
      offset: 0,
      pageSize: 20,
    };
  });

  afterEach(() => {
    // Clean up RehydrationManager if it exists
    // oxlint-disable-next-line typescript/strict-boolean-expressions -- unassigned until a test constructs a manager
    if (rehydrationManager) {
      rehydrationManager.clear();
      rehydrationManager = undefined as any;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize successfully', () => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);

      expect(rehydrationManager).toBeDefined();
    });
  });

  describe('scheduleRehydration', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should schedule rehydration for create operations', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);

      // Advance timer to trigger processing
      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      // No pending creates initially
      expect(mockDb.getDoc).not.toHaveBeenCalled();
    });

    it('should schedule rehydration for delete operations', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      // Advance timer to trigger processing
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['*'],
        filters: {},
        orderBy: { field: 'modified', order: Order.Desc },
        limitStart: 0,
        limit: 20,
      });
    });

    it('should schedule rehydration for remote-create operations', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.RemoteCreate);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith();
    });

    it('should schedule rehydration for overflow operations', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Overflow);

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith();
    });

    it('should schedule rehydration for uncertain operations', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Uncertain);

      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith();
    });

    it('should coalesce multiple requests for same subscription', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);

      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      // Should only process once despite multiple schedule calls
      const queueSize = (rehydrationManager as any).rehydrationQueue.size;
      // Should be cleared after processing
      expect(queueSize).toBe(0);
    });

    it('should upgrade task priority when higher priority task is scheduled', async () => {
      // Schedule low priority task first
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Uncertain);

      // Schedule higher priority task - should upgrade
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      // Should process with delete strategy (500ms delay, not 2000ms)
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith();
    });

    it('should not downgrade task priority', async () => {
      // Schedule high priority task first
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      // Schedule lower priority task - should not downgrade
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Uncertain);

      // Should still use delete strategy timing
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith();
    });
  });

  describe('strategy determination', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should return correct strategy for create', () => {
      const manager = rehydrationManager as any;
      const strategy = manager.determineStrategy(RehydrationReason.Create);

      expect(strategy).toStrictEqual({
        type: RehydrationStrategyType.FetchItemOnly,
        priority: 1,
        delay: 100,
      });
    });

    it('should return correct strategy for remote-create', () => {
      const manager = rehydrationManager as any;
      const strategy = manager.determineStrategy(RehydrationReason.RemoteCreate);

      expect(strategy).toStrictEqual({
        type: RehydrationStrategyType.FullRefresh,
        priority: 2,
        delay: 500,
      });
    });

    it('should return correct strategy for delete', () => {
      const manager = rehydrationManager as any;
      const strategy = manager.determineStrategy(RehydrationReason.Delete);

      expect(strategy).toStrictEqual({
        type: RehydrationStrategyType.FullRefresh,
        priority: 3,
        delay: 500,
      });
    });

    it('should return correct strategy for overflow', () => {
      const manager = rehydrationManager as any;
      const strategy = manager.determineStrategy(RehydrationReason.Overflow);

      expect(strategy).toStrictEqual({
        type: RehydrationStrategyType.FullRefresh,
        priority: 2,
        delay: 1000,
      });
    });

    it('should return correct strategy for uncertain', () => {
      const manager = rehydrationManager as any;
      const strategy = manager.determineStrategy(RehydrationReason.Uncertain);

      expect(strategy).toStrictEqual({
        type: RehydrationStrategyType.FullRefresh,
        priority: 1,
        delay: 2000,
      });
    });

    it('should return default strategy for unknown reason', () => {
      const manager = rehydrationManager as any;
      const strategy = manager.determineStrategy('unknown' as RehydrationReason);

      expect(strategy).toStrictEqual({
        type: RehydrationStrategyType.FullRefresh,
        priority: 1,
        delay: 1000,
      });
    });
  });

  describe('processing queue', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should process tasks in priority order', async () => {
      const calls: string[] = [];

      // Create multiple subscriptions to track order
      const sub1 = { ...mockSubscription, id: 'sub1' };
      const sub2 = { ...mockSubscription, id: 'sub2' };
      const sub3 = { ...mockSubscription, id: 'sub3' };

      mockSubscriptionManager.getSubscription.mockImplementation((id: string) => {
        if (id === 'sub1') {
          return sub1;
        }
        if (id === 'sub2') {
          return sub2;
        }
        if (id === 'sub3') {
          return sub3;
        }
        return null;
      });

      mockDb.getDocList.mockImplementation(async (doctype) => {
        calls.push(doctype);
        return [];
      });

      // Schedule tasks with different priorities
      // Priority 1
      rehydrationManager.scheduleRehydration(sub1, RehydrationReason.Uncertain);
      // Priority 3
      rehydrationManager.scheduleRehydration(sub2, RehydrationReason.Delete);
      // Priority 2
      rehydrationManager.scheduleRehydration(sub3, RehydrationReason.Overflow);

      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();

      // Should process in order: delete (3), overflow (2), uncertain (1)
      expect(calls).toStrictEqual(['TestDoc', 'TestDoc', 'TestDoc']);
    });

    it('should handle processing errors gracefully', async () => {
      mockDb.getDocList.mockRejectedValue(new Error('Network error'));

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Rehydration failed for sub1'),
        expect.any(Error),
      );
    });

    it('should clear pending rehydration flag after successful execution', async () => {
      mockSubscription.pendingRehydration = PendingRehydrationType.FullRefresh;

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockSubscription.pendingRehydration).toBeUndefined();
    });

    it('should skip processing for non-existent subscriptions', async () => {
      mockSubscriptionManager.getSubscription.mockReturnValue(null);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).not.toHaveBeenCalled();
    });
  });

  describe('fetch optimistic items', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should fetch items with registered temp ID mappings', async () => {
      // Register a temp ID mapping
      rehydrationManager.registerTempIdMapping('temp-123', 'TASK-001');

      // Mock pending creates
      const pendingCreate: Pending = {
        doctype: 'TestDoc',
        docname: 'temp-123',
        values: { title: 'New Task' } as any,
        operation: Operation.Create,
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut1', entry: pendingCreate }]);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);

      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      expect(mockDb.getDoc).toHaveBeenCalledWith('TestDoc', 'TASK-001');
      expect(mockCache.upsert).toHaveBeenCalledWith(mockDoc);
    });

    it('should skip items without temp ID mappings', async () => {
      const pendingCreate: Pending = {
        doctype: 'TestDoc',
        docname: 'temp-456',
        values: { title: 'New Task' } as any,
        operation: Operation.Create,
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut2', entry: pendingCreate }]);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);

      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      expect(mockDb.getDoc).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      rehydrationManager.registerTempIdMapping('temp-789', 'TASK-002');

      const pendingCreate: Pending = {
        doctype: 'TestDoc',
        docname: 'temp-789',
        values: { title: 'New Task' } as any,
        operation: Operation.Create,
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut3', entry: pendingCreate }]);

      mockDb.getDoc.mockRejectedValue(new Error('Document not found'));

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);

      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch TASK-002'),
        expect.any(Error),
      );
    });

    it('should skip items without docname', async () => {
      const pendingCreate: Pending = {
        doctype: 'TestDoc',
        values: { title: 'New Task' } as any,
        operation: Operation.Create,
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut4', entry: pendingCreate }]);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);

      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      expect(mockDb.getDoc).not.toHaveBeenCalled();
    });
  });

  describe('full page refresh', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should perform full refresh with subscription parameters', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['*'],
        filters: {},
        orderBy: { field: 'modified', order: Order.Desc },
        limitStart: 0,
        limit: 20,
      });
    });

    it('should use subscription boundaries for pagination', async () => {
      const subWithBoundaries = {
        ...mockSubscription,
        boundaries: {
          ...mockSubscription.boundaries!,
          offset: 40,
          pageSize: 25,
        },
      };

      mockSubscriptionManager.getSubscription.mockReturnValue(subWithBoundaries);

      rehydrationManager.scheduleRehydration(subWithBoundaries, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['*'],
        filters: {},
        orderBy: { field: 'modified', order: Order.Desc },
        limitStart: 40,
        limit: 25,
      });
    });

    it('should fall back to query parameters when boundaries missing', async () => {
      const subWithoutBoundaries = {
        ...mockSubscription,
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- clears the boundaries inherited from the spread base
        boundaries: undefined,
        query: {
          ...mockSubscription.query,
          limitStart: 10,
          limit: 15,
        },
      };

      mockSubscriptionManager.getSubscription.mockReturnValue(subWithoutBoundaries);

      rehydrationManager.scheduleRehydration(subWithoutBoundaries, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith('TestDoc', {
        fields: ['*'],
        filters: {},
        orderBy: { field: 'modified', order: Order.Desc },
        limitStart: 10,
        limit: 15,
      });
    });

    it('should update subscription boundaries after refresh', async () => {
      const freshDocs = [
        { ...mockDoc, name: 'fresh-doc1' },
        { ...mockDoc, name: 'fresh-doc2' },
        { ...mockDoc, name: 'fresh-doc3' },
      ];

      mockDb.getDocList.mockResolvedValue(freshDocs);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockSubscription.boundaries).toStrictEqual({
        firstItem: { ...freshDocs[0], doctype: 'TestDoc' },
        lastItem: { ...freshDocs[2], doctype: 'TestDoc' },
        offset: 0,
        pageSize: 20,
      });
    });

    it('should handle empty results', async () => {
      mockDb.getDocList.mockResolvedValue([]);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockSubscription.boundaries).toStrictEqual({
        firstItem: { ...mockDoc, name: 'doc1' },
        lastItem: { ...mockDoc, name: 'doc3' },
        offset: 0,
        pageSize: 20,
      });
    });

    it('should handle refresh errors', async () => {
      mockDb.getDocList.mockRejectedValue(new Error('Server error'));

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Full refresh failed for sub1'),
        expect.any(Error),
      );
    });
  });

  describe('reconciliation', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should reconcile server state with pending updates', async () => {
      const serverDocs = [
        { name: 'doc1', title: 'Server Title 1' },
        { name: 'doc2', title: 'Server Title 2' },
      ];

      const pendingUpdate: Pending = {
        doctype: 'TestDoc',
        docname: 'doc1',
        values: { title: 'Optimistic Title 1' } as any,
        operation: Operation.Update,
        status: Status.Pending,
      };

      mockDb.getDocList.mockResolvedValue(serverDocs);
      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut1', entry: pendingUpdate }]);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      // Should merge server state with optimistic updates
      expect(mockCache.upsert).toHaveBeenCalledWith({
        name: 'doc1',
        // Optimistic value should win
        title: 'Optimistic Title 1',
        doctype: 'TestDoc',
      });

      expect(mockCache.upsert).toHaveBeenCalledWith({
        name: 'doc2',
        // No pending update, use server value
        title: 'Server Title 2',
        doctype: 'TestDoc',
      });
    });

    it('should include pending creates in reconciliation', async () => {
      const serverDocs = [{ name: 'doc1', title: 'Server Title 1' }];

      const pendingCreate: Pending = {
        doctype: 'TestDoc',
        docname: 'temp-123',
        values: { title: 'Optimistic Create' } as any,
        operation: Operation.Create,
        status: Status.Pending,
      };

      mockDb.getDocList.mockResolvedValue(serverDocs);
      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut2', entry: pendingCreate }]);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockSubscription.docIds).toContain('temp-123');
      expect(mockSubscription.docIds).toContain('doc1');
    });

    it('should exclude pending deletes from reconciliation', async () => {
      const serverDocs = [
        { name: 'doc1', title: 'Server Title 1' },
        { name: 'doc2', title: 'Server Title 2' },
      ];

      const pendingDelete: Pending = {
        doctype: 'TestDoc',
        docname: 'doc1',
        operation: Operation.Delete,
        status: Status.Pending,
      };

      mockDb.getDocList.mockResolvedValue(serverDocs);
      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut3', entry: pendingDelete }]);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockSubscription.docIds).not.toContain('doc1');
      expect(mockSubscription.docIds).toContain('doc2');
    });

    it('should resort subscription doc IDs after reconciliation', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockSubscriptionManager.resortSubscriptionDocIds).toHaveBeenCalledWith(mockSubscription);
    });
  });

  describe('temporary ID management', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should register temp ID mappings', () => {
      rehydrationManager.registerTempIdMapping('temp-123', 'TASK-001');
      rehydrationManager.registerTempIdMapping('temp-456', 'TASK-002');

      const tempMap = (rehydrationManager as any).temporaryIdMap;
      expect(tempMap.get('temp-123')).toBe('TASK-001');
      expect(tempMap.get('temp-456')).toBe('TASK-002');
    });

    it('should use registered mappings during fetch', async () => {
      rehydrationManager.registerTempIdMapping('temp-789', 'TASK-003');

      const pendingCreate: Pending = {
        doctype: 'TestDoc',
        docname: 'temp-789',
        values: { title: 'New Task' } as any,
        operation: Operation.Create,
        status: Status.Pending,
      };

      mockMutationJournal.listPending.mockReturnValue([{ id: 'mut5', entry: pendingCreate }]);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);

      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      expect(mockDb.getDoc).toHaveBeenCalledWith('TestDoc', 'TASK-003');
    });
  });

  describe('queue management', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should clear the rehydration queue', () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      const queueSize = (rehydrationManager as any).rehydrationQueue.size;
      expect(queueSize).toBeGreaterThan(0);

      rehydrationManager.clear();

      const clearedQueueSize = (rehydrationManager as any).rehydrationQueue.size;
      expect(clearedQueueSize).toBe(0);
    });

    it('should clear processing timer when clearing queue', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);

      // Clearing should cancel any pending processing
      rehydrationManager.clear();

      // Timer should be cancelled - advancing time should not trigger processing
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).not.toHaveBeenCalled();
    });

    it('should handle clear when no timer is set', () => {
      expect(() => {
        rehydrationManager.clear();
      }).not.toThrow();
    });
  });

  describe('debouncing', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should debounce multiple schedule calls', async () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      // Should only call getDocList once despite multiple schedules
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledOnce();
    });

    it('should reset timer when new tasks are scheduled', () => {
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      // Advance time partially
      vi.advanceTimersByTime(200);

      // Schedule another task - should reset the timer
      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Create);

      // Advance by the remaining time of the first timer
      vi.advanceTimersByTime(300);

      // Should not have processed yet since timer was reset
      expect(mockDb.getDocList).not.toHaveBeenCalled();

      // Advance by the new delay
      vi.advanceTimersByTime(200);

      expect(mockDb.getDocList).toHaveBeenCalledWith();
    });
  });

  describe('error handling and edge cases', () => {
    beforeEach(() => {
      rehydrationManager = new RehydrationManager(mockDb, mockCache, mockSubscriptionManager, mockMutationJournal);
    });

    it('should handle missing subscription gracefully', async () => {
      mockSubscriptionManager.getSubscription.mockReturnValue(null);

      rehydrationManager.scheduleRehydration(mockSubscription, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).not.toHaveBeenCalled();
    });

    it('should handle tasks with different scheduleAt times', async () => {
      const sub1 = { ...mockSubscription, id: 'sub1' };
      const sub2 = { ...mockSubscription, id: 'sub2' };

      mockSubscriptionManager.getSubscription.mockImplementation((id: string) => {
        if (id === 'sub1') {
          return sub1;
        }
        if (id === 'sub2') {
          return sub2;
        }
        return null;
      });

      // Schedule tasks at different times but same priority
      rehydrationManager.scheduleRehydration(sub1, RehydrationReason.Uncertain);

      // Advance time
      vi.advanceTimersByTime(100);

      rehydrationManager.scheduleRehydration(sub2, RehydrationReason.Uncertain);

      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();

      // Should process sub1 first (earlier scheduled time)
      expect(mockDb.getDocList).toHaveBeenCalledTimes(2);
    });

    it('should handle processing when queue becomes empty', async () => {
      const manager = rehydrationManager as any;

      // Manually clear queue before processing
      manager.rehydrationQueue.clear();

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // Should not throw or fail
      expect(mockDb.getDocList).not.toHaveBeenCalled();
    });

    it('should handle subscription boundaries edge cases', async () => {
      const subWithPartialBoundaries = {
        ...mockSubscription,
        boundaries: {
          lastItem: { ...mockDoc, name: 'doc3' },
          offset: 0,
          pageSize: 20,
        },
      };

      mockSubscriptionManager.getSubscription.mockReturnValue(subWithPartialBoundaries);

      rehydrationManager.scheduleRehydration(subWithPartialBoundaries, RehydrationReason.Delete);

      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(mockDb.getDocList).toHaveBeenCalledWith();
    });
  });
});

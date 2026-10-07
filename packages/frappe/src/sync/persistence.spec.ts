import type { MockedObject } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MutationEngine } from './mutationEngine';
import type { MutationJournal } from './mutationJournal';
import type { NormalizedCache } from './normalizedCache';
import { PersistenceManager } from './persistence';
import { IndexedDBKV, PlatformStorageKV } from './storage';
import type { SubscriptionManager } from './subscriptionManager';
import { Operation, Status } from './types';
import type { SyncOptions } from './types';

// Mock storage classes - must use function expressions, not arrow functions
vi.mock(import('./storage'), () => ({
  PlatformStorageKV: vi.fn().mockImplementation(function PlatformStorageKV(this: any) {
    this.getItem = vi.fn().mockResolvedValue(null);
    this.setItem = vi.fn().mockResolvedValue();
    this.removeItem = vi.fn().mockResolvedValue();
    return this;
  }),
  IndexedDBKV: vi.fn().mockImplementation(function IndexedDBKV(this: any) {
    this.getItem = vi.fn().mockResolvedValue(null);
    this.setItem = vi.fn().mockResolvedValue();
    this.removeItem = vi.fn().mockResolvedValue();
    return this;
  }),
}));

describe(PersistenceManager, () => {
  let persistenceManager: PersistenceManager;
  let mockNormalizedCache: MockedObject<NormalizedCache>;
  let mockMutationJournal: MockedObject<MutationJournal>;
  let mockSubscriptionManager: MockedObject<SubscriptionManager>;
  let mockMutationEngine: MockedObject<MutationEngine>;
  let mockStorage: any;
  let mockBroadcastChannel: any;
  let mockLocalStorage: any;
  let mockDocument: any;

  beforeEach(() => {
    // Reset module-level mock call counts (PlatformStorageKV, IndexedDBKV)
    vi.clearAllMocks();
    // Reset all timers
    vi.useFakeTimers();

    // Mock storage
    mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(),
      removeItem: vi.fn().mockResolvedValue(),
    };

    // Mock BroadcastChannel - must use function expression, not arrow function
    mockBroadcastChannel = {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: null,
    };
    (global as any).BroadcastChannel = vi.fn().mockImplementation(() => mockBroadcastChannel);

    // Mock localStorage
    mockLocalStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Mock document
    mockDocument = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(global, 'document', {
      value: mockDocument,
      writable: true,
    });

    // Mock indexedDB availability
    Object.defineProperty(global, 'indexedDB', {
      value: {},
      writable: true,
    });

    // Mock window
    Object.defineProperty(global, 'window', {
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      writable: true,
    });

    // Mock dependencies
    mockNormalizedCache = {
      state: { docs: {}, pages: {} },
      get: vi.fn().mockReturnValue(),
      upsert: vi.fn(),
    } as any;

    mockMutationJournal = {
      listPending: vi.fn().mockReturnValue([]),
      add: vi.fn(),
    } as any;

    mockSubscriptionManager = {
      getAllSubscriptions: vi.fn().mockReturnValue(new Map()),
      restoreSubscription: vi.fn(),
      gcRestoredSubscriptions: vi.fn(),
    } as any;

    mockMutationEngine = {
      getTemporaryIdToRealNameMap: vi.fn().mockReturnValue(new Map()),
    } as any;

    // Mock console methods
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up PersistenceManager if it exists
    if (persistenceManager) {
      persistenceManager.destroy();
      persistenceManager = undefined as any;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    (global as any).BroadcastChannel = undefined;
    (global as any).localStorage = undefined;
    (global as any).document = undefined;
    (global as any).indexedDB = undefined;
    (global as any).window = undefined;
  });

  describe('constructor and initialization', () => {
    it('should initialize without persistence when no persistKey provided', () => {
      const options: SyncOptions = {};

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      expect(PlatformStorageKV).not.toHaveBeenCalled();
      expect(IndexedDBKV).not.toHaveBeenCalled();
    });

    it('should initialize with IndexedDB when available', () => {
      const options: SyncOptions = {
        persistKey: 'test-key',
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      expect(IndexedDBKV).toHaveBeenCalledWith();
    });

    it('should fallback to PlatformStorageKV when IndexedDB not available', () => {
      (global as any).indexedDB = undefined;

      const options: SyncOptions = {
        persistKey: 'test-key',
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      expect(PlatformStorageKV).toHaveBeenCalledWith();
    });

    it('should use provided storage when specified', () => {
      const options: SyncOptions = {
        persistKey: 'test-key',
        storage: mockStorage,
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      expect(PlatformStorageKV).not.toHaveBeenCalled();
      expect(IndexedDBKV).not.toHaveBeenCalled();
    });

    it('should setup BroadcastChannel when persistKey provided', () => {
      const options: SyncOptions = {
        persistKey: 'test-key',
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      expect(global.BroadcastChannel).toHaveBeenCalledWith('frappe-sync:test-key');
    });

    it('should not setup BroadcastChannel when not available', () => {
      (global as any).BroadcastChannel = undefined;

      const options: SyncOptions = {
        persistKey: 'test-key',
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      // Should not throw
      expect(persistenceManager).toBeDefined();
    });

    it('should setup tab coordination with default config', () => {
      const options: SyncOptions = {
        persistKey: 'test-key',
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      expect(mockDocument.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    it('should not setup tab coordination when disabled', () => {
      const options: SyncOptions = {
        persistKey: 'test-key',
        tabCoordination: {
          activeTabPriority: false,
        },
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      expect(mockDocument.addEventListener).not.toHaveBeenCalled();
    });

    it('should use custom tab coordination config', () => {
      const options: SyncOptions = {
        persistKey: 'test-key',
        tabCoordination: {
          activeTabPriority: true,
          leaderTimeout: 10_000,
          handoffGracePeriod: 3000,
        },
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      // Should initialize with custom config
      expect(persistenceManager).toBeDefined();
    });
  });

  describe('persistence operations', () => {
    beforeEach(() => {
      const options: SyncOptions = {
        persistKey: 'test-key',
        storage: mockStorage,
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );
    });

    describe('scheduleSave', () => {
      it('should schedule a debounced save operation', () => {
        persistenceManager.scheduleSave();

        // Should not save immediately
        expect(mockStorage.setItem).not.toHaveBeenCalled();

        // Advance timer
        vi.advanceTimersByTime(50);

        expect(mockStorage.setItem).toHaveBeenCalledWith('test-key', expect.any(String));
      });

      it('should debounce multiple scheduleSave calls', () => {
        persistenceManager.scheduleSave();
        persistenceManager.scheduleSave();
        persistenceManager.scheduleSave();

        vi.advanceTimersByTime(50);

        // Should only save once
        expect(mockStorage.setItem).toHaveBeenCalledOnce();
      });

      it('should not schedule save without persistKey', () => {
        const options: SyncOptions = {};
        const pm = new PersistenceManager(
          mockNormalizedCache,
          mockMutationJournal,
          mockSubscriptionManager,
          mockMutationEngine,
          options,
        );

        pm.scheduleSave();
        vi.advanceTimersByTime(50);

        expect(mockStorage.setItem).not.toHaveBeenCalled();
      });
    });

    describe('save', () => {
      it('should save complete snapshot', async () => {
        const mockSubscriptions = new Map([
          [
            'sub1',
            {
              id: 'sub1',
              query: { doctype: 'User' },
              checkpoint: 'checkpoint1',
              docIds: ['user1', 'user2'],
            },
          ],
        ]);

        const mockJournalEntries = [
          {
            id: 'entry1',
            entry: {
              doctype: 'TestDoc',
              operation: Operation.Create,
              status: Status.Pending,
              values: { doctype: 'TestDoc', name: 'test1' },
            },
          },
        ];

        const mockTempMappings = new Map([['temp1', 'real1']]);

        mockSubscriptionManager.getAllSubscriptions.mockReturnValue(mockSubscriptions);
        mockMutationJournal.listPending.mockReturnValue(mockJournalEntries);
        mockMutationEngine.getTemporaryIdToRealNameMap.mockReturnValue(mockTempMappings);

        persistenceManager.scheduleSave();
        vi.advanceTimersByTime(50);

        const savedData = JSON.parse(mockStorage.setItem.mock.calls[0][1]);

        expect(savedData).toEqual({
          subs: [
            {
              id: 'sub1',
              query: { doctype: 'User' },
              checkpoint: 'checkpoint1',
              docIds: ['user1', 'user2'],
            },
          ],
          cache: mockNormalizedCache.state,
          journal: mockJournalEntries,
          temp: [['temp1', 'real1']],
        });
      });

      it('should handle save errors gracefully', async () => {
        mockStorage.setItem.mockRejectedValue(new Error('Save failed'));

        persistenceManager.scheduleSave();
        vi.advanceTimersByTime(50);

        // Should not throw
        await vi.advanceTimersByTimeAsync(100);

        expect(console.warn).toHaveBeenCalledWith('Failed to save sync state:', expect.any(Error));
      });
    });

    describe('load', () => {
      it('should load and restore persisted state', async () => {
        const cachedUser = { doctype: 'User', name: 'user1', full_name: 'User 1' };
        const persistedState = {
          subs: [
            {
              id: 'sub1',
              query: { doctype: 'User' },
              checkpoint: 'checkpoint1',
              docIds: ['user1', 'user2'],
            },
          ],
          cache: { User: { byId: { user1: cachedUser }, allIds: ['user1'] } },
          journal: [{ id: 'entry1', entry: { type: 'create' } }],
          temp: [['temp1', 'real1']],
        };

        mockStorage.getItem.mockResolvedValue(JSON.stringify(persistedState));

        const tempMap = new Map();
        mockMutationEngine.getTemporaryIdToRealNameMap.mockReturnValue(tempMap);

        // Create new instance to trigger load
        new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
          persistKey: 'test-key',
          storage: mockStorage,
        });

        await vi.advanceTimersByTimeAsync(100);

        // Verify cached docs were merged in per-doc (not wholesale replace)
        expect(mockNormalizedCache.upsert).toHaveBeenCalledWith(cachedUser, { replace: true });

        // Verify subscriptions were restored as dormant restored entries
        expect(mockSubscriptionManager.restoreSubscription).toHaveBeenCalledWith(persistedState.subs[0]);

        // Verify journal was restored
        expect(mockMutationJournal.add).toHaveBeenCalledWith('entry1', {
          type: 'create',
        });

        // Verify temp mappings were restored
        expect(tempMap.get('temp1')).toBe('real1');
      });

      it('should not clobber docs already in memory when merging the snapshot cache', async () => {
        const snapshotDoc = { doctype: 'User', name: 'user1', full_name: 'Old Name' };
        mockStorage.getItem.mockResolvedValue(
          JSON.stringify({
            cache: { User: { byId: { user1: snapshotDoc }, allIds: ['user1'] } },
          }),
        );
        // Doc already exists in memory (e.g. optimistic write raced the load)
        mockNormalizedCache.get.mockReturnValue({
          doctype: 'User',
          name: 'user1',
          full_name: 'Newer Name',
        });

        new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
          persistKey: 'test-key',
          storage: mockStorage,
        });

        await vi.advanceTimersByTimeAsync(100);

        expect(mockNormalizedCache.upsert).not.toHaveBeenCalled();
      });

      it('should handle missing persisted state', async () => {
        mockStorage.getItem.mockResolvedValue(null);

        new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
          persistKey: 'test-key',
          storage: mockStorage,
        });

        await vi.advanceTimersByTimeAsync(100);

        // Should not modify state
        expect(mockMutationJournal.add).not.toHaveBeenCalled();
      });

      it('should handle corrupted persisted state', async () => {
        mockStorage.getItem.mockResolvedValue('invalid json');

        new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
          persistKey: 'test-key',
          storage: mockStorage,
        });

        await vi.advanceTimersByTimeAsync(100);

        expect(console.warn).toHaveBeenCalledWith('Failed to load sync state:', expect.any(Error));
      });

      it('should handle load errors gracefully', async () => {
        mockStorage.getItem.mockRejectedValue(new Error('Load failed'));

        new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
          persistKey: 'test-key',
          storage: mockStorage,
        });

        await vi.advanceTimersByTimeAsync(100);

        expect(console.warn).toHaveBeenCalledWith('Failed to load sync state:', expect.any(Error));
      });
    });
  });

  describe('BroadcastChannel operations', () => {
    beforeEach(() => {
      const options: SyncOptions = {
        persistKey: 'test-key',
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );
    });

    it('should handle reset message', () => {
      const onResetCache = vi.fn();
      const options: SyncOptions = {
        persistKey: 'test-key',
        onResetCache,
      };

      const _pm = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      // Simulate reset message
      mockBroadcastChannel.onmessage({ data: 'reset' });

      expect(onResetCache).toHaveBeenCalledWith();
    });

    it('should handle backfill message', () => {
      const onBackfillAll = vi.fn();
      const options: SyncOptions = {
        persistKey: 'test-key',
        onBackfillAll,
      };

      const _pm = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );

      // Simulate backfill message
      mockBroadcastChannel.onmessage({ data: 'backfill' });

      expect(onBackfillAll).toHaveBeenCalledWith();
    });

    it('should broadcast reset message', () => {
      persistenceManager.broadcastReset();

      expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith('reset');
    });

    it('should broadcast backfill message', () => {
      persistenceManager.broadcastBackfill();

      expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith('backfill');
    });

    it('should broadcast change message', () => {
      persistenceManager.broadcastChange();

      expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith('changed');
    });
  });

  describe('tab coordination', () => {
    beforeEach(() => {
      const options: SyncOptions = {
        persistKey: 'test-key',
        tabCoordination: {
          activeTabPriority: true,
          leaderTimeout: 5000,
          handoffGracePeriod: 2000,
        },
      };

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        options,
      );
    });

    it('should become leader when no existing leader', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      // Should attempt to become leader during initialization
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'frappe-sync-leader',
        expect.stringContaining('"tabId":"tab-'),
      );
    });

    it('should not become leader when active leader exists', () => {
      const activeLeader = {
        tabId: 'other-tab',
        timestamp: Date.now(),
        visibilityState: 'visible',
        lastVisibilityChange: Date.now(),
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(activeLeader));

      // Clear any calls from initialization
      mockLocalStorage.setItem.mockClear();

      // Create new instance
      new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
        persistKey: 'test-key',
        tabCoordination: { activeTabPriority: true },
      });

      // Should not set leader immediately
      expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith('frappe-sync-leader', expect.any(String));
    });

    it('should take over leadership from expired leader', () => {
      const expiredLeader = {
        tabId: 'expired-tab',
        timestamp: Date.now() - 10_000, // 10 seconds ago
        visibilityState: 'visible',
        lastVisibilityChange: Date.now() - 10_000,
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(expiredLeader));

      // Should become leader due to expiration
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'frappe-sync-leader',
        expect.stringContaining('"tabId":"tab-'),
      );
    });

    it('should handle visibility changes', () => {
      // Mock initial visible state
      mockDocument.hidden = false;

      // Get the visibility change handler
      const visibilityHandler = mockDocument.addEventListener.mock.calls.find(
        (call) => call[0] === 'visibilitychange',
      )?.[1];

      expect(visibilityHandler).toBeDefined();

      // Simulate tab becoming hidden
      mockDocument.hidden = true;
      visibilityHandler();

      // Simulate tab becoming visible again
      mockDocument.hidden = false;
      visibilityHandler();

      // Should have handled visibility changes
      expect(visibilityHandler).toBeDefined();
    });

    it('should handle localStorage unavailability', () => {
      (global as any).localStorage = undefined;

      // Should not throw when localStorage is unavailable
      expect(() => {
        new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
          persistKey: 'test-key',
          tabCoordination: { activeTabPriority: true },
        });
      }).not.toThrow();
    });

    it('should call leadership callbacks', () => {
      const onBecomeLeader = vi.fn();
      const onLoseLeadership = vi.fn();

      mockLocalStorage.getItem.mockReturnValue(null);

      new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
        persistKey: 'test-key',
        tabCoordination: { activeTabPriority: true },
        onBecomeLeader,
        onLoseLeadership,
      });

      expect(onBecomeLeader).toHaveBeenCalledWith();
    });
  });

  describe('operation tracking', () => {
    beforeEach(() => {
      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        { persistKey: 'test-key' },
      );
    });

    it('should track and untrack operations', async () => {
      const operation = Promise.resolve('result');

      const trackedOperation = persistenceManager.trackOperation(operation);

      expect(trackedOperation).toBe(operation);

      // Wait for operation to complete
      await trackedOperation;

      // Operation should be removed from tracking
      expect(trackedOperation).resolves.toBe('result');
    });

    it('should track rejected operations', async () => {
      const operation = Promise.reject(new Error('Operation failed'));

      const trackedOperation = persistenceManager.trackOperation(operation);

      await expect(trackedOperation).rejects.toThrow('Operation failed');
    });
  });

  describe('getIsLeader', () => {
    it('should return current leadership status', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        { persistKey: 'test-key' },
      );

      // Should become leader initially
      expect(persistenceManager.getIsLeader()).toBe(true);
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        { persistKey: 'test-key' },
      );
    });

    it('should clean up timers and channels', () => {
      persistenceManager.scheduleSave();
      persistenceManager.destroy();

      // Advance timer - should not trigger save after destroy
      vi.advanceTimersByTime(50);

      expect(mockBroadcastChannel.close).toHaveBeenCalledWith();
    });

    it('should handle destroy without active resources', () => {
      const pm = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        {},
      );

      expect(() => {
        pm.destroy();
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle BroadcastChannel constructor errors', () => {
      (global.BroadcastChannel as any).mockImplementation(() => {
        throw new Error('BroadcastChannel failed');
      });

      expect(() => {
        new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
          persistKey: 'test-key',
        });
      }).not.toThrow();
    });

    it('should handle localStorage setItem errors', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      expect(() => {
        new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
          persistKey: 'test-key',
          tabCoordination: { activeTabPriority: true },
        });
      }).not.toThrow();

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update leader timestamp'),
        expect.any(Error),
      );
    });

    it('should handle localStorage getItem errors', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      expect(() => {
        new PersistenceManager(mockNormalizedCache, mockMutationJournal, mockSubscriptionManager, mockMutationEngine, {
          persistKey: 'test-key',
          tabCoordination: { activeTabPriority: true },
        });
      }).not.toThrow();
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      persistenceManager = new PersistenceManager(
        mockNormalizedCache,
        mockMutationJournal,
        mockSubscriptionManager,
        mockMutationEngine,
        { persistKey: 'test-key' },
      );
    });

    it('should handle malformed broadcast messages', () => {
      expect(() => {
        mockBroadcastChannel.onmessage({ data: null });
        mockBroadcastChannel.onmessage({ data: undefined });
        mockBroadcastChannel.onmessage({});
        mockBroadcastChannel.onmessage(null);
      }).not.toThrow();
    });
  });
});

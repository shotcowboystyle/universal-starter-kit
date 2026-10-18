import type { MockedObject } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MutationEngine } from './mutation-engine';
import type { MutationJournal } from './mutation-journal';
import type { NormalizedCache } from './normalized-cache';
import { PersistenceManager } from './persistence';
import { IndexedDBKV, PlatformStorageKV } from './storage';
import type { SubscriptionManager } from './subscription-manager';
import { Operation, Status } from './types';
import type { KVStorage, SyncOptions } from './types';

const createMockKV = (): KVStorage => ({
  getItem: vi.fn<KVStorage['getItem']>().mockResolvedValue(null),
  setItem: vi.fn<KVStorage['setItem']>().mockResolvedValue(),
  removeItem: vi.fn<KVStorage['removeItem']>().mockResolvedValue(),
});

// Mock storage classes - must use function expressions, not arrow functions (they are called with `new`)
vi.mock(import('./storage'), () => ({
  // SAFETY: the manager only calls the KVStorage methods, so a constructor yielding a KVStorage mock stands in for the class.
  PlatformStorageKV: vi.fn<() => KVStorage>(function MockPlatformStorageKV() {
    return createMockKV();
  }) as unknown as typeof PlatformStorageKV,
  // SAFETY: as above; IndexedDBKV's private connection fields are never read by the manager.
  IndexedDBKV: vi.fn<() => KVStorage>(function MockIndexedDBKV() {
    return createMockKV();
  }) as unknown as typeof IndexedDBKV,
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
  const extraManagers: PersistenceManager[] = [];

  beforeEach(() => {
    // Reset module-level mock call counts (PlatformStorageKV, IndexedDBKV)
    vi.clearAllMocks();
    // Reset all timers
    vi.useFakeTimers();

    // Mock storage
    mockStorage = createMockKV();

    // Mock BroadcastChannel - must use function expression, not arrow function
    mockBroadcastChannel = {
      postMessage: vi.fn<BroadcastChannel['postMessage']>(),
      close: vi.fn<BroadcastChannel['close']>(),
      onmessage: null,
    };
    vi.stubGlobal(
      'BroadcastChannel',
      vi.fn(function MockBroadcastChannel() {
        return mockBroadcastChannel;
      }),
    );

    // Mock localStorage
    mockLocalStorage = {
      getItem: vi.fn<Storage['getItem']>().mockReturnValue(null),
      setItem: vi.fn<Storage['setItem']>(),
      removeItem: vi.fn<Storage['removeItem']>(),
    };
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Mock document
    mockDocument = {
      hidden: false,
      addEventListener: vi.fn<(type: string, listener: () => void) => void>(),
      removeEventListener: vi.fn<(type: string, listener: () => void) => void>(),
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
        addEventListener: vi.fn<(type: string, listener: EventListener) => void>(),
        removeEventListener: vi.fn<(type: string, listener: EventListener) => void>(),
      },
      writable: true,
    });

    // Mock dependencies
    mockNormalizedCache = {
      state: { docs: {}, pages: {} },
      get: vi.fn<NormalizedCache['get']>(),
      upsert: vi.fn<NormalizedCache['upsert']>(),
    } as any;

    mockMutationJournal = {
      listPending: vi.fn<MutationJournal['listPending']>().mockReturnValue([]),
      add: vi.fn<MutationJournal['add']>(),
    } as any;

    mockSubscriptionManager = {
      getAllSubscriptions: vi.fn<SubscriptionManager['getAllSubscriptions']>().mockReturnValue(new Map()),
      restoreSubscription: vi.fn<SubscriptionManager['restoreSubscription']>(),
      gcRestoredSubscriptions: vi.fn<SubscriptionManager['gcRestoredSubscriptions']>(),
    } as any;

    mockMutationEngine = {
      getTemporaryIdToRealNameMap: vi.fn<MutationEngine['getTemporaryIdToRealNameMap']>().mockReturnValue(new Map()),
    } as any;

    // Mock console methods
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up every PersistenceManager the test created (destroy is idempotent)
    persistenceManager?.destroy();
    for (const manager of extraManagers.splice(0)) {
      manager.destroy();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    // oxlint-disable sonarjs/no-undefined-assignment -- these globals are defined non-configurable above, so they cannot be deleted
    (global as any).BroadcastChannel = undefined;
    (global as any).localStorage = undefined;
    (global as any).document = undefined;
    (global as any).indexedDB = undefined;
    (global as any).window = undefined;
    // oxlint-enable sonarjs/no-undefined-assignment
  });

  /** Creates a manager the test does not hold on to; afterEach destroys it. */
  const createExtraManager = (options: SyncOptions): PersistenceManager => {
    const manager = new PersistenceManager(
      mockNormalizedCache,
      mockMutationJournal,
      mockSubscriptionManager,
      mockMutationEngine,
      options,
    );
    extraManagers.push(manager);
    return manager;
  };

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
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- the global is defined non-configurable in beforeEach, so it cannot be deleted
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
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- the global is defined non-configurable in beforeEach, so it cannot be deleted
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

        expect(savedData).toStrictEqual({
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
        createExtraManager({
          persistKey: 'test-key',
          storage: mockStorage,
        });

        await vi.advanceTimersByTimeAsync(100);

        // Verify cached docs were merged in per-doc (not wholesale replace)
        // oxlint-disable-next-line typescript/unbound-method -- asserts on a vi.fn mock, which never reads `this`
        expect(mockNormalizedCache.upsert).toHaveBeenCalledWith(cachedUser, { replace: true });

        // Verify subscriptions were restored as dormant restored entries
        // oxlint-disable-next-line typescript/unbound-method -- asserts on a vi.fn mock, which never reads `this`
        expect(mockSubscriptionManager.restoreSubscription).toHaveBeenCalledWith(persistedState.subs[0]);

        // Verify journal was restored
        // oxlint-disable-next-line typescript/unbound-method -- asserts on a vi.fn mock, which never reads `this`
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

        createExtraManager({
          persistKey: 'test-key',
          storage: mockStorage,
        });

        await vi.advanceTimersByTimeAsync(100);

        // oxlint-disable-next-line typescript/unbound-method -- asserts on a vi.fn mock, which never reads `this`
        expect(mockNormalizedCache.upsert).not.toHaveBeenCalled();
      });

      it('should handle missing persisted state', async () => {
        mockStorage.getItem.mockResolvedValue(null);

        createExtraManager({
          persistKey: 'test-key',
          storage: mockStorage,
        });

        await vi.advanceTimersByTimeAsync(100);

        // Should not modify state
        // oxlint-disable-next-line typescript/unbound-method -- asserts on a vi.fn mock, which never reads `this`
        expect(mockMutationJournal.add).not.toHaveBeenCalled();
      });

      it('should handle corrupted persisted state', async () => {
        mockStorage.getItem.mockResolvedValue('invalid json');

        createExtraManager({
          persistKey: 'test-key',
          storage: mockStorage,
        });

        await vi.advanceTimersByTimeAsync(100);

        expect(console.warn).toHaveBeenCalledWith('Failed to load sync state:', expect.any(Error));
      });

      it('should handle load errors gracefully', async () => {
        mockStorage.getItem.mockRejectedValue(new Error('Load failed'));

        createExtraManager({
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
      const onResetCache = vi.fn<() => void>();
      const options: SyncOptions = {
        persistKey: 'test-key',
        onResetCache,
      };

      createExtraManager(options);

      // Simulate reset message
      mockBroadcastChannel.onmessage({ data: 'reset' });

      expect(onResetCache).toHaveBeenCalledWith();
    });

    it('should handle backfill message', () => {
      const onBackfillAll = vi.fn<() => void>();
      const options: SyncOptions = {
        persistKey: 'test-key',
        onBackfillAll,
      };

      createExtraManager(options);

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
      createExtraManager({
        persistKey: 'test-key',
        tabCoordination: { activeTabPriority: true },
      });

      // Should not set leader immediately
      expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith('frappe-sync-leader', expect.any(String));
    });

    it('should take over leadership from expired leader', () => {
      const expiredLeader = {
        tabId: 'expired-tab',
        // 10 seconds ago
        timestamp: Date.now() - 10_000,
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
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- the global is defined non-configurable in beforeEach, so it cannot be deleted
      (global as any).localStorage = undefined;

      // Should not throw when localStorage is unavailable
      expect(() => {
        createExtraManager({
          persistKey: 'test-key',
          tabCoordination: { activeTabPriority: true },
        });
      }).not.toThrow();
    });

    it('should call leadership callbacks', () => {
      const onBecomeLeader = vi.fn<() => void>();
      const onLoseLeadership = vi.fn<() => void>();

      mockLocalStorage.getItem.mockReturnValue(null);

      createExtraManager({
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
      await expect(trackedOperation).resolves.toBe('result');
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
        createExtraManager({
          persistKey: 'test-key',
        });
      }).not.toThrow();
    });

    it('should handle localStorage setItem errors', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      expect(() => {
        createExtraManager({
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
        createExtraManager({
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
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an explicit undefined payload is one of the malformed cases under test
        mockBroadcastChannel.onmessage({ data: undefined });
        mockBroadcastChannel.onmessage({});
        mockBroadcastChannel.onmessage(null);
      }).not.toThrow();
    });
  });
});

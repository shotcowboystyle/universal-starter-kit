/**
 * React Native persistence path: RN has `window` but no `document` and no
 * BroadcastChannel, yet full KV storage (MMKV via PlatformStorageKV). With
 * `isNative` true the PersistenceManager must activate snapshot persistence
 * and skip only the DOM-dependent cross-tab machinery — previously the
 * `document` guard made persistence dead code on native.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MutationEngine } from './mutation-engine';
import type { MutationJournal } from './mutation-journal';
import type { NormalizedCache } from './normalized-cache';
import { PersistenceManager } from './persistence';
import type { SubscriptionManager } from './subscription-manager';
import type { KVStorage, SyncOptions } from './types';

vi.mock(import('@repo/platform'), () => ({
  isNative: true,
  onAppFocus: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  onOnline: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  onVisibilityChange: vi.fn<() => () => void>(() => vi.fn<() => void>()),
}));

describe('PersistenceManager on React Native (isNative)', () => {
  let persistenceManager: PersistenceManager | null = null;
  let mockStorage: any;
  let mockNormalizedCache: any;
  let mockMutationJournal: any;
  let mockSubscriptionManager: any;
  let mockMutationEngine: any;
  let broadcastChannelSpy: any;
  let originalDocument: any;
  let originalBroadcastChannel: any;

  beforeEach(() => {
    vi.useFakeTimers();

    mockStorage = {
      getItem: vi.fn<KVStorage['getItem']>().mockResolvedValue(null),
      setItem: vi.fn<KVStorage['setItem']>().mockResolvedValue(),
      removeItem: vi.fn<KVStorage['removeItem']>().mockResolvedValue(),
    };

    mockNormalizedCache = {
      state: {},
      get: vi.fn<NormalizedCache['get']>(),
      upsert: vi.fn<NormalizedCache['upsert']>(),
    };
    mockMutationJournal = {
      listPending: vi.fn<MutationJournal['listPending']>().mockReturnValue([]),
      add: vi.fn<MutationJournal['add']>(),
    };
    mockSubscriptionManager = {
      getAllSubscriptions: vi.fn<SubscriptionManager['getAllSubscriptions']>().mockReturnValue(new Map()),
      restoreSubscription: vi.fn<SubscriptionManager['restoreSubscription']>(),
      gcRestoredSubscriptions: vi.fn<SubscriptionManager['gcRestoredSubscriptions']>(),
    };
    mockMutationEngine = {
      getTemporaryIdToRealNameMap: vi.fn<MutationEngine['getTemporaryIdToRealNameMap']>().mockReturnValue(new Map()),
    };

    // Simulate the RN runtime: no document, no BroadcastChannel
    originalDocument = (globalThis as any).document;
    originalBroadcastChannel = (globalThis as any).BroadcastChannel;
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- RN has no document global; an undefined value models that
    Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
    broadcastChannelSpy = vi.fn<() => void>();
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: broadcastChannelSpy,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    persistenceManager?.destroy();
    persistenceManager = null;
    Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true });
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: originalBroadcastChannel,
      configurable: true,
      writable: true,
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createManager = (options: SyncOptions): PersistenceManager => {
    persistenceManager = new PersistenceManager(
      mockNormalizedCache,
      mockMutationJournal,
      mockSubscriptionManager,
      mockMutationEngine,
      options,
    );
    return persistenceManager;
  };

  it('activates snapshot persistence without a document', async () => {
    const manager = createManager({ persistKey: 'rn-key', storage: mockStorage });
    await manager.whenReady();
    expect(mockStorage.getItem).toHaveBeenCalledWith('rn-key');

    manager.scheduleSave();
    await vi.advanceTimersByTimeAsync(60);
    expect(mockStorage.setItem).toHaveBeenCalledWith('rn-key', expect.any(String));
  });

  it('restores a persisted snapshot on startup', async () => {
    const snapshotSub = {
      id: 'sub-rn',
      query: { doctype: 'ToDo' },
      checkpoint: '2024-01-01T10:00:00',
      docIds: ['t1'],
    };
    mockStorage.getItem.mockResolvedValue(
      JSON.stringify({
        subs: [snapshotSub],
        cache: {
          ToDo: { byId: { t1: { doctype: 'ToDo', name: 't1' } }, allIds: ['t1'] },
        },
        journal: [],
        temp: [],
      }),
    );

    const manager = createManager({ persistKey: 'rn-key', storage: mockStorage });
    await manager.whenReady();

    expect(mockSubscriptionManager.restoreSubscription).toHaveBeenCalledWith(snapshotSub);
    expect(mockNormalizedCache.upsert).toHaveBeenCalledWith({ doctype: 'ToDo', name: 't1' }, { replace: true });
  });

  it('skips BroadcastChannel and tab coordination on native', () => {
    createManager({ persistKey: 'rn-key', storage: mockStorage });
    expect(broadcastChannelSpy).not.toHaveBeenCalled();
  });

  it('stays fully inert without persistKey', async () => {
    const manager = createManager({});
    await manager.whenReady();
    manager.scheduleSave();
    await vi.advanceTimersByTimeAsync(60);

    expect(mockStorage.getItem).not.toHaveBeenCalled();
    expect(mockStorage.setItem).not.toHaveBeenCalled();
  });
});

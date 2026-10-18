/**
 * GJS (GNOME) persistence path: the GNOME bundles run with window/document
 * LAYOUT STUBS (react-gnome polyfills), so the old DOM-presence branch would
 * have started BroadcastChannel/tab-coordination machinery against fake
 * globals. With `imports.gi` present the PersistenceManager must take the
 * native-style branch: snapshot persistence through the provided storage
 * adapter (a Gio file KV on GNOME), no BroadcastChannel, no tab
 * coordination — and stay fully inert without persistKey.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MutationEngine } from './mutation-engine';
import type { MutationJournal } from './mutation-journal';
import type { NormalizedCache } from './normalized-cache';
import { PersistenceManager } from './persistence';
import type { SubscriptionManager } from './subscription-manager';
import type { KVStorage, SyncOptions } from './types';

vi.mock(import('@repo/platform'), () => ({
  isNative: false,
  onAppFocus: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  onOnline: vi.fn<() => () => void>(() => vi.fn<() => void>()),
  onVisibilityChange: vi.fn<() => () => void>(() => vi.fn<() => void>()),
}));

describe('PersistenceManager on GJS (imports.gi global)', () => {
  let persistenceManager: PersistenceManager | null = null;
  let mockStorage: any;
  let mockNormalizedCache: any;
  let mockMutationJournal: any;
  let mockSubscriptionManager: any;
  let mockMutationEngine: any;
  let broadcastChannelSpy: any;
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

    // The GJS runtime marker. Unlike the RN spec, document stays DEFINED
    // (happy-dom) — mirroring the GNOME bundles where react-gnome installs
    // window/document layout stubs.
    (globalThis as any).imports = { gi: {} };

    originalBroadcastChannel = (globalThis as any).BroadcastChannel;
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
    delete (globalThis as any).imports;
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

  it('activates snapshot persistence through the provided storage adapter', async () => {
    const manager = createManager({ persistKey: 'gjs-key', storage: mockStorage });
    await manager.whenReady();
    expect(mockStorage.getItem).toHaveBeenCalledWith('gjs-key');

    manager.scheduleSave();
    await vi.advanceTimersByTimeAsync(60);
    expect(mockStorage.setItem).toHaveBeenCalledWith('gjs-key', expect.any(String));
  });

  it('restores a persisted snapshot on startup', async () => {
    const snapshotSub = {
      id: 'sub-gjs',
      query: { doctype: 'Workspace' },
      checkpoint: '2026-01-01T10:00:00',
      docIds: ['w1'],
    };
    mockStorage.getItem.mockResolvedValue(
      JSON.stringify({
        subs: [snapshotSub],
        cache: {
          Workspace: { byId: { w1: { doctype: 'Workspace', name: 'w1' } }, allIds: ['w1'] },
        },
        journal: [],
        temp: [],
      }),
    );

    const manager = createManager({ persistKey: 'gjs-key', storage: mockStorage });
    await manager.whenReady();

    expect(mockSubscriptionManager.restoreSubscription).toHaveBeenCalledWith(snapshotSub);
    expect(mockNormalizedCache.upsert).toHaveBeenCalledWith({ doctype: 'Workspace', name: 'w1' }, { replace: true });
  });

  it('skips BroadcastChannel and tab coordination even though document exists', () => {
    expect(document).not.toBeTypeOf('undefined');
    createManager({ persistKey: 'gjs-key', storage: mockStorage });
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

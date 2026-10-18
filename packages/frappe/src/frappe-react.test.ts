import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrappeCollectionOptionsConfig } from './collection';
import type { FixtureProvider } from './fixtures';
import type { UseFrappeCollectionConfig, UseFrappeInfiniteListConfig } from './frappe-react';
import { __getActiveSyncModule, useFrappeCollection, useFrappeInfiniteList, useInfiniteScroll } from './frappe-react';
import type { RealtimeConfig } from './realtime';
import type { SyncModule } from './sync';
import { Order } from './sync/types';

/** Loose signature for SyncModule-surface mocks fed partial row/page fixtures. */
type AnyFn = (...args: any[]) => any;
type SyncErrorHandler = NonNullable<FrappeCollectionOptionsConfig<{ name: string; doctype: string }>['onSyncError']>;

const {
  mockSubscribe,
  mockUnsubscribe,
  mockGetDocsForSubscription,
  mockGetPageInfo,
  mockGetNextBatch,
  mockSubscribeStore,
} = vi.hoisted(() => ({
  mockSubscribe: vi.fn<AnyFn>(),
  mockUnsubscribe: vi.fn<SyncModule['unsubscribe']>(),
  mockGetDocsForSubscription: vi.fn<AnyFn>(),
  mockGetPageInfo: vi.fn<AnyFn>(),
  mockGetNextBatch: vi.fn<AnyFn>(),
  mockSubscribeStore: vi.fn<SyncModule['subscribeStore']>(),
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the SyncModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./sync', () => ({
  SyncModule: class {
    subscribe = mockSubscribe;
    unsubscribe = mockUnsubscribe;
    getDocsForSubscription = mockGetDocsForSubscription;
    getPageInfo = mockGetPageInfo;
    getNextBatch = mockGetNextBatch;
    subscribeStore = mockSubscribeStore;
  },
}));

// A bare vi.fn() is constructible, so it stands in for the classes below.
const { mockRealtimeCtor } = vi.hoisted(() => ({ mockRealtimeCtor: vi.fn<(config: RealtimeConfig) => void>() }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the RealtimeModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./realtime', () => ({ RealtimeModule: mockRealtimeCtor }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the HttpClient stub is partial; the real module type rejects it in a typed factory
vi.mock('./core/http', () => ({ HttpClient: vi.fn<() => void>() }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the DbModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./db', () => ({ DbModule: vi.fn<() => void>() }));
const { mockCreateFrappeCollection, mockIsBrowser } = vi.hoisted(() => ({
  mockCreateFrappeCollection: vi.fn<AnyFn>(),
  mockIsBrowser: vi.fn<() => boolean>(() => true),
}));

vi.mock(import('./collection'), () => ({
  createFrappeCollection: mockCreateFrappeCollection,
  // Mocked collections never register a sync session, so the registry's
  // force-GC falls back to collection.cleanup() (the pre-existing contract
  // these specs assert).
  releaseFrappeCollectionSync: () => false,
}));
vi.mock(import('./util'), () => ({ isBrowser: mockIsBrowser }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the FixtureDbModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./fixture-db', () => ({ FixtureDbModule: vi.fn<() => void>() }));

interface TestDoc {
  name: string;
  doctype: string;
  title: string;
}

const testDocs: TestDoc[] = [
  { name: 'doc-1', doctype: 'Task', title: 'Task 1' },
  { name: 'doc-2', doctype: 'Task', title: 'Task 2' },
  { name: 'doc-3', doctype: 'Task', title: 'Task 3' },
];

let collectionSeq = 0;
const nextCollectionId = (): string => {
  collectionSeq += 1;
  return `collection-${collectionSeq}`;
};

const makeCollection = () => ({ id: nextCollectionId(), cleanup: vi.fn<() => void>() }) as any;

/** WeakRef stand-in whose target has always been collected. */
class CollectedWeakRef {
  // oxlint-disable-next-line class-methods-use-this -- mirrors the WeakRef instance API
  deref(): undefined {
    return undefined;
  }
}

/** Mock collection mirroring the TanStack DB surface the registry relies
 * on: `subscriberCount`, `status`, `on("status:change")`, and a cleanup()
 * that transitions status and emits the event (as the real one does). */
const makeLiveCollection = () => {
  const listeners = new Set<(event: { status?: string }) => void>();
  const collection: any = {
    id: nextCollectionId(),
    status: 'ready',
    subscriberCount: 0,
    on: vi.fn<(event: string, listener: (event: { status?: string }) => void) => () => boolean>((event, listener) => {
      if (event === 'status:change') {
        listeners.add(listener);
      }
      return () => listeners.delete(listener);
    }),
    cleanup: vi.fn<() => void>(() => {
      collection.status = 'cleaned-up';
      for (const listener of listeners) {
        listener({ status: 'cleaned-up' });
      }
    }),
  };
  return collection;
};

describe(useFrappeInfiniteList, () => {
  let storeListener: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    storeListener = null;

    mockSubscribe.mockResolvedValue({
      subscriptionId: 'sub-1',
      rows: testDocs,
      checkpoint: '2024-01-01T12:00:00',
    });
    mockGetDocsForSubscription.mockReturnValue(testDocs);
    mockGetPageInfo.mockReturnValue({ hasMore: true, currentPage: 1 });
    mockGetNextBatch.mockResolvedValue(testDocs);
    mockSubscribeStore.mockImplementation((listener: () => void) => {
      storeListener = listener;
      return vi.fn<() => void>();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultConfig: UseFrappeInfiniteListConfig<TestDoc> = {
    config: { baseURL: 'http://test.local' },
    doctype: 'Task',
    fields: ['name', 'title'],
    pageSize: 20,
  };

  it('should subscribe with progressive: true on mount', async () => {
    const { result } = renderHook(() => useFrappeInfiniteList(defaultConfig));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        doctype: 'Task',
        progressive: true,
        limit: 20,
      }),
    );
  });

  it('should populate items after subscription resolves', async () => {
    const { result } = renderHook(() => useFrappeInfiniteList(defaultConfig));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toHaveLength(3);
    expect(result.current.items[0].name).toBe('doc-1');
    expect(result.current.hasMore).toBe(true);
  });

  it('should set error state on subscribe failure', async () => {
    mockSubscribe.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFrappeInfiniteList(defaultConfig));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('Network error');
    expect(result.current.items).toHaveLength(0);
  });

  it('should call getNextBatch on loadMore', async () => {
    const { result } = renderHook(() => useFrappeInfiniteList(defaultConfig));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockGetNextBatch).toHaveBeenCalledWith('sub-1', 'doc-3', 20);
  });

  it('should not loadMore when hasMore is false', async () => {
    mockGetPageInfo.mockReturnValue({ hasMore: false, currentPage: 1 });

    const { result } = renderHook(() => useFrappeInfiniteList(defaultConfig));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockGetNextBatch).not.toHaveBeenCalled();
  });

  it('should unsubscribe on unmount', async () => {
    const { result, unmount } = renderHook(() => useFrappeInfiniteList(defaultConfig));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledWith('sub-1');
  });

  it('should update items when store listener fires', async () => {
    const { result } = renderHook(() => useFrappeInfiniteList(defaultConfig));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const updatedDocs = [...testDocs, { name: 'doc-4', doctype: 'Task', title: 'Task 4' }];
    mockGetDocsForSubscription.mockReturnValue(updatedDocs);
    mockGetPageInfo.mockReturnValue({ hasMore: false, currentPage: 1 });

    act(() => {
      storeListener?.();
    });

    expect(result.current.items).toHaveLength(4);
    expect(result.current.hasMore).toBe(false);
  });

  it('should apply transform to items', async () => {
    const config: UseFrappeInfiniteListConfig<TestDoc> = {
      ...defaultConfig,
      transform: (doc) => ({ ...doc, title: doc.title.toUpperCase() }),
    };

    const { result } = renderHook(() => useFrappeInfiniteList(config));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items[0].title).toBe('TASK 1');
  });

  it('should refresh by re-subscribing', async () => {
    const { result } = renderHook(() => useFrappeInfiniteList(defaultConfig));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockSubscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-2',
      rows: [testDocs[0]],
      checkpoint: '2024-01-02T12:00:00',
    });
    mockGetDocsForSubscription.mockReturnValue([testDocs[0]]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockUnsubscribe).toHaveBeenCalledWith('sub-1');
    expect(mockSubscribe).toHaveBeenCalledTimes(2);
  });

  it('should return loading state while subscribing', () => {
    // A subscribe that never settles keeps the hook in its loading state.
    mockSubscribe.mockReturnValue(Promise.race([]));

    const { result } = renderHook(() => useFrappeInfiniteList(defaultConfig));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toHaveLength(0);
  });

  it('should not subscribe when config is undefined', () => {
    const config: UseFrappeInfiniteListConfig<TestDoc> = {
      ...defaultConfig,
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an absent connection config is `undefined` by the hook's contract
      config: undefined,
    };

    renderHook(() => useFrappeInfiniteList(config));

    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useFrappeCollection
// ---------------------------------------------------------------------------

describe(useFrappeCollection, () => {
  // Use a counter so each test gets a unique baseURL — avoids syncModuleCache hits
  let testNum = 0;
  const mockCollection = { id: 'mock-collection' } as any;

  beforeEach(() => {
    testNum += 1;
    vi.clearAllMocks();
    mockIsBrowser.mockReturnValue(true);
    mockCreateFrappeCollection.mockReturnValue(mockCollection);
  });

  afterEach(() => {
    mockIsBrowser.mockReturnValue(true);
  });

  it('returns undefined when config is undefined', () => {
    const { result } = renderHook(() => useFrappeCollection(undefined, 'Task'));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined during SSR (isBrowser returns false)', () => {
    mockIsBrowser.mockReturnValue(false);
    const config: UseFrappeCollectionConfig = { baseURL: `https://ssr-${testNum}.example.com` };
    const { result } = renderHook(() => useFrappeCollection(config, 'Task'));
    expect(result.current).toBeUndefined();
    expect(mockCreateFrappeCollection).not.toHaveBeenCalled();
  });

  it('creates a collection in a browser environment', () => {
    const config: UseFrappeCollectionConfig = { baseURL: `https://browser-${testNum}.example.com` };
    const { result } = renderHook(() => useFrappeCollection(config, 'Pokemon'));
    expect(mockCreateFrappeCollection).toHaveBeenCalledWith(
      'Pokemon',
      expect.objectContaining({ sync: expect.any(Object) }),
    );
    expect(result.current).toBe(mockCollection);
  });

  it('returns the same collection instance on re-render (stable ref)', () => {
    const config: UseFrappeCollectionConfig = { baseURL: `https://stable-${testNum}.example.com` };
    const { result, rerender } = renderHook(() => useFrappeCollection(config, 'Task'));
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();
  });

  it('creates a new collection when baseURL changes', () => {
    const mockCollection2 = { id: 'mock-collection-2' } as any;
    mockCreateFrappeCollection.mockReturnValueOnce(mockCollection).mockReturnValueOnce(mockCollection2);

    const { result, rerender } = renderHook(
      ({ baseURL }: { baseURL: string }) => useFrappeCollection({ baseURL }, 'Task'),
      { initialProps: { baseURL: `https://change-a-${testNum}.example.com` } },
    );

    const first = result.current;
    rerender({ baseURL: `https://change-b-${testNum}.example.com` });

    expect(result.current).not.toBe(first);
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);
  });

  it('clears the collection when config becomes undefined', () => {
    const config: UseFrappeCollectionConfig = { baseURL: `https://clear-${testNum}.example.com` };
    const { result, rerender } = renderHook(
      ({ cfg }: { cfg: UseFrappeCollectionConfig | undefined }) => useFrappeCollection(cfg, 'Task'),
      { initialProps: { cfg: config as UseFrappeCollectionConfig | undefined } },
    );

    expect(result.current).toBeDefined();
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an absent connection config is `undefined` by the hook's contract
    rerender({ cfg: undefined });
    expect(result.current).toBeUndefined();
  });

  it('__getActiveSyncModule returns a SyncModule after a collection is created', () => {
    const config: UseFrappeCollectionConfig = { baseURL: `https://active-${testNum}.example.com` };
    renderHook(() => useFrappeCollection(config, 'Task'));
    const active = __getActiveSyncModule();
    expect(active).toBeDefined();
  });

  it('__getActiveSyncModule returns the SyncModule when the only one was created in fixture mode', async () => {
    vi.resetModules();
    const fresh = await import('./frappe-react');
    expect(fresh.__getActiveSyncModule()).toBeUndefined();
    const fixtures = {} as FixtureProvider;
    renderHook(() => fresh.useFrappeCollection({ fixtures }, 'Task'));
    const active = fresh.__getActiveSyncModule();
    expect(active).toBeDefined();
    expect(active).toBe(mockCreateFrappeCollection.mock.calls.at(-1)?.[1].sync);
  });

  it('__getActiveSyncModule prefers a fixture-mode SyncModule created after live ones', () => {
    renderHook(() => useFrappeCollection({ baseURL: `https://before-fixture-${testNum}.example.com` }, 'Task'));
    const fixtures = {} as FixtureProvider;
    renderHook(() => useFrappeCollection({ fixtures }, 'Task'));
    const fixtureSync = mockCreateFrappeCollection.mock.calls.at(-1)?.[1].sync;
    expect(fixtureSync).toBeDefined();
    expect(__getActiveSyncModule()).toBe(fixtureSync);
  });

  it('__getActiveSyncModule falls back to the live cache once the latest SyncModule is collected', async () => {
    vi.resetModules();
    const fresh = await import('./frappe-react');
    const live = fresh.getFrappeSyncModule({ baseURL: `https://collected-${testNum}.example.com` });
    vi.stubGlobal('WeakRef', CollectedWeakRef);
    try {
      expect(fresh.getFrappeSyncModule({ fixtures: {} as FixtureProvider })).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(live).toBeDefined();
    expect(fresh.__getActiveSyncModule()).toBe(live);
  });

  it('builds fixture-mode SyncModules on runtimes without WeakRef', async () => {
    vi.resetModules();
    const fresh = await import('./frappe-react');
    // oxlint-disable-next-line unicorn/no-useless-undefined -- stubGlobal needs the value; undefined models a runtime without WeakRef
    vi.stubGlobal('WeakRef', undefined);
    try {
      expect(fresh.getFrappeSyncModule({ fixtures: {} as FixtureProvider })).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fresh.__getActiveSyncModule()).toBeUndefined();
  });

  it('passes socketOptions through to the RealtimeModule', () => {
    const socketOptions = { transports: ['polling', 'websocket'] };
    const config: UseFrappeCollectionConfig = {
      baseURL: `https://socketopts-${testNum}.example.com`,
      socketOptions,
    };
    renderHook(() => useFrappeCollection(config, 'Task'));
    expect(mockRealtimeCtor).toHaveBeenCalledWith(expect.objectContaining({ socketOptions }));
  });
});

// ---------------------------------------------------------------------------
// useFrappeCollection — shared collection cache (dedupe by configKey)
// ---------------------------------------------------------------------------

describe('useFrappeCollection shared cache', () => {
  let testNum = 100;
  /** > SHARED_COLLECTION_GC_MS in frappe-react.ts */
  const GC_WAIT_MS = 1500;

  beforeEach(() => {
    testNum += 1;
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockIsBrowser.mockReturnValue(true);
    mockCreateFrappeCollection.mockImplementation(makeCollection);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    mockIsBrowser.mockReturnValue(true);
  });

  const configFor = (label: string): UseFrappeCollectionConfig => ({
    baseURL: `https://shared-${label}-${testNum}.example.com`,
  });

  it('shares one collection across consumers with the same config/doctype/options', () => {
    const config = configFor('same');
    const options = { filters: { name: 'TODO-001' } };
    const a = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const b = renderHook(() => useFrappeCollection(config, 'Todo', options));

    expect(a.result.current).toBeDefined();
    expect(b.result.current).toBe(a.result.current);
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();
  });

  it('does not share across different filters', () => {
    const config = configFor('difffilters');
    const a = renderHook(() => useFrappeCollection(config, 'Todo', { filters: { name: 'A' } }));
    const b = renderHook(() => useFrappeCollection(config, 'Todo', { filters: { name: 'B' } }));

    expect(a.result.current).not.toBe(b.result.current);
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);
  });

  it('does not share across different orderBy/limit (part of the identity key)', () => {
    const config = configFor('difforder');
    const a = renderHook(() =>
      useFrappeCollection(config, 'Todo', { orderBy: { field: 'modified', order: Order.Desc } }),
    );
    const b = renderHook(() => useFrappeCollection(config, 'Todo', { limit: 5 }));

    expect(a.result.current).not.toBe(b.result.current);
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);
  });

  it('keeps the shared collection alive while any consumer remains mounted', () => {
    const config = configFor('partial');
    const options = { filters: { name: 'TODO-001' } };
    const a = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const b = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const shared = a.result.current as any;

    a.unmount();
    act(() => {
      vi.advanceTimersByTime(GC_WAIT_MS);
    });

    expect(shared.cleanup).not.toHaveBeenCalled();
    // Remaining consumer still gets the same live instance
    b.rerender();
    expect(b.result.current).toBe(shared);
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();
  });

  it('cleans up the shared collection after the last consumer unmounts', () => {
    const config = configFor('lastout');
    const options = { filters: { name: 'TODO-001' } };
    const a = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const b = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const shared = a.result.current as any;

    a.unmount();
    b.unmount();
    // Still inside the grace period.
    expect(shared.cleanup).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(GC_WAIT_MS);
    });
    expect(shared.cleanup).toHaveBeenCalledOnce();

    // A later consumer gets a fresh collection (no stale entry)
    const c = renderHook(() => useFrappeCollection(config, 'Todo', options));
    expect(c.result.current).not.toBe(shared);
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);
  });

  it('reuses the same collection when remounting within the grace period', () => {
    const config = configFor('remount');
    const options = { filters: { name: 'TODO-001' } };
    const a = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const shared = a.result.current as any;

    a.unmount();
    // Remount before the grace period elapses (e.g. StrictMode / quick nav)
    const b = renderHook(() => useFrappeCollection(config, 'Todo', options));
    act(() => {
      vi.advanceTimersByTime(GC_WAIT_MS);
    });

    expect(b.result.current).toBe(shared);
    expect(shared.cleanup).not.toHaveBeenCalled();
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();
  });

  it('swaps cleanly when options change: new shared entry, old entry released', () => {
    const config = configFor('swap');
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useFrappeCollection(config, 'Todo', { filters: { name } }),
      { initialProps: { name: 'TODO-001' } },
    );
    const first = result.current as any;

    rerender({ name: 'TODO-002' });
    const second = result.current as any;
    expect(second).not.toBe(first);

    act(() => {
      vi.advanceTimersByTime(GC_WAIT_MS);
    });
    expect(first.cleanup).toHaveBeenCalledOnce();
    expect(second.cleanup).not.toHaveBeenCalled();
  });

  it('fans out onSyncError to every mounted consumer of the shared collection', () => {
    const config = configFor('errfan');
    const options = { filters: { name: 'TODO-001' } };
    const errorA = vi.fn<SyncErrorHandler>();
    const errorB = vi.fn<SyncErrorHandler>();
    renderHook(() => useFrappeCollection(config, 'Todo', { ...options, onSyncError: errorA }));
    renderHook(() => useFrappeCollection(config, 'Todo', { ...options, onSyncError: errorB }));
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();

    const [[, passedOptions]] = mockCreateFrappeCollection.mock.calls;
    const syncError = new Error('initial sync failed');
    act(() => {
      passedOptions.onSyncError(syncError);
    });

    expect(errorA).toHaveBeenCalledWith(syncError);
    expect(errorB).toHaveBeenCalledWith(syncError);
  });

  it('HOLDS an errored entry while consumers are mounted: re-renders and late mounts share it (no refetch loop)', () => {
    const config = configFor('errhold');
    const options = { filters: { name: 'TODO-001' } };
    const a = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const errored = a.result.current;

    const [[, passedOptions]] = mockCreateFrappeCollection.mock.calls;
    act(() => {
      passedOptions.onSyncError(new Error('initial sync failed'));
    });

    // The mounted consumer's next render (e.g. after storing the error in
    // state) re-acquires the SAME errored entry — no fresh failing sync.
    a.rerender();
    expect(a.result.current).toBe(errored);
    // A late consumer mounting while the error is held shares the errored
    // entry and gets the error replayed on retain.
    const lateError = vi.fn<SyncErrorHandler>();
    const late = renderHook(() => useFrappeCollection(config, 'Todo', { ...options, onSyncError: lateError }));
    expect(late.result.current).toBe(errored);
    expect(lateError).toHaveBeenCalledOnce();
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();
  });

  it('REGRESSION: an error-state consumer does not loop failing fetches (bounded attempt count)', () => {
    // Reproduces the retry storm: a consumer that stores the sync error in
    // state re-renders on every failure. With eviction-on-error, each
    // re-render acquired a fresh entry with a fresh failing sync — an
    // unbounded fetch loop (froze storybook renderers, OOM'd vitest
    // workers). The errored entry must be a stable fixpoint instead.
    const config = configFor('errloop');
    const options = { filters: { name: 'TODO-001' } };

    let failuresSeen = 0;
    const consumer = renderHook(() => {
      // Mimic the consumer pattern: setState-on-error → re-render.
      const [, setError] = useState<unknown>(null);
      return useFrappeCollection(config, 'Todo', {
        ...options,
        onSyncError: (error) => {
          failuresSeen += 1;
          setError(error);
        },
      });
    });

    // Fail every FRESH sync attempt the cache starts, like a down bench:
    // each newly created collection errors exactly once. Under the old
    // eviction-on-error semantics every round created a new collection, so
    // this drove 25 attempts; the fix must hold it at one.
    let failedAttempts = 0;
    for (let round = 0; round < 25; round += 1) {
      const { calls } = mockCreateFrappeCollection.mock;
      if (calls.length > failedAttempts) {
        failedAttempts = calls.length;
        const [, passedOptions] = calls.at(-1)!;
        act(() => {
          passedOptions.onSyncError(new Error(`sync failure ${round}`));
        });
      }
      consumer.rerender();
    }

    // ONE collection, ONE real failure surfaced — not 25 fresh attempts.
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();
    expect(failuresSeen).toBe(1);
    expect(consumer.result.current).toBeDefined();
  });

  it('REGRESSION: unmounting during an error state neither throws nor starts new syncs', () => {
    const config = configFor('errunmount');
    const options = { filters: { name: 'TODO-001' } };
    const a = renderHook(() => useFrappeCollection(config, 'Todo', options));

    const [[, passedOptions]] = mockCreateFrappeCollection.mock.calls;
    act(() => {
      passedOptions.onSyncError(new Error('initial sync failed'));
    });

    expect(() => {
      a.unmount();
      act(() => {
        vi.advanceTimersByTime(GC_WAIT_MS);
      });
    }).not.toThrow();
    // Unmount must not have spawned another attempt.
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();
  });

  it('evicts the errored entry when the LAST consumer releases: the next mount is a fresh attempt (Retry contract)', () => {
    const config = configFor('errretry');
    const options = { filters: { name: 'TODO-001' } };
    const a = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const errored = a.result.current;

    const [[, passedOptions]] = mockCreateFrappeCollection.mock.calls;
    act(() => {
      passedOptions.onSyncError(new Error('initial sync failed'));
    });

    // Retry-by-remount: the failing consumer unmounts…
    a.unmount();
    // …and the remount acquires a FRESH entry with a fresh sync attempt —
    // immediately, not after a GC grace (a grace would replay the stale
    // error back into the retry).
    const retry = renderHook(() => useFrappeCollection(config, 'Todo', options));
    expect(retry.result.current).not.toBe(errored);
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);
  });

  it('an errored entry shared by two consumers survives one unmount and retries after both release', () => {
    const config = configFor('errshared');
    const options = { filters: { name: 'TODO-001' } };
    const a = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const b = renderHook(() => useFrappeCollection(config, 'Todo', options));
    const errored = a.result.current;

    const [[, passedOptions]] = mockCreateFrappeCollection.mock.calls;
    act(() => {
      passedOptions.onSyncError(new Error('initial sync failed'));
    });

    // One consumer leaves: the other still holds the errored entry stably.
    a.unmount();
    b.rerender();
    expect(b.result.current).toBe(errored);
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();

    // Both released → next mount starts the one fresh attempt.
    b.unmount();
    const retry = renderHook(() => useFrappeCollection(config, 'Todo', options));
    expect(retry.result.current).not.toBe(errored);
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);
  });

  it("a released consumer's onSyncError no longer fires", () => {
    const config = configFor('errrelease');
    const options = { filters: { name: 'TODO-001' } };
    const errorA = vi.fn<SyncErrorHandler>();
    const errorB = vi.fn<SyncErrorHandler>();
    const a = renderHook(() => useFrappeCollection(config, 'Todo', { ...options, onSyncError: errorA }));
    renderHook(() => useFrappeCollection(config, 'Todo', { ...options, onSyncError: errorB }));

    a.unmount();
    const [[, passedOptions]] = mockCreateFrappeCollection.mock.calls;
    act(() => {
      passedOptions.onSyncError(new Error('late failure'));
    });

    expect(errorA).not.toHaveBeenCalled();
    expect(errorB).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// useFrappeCollection — GC vs live-query subscribers
// ---------------------------------------------------------------------------
//
// Live queries subscribe to a collection outside the hook refcount
// (synchronously during render; detaching asynchronously through TanStack
// DB's own GC). Cleaning up a collection while a query is attached
// permanently errors the query ("Source collection … was manually cleaned up
// while live query … depends on it"), so the registry GC must defer while
// `collection.subscriberCount > 0` — bounded by a force window that reclaims
// collections pinned by leaked queries from never-committed renders.

describe('useFrappeCollection shared cache — GC vs live queries', () => {
  let testNum = 200;
  /** > SHARED_COLLECTION_GC_MS in frappe-react.ts */
  const GC_WAIT_MS = 1500;
  /** > SHARED_COLLECTION_GC_FORCE_MS in frappe-react.ts (plus defer ticks) */
  const FORCE_WAIT_MS = 40_000;

  beforeEach(() => {
    testNum += 1;
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockIsBrowser.mockReturnValue(true);
    mockCreateFrappeCollection.mockImplementation(makeLiveCollection);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    mockIsBrowser.mockReturnValue(true);
  });

  const configFor = (label: string): UseFrappeCollectionConfig => ({
    baseURL: `https://gcrace-${label}-${testNum}.example.com`,
  });

  it('defers cleanup while a live query is still attached, then cleans up once it detaches', () => {
    const config = configFor('defer');
    const a = renderHook(() => useFrappeCollection(config, 'Workspace'));
    const shared = a.result.current as any;

    // A live query attached to the collection (e.g. created during render or
    // still detaching through TanStack's idle GC after unmount).
    shared.subscriberCount = 1;
    a.unmount();

    act(() => {
      vi.advanceTimersByTime(GC_WAIT_MS);
    });
    expect(shared.cleanup).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3 * GC_WAIT_MS);
    });
    expect(shared.cleanup).not.toHaveBeenCalled();

    // Query detaches → the next deferred GC tick cleans up.
    shared.subscriberCount = 0;
    act(() => {
      vi.advanceTimersByTime(GC_WAIT_MS);
    });
    expect(shared.cleanup).toHaveBeenCalledOnce();
  });

  it('a remount during a deferred GC window reuses the same still-live collection', () => {
    const config = configFor('remountdefer');
    const a = renderHook(() => useFrappeCollection(config, 'Workspace'));
    const shared = a.result.current as any;
    shared.subscriberCount = 1;
    a.unmount();

    // Past the plain grace period — the entry survives on the deferral path.
    act(() => {
      vi.advanceTimersByTime(2 * GC_WAIT_MS);
    });
    const b = renderHook(() => useFrappeCollection(config, 'Workspace'));
    expect(b.result.current).toBe(shared);
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();

    // Retained again: even the force window passing must not clean it up.
    act(() => {
      vi.advanceTimersByTime(FORCE_WAIT_MS);
    });
    expect(shared.cleanup).not.toHaveBeenCalled();
  });

  it('force-cleans after the max defer window when a leaked query pins the collection', () => {
    const config = configFor('force');
    const a = renderHook(() => useFrappeCollection(config, 'Workspace'));
    const shared = a.result.current as any;
    // A query that never detaches (created by a render that never committed —
    // TanStack DB never arms its GC because it never had a subscriber).
    shared.subscriberCount = 1;
    a.unmount();

    act(() => {
      vi.advanceTimersByTime(FORCE_WAIT_MS);
    });
    expect(shared.cleanup).toHaveBeenCalledOnce();

    // A later consumer gets a fresh collection, not the force-cleaned husk.
    const b = renderHook(() => useFrappeCollection(config, 'Workspace'));
    expect(b.result.current).not.toBe(shared);
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);
  });

  it('each idle period gets a fresh force window (deadline resets on retain)', () => {
    const config = configFor('deadlinereset');
    const a = renderHook(() => useFrappeCollection(config, 'Workspace'));
    const shared = a.result.current as any;
    shared.subscriberCount = 1;
    a.unmount();

    // Burn most of the force window, then retain (remount) — resetting it.
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    const b = renderHook(() => useFrappeCollection(config, 'Workspace'));
    expect(b.result.current).toBe(shared);
    b.unmount();

    // A fresh full window applies after the release; 25s in, still deferred.
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(shared.cleanup).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(FORCE_WAIT_MS);
    });
    expect(shared.cleanup).toHaveBeenCalledOnce();
  });

  it("hands out a fresh collection when a cached entry's collection was cleaned up out-of-band", () => {
    const config = configFor('stalerender');
    const a = renderHook(() => useFrappeCollection(config, 'Workspace'));
    const stale = a.result.current as any;

    // Out-of-band teardown the registry didn't drive (e.g. TanStack DB's own
    // idle GC after every query detached, or a manual cleanup() call) — the
    // status listener bumps the mounted consumer onto a fresh entry.
    act(() => {
      stale.cleanup();
    });

    expect(a.result.current).not.toBe(stale);
    expect((a.result.current as any).status).not.toBe('cleaned-up');
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);

    // New consumers share the fresh entry, not the husk.
    const b = renderHook(() => useFrappeCollection(config, 'Workspace'));
    expect(b.result.current).toBe(a.result.current);
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);
  });

  it('REGRESSION: releasing an errored entry defers collection cleanup until live queries detach', () => {
    // Unmount-during-error: the release evicts the entry immediately (Retry
    // contract) but must NOT cleanup() while a live query is still attached
    // — that would hard-error the query mid-detach ("Source collection …
    // was manually cleaned up while live query … depends on it").
    const config = configFor('erridle');
    const a = renderHook(() => useFrappeCollection(config, 'Workspace'));
    const shared = a.result.current as any;
    // Live query attached by the consumer's render.
    shared.subscriberCount = 1;

    const [[, passedOptions]] = mockCreateFrappeCollection.mock.calls;
    act(() => {
      passedOptions.onSyncError(new Error('initial sync failed'));
    });
    a.unmount();

    // Evicted at once: a remount gets a fresh entry (fresh attempt) …
    const retry = renderHook(() => useFrappeCollection(config, 'Workspace'));
    expect(retry.result.current).not.toBe(shared);
    expect(mockCreateFrappeCollection).toHaveBeenCalledTimes(2);

    // … while the old collection's cleanup waits for the query to detach.
    act(() => {
      vi.advanceTimersByTime(GC_WAIT_MS);
    });
    expect(shared.cleanup).not.toHaveBeenCalled();
    shared.subscriberCount = 0;
    act(() => {
      vi.advanceTimersByTime(GC_WAIT_MS);
    });
    expect(shared.cleanup).toHaveBeenCalledOnce();
  });

  it('mount→unmount→mount within the grace window (StrictMode/HMR pattern) keeps one live instance', () => {
    const config = configFor('strictish');
    const a = renderHook(() => useFrappeCollection(config, 'Workspace'));
    const shared = a.result.current as any;
    // Live query attached by the first mount.
    shared.subscriberCount = 1;
    a.unmount();

    // Remount well inside the grace window.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const b = renderHook(() => useFrappeCollection(config, 'Workspace'));
    expect(b.result.current).toBe(shared);

    act(() => {
      vi.advanceTimersByTime(FORCE_WAIT_MS);
    });
    expect(shared.cleanup).not.toHaveBeenCalled();
    expect(mockCreateFrappeCollection).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// useInfiniteScroll
// ---------------------------------------------------------------------------

describe(useInfiniteScroll, () => {
  let ioInstances: {
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    cb: IntersectionObserverCallback;
  }[];

  const installMockIO = () => {
    ioInstances = [];
    class MockIO {
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      constructor(observerCallback: IntersectionObserverCallback) {
        const instance = { observe: vi.fn<() => void>(), disconnect: vi.fn<() => void>(), cb: observerCallback };
        ioInstances.push(instance);
        this.observe = instance.observe;
        this.disconnect = instance.disconnect;
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIO);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() =>
      useInfiniteScroll({ hasMore: true, isLoading: false, onLoadMore: vi.fn<() => void>() }),
    );
    expect(result.current.isVisible).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.sentinelRef).toBeTypeOf('function');
  });

  it('does not create IntersectionObserver when enabled=false', async () => {
    installMockIO();

    const el = document.createElement('div');
    const { result } = renderHook(() =>
      useInfiniteScroll({ hasMore: true, isLoading: false, onLoadMore: vi.fn<() => void>(), enabled: false }),
    );

    await act(async () => {
      result.current.sentinelRef(el);
    });

    expect(ioInstances).toHaveLength(0);
  });

  it('creates IntersectionObserver and observes element when enabled and sentinel is set', async () => {
    installMockIO();

    const el = document.createElement('div');
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useInfiniteScroll({ hasMore: true, isLoading: false, onLoadMore: vi.fn<() => void>(), enabled }),
      { initialProps: { enabled: false } },
    );

    await act(async () => {
      result.current.sentinelRef(el);
    });
    await act(async () => {
      rerender({ enabled: true });
    });

    expect(ioInstances).toHaveLength(1);
    expect(ioInstances[0].observe).toHaveBeenCalledWith(el);
  });

  it('calls onLoadMore when intersection fires with hasMore=true', async () => {
    installMockIO();
    const onLoadMore = vi.fn<() => Promise<void>>(async () => {
      // Resolves immediately: the load itself is not under test.
    });

    const el = document.createElement('div');
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useInfiniteScroll({
          hasMore: true,
          isLoading: false,
          onLoadMore,
          debounceMs: 0,
          enabled,
        }),
      { initialProps: { enabled: false } },
    );

    await act(async () => {
      result.current.sentinelRef(el);
    });
    await act(async () => {
      rerender({ enabled: true });
    });

    expect(ioInstances).toHaveLength(1);

    await act(async () => {
      ioInstances[0].cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('does not call onLoadMore when hasMore=false', async () => {
    installMockIO();
    const onLoadMore = vi.fn<() => void>();

    const el = document.createElement('div');
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useInfiniteScroll({
          hasMore: false,
          isLoading: false,
          onLoadMore,
          debounceMs: 0,
          enabled,
        }),
      { initialProps: { enabled: false } },
    );

    await act(async () => {
      result.current.sentinelRef(el);
    });
    await act(async () => {
      rerender({ enabled: true });
    });

    if (ioInstances.length > 0) {
      await act(async () => {
        ioInstances[0].cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      });
    }
    await act(async () => {
      vi.runAllTimers();
    });

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('disconnects IntersectionObserver on unmount', async () => {
    installMockIO();

    const el = document.createElement('div');
    const { result, rerender, unmount } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useInfiniteScroll({ hasMore: true, isLoading: false, onLoadMore: vi.fn<() => void>(), enabled }),
      { initialProps: { enabled: false } },
    );

    await act(async () => {
      result.current.sentinelRef(el);
    });
    await act(async () => {
      rerender({ enabled: true });
    });

    unmount();
    expect(ioInstances[0].disconnect).toHaveBeenCalledWith();
  });
});

describe('explicit HTTP-only realtime mode', () => {
  it('isolates the disabled engine while default and true share realtime', async () => {
    const { getFrappeSyncModule } = await import('./frappe-react');
    mockRealtimeCtor.mockClear();
    const baseURL = 'https://realtime-mode-cache.test';
    const http = getFrappeSyncModule({ baseURL, realtime: false });
    expect(mockRealtimeCtor).not.toHaveBeenCalled();
    const enabled = getFrappeSyncModule({ baseURL });
    expect(mockRealtimeCtor).toHaveBeenCalledOnce();
    expect(getFrappeSyncModule({ baseURL, realtime: true })).toBe(enabled);
    expect(getFrappeSyncModule({ baseURL, realtime: false })).toBe(http);
    expect(http).not.toBe(enabled);
  });
});

/**
 * Integration specs for the shared-collection GC vs live-query race
 * ("[Live Query Error] Source collection 'X' was manually cleaned up while
 * live query 'live-query-N' depends on it").
 *
 * Unlike frappe-react.test.ts (which mocks createFrappeCollection), these
 * specs run REAL TanStack DB collections and REAL live queries over a mocked
 * SyncModule, reproducing the production wiring: `useLiveQuery` attaches to
 * the shared collection synchronously during render and detaches
 * asynchronously through TanStack DB's own GC — both outside the hook
 * refcount that drives the registry's grace-period GC. Before the fix, the
 * grace GC called collection.cleanup() while queries were still attached,
 * permanently erroring them; a query erroring while still "loading" never
 * notifies React, which is the "sticks on Loading workspaces…" symptom.
 */
import { createLiveQueryCollection } from '@tanstack/db';
import { useLiveQuery } from '@tanstack/react-db';
import { act, renderHook } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { UseFrappeCollectionConfig } from './frappe-react';
import { useFrappeCollection } from './frappe-react';

type AnyFn = (...args: any[]) => any;
interface SubscribeStub {
  subscriptionId: string;
  rows: { name: string; doctype: string; title: string }[] | undefined;
  checkpoint: string;
}

// Force TanStack DB's requestIdleCallback polyfill (a plain setTimeout) so
// live-query detach timing is fully driven by fake timers. vi.hoisted runs
// before module imports capture the global.
vi.hoisted(() => {
  delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
  delete (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback;
  const win = (globalThis as unknown as { window?: { requestIdleCallback?: unknown; cancelIdleCallback?: unknown } })
    .window;
  if (win) {
    delete win.requestIdleCallback;
    delete win.cancelIdleCallback;
  }
});

const { mockSubscribe, mockUnsubscribe, mockGetDocsForSubscription, mockSubscribeStore, storeListeners, docStore } =
  vi.hoisted(() => {
    const listeners = new Set<() => void>();
    const docs = new Map<string, { name: string; doctype: string; title: string }[]>();
    let subscriptionCounter = 0;
    return {
      storeListeners: listeners,
      docStore: docs,
      mockSubscribe: vi.fn<(query: { doctype: string }) => Promise<SubscribeStub>>(async (query) => {
        subscriptionCounter += 1;
        const subscriptionId = `sub-${subscriptionCounter}`;
        docs.set(subscriptionId, [
          { name: 'ws-1', doctype: query.doctype, title: 'Workspace One' },
          { name: 'ws-2', doctype: query.doctype, title: 'Workspace Two' },
        ]);
        return { subscriptionId, rows: docs.get(subscriptionId), checkpoint: 't0' };
      }),
      mockUnsubscribe: vi.fn<(subscriptionId: string) => void>((subscriptionId) => {
        docs.delete(subscriptionId);
      }),
      mockGetDocsForSubscription: vi.fn<(subscriptionId: string) => unknown[]>(
        (subscriptionId) => docs.get(subscriptionId) ?? [],
      ),
      mockSubscribeStore: vi.fn<(listener: () => void) => () => boolean>((listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    };
  });

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the SyncModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./sync', () => ({
  SyncModule: class {
    subscribe = mockSubscribe;
    unsubscribe = mockUnsubscribe;
    getDocsForSubscription = mockGetDocsForSubscription;
    subscribeStore = mockSubscribeStore;
    mutate = vi.fn<AnyFn>();
  },
}));
// A bare vi.fn() is constructible, so it stands in for the classes below.
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the RealtimeModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./realtime', () => ({ RealtimeModule: vi.fn<() => void>() }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the HttpClient stub is partial; the real module type rejects it in a typed factory
vi.mock('./core/http', () => ({ HttpClient: vi.fn<() => void>() }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the DbModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./db', () => ({ DbModule: vi.fn<() => void>() }));
vi.mock(import('./util'), () => ({ isBrowser: () => true }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the FixtureDbModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./fixture-db', () => ({ FixtureDbModule: vi.fn<() => void>() }));

interface WorkspaceDoc {
  name: string;
  doctype: string;
  title: string;
}

/** > SHARED_COLLECTION_GC_MS in frappe-react.ts */
const GC_WAIT_MS = 1500;
/** > SHARED_COLLECTION_GC_FORCE_MS in frappe-react.ts (plus defer ticks) */
const FORCE_WAIT_MS = 40_000;

/** Flush microtasks so the mocked subscribe() promise chain settles. */
const flushMicrotasks = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each await yields one microtask turn; sequencing is the point
      await Promise.resolve();
    }
  });
};

/** Advance fake timers while letting scheduled microtasks interleave
 * (TanStack's CleanupQueue defers its timer arming to a microtask). */
const advanceTime = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const pushDoc = (doc: WorkspaceDoc): void => {
  for (const docs of docStore.values()) {
    docs.push(doc);
  }
  // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot: listeners may (un)subscribe while being notified
  for (const listener of [...storeListeners]) {
    listener();
  }
};

const strictModeWrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

describe('shared collection GC vs real live queries', () => {
  let testNum = 0;
  let consoleErrorSpy: MockInstance;

  const liveQueryErrors = () =>
    consoleErrorSpy.mock.calls.filter(
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- console.error args are untyped; only string messages carry the tag
      (args) => typeof args[0] === 'string' && args[0].includes('[Live Query Error]'),
    );

  beforeEach(() => {
    testNum += 1;
    vi.useFakeTimers();
    storeListeners.clear();
    docStore.clear();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  const configFor = (label: string): UseFrappeCollectionConfig => ({
    baseURL: `https://lqgc-${label}-${testNum}.example.com`,
  });

  it('a live query that outlives the hook refcount survives grace expiry and keeps receiving data', async () => {
    const config = configFor('outlive');
    const hook = renderHook(() => useFrappeCollection<WorkspaceDoc>(config, 'Workspace'));
    await flushMicrotasks();
    const collection = hook.result.current!;

    // A live query attached outside the hook's retain/release lifecycle —
    // models a render-created query racing the retain effect, and the
    // idle-detach straggler that lingers after unmount. Attaching is what
    // starts the collection's sync (it stays "idle" until first subscriber).
    const liveQuery = createLiveQueryCollection({
      query: (q) => q.from({ workspace: collection }),
      startSync: true,
      gcTime: 300_000,
    });
    await flushMicrotasks();
    expect(collection.status).toBe('ready');
    expect(liveQuery.status).toBe('ready');
    expect(liveQuery.toArray).toHaveLength(2);

    // Release the last hook ref and let the grace period expire. Before the
    // fix this called collection.cleanup() → "[Live Query Error] Source
    // collection … was manually cleaned up while live query … depends on it"
    // and the query never recovered.
    hook.unmount();
    await advanceTime(GC_WAIT_MS);

    expect(collection.status).not.toBe('cleaned-up');
    expect(liveQuery.status).toBe('ready');
    expect(liveQueryErrors()).toHaveLength(0);

    // The query still receives updates through the shared collection.
    pushDoc({ name: 'ws-3', doctype: 'Workspace', title: 'Workspace Three' });
    await flushMicrotasks();
    expect(liveQuery.toArray).toHaveLength(3);

    // Once the query detaches, the deferred GC reclaims the collection —
    // unmounted screens still release collections eventually (no leak).
    await liveQuery.cleanup();
    await advanceTime(2 * GC_WAIT_MS);
    expect(collection.status).toBe('cleaned-up');
    expect(liveQueryErrors()).toHaveLength(0);
  });

  it('remounting within the grace window reuses the live collection and its query keeps working', async () => {
    const config = configFor('remount');
    const first = renderHook(() => useFrappeCollection<WorkspaceDoc>(config, 'Workspace'));
    await flushMicrotasks();
    const collection = first.result.current!;

    const liveQuery = createLiveQueryCollection({
      query: (q) => q.from({ workspace: collection }),
      startSync: true,
      gcTime: 300_000,
    });
    await flushMicrotasks();
    expect(liveQuery.status).toBe('ready');

    // Unmount → remount inside the grace window (StrictMode / HMR / quick
    // route bounce). The registry must hand back the SAME live instance.
    first.unmount();
    await advanceTime(200);
    const second = renderHook(() => useFrappeCollection<WorkspaceDoc>(config, 'Workspace'));
    expect(second.result.current).toBe(collection);

    // Long after the original grace deadline, everything is still healthy.
    await advanceTime(FORCE_WAIT_MS);
    expect(collection.status).toBe('ready');
    expect(liveQuery.status).toBe('ready');
    expect(liveQueryErrors()).toHaveLength(0);

    pushDoc({ name: 'ws-3', doctype: 'Workspace', title: 'Workspace Three' });
    await flushMicrotasks();
    expect(liveQuery.toArray).toHaveLength(3);
  });

  it('useWorkspaces pattern: unmount → full GC → remount transitions out of loading with data', async () => {
    const config = configFor('workspaces');
    const useWorkspacesPattern = () => {
      const collection = useFrappeCollection<WorkspaceDoc>(config, 'Workspace');
      const { data, isLoading } = useLiveQuery(
        (q) => (collection ? q.from({ workspace: collection }) : null),
        [collection],
      );
      // Mirrors features/backoffice/shell/useWorkspaces.ts' loading gate.
      return { collection, data, isLoading: isLoading || collection === undefined };
    };

    const first = renderHook(useWorkspacesPattern);
    await flushMicrotasks();
    expect(first.result.current.isLoading).toBe(false);
    expect(first.result.current.data).toHaveLength(2);
    const firstCollection = first.result.current.collection!;

    // Unmount and let EVERYTHING wind down naturally: the live query detaches
    // through TanStack's own GC (CleanupQueue + idle callback), then the
    // registry grace GC reclaims the unreferenced collection.
    first.unmount();
    // Live query gcTime (1ms) + idle-callback polyfill.
    await advanceTime(50);
    await advanceTime(2 * GC_WAIT_MS);
    expect(firstCollection.status).toBe('cleaned-up');

    // Remount (navigate back): a fresh collection must load and the loading
    // gate must clear — this is the "sticks on Loading workspaces…" contract.
    const second = renderHook(useWorkspacesPattern);
    expect(second.result.current.collection).not.toBe(firstCollection);
    await flushMicrotasks();
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.data).toHaveLength(2);
    expect(liveQueryErrors()).toHaveLength(0);
  });

  it('StrictMode double-mount keeps one live collection and a working query', async () => {
    const config = configFor('strict');

    const hook = renderHook(
      () => {
        const collection = useFrappeCollection<WorkspaceDoc>(config, 'Workspace');
        const { data, isLoading } = useLiveQuery(
          (q) => (collection ? q.from({ workspace: collection }) : null),
          [collection],
        );
        return { collection, data, isLoading };
      },
      { wrapper: strictModeWrapper },
    );
    await flushMicrotasks();
    expect(hook.result.current.isLoading).toBe(false);
    expect(hook.result.current.data).toHaveLength(2);
    const collection = hook.result.current.collection!;

    await advanceTime(FORCE_WAIT_MS);
    expect(collection.status).toBe('ready');
    expect(hook.result.current.collection).toBe(collection);
    expect(liveQueryErrors()).toHaveLength(0);

    hook.unmount();
    await advanceTime(50);
    await advanceTime(2 * GC_WAIT_MS);
    expect(collection.status).toBe('cleaned-up');
    expect(liveQueryErrors()).toHaveLength(0);
  });

  it('force window: a leaked query releases the sync WITHOUT erroring, and a fresh mount recovers', async () => {
    const config = configFor('leak');
    const hook = renderHook(() => useFrappeCollection<WorkspaceDoc>(config, 'Workspace'));
    await flushMicrotasks();
    const collection = hook.result.current!;

    // A leaked query: created (sync started, source subscribed) but never
    // given a subscriber — the shape a discarded render leaves behind.
    // TanStack DB never arms its GC for it, so only the force window frees
    // the sync resources.
    const leakedQuery = createLiveQueryCollection({
      query: (q) => q.from({ workspace: collection }),
      startSync: true,
      gcTime: 300_000,
    });
    await flushMicrotasks();
    expect(collection.subscriberCount).toBeGreaterThan(0);
    const unsubscribesBefore = mockUnsubscribe.mock.calls.length;

    hook.unmount();
    await advanceTime(FORCE_WAIT_MS);
    // The regression this pins: the force window used to call cleanup() on
    // the pinned collection, permanently erroring every attached query with
    // "[Live Query Error] Source collection 'Workspace' was manually cleaned
    // up while live query … depends on it" (7× in the console sweep).
    // Now the SyncModule subscription is released externally instead: the
    // collection is never transitioned to cleaned-up, the leaked query
    // never errors, and no console error is emitted.
    expect(mockUnsubscribe.mock.calls.length).toBeGreaterThan(unsubscribesBefore);
    expect(collection.status).not.toBe('cleaned-up');
    expect(leakedQuery.status).not.toBe('error');
    expect(liveQueryErrors()).toHaveLength(0);

    // A consumer mounting afterwards gets a FRESH working collection — a new
    // live query over it loads and reaches ready.
    const fresh = renderHook(() => useFrappeCollection<WorkspaceDoc>(config, 'Workspace'));
    expect(fresh.result.current).not.toBe(collection);
    const freshQuery = createLiveQueryCollection({
      query: (q) => q.from({ workspace: fresh.result.current! }),
      startSync: true,
      gcTime: 300_000,
    });
    await flushMicrotasks();
    expect(fresh.result.current!.status).toBe('ready');
    expect(freshQuery.status).toBe('ready');
    expect(freshQuery.toArray).toHaveLength(2);
    expect(liveQueryErrors()).toHaveLength(0);
  });

  it('errored entry: idle cleanup with a leaked query attached releases sync without erroring', async () => {
    // The production path from the console sweep: initial sync fails (401),
    // consumers unmount (error screen), the errored entry is evicted through
    // cleanupEntryCollectionWhenIdle — which, past the force window, used to
    // cleanup() the collection while leaked queries were still attached.
    const config = configFor('error');
    mockSubscribe.mockRejectedValueOnce(new Error('AuthenticationError'));

    const hook = renderHook(() => useFrappeCollection<WorkspaceDoc>(config, 'Workspace'));
    await flushMicrotasks();
    const collection = hook.result.current!;

    const leakedQuery = createLiveQueryCollection({
      query: (q) => q.from({ workspace: collection }),
      startSync: true,
      gcTime: 300_000,
    });
    await flushMicrotasks();
    expect(collection.subscriberCount).toBeGreaterThan(0);

    hook.unmount();
    await advanceTime(FORCE_WAIT_MS);

    expect(collection.status).not.toBe('cleaned-up');
    expect(leakedQuery.status).not.toBe('error');
    expect(liveQueryErrors()).toHaveLength(0);
  });
});

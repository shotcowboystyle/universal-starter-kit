import { isWindowDefined } from '@repo/platform';
import type { Collection } from '@tanstack/db';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { createFrappeCollection, releaseFrappeCollectionSync } from './collection';
import type { FrappeCollectionOptionsConfig } from './collection';
import { HttpClient } from './core/http';
import type { AuthConfig } from './core/types';
import { DbModule } from './db';
import { FixtureDbModule } from './fixture-db';
import type { FixtureProvider } from './fixtures';
import { RealtimeModule } from './realtime';
import type { RealtimeConfig } from './realtime';
import { SyncModule } from './sync';
import { syncOptionsKey } from './sync-options-key';
import { Status } from './sync/types';
import type { DebugMutationEntry, OrderBy, SubscriptionQuery, SyncCatchUpState, SyncOptions } from './sync/types';
import { isBrowser } from './util';

/**
 * Configuration for creating a Frappe collection with connection details.
 */
export interface UseFrappeCollectionConfig {
  /**
   * The base URL of the Frappe server. Required unless `fixtures` is set —
   * a fixture corpus is the whole data source and nothing is ever dialled,
   * so a fixtures-only host legitimately has no server to name.
   */
  baseURL?: string;
  /** False keeps HTTP sync without constructing a realtime transport. Defaults to true. */
  realtime?: boolean;
  /**
   * Override the port used for the Socket.IO realtime connection.
   * In dev, set to `FRAPPE_SOCKETIO_PORT` (e.g. 9000).  Omit in production
   * behind a reverse proxy so the base URL port is used.
   */
  socketPort?: number;
  /**
   * Dial the realtime socket at this origin instead of deriving it from
   * `baseURL` + `socketPort` — for dev servers that proxy `/socket.io` on
   * their own origin (same-origin socket). See
   * `RealtimeConfig.socketBaseURL`.
   */
  socketBaseURL?: string;
  /**
   * Frappe site name — the Socket.IO namespace the realtime connection must
   * join. Required whenever the `baseURL` hostname is not the bench site
   * name (e.g. baseURL http://127.0.0.1:8000 serving site "localhost"). See
   * `RealtimeConfig.siteName`.
   */
  siteName?: string;
  /** Authentication configuration */
  auth?: {
    useToken?: boolean;
    token?: string | (() => string | Promise<string>);
    type?: string;
    /** Session id for Socket.IO cookie auth on Node / React Native */
    sessionId?: string | (() => string | Promise<string>);
  };
  /** Sync options for the SyncModule */
  syncOptions?: SyncOptions;
  /**
   * Extra Socket.IO client options merged over the defaults — e.g.
   * `{ transports: ["polling", "websocket"] }` behind dev proxies that can't
   * forward WebSocket upgrades (websocket-first would never connect there).
   */
  socketOptions?: RealtimeConfig['socketOptions'];
  /** Fixture provider for testing (used by frappe-ui in development) */
  fixtures?: FixtureProvider;
}

// Shared SyncModule instances keyed by baseURL to avoid duplicates (live mode)
const syncModuleCache = new Map<string, SyncModule>();
// Fixture-mode SyncModules keyed by the FixtureProvider instance so each unique
// fixture set gets its own SyncModule (prevents cross-test cache pollution).
const fixtureSyncModuleCache = new WeakMap<FixtureProvider, Map<string, SyncModule>>();
// A WeakMap can't be enumerated, so this slot is how the accessor below sees
// a fixture-mode module. WeakRef rather than an explicit clear: nothing
// refcounts SyncModules, and a strong slot would pin a discarded fixture
// set's module (and its FixtureProvider) and hand devtools a dead one.
// Runtimes without WeakRef never fill the slot and keep the live-cache scan.
let latestSyncModule: WeakRef<SyncModule> | undefined;

const rememberLatestSyncModule = (sync: SyncModule): void => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- feature-detects a global that some runtimes lack (or stub to undefined)
  if (typeof WeakRef === 'function') {
    latestSyncModule = new WeakRef(sync);
  }
};

const getFixtureSyncModule = (
  fixtures: FixtureProvider,
  optionsKey: string,
  syncOptions: SyncOptions | undefined,
): SyncModule => {
  let cache = fixtureSyncModuleCache.get(fixtures);
  if (!cache) {
    cache = new Map();
    fixtureSyncModuleCache.set(fixtures, cache);
  }
  let sync = cache.get(optionsKey);
  if (!sync) {
    // SAFETY: FixtureDbModule implements the DbModule surface SyncModule calls, backed by the fixture corpus.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
    const db = new FixtureDbModule(fixtures) as unknown as DbModule;
    sync = new SyncModule(db, undefined, syncOptions);
    cache.set(optionsKey, sync);
    rememberLatestSyncModule(sync);
  }
  return sync;
};

const liveSyncModuleKey = (baseURL: string, config: UseFrappeCollectionConfig, optionsKey: string): string =>
  [
    baseURL,
    config.realtime === false ? 'http' : 'realtime',
    config.socketPort ?? '',
    config.socketBaseURL ?? '',
    config.siteName ?? '',
    optionsKey,
    config.auth?.useToken ? 't' : '',
    config.auth?.token ?? '',
    config.auth?.type ?? '',
    config.auth?.sessionId ?? '',
  ].join('|');

/**
 * Gets or creates a shared SyncModule for the given config.
 * SyncModules are cached by baseURL to prevent duplicate connections.
 *
 * When `config.fixtures` is set, creates a SyncModule backed by
 * FixtureDbModule so the full pipeline (virtual pagination, progressive
 * cache, mutation journal, devtools) works identically with mock data.
 * Fixture-mode SyncModules are keyed by the FixtureProvider instance so
 * different fixture sets never share cached state (important in tests).
 *
 * Returns `undefined` during SSR (Node.js) because a server render must not
 * open sockets or share client caches. Every real client runtime constructs
 * the module: web, React Native, and GJS/GNOME (isBrowser() covers all
 * three; the engine's storage/BroadcastChannel/window usages are guarded
 * per platform).
 */
const getSyncModule = (config: UseFrappeCollectionConfig): SyncModule | undefined => {
  if (!isBrowser()) {
    return undefined;
  }
  const optionsKey = syncOptionsKey(config.syncOptions);

  if (config.fixtures) {
    return getFixtureSyncModule(config.fixtures, optionsKey, config.syncOptions);
  }

  // No fixtures and no baseURL: there is nothing to dial. Same contract as
  // SSR above — consumers render their loading/empty state instead of
  // constructing an HttpClient against `undefined`.
  if (config.baseURL === undefined || config.baseURL === '') {
    return undefined;
  }

  // Key on the full socket target, not just baseURL: socketPort /
  // socketBaseURL / siteName all change where (or how) the realtime socket
  // dials, so configs that differ in them must not share a SyncModule —
  // sharing would silently keep the FIRST config's socket target for every
  // later consumer. Consumers reading the same FrappeProvider still coalesce
  // (identical fields → identical key).
  const key = liveSyncModuleKey(config.baseURL, config, optionsKey);
  let sync = syncModuleCache.get(key);
  if (!sync) {
    const authConfig: AuthConfig | undefined = config.auth
      ? {
          useToken: config.auth.useToken,
          token: config.auth.token,
          // SAFETY: the public config takes the auth scheme as a plain string; HttpClient sends it verbatim.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          type: config.auth.type as AuthConfig['type'],
          sessionId: config.auth.sessionId,
        }
      : undefined;
    const http = new HttpClient(config.baseURL, authConfig);
    const db = new DbModule(http, {
      appName: 'live.live',
      writeStrategy: config.syncOptions?.writeStrategy,
    });
    const realtimeConfig = {
      baseURL: config.baseURL,
      socketPort: config.socketPort,
      socketBaseURL: config.socketBaseURL,
      // Forward siteName: Frappe's realtime server only emits events on the
      // site's namespace, so dropping it here silently connected sockets to
      // a namespace the server rejects whenever the baseURL hostname isn't
      // the site name (e.g. 127.0.0.1 vs "localhost").
      siteName: config.siteName,
      auth: authConfig,
      socketOptions: config.socketOptions,
    };
    sync = new SyncModule(
      db,
      config.realtime === false ? undefined : new RealtimeModule(realtimeConfig),
      config.syncOptions,
    );
    syncModuleCache.set(key, sync);
    rememberLatestSyncModule(sync);
  }
  return sync;
};

/**
 * Returns the most recently constructed SyncModule (live or fixture mode),
 * falling back to the first live one, or undefined if none exist.
 * Intended for devtools integration — not part of the public API.
 */
// oxlint-disable-next-line sonarjs/function-name, sonarjs/variable-name -- dunder prefix marks the devtools-only export; renaming breaks importers
export const __getActiveSyncModule = (): SyncModule | undefined =>
  latestSyncModule?.deref() ?? syncModuleCache.values().next().value;

/**
 * Public accessor for the shared SyncModule behind a connection config —
 * the seam consumers use to issue engine mutations that a collection can't
 * express (e.g. custom-transport writes via `mutation.execute`). Returns
 * the same refcounted instance the collection hooks use, or undefined
 * during SSR.
 */
export const getFrappeSyncModule = (config: UseFrappeCollectionConfig | undefined): SyncModule | undefined => {
  if (!config) {
    return undefined;
  }
  return getSyncModule(config);
};

// ---------------------------------------------------------------------------
// Shared collection cache
// ---------------------------------------------------------------------------
//
// One Collection per (SyncModule, doctype, options) so N consumers of the
// same subscription shape share one collection — one initial fetch, one
// SyncModule subscription, one realtime room — instead of N (e.g. the desk
// form page's FrappeForm + DeskFormSidebar both subscribing to the same doc).
//
// Entries are refcounted by mounted hook instances. When the last consumer
// unmounts, the entry is cleaned up after a short grace period (covers
// StrictMode remounts and quick route transitions). Because live queries
// subscribe to the collection OUTSIDE the hook refcount (synchronously during
// render, detaching asynchronously via TanStack DB's own GC), the grace GC
// additionally defers — keeping the entry cached — while
// `collection.subscriberCount > 0`, bounded by SHARED_COLLECTION_GC_FORCE_MS
// so leaked queries from never-committed renders can't pin the subscription
// forever. The outer WeakMap keys on the SyncModule instance, which
// `getSyncModule` already dedupes per baseURL (live) / per FixtureProvider
// (fixtures) — so fixture sets never share cached collections across tests,
// and the cache dies with its provider.

type FrappeDoc = object & { name: string; doctype: string };

// The cache holds collections for every doctype side by side; each hook
// re-types its own entry at the boundary (see useFrappeCollection).
// oxlint-disable-next-line typescript/no-explicit-any -- heterogeneous per-doctype collections share one cache
type AnyCollection = Collection<any, string>;

type SyncErrorHandler = NonNullable<FrappeCollectionOptionsConfig<FrappeDoc>['onSyncError']>;

const noop = (): void => {
  // Nothing to subscribe to or tear down.
};

interface SharedCollectionEntry {
  collection: AnyCollection;
  refCount: number;
  gcTimer: ReturnType<typeof setTimeout> | null;
  /** While the hook refcount is 0 but live queries still subscribe to the
   * collection, GC is deferred — until this wall-clock deadline, after which
   * the entry is force-cleaned (leak guard for queries created by renders
   * that never committed; see scheduleEntryGc). Reset on every retain. */
  gcForceDeadline: number | null;
  /** Per-consumer onSyncError handlers, fanned out from the one collection. */
  errorHandlers: Set<SyncErrorHandler>;
  /** Initial-sync failure. The entry HOLDS its error state while any consumer
   * retains it: re-renders keep acquiring the same errored entry, so an
   * error-in-state consumer cannot loop failing fetches (the retry storm that
   * froze error/loading stories). The flag is replayed on retain so a
   * consumer whose render raced the failure — or that mounts later while the
   * error is held — still surfaces it. The entry is evicted when the LAST
   * consumer releases it, so the next mount (an explicit Retry remount, per
   * the consumer retry contract) is the one place a fresh sync attempt
   * starts. */
  hasSyncError: boolean;
  lastSyncError: unknown;
  cleaned: boolean;
}

interface SharedCollectionHandle {
  cache: Map<string, SharedCollectionEntry>;
  entry: SharedCollectionEntry;
}

const sharedCollectionCaches = new WeakMap<SyncModule, Map<string, SharedCollectionEntry>>();

/** Grace before an unreferenced entry is cleaned up (also the leak guard for
 * entries created by renders that never committed). */
const SHARED_COLLECTION_GC_MS = 1000;

/** How long an unreferenced entry may stay alive because live queries still
 * subscribe to its collection, before GC stops deferring and force-cleans.
 * Covers every legitimate straggler — an unmounted `useLiveQuery`'s detach
 * runs through TanStack DB's own GC + requestIdleCallback (~1–2s), and a
 * suspended tree that commits re-retains long before this — while still
 * reclaiming collections pinned by leaked queries (a live query created by a
 * render that never committed never receives a subscriber, and TanStack DB
 * only arms a live query's own GC when a subscriber detaches). */
const SHARED_COLLECTION_GC_FORCE_MS = 30_000;

/** True when TanStack DB has torn this collection down (`cleanup()` ran and
 * sync has not been restarted). Attached live queries are permanently broken
 * at that point — TanStack transitions them to an error state they never
 * leave — so consumers must be handed a FRESH collection instance. */
const collectionIsCleanedUp = (collection: AnyCollection): boolean => collection.status === 'cleaned-up';

/** Live queries currently attached to the collection. */
const liveSubscriberCount = (collection: AnyCollection): number => collection.subscriberCount ?? 0;

/** Everything that changes what the underlying subscription fetches. */
const collectionOptionsKey = <TDoc extends FrappeDoc>(
  doctype: string,
  options?: Omit<FrappeCollectionOptionsConfig<TDoc>, 'sync'>,
): string =>
  [
    doctype,
    JSON.stringify(options?.fields),
    JSON.stringify(options?.filters),
    JSON.stringify(options?.orderBy),
    String(options?.limit),
    String(options?.id),
  ].join('|');

/** Best-effort Collection.cleanup(): failures are swallowed (see call sites). */
const cleanupCollectionQuietly = async (collection: AnyCollection): Promise<void> => {
  try {
    await collection.cleanup?.();
  } catch {
    // Safe to ignore: TanStack DB restarts a cleaned-up collection on next
    // use, so a failed teardown leaves nothing a consumer can observe.
  }
};

const scheduleEntryGc = (
  cache: Map<string, SharedCollectionEntry>,
  key: string,
  entry: SharedCollectionEntry,
): void => {
  if (entry.gcTimer) {
    clearTimeout(entry.gcTimer);
  }
  entry.gcTimer = setTimeout(() => {
    entry.gcTimer = null;
    if (entry.refCount > 0 || entry.cleaned) {
      return;
    }
    // The hook refcount doesn't cover live queries: `useLiveQuery` attaches
    // to the collection synchronously during render (before the retain
    // effect commits) and detaches asynchronously after unmount (TanStack
    // DB's own GC + an idle callback). Calling cleanup() while any query is
    // attached permanently errors it ("Source collection … was manually
    // cleaned up while live query … depends on it") — and a query erroring
    // while still loading never notifies React, wedging `isLoading` gates
    // (the "Loading workspaces…" stick). Defer GC while subscribers remain;
    // the entry stays cached so a remount reuses the SAME live collection.
    if (liveSubscriberCount(entry.collection) > 0) {
      entry.gcForceDeadline ??= Date.now() + SHARED_COLLECTION_GC_FORCE_MS;
      if (Date.now() < entry.gcForceDeadline) {
        scheduleEntryGc(cache, key, entry);
        return;
      }
      // Past the deadline: a leaked query (created by a render that never
      // committed — TanStack DB never GCs a live query that never had a
      // subscriber) is pinning the sync subscription + realtime room.
      // Calling cleanup() here would transition EVERY attached live query
      // to a permanent error state with a console.error per query ("Source
      // collection 'X' was manually cleaned up while live query … depends
      // on it" — the Workspace console-sweep bug), so release the
      // Frappe-side resources directly instead and leave the collection
      // object alive but inert. The entry is still evicted: any consumer
      // that appears later gets a fresh instance via the stale-entry paths
      // in getOrCreateSharedCollection / the hook.
      entry.cleaned = true;
      entry.gcForceDeadline = null;
      if (cache.get(key) === entry) {
        cache.delete(key);
      }
      if (releaseFrappeCollectionSync(entry.collection)) {
        return;
      }
      // No active sync session registered (non-frappe collection or sync
      // never started) — fall through to the plain cleanup below.
    }
    entry.cleaned = true;
    entry.gcForceDeadline = null;
    if (cache.get(key) === entry) {
      cache.delete(key);
    }
    // Best-effort: Collection.cleanup() stops the sync (unsubscribes from the
    // SyncModule, leaving the realtime room). A consumer that raced eviction
    // still works — TanStack DB restarts a cleaned-up collection on next use.
    // Safe here: subscriberCount is 0, so no live query depends on it.
    void cleanupCollectionQuietly(entry.collection);
  }, SHARED_COLLECTION_GC_MS);
};

const getOrCreateSharedCollection = <TDoc extends FrappeDoc>(
  syncModule: SyncModule,
  doctype: string,
  options: Omit<FrappeCollectionOptionsConfig<TDoc>, 'sync'> | undefined,
  key: string,
): SharedCollectionHandle => {
  let existingCache = sharedCollectionCaches.get(syncModule);
  if (!existingCache) {
    existingCache = new Map();
    sharedCollectionCaches.set(syncModule, existingCache);
  }
  const cache = existingCache;
  let entry = cache.get(key);
  // A cached entry whose collection was cleaned up out-of-band (manual
  // cleanup() call, TanStack DB's own idle GC) is stale: queries attached at
  // cleanup time are permanently errored, so hand out a fresh instance.
  if (entry && !entry.cleaned && collectionIsCleanedUp(entry.collection)) {
    entry.cleaned = true;
    if (entry.gcTimer) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = null;
    }
  }
  if (!entry || entry.cleaned) {
    const created: SharedCollectionEntry = {
      // SAFETY: placeholder only — assigned right below, before the entry is cached or handed out.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
      collection: null as unknown as AnyCollection,
      refCount: 0,
      gcTimer: null,
      gcForceDeadline: null,
      errorHandlers: new Set(),
      hasSyncError: false,
      lastSyncError: null,
      cleaned: false,
    };
    created.collection = createFrappeCollection<TDoc>(doctype, {
      ...options,
      sync: syncModule,
      onSyncError: (error) => {
        created.hasSyncError = true;
        created.lastSyncError = error;
        // Do NOT evict here. The error handlers below typically setState in
        // consumers → re-render → render-time acquire; evicting now would
        // hand that very re-render a fresh entry with a fresh failing sync,
        // looping fetch → error → re-render forever (the retry storm — it
        // OOM'd vitest workers and froze storybook renderers). The errored
        // entry stays cached and shared so mounted consumers reach a stable
        // fixpoint; releaseSharedCollection evicts it when the last holder
        // unmounts, giving the NEXT mount (an explicit Retry) one fresh
        // attempt.
        for (const handler of created.errorHandlers) {
          handler(error);
        }
      },
    });
    cache.set(key, created);
    // Provisional GC: if no consumer ever retains this entry (the creating
    // render was discarded), it must not leak a live subscription.
    scheduleEntryGc(cache, key, created);
    entry = created;
  }
  return { cache, entry };
};

const retainSharedCollection = (entry: SharedCollectionEntry, onSyncError: SyncErrorHandler): void => {
  entry.refCount += 1;
  if (entry.gcTimer) {
    clearTimeout(entry.gcTimer);
    entry.gcTimer = null;
  }
  entry.gcForceDeadline = null;
  entry.errorHandlers.add(onSyncError);
  if (entry.hasSyncError) {
    onSyncError(entry.lastSyncError);
  }
};

/**
 * Cleans up an already-evicted entry's collection once no live queries are
 * attached — polling on the GC cadence, bounded by the force window (leaked
 * queries from never-committed renders would otherwise pin the sync
 * subscription forever). The entry must already be marked `cleaned` and
 * removed from the cache: nothing re-acquires it, so the only remaining
 * subscribers are queries mid-detach.
 */
const cleanupEntryCollectionWhenIdle = (entry: SharedCollectionEntry): void => {
  const deadline = Date.now() + SHARED_COLLECTION_GC_FORCE_MS;
  const tick = () => {
    entry.gcTimer = null;
    if (liveSubscriberCount(entry.collection) > 0) {
      if (Date.now() < deadline) {
        entry.gcTimer = setTimeout(tick, SHARED_COLLECTION_GC_MS);
        return;
      }
      // Queries are still attached past the force window (leaked queries
      // from never-committed renders). cleanup() would permanently error
      // each of them with a console.error — release the sync resources
      // externally instead; the collection object stays alive but inert.
      if (releaseFrappeCollectionSync(entry.collection)) {
        return;
      }
    }
    void cleanupCollectionQuietly(entry.collection);
  };
  entry.gcTimer = setTimeout(tick, SHARED_COLLECTION_GC_MS);
};

const releaseSharedCollection = (
  cache: Map<string, SharedCollectionEntry>,
  key: string,
  entry: SharedCollectionEntry,
  onSyncError: SyncErrorHandler,
): void => {
  entry.errorHandlers.delete(onSyncError);
  entry.refCount = Math.max(0, entry.refCount - 1);
  if (entry.refCount > 0 || entry.cleaned) {
    return;
  }
  if (entry.hasSyncError) {
    // Last holder of an errored entry released: evict + mark cleaned NOW (no
    // grace) so the next mount starts a fresh sync attempt. This is what
    // makes a consumer's Retry-by-remount contract work — the remounting
    // body's effect finds this entry `cleaned`, bumps, and acquires a fresh
    // one. A grace period here would hand the retry the same stale error
    // back. The underlying collection is cleaned up once its live queries
    // detach (an immediate cleanup() would hard-error queries created in the
    // same commit — unmount ordering runs this release before useLiveQuery's
    // own detach).
    entry.cleaned = true;
    if (entry.gcTimer) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = null;
    }
    entry.gcForceDeadline = null;
    if (cache.get(key) === entry) {
      cache.delete(key);
    }
    cleanupEntryCollectionWhenIdle(entry);
    return;
  }
  scheduleEntryGc(cache, key, entry);
};

const subscribeHydration = () => noop;
const clientCollectionAvailable = () => true;
const serverCollectionAvailable = () => false;

/**
 * React hook that returns a TanStack DB Collection backed by a Frappe doctype.
 *
 * Collections are shared: every hook instance with the same connection,
 * doctype, and options (fields/filters/orderBy/limit/id) receives the SAME
 * collection instance backed by ONE SyncModule subscription and ONE realtime
 * room. Instances are refcounted — the shared collection is cleaned up
 * shortly after the last consumer unmounts. `onSyncError` callbacks are
 * per-consumer: each mounted consumer's handler fires (replayed on retain
 * for late mounts). A failed initial sync is HELD by the entry while any
 * consumer retains it — error-state re-renders reuse the same errored
 * collection instead of looping fresh failing syncs — and the entry is
 * evicted when the last consumer releases it, so the next mount (an
 * explicit Retry remount) starts exactly one fresh attempt.
 *
 * The collection is stable across re-renders. It can be used with
 * `useLiveQuery` for reactive queries and has `.insert()`, `.update()`,
 * `.delete()` methods for mutations.
 *
 * @template TDoc - The Frappe document type
 * @param config - Connection configuration (baseURL, auth)
 * @param doctype - The Frappe doctype name
 * @param options - Optional collection configuration (fields, filters, etc.)
 * @returns A stable collection, or undefined during SSR/hydration or without config
 *
 * @example
 * ```tsx
 * function PokemonList() {
 *   const config = useFrappeConfig();
 *   const collection = useFrappeCollection<Pokemon>(
 *     config ? { baseURL: config.baseURL, auth: config.auth } : undefined,
 *     "Pokemon",
 *     { fields: ["name", "pokemon_name", "poke_id"] }
 *   );
 *
 *   const { data, isLoading } = useLiveQuery(
 *     (q) => collection ? q.from({ pokemon: collection }) : null,
 *     [collection]
 *   );
 *
 *   if (isLoading) return <Spinner />;
 *   return data?.map(p => <div key={p.name}>{p.pokemon_name}</div>);
 * }
 * ```
 */
export const useFrappeCollection = <TDoc extends object & { name: string; doctype: string }>(
  config: UseFrappeCollectionConfig | undefined,
  doctype: string,
  options?: Omit<FrappeCollectionOptionsConfig<TDoc>, 'sync'>,
): Collection<TDoc, string> | undefined => {
  // Each hydrating boundary must match SSR even if an earlier reader has
  // already filled the shared cache. Client-only and native mounts read true.
  const collectionAvailable = useSyncExternalStore(
    subscribeHydration,
    clientCollectionAvailable,
    serverCollectionAvailable,
  );
  // Consumers pass inline onSyncError closures; keep one stable wrapper per
  // hook instance so the entry's handler registry doesn't churn every render.
  const errorHandlerRef = useRef(options?.onSyncError);
  errorHandlerRef.current = options?.onSyncError;
  const stableErrorHandler = useCallback<SyncErrorHandler>((error) => {
    errorHandlerRef.current?.(error);
  }, []);

  const [, setStaleEntryBump] = useState(0);

  // Resolve the shared entry during render so the collection is available on
  // the first client-only/native render and after hydration. An empty doctype is
  // treated like an undefined config: consumers such as DynamicLink pass ""
  // before a doctype is chosen, and syncing doctype "" fires a bogus
  // `/api/v2/document/` 404. During SSR, getSyncModule returns undefined —
  // the component renders a loading state and the client hydration pass
  // exposes the real collection after this boundary hydrates.
  let cache: Map<string, SharedCollectionEntry> | undefined;
  let key = '';
  let entry: SharedCollectionEntry | undefined;
  if (collectionAvailable && config && doctype) {
    const syncModule = getSyncModule(config);
    if (syncModule) {
      key = collectionOptionsKey(doctype, options);
      ({ cache, entry } = getOrCreateSharedCollection<TDoc>(syncModule, doctype, options, key));
    }
  }

  useEffect(() => {
    if (!entry || !cache) {
      return noop;
    }
    if (entry.cleaned || collectionIsCleanedUp(entry.collection)) {
      // Lost an eviction race between render and commit (needs a multi-second
      // stall) — re-render to pick up a fresh entry from the cache.
      setStaleEntryBump((n) => n + 1);
      return noop;
    }
    const retained = entry;
    const retainedCache = cache;
    const retainedKey = key;
    retainSharedCollection(retained, stableErrorHandler);
    // Revive on out-of-band cleanup (a manual cleanup() call or TanStack DB's
    // own idle GC after every query detached): live queries attached at
    // cleanup time are permanently errored and never notify React on their
    // own, so mark the entry stale and re-render — consumers pick up a fresh
    // collection instance, which restarts their live queries.
    const unsubscribeStatus = retained.collection.on?.('status:change', (event) => {
      if (event?.status !== 'cleaned-up' || retained.cleaned) {
        return;
      }
      retained.cleaned = true;
      setStaleEntryBump((n) => n + 1);
    });
    return () => {
      unsubscribeStatus?.();
      releaseSharedCollection(retainedCache, retainedKey, retained, stableErrorHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, stableErrorHandler]);

  // SAFETY: the entry was created for this doctype + options key by createFrappeCollection<TDoc>.
  return entry ? (entry.collection as Collection<TDoc, string>) : undefined;
};

// ---------------------------------------------------------------------------
// Connection / realtime hooks
// ---------------------------------------------------------------------------

export interface UseFrappeCatchUpResult extends SyncCatchUpState {
  retry: () => Promise<SyncCatchUpState>;
}

const idleCatchUpState: SyncCatchUpState = Object.freeze({
  refreshing: false,
  stale: false,
  error: null,
});

/** Connection-level refresh qualification. Retry resolves with state, including failures. */
export const useFrappeCatchUp = (config: UseFrappeCollectionConfig | undefined): UseFrappeCatchUpResult => {
  const sync = getFrappeSyncModule(config);
  const subscribe = useCallback((listener: () => void) => sync?.subscribeStore(listener) ?? noop, [sync]);
  const snapshot = useCallback(() => sync?.getCatchUpState() ?? idleCatchUpState, [sync]);
  const state = useSyncExternalStore(subscribe, snapshot, () => idleCatchUpState);
  const retry = useCallback(async () => await (sync?.catchUp() ?? Promise.resolve(idleCatchUpState)), [sync]);
  return useMemo(() => ({ ...state, retry }), [state, retry]);
};

/** Snapshot returned by {@link useFrappeConnection}. */
export interface FrappeConnectionState {
  /** Socket connected right now. */
  connected: boolean;
  /** Socket has connected at least once this session. */
  everConnected: boolean;
}

const DISCONNECTED_STATE: FrappeConnectionState = Object.freeze({
  connected: false,
  everConnected: false,
});

/**
 * React hook exposing the realtime socket state for the given connection.
 *
 * `connected` flips on every socket connect/disconnect; `everConnected`
 * distinguishes "reconnecting" (show an indicator) from "realtime was never
 * up" (fixture mode / SSR / no socket — show nothing). Fixture-backed
 * configs always report disconnected/never-connected.
 */
export const useFrappeConnection = (config: UseFrappeCollectionConfig | undefined): FrappeConnectionState => {
  const [state, setState] = useState<FrappeConnectionState>(DISCONNECTED_STATE);
  const syncModule = config && !config.fixtures && config.realtime !== false ? getSyncModule(config) : undefined;

  useEffect(() => {
    if (!syncModule) {
      // oxlint-disable-next-line react/set-state-in-effect -- losing the socket source resets the snapshot to the shared constant (a no-op re-render when already disconnected)
      setState(DISCONNECTED_STATE);
      return noop;
    }

    const read = () => {
      const next = syncModule.getConnectionState();
      setState((prev) =>
        prev.connected === next.connected && prev.everConnected === next.everConnected ? prev : next,
      );
    };
    read();
    return syncModule.subscribeStore(read);
  }, [syncModule]);

  return config?.realtime === false ? DISCONNECTED_STATE : state;
};

/**
 * React hook that joins a doctype's realtime room and invokes `onEvent`
 * for every realtime event targeting that doctype (doc_update, list_update,
 * doc_deleted). Intended for consumers that manage their own fetching
 * (e.g. server-side paginated tables) and want live invalidation hints.
 *
 * The handler is kept in a ref, so an inline function is fine.
 */
export const useFrappeDoctypeEvents = (
  config: UseFrappeCollectionConfig | undefined,
  doctype: string,
  onEvent: (event: { type: string; payload?: unknown }) => void,
  enabled = true,
): void => {
  const handlerRef = useRef(onEvent);
  // oxlint-disable-next-line react/refs -- latest-handler ref: the subscription reads it, so an inline onEvent never resubscribes
  handlerRef.current = onEvent;
  const realtimeConfig = config && !config.fixtures && config.realtime !== false ? config : undefined;
  const syncModule = enabled && realtimeConfig && doctype ? getSyncModule(realtimeConfig) : undefined;

  useEffect(() => {
    if (!syncModule) {
      return noop;
    }

    syncModule.watchDoctype(doctype);
    const unsubscribe = syncModule.subscribeRealtimeEvents((event) => {
      // SAFETY: Frappe realtime payloads are doc/list objects whose optional `doctype` names their target.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      const payload = event.payload as { doctype?: string } | undefined;
      const payloadDoctype = payload?.doctype;
      if (payloadDoctype !== undefined && payloadDoctype !== '' && payloadDoctype !== doctype) {
        return;
      }
      handlerRef.current({ type: event.type, payload: event.payload });
    });

    return () => {
      unsubscribe();
      syncModule.unwatchDoctype(doctype);
    };
  }, [syncModule, doctype]);
};

// ---------------------------------------------------------------------------
// Mutation ledger hook
// ---------------------------------------------------------------------------

/** Result of {@link useFrappePendingMutations}. */
export interface UseFrappePendingMutationsResult {
  /** All live ledger entries (pending + failed), submission order. */
  entries: DebugMutationEntry[];
  /** Entries still awaiting a server ack. */
  pending: DebugMutationEntry[];
  /** Entries the server rejected — rollback already ran; show these. */
  failed: DebugMutationEntry[];
  /** Re-issues every pending/failed entry with its ORIGINAL mutation id
   * (idempotent on the server via Idempotency-Key). */
  retry: () => Promise<void>;
  /** Drops one failed entry without retrying (clears the error surface). */
  dismiss: (id: string) => void;
}

const EMPTY_LEDGER: DebugMutationEntry[] = [];

/**
 * React hook exposing the mutation ledger for a connection (optionally
 * scoped to one doctype): which optimistic writes are still in flight and
 * which the server rejected. This is the state behind the rejected-write
 * UI contract — a surface that initiated a write renders `failed` entries
 * inline (e.g. via frappe-ui's `SyncErrorNotice`) with `retry`/`dismiss`.
 *
 * Reactive: re-reads on every store emit, but only re-renders when the
 * ledger signature (ids × status × retryCount) actually changes.
 */
export const useFrappePendingMutations = (
  config: UseFrappeCollectionConfig | undefined,
  doctype?: string,
): UseFrappePendingMutationsResult => {
  const [entries, setEntries] = useState<DebugMutationEntry[]>(EMPTY_LEDGER);
  const syncModuleRef = useRef<SyncModule | null>(null);
  const syncModule = getFrappeSyncModule(config);

  useEffect(() => {
    if (!syncModule) {
      // oxlint-disable-next-line react/set-state-in-effect -- losing the connection clears the ledger to the shared empty constant
      setEntries(EMPTY_LEDGER);
      return noop;
    }
    syncModuleRef.current = syncModule;

    let lastSignature: string | undefined;
    const read = () => {
      const next = syncModule.getMutationEntries(doctype);
      const signature = next.map((e) => `${e.id}:${e.status}:${e.retryCount}`).join('|');
      if (signature === lastSignature) {
        return;
      }
      lastSignature = signature;
      setEntries(next.length === 0 ? EMPTY_LEDGER : next);
    };
    read();
    const unsubscribe = syncModule.subscribeStore(read);
    return () => {
      unsubscribe();
      syncModuleRef.current = null;
    };
  }, [syncModule, doctype]);

  const retry = useCallback(async () => {
    await syncModuleRef.current?.replayPending();
  }, []);

  const dismiss = useCallback((id: string) => {
    syncModuleRef.current?.dismissMutation(id);
  }, []);

  return useMemo(() => {
    const pending = entries.filter((e) => e.status === Status.Pending);
    const failed = entries.filter((e) => e.status === Status.Failed);
    return { entries, pending, failed, retry, dismiss };
  }, [entries, retry, dismiss]);
};

// ---------------------------------------------------------------------------
// Infinite Scroll Hook
// ---------------------------------------------------------------------------

/**
 * Configuration for the useInfiniteScroll hook
 */
export interface UseInfiniteScrollConfig {
  /** Whether more data is available to load */
  hasMore: boolean;
  /** Whether data is currently being loaded */
  isLoading: boolean;
  /** Function to call when more data should be loaded */
  onLoadMore: () => void | Promise<void>;
  /** Root element for intersection (default: viewport) */
  root?: Element | null;
  /** Margin around the root (default: "100px") */
  rootMargin?: string;
  /** Visibility threshold 0-1 (default: 0.1) */
  threshold?: number;
  /** Debounce delay in ms (default: 100) */
  debounceMs?: number;
  /** Enable/disable the hook (default: true) */
  enabled?: boolean;
}

/**
 * Result from the useInfiniteScroll hook
 */
export interface UseInfiniteScrollResult {
  /** Ref to attach to the sentinel element */
  sentinelRef: React.RefCallback<Element | null>;
  /** Whether the sentinel is currently visible */
  isVisible: boolean;
  /** Whether load more is in progress */
  isLoadingMore: boolean;
}

/**
 * React hook for automatic infinite scroll loading.
 *
 * Uses IntersectionObserver to detect when a sentinel element becomes visible
 * and automatically triggers loading of more data. Includes debouncing to prevent
 * rapid-fire requests.
 *
 * @param config - Configuration options
 * @returns Object with sentinelRef to attach to your loading indicator element
 *
 * @example
 * ```tsx
 * function PokemonList() {
 *   const [page, setPage] = useState(1);
 *   const { data, hasMore, isLoading } = usePokemonList(page);
 *
 *   const { sentinelRef, isLoadingMore } = useInfiniteScroll({
 *     hasMore,
 *     isLoading,
 *     onLoadMore: () => setPage(p => p + 1),
 *   });
 *
 *   return (
 *     <div>
 *       {data.map(pokemon => <PokemonCard key={pokemon.name} pokemon={pokemon} />)}
 *       <div ref={sentinelRef}>
 *         {isLoadingMore ? <Spinner /> : hasMore ? "Scroll for more" : "No more items"}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
export const useInfiniteScroll = (config: UseInfiniteScrollConfig): UseInfiniteScrollResult => {
  const {
    hasMore,
    isLoading,
    onLoadMore,
    root = null,
    rootMargin = '100px',
    threshold = 0.1,
    debounceMs = 100,
    enabled = true,
  } = config;

  const [isVisible, setIsVisible] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<Element | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadTimeRef = useRef<number>(0);

  // Stable callback for loading more
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || isLoadingMore) {
      return;
    }

    // Debounce rapid calls
    const now = Date.now();
    if (now - lastLoadTimeRef.current < debounceMs) {
      return;
    }
    lastLoadTimeRef.current = now;

    setIsLoadingMore(true);
    try {
      await onLoadMore();
    } catch (error) {
      setIsLoadingMore(false);
      throw error;
    }
    setIsLoadingMore(false);
  }, [hasMore, isLoading, isLoadingMore, onLoadMore, debounceMs]);

  // Set up IntersectionObserver — web only. isBrowser() is TRUE on React
  // Native (it gates the sync pipeline, which runs there), but
  // IntersectionObserver is a DOM API: gate on window presence + the
  // constructor itself so the hook is a safe no-op on native.
  useEffect(() => {
    if (!isWindowDefined || typeof IntersectionObserver === 'undefined' || !enabled) {
      return noop;
    }

    const node = sentinelNodeRef.current;
    if (!node) {
      return noop;
    }

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        const visible = entry?.isIntersecting ?? false;
        setIsVisible(visible);

        if (visible && hasMore && !isLoading && !isLoadingMore) {
          // Clear any pending debounce timer
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          // Schedule load with debounce
          debounceTimerRef.current = setTimeout(() => {
            void loadMore();
          }, debounceMs);
        }
      },
      {
        root,
        rootMargin,
        threshold,
      },
    );

    observerRef.current.observe(node);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [enabled, root, rootMargin, threshold, hasMore, isLoading, isLoadingMore, loadMore, debounceMs]);

  // Ref callback to capture the sentinel element
  const sentinelRef = useCallback((node: Element | null) => {
    sentinelNodeRef.current = node;

    // Re-observe when node changes
    if (observerRef.current && node) {
      observerRef.current.disconnect();
      observerRef.current.observe(node);
    }
  }, []);

  return {
    sentinelRef,
    isVisible,
    isLoadingMore,
  };
};

/**
 * Options for the useFrappeInfiniteList hook
 */
export interface UseFrappeInfiniteListConfig<TDoc> {
  /** Frappe connection configuration */
  config: UseFrappeCollectionConfig | undefined;
  /** DocType to query */
  doctype: string;
  /** Fields to fetch */
  fields?: string[];
  /** Filters to apply */
  filters?: SubscriptionQuery['filters'];
  /** Order by specification */
  orderBy?: OrderBy;
  /** Page size (default: 20) */
  pageSize?: number;
  /** Transform function for items */
  transform?: (doc: TDoc) => TDoc;
}

/**
 * Result from useFrappeInfiniteList hook
 */
export interface UseFrappeInfiniteListResult<TDoc> {
  /** All loaded items */
  items: TDoc[];
  /** Whether more items are available */
  hasMore: boolean;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether loading more is in progress */
  isLoadingMore: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Ref to attach to sentinel element */
  sentinelRef: React.RefCallback<Element | null>;
  /** Manually trigger loading more */
  loadMore: () => Promise<void>;
  /** Refresh the list from the beginning */
  refresh: () => Promise<void>;
  /** Total number of loaded items */
  totalLoaded: number;
}

/**
 * React hook for infinite scrolling through a Frappe doctype list.
 *
 * Uses SyncModule with progressive subscriptions so that infinite-scroll
 * lists automatically receive realtime updates, optimistic mutations,
 * offline support, and CDC backfill -- all features that were previously
 * only available to `useFrappeCollection` consumers.
 *
 * @template TDoc - The document type
 * @param options - Configuration options
 * @returns Object with items, loading states, and sentinelRef
 *
 * @example
 * ```tsx
 * function PokemonList() {
 *   const config = useFrappeConfig();
 *   const {
 *     items,
 *     hasMore,
 *     isLoading,
 *     sentinelRef,
 *   } = useFrappeInfiniteList<Pokemon>({
 *     config,
 *     doctype: "Pokemon",
 *     fields: ["name", "pokemon_name", "poke_id"],
 *     pageSize: 20,
 *   });
 *
 *   if (isLoading && items.length === 0) return <Spinner />;
 *
 *   return (
 *     <div>
 *       {items.map(pokemon => <PokemonCard key={pokemon.name} pokemon={pokemon} />)}
 *       <div ref={sentinelRef}>
 *         {hasMore ? <Spinner /> : "No more pokemon"}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
export const useFrappeInfiniteList = <TDoc extends object & { name: string; doctype: string }>(
  options: UseFrappeInfiniteListConfig<TDoc>,
): UseFrappeInfiniteListResult<TDoc> => {
  const { config, doctype, fields, filters, orderBy, pageSize = 20, transform } = options;

  const [items, setItems] = useState<TDoc[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const subscriptionIdRef = useRef<string | null>(null);
  const syncModuleRef = useRef<SyncModule | null>(null);

  // Stable serialized key for filters so we can depend on it in useEffect
  const filtersKey = JSON.stringify(filters);
  const syncModule = getFrappeSyncModule(config);

  // Subscribe via SyncModule with progressive: true
  useEffect(() => {
    if (!syncModule) {
      return noop;
    }
    syncModuleRef.current = syncModule;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const subscribeFirstPage = async () => {
      try {
        const result = await syncModule.subscribe({
          doctype,
          fields,
          filters,
          orderBy,
          limit: pageSize,
          progressive: true,
        });
        if (cancelled) {
          syncModule.unsubscribe(result.subscriptionId);
          return;
        }
        subscriptionIdRef.current = result.subscriptionId;

        const docs = syncModule.getDocsForSubscription<TDoc>(result.subscriptionId);
        const pageInfo = syncModule.getPageInfo(result.subscriptionId);
        setItems(transform ? docs.map(transform) : docs);
        setHasMore(pageInfo.hasMore);
      } catch (subscribeError) {
        if (!cancelled) {
          setError(subscribeError instanceof Error ? subscribeError : new Error(String(subscribeError)));
          setItems([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void subscribeFirstPage();

    // Listen for realtime / backfill changes
    const unsubStore = syncModule.subscribeStore(() => {
      const subId = subscriptionIdRef.current;
      if (subId === null || subId === '') {
        return;
      }
      const docs = syncModule.getDocsForSubscription<TDoc>(subId);
      const pageInfo = syncModule.getPageInfo(subId);
      setItems(transform ? docs.map(transform) : docs);
      setHasMore(pageInfo.hasMore);
    });

    return () => {
      cancelled = true;
      unsubStore();
      const subId = subscriptionIdRef.current;
      if (subId !== null && subId !== '') {
        syncModule.unsubscribe(subId);
        subscriptionIdRef.current = null;
      }
      syncModuleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncModule, config?.auth?.token, doctype, filtersKey, pageSize]);

  const loadMore = useCallback(async () => {
    const activeSync = syncModuleRef.current;
    const subId = subscriptionIdRef.current;
    if (!activeSync || subId === null || subId === '') {
      return;
    }
    if (!hasMore || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setError(null);

    try {
      const currentDocs = activeSync.getDocsForSubscription<TDoc>(subId);
      const lastDoc = currentDocs.at(-1);
      if (!lastDoc) {
        return;
      }

      await activeSync.getNextBatch(subId, lastDoc.name, pageSize);
      // Store listener handles items update via emit()
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, pageSize]);

  const refresh = useCallback(async () => {
    const activeSync = syncModuleRef.current;
    const subId = subscriptionIdRef.current;
    if (!activeSync || subId === null || subId === '') {
      return;
    }

    // Unsubscribe and re-subscribe to reset
    activeSync.unsubscribe(subId);
    subscriptionIdRef.current = null;
    setItems([]);
    setHasMore(true);
    setIsLoading(true);
    setError(null);

    try {
      const result = await activeSync.subscribe({
        doctype,
        fields,
        filters,
        orderBy,
        limit: pageSize,
        progressive: true,
      });
      subscriptionIdRef.current = result.subscriptionId;
      const docs = activeSync.getDocsForSubscription<TDoc>(result.subscriptionId);
      const pageInfo = activeSync.getPageInfo(result.subscriptionId);
      setItems(transform ? docs.map(transform) : docs);
      setHasMore(pageInfo.hasMore);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError : new Error(String(refreshError)));
    } finally {
      setIsLoading(false);
    }
  }, [doctype, fields, filters, orderBy, pageSize, transform]);

  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: isLoading || isLoadingMore,
    onLoadMore: loadMore,
  });

  return {
    items,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    sentinelRef,
    loadMore,
    refresh,
    totalLoaded: items.length,
  };
};

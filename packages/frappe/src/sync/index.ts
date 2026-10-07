import { onAppFocus, onOnline } from '@repo/platform';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';
import type { RealtimeModule } from '../realtime';

import { MutationEngine } from './mutationEngine';
import { MutationJournal } from './mutationJournal';
import { NormalizedCache } from './normalizedCache';
import { PersistenceManager } from './persistence';
import { RealtimeHandler } from './realtime';
import { RehydrationManager } from './rehydration';
import type { SubscriptionRefreshOptions, SubscriptionRefreshResult } from './subscriptionManager';

export type { SubscriptionRefreshOptions, SubscriptionRefreshResult } from './subscriptionManager';
import { SubscriptionManager } from './subscriptionManager';
import { BackfillScope, Status } from './types';
import type {
  BackfillArgs,
  DebugMutationEntry,
  DebugSubscription,
  SyncOptions,
  SyncCatchUpState,
  FrappeDebugState,
  Mutation,
  RealtimeEventType,
  SubscriptionQuery,
} from './types';

/** Realtime event forwarded to `subscribeRealtimeEvents` listeners. */
export interface SyncRealtimeEvent {
  type: RealtimeEventType;
  payload?: unknown;
}

function getBrowserJournalStorage(): Storage | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return undefined;
  }
  try {
    const storage = window.localStorage;
    return typeof storage?.getItem === 'function' && typeof storage.setItem === 'function' ? storage : undefined;
  } catch {
    // Browsers can deny access; Node's Web Storage is not browser-scoped.
    return undefined;
  }
}

const idleCatchUpState: SyncCatchUpState = Object.freeze({
  refreshing: false,
  stale: false,
  error: null,
});

/**
 * Synchronization engine that provides Zero-style UX on top of Frappe's REST API.
 *
 * Core capabilities:
 * - Maintains live subscriptions with realtime hints (Socket.IO events)
 * - Local normalized cache for instant reads and optimistic updates
 * - Mutation journal for idempotency, offline queuing, and replay
 * - Cursors and backfill to avoid misses after disconnects or tab sleeps
 * - Optional persistence (IndexedDB/MMKV/localStorage) and multi-tab coordination
 * - Cross-page coordination to prevent duplicate optimistic items
 * - Page locking for stable pagination during edits
 * - Intelligent rehydration strategies based on operation type
 * - Sophisticated conflict resolution with field-level merge strategies
 *
 * Design constraints:
 * - All reads/writes flow through Frappe REST to respect middleware and permissions
 * - Realtime is advisory: correctness relies on HTTP backfill, not sockets
 * - No assumptions about framework: minimal store subscription surface
 *
 * @example
 * ```typescript
 * const sync = new SyncModule(db, realtime, {
 *   pageSize: 50,
 *   persistKey: 'my-app',
 *   onConflict: (info) => console.log('Conflict:', info),
 *   fieldMergeConfig: {
 *     'Task': {
 *       'tags': 'union-set',   // FieldMergeStrategy enum value
 *       'priority': 'max',     // pick whichever side is higher
 *     }
 *   }
 * });
 *
 * // Subscribe to documents
 * const { subscriptionId } = await sync.subscribe({
 *   doctype: 'Task',
 *   fields: ['name', 'subject', 'status'],
 *   filters: { project: 'PROJ-001' },
 *   orderBy: { field: 'priority', order: 'desc' },
 *   limit: 20
 * });
 *
 * // Get documents from cache
 * const tasks = sync.getDocsForSubscription(subscriptionId);
 * ```
 */
export class SyncModule {
  private readonly normalizedCache: NormalizedCache;
  private readonly mutationJournal: MutationJournal;
  private readonly storeListeners = new Set<() => void>();
  /** Listeners registered via `subscribeRealtimeEvents`. */
  private readonly realtimeEventListeners = new Set<(event: SyncRealtimeEvent) => void>();
  private readonly subscriptionManager: SubscriptionManager;
  /** Mutation engine for optimistic updates and conflict resolution. */
  private readonly mutationEngine: MutationEngine;
  /** Realtime event handler for Socket.IO integration. */
  private readonly realtimeHandler: RealtimeHandler;
  /** Persistence manager for state snapshots. */
  private readonly persistenceManager: PersistenceManager;
  /** Rehydration manager for intelligent subscription updates. */
  private readonly rehydrationManager: RehydrationManager;
  /** Cleanup functions returned by lifecycle subscriptions. */
  private cleanupFocus?: () => void;
  private cleanupFocusReplay?: () => void;
  private cleanupOnlineBackfill?: () => void;
  private cleanupOnlineReplay?: () => void;
  /** Timer handle for periodic CDC polling. */
  private cdcIntervalHandle?: ReturnType<typeof setInterval>;
  private readonly db: DbModule;
  private readonly realtime?: RealtimeModule;
  private readonly options: SyncOptions;
  private catchUpState = idleCatchUpState;
  private catchUpEpoch = 0;
  private disposed = false;
  private catchUpRun?: {
    trailing: boolean;
    attempt: number;
    promise: Promise<SyncCatchUpState>;
  };

  constructor(db: DbModule, realtime?: RealtimeModule, options: SyncOptions = {}) {
    this.db = db;
    this.realtime = realtime;
    this.options = options;
    // Initialize normalized cache with LRU eviction if maxCacheSize is set
    this.normalizedCache = new NormalizedCache({
      maxSize: this.options.maxCacheSize,
    });
    this.mutationJournal = new MutationJournal({
      ttl: this.options.mutationTTL,
      enableAutoCleanup: true,
      storage: getBrowserJournalStorage(),
    });
    this.subscriptionManager = new SubscriptionManager(this.db, this.normalizedCache, this.options);

    // Initialize rehydration and page lock managers
    this.rehydrationManager = new RehydrationManager(
      this.db,
      this.normalizedCache,
      this.subscriptionManager,
      this.mutationJournal,
      () => {
        this.emit();
      },
    );

    this.mutationEngine = new MutationEngine(
      this.db,
      this.realtime,
      this.normalizedCache,
      this.mutationJournal,
      this.subscriptionManager,
      this.rehydrationManager,
      {
        ...this.options,
        // Bridge engine-internal optimistic applies to store listeners so
        // pending state paints BEFORE the server round trip. Without this,
        // subscribeStore consumers only re-read after the ack (mutate()'s
        // trailing emit) and the in-memory optimism was invisible to them.
        onStoreChange: () => {
          this.emit();
        },
      },
    );

    // Setup realtime handlers with callbacks to main module
    const realtimeOptions: SyncOptions = {
      ...this.options,
      onResetCache: () => {
        this.resetCache();
      },
      onBackfillAll: () => {
        void this.catchUp();
      },
      // Realtime reconciliation mutates cache/membership outside the public
      // mutate/backfill entry points — bridge those changes to store listeners.
      onStoreChange: () => {
        this.emit();
      },
      onRealtimeEvent: (event) => {
        this.options.onRealtimeEvent?.(event);
        for (const listener of this.realtimeEventListeners) {
          listener(event);
        }
      },
    };

    this.realtimeHandler = new RealtimeHandler(
      this.db,
      this.realtime,
      this.normalizedCache,
      this.subscriptionManager,
      this.rehydrationManager,
      realtimeOptions,
    );

    this.persistenceManager = new PersistenceManager(
      this.normalizedCache,
      this.mutationJournal,
      this.subscriptionManager,
      this.mutationEngine,
      realtimeOptions,
    );

    this.setupWindowEvents();
  }

  /**
   * Sets up lifecycle event listeners for sync triggers.
   * Stores cleanup functions returned by each subscription.
   */
  private setupWindowEvents() {
    this.cleanupFocus = onAppFocus(() => {
      void this.catchUp();
    });
    // Journal replay on foreground: React Native never fires `online`
    // (AppState is its only lifecycle signal), and on web this recovers
    // server-restart cases where connectivity never flipped. Guarded so it
    // is a strict no-op unless mutations are actually queued.
    this.cleanupFocusReplay = onAppFocus(() => {
      if (this.mutationJournal.listPending().length > 0) {
        void this.replayPending();
      }
    });
    this.cleanupOnlineBackfill = onOnline(() => {
      void this.catchUp();
    });
    this.cleanupOnlineReplay = onOnline(async () => await this.replayPending());

    if (this.options.cdcInterval && this.options.cdcInterval > 0) {
      this.cdcIntervalHandle = setInterval(() => {
        void this.catchUp();
      }, this.options.cdcInterval);
    }
  }

  /**
   * Creates a subscription, seeds cache with initial rows, and stores a backfill checkpoint.
   *
   * With persistence enabled, a query matching a subscription restored from
   * the snapshot is re-adopted cache-first: the returned rows come from the
   * restored cache and a background network refresh follows (`result.refresh`).
   * If that refresh fails (offline), the cached membership keeps serving and
   * the subscription is marked stale until the next successful backfill.
   */
  async subscribe<Data extends FrappeDocData>(query: SubscriptionQuery) {
    if (this.options.catchUpStrategy === 'snapshot' && query.progressive) {
      throw new Error('Snapshot catch-up does not support progressive subscriptions');
    }
    // Wait for any persisted snapshot restore so a matching restored
    // subscription can be adopted instead of racing the async load.
    await this.persistenceManager.whenReady();
    const result = await this.subscriptionManager.subscribe<Data>(query);
    // Join the doctype's realtime room so doc_update/list_update hints arrive
    // for this subscription (refcounted; survives reconnects).
    this.realtimeHandler.watchDoctype(query.doctype);
    this.emit();
    // Adopted subscriptions refresh in the background; notify store listeners
    // when the refresh lands (or marks the subscription stale). Never rejects.
    if (result.refresh) {
      void result.refresh.then(() => {
        this.emit();
      });
    }
    return result;
  }

  /**
   * Removes a subscription by id.
   */
  unsubscribe(subscriptionId: string) {
    const subscription = this.subscriptionManager.getSubscription(subscriptionId);
    this.subscriptionManager.unsubscribe(subscriptionId);
    if (subscription) {
      this.realtimeHandler.unwatchDoctype(subscription.query.doctype);
    }
    this.emit();
  }

  async mutate(mutation: Mutation<FrappeDocData>) {
    try {
      await this.mutationEngine.mutate(mutation);
    } catch (error) {
      // The failure path rolled back optimistic state (e.g. a rejected
      // create's temp row was evicted) — store listeners must see that
      // rollback too, or consumers that mirrored the optimistic membership
      // keep rendering a ghost row the engine already dropped.
      this.emit();
      throw error;
    }
    // Broadcast mutation to other tabs for cross-tab sync
    this.persistenceManager.broadcastMutation(mutation);
    this.emit();
  }

  /**
   * The name the server assigned a document this module created under
   * `temporaryName`, once the create is acknowledged. Undefined while it is
   * pending, or when the server kept the name it was given.
   */
  createdName(temporaryName: string): string | undefined {
    return this.rehydrationManager.resolveTempId(temporaryName);
  }

  /** Refresh active query snapshots in place. Failures retain the last committed data. */
  async refreshSubscriptions(options?: SubscriptionRefreshOptions): Promise<SubscriptionRefreshResult[]> {
    const epoch = this.catchUpEpoch;
    await this.persistenceManager.whenReady();
    if (this.disposed || epoch !== this.catchUpEpoch) {
      return [];
    }
    const results = await this.subscriptionManager.refreshSubscriptions(options);
    if (!this.disposed && epoch === this.catchUpEpoch) {
      this.emit();
    }
    return results;
  }

  getCatchUpState(): SyncCatchUpState {
    return this.catchUpState;
  }

  private publishCatchUp(state: SyncCatchUpState) {
    this.catchUpState = Object.freeze(state);
    for (const listener of this.storeListeners) {
      listener();
    }
  }

  /** Observes lifecycle/retry failures in state; explicit backfill still rejects. */
  async catchUp(): Promise<SyncCatchUpState> {
    if (this.disposed) {
      return this.catchUpState;
    }
    if (this.catchUpRun) {
      if (this.catchUpRun.attempt === 0) {
        this.catchUpRun.trailing = true;
      }
      return await this.catchUpRun.promise;
    }
    const epoch = this.catchUpEpoch;
    const run = { trailing: false, attempt: 0, promise: Promise.resolve(this.catchUpState) };
    this.catchUpRun = run;
    run.promise = Promise.resolve().then(async () => {
      let error: unknown = null;
      const active = () => !this.disposed && this.catchUpEpoch === epoch;
      do {
        if (!active()) {
          return this.catchUpState;
        }
        run.trailing = false;
        error = null;
        try {
          if (this.options.catchUpStrategy === 'snapshot') {
            const results = await this.refreshSubscriptions();
            const failures = results.filter(
              (result) =>
                !result.ok &&
                this.subscriptionManager.getSubscription(result.subscriptionId) &&
                !this.subscriptionManager.isRestoredSubscription(result.subscriptionId),
            );
            if (failures.length) {
              error = new AggregateError(
                failures.map((failure) => failure.error),
                'Some subscriptions could not refresh. Showing previous data.',
              );
            }
          } else {
            await this.backfill({ scope: BackfillScope.All });
          }
        } catch (error) {
          error = error;
        }
        // Bound a burst to one trailing read, including triggers during that read.
      } while (active() && run.trailing && run.attempt++ === 0);
      if (active()) {
        this.catchUpRun = undefined;
        this.publishCatchUp({ refreshing: false, stale: error !== null, error });
      }
      return this.catchUpState;
    });
    this.publishCatchUp({ ...this.catchUpState, refreshing: true });
    return await run.promise;
  }

  /**
   * Reconciles local state by fetching changes since stored cursors.
   */
  async backfill(args: BackfillArgs) {
    const epoch = this.catchUpEpoch;
    await this.subscriptionManager.backfill(args);
    if (!this.disposed && epoch === this.catchUpEpoch) {
      this.emit();
    }
  }

  /**
   * Replays pending mutations with error handling.
   */
  async replayPending() {
    await this.mutationEngine.replayPending();
    this.emit();
  }

  /**
   * Public read of the mutation ledger: journal entries still awaiting the
   * server (`Status.Pending`) or rejected by it (`Status.Failed`), ordered
   * by submission sequence. Confirmed entries are dropped from the journal
   * and never appear here. Read inside a `subscribeStore` callback for a
   * reactive pending/error surface (see `useFrappePendingMutations`).
   */
  getMutationEntries(doctype?: string): DebugMutationEntry[] {
    const entries: DebugMutationEntry[] = [];
    for (const { id, entry } of this.mutationJournal.listPending()) {
      if (doctype && entry.doctype !== doctype) {
        continue;
      }
      entries.push({
        id,
        operation: entry.operation,
        doctype: entry.doctype,
        docname: entry.docname,
        status: entry.status,
        createdAt: entry.createdAt ?? 0,
        retryCount: entry.retryCount ?? 0,
        error: entry.error ? ((entry.error as Error).message ?? String(entry.error)) : undefined,
      });
    }
    return entries;
  }

  /**
   * Drops a failed (or still-pending) ledger entry without retrying it —
   * the "dismiss" half of the rejected-write contract. The optimistic
   * rollback already ran when the mutation failed; this only clears the
   * error affordance.
   */
  dismissMutation(id: string) {
    this.mutationJournal.remove(id);
    this.emit();
  }

  /** Reads a single document from the local cache. */
  getDocFromCache<T extends FrappeDocData = FrappeDocData>(doctype: string, name: string): T | undefined {
    return this.normalizedCache.get({ doctype, name }) as T | undefined;
  }

  /** Returns subscription metadata by id. */
  getSubscription(id: string) {
    return this.subscriptionManager.getSubscription(id);
  }

  /**
   * Returns current rows for a subscription from the cache.
   */
  getDocsForSubscription<Data extends FrappeDocData>(id: string): FrappeDoc<Data>[] {
    return this.subscriptionManager.getDocsForSubscription<FrappeDoc<Data>>(id);
  }

  /**
   * Get a specific page of documents using virtual pagination.
   * Requires the subscription to have been created with `progressive: true`.
   */
  async getPage<Data extends FrappeDocData>(subscriptionId: string, page: number): Promise<FrappeDoc<Data>[]> {
    const result = await this.subscriptionManager.getPage<FrappeDoc<Data>>(subscriptionId, page);
    this.emit();
    return result;
  }

  /**
   * Get the next batch of documents after a cursor for infinite scroll.
   * Requires the subscription to have been created with `progressive: true`.
   */
  async getNextBatch<Data extends FrappeDocData>(
    subscriptionId: string,
    cursorDocId: string,
    limit: number,
  ): Promise<FrappeDoc<Data>[]> {
    const result = await this.subscriptionManager.getNextBatch<FrappeDoc<Data>>(subscriptionId, cursorDocId, limit);
    this.emit();
    return result;
  }

  /**
   * Get page information for a subscription.
   */
  getPageInfo(subscriptionId: string) {
    return this.subscriptionManager.getPageInfo(subscriptionId);
  }

  /** Refetches authoritative copies for specific documents and updates cache. */
  async refetchDocs(docs: { doctype: string; name: string }[]) {
    await this.subscriptionManager.backfill({
      scope: BackfillScope.Docs,
      docs,
    });
    this.emit();
  }

  /** Adds a store listener; returns an unsubscribe function. */
  subscribeStore(listener: () => void): () => void {
    this.storeListeners.add(listener);
    return () => {
      this.storeListeners.delete(listener);
    };
  }

  /**
   * Registers a listener for raw realtime events (doc_update, list_update,
   * doc_deleted, connected, …). Useful for consumers that manage their own
   * fetching (e.g. server-side paginated tables) but still want live
   * invalidation hints. Returns an unsubscribe function.
   */
  subscribeRealtimeEvents(listener: (event: SyncRealtimeEvent) => void): () => void {
    this.realtimeEventListeners.add(listener);
    return () => {
      this.realtimeEventListeners.delete(listener);
    };
  }

  /**
   * Joins the realtime doctype room without creating a data subscription
   * (refcounted). Pair with `unwatchDoctype` on cleanup. Used by consumers
   * that fetch their own data but need the doctype's realtime hints.
   */
  watchDoctype(doctype: string): void {
    this.realtimeHandler.watchDoctype(doctype);
  }

  /** Releases one `watchDoctype` reference. */
  unwatchDoctype(doctype: string): void {
    this.realtimeHandler.unwatchDoctype(doctype);
  }

  /**
   * Live socket connection snapshot. `connected` is the state right now;
   * `everConnected` distinguishes "reconnecting" from "realtime never up"
   * (fixture mode, SSR, or no realtime module). Store listeners are
   * notified on every flip, so read this inside a `subscribeStore` callback
   * for a reactive indicator.
   */
  getConnectionState(): { connected: boolean; everConnected: boolean } {
    return this.realtimeHandler.getConnectionState();
  }

  /** Notifies listeners, schedules persistence, and broadcasts cross-tab changes. */
  private emit() {
    // Fan out local state changes to all subscribers
    for (const listener of this.storeListeners) {
      listener();
    }
    // Debounce a persistence snapshot if configured
    this.persistenceManager.scheduleSave();
    // Notify other tabs so they can converge local state
    this.persistenceManager.broadcastChange();
  }

  /** Clears subscriptions, cache, journal, and temp id mappings. */
  resetCache() {
    this.catchUpEpoch++;
    this.catchUpRun = undefined;
    this.catchUpState = idleCatchUpState;
    // Leave all realtime doctype rooms alongside dropping the subscriptions
    this.realtimeHandler.unwatchAll();
    // Drop all live subs, in-memory cache, journal, and temp mappings
    this.subscriptionManager.clear();
    this.normalizedCache.clear();
    this.mutationJournal.clear();
    this.mutationEngine.clearTemporaryMappings();
    // Notify listeners of the global reset so UI can re-subscribe as needed
    this.emit();
  }

  /** Cleanup and dispose of resources */
  async dispose() {
    this.disposed = true;
    // Clear all listeners
    this.storeListeners.clear();
    this.realtimeEventListeners.clear();

    // Clear subscriptions and cache
    this.resetCache();

    // Dispose of all managers
    this.mutationJournal.dispose();
    this.mutationEngine.dispose();
    this.realtimeHandler.dispose();
    this.persistenceManager.destroy();
    this.rehydrationManager.clear();

    // Remove lifecycle event listeners
    this.cleanupFocus?.();
    this.cleanupFocusReplay?.();
    this.cleanupOnlineBackfill?.();
    this.cleanupOnlineReplay?.();
    this.cleanupFocus = undefined;
    this.cleanupFocusReplay = undefined;
    this.cleanupOnlineBackfill = undefined;
    this.cleanupOnlineReplay = undefined;

    if (this.cdcIntervalHandle) {
      clearInterval(this.cdcIntervalHandle);
      this.cdcIntervalHandle = undefined;
    }
  }

  /**
   * Returns a snapshot of internal state for devtools inspection.
   * Prefixed with __ to signal internal/debug use only.
   */
  __debug(): FrappeDebugState {
    const allSubs = this.subscriptionManager.getAllSubscriptions();
    const vpm = this.subscriptionManager.getVirtualPageManager();

    const subscriptions: DebugSubscription[] = [];
    for (const [, sub] of allSubs) {
      const virtualSub = vpm.getSubscription(sub.id);
      const pageInfo = vpm.getPageInfo(sub.id);
      const islands = vpm.getPageIslands(sub.id);

      const debugSub: DebugSubscription = {
        id: sub.id,
        query: sub.query,
        docCount: sub.docIds.length,
        tombstoneCount: sub.tombstones?.size ?? 0,
        checkpoint: sub.checkpoint,
        cursor: sub.cursor,
        stale: sub.stale,
        restored: this.subscriptionManager.isRestoredSubscription(sub.id),
        pageInfo,
      };

      if (virtualSub) {
        const pc = virtualSub.getProgressiveCache();
        debugSub.progressiveCache = {
          docIds: pc.docIds,
          nextCursor: pc.nextCursor,
          hasMore: pc.hasMore,
          totalCount: pc.totalCount,
          lastFetchedAt: pc.lastFetchedAt?.toISOString(),
          islands,
        };
      }

      subscriptions.push(debugSub);
    }

    const cacheStats = this.normalizedCache.getStats();

    const allEntries = this.mutationJournal.getAllEntries();
    const pending: DebugMutationEntry[] = [];
    const confirmed: DebugMutationEntry[] = [];
    const failed: DebugMutationEntry[] = [];

    for (const { id, entry } of allEntries) {
      const debugEntry: DebugMutationEntry = {
        id,
        operation: entry.operation,
        doctype: entry.doctype,
        docname: entry.docname,
        status: entry.status,
        createdAt: entry.createdAt ?? 0,
        retryCount: entry.retryCount ?? 0,
        error: entry.error ? ((entry.error as Error).message ?? String(entry.error)) : undefined,
      };
      if (entry.status === Status.Pending) {
        pending.push(debugEntry);
      } else if (entry.status === Status.Confirmed) {
        confirmed.push(debugEntry);
      } else if (entry.status === Status.Failed) {
        failed.push(debugEntry);
      }
    }

    return {
      subscriptions,
      normalizedCache: cacheStats,
      mutationJournal: { pending, confirmed, failed },
      connection: {
        socketConnected: this.realtimeHandler.getIsConnected(),
        isLeader: this.persistenceManager.getIsLeader(),
        // React Native has navigator but no onLine (undefined) — treat
        // anything other than an explicit false as online.
        isOnline: typeof navigator === 'undefined' || navigator.onLine,
      },
    };
  }

  /**
   * Checks if this tab is the leader for multi-tab coordination.
   */
  isLeader(): boolean {
    return this.persistenceManager.getIsLeader();
  }
}

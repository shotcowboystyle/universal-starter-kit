/**
 * Persistence manager for sync state snapshots.
 *
 * Handles saving and loading of subscriptions, cache, journal, and temporary
 * ID mappings to/from persistent storage for fast resume after page reload.
 */

import { isNative, onVisibilityChange } from '@repo/platform';
import { Debouncer } from '@tanstack/pacer';

import type { FrappeDocData } from '../common/types';
import { isGjs } from '../util';

import type { MutationEngine } from './mutation-engine';
import type { MutationJournal, Pending } from './mutation-journal';
import type { EntityState, NormalizedCache } from './normalized-cache';
import { IndexedDBKV, PlatformStorageKV } from './storage';
import type { SubscriptionManager } from './subscription-manager';
import { Operation } from './types';
import type { SyncOptions, KVStorage, Mutation, Subscription, TabCoordinationConfig, TabMessage } from './types';

/** Safe access to localStorage (undefined in Node/test envs). */
const getLocalStorage = (): Storage | undefined => {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis ? globalThis.localStorage : undefined;
  } catch {
    // Safe to continue: some sandboxed contexts throw on localStorage access; treat it as absent.
    return undefined;
  }
};

const VISIBILITY_RESPONSE = 'visibility-response';
const VISIBILITY_CHECK = 'visibility-check';
/** A leader that turned hidden keeps leadership for this long before a visible tab takes over. */
const VISIBILITY_GRACE_MS = 1000;

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const isObjectLike = (value: unknown): value is object => typeof value === 'object' && value !== null;

/** Wire messages come from same-origin tabs running this module; the `type` tag selects the shape. */
const isTabMessage = (value: unknown): value is TabMessage<FrappeDocData> =>
  isObjectLike(value) && 'type' in value && typeof value.type === 'string' && value.type !== '';

type VisibilityResponse = Extract<TabMessage<FrappeDocData>, { type: 'visibility-response' }>;

const visibilityResponseOf = (event: MessageEvent): VisibilityResponse | null =>
  isTabMessage(event.data) && event.data.type === VISIBILITY_RESPONSE ? event.data : null;

/** Fields shared by the persisted snapshot and a leadership handoff; all optional, all unparsed. */
interface PersistedState {
  cache?: unknown;
  journal?: unknown;
  subs?: unknown;
  subscriptions?: unknown;
  temp?: unknown;
  tempMappings?: unknown;
}

interface CapturedState {
  cache: EntityState;
  journal: ReturnType<MutationJournal['listPending']>;
  subscriptions: Subscription[];
  tempMappings: [string, string][];
}

interface LeaderData {
  tabId: string;
  timestamp: number;
  visibilityState: 'visible' | 'hidden';
  lastVisibilityChange: number;
}

type SnapshotSubscription = Parameters<SubscriptionManager['restoreSubscription']>[0];

const generateTabId = (): string =>
  // oxlint-disable-next-line sonarjs/pseudo-random -- a tab id only needs to be unique among open tabs, not unguessable
  `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

/**
 * Manages persistence of sync state across sessions with active tab priority leadership.
 */
export class PersistenceManager {
  private persistenceStorage?: KVStorage;
  // oxlint-disable-next-line eslint/no-void -- fire-and-forget: save() catches and logs its own failures
  private readonly saveDebouncer = new Debouncer(() => void this.save(), { wait: 50 });
  private broadcastChannel: BroadcastChannel | null = null;

  // Active tab priority leadership state
  private isLeader = false;
  private readonly tabId = generateTabId();
  private leaderCheckInterval: ReturnType<typeof setInterval> | null = null;
  private visibilityState: 'visible' | 'hidden' = 'visible';
  private lastVisibilityChange = Date.now();
  private readonly pendingOperations = new Set<Promise<unknown>>();
  private acceptingNewWork = true;
  private handoffInProgress = false;
  private readonly tabCoordinationConfig: Required<TabCoordinationConfig>;
  private readonly leaderKey = 'frappe-sync-leader';
  /** Cleanup function returned by the visibility change lifecycle subscription. */
  private cleanupVisibilityChange: (() => void) | null = null;
  /** Active response timers that need cleanup. */
  private readonly activeResponseTimers = new Set<ReturnType<typeof setTimeout>>();
  /** Flag to prevent operations after destroy. */
  private isDestroyed = false;
  /**
   * Resolves once the persisted snapshot (if any) has been restored into
   * memory. Resolved immediately when persistence is disabled. Never rejects.
   */
  private loadPromise: Promise<void> = Promise.resolve();
  private readonly normalizedCache: NormalizedCache;
  private readonly mutationJournal: MutationJournal;
  private readonly subscriptionManager: SubscriptionManager;
  private readonly mutationEngine: MutationEngine;
  private readonly options: SyncOptions;

  constructor(
    normalizedCache: NormalizedCache,
    mutationJournal: MutationJournal,
    subscriptionManager: SubscriptionManager,
    mutationEngine: MutationEngine,
    options: SyncOptions = {},
  ) {
    this.normalizedCache = normalizedCache;
    this.mutationJournal = mutationJournal;
    this.subscriptionManager = subscriptionManager;
    this.mutationEngine = mutationEngine;
    this.options = options;
    // Initialize tab coordination config
    this.tabCoordinationConfig = {
      activeTabPriority: options.tabCoordination?.activeTabPriority ?? true,
      leaderTimeout: options.tabCoordination?.leaderTimeout ?? 5000,
      handoffGracePeriod: options.tabCoordination?.handoffGracePeriod ?? 2000,
    };

    // React Native has window but no document/BroadcastChannel; it does have
    // full KV storage (MMKV via PlatformStorageKV), so enable snapshot
    // persistence and skip only the DOM-dependent cross-tab machinery.
    // GJS (GNOME) takes the same branch: single window, no BroadcastChannel
    // or real DOM (any window/document globals are layout stubs) — storage
    // arrives via an app-provided `SyncOptions.storage` adapter (e.g. a Gio
    // file-backed KV) and persistence stays a clean no-op without one, since
    // setupPersistence bails when persistKey is unset.
    if (isNative || isGjs()) {
      this.setupPersistence();
      return;
    }

    // Skip browser-only setup during SSR (document/window not available)
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.setupPersistence();
    this.setupBroadcastChannel();

    // Leadership election only coordinates persistence snapshots and
    // cross-tab broadcast, and every one of those paths is persistKey-gated
    // (setupPersistence/setupBroadcastChannel/scheduleSave all bail without
    // one). Electing without a persistKey did nothing except leak: each
    // SyncModule armed a forever leader-heartbeat setInterval (+ a
    // visibilitychange listener + periodic localStorage writes) whose
    // closure pinned the module's whole sync graph. Fixture-mode consumers
    // (tests, stories) create a SyncModule per fixture set, so the leaked
    // heartbeats accumulated and wedged vitest forks-worker teardown.
    if (hasText(this.options.persistKey) && this.tabCoordinationConfig.activeTabPriority) {
      this.setupTabCoordination();
    }
  }

  /**
   * Resolves when the initial snapshot restore has completed (immediately if
   * persistence is off). `SyncModule.subscribe` awaits this so a fresh mount
   * can re-adopt a restored subscription instead of racing the async load.
   */
  async whenReady(): Promise<void> {
    await this.loadPromise;
  }

  /**
   * Sets up persistence storage based on environment and options.
   */
  private setupPersistence() {
    if (!hasText(this.options.persistKey)) {
      return;
    }

    // Use provided storage or detect environment
    if (this.options.storage) {
      this.persistenceStorage = this.options.storage;
    } else if (typeof indexedDB === 'undefined') {
      // PlatformStorageKV uses MMKV on native and localStorage on web. On
      // GJS neither exists, so the store package degrades to an in-memory
      // map — snapshots then die with the process. Say so instead of
      // pretending persistKey persisted anything.
      if (isGjs()) {
        console.debug(
          '[frappe-sync] persistKey set but no storage adapter on GJS — snapshots are in-memory only (pass SyncOptions.storage, e.g. a Gio file-backed KV, for real persistence)',
        );
      }
      this.persistenceStorage = new PlatformStorageKV();
    } else {
      this.persistenceStorage = new IndexedDBKV();
    }

    // Load persisted state if available; expose completion via whenReady()
    this.loadPromise = this.load();
  }

  /**
   * Sets up BroadcastChannel for cross-tab coordination.
   * Handles both simple string messages and structured TabMessage types.
   */
  private setupBroadcastChannel() {
    if (!hasText(this.options.persistKey) || typeof BroadcastChannel === 'undefined') {
      return;
    }

    try {
      this.broadcastChannel = new BroadcastChannel(`frappe-sync:${this.options.persistKey}`);
    } catch {
      return;
    }

    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- the manager is the channel's only consumer; one owned handler
    this.broadcastChannel.onmessage = (e: MessageEvent<unknown> | null) => {
      const data = e?.data;
      // Simple string control messages ("reset", "backfill") from other tabs
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the channel carries both string control messages and TabMessage objects
      if (typeof data === 'string') {
        this.handleControlMessage(data);
        return;
      }
      if (isTabMessage(data)) {
        this.handleTabMessage(data);
      }
    };
  }

  private handleControlMessage(data: string) {
    if (data === 'reset' && this.options.onResetCache) {
      this.options.onResetCache();
    }
    if (data === 'backfill' && this.options.onBackfillAll) {
      this.options.onBackfillAll();
    }
  }

  /** Handles structured TabMessage types. */
  private handleTabMessage(message: TabMessage<FrappeDocData>) {
    switch (message.type) {
      case VISIBILITY_CHECK: {
        // Respond with our visibility state
        if (message.fromTab !== this.tabId) {
          this.broadcastToTabs({
            type: VISIBILITY_RESPONSE,
            tabId: this.tabId,
            isVisible: this.visibilityState === 'visible',
          });
        }
        break;
      }

      case 'leadership-request': {
        // If we're leader and the requester is visible but we're hidden, yield
        if (this.isLeader && message.visibilityState === 'visible' && this.visibilityState === 'hidden') {
          void this.initiateGracefulHandoff();
        }
        break;
      }

      case 'leadership-handoff': {
        // If we're the target of the handoff, become leader
        if (message.toTab === this.tabId) {
          // Restore state from handoff if provided (restoreStateFromHandoff ignores a missing state)
          this.restoreStateFromHandoff(message.state);
          this.becomeLeader();
        }
        break;
      }

      case 'mutation': {
        // Relay mutation to local cache for non-leader tabs
        if (!this.isLeader) {
          this.handleRemoteMutation(message.mutation);
        }
        break;
      }

      case 'sync-state': {
        // Sync state update from leader - update local cache
        if (!this.isLeader) {
          this.restoreStateFromHandoff(message.state);
        }
        break;
      }

      case 'heartbeat': {
        // Could track active tabs here if needed
        break;
      }

      case VISIBILITY_RESPONSE: {
        // Handled by findSuccessor and checkForActiveTabs via window.postMessage
        break;
      }

      // no default
    }
  }

  /**
   * Handles a mutation relayed from another tab.
   * Updates local cache with the mutation's effects.
   */
  private handleRemoteMutation(mutation: Mutation<FrappeDocData> | undefined) {
    // Apply mutation effects to local normalized cache
    // This keeps non-leader tabs in sync without making their own API calls.
    // The mutation crossed a tab boundary, so its doc is checked at runtime.
    const doc = mutation?.doc;
    if (mutation === undefined || doc === undefined) {
      return;
    }
    if (mutation.operation === Operation.Delete) {
      this.normalizedCache.remove({
        doctype: doc.doctype,
        name: doc.name,
      });
    } else {
      this.normalizedCache.upsert(doc);
    }
  }

  /**
   * Broadcasts a mutation to other tabs.
   * Called by SyncModule after a successful mutation.
   */
  broadcastMutation(mutation: Mutation<FrappeDocData>) {
    // Only leader broadcasts mutations
    if (!this.isLeader) {
      return;
    }

    this.broadcastToTabs({
      type: 'mutation',
      mutation,
    });
  }

  /**
   * Restores state received from a leadership handoff or sync-state message.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- handoff state crosses the BroadcastChannel; this method is its parse boundary
  private restoreStateFromHandoff(state: unknown) {
    if (!isObjectLike(state)) {
      return;
    }
    const handoffState: PersistedState = state;

    // Restore cache
    if (isObjectLike(handoffState.cache)) {
      // SAFETY: handoff caches are produced by captureState() in another tab, which sends normalizedCache.state.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      this.normalizedCache.state = handoffState.cache as EntityState;
    }

    // Restore subscriptions
    if (Array.isArray(handoffState.subscriptions)) {
      // SAFETY: handoff subscriptions come from captureState() in another tab; entries without an id are skipped.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      const handoffSubscriptions = handoffState.subscriptions as (Subscription | null | undefined)[];
      const subscriptions = this.subscriptionManager.getAllSubscriptions();
      for (const subscription of handoffSubscriptions) {
        if (subscription && hasText(subscription.id)) {
          subscriptions.set(subscription.id, subscription);
        }
      }
    }

    // Restore temp mappings
    if (Array.isArray(handoffState.tempMappings)) {
      // SAFETY: handoff temp mappings come from captureState() in another tab, as Map entries.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      this.restoreTempMappings(handoffState.tempMappings as [string, string][]);
    }
  }

  /** Restores temporary id → real name pairs from a snapshot or handoff. */
  private restoreTempMappings(mappings: [string, string][]) {
    const tempMap = this.mutationEngine.getTemporaryIdToRealNameMap();
    for (const [tempId, realId] of mappings) {
      tempMap.set(tempId, realId);
    }
  }

  /**
   * Schedules a debounced save operation.
   */
  scheduleSave() {
    if (!hasText(this.options.persistKey)) {
      return;
    }
    this.saveDebouncer.maybeExecute();
  }

  /**
   * Persists a snapshot of subscriptions, cache, journal, and temp mappings.
   */
  private async save() {
    if (!hasText(this.options.persistKey) || !this.persistenceStorage) {
      return;
    }
    try {
      // Expire restored subscriptions nobody re-adopted so they leave the
      // snapshot instead of accumulating across reloads.
      this.subscriptionManager.gcRestoredSubscriptions();
      // Capture a minimal snapshot for fast resume after reload or tab switch
      const snapshot = {
        subs: [...this.subscriptionManager.getAllSubscriptions().values()].map((s) => ({
          id: s.id,
          query: s.query,
          checkpoint: s.checkpoint,
          cursor: s.cursor,
          docIds: s.docIds,
        })),
        cache: this.normalizedCache.state,
        journal: this.mutationJournal.listPending(),
        temp: [...this.mutationEngine.getTemporaryIdToRealNameMap().entries()],
      };
      await this.persistenceStorage.setItem(this.options.persistKey, JSON.stringify(snapshot));
    } catch (error) {
      // Persistence failures should not break the app
      console.warn('Failed to save sync state:', error);
    }
  }

  /**
   * Loads a previously persisted snapshot if present.
   */
  private async load() {
    if (!hasText(this.options.persistKey) || !this.persistenceStorage) {
      return;
    }
    try {
      const raw = await this.persistenceStorage.getItem(this.options.persistKey);
      if (raw === null || raw === '') {
        return;
      }
      const snap: unknown = JSON.parse(raw);
      if (!isObjectLike(snap)) {
        return;
      }
      const snapshot: PersistedState = snap;

      // Restore cache first so reads have data once subs are reinstated.
      this.restoreCacheFromSnapshot(snapshot);

      // Rehydrate subscriptions as dormant "restored" entries: they hold the
      // persisted query, checkpoint, and membership for cache-first
      // re-adoption, and are GC'd if nothing re-adopts them.
      if (Array.isArray(snapshot.subs)) {
        // SAFETY: save() writes these entries; restoreSubscription validates each id and query itself.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        for (const subscription of snapshot.subs as SnapshotSubscription[]) {
          this.subscriptionManager.restoreSubscription(subscription);
        }
      }

      // Restore journal entries for replay
      if (Array.isArray(snapshot.journal)) {
        // SAFETY: save() writes these entries from mutationJournal.listPending().
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        for (const { id, entry } of snapshot.journal as { id: string; entry: Pending }[]) {
          this.mutationJournal.add(id, entry);
        }
      }

      // Restore temporary id remappings for post-create consistency
      if (Array.isArray(snapshot.temp)) {
        // SAFETY: save() writes these pairs from the temporary-id Map's entries.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        this.restoreTempMappings(snapshot.temp as [string, string][]);
      }
    } catch (error) {
      // Loading failures should not break the app
      console.warn('Failed to load sync state:', error);
    }
  }

  /**
   * Merges a persisted cache per doc instead of replacing state wholesale:
   * anything already in memory (e.g. an optimistic write that raced ahead of
   * this load) is newer than the snapshot and wins. Per-doc upsert also keeps
   * the cache's LRU bookkeeping and maxCacheSize bounds accurate.
   */
  private restoreCacheFromSnapshot({ cache }: PersistedState) {
    if (!isObjectLike(cache)) {
      return;
    }
    const buckets: unknown[] = Object.values(cache);
    for (const bucket of buckets) {
      const byId: unknown = isObjectLike(bucket) && 'byId' in bucket ? bucket.byId : undefined;
      if (isObjectLike(byId)) {
        // SAFETY: snapshot caches are written by save() from normalizedCache.state; each doc is checked below.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        const docs = Object.values(byId) as (FrappeDocData | null | undefined)[];
        for (const doc of docs) {
          const isRestorable = Boolean(doc?.doctype) && Boolean(doc?.name);
          // get() also refreshes LRU access order, as before.
          if (doc && isRestorable && this.normalizedCache.get(doc) === undefined) {
            this.normalizedCache.upsert(doc, { replace: true });
          }
        }
      }
    }
  }

  /**
   * Broadcasts a reset message to other tabs.
   */
  broadcastReset() {
    this.postToChannel('reset');
  }

  /**
   * Broadcasts a backfill message to other tabs.
   */
  broadcastBackfill() {
    this.postToChannel('backfill');
  }

  /**
   * Broadcasts a generic change message to other tabs.
   */
  broadcastChange() {
    this.postToChannel('changed');
  }

  private postToChannel(message: string | TabMessage<FrappeDocData>) {
    this.broadcastChannel?.postMessage(message);
  }

  /**
   * Sets up tab coordination with active tab priority.
   */
  private setupTabCoordination() {
    // Track visibility state
    this.visibilityState = document.hidden ? 'hidden' : 'visible';

    // Subscribe via lifecycle abstraction; store returned cleanup
    this.cleanupVisibilityChange = onVisibilityChange((visible) => {
      if (this.isDestroyed) {
        return;
      }

      const wasVisible = this.visibilityState === 'visible';
      this.visibilityState = visible ? 'visible' : 'hidden';
      this.lastVisibilityChange = Date.now();

      if (!wasVisible && this.visibilityState === 'visible') {
        // Tab became visible - consider taking leadership
        this.evaluateLeadershipPriority();
      } else if (wasVisible && this.visibilityState === 'hidden' && this.isLeader) {
        // Tab became hidden and is leader - consider handoff
        this.considerLeadershipHandoff();
      }
    });

    // Start leader election process
    this.tryBecomeLeader();
  }

  /**
   * Attempts to become the leader tab.
   */
  private tryBecomeLeader() {
    if (!getLocalStorage() || this.isDestroyed) {
      return;
    }

    const now = Date.now();
    const leaderData = this.getLeaderData();

    // Check if current leader is expired or if we have priority
    if (
      leaderData === null ||
      now - leaderData.timestamp > this.tabCoordinationConfig.leaderTimeout ||
      (this.visibilityState === 'visible' && leaderData.visibilityState === 'hidden')
    ) {
      this.becomeLeader();
    } else {
      // Clear any existing interval before scheduling new one
      if (this.leaderCheckInterval !== null) {
        clearInterval(this.leaderCheckInterval);
      }
      // Schedule periodic checks
      this.leaderCheckInterval = setInterval(() => {
        if (!this.isDestroyed) {
          this.checkLeadership();
        }
      }, this.tabCoordinationConfig.leaderTimeout / 2);
    }
  }

  /**
   * Becomes the leader tab.
   */
  private becomeLeader() {
    if (this.isDestroyed) {
      return;
    }

    this.isLeader = true;
    this.updateLeaderTimestamp();
    this.onBecomeLeader();

    // Clear any existing interval before starting heartbeat
    if (this.leaderCheckInterval !== null) {
      clearInterval(this.leaderCheckInterval);
    }
    // Start heartbeat
    this.leaderCheckInterval = setInterval(() => {
      if (!this.isDestroyed) {
        this.updateLeaderTimestamp();
      }
    }, this.tabCoordinationConfig.leaderTimeout / 2);
  }

  /**
   * Updates leader timestamp in localStorage.
   */
  private updateLeaderTimestamp() {
    const ls = getLocalStorage();
    if (!ls) {
      return;
    }

    const leaderData: LeaderData = {
      tabId: this.tabId,
      timestamp: Date.now(),
      visibilityState: this.visibilityState,
      lastVisibilityChange: this.lastVisibilityChange,
    };

    try {
      ls.setItem(this.leaderKey, JSON.stringify(leaderData));
    } catch (error) {
      console.warn('[PersistenceManager] Failed to update leader timestamp:', error);
    }
  }

  /**
   * Checks if this tab should remain leader.
   */
  private checkLeadership() {
    const leaderData = this.getLeaderData();

    if (leaderData === null) {
      // No leader - try to become one
      this.tryBecomeLeader();
      return;
    }

    const now = Date.now();

    if (this.isLeader) {
      // We are leader - check if we should remain
      if (leaderData.tabId !== this.tabId) {
        // Another tab took leadership
        this.isLeader = false;
        this.onLoseLeadership();
      }
    } else if (
      // We are not leader - check if we should take over
      now - leaderData.timestamp > this.tabCoordinationConfig.leaderTimeout ||
      (this.visibilityState === 'visible' &&
        leaderData.visibilityState === 'hidden' &&
        now - this.lastVisibilityChange > VISIBILITY_GRACE_MS)
    ) {
      this.tryBecomeLeader();
    }
  }

  /**
   * Gets current leader data from localStorage.
   */
  private getLeaderData(): LeaderData | null {
    const ls = getLocalStorage();
    if (!ls) {
      return null;
    }

    try {
      const data = ls.getItem(this.leaderKey);
      if (data === null || data === '') {
        return null;
      }
      const parsed: unknown = JSON.parse(data);
      // SAFETY: the leader key is only written by updateLeaderTimestamp(), as JSON of a LeaderData object.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      return isObjectLike(parsed) ? (parsed as LeaderData) : null;
    } catch {
      // Safe to continue: unreadable or corrupt leader data means there is no usable leader.
      return null;
    }
  }

  /**
   * Evaluates if this tab should take leadership based on visibility priority.
   */
  private evaluateLeadershipPriority() {
    // Already leader
    if (this.isLeader) {
      return;
    }

    const leaderData = this.getLeaderData();
    if (leaderData === null) {
      this.tryBecomeLeader();
      return;
    }

    // If current leader is hidden and we're visible, request leadership
    if (leaderData.visibilityState === 'hidden' && this.visibilityState === 'visible') {
      this.requestLeadershipHandoff();
    }
  }

  /**
   * Considers handing off leadership when tab becomes hidden.
   */
  private considerLeadershipHandoff() {
    if (!this.isLeader) {
      return;
    }

    // Check if there are other visible tabs
    this.checkForActiveTabs((hasActiveTabs) => {
      if (hasActiveTabs) {
        // Initiate graceful handoff
        void this.initiateGracefulHandoff();
      }
      // Otherwise, remain leader even though hidden
    });
  }

  /**
   * Requests leadership handoff from current leader.
   */
  private requestLeadershipHandoff() {
    this.broadcastToTabs({
      type: 'leadership-request',
      tabId: this.tabId,
      visibilityState: this.visibilityState,
    });
  }

  /**
   * Initiates graceful handoff to another tab.
   */
  private async initiateGracefulHandoff() {
    if (!this.isLeader || this.handoffInProgress) {
      return;
    }

    this.handoffInProgress = true;
    this.acceptingNewWork = false;

    // Wait for pending operations
    await this.waitForPendingOperations();

    // Find a suitable successor
    const successor = await this.findSuccessor();

    if (successor !== null && successor !== '') {
      // Transfer state
      const state = await this.captureState();

      this.broadcastToTabs({
        type: 'leadership-handoff',
        fromTab: this.tabId,
        toTab: successor,
        state,
      });

      // Step down
      this.isLeader = false;
      this.onLoseLeadership();
    }

    this.handoffInProgress = false;
    this.acceptingNewWork = true;
  }

  /**
   * Waits for all pending operations to complete.
   */
  private async waitForPendingOperations() {
    // oxlint-disable-next-line promise/avoid-new -- promisifies setTimeout; browser/RN have no timer-promise API
    const timeout = new Promise((resolve) => {
      setTimeout(resolve, this.tabCoordinationConfig.handoffGracePeriod);
    });

    const operations = Promise.all(this.pendingOperations);

    await Promise.race([operations, timeout]);
  }

  /**
   * Finds a suitable successor for leadership.
   */
  private async findSuccessor(): Promise<string | null> {
    // oxlint-disable-next-line promise/avoid-new -- bridges the window message listener and response timer into a promise
    return await new Promise((resolve) => {
      if (this.isDestroyed) {
        resolve(null);
        return;
      }

      const responses: { tabId: string; isVisible: boolean }[] = [];

      const handleResponse = (event: MessageEvent) => {
        const response = visibilityResponseOf(event);
        if (response) {
          responses.push({
            tabId: response.tabId,
            isVisible: response.isVisible,
          });
        }
      };

      // Listen for responses
      window.addEventListener('message', handleResponse);

      // Broadcast visibility check
      this.broadcastToTabs({
        type: VISIBILITY_CHECK,
        fromTab: this.tabId,
      });

      // Wait for responses
      const responseTimer = setTimeout(() => {
        this.activeResponseTimers.delete(responseTimer);
        window.removeEventListener('message', handleResponse);

        // Find best successor (prefer visible tabs)
        const visibleTab = responses.find((r) => r.isVisible);
        resolve(visibleTab ? visibleTab.tabId : responses[0]?.tabId || null);
      }, 500);

      this.activeResponseTimers.add(responseTimer);
    });
  }

  /**
   * Checks if there are other active tabs.
   */
  private checkForActiveTabs(onResult: (hasActive: boolean) => void) {
    if (this.isDestroyed) {
      onResult(false);
      return;
    }

    const responses: boolean[] = [];

    const handleResponse = (event: MessageEvent) => {
      const response = visibilityResponseOf(event);
      if (response) {
        responses.push(response.isVisible);
      }
    };

    window.addEventListener('message', handleResponse);

    this.broadcastToTabs({
      type: VISIBILITY_CHECK,
      fromTab: this.tabId,
    });

    const responseTimer = setTimeout(() => {
      this.activeResponseTimers.delete(responseTimer);
      window.removeEventListener('message', handleResponse);
      onResult(responses.some(Boolean));
    }, 500);

    this.activeResponseTimers.add(responseTimer);
  }

  /**
   * Captures current state for handoff.
   */
  private async captureState(): Promise<CapturedState> {
    return {
      cache: this.normalizedCache.state,
      journal: this.mutationJournal.listPending(),
      subscriptions: [...this.subscriptionManager.getAllSubscriptions().values()],
      tempMappings: [...this.mutationEngine.getTemporaryIdToRealNameMap().entries()],
    };
  }

  /**
   * Broadcasts message to other tabs.
   */
  private broadcastToTabs(message: TabMessage<FrappeDocData>) {
    this.postToChannel(message);

    // Fallback to localStorage events
    const ls = getLocalStorage();
    if (ls) {
      try {
        const key = `frappe-sync-msg-${Date.now()}`;
        ls.setItem(key, JSON.stringify(message));
        setTimeout(() => {
          ls.removeItem(key);
        }, 100);
      } catch {
        // Safe to continue: the localStorage fallback is best-effort (quota or private mode may refuse writes).
      }
    }
  }

  /**
   * Handles becoming the leader.
   */
  private onBecomeLeader() {
    console.debug(`[PersistenceManager] Tab ${this.tabId} became leader`);

    // Start accepting mutations and sync operations
    if (this.options.onBecomeLeader) {
      this.options.onBecomeLeader();
    }
  }

  /**
   * Handles losing leadership.
   */
  private onLoseLeadership() {
    console.debug(`[PersistenceManager] Tab ${this.tabId} lost leadership`);

    if (this.leaderCheckInterval !== null) {
      clearInterval(this.leaderCheckInterval);
      this.leaderCheckInterval = null;
    }

    if (this.options.onLoseLeadership) {
      this.options.onLoseLeadership();
    }
  }

  /**
   * Tracks a pending operation.
   */
  async trackOperation<T>(operation: Promise<T>): Promise<T> {
    this.pendingOperations.add(operation);
    try {
      return await operation;
    } finally {
      this.pendingOperations.delete(operation);
    }
  }

  /**
   * Gets whether this tab is the leader.
   */
  getIsLeader(): boolean {
    return this.isLeader;
  }

  /**
   * Cleans up timers, event listeners, and channels.
   */
  destroy() {
    this.isDestroyed = true;

    // Cancel pending save
    this.saveDebouncer.cancel();

    // Clear leader check interval
    if (this.leaderCheckInterval !== null) {
      clearInterval(this.leaderCheckInterval);
      this.leaderCheckInterval = null;
    }

    // Clear all active response timers
    for (const timer of this.activeResponseTimers) {
      clearTimeout(timer);
    }
    this.activeResponseTimers.clear();

    // Remove visibility change listener
    this.cleanupVisibilityChange?.();
    this.cleanupVisibilityChange = null;

    // Close broadcast channel
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    // Clear pending operations
    this.pendingOperations.clear();
  }
}

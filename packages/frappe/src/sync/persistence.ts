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

import type { MutationEngine } from './mutationEngine';
import type { MutationJournal } from './mutationJournal';
import type { NormalizedCache } from './normalizedCache';
import { IndexedDBKV, PlatformStorageKV } from './storage';
import type { SubscriptionManager } from './subscriptionManager';
import type { SyncOptions, KVStorage, Mutation, TabCoordinationConfig, TabMessage } from './types';

/** Safe access to localStorage (undefined in Node/test envs). */
function getLocalStorage(): Storage | undefined {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Manages persistence of sync state across sessions with active tab priority leadership.
 */
export class PersistenceManager {
  private persistenceStorage?: KVStorage;
  private readonly saveDebouncer = new Debouncer(() => void this.save(), { wait: 50 });
  private broadcastChannel?: BroadcastChannel;

  // Active tab priority leadership state
  private isLeader = false;
  private readonly tabId = this.generateTabId();
  private leaderCheckInterval: ReturnType<typeof setInterval> | undefined;
  private visibilityState: 'visible' | 'hidden' = 'visible';
  private lastVisibilityChange = Date.now();
  private readonly pendingOperations = new Set<Promise<any>>();
  private acceptingNewWork = true;
  private handoffInProgress = false;
  private readonly tabCoordinationConfig: Required<TabCoordinationConfig>;
  private readonly leaderKey = 'frappe-sync-leader';
  /** Cleanup function returned by the visibility change lifecycle subscription. */
  private cleanupVisibilityChange?: () => void;
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
    if (this.options.persistKey && this.tabCoordinationConfig.activeTabPriority) {
      this.setupTabCoordination();
    }
  }

  /**
   * Resolves when the initial snapshot restore has completed (immediately if
   * persistence is off). `SyncModule.subscribe` awaits this so a fresh mount
   * can re-adopt a restored subscription instead of racing the async load.
   */
  async whenReady(): Promise<void> {
    return await this.loadPromise;
  }

  /**
   * Sets up persistence storage based on environment and options.
   */
  private setupPersistence() {
    if (!this.options.persistKey) {
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
    if (!this.options.persistKey || typeof BroadcastChannel === 'undefined') {
      return;
    }

    try {
      this.broadcastChannel = new BroadcastChannel(`frappe-sync:${this.options.persistKey}`);
    } catch {
      return;
    }

    this.broadcastChannel.onmessage = (e) => {
      // Simple string control messages ("reset", "backfill") from other tabs
      if (typeof e?.data === 'string') {
        if (e.data === 'reset' && this.options.onResetCache) {
          this.options.onResetCache();
        }
        if (e.data === 'backfill' && this.options.onBackfillAll) {
          this.options.onBackfillAll();
        }
        return;
      }

      // Handle structured TabMessage types
      const message = e?.data as TabMessage<FrappeDocData> | undefined;
      if (!message || !message.type) {
        return;
      }

      switch (message.type) {
        case 'visibility-check': {
          // Respond with our visibility state
          if (message.fromTab !== this.tabId) {
            this.broadcastToTabs({
              type: 'visibility-response',
              tabId: this.tabId,
              isVisible: this.visibilityState === 'visible',
            });
          }
          break;
        }

        case 'leadership-request': {
          // If we're leader and the requester is visible but we're hidden, yield
          if (this.isLeader && message.visibilityState === 'visible' && this.visibilityState === 'hidden') {
            this.initiateGracefulHandoff();
          }
          break;
        }

        case 'leadership-handoff': {
          // If we're the target of the handoff, become leader
          if (message.toTab === this.tabId) {
            // Restore state from handoff if provided
            if (message.state) {
              this.restoreStateFromHandoff(message.state);
            }
            this.becomeLeader();
          }
          break;
        }

        case 'mutation': {
          // Relay mutation to local cache for non-leader tabs
          if (!this.isLeader && message.mutation) {
            this.handleRemoteMutation(message.mutation);
          }
          break;
        }

        case 'sync-state': {
          // Sync state update from leader - update local cache
          if (!this.isLeader && message.state) {
            this.restoreStateFromHandoff(message.state);
          }
          break;
        }

        case 'heartbeat': {
          // Could track active tabs here if needed
          break;
        }

        case 'visibility-response': {
          // Handled by findSuccessor and checkForActiveTabs via window.postMessage
          break;
        }
      }
    };
  }

  /**
   * Handles a mutation relayed from another tab.
   * Updates local cache with the mutation's effects.
   */
  private handleRemoteMutation(mutation: Mutation<FrappeDocData>) {
    // Apply mutation effects to local normalized cache
    // This keeps non-leader tabs in sync without making their own API calls
    if (mutation.doc) {
      if (mutation.operation === 'delete') {
        this.normalizedCache.remove({
          doctype: mutation.doc.doctype,
          name: mutation.doc.name,
        });
      } else {
        this.normalizedCache.upsert(mutation.doc);
      }
    }
  }

  /**
   * Broadcasts a mutation to other tabs.
   * Called by SyncModule after a successful mutation.
   */
  broadcastMutation(mutation: Mutation<FrappeDocData>) {
    if (!this.isLeader) {
      return;
    } // Only leader broadcasts mutations

    this.broadcastToTabs({
      type: 'mutation',
      mutation,
    });
  }

  /**
   * Restores state received from a leadership handoff or sync-state message.
   */
  private restoreStateFromHandoff(state: unknown) {
    if (!state || typeof state !== 'object') {
      return;
    }

    const handoffState = state as {
      cache?: unknown;
      journal?: unknown;
      subscriptions?: unknown;
      tempMappings?: unknown;
    };

    // Restore cache
    if (handoffState.cache) {
      (this.normalizedCache as any).state = handoffState.cache;
    }

    // Restore subscriptions
    if (handoffState.subscriptions && Array.isArray(handoffState.subscriptions)) {
      const subscriptions = this.subscriptionManager.getAllSubscriptions();
      for (const subscription of handoffState.subscriptions) {
        if (subscription?.id) {
          subscriptions.set(subscription.id, subscription);
        }
      }
    }

    // Restore temp mappings
    if (handoffState.tempMappings && Array.isArray(handoffState.tempMappings)) {
      const tempMap = this.mutationEngine.getTemporaryIdToRealNameMap();
      for (const [tempId, realId] of handoffState.tempMappings) {
        tempMap.set(tempId, realId);
      }
    }
  }

  /**
   * Schedules a debounced save operation.
   */
  scheduleSave() {
    if (!this.options.persistKey) {
      return;
    }
    this.saveDebouncer.maybeExecute();
  }

  /**
   * Persists a snapshot of subscriptions, cache, journal, and temp mappings.
   */
  private async save() {
    if (!this.options.persistKey || !this.persistenceStorage) {
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
    if (!this.options.persistKey || !this.persistenceStorage) {
      return;
    }
    try {
      const raw = await this.persistenceStorage.getItem(this.options.persistKey);
      if (!raw) {
        return;
      }
      const snap = JSON.parse(raw);

      // Restore cache first so reads have data once subs are reinstated.
      // Merge per doc instead of replacing state wholesale: anything already
      // in memory (e.g. an optimistic write that raced ahead of this load)
      // is newer than the snapshot and wins. Per-doc upsert also keeps the
      // cache's LRU bookkeeping and maxCacheSize bounds accurate.
      if (snap?.cache && typeof snap.cache === 'object') {
        for (const bucket of Object.values(snap.cache as Record<string, unknown>)) {
          const byId = (bucket as { byId?: Record<string, unknown> } | null)?.byId;
          if (!byId || typeof byId !== 'object') {
            continue;
          }
          for (const doc of Object.values(byId) as FrappeDocData[]) {
            if (!doc?.doctype || !doc?.name) {
              continue;
            }
            if (this.normalizedCache.get(doc)) {
              continue;
            }
            this.normalizedCache.upsert(doc, { replace: true });
          }
        }
      }

      // Rehydrate subscriptions as dormant "restored" entries: they hold the
      // persisted query, checkpoint, and membership for cache-first
      // re-adoption, and are GC'd if nothing re-adopts them.
      if (snap?.subs && Array.isArray(snap.subs)) {
        for (const subscription of snap.subs) {
          this.subscriptionManager.restoreSubscription(subscription);
        }
      }

      // Restore journal entries for replay
      if (snap?.journal && Array.isArray(snap.journal)) {
        for (const { id, entry } of snap.journal) {
          this.mutationJournal.add(id, entry);
        }
      }

      // Restore temporary id remappings for post-create consistency
      if (snap?.temp && Array.isArray(snap.temp)) {
        const tempMap = this.mutationEngine.getTemporaryIdToRealNameMap();
        for (const [tempId, realId] of snap.temp) {
          tempMap.set(tempId, realId);
        }
      }
    } catch (error) {
      // Loading failures should not break the app
      console.warn('Failed to load sync state:', error);
    }
  }

  /**
   * Broadcasts a reset message to other tabs.
   */
  broadcastReset() {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage('reset');
    }
  }

  /**
   * Broadcasts a backfill message to other tabs.
   */
  broadcastBackfill() {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage('backfill');
    }
  }

  /**
   * Broadcasts a generic change message to other tabs.
   */
  broadcastChange() {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage('changed');
    }
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
      !leaderData ||
      now - leaderData.timestamp > this.tabCoordinationConfig.leaderTimeout ||
      (this.visibilityState === 'visible' && leaderData.visibilityState === 'hidden')
    ) {
      this.becomeLeader();
    } else {
      // Clear any existing interval before scheduling new one
      if (this.leaderCheckInterval) {
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
    if (this.leaderCheckInterval) {
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

    const leaderData = {
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

    if (!leaderData) {
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
    } else {
      // We are not leader - check if we should take over
      if (
        now - leaderData.timestamp > this.tabCoordinationConfig.leaderTimeout ||
        (this.visibilityState === 'visible' &&
          leaderData.visibilityState === 'hidden' &&
          now - this.lastVisibilityChange > 1000) // Give 1s grace period
      ) {
        this.tryBecomeLeader();
      }
    }
  }

  /**
   * Gets current leader data from localStorage.
   */
  private getLeaderData(): any | null {
    const ls = getLocalStorage();
    if (!ls) {
      return null;
    }

    try {
      const data = ls.getItem(this.leaderKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * Evaluates if this tab should take leadership based on visibility priority.
   */
  private evaluateLeadershipPriority() {
    if (this.isLeader) {
      return;
    } // Already leader

    const leaderData = this.getLeaderData();
    if (!leaderData) {
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
        this.initiateGracefulHandoff();
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

    if (successor) {
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
    const timeout = new Promise((resolve) => setTimeout(resolve, this.tabCoordinationConfig.handoffGracePeriod));

    const operations = Promise.all(this.pendingOperations);

    await Promise.race([operations, timeout]);
  }

  /**
   * Finds a suitable successor for leadership.
   */
  private async findSuccessor(): Promise<string | null> {
    return await new Promise((resolve) => {
      if (this.isDestroyed) {
        resolve(null);
        return;
      }

      const responses: { tabId: string; isVisible: boolean }[] = [];

      const handleResponse = (event: MessageEvent) => {
        if (event.data?.type === 'visibility-response') {
          responses.push({
            tabId: event.data.tabId,
            isVisible: event.data.isVisible,
          });
        }
      };

      // Listen for responses
      window.addEventListener('message', handleResponse);

      // Broadcast visibility check
      this.broadcastToTabs({
        type: 'visibility-check',
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
  private checkForActiveTabs(callback: (hasActive: boolean) => void) {
    if (this.isDestroyed) {
      callback(false);
      return;
    }

    const responses: boolean[] = [];

    const handleResponse = (event: MessageEvent) => {
      if (event.data?.type === 'visibility-response') {
        responses.push(event.data.isVisible);
      }
    };

    window.addEventListener('message', handleResponse);

    this.broadcastToTabs({
      type: 'visibility-check',
      fromTab: this.tabId,
    });

    const responseTimer = setTimeout(() => {
      this.activeResponseTimers.delete(responseTimer);
      window.removeEventListener('message', handleResponse);
      callback(responses.some((isVisible) => isVisible));
    }, 500);

    this.activeResponseTimers.add(responseTimer);
  }

  /**
   * Captures current state for handoff.
   */
  private async captureState(): Promise<any> {
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
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(message);
    }

    // Fallback to localStorage events
    const ls = getLocalStorage();
    if (ls) {
      try {
        const key = `frappe-sync-msg-${Date.now()}`;
        ls.setItem(key, JSON.stringify(message));
        setTimeout(() => {
          ls.removeItem(key);
        }, 100);
      } catch {}
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

    if (this.leaderCheckInterval) {
      clearInterval(this.leaderCheckInterval);
      this.leaderCheckInterval = undefined;
    }

    if (this.options.onLoseLeadership) {
      this.options.onLoseLeadership();
    }
  }

  /**
   * Generates a unique tab ID.
   */
  private generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Tracks a pending operation.
   */
  async trackOperation<T>(operation: Promise<T>): Promise<T> {
    this.pendingOperations.add(operation);
    operation
      .finally(() => {
        this.pendingOperations.delete(operation);
      })
      .catch(() => {});
    return await operation;
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
    if (this.leaderCheckInterval) {
      clearInterval(this.leaderCheckInterval);
      this.leaderCheckInterval = undefined;
    }

    // Clear all active response timers
    for (const timer of this.activeResponseTimers) {
      clearTimeout(timer);
    }
    this.activeResponseTimers.clear();

    // Remove visibility change listener
    this.cleanupVisibilityChange?.();
    this.cleanupVisibilityChange = undefined;

    // Close broadcast channel
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = undefined;
    }

    // Clear pending operations
    this.pendingOperations.clear();
  }
}

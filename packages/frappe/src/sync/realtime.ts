import type { DbModule } from '../db';
import type { RealtimeModule } from '../realtime';

import type { NormalizedCache } from './normalizedCache';
import type { RehydrationManager } from './rehydration';
import type { SubscriptionManager } from './subscriptionManager';
import { RealtimeEventType, RehydrationReason } from './types';
import type { ConnectionConfig, SyncOptions } from './types';

export class RealtimeHandler {
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private hasConnected = false;
  /** Live socket state: true between `connected` and `disconnect` events. */
  private connected = false;
  private readonly connectionConfig: Required<ConnectionConfig>;
  /** Refcount of active subscriptions per doctype — drives doctype room membership. */
  private readonly watchedDoctypes = new Map<string, number>();
  /** In-flight authoritative fetches, deduping concurrent doc_update/list_update pairs. */
  private readonly inflightFetches = new Map<string, Promise<void>>();
  private readonly db: DbModule;
  private readonly realtime: RealtimeModule | undefined;
  private readonly normalizedCache: NormalizedCache;
  private readonly subscriptionManager: SubscriptionManager;
  private readonly rehydrationManager: RehydrationManager | undefined;
  private readonly options: SyncOptions;

  constructor(
    db: DbModule,
    realtime: RealtimeModule | undefined,
    normalizedCache: NormalizedCache,
    subscriptionManager: SubscriptionManager,
    rehydrationManager: RehydrationManager | undefined,
    options: SyncOptions = {},
  ) {
    this.db = db;
    this.realtime = realtime;
    this.normalizedCache = normalizedCache;
    this.subscriptionManager = subscriptionManager;
    this.rehydrationManager = rehydrationManager;
    this.options = options;
    this.connectionConfig = {
      reconnectBaseDelay: options.connectionConfig?.reconnectBaseDelay ?? 1000,
      reconnectMaxDelay: options.connectionConfig?.reconnectMaxDelay ?? 30_000,
      reconnectJitter: options.connectionConfig?.reconnectJitter ?? 0.25,
      exponentialBackoff: options.connectionConfig?.exponentialBackoff ?? true,
    };
    this.setupRealtimeHandlers();
    this.setupConnectionManagement();
  }

  /**
   * Sets up realtime event handlers for document changes.
   *
   * Real Frappe (v15) wire protocol, verified live against a stock bench
   * (see .test-evidence/storybook-rubric/p-results/frappe-realtime-live-e2e.md):
   * - `doc_update`  `{doctype, name, modified}` — emitted to the per-doc room
   *   `doc:{doctype}/{name}` on every save.
   * - `list_update` `{doctype, name, user}` — emitted to the doctype room
   *   `doctype:{doctype}` on every save of a non-single, non-child doctype.
   * - Deletion emits the SAME two events (payload indistinguishable from an
   *   update) — there is NO `doc_deleted` event. Deletions are detected here
   *   opportunistically when the authoritative re-fetch 404s, but the durable
   *   deletion signal remains the tombstone/CDC backfill (`Deleted Document`
   *   doctype maintained by the `live` app's on_trash hook).
   *
   * Both real events funnel into the same fetch-and-reconcile path, deduped
   * so a doc_update/list_update pair for the same doc costs one fetch.
   */
  private setupRealtimeHandlers() {
    if (!this.realtime) {
      return;
    }

    this.realtime?.on('doc_update', async (payload) => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({
          type: RealtimeEventType.DocUpdate,
          payload,
        });
      }
      await this.onDocChanged(payload as { doctype: string; name: string });
    });

    this.realtime?.on('list_update', async (payload) => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({
          type: RealtimeEventType.ListUpdate,
          payload,
        });
      }
      await this.onDocChanged(payload as { doctype: string; name: string });
    });

    // `doc_deleted` is emitted by the `live` server app's on_trash hook
    // (live.live.tombstones.notify_deletion) to the doctype room after
    // commit — it gives subscribed clients an explicit deletion signal
    // (payload {doctype, name, deleted_at}) without the 404 probe below.
    // `doc_changed` remains a forward-compat no-op from the designed wire
    // protocol (src/core/wire.ts); stock frappe never emits it and the
    // dedup map absorbs doubles if a server ever does.
    this.realtime?.on('doc_changed', async (payload) => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({
          type: RealtimeEventType.DocChanged,
          payload,
        });
      }
      await this.onDocChanged(payload as { doctype: string; name: string });
    });

    this.realtime?.on('doc_deleted', async (payload) => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({
          type: RealtimeEventType.DocDeleted,
          payload,
        });
      }
      await this.onDocDeleted(payload as { doctype: string; name: string });
    });

    this.realtime?.on('perm_epoch_bump', () => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({ type: RealtimeEventType.PermEpochBump });
      }
      // Delegate cache reset to the main sync module
      if (this.options.onResetCache) {
        this.options.onResetCache();
      }
    });

    this.realtime?.on('connected', () => {
      this.onConnected();
    });

    this.realtime?.on('disconnect', () => {
      this.onDisconnected();
    });
  }

  /**
   * Sets up connection management with exponential backoff and jitter.
   */
  private setupConnectionManagement() {
    if (!this.realtime) {
      return;
    }

    // Attempt initial connection
    this.attemptConnection();
  }

  /**
   * Handles successful connection.
   */
  private onConnected() {
    this.hasConnected = true;
    this.connected = true;
    this.reconnectAttempts = 0;

    // Clear any pending reconnection timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.options.onRealtimeEvent) {
      this.options.onRealtimeEvent({ type: RealtimeEventType.Connected });
    }

    // Delegate backfill to the main sync module
    if (this.options.onBackfillAll) {
      this.options.onBackfillAll();
    }

    // Let store subscribers re-read connection state (reconnect indicators)
    this.options.onStoreChange?.();

    console.debug('[RealtimeHandler] Connected to realtime server');
  }

  /**
   * Handles disconnection with automatic reconnection.
   */
  private onDisconnected() {
    console.debug('[RealtimeHandler] Disconnected from realtime server');
    this.connected = false;
    this.options.onStoreChange?.();

    // Only attempt reconnection if we've successfully connected before
    if (this.hasConnected) {
      this.scheduleReconnection();
    }
  }

  /**
   * No-op placeholder retained for the disconnect backoff schedule below.
   * Transport reconnect is owned by Socket.IO inside RealtimeModule; this
   * layer only tracks attempts for logging / future health hooks.
   */
  private attemptConnection() {
    if (!this.realtime) {
      return;
    }
  }

  /**
   * Schedules a reconnection *watchdog* tick with exponential backoff and jitter.
   * Does not open sockets — RealtimeModule already reconnects. Kept so disconnect
   * storms remain observable (and existing unit tests stay meaningful).
   */
  private scheduleReconnection() {
    // Clear any existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.calculateReconnectDelay();

    console.debug(`[RealtimeHandler] Scheduling reconnection attempt ${this.reconnectAttempts + 1} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.attemptConnection();
    }, delay);
  }

  /**
   * Calculates the reconnection delay with exponential backoff and jitter.
   */
  private calculateReconnectDelay(): number {
    let delay = this.connectionConfig.reconnectBaseDelay;

    // Apply exponential backoff
    if (this.connectionConfig.exponentialBackoff) {
      delay = Math.min(
        this.connectionConfig.reconnectBaseDelay * 2 ** this.reconnectAttempts,
        this.connectionConfig.reconnectMaxDelay,
      );
    }

    // Apply jitter (±jitter%)
    const jitterRange = delay * this.connectionConfig.reconnectJitter;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    delay = Math.round(delay + jitter);

    // Ensure delay is within bounds
    return Math.max(this.connectionConfig.reconnectBaseDelay, Math.min(delay, this.connectionConfig.reconnectMaxDelay));
  }

  /**
   * Join the realtime doctype room for a doctype (refcounted). Called by the
   * sync module whenever a subscription for the doctype is added. Room
   * membership survives reconnects — RealtimeModule re-joins tracked rooms on
   * every `connect`.
   *
   * Note: only doctype-level rooms are joined. `list_update` fires for every
   * save of a regular doctype, which covers doc updates too; per-doc rooms
   * would only add coverage for single/read-only doctypes.
   */
  watchDoctype(doctype: string): void {
    const count = (this.watchedDoctypes.get(doctype) ?? 0) + 1;
    this.watchedDoctypes.set(doctype, count);
    if (count === 1 && this.realtime) {
      Promise.resolve(this.realtime.subscribeList(doctype)).catch((error) => {
        console.warn(`[RealtimeHandler] Failed to join doctype room ${doctype}:`, error);
      });
    }
  }

  /** Release one reference to a doctype room; leaves the room on the last one. */
  unwatchDoctype(doctype: string): void {
    const count = (this.watchedDoctypes.get(doctype) ?? 0) - 1;
    if (count > 0) {
      this.watchedDoctypes.set(doctype, count);
      return;
    }
    this.watchedDoctypes.delete(doctype);
    this.realtime?.unsubscribeList(doctype);
  }

  /** Leave all doctype rooms (used by cache resets/disposal). */
  unwatchAll(): void {
    if (this.realtime) {
      for (const doctype of this.watchedDoctypes.keys()) {
        this.realtime.unsubscribeList(doctype);
      }
    }
    this.watchedDoctypes.clear();
  }

  /**
   * Realtime handler: authoritative document changed.
   * Fetches document via REST with current user context to respect permissions,
   * updates cache, and reconciles subscription membership.
   *
   * Concurrent events for the same document (frappe emits doc_update AND
   * list_update per save) share a single in-flight fetch.
   */
  private async onDocChanged(payload: { doctype: string; name: string }): Promise<void> {
    const key = `${payload?.doctype}\0${payload?.name}`;
    const inflight = this.inflightFetches.get(key);
    if (inflight) {
      return await inflight;
    }
    const fetchPromise = this.fetchAndReconcile(payload).finally(() => {
      this.inflightFetches.delete(key);
    });
    this.inflightFetches.set(key, fetchPromise);
    return await fetchPromise;
  }

  private async fetchAndReconcile(payload: { doctype: string; name: string }) {
    try {
      // Fetch authoritative document to respect permissions and server-only fields
      const document = await this.db.getDoc<any>(payload.doctype, payload.name);
      this.normalizedCache.upsert(document);

      // Update subscription membership for this document
      // This returns subscriptions that need rehydration for new documents
      const subscriptionsNeedingRehydration = this.subscriptionManager.updateSubscriptionMembership(document);

      // Schedule rehydration for subscriptions with new remote documents
      for (const subscription of subscriptionsNeedingRehydration) {
        this.rehydrationManager?.scheduleRehydration(subscription, RehydrationReason.RemoteCreate);
      }

      // Cache/membership changed without a local mutation or backfill —
      // notify the store so live queries re-render the patched rows.
      this.options.onStoreChange?.();
    } catch (error) {
      // Frappe emits a plain doc_update/list_update on deletion (no doc_deleted
      // event exists) — a 404 on the authoritative re-fetch means the document
      // is gone (deleted, or read access revoked): evict it. The tombstone/CDC
      // backfill remains the durable deletion signal for events missed offline.
      if ((error as { status?: number })?.status === 404) {
        await this.onDocDeleted(payload);
        return;
      }
      // Other failures (network, transient server errors): skip this update —
      // the next backfill will catch any missed changes
      console.warn(`Failed to fetch document ${payload?.doctype}/${payload?.name} during realtime update:`, error);
    }
  }

  /**
   * Realtime handler: evicts document from cache and subscriptions.
   */
  private async onDocDeleted(payload: { doctype: string; name: string }) {
    try {
      // Evict the deleted document from cache
      this.normalizedCache.remove({
        doctype: payload.doctype,
        name: payload.name,
      });

      // Remove from all subscription memberships
      // This returns subscriptions that had the document removed
      const affectedSubscriptions = this.subscriptionManager.removeFromAllSubscriptions(payload.doctype, payload.name);

      // Schedule rehydration for affected subscriptions to fill the gap
      for (const subscription of affectedSubscriptions) {
        this.rehydrationManager?.scheduleRehydration(subscription, RehydrationReason.Delete);
      }

      // Row evicted — notify the store so live queries drop it immediately.
      this.options.onStoreChange?.();
    } catch (error) {
      console.warn(`Failed to process doc_deleted for ${payload?.doctype}/${payload?.name}:`, error);
    }
  }

  /**
   * Checks if realtime is healthy for echo suppression decisions.
   */
  isRealtimeHealthy(): boolean {
    return this.realtime?.isHealthy() ?? false;
  }

  getIsConnected(): boolean {
    return this.hasConnected;
  }

  /**
   * Live connection snapshot for reconnect indicators.
   * `connected` tracks the socket right now; `everConnected` distinguishes
   * "reconnecting" (was up, dropped) from "never had realtime" (fixtures,
   * SSR, no realtime module).
   */
  getConnectionState(): { connected: boolean; everConnected: boolean } {
    return { connected: this.connected, everConnected: this.hasConnected };
  }

  /**
   * Disposes of resources and clears timers.
   */
  dispose() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.unwatchAll();

    if (this.realtime) {
      this.realtime?.disconnect();
    }
  }
}

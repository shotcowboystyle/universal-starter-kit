import type { DbModule } from '../db';
import type { RealtimeModule } from '../realtime';

import type { NormalizedCache } from './normalized-cache';
import type { RehydrationManager } from './rehydration';
import type { SubscriptionManager } from './subscription-manager';
import { RealtimeEventType, RehydrationReason } from './types';
import type { ConnectionConfig, SyncOptions } from './types';

/** Doc reference carried by realtime change/delete events. */
interface DocRef {
  doctype: string;
  name: string;
}

/** Live socket snapshot returned by {@link RealtimeHandler.getConnectionState}. */
export interface RealtimeConnectionState {
  connected: boolean;
  everConnected: boolean;
}

// SAFETY: realtime payloads are unvalidated wire data. Every consumer reads the fields inside
// try/catch (or via optional chaining), so a malformed payload degrades to a logged no-op.
// oxlint-disable-next-line anti-slop/no-unknown-parameters, typescript/no-unsafe-type-assertion -- see SAFETY above
const asDocRef = (payload: unknown): DocRef => payload as DocRef;

const joinDoctypeRoom = async (realtime: RealtimeModule, doctype: string): Promise<void> => {
  try {
    await realtime.subscribeList(doctype);
  } catch (error) {
    // Safe to continue: realtime is best-effort; the CDC backfill catches changes missed without the room.
    console.warn(`[RealtimeHandler] Failed to join doctype room ${doctype}:`, error);
  }
};

export class RealtimeHandler {
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
    const { realtime } = this;
    if (!realtime) {
      return;
    }

    // The change/delete handlers return their reconcile promise so callers can await settling;
    // they never reject (fetchAndReconcile and onDocDeleted catch and log).
    // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- see above
    void realtime.on('doc_update', async (payload) => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({
          type: RealtimeEventType.DocUpdate,
          payload,
        });
      }
      await this.onDocChanged(asDocRef(payload));
    });

    // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- awaitable handler, never rejects
    void realtime.on('list_update', async (payload) => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({
          type: RealtimeEventType.ListUpdate,
          payload,
        });
      }
      await this.onDocChanged(asDocRef(payload));
    });

    // `doc_deleted` is emitted by the `live` server app's on_trash hook
    // (live.live.tombstones.notify_deletion) to the doctype room after
    // commit — it gives subscribed clients an explicit deletion signal
    // (payload {doctype, name, deleted_at}) without the 404 probe below.
    // `doc_changed` remains a forward-compat no-op from the designed wire
    // protocol (src/core/wire.ts); stock frappe never emits it and the
    // dedup map absorbs doubles if a server ever does.
    // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- awaitable handler, never rejects
    void realtime.on('doc_changed', async (payload) => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({
          type: RealtimeEventType.DocChanged,
          payload,
        });
      }
      await this.onDocChanged(asDocRef(payload));
    });

    // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- awaitable handler, never rejects
    void realtime.on('doc_deleted', async (payload) => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({
          type: RealtimeEventType.DocDeleted,
          payload,
        });
      }
      await this.onDocDeleted(asDocRef(payload));
    });

    void realtime.on('perm_epoch_bump', () => {
      if (this.options.onRealtimeEvent) {
        this.options.onRealtimeEvent({ type: RealtimeEventType.PermEpochBump });
      }
      // Delegate cache reset to the main sync module
      if (this.options.onResetCache) {
        this.options.onResetCache();
      }
    });

    void realtime.on('connected', () => {
      this.onConnected();
    });

    void realtime.on('disconnect', () => {
      this.onDisconnected();
    });
  }

  /**
   * Handles successful connection.
   */
  private onConnected() {
    this.hasConnected = true;
    this.connected = true;
    this.reconnectAttempts = 0;

    // Clear any pending reconnection timers
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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
   * Schedules a reconnection *watchdog* tick with exponential backoff and jitter.
   * Does not open sockets — transport reconnect is owned by Socket.IO inside
   * RealtimeModule; this layer only counts attempts so disconnect storms remain
   * observable (and existing unit tests stay meaningful).
   */
  private scheduleReconnection() {
    // Clear any existing timer
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.calculateReconnectDelay();

    console.debug(`[RealtimeHandler] Scheduling reconnection attempt ${this.reconnectAttempts + 1} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts += 1;
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
    // oxlint-disable-next-line sonarjs/pseudo-random -- backoff jitter only spreads reconnects; not security-sensitive
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
      void joinDoctypeRoom(this.realtime, doctype);
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
  private async onDocChanged(payload: DocRef): Promise<void> {
    const key = `${payload?.doctype}\0${payload?.name}`;
    const inflight = this.inflightFetches.get(key);
    if (inflight) {
      await inflight;
      return;
    }
    const fetchPromise = this.fetchAndRelease(key, payload);
    this.inflightFetches.set(key, fetchPromise);
    await fetchPromise;
  }

  private async fetchAndRelease(key: string, payload: DocRef): Promise<void> {
    try {
      await this.fetchAndReconcile(payload);
    } finally {
      this.inflightFetches.delete(key);
    }
  }

  private async fetchAndReconcile(payload: DocRef) {
    try {
      // Fetch authoritative document to respect permissions and server-only fields
      const document = await this.db.getDoc(payload.doctype, payload.name);
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
      // SAFETY: rejection values are untyped; optional chaining reads `status` from any shape.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      if ((error as { status?: number } | null | undefined)?.status === 404) {
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
  private async onDocDeleted(payload: DocRef) {
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
  getConnectionState(): RealtimeConnectionState {
    return { connected: this.connected, everConnected: this.hasConnected };
  }

  /**
   * Disposes of resources and clears timers.
   */
  dispose() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.unwatchAll();

    if (this.realtime) {
      this.realtime?.disconnect();
    }
  }
}

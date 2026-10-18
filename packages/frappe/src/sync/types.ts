import type { FrappeDoc, FrappeDocData, FrappeDocValue } from '../common/types';
import type { WriteStrategy } from '../core/types';

import type { FieldMergeStrategyOrFunction } from './merge';

export enum Order {
  Asc = 'asc',
  Desc = 'desc',
}

export interface OrderByField {
  field: string;
  order: Order;
}

export type OrderBy = OrderByField | OrderByField[];

/**
 * Page length used when a subscription (and so a collection) carries no
 * explicit `limit`. Frappe's /api/resource clamps a request with no
 * `limit_page_length` to 20 rows while a fixture provider slices only when
 * asked, so both paths send this value explicitly and return the same rows.
 * `limit: 0` is Frappe's "every row" and means the same in fixture mode.
 */
export const defaultPageLength = 20;

export interface SubscriptionQuery {
  doctype: string;
  fields?: readonly string[];
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- public API: Frappe filter values are arbitrary per-field operands the server validates
  filters?: [string, string, unknown][] | Record<string, unknown>;
  /** Rows per page. Absent means {@link defaultPageLength}; `0` means every row. */
  limit?: number;
  limitStart?: number;
  orderBy?: OrderBy;
  /**
   * When true, the subscription uses the VirtualPageManager for progressive
   * cache and cursor-based pagination. Enables `getPage()`, `getNextBatch()`,
   * and `getPageInfo()` on the SyncModule.
   */
  progressive?: boolean;
}

// DocumentValue and FrappeDoc are now imported from common/types.ts

/** Placement type for optimistic items in paginated views */
export enum PlacementType {
  Before = 'before',
  Within = 'within',
  After = 'after',
  Unknown = 'unknown',
}

/** Page boundary tracking for optimistic placement */
export interface PageBoundaries<Data extends FrappeDocData> {
  firstItem?: FrappeDoc<Data>;
  lastItem?: FrappeDoc<Data>;
  offset: number;
  pageSize: number;
  temporaryOverflow?: number;
}

/** Pending rehydration types */
export enum PendingRehydrationType {
  ItemOnly = 'item-only',
  FullRefresh = 'full-refresh',
}

/** In-memory subscription tracking with backfill checkpoint and member doc ids. */
export interface Subscription {
  id: string;
  query: SubscriptionQuery;
  /** CDC checkpoint for incremental sync */
  checkpoint?: string;
  /** Cursor for stable pagination */
  cursor?: string;
  docIds: string[];
  /** Page boundaries for optimistic placement */
  boundaries?: PageBoundaries<FrappeDocData>;
  /** Page lock expiry timestamp */
  lockExpiry?: number;
  /** Pending rehydration strategy */
  pendingRehydration?: PendingRehydrationType;
  /** Metadata for tracking items outside current page */
  metadata?: {
    itemsBeforePage?: number;
    itemsAfterPage?: number;
  };
  /** Tombstones for tracking deleted documents with timestamps */
  tombstones?: Map<string, number>;
  /**
   * True when the last network refresh for this subscription failed and its
   * membership is being served from the persisted cache. Cleared by the next
   * successful refresh or CDC backfill.
   */
  stale?: boolean;
}

export enum Operation {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
}

export enum Status {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Failed = 'failed',
}

export interface FrappeDocRef {
  doctype: string;
  name: string;
}

export interface CreateMutation<D extends FrappeDocData> {
  mutationId: string;
  operation: Operation.Create;
  doc: FrappeDoc<D>;
  version?: string;
  affected?: { doctype: string; name: string }[];
  /**
   * Client-side temporary identity the optimistic row was inserted under.
   * Set by the engine when the mutation is applied: equals `doc.name` when
   * the consumer provided a placeholder, otherwise an engine-generated
   * `tmp_*` id (which is never sent to the server). The server ack remap,
   * rollback, and journal paths all resolve the optimistic row through
   * this single field.
   */
  temporaryName?: string;
  /**
   * Custom server transport. When set, the engine performs the write via
   * this function instead of `db.createDoc` — everything else (optimistic
   * apply, journal, temp→real remap, rollback, ledger) is unchanged. Used
   * for desk RPCs whose server-side behavior a plain REST insert cannot
   * reproduce (e.g. `frappe.desk.form.utils.add_comment` inserts with
   * ignore_permissions and extracts inline images). Must resolve with the
   * created document (the ack the remap needs). Mutations carrying a
   * transport skip request batching, and a journal replay after a page
   * refresh falls back to the REST path (functions don't persist).
   */
  execute?: () => Promise<FrappeDoc<D>>;
}

export interface UpdateMutation<Data extends FrappeDocData> {
  mutationId: string;
  operation: Operation.Update;
  doc: FrappeDoc<Data>;
  version?: string;
  affected?: { doctype: string; name: string }[];
  /**
   * Custom server transport (see {@link CreateMutation.execute}). May
   * resolve with the updated document to seed the cache; resolving void
   * keeps the optimistic value until the realtime echo reconciles.
   */
  // oxlint-disable-next-line typescript/no-invalid-void-type -- public API: transports that resolve nothing (inferred `Promise<void>`) must stay assignable
  execute?: () => Promise<FrappeDoc<Data> | void>;
}

export interface DeleteMutation<Data extends FrappeDocData> {
  mutationId: string;
  operation: Operation.Delete;
  version?: string;
  doc: FrappeDoc<Data>;
  affected?: { doctype: string; name: string }[];
  /** Custom server transport (see {@link CreateMutation.execute}). */
  execute?: () => Promise<void>;
}

export type Mutation<Data extends FrappeDocData> = CreateMutation<Data> | UpdateMutation<Data> | DeleteMutation<Data>;

export enum BackfillScope {
  All = 'all',
  Doctypes = 'doctypes',
  Subscriptions = 'subscriptions',
  Docs = 'docs',
}

export interface BackfillArgs {
  scope: BackfillScope;
  doctypes?: string[];
  subscriptions?: string[];
  docs?: { doctype: string; name: string }[];
  pageSize?: number;
}

/** Types of realtime events */
export enum RealtimeEventType {
  /** Real Frappe event: emitted to the per-doc room on every save (and on delete). */
  DocUpdate = 'doc_update',
  /** Real Frappe event: emitted to the doctype room on every save (and on delete). */
  ListUpdate = 'list_update',
  /** Designed wire-protocol event (forward-compat) — stock Frappe never emits it. */
  DocChanged = 'doc_changed',
  /** Designed wire-protocol event (forward-compat) — stock Frappe never emits it. */
  DocDeleted = 'doc_deleted',
  Connected = 'connected',
  PermEpochBump = 'perm_epoch_bump',
}

export interface SyncCatchUpState {
  readonly refreshing: boolean;
  readonly stale: boolean;
  readonly error: unknown;
}

export interface SyncOptions {
  /** Lifecycle catch-up uses CDC by default; snapshot requires only resource reads. */
  catchUpStrategy?: 'cdc' | 'snapshot';
  /** Writes go through the live app by default; resource uses only Frappe's /api/resource routes. */
  writeStrategy?: WriteStrategy;
  pageSize?: number;
  persistKey?: string;
  onConflict?: (info: { doctype: string; name?: string }) => void;
  onRetry?: (info: { id: string; operation: Operation }) => void;
  onBackfill?: (info: { doctype: string; fetched: number; checkpoint?: string }) => void;
  storage?: KVStorage;
  versionField?: string;
  versionFields?: Record<string, string>;
  /**
   * CRDT-like field merge configuration per doctype.
   * Maps doctype → field name → merge strategy or custom function.
   * Strategies: 'client-wins', 'server-wins', 'sum', 'max', 'min', 'union-set',
   * or a custom `(base, client, server) => resolved` function.
   */
  fieldMergeConfig?: Record<string, Record<string, FieldMergeStrategyOrFunction>>;
  onMutationStart?: <Data extends FrappeDocData>(mutation: Mutation<Data>) => void;
  onOptimisticApply?: (info: { doctype: string; name?: string; operation: Operation }) => void;
  onMutationSuccess?: <Data extends FrappeDocData>(mutation: Mutation<Data>) => void;
  onMutationError?: <Data extends FrappeDocData>(info: { mutation: Mutation<Data>; err: unknown }) => void;
  onReplayStart?: () => void;
  onReplayComplete?: (info: { anyFailed: boolean }) => void;
  onRealtimeEvent?: (info: { type: RealtimeEventType; payload?: unknown }) => void;
  onTrace?: (info: { event: string; details?: unknown }) => void;
  onResetCache?: () => void;
  onBackfillAll?: () => void;
  /**
   * Internal: invoked after realtime-driven cache/membership changes
   * (doc_update/list_update reconcile, doc_deleted eviction, rehydration,
   * connection state flips) so the sync store can notify its listeners.
   * Wired by SyncModule; not intended for consumer use.
   */
  onStoreChange?: () => void;
  /** Connection management configuration */
  connectionConfig?: ConnectionConfig;
  /** Multi-tab coordination configuration */
  tabCoordination?: TabCoordinationConfig;
  /** Mutation TTL in milliseconds (default: 24 hours) */
  mutationTTL?: number;
  /** Batch size for fetching documents (default: 100) */
  batchSize?: number;
  /**
   * Max CDC pages drained per backfill when the server reports has_more
   * (default: 20). Bounds catch-up work after long offline periods in both
   * drain paths: the subscription drain (SubscriptionManager.backfillSub)
   * and the periodic/recovery path (BackfillManager.incrementalBackfill).
   */
  backfillMaxPages?: number;
  /** Maximum number of documents to keep in normalized cache (default: unlimited) */
  maxCacheSize?: number;
  /** Enable automatic mutation batching (default: false) */
  enableBatching?: boolean;
  /** Batch delay in milliseconds - time to wait before sending batch (default: 100ms) */
  batchDelay?: number;
  /** Maximum mutations per batch (default: 50) */
  batchMaxSize?: number;
  /** Use atomic batching - all mutations succeed or all fail (default: false) */
  batchAtomic?: boolean;
  /** Rate limit for mutation replay - max mutations per second (default: 10) */
  replayRateLimit?: number;
  /**
   * Optional interval (in milliseconds) for the selected catch-up strategy.
   * Acts as a safety net for silent socket drops. Set to 0 or omit
   * to rely solely on event-driven backfill (focus, online, reconnect).
   * Recommended: 30000 (30 seconds) for production.
   */
  cdcInterval?: number;
  /** Enable cursor pagination (requires server extension) */
  useCursorPagination?: boolean;
  /** Maximum age of tombstones in milliseconds before cleanup (default: 30 minutes) */
  tombstoneMaxAge?: number;
  /** Maximum number of tombstones per subscription before cleanup (default: 1000) */
  tombstoneMaxCount?: number;
  /**
   * How long (in milliseconds) a subscription restored from a persisted
   * snapshot may stay unadopted before it is garbage-collected (default:
   * 30 minutes). Restored subscriptions are re-adopted (id, checkpoint, and
   * cached membership reused) when an identical query subscribes; unadopted
   * ones are excluded from backfill and dropped after this grace period.
   * Only relevant when `persistKey` is set.
   */
  restoredSubscriptionTTL?: number;
  /** Callback when tab becomes leader */
  onBecomeLeader?: () => void;
  /** Callback when tab loses leadership */
  onLoseLeadership?: () => void;
}

export interface KVStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/** Type of rehydration strategy */
export enum RehydrationStrategyType {
  FetchItemOnly = 'fetch-item-only',
  FullRefresh = 'full-refresh',
}

/** Rehydration strategy for updating subscriptions */
export interface RehydrationStrategy {
  type: RehydrationStrategyType;
  priority: number;
  delay: number;
}

/** Rehydration task queued for execution */
export interface RehydrationTask {
  subscriptionId: string;
  strategy: RehydrationStrategy;
  scheduledAt: number;
}

/** Reasons for triggering rehydration */
export enum RehydrationReason {
  Create = 'create',
  Delete = 'delete',
  Overflow = 'overflow',
  RemoteCreate = 'remote-create',
  Uncertain = 'uncertain',
}

export interface MutationJournalEntry<Data extends FrappeDocData> {
  createdAt: number;
  error?: unknown;
  id: string;
  mutation: Mutation<Data>;
  optimisticData?: Record<string, FrappeDocValue>;
  originalData?: Record<string, FrappeDocValue>;
  retryCount: number;
  sequence: number;
  status: Status;
  timestamp: number;
  ttl?: number;
}

/** Status of a mutation batch */
export enum MutationBatchStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

/** Mutation batch for sending multiple mutations together */
export interface MutationBatch<Data extends FrappeDocData> {
  batchId: string;
  mutations: Mutation<Data>[];
  createdAt: number;
  status: MutationBatchStatus;
}

/** Connection management configuration */
export interface ConnectionConfig {
  /** Base delay for reconnection (default: 1000ms) */
  reconnectBaseDelay?: number;
  /** Maximum delay for reconnection (default: 30000ms) */
  reconnectMaxDelay?: number;
  /** Jitter factor for reconnection (default: 0.25 = ±25%) */
  reconnectJitter?: number;
  /** Enable exponential backoff (default: true) */
  exponentialBackoff?: boolean;
}

/** Multi-tab coordination configuration */
export interface TabCoordinationConfig {
  /** Enable active tab priority leadership (default: true) */
  activeTabPriority?: boolean;
  /** Leader timeout in milliseconds (default: 5000ms) */
  leaderTimeout?: number;
  /** Grace period for handoff operations (default: 2000ms) */
  handoffGracePeriod?: number;
}

/** Tab coordination message types */
export type TabMessage<Data extends FrappeDocData> =
  | { type: 'heartbeat'; tabId: string }
  | { type: 'leadership-request'; tabId: string; visibilityState: string }
  | { type: 'mutation'; mutation: Mutation<Data> }
  | { type: 'sync-state'; state: unknown }
  | { type: 'visibility-check'; fromTab: string }
  | { type: 'visibility-response'; tabId: string; isVisible: boolean }
  | {
      type: 'leadership-handoff';
      fromTab: string;
      toTab: string;
      state?: unknown;
    };

/** Page island represents a cached range of pages */
export interface PageIsland {
  startPage: number;
  endPage: number;
  startIndex: number;
  endIndex: number;
  fetchedVia: 'cursor' | 'offset';
}

/** Debug snapshot of a subscription's state */
export interface DebugSubscription {
  id: string;
  query: SubscriptionQuery;
  docCount: number;
  tombstoneCount: number;
  checkpoint?: string;
  cursor?: string;
  /** Serving persisted cache after a failed network refresh. */
  stale?: boolean;
  /** Restored from a persisted snapshot and not yet re-adopted by a live query. */
  restored?: boolean;
  progressiveCache?: {
    docIds: string[];
    nextCursor?: string;
    hasMore: boolean;
    totalCount?: number;
    lastFetchedAt?: string;
    islands?: PageIsland[];
  };
  pageInfo?: {
    currentPage: number;
    knownPages: number;
    totalPages: number | 'unknown';
    hasMore: boolean;
    itemsInCache: number;
    pageSize: number;
  };
}

/** Debug snapshot of a mutation journal entry */
export interface DebugMutationEntry {
  id: string;
  operation: Operation;
  doctype: string;
  docname?: string;
  status: Status;
  createdAt: number;
  retryCount: number;
  error?: string;
}

/** Full debug state snapshot from SyncModule.__debug() */
export interface FrappeDebugState {
  subscriptions: DebugSubscription[];
  normalizedCache: {
    size: number;
    doctypes: { doctype: string; count: number }[];
  };
  mutationJournal: {
    pending: DebugMutationEntry[];
    confirmed: DebugMutationEntry[];
    failed: DebugMutationEntry[];
  };
  connection: {
    socketConnected: boolean;
    isLeader: boolean;
    isOnline: boolean;
    lastBackfillAt?: string;
  };
}

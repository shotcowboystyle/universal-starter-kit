import type { FrappeDoc, FrappeDocBase, FrappeDocData, FrappeDocValue } from '../common/types';
import type { ListOptions } from '../core/types';
import type { DbModule } from '../db';

import { BackfillManager } from './backfill';
import { extractSingleName, matchesFilters } from './filters';
import type { NormalizedCache } from './normalized-cache';
import { BackfillScope, defaultPageLength, Order } from './types';
import type { BackfillArgs, OrderBy, OrderByField, Subscription, SubscriptionQuery, SyncOptions } from './types';
import { VirtualPageManager } from './virtual-page-manager';

/** A list read: a bare row array, or `{ data, cursor }` from a cursor-paginating transport. */
type ListResponse<Data extends FrappeDocData> = FrappeDoc<Data>[] | { data: FrappeDoc<Data>[]; cursor?: string };

const cryptoRandomId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // oxlint-disable-next-line sonarjs/pseudo-random -- fallback for runtimes without crypto.randomUUID; the id only needs to be locally unique, not unguessable
  return Math.random().toString(36).slice(2);
};

/** Max `modified` across rows: the CDC checkpoint (robust to server ordering). */
const maxModified = (rows: FrappeDocBase[]): string | undefined => {
  let checkpoint: string | undefined;
  for (const { modified } of rows) {
    if (modified !== undefined && modified !== '' && (checkpoint === undefined || modified > checkpoint)) {
      checkpoint = modified;
    }
  }
  return checkpoint;
};

/** Ascending comparison of two sort values; nullish values sort first. */
const compareSortValues = (first: FrappeDocValue, second: FrappeDocValue): number => {
  const firstIsNullish = first === null || first === undefined;
  const secondIsNullish = second === null || second === undefined;
  if (firstIsNullish || secondIsNullish) {
    if (firstIsNullish === secondIsNullish) {
      return 0;
    }
    return firstIsNullish ? -1 : 1;
  }
  if (first < second) {
    return -1;
  }
  return first > second ? 1 : 0;
};

const compareNames = (first: string, second: string): number => {
  if (first < second) {
    return -1;
  }
  return first > second ? 1 : 0;
};

/** Compares two docs by each orderBy field in turn (nullish first when ascending). */
const compareByOrder = (
  firstDoc: Record<string, FrappeDocValue> | undefined,
  secondDoc: Record<string, FrappeDocValue> | undefined,
  orderByArray: OrderByField[],
): number => {
  for (const { field, order } of orderByArray) {
    const comparison = compareSortValues(firstDoc?.[field], secondDoc?.[field]);
    if (comparison !== 0) {
      return order === Order.Desc ? -comparison : comparison;
    }
  }
  return 0;
};

/**
 * Result of `SubscriptionManager.subscribe`.
 */
export interface SubscribeResult<Data extends FrappeDocData> {
  subscriptionId: string;
  rows: FrappeDoc<Data>[];
  checkpoint?: string;
  /**
   * Present only when a restored (persisted) subscription was re-adopted:
   * the returned `rows` came from the cache and this promise tracks the
   * background network refresh. Never rejects — a failed refresh marks the
   * subscription `stale` and resolves `{ ok: false }`.
   */
  refresh?: Promise<{ ok: boolean; error?: unknown }>;
}

export interface SubscriptionRefreshOptions {
  doctypes?: string[];
}

export interface SubscriptionRefreshResult {
  subscriptionId: string;
  ok: boolean;
  error?: unknown;
}

export class SubscriptionManager {
  private readonly refreshes = new Map<
    string,
    {
      requested: boolean;
      promise: Promise<SubscriptionRefreshResult>;
    }
  >();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly virtualPageManager: VirtualPageManager;
  private readonly backfillManager: BackfillManager;
  /** Maps a stable query key to an existing subscriptionId for dedup */
  private readonly queryKeyToSubId = new Map<string, string>();
  /** Reference counts per subscriptionId for shared subscription lifecycle */
  private readonly subRefCounts = new Map<string, number>();
  /**
   * Subscriptions restored from a persisted snapshot (or detached on
   * unsubscribe while persistence is on) that no live query has re-adopted
   * yet. They serve cache-first renders on re-subscribe, are excluded from
   * backfill fan-out, and are GC'd after `restoredSubscriptionTTL`.
   */
  private readonly restoredByQueryKey = new Map<string, string>();
  /** Restore/detach timestamps per restored subscriptionId (for TTL GC). */
  private readonly restoredAt = new Map<string, number>();
  private readonly db: DbModule;
  private readonly normalizedCache: NormalizedCache;
  private readonly options: SyncOptions;

  constructor(db: DbModule, normalizedCache: NormalizedCache, options: SyncOptions = {}) {
    this.db = db;
    this.normalizedCache = normalizedCache;
    this.options = options;
    this.virtualPageManager = new VirtualPageManager(this.normalizedCache, this.db, {
      batchSize: this.options.batchSize,
    });
    this.backfillManager = new BackfillManager(this.db, this.normalizedCache, {
      pageSize: this.options.pageSize,
      maxPages: this.options.backfillMaxPages,
    });
  }

  async subscribe<Data extends FrappeDocData>(query: SubscriptionQuery): Promise<SubscribeResult<Data>> {
    // Dedup: if an identical query is already active, reuse it
    const queryKey = JSON.stringify(query);
    const existingId = this.queryKeyToSubId.get(queryKey);
    const existing = existingId === undefined ? undefined : this.subscriptions.get(existingId);
    if (existingId !== undefined && existing) {
      this.subRefCounts.set(existingId, (this.subRefCounts.get(existingId) ?? 1) + 1);
      const rows = this.getDocsForSubscription<Data>(existingId);
      const { checkpoint } = existing;
      return { subscriptionId: existingId, rows, checkpoint };
    }

    // Cache-first: re-adopt a matching subscription restored from a persisted
    // snapshot — serve its cached membership immediately and refresh from the
    // network in the background.
    const adopted = this.adoptRestoredSubscription<Data>(queryKey, query);
    if (adopted) {
      return adopted;
    }

    const subscriptionId = cryptoRandomId();
    const { rows, cursor, checkpoint } = await this.fetchInitialRows<Data>(query);
    this.seedRows(query, rows);
    // Materialize the in-memory subscription record with initial membership
    const subscription: Subscription = {
      id: subscriptionId,
      query,
      // For CDC backfill
      checkpoint,
      // For stable pagination
      cursor,
      docIds: rows.map((row) => row.name),
      tombstones: new Map<string, number>(),
    };

    // Track page boundaries for optimistic placement
    if (rows.length > 0) {
      subscription.boundaries = {
        firstItem: rows[0],
        lastItem: rows.at(-1),
        offset: query.limitStart ?? 0,
        pageSize: query.limit ?? defaultPageLength,
      };
    }

    // Initialize metadata for tracking items outside current page
    subscription.metadata = {
      itemsBeforePage: 0,
      itemsAfterPage: 0,
    };

    // Activate it
    this.subscriptions.set(subscriptionId, subscription);
    this.queryKeyToSubId.set(queryKey, subscriptionId);
    this.subRefCounts.set(subscriptionId, 1);

    // Register with VirtualPageManager for progressive pagination if requested
    if (query.progressive) {
      this.virtualPageManager.registerSubscription(subscriptionId, subscription, subscription.docIds, cursor);
    }

    // Provide the caller with the seeded rows and computed checkpoint
    return { subscriptionId, rows, checkpoint };
  }

  async refreshSubscriptions(options: SubscriptionRefreshOptions = {}): Promise<SubscriptionRefreshResult[]> {
    const doctypes = options.doctypes ? new Set(options.doctypes) : undefined;
    const subscriptions = [...this.subscriptions.values()].filter(
      (subscription) =>
        (this.subRefCounts.get(subscription.id) ?? 0) > 0 && (!doctypes || doctypes.has(subscription.query.doctype)),
    );
    return await Promise.all(subscriptions.map(async (subscription) => await this.refreshSubscription(subscription)));
  }

  private async refreshSubscription(subscription: Subscription): Promise<SubscriptionRefreshResult> {
    const subscriptionId = subscription.id;
    if (subscription.query.progressive) {
      return {
        subscriptionId,
        ok: false,
        error: new Error('Snapshot refresh does not support progressive subscriptions'),
      };
    }
    const existing = this.refreshes.get(subscriptionId);
    if (existing) {
      existing.requested = true;
      return await existing.promise;
    }
    const state = {
      requested: false,
      promise: Promise.resolve<SubscriptionRefreshResult>({ subscriptionId, ok: false }),
    };
    const active = () =>
      this.refreshes.get(subscriptionId) === state &&
      this.subscriptions.get(subscriptionId) === subscription &&
      (this.subRefCounts.get(subscriptionId) ?? 0) > 0;
    // Deferred one microtask so `this.refreshes` holds `state` before the loop's first active() check.
    // oxlint-disable-next-line promise/prefer-await-to-then, github/no-then -- the deferral above is the point; an async IIFE would run the first fetch synchronously
    state.promise = Promise.resolve().then(async () => {
      try {
        // oxlint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- each `continue` retries a read superseded by a newer request
        while (true) {
          state.requested = false;
          try {
            // oxlint-disable-next-line eslint/no-await-in-loop -- a superseded read retries only after the previous one settles
            const { rows, cursor, checkpoint } = await this.fetchInitialRows(subscription.query);
            if (!active()) {
              return {
                subscriptionId,
                ok: false,
                error: new Error('Subscription is no longer active'),
              };
            }
            if (state.requested) {
              continue;
            }
            this.seedRows(subscription.query, rows);
            subscription.docIds = rows.map((row) => row.name);
            subscription.cursor = cursor;
            subscription.checkpoint = checkpoint;
            subscription.boundaries = rows.length
              ? {
                  firstItem: rows[0],
                  lastItem: rows.at(-1),
                  offset: subscription.query.limitStart ?? 0,
                  pageSize: subscription.query.limit ?? defaultPageLength,
                }
              : undefined;
            subscription.metadata = { itemsBeforePage: 0, itemsAfterPage: 0 };
            subscription.stale = false;
            return { subscriptionId, ok: true };
          } catch (error) {
            if (active() && state.requested) {
              continue;
            }
            if (active()) {
              subscription.stale = true;
            }
            return { subscriptionId, ok: false, error };
          }
        }
      } finally {
        if (this.refreshes.get(subscriptionId) === state) {
          this.refreshes.delete(subscriptionId);
        }
      }
    });
    this.refreshes.set(subscriptionId, state);
    return await state.promise;
  }

  /**
   * Performs the initial subscription fetch (single doc via getDoc, lists via
   * getDocList) and computes the CDC checkpoint
   * as the max `modified` across returned rows. Shared by fresh subscribes
   * and adopted-subscription refreshes so both have identical semantics.
   */
  private async fetchInitialRows<Data extends FrappeDocData>(
    query: SubscriptionQuery,
  ): Promise<{ rows: FrappeDoc<Data>[]; cursor?: string; checkpoint?: string }> {
    // Only restrict fields when the caller explicitly specifies them.
    // When fields is undefined/empty, pass undefined so all fields are returned.
    const queryFields =
      query.fields !== undefined && query.fields.length > 0
        ? [...new Set([...query.fields, 'modified', 'name'])]
        : undefined;
    let rows: FrappeDoc<Data>[] = [];
    let cursor: string | undefined;
    const singleName = extractSingleName(query.filters);
    if (singleName !== undefined && singleName !== '') {
      try {
        // A transport may resolve nothing for a missing doc instead of rejecting with 404.
        const document = await this.db.getDoc<Data>(query.doctype, singleName);
        rows = document == null ? [] : [document];
      } catch (error) {
        // Check if this is a 404 (document not found) vs other errors
        if (!(error instanceof Object && 'status' in error && error.status === 404)) {
          // Re-throw other errors (network issues, permission errors, etc.)
          throw error;
        }
        // Document not found - return empty rows
        rows = [];
      }
    } else {
      const listOptions: ListOptions = {
        fields: queryFields,
        filters: query.filters,
        orderBy: query.orderBy,
      };
      // Always send a page length on the INITIAL fetch. A request with no
      // limit_page_length is clamped to 20 rows by the bench while a fixture
      // provider returns every row, so an absent limit made development and
      // production disagree with nothing on screen to say so. `limit: 0`
      // (every row) passes through untouched.
      listOptions.limit = query.limit ?? defaultPageLength;
      if (query.limitStart != null) {
        listOptions.limitStart = query.limitStart;
      }
      if (this.options.useCursorPagination) {
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- cursor pagination starts from the first page
        listOptions.cursor = undefined;
      }
      // SAFETY: widening only — a cursor-paginating transport resolves `{ data, cursor }` instead of a bare row array.
      const response = (await this.db.getDocList<Data>(query.doctype, listOptions)) as ListResponse<Data>;

      // Handle response based on whether it includes cursor
      if (Array.isArray(response)) {
        rows = response;
      } else {
        rows = response.data;
        ({ cursor } = response);
      }
    }
    const checkpoint = maxModified(rows);
    return { rows, cursor, checkpoint };
  }

  private seedRows<Data extends FrappeDocData>(query: SubscriptionQuery, rows: FrappeDoc<Data>[]) {
    for (const row of rows) {
      if (!row.doctype) {
        row.doctype = query.doctype;
      }
      this.normalizedCache.upsert(row);
    }
  }

  /**
   * Re-adopts a subscription restored from a persisted snapshot when an
   * identical query subscribes: the cached membership renders immediately and
   * a background refresh re-seeds from the network. Progressive queries are
   * excluded — their VirtualPageManager state is not persisted, so they take
   * the fresh-subscribe path.
   */
  private adoptRestoredSubscription<Data extends FrappeDocData>(
    queryKey: string,
    query: SubscriptionQuery,
  ): SubscribeResult<Data> | undefined {
    if (query.progressive) {
      return undefined;
    }
    const restoredId = this.restoredByQueryKey.get(queryKey);
    if (restoredId === undefined) {
      return undefined;
    }
    const subscription = this.subscriptions.get(restoredId);
    this.restoredByQueryKey.delete(queryKey);
    this.restoredAt.delete(restoredId);
    if (!subscription) {
      return undefined;
    }

    // Activate under the live dedup/refcount lifecycle
    this.queryKeyToSubId.set(queryKey, restoredId);
    this.subRefCounts.set(restoredId, 1);

    const refresh = this.refreshSubscription(subscription);
    const rows = this.getDocsForSubscription<Data>(restoredId);
    return { subscriptionId: restoredId, rows, checkpoint: subscription.checkpoint, refresh };
  }

  /**
   * Registers a subscription restored from a persisted snapshot. Restored
   * subscriptions are dormant: they hold the persisted query, CDC checkpoint,
   * and membership for cache-first re-adoption, but are skipped by backfill
   * fan-out until adopted. Duplicate snapshot entries for the same query
   * (accumulated by pre-GC versions) collapse last-wins.
   */
  restoreSubscription(
    snapshotSub: Pick<Subscription, 'id' | 'query'> & Partial<Pick<Subscription, 'checkpoint' | 'cursor' | 'docIds'>>,
  ) {
    if (!snapshotSub?.id || !snapshotSub.query?.doctype) {
      return;
    }
    if (this.subscriptions.has(snapshotSub.id)) {
      return;
    }
    const queryKey = JSON.stringify(snapshotSub.query);
    // An active subscription already serves this query — the restored copy
    // would never be adopted, so drop it.
    const activeId = this.queryKeyToSubId.get(queryKey);
    if (activeId !== undefined && this.subscriptions.has(activeId)) {
      return;
    }
    // Last-wins: later snapshot entries are from more recent sessions
    const previousId = this.restoredByQueryKey.get(queryKey);
    if (previousId !== undefined) {
      this.subscriptions.delete(previousId);
      this.restoredAt.delete(previousId);
    }
    const subscription: Subscription = {
      id: snapshotSub.id,
      query: snapshotSub.query,
      checkpoint: snapshotSub.checkpoint,
      cursor: snapshotSub.cursor,
      docIds: Array.isArray(snapshotSub.docIds) ? snapshotSub.docIds : [],
      tombstones: new Map<string, number>(),
      metadata: { itemsBeforePage: 0, itemsAfterPage: 0 },
    };
    this.subscriptions.set(subscription.id, subscription);
    this.restoredByQueryKey.set(queryKey, subscription.id);
    this.restoredAt.set(subscription.id, Date.now());
  }

  /** True when the subscription came from a snapshot and is not yet adopted. */
  isRestoredSubscription(subscriptionId: string): boolean {
    return this.restoredAt.has(subscriptionId);
  }

  /**
   * Drops restored subscriptions that no query re-adopted within
   * `restoredSubscriptionTTL` (default 30 minutes). Called before every
   * persistence snapshot so expired entries also leave the snapshot.
   */
  gcRestoredSubscriptions(now = Date.now()) {
    const ttl = this.options.restoredSubscriptionTTL ?? 30 * 60 * 1000;
    for (const [subscriptionId, restoredAtMs] of this.restoredAt) {
      if (now - restoredAtMs <= ttl) {
        continue;
      }
      this.restoredAt.delete(subscriptionId);
      this.subscriptions.delete(subscriptionId);
      for (const [key, id] of this.restoredByQueryKey) {
        if (id === subscriptionId) {
          this.restoredByQueryKey.delete(key);
          break;
        }
      }
    }
  }

  /**
   * Removes a subscription by id. Cached docs remain until evicted by
   * realtime/backfill or explicit resets. This keeps other subs fast if they
   * share the same doctypes.
   *
   * With persistence enabled (`persistKey`), the released subscription is
   * detached into the restored pool instead of deleted: its query,
   * checkpoint, and membership stay in the snapshot so a remount (or a
   * cold offline reload) can re-adopt it cache-first. Detached subscriptions
   * are excluded from backfill and GC'd after `restoredSubscriptionTTL`.
   */
  unsubscribe(subscriptionId: string) {
    const refCount = (this.subRefCounts.get(subscriptionId) ?? 1) - 1;
    if (refCount > 0) {
      this.subRefCounts.set(subscriptionId, refCount);
      return;
    }
    this.refreshes.delete(subscriptionId);
    // Last consumer released — clean up
    this.subRefCounts.delete(subscriptionId);
    let queryKey: string | undefined;
    for (const [key, id] of this.queryKeyToSubId) {
      if (id === subscriptionId) {
        queryKey = key;
        this.queryKeyToSubId.delete(key);
        break;
      }
    }
    const subscription = this.subscriptions.get(subscriptionId);
    const persists = this.options.persistKey !== undefined && this.options.persistKey !== '';
    const detachable = subscription !== undefined && !subscription.query.progressive;
    if (persists && detachable && queryKey !== undefined && !this.restoredByQueryKey.has(queryKey)) {
      this.restoredByQueryKey.set(queryKey, subscriptionId);
      this.restoredAt.set(subscriptionId, Date.now());
      return;
    }
    this.subscriptions.delete(subscriptionId);
  }

  /** Returns subscription metadata by id. */
  getSubscription(id: string) {
    // Retrieve an active subscription record by its identifier
    return this.subscriptions.get(id);
  }

  /**
   * Returns current rows for a subscription from the cache.
   * Note: This is local-only; authoritative refresh happens via backfill/realtime.
   */
  getDocsForSubscription<Data extends FrappeDocData>(id: string): FrappeDoc<Data>[] {
    // Try to get from virtual page system first
    const virtualSub = this.virtualPageManager.getSubscription(id);
    if (virtualSub) {
      // Use virtual page system for progressive cache
      const docIds = virtualSub.getProgressiveCache().docIds.filter((docId: string) => docId !== '');
      return this.getCachedDocs<Data>(virtualSub.query.doctype, docIds);
    }

    // Fall back to standard subscription lookup
    const subscription = this.subscriptions.get(id);
    if (!subscription) {
      return [];
    }
    return this.getCachedDocs<Data>(subscription.query.doctype, subscription.docIds);
  }

  private getCachedDocs<Data extends FrappeDocData>(doctype: string, names: string[]): FrappeDoc<Data>[] {
    const out: FrappeDoc<Data>[] = [];
    for (const name of names) {
      // A cache miss (evicted doc) reads as undefined despite the cache's declared type.
      const document: FrappeDoc<FrappeDocData> | undefined = this.normalizedCache.get({ doctype, name });
      if (document) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: a subscription's docs are cached from reads of its query, typed `Data` by the subscriber
        out.push(document as FrappeDoc<Data>);
      }
    }
    return out;
  }

  /**
   * Get a specific page of documents using virtual pagination
   */
  async getPage<Data extends FrappeDocData>(subscriptionId: string, page: number): Promise<FrappeDoc<Data>[]> {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: the VPM caches the docs the subscriber reads as `Data`
    return await (this.virtualPageManager.getPage(subscriptionId, page) as Promise<FrappeDoc<Data>[]>);
  }

  /**
   * Get documents after a cursor (for infinite scroll)
   */
  async getNextBatch<Data extends FrappeDocData>(
    subscriptionId: string,
    cursorDocId: string,
    limit: number,
  ): Promise<FrappeDoc<Data>[]> {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: the VPM caches the docs the subscriber reads as `Data`
    return await (this.virtualPageManager.getNextBatch(subscriptionId, cursorDocId, limit) as Promise<
      FrappeDoc<Data>[]
    >);
  }

  /**
   * Get page information
   */
  getPageInfo(subscriptionId: string) {
    return this.virtualPageManager.getPageInfo(subscriptionId);
  }

  /**
   * Reconciles local state by fetching changes since stored cursors.
   *
   * Scopes
   * - all: iterate all subscriptions
   * - subscriptions: selected subscription ids
   * - doctypes: all subscriptions matching any of these doctypes
   * - docs: refetch specific documents (authority refresh)
   */
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- public signature keeps the doc type parameter
  async backfill<Data extends FrappeDocData>(args: BackfillArgs) {
    if (args.scope === BackfillScope.Docs) {
      for (const docTarget of args.docs ?? []) {
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- refetches one doc at a time
        const document = await this.db.getDoc<Data>(docTarget.doctype, docTarget.name);
        this.normalizedCache.upsert(document);
      }
      return;
    }
    for (const subscription of this.backfillTargets(args)) {
      // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- subscriptions catch up one at a time to bound the request fan-out
      await this.backfillSub(subscription, args.pageSize);
    }
  }

  /**
   * Subscriptions a non-`docs` backfill scope covers, read lazily as the backfill advances.
   * @yields {Subscription} Each subscription to backfill, in registration order.
   */
  private *backfillTargets(args: BackfillArgs): Generator<Subscription> {
    if (args.scope === BackfillScope.Subscriptions) {
      for (const subscriptionId of args.subscriptions ?? []) {
        const subscription = this.subscriptions.get(subscriptionId);
        if (subscription) {
          yield subscription;
        }
      }
      return;
    }
    if (args.scope !== BackfillScope.All && args.scope !== BackfillScope.Doctypes) {
      return;
    }
    const doctypes = args.scope === BackfillScope.Doctypes ? new Set(args.doctypes) : undefined;
    for (const subscription of this.subscriptions.values()) {
      // Restored-but-unadopted subscriptions have no consumers; catching
      // them up would spend a CDC request per trigger for nothing (their
      // adoption refresh re-seeds from the network anyway).
      if (!this.restoredAt.has(subscription.id) && (!doctypes || doctypes.has(subscription.query.doctype))) {
        yield subscription;
      }
    }
  }

  /**
   * Backfills one subscription using CDC checkpoint and updates membership.
   *
   * Algorithm
   * - Query backfill using checkpoint for CDC (Change Data Capture),
   *   draining follow-up pages while the server reports has_more (bounded)
   *   so reconnect catch-up is complete rather than one page deep
   * - Upsert each row to cache
   * - For each row: test client-side filters; add/remove membership accordingly
   * - Track tombstones for deleted documents
   * - Advance checkpoint to response checkpoint
   * - If no filters were specified, derive membership directly from returned rows
   */
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- public signature keeps the doc type parameter
  async backfillSub<Data extends FrappeDocData>(subscription: Subscription, pageSize = this.options.pageSize ?? 200) {
    const { rows, deleted } = await this.drainBackfill<Data>(subscription, pageSize);
    this.applyBackfillDeletes(subscription, deleted);
    this.applyBackfillRows(subscription, rows);
    this.updateBoundaries(subscription);

    // Maintain ordering when an orderBy is present for stable UX
    this.resortSubscriptionDocIds(subscription);

    // Cleanup expired tombstones to prevent memory leaks
    this.cleanupTombstones(subscription.id);

    // A completed drain means the membership is authoritative again
    subscription.stale = false;

    if (this.options.onBackfill) {
      this.options.onBackfill({
        doctype: subscription.query.doctype,
        fetched: rows.length,
        checkpoint: subscription.checkpoint,
      });
    }
  }

  /** Requests CDC pages since the checkpoint, draining while the server reports more (bounded). */
  private async drainBackfill<Data extends FrappeDocData>(subscription: Subscription, pageSize: number) {
    const maxPages = this.options.backfillMaxPages ?? 20;
    const rows: FrappeDoc<Data>[] = [];
    const deleted: { doctype?: string; name: string }[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      // Request changes since the last known checkpoint using CDC backfill API
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page resumes from the previous page's checkpoint
      const response = await this.db.backfill<Data>({
        doctype: subscription.query.doctype,
        fields: subscription.query.fields,
        filters: subscription.query.filters,
        // CDC checkpoint
        modifiedAfter: subscription.checkpoint,
        limit: pageSize,
      });
      if (Array.isArray(response.deleted)) {
        deleted.push(...response.deleted);
      }
      rows.push(...response.rows);
      const hasCheckpoint = response.checkpoint !== undefined && response.checkpoint !== '';
      // Advance the checkpoint to the server-provided cursor for next cycle
      if (hasCheckpoint) {
        subscription.checkpoint = response.checkpoint;
      }
      // Keep draining only while the server reports truncation AND handed us
      // a cursor to resume from (guards against servers without has_more and
      // against spinning on a fixed cursor).
      const madeProgress = response.rows.length > 0 || (response.deleted?.length ?? 0) > 0;
      if (!response.has_more || !hasCheckpoint || !madeProgress) {
        break;
      }
    }
    return { rows, deleted };
  }

  /**
   * Applies authoritative deletes first if backend returns tombstones.
   * The backfill endpoint returns {name: string} objects (no doctype),
   * so we fall back to the subscription's doctype when not provided.
   */
  private applyBackfillDeletes(subscription: Subscription, deleted: { doctype?: string; name: string }[]) {
    const { doctype } = subscription.query;
    for (const deletedRef of deleted) {
      if (!deletedRef?.name) {
        continue;
      }
      const deletedDoctype = deletedRef.doctype ?? doctype;

      // Track in tombstones map for this subscription with timestamp
      if (deletedDoctype === doctype && subscription.tombstones) {
        subscription.tombstones.set(deletedRef.name, Date.now());
      }
      // Evict from cache and any list memberships for this doctype
      this.normalizedCache.remove({
        doctype: deletedDoctype,
        name: deletedRef.name,
      });
      if (deletedDoctype === doctype) {
        subscription.docIds = subscription.docIds.filter((currentName) => currentName !== deletedRef.name);
      }
    }
  }

  /**
   * Upserts each changed/inserted row, then reconciles membership using client filters.
   * A doc deleted then recreated within the drained window is evicted by
   * applyBackfillDeletes and re-added here, matching the server's
   * delete-before-row ordering.
   */
  private applyBackfillRows(subscription: Subscription, rows: FrappeDoc<FrappeDocData>[]) {
    const members = new Set(subscription.docIds);
    for (const row of rows) {
      if (!row.doctype) {
        row.doctype = subscription.query.doctype;
      }
      this.normalizedCache.upsert(row);
      const { name } = row;
      if (!name) {
        continue;
      }
      const match = matchesFilters(row, subscription.query.filters);
      if (match && !members.has(name)) {
        subscription.docIds.push(name);
        members.add(name);
      }
      if (!match) {
        subscription.docIds = subscription.docIds.filter((currentName) => currentName !== name);
        members.delete(name);
      }
    }
    // If no filters, the rows represent the full page; maintain membership directly
    if (rows.length && !subscription.query.filters) {
      subscription.docIds = rows.map((row) => row.name);
    }
  }

  /** Updates page boundaries after backfill. */
  private updateBoundaries(subscription: Subscription) {
    if (subscription.docIds.length === 0) {
      return;
    }
    const firstDoc = this.normalizedCache.get({
      doctype: subscription.query.doctype,
      name: subscription.docIds[0],
    });
    const lastDoc = this.normalizedCache.get({
      doctype: subscription.query.doctype,
      name: subscription.docIds.at(-1) ?? '',
    });

    if (firstDoc && lastDoc) {
      subscription.boundaries = {
        firstItem: firstDoc,
        lastItem: lastDoc,
        offset: subscription.boundaries?.offset ?? 0,
        pageSize: subscription.boundaries?.pageSize ?? subscription.query.limit ?? 20,
      };
    }
  }

  resortSubscriptionDocIds(subscription: Subscription) {
    const { orderBy, doctype } = subscription.query;
    if (!orderBy) {
      return;
    }
    const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
    subscription.docIds.sort((firstId, secondId) => {
      const firstDoc = this.normalizedCache.get({ doctype, name: firstId });
      const secondDoc = this.normalizedCache.get({ doctype, name: secondId });
      return compareByOrder(firstDoc, secondDoc, orderByArray) || compareNames(firstId, secondId);
    });
  }

  updateSubscriptionMembership<Data extends FrappeDocData>(doc: FrappeDoc<Data>): Subscription[] {
    const subscriptionsNeedingRehydration: Subscription[] = [];
    for (const subscription of this.subscriptions.values()) {
      // Dormant restored subscriptions have no renderers and are re-seeded on
      // adoption — skip them so realtime hints don't trigger rehydration
      // fetches (or VPM updates) on their behalf.
      if (this.restoredAt.has(subscription.id) || subscription.query.doctype !== doc.doctype) {
        continue;
      }
      const match = matchesFilters(doc, subscription.query.filters);
      const isExisting = subscription.docIds.includes(doc.name);
      if (match && !isExisting) {
        subscriptionsNeedingRehydration.push(subscription);
        // Also update VPM progressive cache for remote creates
        void this.virtualPageManager.handleRemoteCreate(subscription.id, doc);
      } else if (isExisting) {
        if (match) {
          void this.virtualPageManager.handleRemoteUpdate(subscription.id, doc);
        } else {
          subscription.docIds = subscription.docIds.filter((docId) => docId !== doc.name);
          void this.virtualPageManager.handleRemoteDelete(subscription.id, doc.name);
        }
        this.resortSubscriptionDocIds(subscription);
      }
    }
    return subscriptionsNeedingRehydration;
  }

  /**
   * Removes a document from all subscription memberships.
   * Returns subscriptions that had the document removed (for potential backfill).
   */
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- public signature keeps the doc type parameter
  removeFromAllSubscriptions<_Data extends FrappeDocData>(doctype: string, name: string): Subscription[] {
    const affectedSubscriptions: Subscription[] = [];

    for (const subscription of this.subscriptions.values()) {
      if (subscription.query.doctype !== doctype) {
        continue;
      }

      const hadDocument = subscription.docIds.includes(name);
      if (hadDocument) {
        subscription.docIds = subscription.docIds.filter((docId) => docId !== name);
        void this.virtualPageManager.handleRemoteDelete(subscription.id, name);
        affectedSubscriptions.push(subscription);
      }
    }

    return affectedSubscriptions;
  }

  /** Gets all active subscriptions. */
  getAllSubscriptions(): Map<string, Subscription> {
    return this.subscriptions;
  }

  getVirtualPageManager(): VirtualPageManager {
    return this.virtualPageManager;
  }

  insertDocumentIntoSubscription<Data extends FrappeDocData>(subscription: Subscription, doc: FrappeDoc<Data>) {
    if (subscription.docIds.includes(doc.name)) {
      return;
    }
    const { orderBy } = subscription.query;
    if (!orderBy || subscription.docIds.length === 0) {
      subscription.docIds.push(doc.name);
      return;
    }
    const insertIndex = this.findInsertionIndex(subscription, doc, orderBy);
    subscription.docIds.splice(insertIndex, 0, doc.name);
  }

  private findInsertionIndex<Data extends FrappeDocData>(
    subscription: Subscription,
    doc: FrappeDoc<Data>,
    orderBy: OrderBy,
  ): number {
    const { docIds, query } = subscription;
    const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
    let left = 0;
    let right = docIds.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midDoc = this.normalizedCache.get({
        doctype: query.doctype,
        name: docIds[mid],
      });
      if (!midDoc) {
        return docIds.length;
      }
      const comparison = compareByOrder(doc, midDoc, orderByArray) || compareNames(doc.name || '', midDoc.name || '');
      if (comparison <= 0) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return left;
  }

  clear() {
    this.refreshes.clear();
    this.subscriptions.clear();
    this.queryKeyToSubId.clear();
    this.subRefCounts.clear();
    this.restoredByQueryKey.clear();
    this.restoredAt.clear();
  }

  /**
   * Cleans up expired tombstones based on age and count limits.
   * Should be called periodically or after backfill operations.
   */
  cleanupTombstones(subscriptionId?: string) {
    // Default 30 minutes
    const maxAge = this.options.tombstoneMaxAge ?? 30 * 60 * 1000;
    // Default 1000 per subscription
    const maxCount = this.options.tombstoneMaxCount ?? 1000;
    const now = Date.now();

    const subscriptionsToClean =
      subscriptionId !== undefined && subscriptionId !== ''
        ? [this.subscriptions.get(subscriptionId)].filter(Boolean)
        : [...this.subscriptions.values()];

    for (const subscription of subscriptionsToClean) {
      if (!subscription?.tombstones || subscription.tombstones.size === 0) {
        continue;
      }

      // First pass: remove expired tombstones by age
      for (const [name, timestamp] of subscription.tombstones) {
        if (now - timestamp > maxAge) {
          subscription.tombstones.delete(name);
        }
      }

      // Second pass: if still over max count, remove oldest tombstones
      if (subscription.tombstones.size > maxCount) {
        const entries = [...subscription.tombstones.entries()];
        // Sort by timestamp ascending (oldest first)
        entries.sort((a, b) => a[1] - b[1]);
        // Remove oldest entries to get under limit
        const toRemove = entries.slice(0, subscription.tombstones.size - maxCount);
        for (const [name] of toRemove) {
          subscription.tombstones.delete(name);
        }
      }
    }
  }
}

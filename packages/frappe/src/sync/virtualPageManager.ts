import type { FrappeDoc, FrappeDocBase, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';

import type { NormalizedCache } from './normalizedCache';

/**
 * Calculate checkpoint from documents (find max modified timestamp)
 * Uses Date parsing for proper comparison instead of string comparison.
 */
function calculateCheckpointFromDocs(docs: FrappeDocBase[]): string | undefined {
  if (docs.length === 0) {
    return undefined;
  }

  let maxTimestamp = '';
  let maxDate: Date | null = null;

  for (const doc of docs) {
    const { modified } = doc;
    if (!modified) {
      continue;
    }

    try {
      const date = new Date(modified);
      // Validate the date is valid
      if (Number.isNaN(date.getTime())) {
        continue;
      }

      if (!maxDate || date > maxDate) {
        maxDate = date;
        maxTimestamp = modified;
      }
    } catch {
      // If Date parsing fails, fall back to string comparison
      if (!maxTimestamp || modified > maxTimestamp) {
        maxTimestamp = modified;
      }
    }
  }

  return maxTimestamp || undefined;
}
import type {
  OrderByField,
  PageBoundaries,
  PageIsland,
  PendingRehydrationType,
  Subscription,
  SubscriptionQuery,
} from './types';
import { Order } from './types';

export enum PlacementStrategy {
  AfterRange = 'after-range',
  BeforeRange = 'before-range',
  Uncertain = 'uncertain',
  WithinRange = 'within-range',
}

export interface VirtualPageInfo {
  currentPage: number;
  knownPages: number;
  totalPages: number | 'unknown';
  hasMore: boolean;
  itemsInCache: number;
  pageSize: number;
}

export interface PlacementResult {
  strategy: PlacementStrategy;
  position?: number;
}

export interface ProgressiveCache {
  checkpoint?: string;
  docIds: string[];
  hasMore: boolean;
  islands?: PageIsland[];
  lastFetchedAt?: Date;
  nextCursor: string | undefined;
  totalCount: number | undefined;
}

export class VirtualSubscription implements Subscription {
  public progressiveCache: ProgressiveCache;
  needsRehydration?: boolean;
  pendingBackfill?: boolean;
  viewWindow: {
    currentPage: number;
    pageSize: number;
  };

  // Subscription interface properties
  id: string;
  query: SubscriptionQuery;
  checkpoint?: string;
  cursor?: string;
  docIds: string[];
  boundaries?: PageBoundaries<FrappeDocData>;
  lockExpiry?: number;
  pendingRehydration?: PendingRehydrationType;
  metadata?: {
    itemsBeforePage?: number;
    itemsAfterPage?: number;
  };
  tombstones?: Map<string, number>;

  constructor(
    subscription: Subscription,
    progressiveCache: ProgressiveCache,
    viewWindow: { currentPage: number; pageSize: number },
  ) {
    // Copy all subscription properties
    this.id = subscription.id;
    this.query = subscription.query;
    this.checkpoint = subscription.checkpoint;
    this.cursor = subscription.cursor;
    this.docIds = subscription.docIds;
    this.boundaries = subscription.boundaries;
    this.lockExpiry = subscription.lockExpiry;
    this.pendingRehydration = subscription.pendingRehydration;
    this.metadata = subscription.metadata;
    this.tombstones = subscription.tombstones;

    this.progressiveCache = progressiveCache;
    this.viewWindow = viewWindow;
  }

  /**
   * Update progressive cache with new data
   */
  updateProgressiveCache(options: {
    docIds?: string[];
    nextCursor?: string;
    hasMore?: boolean;
    lastFetchedAt?: Date;
    totalCount?: number;
  }): void {
    if (options.docIds) {
      this.progressiveCache.docIds = options.docIds;
    }
    if (options.nextCursor !== undefined) {
      this.progressiveCache.nextCursor = options.nextCursor;
    }
    if (options.hasMore !== undefined) {
      this.progressiveCache.hasMore = options.hasMore;
    }
    if (options.lastFetchedAt) {
      this.progressiveCache.lastFetchedAt = options.lastFetchedAt;
    }
    if (typeof options.totalCount === 'number') {
      this.progressiveCache.totalCount = options.totalCount;
    }
  }

  /**
   * Get the progressive cache (read-only access)
   */
  getProgressiveCache(): ProgressiveCache {
    return { ...this.progressiveCache }; // Return copy to prevent external mutation
  }

  /**
   * Process documents and update caches
   */
  processDocuments(
    docs: FrappeDoc<FrappeDocData>[],
    normalizedCache: NormalizedCache,
    options: {
      calculateCheckpoint?: boolean;
      updateNormalizedCache?: boolean;
    } = {},
  ): void {
    const { calculateCheckpoint = true, updateNormalizedCache = true } = options;

    // Update progressive cache
    this.updateProgressiveCache({
      docIds: docs.map((doc) => doc.name),
      nextCursor: docs.length > 0 ? docs.at(-1).name : undefined,
      lastFetchedAt: new Date(),
    });

    // Update normalized cache
    if (updateNormalizedCache) {
      for (const doc of docs) {
        normalizedCache.upsert(doc);
      }
    }

    // Calculate checkpoint
    if (calculateCheckpoint) {
      this.checkpoint = calculateCheckpointFromDocs(docs);
    }
  }

  /**
   * Remove documents from progressive cache
   */
  removeDocuments(docIds: string[], normalizedCache: NormalizedCache): void {
    for (const docId of docIds) {
      // Remove from progressive cache
      const index = this.progressiveCache.docIds.indexOf(docId);
      if (index !== -1) {
        this.progressiveCache.docIds.splice(index, 1);
      }
    }

    // Remove from normalized cache
    for (const docId of docIds) {
      normalizedCache.remove({ doctype: this.query.doctype, name: docId });
    }
  }
}

export class VirtualPageManager<Data extends FrappeDocData = FrappeDocData> {
  private readonly subscriptions = new Map<string, VirtualSubscription>();
  private readonly pageCache = new Map<string, FrappeDoc<Data>[]>();
  private cacheGeneration = 0;
  private readonly batchSize: number;
  private readonly islands = new Map<string, PageIsland[]>();
  private readonly normalizedCache: NormalizedCache;
  private readonly db: DbModule;

  constructor(normalizedCache: NormalizedCache, db: DbModule, options: { batchSize?: number } = {}) {
    this.normalizedCache = normalizedCache;
    this.db = db;
    this.batchSize = options.batchSize ?? 100;
  }

  /**
   * Helper to get the primary sort field from OrderBy
   */
  private getOrderByField(subscription: VirtualSubscription): OrderByField | undefined {
    const { orderBy } = subscription.query;
    if (!orderBy) {
      return undefined;
    }
    return Array.isArray(orderBy) ? orderBy[0] : orderBy;
  }

  /**
   * Registers a subscription with pre-fetched data, avoiding a duplicate
   * initial fetch. Used by SubscriptionManager when `progressive: true`.
   */
  registerSubscription(
    subscriptionId: string,
    subscription: Subscription,
    initialDocIds: string[],
    cursor?: string,
    hasMore?: boolean,
  ): VirtualSubscription {
    const pageSize = subscription.query.limit ?? 20;
    const virtualSub = new VirtualSubscription(
      subscription,
      {
        docIds: [...initialDocIds],
        nextCursor: cursor ?? (initialDocIds.length > 0 ? initialDocIds.at(-1) : undefined),
        hasMore: hasMore ?? initialDocIds.length >= pageSize,
        totalCount: undefined,
        lastFetchedAt: new Date(),
      },
      { currentPage: 1, pageSize },
    );
    this.subscriptions.set(subscriptionId, virtualSub);
    if (initialDocIds.length > 0) {
      this.recordIsland(subscriptionId, {
        startPage: 1,
        endPage: Math.ceil(initialDocIds.length / pageSize) || 1,
        startIndex: 0,
        endIndex: initialDocIds.length,
        fetchedVia: 'cursor',
      });
    }
    return virtualSub;
  }

  async initializeSubscription(subscriptionId: string, query: SubscriptionQuery): Promise<VirtualSubscription> {
    const subscription = new VirtualSubscription(
      {
        id: subscriptionId,
        query,
        docIds: [],
      },
      {
        docIds: [],
        nextCursor: undefined,
        hasMore: true,
        totalCount: undefined,
      },
      {
        currentPage: 1,
        pageSize: query.limit ?? 20,
      },
    );
    this.subscriptions.set(subscriptionId, subscription);
    await this.fetchInitialBatch(subscription);
    return subscription;
  }

  async getPage(subscriptionId: string, page: number): Promise<FrappeDoc<Data>[]> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return [];
    }
    const { pageSize } = subscription.viewWindow;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const cache = subscription.getProgressiveCache();

    if (cache.docIds.length >= start) {
      // Contiguous: extend cache forward via cursor
      await this.ensureCached(subscription, end);
    } else {
      // Non-contiguous: jump via offset
      await this.fetchPageByOffset(subscription, page);
    }

    subscription.viewWindow.currentPage = page;
    const pageDocIds = subscription.getProgressiveCache().docIds.slice(start, end);
    return this.mapIdsToDocuments(subscription.query.doctype, pageDocIds);
  }

  async getNextBatch(subscriptionId: string, cursorDocId: string, limit: number): Promise<FrappeDoc<Data>[]> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return [];
    }
    let index = subscription.getProgressiveCache().docIds.indexOf(cursorDocId);
    if (index === -1) {
      await this.fetchFromCursor(subscription, cursorDocId);
      index = subscription.getProgressiveCache().docIds.indexOf(cursorDocId);
      if (index === -1) {
        return [];
      }
    }
    const start = index + 1;
    const end = start + limit;
    await this.ensureCached(subscription, end);
    const docIds = subscription.getProgressiveCache().docIds.slice(start, end);
    return this.mapIdsToDocuments(subscription.query.doctype, docIds);
  }

  /**
   * Get page information for UI
   */
  getPageInfo(subscriptionId: string): VirtualPageInfo {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      return {
        currentPage: 1,
        knownPages: 0,
        totalPages: 'unknown',
        hasMore: false,
        itemsInCache: 0,
        pageSize: 20,
      };
    }

    const knownPages = Math.ceil(subscription.getProgressiveCache().docIds.length / subscription.viewWindow.pageSize);

    return {
      currentPage: subscription.viewWindow.currentPage,
      knownPages,
      totalPages:
        subscription.getProgressiveCache().totalCount === undefined
          ? 'unknown'
          : Math.ceil(subscription.getProgressiveCache().totalCount! / subscription.viewWindow.pageSize),
      hasMore: subscription.getProgressiveCache().hasMore,
      itemsInCache: subscription.getProgressiveCache().docIds.length,
      pageSize: subscription.viewWindow.pageSize,
    };
  }

  /**
   * Get total page count (expensive - may require server call)
   */
  async getTotalPages(subscriptionId: string): Promise<number | 'unknown'> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return 'unknown';
    }

    // Lazy fetch count only when needed
    if (subscription.getProgressiveCache().totalCount === undefined) {
      if (subscription.getProgressiveCache().hasMore) {
        // Need to fetch from server
        try {
          const count = await this.db.getCount(subscription.query.doctype, subscription.query.filters);
          subscription.updateProgressiveCache({
            totalCount: count,
          });
        } catch {
          return 'unknown';
        }
      } else {
        // We have all documents
        subscription.updateProgressiveCache({
          totalCount: subscription.getProgressiveCache().docIds.length,
        });
      }
    }

    return Math.ceil(subscription.getProgressiveCache().totalCount! / subscription.viewWindow.pageSize);
  }

  /**
   * Handle optimistic document placement
   */
  determineOptimisticPlacement(subscription: VirtualSubscription, newDoc: FrappeDoc<Data>): PlacementResult {
    const orderByField = this.getOrderByField(subscription);
    const sortField = orderByField?.field;
    if (!sortField || !(sortField in newDoc)) {
      return { strategy: PlacementStrategy.Uncertain };
    }

    const newValue = newDoc[sortField as keyof typeof newDoc];
    const { docIds } = subscription.getProgressiveCache();

    if (docIds.length === 0) {
      return { strategy: PlacementStrategy.WithinRange, position: 0 };
    }

    const firstDoc = this.normalizedCache.get({
      doctype: subscription.query.doctype,
      name: docIds[0],
    });
    const lastDoc = this.normalizedCache.get({
      doctype: subscription.query.doctype,
      name: docIds.at(-1),
    });

    if (!firstDoc || !lastDoc) {
      return { strategy: PlacementStrategy.Uncertain };
    }

    const firstValue = firstDoc[sortField];
    const lastValue = lastDoc[sortField];
    const isAscending = orderByField?.order === Order.Asc;

    // Compare values
    if (isAscending) {
      if (newValue != null && firstValue != null && newValue < firstValue) {
        return { strategy: PlacementStrategy.BeforeRange };
      }
      if (newValue != null && lastValue != null && newValue > lastValue) {
        return { strategy: PlacementStrategy.AfterRange };
      }
    } else {
      // DESC order
      if (newValue != null && firstValue != null && newValue > firstValue) {
        return { strategy: PlacementStrategy.BeforeRange };
      }
      if (newValue != null && lastValue != null && newValue < lastValue) {
        return { strategy: PlacementStrategy.AfterRange };
      }
    }

    // Within range - binary search for position
    const position = this.binarySearchPosition(subscription, newDoc, sortField);
    return { strategy: PlacementStrategy.WithinRange, position };
  }

  /**
   * Update subscription after remote create
   */
  async handleRemoteCreate(subscriptionId: string, newDoc: FrappeDoc<Data>): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    const placement = this.determineOptimisticPlacement(subscription, newDoc);

    switch (placement.strategy) {
      case PlacementStrategy.WithinRange: {
        // We can place it accurately
        if (placement.position !== undefined) {
          const currentDocIds = subscription.getProgressiveCache().docIds;
          const newDocIds = [...currentDocIds];
          newDocIds.splice(placement.position, 0, newDoc.name);
          subscription.updateProgressiveCache({ docIds: newDocIds });

          return true;
        }
        break;
      }

      case PlacementStrategy.BeforeRange: {
        // Goes at the beginning
        const currentDocIds = subscription.getProgressiveCache().docIds;
        const newDocIds = [newDoc.name, ...currentDocIds];
        // Maintain cache size limit if needed
        if (this.shouldLimitCacheSize(subscription)) {
          newDocIds.pop();
        }
        subscription.updateProgressiveCache({ docIds: newDocIds });
        return true;
      }

      case PlacementStrategy.AfterRange: {
        // Might be in next page
        if (this.isViewingLastPage(subscription)) {
          // Fetch next page to see if it appears
          await this.fetchMorePages(subscription, 1);
        }
        return false;
      }

      case PlacementStrategy.Uncertain: {
        // Can't determine - needs rehydration
        subscription.needsRehydration = true;
        return false;
      }
    }

    return false;
  }

  /**
   * Update subscription after remote delete
   */
  async handleRemoteDelete(subscriptionId: string, docName: string): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    const currentDocIds = subscription.getProgressiveCache().docIds;
    const index = currentDocIds.indexOf(docName);
    if (index === -1) {
      return false;
    }

    // Remove from progressive cache
    const newDocIds = [...currentDocIds];
    newDocIds.splice(index, 1);
    subscription.updateProgressiveCache({ docIds: newDocIds });

    // Mark for backfill to maintain page sizes
    subscription.pendingBackfill = true;

    return true;
  }

  /**
   * Update subscription after remote update
   */
  async handleRemoteUpdate(subscriptionId: string, updatedDoc: FrappeDoc<Data>): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    const currentIndex = subscription.getProgressiveCache().docIds.indexOf(updatedDoc.name);

    // Check if sort order affected
    const orderByField = this.getOrderByField(subscription);
    const sortField = orderByField?.field;
    if (!sortField || !(sortField in updatedDoc)) {
      // No sort or sort field not present - just update cache
      return currentIndex !== -1;
    }

    if (currentIndex === -1) {
      // Not in our cache, but might need to be added
      const placement = this.determineOptimisticPlacement(subscription, updatedDoc);
      if (placement.strategy === PlacementStrategy.WithinRange && placement.position !== undefined) {
        const currentDocIds = subscription.getProgressiveCache().docIds;
        const newDocIds = [...currentDocIds];
        newDocIds.splice(placement.position, 0, updatedDoc.name);
        subscription.updateProgressiveCache({ docIds: newDocIds });

        return true;
      }
      return false;
    }

    // Document is in cache - check if position changed
    const oldDoc = this.normalizedCache.get({
      doctype: subscription.query.doctype,
      name: updatedDoc.name,
    });

    if (oldDoc && oldDoc[sortField] !== updatedDoc[sortField as keyof typeof updatedDoc]) {
      // Sort value changed - reposition
      const currentDocIds = subscription.getProgressiveCache().docIds;
      const newDocIds = [...currentDocIds];
      newDocIds.splice(currentIndex, 1);

      const placement = this.determineOptimisticPlacement(subscription, updatedDoc);
      if (placement.strategy === PlacementStrategy.WithinRange && placement.position !== undefined) {
        newDocIds.splice(placement.position, 0, updatedDoc.name);
        subscription.updateProgressiveCache({ docIds: newDocIds });
      } else {
        // Moved out of range
        subscription.updateProgressiveCache({ docIds: newDocIds });
        subscription.pendingBackfill = true;
      }
    }

    return true;
  }

  /**
   * Invalidate page cache (call after any change)
   */
  invalidateCache() {
    this.cacheGeneration++;
    this.pageCache.clear();
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): VirtualSubscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  getPageIslands(subscriptionId: string): PageIsland[] {
    return this.islands.get(subscriptionId) ?? [];
  }

  /**
   * Check if a specific index is within a cached island
   */
  isIndexCached(subscriptionId: string, index: number): boolean {
    const islands = this.islands.get(subscriptionId) ?? [];
    return islands.some((island) => index >= island.startIndex && index < island.endIndex);
  }

  /**
   * Find all gaps between cached islands
   */
  findGaps(subscriptionId: string): { startIndex: number; endIndex: number; startPage: number; endPage: number }[] {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return [];
    }

    const islands = this.islands.get(subscriptionId) ?? [];
    if (islands.length === 0) {
      return [];
    }

    const gaps: {
      startIndex: number;
      endIndex: number;
      startPage: number;
      endPage: number;
    }[] = [];
    const { pageSize } = subscription.viewWindow;

    // Sort islands by startIndex
    const sorted = [...islands].sort((a, b) => a.startIndex - b.startIndex);

    // Check gap before first island
    if (sorted[0].startIndex > 0) {
      gaps.push({
        startIndex: 0,
        endIndex: sorted[0].startIndex,
        startPage: 1,
        endPage: Math.ceil(sorted[0].startIndex / pageSize),
      });
    }

    // Check gaps between islands
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = sorted[i].endIndex;
      const nextStart = sorted[i + 1].startIndex;

      if (nextStart > currentEnd) {
        gaps.push({
          startIndex: currentEnd,
          endIndex: nextStart,
          startPage: Math.floor(currentEnd / pageSize) + 1,
          endPage: Math.ceil(nextStart / pageSize),
        });
      }
    }

    return gaps;
  }

  /**
   * Get the gap that contains a specific index, if any
   */
  getGapForIndex(
    subscriptionId: string,
    index: number,
  ): { startIndex: number; endIndex: number; startPage: number; endPage: number } | null {
    const gaps = this.findGaps(subscriptionId);
    return gaps.find((gap) => index >= gap.startIndex && index < gap.endIndex) ?? null;
  }

  /**
   * Clear all islands for a subscription (used during full refresh)
   */
  clearIslands(subscriptionId: string): void {
    this.islands.delete(subscriptionId);
  }

  /**
   * Get coverage statistics for a subscription
   */
  getIslandCoverage(subscriptionId: string): {
    totalCached: number;
    islandCount: number;
    gaps: number;
    largestGap: number;
  } {
    const subscription = this.subscriptions.get(subscriptionId);
    const islands = this.islands.get(subscriptionId) ?? [];

    if (!subscription || islands.length === 0) {
      return { totalCached: 0, islandCount: 0, gaps: 0, largestGap: 0 };
    }

    const gaps = this.findGaps(subscriptionId);
    const totalCached = islands.reduce((sum, island) => sum + (island.endIndex - island.startIndex), 0);
    const largestGap = gaps.length > 0 ? Math.max(...gaps.map((g) => g.endIndex - g.startIndex)) : 0;

    return {
      totalCached,
      islandCount: islands.length,
      gaps: gaps.length,
      largestGap,
    };
  }

  /**
   * Update subscription's progressive cache
   */
  updateProgressiveCache(subscriptionId: string, docIds: string[], nextCursor?: string | null, hasMore?: boolean) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    const updates: any = {};
    if (docIds !== undefined) {
      updates.docIds = docIds;
    }
    if (nextCursor !== undefined) {
      updates.nextCursor = nextCursor ?? undefined;
    }
    if (hasMore !== undefined) {
      updates.hasMore = hasMore;
    }

    if (Object.keys(updates).length > 0) {
      subscription.updateProgressiveCache(updates);
    }

    this.invalidateCache();
  }

  // Private helper methods

  private async fetchInitialBatch(subscription: VirtualSubscription) {
    // Fetch initial batch with configured batch size
    let fetchedDocs: FrappeDoc<FrappeDocData>[] = [];
    let hasMore = true;
    let currentCursor: string | undefined;

    // Keep fetching until we have at least pageSize docs or no more data
    const targetSize = subscription.viewWindow.pageSize;

    while (fetchedDocs.length < targetSize && hasMore) {
      const res = await this.db.getDocList(subscription.query.doctype, {
        fields: subscription.query.fields,
        filters: subscription.query.filters,
        orderBy: subscription.query.orderBy,
        cursor: currentCursor,
        limit: this.batchSize,
      });

      if (res.length === 0) {
        hasMore = false;
        break;
      }

      fetchedDocs = [...fetchedDocs, ...res];
      // Update cursor for next batch
      currentCursor = res.length > 0 ? res.at(-1).name : undefined;
      hasMore = res.length === this.batchSize;
    }

    // Update caches using subscription methods
    subscription.processDocuments(fetchedDocs, this.normalizedCache);
    // Override hasMore since this is initial fetch
    subscription.updateProgressiveCache({ hasMore });

    const pagesLoaded = Math.ceil(fetchedDocs.length / subscription.viewWindow.pageSize) || 1;
    this.recordIsland(subscription.id, {
      startPage: 1,
      endPage: pagesLoaded,
      startIndex: 0,
      endIndex: fetchedDocs.length,
      fetchedVia: 'cursor',
    });
  }

  private async fetchMorePages(subscription: VirtualSubscription, pageCount: number) {
    const cache = subscription.getProgressiveCache();
    if (!cache.hasMore) {
      return;
    }

    const targetDocCount = subscription.viewWindow.pageSize * pageCount;
    const currentCount = cache.docIds.length;
    const neededCount = targetDocCount - currentCount;

    if (neededCount <= 0) {
      return;
    }

    let fetchedDocs: FrappeDoc<FrappeDocData>[] = [];
    let hasMore: boolean = cache.hasMore;
    let currentCursor = cache.nextCursor;

    // Keep fetching in batches until we have enough docs or no more data
    while (fetchedDocs.length < neededCount && hasMore) {
      const remainingNeeded = neededCount - fetchedDocs.length;
      const fetchSize = Math.min(this.batchSize, remainingNeeded);

      const response = await this.db.getDocList(subscription.query.doctype, {
        fields: subscription.query.fields,
        filters: subscription.query.filters,
        orderBy: subscription.query.orderBy,
        cursor: currentCursor ?? undefined,
        limit: fetchSize,
      });

      if (response.length === 0) {
        hasMore = false;
        break;
      }

      fetchedDocs = [...fetchedDocs, ...response];
      // Update cursor for next batch (server should provide proper cursor)
      currentCursor = response.length > 0 ? response.at(-1).name : undefined;
      hasMore = response.length === fetchSize && fetchedDocs.length < neededCount;
    }

    // Append to progressive cache. docIds is a list of document NAMES and a
    // name can only appear once, so filter out any already present: two
    // loadMore() calls that race past the isLoadingMore guard (the sentinel
    // path fires twice before the state settles) both fetch from the same
    // cursor, and a blind append put the same page in twice — which React
    // reports as a duplicate-key error per row (MPO-197).
    const currentDocIds = subscription.getProgressiveCache().docIds;
    const seen = new Set(currentDocIds);
    const newDocIds = fetchedDocs.map((doc) => doc.name).filter((name) => !seen.has(name));
    const updatedDocIds = [...currentDocIds, ...newDocIds];
    subscription.updateProgressiveCache({
      docIds: updatedDocIds,
      nextCursor: fetchedDocs.length > 0 ? fetchedDocs.at(-1).name : undefined,
      hasMore,
      lastFetchedAt: new Date(),
    });

    // Update normalized cache
    for (const doc of fetchedDocs) {
      this.normalizedCache.upsert(doc);
    }

    const startIndex = currentCount;
    const endIndex = startIndex + fetchedDocs.length;
    const { pageSize } = subscription.viewWindow;
    const startPage = Math.floor(startIndex / pageSize) + 1;
    const endPage = Math.ceil(endIndex / pageSize);
    this.recordIsland(subscription.id, {
      startPage,
      endPage,
      startIndex,
      endIndex,
      fetchedVia: 'cursor',
    });
  }

  private async fetchPageByOffset(subscription: VirtualSubscription, page: number): Promise<void> {
    const { pageSize } = subscription.viewWindow;
    const limitStart = (page - 1) * pageSize;

    const response = await this.db.getDocList(subscription.query.doctype, {
      fields: subscription.query.fields,
      filters: subscription.query.filters,
      orderBy: subscription.query.orderBy,
      limitStart,
      limit: pageSize,
    });

    for (const doc of response) {
      if (!doc.doctype) {
        doc.doctype = subscription.query.doctype;
      }
      this.normalizedCache.upsert(doc);
    }

    const currentDocIds = [...subscription.getProgressiveCache().docIds];
    // Extend array to accommodate target page, filling gaps with empty strings
    while (currentDocIds.length < limitStart) {
      currentDocIds.push('');
    }
    // Overwrite the target range
    for (let i = 0; i < response.length; i++) {
      currentDocIds[limitStart + i] = response[i].name;
    }

    subscription.updateProgressiveCache({
      docIds: currentDocIds,
      nextCursor: response.length > 0 ? response.at(-1).name : undefined,
      hasMore: response.length === pageSize,
      lastFetchedAt: new Date(),
    });

    this.recordIsland(subscription.id, {
      startPage: page,
      endPage: page,
      startIndex: limitStart,
      endIndex: limitStart + response.length,
      fetchedVia: 'offset',
    });
  }

  private async fetchFromCursor(subscription: VirtualSubscription, cursorDocId: string) {
    const response = await this.db.getDocList(subscription.query.doctype, {
      fields: subscription.query.fields,
      filters: subscription.query.filters,
      orderBy: subscription.query.orderBy,
      cursor: cursorDocId,
      limit: this.batchSize,
    });

    if (response.length === 0) {
      return;
    }

    const existingIds = new Set(subscription.getProgressiveCache().docIds);
    const newDocs = response.filter((doc) => !existingIds.has(doc.name));

    for (const doc of newDocs) {
      if (!doc.doctype) {
        doc.doctype = subscription.query.doctype;
      }
      this.normalizedCache.upsert(doc);
    }

    const newDocIds = newDocs.map((doc) => doc.name);
    const updatedDocIds = [...subscription.getProgressiveCache().docIds, ...newDocIds];
    subscription.updateProgressiveCache({
      docIds: updatedDocIds,
      nextCursor: response.length > 0 ? response.at(-1).name : undefined,
      hasMore: response.length === this.batchSize,
      lastFetchedAt: new Date(),
    });
  }

  private async ensureCached(subscription: VirtualSubscription, requiredIndex: number) {
    const cache = subscription.getProgressiveCache();
    if (cache.docIds.length >= requiredIndex || !cache.hasMore) {
      return;
    }

    const { pageSize } = subscription.viewWindow;
    const pagesNeeded = Math.ceil(requiredIndex / pageSize);
    await this.fetchMorePages(subscription, pagesNeeded);
  }

  private recordIsland(subscriptionId: string, island: PageIsland): void {
    const existing = this.islands.get(subscriptionId) ?? [];

    // Add the new island to the list
    existing.push(island);

    // Sort by startIndex for proper merging
    existing.sort((a, b) => a.startIndex - b.startIndex);

    // Merge overlapping or adjacent islands
    const merged: PageIsland[] = [];
    for (const current of existing) {
      if (merged.length === 0) {
        merged.push({ ...current });
        continue;
      }

      const last = merged.at(-1);

      // Check if current overlaps or is adjacent to last
      // Islands are adjacent if endIndex touches startIndex (within 1 index)
      // or if their page ranges overlap
      const indexOverlap = current.startIndex <= last.endIndex + 1;
      const pageOverlap = current.startPage <= last.endPage + 1;

      if (indexOverlap || pageOverlap) {
        // Merge into last island
        last.endIndex = Math.max(last.endIndex, current.endIndex);
        last.startIndex = Math.min(last.startIndex, current.startIndex);
        last.endPage = Math.max(last.endPage, current.endPage);
        last.startPage = Math.min(last.startPage, current.startPage);
        // Prefer cursor fetch method when merging different types
        if (current.fetchedVia === 'cursor' && last.fetchedVia === 'offset') {
          last.fetchedVia = 'cursor';
        }
      } else {
        // No overlap - start new island
        merged.push({ ...current });
      }
    }

    this.islands.set(subscriptionId, merged);
  }

  private mapIdsToDocuments(doctype: string, docIds: string[]): FrappeDoc<Data>[] {
    return docIds
      .filter((id) => id !== '')
      .map((id) => this.normalizedCache.get({ doctype, name: id }))
      .filter(Boolean) as FrappeDoc<Data>[];
  }

  private binarySearchPosition(subscription: VirtualSubscription, newDoc: FrappeDoc<Data>, sortField: string): number {
    const { docIds } = subscription.getProgressiveCache();
    const orderByField = this.getOrderByField(subscription);
    const isAscending = orderByField?.order === Order.Asc;
    let left = 0;
    let right = docIds.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midDoc = this.normalizedCache.get({
        doctype: subscription.query.doctype,
        name: docIds[mid],
      });

      if (!midDoc) {
        // Skip missing docs
        left = mid + 1;
        continue;
      }

      const midValue = midDoc[sortField];
      const newValue = newDoc[sortField as keyof typeof newDoc];

      const comparison = this.compareValues(midValue, newValue, isAscending);

      if (comparison < 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return left;
  }

  private compareValues(a: any, b: any, ascending: boolean): number {
    if (a === b) {
      return 0;
    }
    if (a == null) {
      return ascending ? -1 : 1;
    }
    if (b == null) {
      return ascending ? 1 : -1;
    }

    const result = a < b ? -1 : 1;
    return ascending ? result : -result;
  }

  private shouldLimitCacheSize(subscription: VirtualSubscription): boolean {
    // Limit cache to 1000 items or 50 pages, whichever is larger
    const maxItems = Math.max(1000, subscription.viewWindow.pageSize * 50);
    return subscription.getProgressiveCache().docIds.length > maxItems;
  }

  private isViewingLastPage(subscription: VirtualSubscription): boolean {
    const totalCached = subscription.getProgressiveCache().docIds.length;
    const { pageSize } = subscription.viewWindow;
    const lastPage = Math.ceil(totalCached / pageSize);
    return subscription.viewWindow.currentPage >= lastPage;
  }
}

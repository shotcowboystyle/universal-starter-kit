import type { FrappeDoc, FrappeDocBase, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';

import { matchesFilters } from './filters';

/**
 * Calculate checkpoint from documents (find max modified timestamp)
 * Uses proper Date parsing for accurate comparison across different timestamp formats
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
      if (Number.isNaN(date.getTime())) {
        continue;
      }

      if (!maxDate || date > maxDate) {
        maxDate = date;
        maxTimestamp = modified;
      }
    } catch {
      // Fallback to string comparison if Date parsing fails
      if (!maxTimestamp || modified > maxTimestamp) {
        maxTimestamp = modified;
      }
    }
  }

  return maxTimestamp || undefined;
}
import type { NormalizedCache } from './normalizedCache';
import type { VirtualSubscription } from './virtualPageManager';

const log = console;

export enum BackfillReason {
  DeleteGap = 'delete-gap',
  Initial = 'initial',
  Pagination = 'pagination',
  Periodic = 'periodic',
  Recovery = 'recovery',
  Rehydration = 'rehydration',
  RemoteCreate = 'remote-create',
  RemoteUpdate = 'remote-update',
}

export enum BackfillStrategy {
  CursorFetch = 'cursor-fetch',
  FullRefresh = 'full-refresh',
  GapFill = 'gap-fill',
  Incremental = 'incremental',
  PageOnly = 'page-only',
}

export interface BackfillOptions {
  maxRetries?: number;
  pageSize?: number;
  retryDelay?: number;
  batchSize?: number;
  /**
   * Max CDC pages drained per incremental backfill when the server reports
   * has_more (default: 20). Fed from SyncOptions.backfillMaxPages so one
   * knob bounds both drain paths.
   */
  maxPages?: number;
}

export class BackfillManager {
  private readonly activeBackfills = new Map<string, Promise<void>>();
  private readonly backfillQueue = new Map<string, BackfillReason[]>();
  private readonly db: DbModule;
  private readonly normalizedCache: NormalizedCache;
  private readonly options: BackfillOptions;

  constructor(db: DbModule, normalizedCache: NormalizedCache, options: BackfillOptions = {}) {
    this.db = db;
    this.normalizedCache = normalizedCache;
    this.options = options;
  }

  async backfill(subscription: VirtualSubscription, reason: BackfillReason): Promise<void> {
    const subscriptionId = subscription.id;
    if (this.activeBackfills.has(subscriptionId)) {
      this.queueBackfill(subscriptionId, reason);
      await this.activeBackfills.get(subscriptionId)!;
      return;
    }
    const backfillPromise = this.performBackfill(subscription, reason);
    this.activeBackfills.set(subscriptionId, backfillPromise);
    let backfillSucceeded = false;
    try {
      await backfillPromise;
      backfillSucceeded = true;
    } catch (error) {
      log.error(error);
    } finally {
      this.activeBackfills.delete(subscriptionId);
      if (backfillSucceeded) {
        const queued = this.backfillQueue.get(subscriptionId);
        if (queued && queued.length > 0) {
          const reason = queued.shift()!;
          if (queued.length === 0) {
            this.backfillQueue.delete(subscriptionId);
          }
          if (reason) {
            this.backfill(subscription, reason).catch(log.error);
          }
        }
      } else {
        this.backfillQueue.delete(subscriptionId);
      }
    }
  }

  /**
   * Backfill one item to fill a gap
   */
  async backfillOne(subscription: VirtualSubscription): Promise<FrappeDoc<FrappeDocData> | null> {
    if (!subscription.getProgressiveCache().hasMore) {
      return null;
    }

    try {
      // Fetch one document using cursor if available
      const docs = await this.fetchWithCursor(subscription, 1);

      if (docs.length > 0) {
        const doc = docs[0];

        // Update caches using subscription methods
        subscription.processDocuments([doc], this.normalizedCache, {
          calculateCheckpoint: false, // Single doc doesn't need checkpoint update
        });

        return doc;
      }

      // No more documents
      subscription.updateProgressiveCache({ hasMore: false });
      return null;
    } catch (error) {
      console.error('Failed to backfill one item:', error);
      return null;
    }
  }

  /**
   * Rehydrate current page
   */
  async rehydrateCurrentPage(subscription: VirtualSubscription): Promise<void> {
    const { pageSize } = subscription.viewWindow;
    const { currentPage } = subscription.viewWindow;
    const start = (currentPage - 1) * pageSize;

    try {
      // Fetch current page from server
      const response = await this.db.getDocList(subscription.query.doctype, {
        fields: subscription.query.fields,
        filters: subscription.query.filters,
        orderBy: subscription.query.orderBy,
        limitStart: start,
        limit: pageSize,
      });

      // Replace page in cache
      const newDocIds = response.map((doc) => doc.name);
      const currentDocIds = subscription.getProgressiveCache().docIds;
      const updatedDocIds = [...currentDocIds];
      updatedDocIds.splice(start, pageSize, ...newDocIds);
      subscription.updateProgressiveCache({ docIds: updatedDocIds });

      // Update normalized cache
      for (const doc of response) {
        this.normalizedCache.upsert(doc);
      }

      // Clear rehydration flag
      subscription.needsRehydration = false;
    } catch (error) {
      console.error('Failed to rehydrate current page:', error);
      throw error;
    }
  }

  private async performBackfill(subscription: VirtualSubscription, reason: BackfillReason): Promise<void> {
    const strategy = this.determineStrategy(subscription, reason);
    switch (strategy) {
      case BackfillStrategy.FullRefresh: {
        await this.fullRefresh(subscription);
        break;
      }
      case BackfillStrategy.Incremental: {
        await this.incrementalBackfill(subscription);
        break;
      }
      case BackfillStrategy.PageOnly: {
        await this.pageBackfill(subscription);
        break;
      }
      case BackfillStrategy.GapFill: {
        await this.gapBackfill(subscription);
        break;
      }
      case BackfillStrategy.CursorFetch: {
        await this.cursorFetch(subscription);
        break;
      }
    }
  }

  private determineStrategy(subscription: VirtualSubscription, reason: BackfillReason): BackfillStrategy {
    switch (reason) {
      case BackfillReason.Initial: {
        return BackfillStrategy.FullRefresh;
      }
      case BackfillReason.Pagination: {
        return subscription.getProgressiveCache().nextCursor
          ? BackfillStrategy.CursorFetch
          : BackfillStrategy.Incremental;
      }
      case BackfillReason.DeleteGap: {
        return BackfillStrategy.GapFill;
      }
      case BackfillReason.RemoteCreate:
      case BackfillReason.RemoteUpdate:
      case BackfillReason.Rehydration: {
        return BackfillStrategy.PageOnly;
      }
      case BackfillReason.Periodic: {
        return subscription.checkpoint ? BackfillStrategy.Incremental : BackfillStrategy.FullRefresh;
      }
      case BackfillReason.Recovery: {
        return subscription.checkpoint ? BackfillStrategy.Incremental : BackfillStrategy.FullRefresh;
      }
      default: {
        return BackfillStrategy.Incremental;
      }
    }
  }

  private async fullRefresh(subscription: VirtualSubscription): Promise<void> {
    const batchSize = this.options.batchSize ?? this.options.pageSize ?? 100;
    const response = await this.db.getDocList(subscription.query.doctype, {
      fields: subscription.query.fields,
      filters: subscription.query.filters,
      orderBy: subscription.query.orderBy,
      limit: batchSize,
      limitStart: 0,
    });
    // Update caches using subscription methods
    subscription.processDocuments(response, this.normalizedCache);
    subscription.updateProgressiveCache({
      hasMore: response.length === batchSize,
    });
  }

  private async incrementalBackfill(subscription: VirtualSubscription): Promise<void> {
    if (!subscription.checkpoint) {
      await this.fullRefresh(subscription);
      return;
    }

    try {
      // Drain CDC pages while the server reports truncation (bounded) so
      // catch-up after a long gap is complete, not one page deep.
      const maxPages = this.options.maxPages ?? 20;
      for (let page = 0; page < maxPages; page++) {
        const response = await this.db.backfill({
          doctype: subscription.query.doctype,
          fields: subscription.query.fields,
          filters: subscription.query.filters,
          modifiedAfter: subscription.checkpoint,
          limit: this.options.pageSize ?? 200,
        });

        // Process deletions using shared utility
        if ('deleted' in response && Array.isArray(response.deleted)) {
          const deletedDocIds = (response.deleted as any[])
            .filter((deletion) => deletion?.name)
            .map((deletion) => deletion.name);

          if (deletedDocIds.length > 0) {
            subscription.removeDocuments(deletedDocIds, this.normalizedCache);
          }
        }

        // Process updates and creates
        for (const doc of response.rows) {
          const exists = subscription.getProgressiveCache().docIds.includes(doc.name);
          const matches = matchesFilters(doc as FrappeDoc<FrappeDocData>, subscription.query.filters);

          if (exists && !matches) {
            // Remove - no longer matches
            subscription.removeDocuments([doc.name], this.normalizedCache);
          } else if (!exists && matches) {
            // Add - now matches (but we don't know where)
            subscription.needsRehydration = true;
          } else if (exists) {
            // Update existing
            this.normalizedCache.upsert(doc);
          }
        }

        // Advance the checkpoint: prefer the server's exact resume cursor
        // ("ts|name"); fall back to the max modified for older servers.
        subscription.checkpoint = response.checkpoint ?? calculateCheckpointFromDocs(response.rows);

        const madeProgress = response.rows.length > 0 || (response.deleted?.length ?? 0) > 0;
        if (!response.has_more || !response.checkpoint || !madeProgress) {
          break;
        }
      }
    } catch (error) {
      console.error('Incremental backfill failed:', error);
      // Fall back to full refresh
      await this.fullRefresh(subscription);
    }
  }

  private async pageBackfill(subscription: VirtualSubscription): Promise<void> {
    const { pageSize } = subscription.viewWindow;
    const { currentPage } = subscription.viewWindow;
    const start = (currentPage - 1) * pageSize;

    // Fetch current page from server
    const response = await this.db.getDocList(subscription.query.doctype, {
      fields: subscription.query.fields,
      filters: subscription.query.filters,
      orderBy: subscription.query.orderBy,
      limitStart: start,
      limit: pageSize,
    });

    // Replace page in cache
    const newDocIds = response.map((doc) => doc.name);
    const currentDocIds = subscription.getProgressiveCache().docIds;
    const updatedDocIds = [...currentDocIds];
    updatedDocIds.splice(start, pageSize, ...newDocIds);
    subscription.updateProgressiveCache({ docIds: updatedDocIds });

    // Update normalized cache
    for (const doc of response) {
      this.normalizedCache.upsert(doc);
    }

    // Clear flags
    subscription.needsRehydration = false;
  }

  private async gapBackfill(subscription: VirtualSubscription): Promise<void> {
    // Fill one gap
    await this.backfillOne(subscription);

    // Clear flag
    subscription.pendingBackfill = false;
  }

  private async cursorFetch(subscription: VirtualSubscription): Promise<void> {
    if (!subscription.getProgressiveCache().hasMore) {
      return;
    }
    const batchSize = this.options.batchSize ?? this.options.pageSize ?? 100;
    const docs = await this.fetchWithCursor(subscription, batchSize);

    // Update caches using subscription methods
    subscription.updateProgressiveCache({
      docIds: [...subscription.getProgressiveCache().docIds, ...docs.map((doc) => doc.name)],
      nextCursor: docs.length > 0 ? docs.at(-1).name : subscription.getProgressiveCache().nextCursor,
      hasMore: docs.length === batchSize,
    });

    // Update normalized cache only (skip checkpoint calculation for batch updates)
    for (const doc of docs) {
      this.normalizedCache.upsert(doc);
    }
  }

  private async fetchWithCursor(subscription: VirtualSubscription, limit: number): Promise<FrappeDoc<FrappeDocData>[]> {
    return await this.db.getDocList(subscription.query.doctype, {
      fields: subscription.query.fields,
      filters: subscription.query.filters,
      orderBy: subscription.query.orderBy,
      cursor: subscription.getProgressiveCache().nextCursor,
      limit,
    });
  }

  private queueBackfill(subscriptionId: string, reason: BackfillReason): void {
    if (!this.backfillQueue.has(subscriptionId)) {
      this.backfillQueue.set(subscriptionId, []);
    }
    const queue = this.backfillQueue.get(subscriptionId)!;
    if (!queue.includes(reason)) {
      queue.push(reason);
    }
  }
}

import { Debouncer } from '@tanstack/pacer';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { DbModule } from '../db';

import type { MutationJournal } from './mutation-journal';
import type { NormalizedCache } from './normalized-cache';
import type { SubscriptionManager } from './subscription-manager';
import { Operation, RehydrationReason, RehydrationStrategyType } from './types';
import type { RehydrationStrategy, RehydrationTask, Subscription } from './types';

/**
 * Manages intelligent rehydration of subscriptions based on optimistic operations.
 *
 * The RehydrationManager determines when and how to refresh subscription data
 * to maintain consistency after optimistic mutations. It uses different strategies
 * based on the type of operation and its impact on pagination.
 *
 * @example
 * ```typescript
 * const manager = new RehydrationManager(db, cache, subscriptions, journal);
 *
 * // Schedule rehydration after creating a document
 * manager.scheduleRehydration(subscription, 'create');
 *
 * // Register temporary ID mapping for later resolution
 * manager.registerTempIdMapping('tmp_123', 'TASK-001');
 * ```
 */
export class RehydrationManager {
  /** Queue of pending rehydration tasks, keyed by subscription ID */
  private readonly rehydrationQueue = new Map<string, RehydrationTask>();
  /** Debouncer for batching rehydration queue processing */
  private readonly processDebouncer = new Debouncer(
    async () => {
      await this.processQueue();
    },
    { wait: 100 },
  );
  /** Maps temporary IDs to server-assigned IDs for optimistic creates */
  private readonly temporaryIdMap = new Map<string, string>();
  private readonly db: DbModule;
  private readonly cache: NormalizedCache;
  private readonly subscriptionManager: SubscriptionManager;
  private readonly mutationJournal: MutationJournal;
  /** Notifies the sync store after rehydration mutates cache/membership. */
  private readonly onChange?: () => void;

  constructor(
    db: DbModule,
    cache: NormalizedCache,
    subscriptionManager: SubscriptionManager,
    mutationJournal: MutationJournal,
    onChange?: () => void,
  ) {
    this.db = db;
    this.cache = cache;
    this.subscriptionManager = subscriptionManager;
    this.mutationJournal = mutationJournal;
    this.onChange = onChange;
  }

  /**
   * Schedules a rehydration task for a subscription based on the reason.
   * Coalesces multiple requests for the same subscription.
   *
   * @param subscription - The subscription to rehydrate
   * @param reason - The reason for rehydration (affects strategy selection)
   *
   * Multiple rehydration requests for the same subscription are coalesced.
   * Higher priority tasks override lower priority ones.
   * Tasks are processed after a delay to batch multiple operations.
   */
  scheduleRehydration(subscription: Subscription, reason: RehydrationReason) {
    const existingTask = this.rehydrationQueue.get(subscription.id);
    const strategy = this.determineStrategy(reason);

    // If there's an existing task, potentially upgrade it
    if (existingTask) {
      // Higher priority tasks override lower priority ones
      if (strategy.priority > existingTask.strategy.priority) {
        existingTask.strategy = strategy;
      }
      // Reset timer so newly-added tasks are batched with this one
      this.scheduleProcessing(existingTask.strategy.delay);
      return;
    }

    // Add new task to queue
    this.rehydrationQueue.set(subscription.id, {
      subscriptionId: subscription.id,
      strategy,
      scheduledAt: Date.now(),
    });

    // Schedule processing
    this.scheduleProcessing(strategy.delay);
  }

  /**
   * Determines the rehydration strategy based on the reason.
   *
   * @param reason - The reason triggering rehydration
   * @returns Strategy with type, priority, and delay
   *
   * Strategy selection matrix:
   * - 'create': Fetch item only (low priority, 100ms delay)
   * - 'delete': Full refresh (high priority, 500ms delay)
   * - 'overflow': Full refresh (medium priority, 1000ms delay)
   * - 'uncertain': Full refresh (low priority, 2000ms delay)
   */
  // oxlint-disable-next-line eslint/class-methods-use-this -- part of the manager's strategy surface; the specs exercise it through the instance
  private determineStrategy(reason: RehydrationReason): RehydrationStrategy {
    switch (reason) {
      case RehydrationReason.Create: {
        // Just fetch the created item to get server-generated fields
        return {
          type: RehydrationStrategyType.FetchItemOnly,
          priority: 1,
          // Quick fetch
          delay: 100,
        };
      }

      case RehydrationReason.RemoteCreate: {
        // Remote document created - need full refresh to get correct page placement
        return {
          type: RehydrationStrategyType.FullRefresh,
          priority: 2,
          // Moderate urgency
          delay: 500,
        };
      }

      case RehydrationReason.Delete: {
        // Need full refresh to pull items from next page
        return {
          type: RehydrationStrategyType.FullRefresh,
          priority: 3,
          // More urgent
          delay: 500,
        };
      }

      case RehydrationReason.Overflow: {
        // Page has too many items, need to restore boundaries
        return {
          type: RehydrationStrategyType.FullRefresh,
          priority: 2,
          // Less urgent
          delay: 1000,
        };
      }

      case RehydrationReason.Uncertain: {
        // Can't determine placement, refresh when things settle
        return {
          type: RehydrationStrategyType.FullRefresh,
          priority: 1,
          // Give time for more operations
          delay: 2000,
        };
      }

      default: {
        return {
          type: RehydrationStrategyType.FullRefresh,
          priority: 1,
          delay: 1000,
        };
      }
    }
  }

  /**
   * Schedules processing of the rehydration queue.
   * Uses Pacer's Debouncer to batch multiple requests.
   */
  private scheduleProcessing(delay: number) {
    this.processDebouncer.setOptions({ wait: delay });
    this.processDebouncer.maybeExecute();
  }

  /**
   * Processes all pending rehydration tasks.
   *
   * Tasks are processed in priority order (highest first).
   * Within the same priority, earlier tasks are processed first.
   * Failed tasks remain in the queue for retry.
   */
  private async processQueue() {
    const tasks = [...this.rehydrationQueue.values()];

    // Sort by priority (higher first) then by scheduled time (earlier first)
    tasks.sort((a, b) => {
      if (a.strategy.priority !== b.strategy.priority) {
        return b.strategy.priority - a.strategy.priority;
      }
      return a.scheduledAt - b.scheduledAt;
    });

    // Process each task
    let anyExecuted = false;
    for (const task of tasks) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- tasks run one at a time in priority order by design
        await this.executeRehydration(task);
        this.rehydrationQueue.delete(task.subscriptionId);
        anyExecuted = true;
      } catch (error) {
        console.error(`Rehydration failed for ${task.subscriptionId}:`, error);
        // Keep in queue for retry
      }
    }
    // Rehydration refreshed cache/membership outside a mutate/backfill call —
    // notify store listeners so live queries pick up the reconciled page.
    if (anyExecuted) {
      this.onChange?.();
    }
  }

  /**
   * Executes a single rehydration task.
   */
  private async executeRehydration(task: RehydrationTask) {
    const subscription = this.subscriptionManager.getSubscription(task.subscriptionId);
    if (!subscription) {
      return;
    }

    switch (task.strategy.type) {
      case RehydrationStrategyType.FetchItemOnly: {
        await this.fetchOptimisticItems(subscription);
        break;
      }

      case RehydrationStrategyType.FullRefresh: {
        await this.fullPageRefresh(subscription);
        break;
      }

      default: {
        break;
      }
    }

    // Clear pending rehydration flag
    delete subscription.pendingRehydration;
  }

  /**
   * Fetches only the optimistically created items to get server-generated fields.
   */
  private async fetchOptimisticItems(subscription: Subscription) {
    const pendingCreates = this.getPendingCreates(subscription.query.doctype);

    for (const mutation of pendingCreates) {
      const temporaryId = mutation.docname;
      if (temporaryId === undefined || temporaryId === '') {
        continue;
      }

      // Check if we have the real name mapping
      const realName = this.temporaryIdMap.get(temporaryId);
      if (realName !== undefined && realName !== '') {
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential fetches keep the request fan-out to one at a time
          const document = await this.db.getDoc(subscription.query.doctype, realName);
          this.cache.upsert(document);
        } catch (error) {
          console.error(`Failed to fetch ${realName}:`, error);
        }
      }
    }
  }

  /**
   * Performs a full page refresh with reconciliation.
   */
  private async fullPageRefresh(subscription: Subscription) {
    const { doctype, fields, filters, orderBy, limitStart, limit } = subscription.query;

    try {
      // Fetch fresh page from server
      const docs = await this.db.getDocList(doctype, {
        fields,
        filters,
        orderBy,
        limitStart: subscription.boundaries?.offset ?? limitStart ?? 0,
        limit: subscription.boundaries?.pageSize ?? limit ?? 20,
      });

      // Inject doctype into each doc (Frappe API doesn't include it)
      for (const doc of docs) {
        if (!doc.doctype) {
          doc.doctype = doctype;
        }
      }

      // Reconcile with optimistic state
      this.reconcilePage(subscription, docs);

      // Update boundaries
      const [firstDoc] = docs;
      const lastDoc = docs.at(-1);
      if (firstDoc !== undefined && lastDoc !== undefined) {
        subscription.boundaries = {
          firstItem: { ...firstDoc, doctype },
          lastItem: { ...lastDoc, doctype },
          offset: subscription.boundaries?.offset ?? 0,
          pageSize: subscription.boundaries?.pageSize ?? limit ?? 20,
        };
      }
    } catch (error) {
      console.error(`Full refresh failed for ${subscription.id}:`, error);
      throw error;
    }
  }

  /**
   * Reconciles server state with optimistic changes.
   */
  private reconcilePage(subscription: Subscription, serverDocs: FrappeDoc<FrappeDocData>[]) {
    const pendingOps = this.mutationJournal.listPending();
    const reconciledIds = new Set<string>();
    const { doctype } = subscription.query;

    // Start with server state
    for (const serverDoc of serverDocs) {
      // Ensure doctype is set
      serverDoc.doctype ??= doctype;

      // Check for pending updates
      const pendingUpdate = pendingOps.find(
        ({ entry }) =>
          entry.operation === Operation.Update && entry.docname === serverDoc.name && entry.doctype === doctype,
      );

      if (pendingUpdate) {
        // Apply optimistic update on top of fresh server state
        const merged = { ...serverDoc, ...pendingUpdate.entry.values, doctype };
        this.cache.upsert(merged);
      } else {
        // Use server state as-is
        this.cache.upsert(serverDoc);
      }
      reconciledIds.add(serverDoc.name);
    }

    // Add optimistic creates that belong on this page
    const pendingCreates = pendingOps.filter(
      ({ entry }) => entry.operation === Operation.Create && entry.doctype === subscription.query.doctype,
    );

    for (const { entry } of pendingCreates) {
      const temporaryId = entry.docname;
      if (temporaryId !== undefined && temporaryId !== '' && !reconciledIds.has(temporaryId)) {
        // Check if it should be on this page
        // For now, add it if we're uncertain
        reconciledIds.add(temporaryId);
      }
    }

    // Remove optimistic deletes
    const pendingDeletes = pendingOps.filter(
      ({ entry }) => entry.operation === Operation.Delete && entry.doctype === subscription.query.doctype,
    );

    for (const { entry } of pendingDeletes) {
      if (entry.docname !== undefined && entry.docname !== '') {
        reconciledIds.delete(entry.docname);
      }
    }

    // Update subscription membership
    subscription.docIds = [...reconciledIds];

    // Resort to maintain order
    this.subscriptionManager.resortSubscriptionDocIds(subscription);
  }

  /**
   * Gets pending create mutations for a doctype.
   */
  private getPendingCreates(doctype: string) {
    return this.mutationJournal
      .listPending()
      .flatMap(({ entry }) => (entry.operation === Operation.Create && entry.doctype === doctype ? [entry] : []));
  }

  /**
   * Registers a temp ID to real name mapping.
   */
  registerTempIdMapping(tempId: string, realName: string) {
    this.temporaryIdMap.set(tempId, realName);
  }

  /** The name the server gave a document created under a temp id. */
  resolveTempId(tempId: string): string | undefined {
    return this.temporaryIdMap.get(tempId);
  }

  /**
   * Clears the rehydration queue.
   */
  clear() {
    this.rehydrationQueue.clear();
    this.processDebouncer.cancel();
  }
}

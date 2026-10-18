import { Debouncer } from '@tanstack/pacer';

import type { FrappeDoc, FrappeDocData } from '../common/types';
import type { BatchMutation, DbModule } from '../db';
import type { RealtimeModule } from '../realtime';

import { matchesFilters } from './filters';
import { merge, MergeStrategy } from './merge';
import type { MergeConfig, DoctypeConfig } from './merge';
import type { MutationJournal, Pending } from './mutation-journal';
import type { NormalizedCache } from './normalized-cache';
import type { RehydrationManager } from './rehydration';
import type { SubscriptionManager } from './subscription-manager';
import type {
  OrderBy,
  CreateMutation,
  DeleteMutation,
  SyncOptions,
  Mutation,
  Subscription,
  UpdateMutation,
} from './types';
import { Order, Operation, PendingRehydrationType, PlacementType, RehydrationReason, Status } from './types';

/**
 * Normalizes a rejection into the plain `{ message }` shape the journal
 * stores — plain because journal entries are persisted and Error instances
 * JSON-serialize to `{}`, which would strip the message the rejected-write
 * UI (SyncErrorNotice) needs to show.
 */
type JournalError = Exclude<Pending['error'], Error | undefined>;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- normalizes a raw caught rejection, which is untyped by nature
const toJournalError = (err: unknown): JournalError => {
  if (err instanceof Error) {
    return { message: err.message };
  }
  // SAFETY: optional-chained read of an optional field; a non-object rejection yields undefined and falls back to String(err).
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const message = (err as { message?: string } | null | undefined)?.message;
  return { message: message ?? String(err) };
};

/** Generates a random id; prefers crypto.randomUUID when available. */
const cryptoRandomId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // oxlint-disable-next-line sonarjs/pseudo-random -- fallback for runtimes without crypto.randomUUID; ids only need local uniqueness
  return Math.random().toString(36).slice(2);
};

type ReplayErrorClass = 'conflict' | 'auth' | 'permanent' | 'failed';

/** Classifies errors for journal management. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- classifies a raw caught rejection, which is untyped by nature
const classifyError = (err: unknown): ReplayErrorClass => {
  // SAFETY: optional-chained reads of optional fields; a non-object rejection yields undefined and classifies as 'failed'.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const errorWithStatus = err as { status?: number; response?: { status?: number } } | null | undefined;
  const status = errorWithStatus?.status ?? errorWithStatus?.response?.status;

  // Conflict errors - need special merge handling
  if (status === 409 || status === 412) {
    return 'conflict';
  }

  // Auth errors - need user intervention
  if (status === 401 || status === 403) {
    return 'auth';
  }

  // Client validation errors (4xx) are permanent
  if (status !== undefined && status >= 400 && status < 500) {
    return 'permanent';
  }

  // All other errors (5xx, network) were already retried by HTTP client
  // If we get here, retries were exhausted - mark as failed
  return 'failed';
};

const parseSortFields = (orderBy: OrderBy | undefined): SortField[] => {
  if (!orderBy) {
    return [{ field: 'name', isAsc: true }];
  }

  // Handle both single field and array formats
  const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];

  const sortFields = orderByArray.map((ob) => ({
    field: ob.field,
    isAsc: ob.order !== Order.Desc,
  }));

  // Always add name as final tie-breaker if not already included
  const hasNameField = sortFields.some((sf) => sf.field === 'name');
  if (!hasNameField) {
    sortFields.push({ field: 'name', isAsc: true });
  }

  return sortFields;
};

/**
 * Places a candidate relative to the first/last rows of a page by walking
 * the sort fields; ties fall through to the next field.
 */
const placeBetween = (
  sortFields: SortField[],
  candidate: FrappeDoc<FrappeDocData>,
  first: FrappeDoc<FrappeDocData>,
  last: FrappeDoc<FrappeDocData>,
): PlacementType => {
  for (const { field, isAsc } of sortFields) {
    const candidateValue = candidate[field];
    const firstValue = first[field];
    const lastValue = last[field];

    // Skip fields with missing values
    if (candidateValue == null || firstValue == null || lastValue == null) {
      continue;
    }

    const sortsBeforeFirst = isAsc ? candidateValue < firstValue : candidateValue > firstValue;
    if (sortsBeforeFirst) {
      return PlacementType.Before;
    }
    const sortsAfterLast = isAsc ? candidateValue > lastValue : candidateValue < lastValue;
    if (sortsAfterLast) {
      return PlacementType.After;
    }

    // If values are not equal, we're within bounds
    if (candidateValue !== firstValue && candidateValue !== lastValue) {
      return PlacementType.Within;
    }
    // If equal, continue to next sort field for tie-breaking
  }

  // All sort fields match boundaries
  return PlacementType.Within;
};

/** Pending batch mutation entry */
interface PendingBatchMutation {
  mutation: Mutation<FrappeDocData>;
  resolve: (result: FrappeDoc<FrappeDocData> | undefined) => void;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- mirrors the Promise reject callback, which takes any rejection
  reject: (error: unknown) => void;
}

export interface SortField {
  field: string;
  isAsc: boolean;
}

export class MutationEngine {
  private readonly temporaryIdToRealNameMap = new Map<string, string>();
  private readonly globalOptimisticDocIds = new Map<string, Set<string>>();
  /** Pending mutations waiting to be batched */
  private pendingBatch: PendingBatchMutation[] = [];
  /** Debouncer for batch processing */
  private readonly batchDebouncer: Debouncer<() => Promise<void>>;
  private readonly db: DbModule;
  private readonly realtime: RealtimeModule | undefined;
  private readonly normalizedCache: NormalizedCache;
  private readonly mutationJournal: MutationJournal;
  private readonly subscriptionManager: SubscriptionManager;
  private readonly rehydrationManager: RehydrationManager;
  private readonly options: SyncOptions;

  constructor(
    db: DbModule,
    realtime: RealtimeModule | undefined,
    normalizedCache: NormalizedCache,
    mutationJournal: MutationJournal,
    subscriptionManager: SubscriptionManager,
    rehydrationManager: RehydrationManager,
    options: SyncOptions = {},
  ) {
    this.db = db;
    this.realtime = realtime;
    this.normalizedCache = normalizedCache;
    this.mutationJournal = mutationJournal;
    this.subscriptionManager = subscriptionManager;
    this.rehydrationManager = rehydrationManager;
    this.options = options;
    // Initialize batch debouncer
    const batchDelay = options.batchDelay ?? 100;
    this.batchDebouncer = new Debouncer(
      async () => {
        await this.flushBatch();
      },
      { wait: batchDelay },
    );
  }

  /**
   * Queue a mutation for batch processing.
   * Returns a promise that resolves when the batch is processed.
   */
  private async queueForBatch(mutation: Mutation<FrappeDocData>): Promise<FrappeDoc<FrappeDocData> | undefined> {
    // oxlint-disable-next-line promise/avoid-new -- bridges the debounced batch flush back to each caller's awaitable
    return await new Promise<FrappeDoc<FrappeDocData> | undefined>((resolve, reject) => {
      this.pendingBatch.push({ mutation, resolve, reject });

      // Flush immediately if batch is full
      const maxSize = this.options.batchMaxSize ?? 50;
      if (this.pendingBatch.length >= maxSize) {
        // flushBatch settles every queued caller itself and never rejects
        void this.flushBatch();
      } else {
        // Schedule debounced flush
        this.batchDebouncer.maybeExecute();
      }
    });
  }

  /**
   * Flush pending mutations as a batch.
   */
  private async flushBatch(): Promise<void> {
    if (this.pendingBatch.length === 0) {
      return;
    }

    // Take current batch and clear pending
    const batch = [...this.pendingBatch];
    this.pendingBatch = [];

    try {
      // Convert to BatchMutation format
      const batchMutations: BatchMutation<FrappeDocData>[] = batch.map(({ mutation }) => {
        const operationMap: Record<Operation, 'create' | 'update' | 'delete'> = {
          [Operation.Create]: 'create',
          [Operation.Update]: 'update',
          [Operation.Delete]: 'delete',
        };

        return {
          type: operationMap[mutation.operation],
          doctype: mutation.doc.doctype,
          name: mutation.doc.name,
          data: mutation.operation === Operation.Delete ? undefined : mutation.doc,
        };
      });

      // Send batch to server
      const results = await this.db.batchMutations({
        mutations: batchMutations,
        atomic: this.options.batchAtomic ?? false,
      });

      // Process results
      for (const [i, { mutation, resolve, reject }] of batch.entries()) {
        const result = results[i];

        if (result.success) {
          // Confirm in journal
          this.mutationJournal.confirm(mutation.mutationId);

          // Update cache with server response
          if (result.data) {
            this.normalizedCache.upsert(result.data);

            // Reconcile optimistic identity for creates — the full remap
            // (subscription membership + temp cache row eviction), not just
            // the id maps, or the optimistic row lingers beside the server
            // row exactly like the non-batched path used to.
            if (mutation.operation === Operation.Create) {
              this.reconcileBatchedCreate(mutation, result.data.name);
            }
          }

          this.options.onMutationSuccess?.(mutation);

          resolve(result.data);
        } else {
          // Handle error
          const error = new Error(result.error ?? 'Batch mutation failed');
          this.mutationJournal.fail(mutation.mutationId, toJournalError(error));
          reject(error);
        }
      }
    } catch (error) {
      // Batch request failed - reject all
      for (const { mutation, reject } of batch) {
        this.mutationJournal.fail(mutation.mutationId, toJournalError(error));
        reject(error);
      }
    }
  }

  private reconcileBatchedCreate(mutation: CreateMutation<FrappeDocData>, realName: string) {
    const temporaryName = mutation.temporaryName ?? mutation.doc.name;
    if (temporaryName && realName && temporaryName !== realName) {
      this.handleTemporaryToRealMapping(mutation.doc.doctype, temporaryName, realName);
      this.rehydrationManager.registerTempIdMapping(temporaryName, realName);
    } else if (temporaryName) {
      this.globalOptimisticDocIds.get(mutation.doc.doctype)?.delete(temporaryName);
    }
  }

  /** The OCC token on a doc, read from the doctype's configured version field. */
  private readVersion(doc: FrappeDoc<FrappeDocData> | undefined, doctype: string): string | undefined {
    const versionField = this.options.versionFields?.[doctype] ?? this.options.versionField ?? 'modified';
    const value = doc?.[versionField];
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the version field is untyped doc data; only a string is a usable OCC token
    return typeof value === 'string' ? value : undefined;
  }

  /** Schedules a create rehydration for every subscription on the doctype. */
  private scheduleCreateRehydration(doctype: string) {
    for (const subscription of this.subscriptionManager.getAllSubscriptions().values()) {
      if (subscription.query.doctype === doctype) {
        this.rehydrationManager.scheduleRehydration(subscription, RehydrationReason.Create);
      }
    }
  }

  /**
   * Force flush any pending batched mutations.
   */
  async forceBatchFlush(): Promise<void> {
    this.batchDebouncer.cancel();
    await this.flushBatch();
  }

  // oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- the ordered optimistic-apply → journal → transport pipeline; its step order is load-bearing (see inline notes), so it stays in one place
  async mutate<Data extends FrappeDocData>(mutation: Mutation<Data>) {
    if (this.options.onMutationStart) {
      this.options.onMutationStart(mutation);
    }
    const { doc } = mutation;
    const isUpdateOrDelete = mutation.operation === Operation.Update || mutation.operation === Operation.Delete;
    if (isUpdateOrDelete && !doc.name) {
      throw new Error('docname is required for update/delete operations');
    }
    let { version } = mutation;
    let cachedDoc: FrappeDoc<FrappeDocData> | undefined;
    if (doc.name) {
      cachedDoc = this.normalizedCache.get({
        doctype: doc.doctype,
        name: doc.name,
      });
    }
    if (version === undefined && doc.name) {
      version = this.readVersion(cachedDoc, doc.doctype);
    }
    if (mutation.operation === Operation.Update && doc.name) {
      await this.handleOptimisticUpdate(mutation, cachedDoc);
      // Optimistic state must PAINT before the server round trip: without
      // this bridge, store-subscription consumers (subscribeStore /
      // useFrappeInfiniteList) only re-read after the ack, so the engine's
      // optimism was invisible to them (TanStack collections masked it with
      // their own overlay).
      this.options.onStoreChange?.();
    }
    if (mutation.operation === Operation.Create) {
      await this.handleOptimisticCreate(mutation);
      this.options.onStoreChange?.();
    }
    if (version === undefined && doc.name && isUpdateOrDelete && !cachedDoc) {
      try {
        cachedDoc = await this.db.getDoc(doc.doctype, doc.name);
        version = this.readVersion(cachedDoc, doc.doctype);
        this.normalizedCache.upsert(cachedDoc);
      } catch (error) {
        // Version fetch failed - continue without version check
        // This is acceptable as OCC is optional for mutations
        if (this.options.onTrace) {
          this.options.onTrace({
            event: 'version-fetch-failed',
            details: { doctype: doc.doctype, name: doc.name, error },
          });
        }
      }
    }
    const values = mutation.operation === Operation.Delete ? undefined : mutation.doc;
    this.mutationJournal.add(mutation.mutationId, {
      doctype: doc.doctype,
      // Creates journal the optimistic identity (consumer placeholder or
      // engine-generated temp id) so page refreshes keep the pending row
      // and rollback can evict it even when doc.name was never set.
      docname: mutation.operation === Operation.Create ? (mutation.temporaryName ?? doc.name) : doc.name,
      values,
      operation: mutation.operation,
      version,
      status: Status.Pending,
      snapshot: doc.name ? cachedDoc : undefined,
    });

    // Optimistic delete: evict now, in BOTH the batched and non-batched
    // paths (it used to live inside handleServerDelete, so batched deletes
    // never painted optimistically). Placed after the journal add so the
    // rollback snapshot was captured, and after the version fetch so that
    // fetch's cache upsert cannot resurrect the row we just evicted.
    if (mutation.operation === Operation.Delete && doc.name) {
      this.applyOptimisticDelete(doc.doctype, doc.name);
      this.options.onStoreChange?.();
    }

    // Use batching if enabled. Custom-transport mutations can't ride the
    // batch RPC — their whole point is a different server endpoint.
    if (this.options.enableBatching && !mutation.execute) {
      try {
        await this.queueForBatch(mutation);
        // Schedule rehydration for creates
        if (mutation.operation === Operation.Create) {
          this.scheduleCreateRehydration(mutation.doc.doctype);
        }
      } catch (error) {
        await this.handleMutationError(mutation, error);
        throw error;
      }
      return;
    }

    // Non-batched execution (original behavior)
    try {
      if (mutation.operation === Operation.Create) {
        await this.handleServerCreate(mutation);
      } else if (mutation.operation === Operation.Update && doc.name) {
        await this.handleServerUpdate(mutation, version);
      } else if (mutation.operation === Operation.Delete && doc.name) {
        await this.handleServerDelete(mutation, version);
      }
      this.mutationJournal.confirm(mutation.mutationId);
      if (this.options.onMutationSuccess) {
        this.options.onMutationSuccess(mutation);
      }
      if (mutation.operation === Operation.Create) {
        this.scheduleCreateRehydration(mutation.doc.doctype);
      }
      if (!this.realtime?.isHealthy()) {
        await this.refetchAffectedDocs(mutation);
      }
    } catch (error) {
      await this.handleMutationError(mutation, error);
      throw error;
    }
  }

  private async handleOptimisticUpdate<Data extends FrappeDocData>(
    mutation: UpdateMutation<Data>,
    cachedDoc?: FrappeDoc<Data>,
  ) {
    const doc = cachedDoc ? { ...cachedDoc, ...mutation.doc } : mutation.doc;
    this.normalizedCache.upsert(doc);
    if (this.options.onOptimisticApply) {
      this.options.onOptimisticApply({
        doctype: mutation.doc.doctype,
        name: mutation.doc.name,
        operation: mutation.operation,
      });
    }
    this.subscriptionManager.updateSubscriptionMembership(doc);
  }

  private async handleOptimisticCreate<Data extends FrappeDocData>(mutation: CreateMutation<Data>) {
    const temporaryName = mutation.doc.name || `tmp_${cryptoRandomId()}`;
    // Record the optimistic identity on the mutation itself: the server-ack
    // remap, rollback, and journal paths must all resolve the SAME name.
    // For engine-generated names, mutation.doc.name stays unset so the
    // synthetic id is never sent to the server.
    mutation.temporaryName = temporaryName;
    const optimisticDoc: FrappeDoc<Data> = {
      ...mutation.doc,
      name: temporaryName,
    };
    this.normalizedCache.upsert(optimisticDoc);
    const { doctype } = mutation.doc;
    let globalDocIds = this.globalOptimisticDocIds.get(doctype);
    if (globalDocIds === undefined) {
      globalDocIds = new Set();
      this.globalOptimisticDocIds.set(doctype, globalDocIds);
    }
    for (const subscription of this.subscriptionManager.getAllSubscriptions().values()) {
      const skip =
        subscription.query.doctype !== doctype ||
        !matchesFilters(optimisticDoc, subscription.query.filters) ||
        globalDocIds.has(temporaryName) ||
        !this.placeOnPage(subscription, optimisticDoc);
      if (!skip && !subscription.docIds.includes(temporaryName)) {
        this.subscriptionManager.insertDocumentIntoSubscription(subscription, optimisticDoc);
        globalDocIds.add(temporaryName);
      }
    }
  }

  /**
   * Places an optimistic create against a paged subscription. Returns false
   * when the doc belongs on another page (only the off-page counters move);
   * an unknown placement still inserts but schedules a full refresh.
   */
  private placeOnPage<Data extends FrappeDocData>(subscription: Subscription, optimisticDoc: FrappeDoc<Data>): boolean {
    const { orderBy, limit } = subscription.query;
    const isPaged = orderBy && limit !== undefined && limit > 0 && subscription.docIds.length > 0;
    if (!isPaged) {
      return true;
    }
    const placement = this.determineOptimisticPlacement(subscription, optimisticDoc);
    if (placement === PlacementType.Before) {
      if (subscription.metadata) {
        subscription.metadata.itemsBeforePage = (subscription.metadata.itemsBeforePage ?? 0) + 1;
      }
      return false;
    }
    if (placement === PlacementType.After) {
      if (subscription.metadata) {
        subscription.metadata.itemsAfterPage = (subscription.metadata.itemsAfterPage ?? 0) + 1;
      }
      return false;
    }
    if (placement === PlacementType.Unknown) {
      subscription.pendingRehydration = PendingRehydrationType.FullRefresh;
      this.rehydrationManager.scheduleRehydration(subscription, RehydrationReason.Uncertain);
    }
    return true;
  }

  private async handleServerCreate<Data extends FrappeDocData>(mutation: CreateMutation<Data>) {
    // Idempotency-Key rides the first attempt (not just replays) so an
    // HTTP-level retry after a lost response replays the recorded outcome
    // instead of double-inserting (live-protocol FRAPPE-EXT-001).
    // A custom transport (mutation.execute) replaces only this server call;
    // the ack reconcile below is identical.
    const created = mutation.execute
      ? await mutation.execute()
      : await this.db.createDoc<FrappeDoc<Data>>({
          ...mutation.doc,
          client_mutation_id: mutation.mutationId,
        });
    // Authoritative name assigned by the backend (may equal the provided temp name)
    const realName = created?.name;
    // The client-synthesized or user-provided temporary name used during optimism
    const temporaryName = mutation.temporaryName ?? mutation.doc.name;
    // The ack payload IS the authoritative post-insert document (same user
    // context as any refetch) — seed the cache unconditionally so remapped
    // membership resolves immediately instead of waiting for the realtime
    // echo (which used to leave the row blank until the socket delivered).
    if (realName) {
      this.normalizedCache.upsert({
        ...created,
        doctype: created.doctype || mutation.doc.doctype,
      });
    }
    // If backend assigned a different name, remap temporary → real across subscriptions.
    if (realName && temporaryName && realName !== temporaryName) {
      this.handleTemporaryToRealMapping(mutation.doc.doctype, temporaryName, realName);
      // Register temp ID mapping for rehydration
      this.rehydrationManager.registerTempIdMapping(temporaryName, realName);
    } else if (temporaryName) {
      // Even if name didn't change, remove from optimistic registry since it's now confirmed
      const globalDocs = this.globalOptimisticDocIds.get(mutation.doc.doctype);
      if (globalDocs) {
        globalDocs.delete(temporaryName);
      }
    }
  }

  private async handleServerUpdate<Data extends FrappeDocData>(
    mutation: UpdateMutation<Data>,
    _version: string | undefined,
  ) {
    if (mutation.execute) {
      // Custom transport: seed the cache when it returns the updated doc,
      // otherwise the optimistic value stands until the realtime echo.
      const updated = await mutation.execute();
      if (updated && updated.name) {
        this.normalizedCache.upsert({
          ...updated,
          doctype: updated.doctype || mutation.doc.doctype,
        });
      }
      return;
    }
    // Send partial update with idempotency and OCC token
    await this.db.updateDoc(mutation.doc);
  }

  /**
   * Applies the local side of a delete: cache eviction, subscription
   * membership removal, and gap-filling rehydration. Runs before the server
   * call (mutate() body) so the row disappears immediately; the journal
   * snapshot restores it if the server rejects.
   */
  private applyOptimisticDelete(doctype: string, name: string) {
    // Rehydration targets must be resolved BEFORE membership removal —
    // removeFromAllSubscriptions strips the id the includes() check needs.
    const affected = [...this.subscriptionManager.getAllSubscriptions().values()].filter(
      (subscription) => subscription.query.doctype === doctype && subscription.docIds.includes(name),
    );
    this.normalizedCache.remove({ doctype, name });
    this.subscriptionManager.removeFromAllSubscriptions(doctype, name);
    // Schedule full refresh for subscriptions to pull in items from next page
    for (const subscription of affected) {
      this.rehydrationManager.scheduleRehydration(subscription, RehydrationReason.Delete);
    }
  }

  private async handleServerDelete<Data extends FrappeDocData>(
    mutation: DeleteMutation<Data>,
    _version: string | undefined,
  ) {
    // Local eviction already happened in mutate() (shared with the batched
    // path); this is only the idempotent server confirmation.
    if (mutation.execute) {
      await mutation.execute();
      return;
    }
    await this.db.deleteDoc(mutation.doc);
  }

  private handleTemporaryToRealMapping(doctype: string, temporaryName: string, realName: string) {
    this.temporaryIdToRealNameMap.set(temporaryName, realName);
    // Update global registry: remove temporary, add real
    const globalDocs = this.globalOptimisticDocIds.get(doctype);
    if (globalDocs) {
      globalDocs.delete(temporaryName);
      // Real name is no longer optimistic, so we don't add it back
    }
    // Replace in subscriptions. When the realtime event / CDC backfill /
    // page-refresh reconcile already delivered the server row (the ack lost
    // the race), a plain map would leave the same name twice — drop the
    // temporary id instead so exactly one row remains.
    for (const subscription of this.subscriptionManager.getAllSubscriptions().values()) {
      if (subscription.query.doctype !== doctype || !subscription.docIds.includes(temporaryName)) {
        continue;
      }
      subscription.docIds = subscription.docIds.includes(realName)
        ? subscription.docIds.filter((id) => id !== temporaryName)
        : subscription.docIds.map((id) => (id === temporaryName ? realName : id));
    }
    // Remove the temporary cached row now that the authoritative name exists
    this.normalizedCache.remove({ doctype, name: temporaryName });
  }

  private async refetchAffectedDocs<Data extends FrappeDocData>(mutation: Mutation<Data>) {
    // Target the main document (accounting for temporary→real remap) and any related documents
    const targets: { doctype: string; name: string }[] = [];
    const docname = mutation.doc.name;
    const { doctype } = mutation.doc;
    const mappedName = docname ? this.temporaryIdToRealNameMap.get(docname) : undefined;
    const realName = mappedName === undefined || mappedName === '' ? docname : mappedName;
    // A deleted doc no longer exists server-side — refetching it would 404
    // and route a server-confirmed delete into the error/rollback path.
    // A created doc is the insert-side sibling of the same bug: its cache
    // copy was already seeded from the authoritative ack response, and
    // refetching the pre-remap temporary name is a guaranteed 404 that used
    // to roll back a server-confirmed create. Only updates refetch the
    // main document here.
    if (realName && mutation.operation === Operation.Update) {
      targets.push({ doctype, name: realName });
    }
    if (mutation.affected !== undefined && mutation.affected.length > 0) {
      targets.push(...mutation.affected);
    }
    // Fetch each target with user context to respect permissions and hidden fields
    for (const target of targets) {
      // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- one refetch at a time; a failure stops the rest and routes to the error path
      const fresh = await this.db.getDoc(target.doctype, target.name);
      this.normalizedCache.upsert(fresh);
    }
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives the raw caught rejection, which is untyped by nature
  private async handleMutationError<Data extends FrappeDocData>(mutation: Mutation<Data>, err: unknown) {
    if (this.options.onMutationError) {
      this.options.onMutationError({ mutation, err });
    }
    // Failure path: mark failed and rollback optimistic state where possible.
    this.mutationJournal.fail(mutation.mutationId, toJournalError(err));
    const entry = this.mutationJournal.get(mutation.mutationId);

    // Skip rollback when offline — mutation may be retried when back online
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (!isOffline) {
      // Rollback optimistic state based on operation type
      await this.rollbackOptimisticState(mutation, entry);
    }

    // Conflict handling: on 409 or 412, fetch latest and notify host via onConflict.
    // SAFETY: optional-chained read of an optional field; a non-object rejection yields undefined (no conflict).
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const status = (err as { status?: number } | null | undefined)?.status;
    const docname = mutation.doc.name;
    if ((status === 409 || status === 412) && docname) {
      await this.handleConflict(mutation, entry);
    }
  }

  /**
   * Rolls back optimistic state when a mutation fails.
   * Handles all operation types: create, update, and delete.
   */
  private async rollbackOptimisticState<Data extends FrappeDocData>(
    mutation: Mutation<Data>,
    entry: Pending | undefined,
  ) {
    const { doctype } = mutation.doc;
    const docname = mutation.doc.name;

    switch (mutation.operation) {
      case Operation.Create: {
        // Remove temporary optimistic document from cache and subscriptions
        // (handleFailedCreate resolves the optimistic identity — consumer
        // placeholder or engine-generated temp id — and evicts both).
        await this.handleFailedCreate(mutation);
        break;
      }

      case Operation.Update: {
        // Restore the original document from snapshot (wholesale: an
        // optimistic update may have added keys the snapshot never had)
        if (entry?.snapshot && docname) {
          this.normalizedCache.upsert(entry.snapshot, { replace: true });
          // Also update subscription memberships in case filters changed
          this.subscriptionManager.updateSubscriptionMembership(entry.snapshot);
        }
        break;
      }

      case Operation.Delete: {
        // Restore the deleted document from snapshot
        if (entry?.snapshot && docname) {
          this.normalizedCache.upsert(entry.snapshot, { replace: true });
          // Re-add to subscription memberships
          const restoredDoc = entry.snapshot;
          for (const subscription of this.subscriptionManager.getAllSubscriptions().values()) {
            if (subscription.query.doctype !== doctype) {
              continue;
            }
            const matches = matchesFilters(restoredDoc, subscription.query.filters);
            if (matches && !subscription.docIds.includes(docname)) {
              this.subscriptionManager.insertDocumentIntoSubscription(subscription, restoredDoc);
            }
          }
        }
        break;
      }

      default: {
        break;
      }
    }
  }

  private async handleFailedCreate<Data extends FrappeDocData>(mutation: Mutation<Data>) {
    const temporaryName =
      mutation.operation === Operation.Create ? (mutation.temporaryName ?? mutation.doc.name) : mutation.doc.name;
    const { doctype } = mutation.doc;

    if (temporaryName) {
      // Remove from global registry
      const globalDocs = this.globalOptimisticDocIds.get(doctype);
      if (globalDocs) {
        globalDocs.delete(temporaryName);
      }
      // Remove temporary optimistic row from subscriptions that may have included it.
      for (const subscription of this.subscriptionManager.getAllSubscriptions().values()) {
        if (subscription.query.doctype !== doctype) {
          continue;
        }
        subscription.docIds = subscription.docIds.filter((id) => id !== temporaryName);
      }
      // Evict the optimistic cache row (generated temp ids never lived in
      // mutation.doc.name, so keying off the resolved name matters here).
      this.normalizedCache.remove({ doctype, name: temporaryName });
    }
  }

  private async handleConflict<Data extends FrappeDocData>(mutation: Mutation<Data>, entry: Pending | undefined) {
    const { doctype } = mutation.doc;
    const docname = mutation.doc.name;
    if (!docname) {
      return;
    }

    try {
      const latest = await this.db.getDoc(doctype, docname);
      const base = entry?.snapshot;
      const clientPartial = mutation.operation === Operation.Delete ? {} : mutation.doc;
      // Build the full client document (base + mutation changes) so the merge
      // can correctly distinguish "field unchanged" from "field set to undefined".
      const fullClient: FrappeDoc<FrappeDocData> = { ...base, ...clientPartial, doctype, name: docname };
      const mergeConfig = this.buildMergeConfig();
      const nonOverlap = merge(base, fullClient, latest, mergeConfig, doctype);
      if (!nonOverlap.hasConflicts) {
        // Safe auto-merge path: retry with latest version and only disjoint fields
        const latestVersion = this.readVersion(latest, doctype);
        await this.db.updateDoc({
          ...nonOverlap.merged,
          client_mutation_id: cryptoRandomId(),
          base_modified: latestVersion === '' ? undefined : latestVersion,
        });
        // Refresh to converge local cache and finalize the original journal entry
        const refreshed = await this.db.getDoc(doctype, docname);
        this.normalizedCache.upsert(refreshed);
        this.mutationJournal.confirm(mutation.mutationId);
        return;
      }
      // Overlap exists: converge to server's latest; delegate resolution to onConflict
      this.normalizedCache.upsert(latest);
    } catch {
      // Safe to continue: auto-merge is best-effort; any failure falls through
      // to onConflict so the host resolves the conflict instead.
    }
    if (this.options.onConflict) {
      this.options.onConflict({
        doctype,
        name: docname,
      });
    }
  }

  /**
   * Determines optimal placement for an optimistic item based on sort fields.
   * Supports multi-column sorting with proper tie-breaking.
   *
   * @param subscription - The subscription to check placement against
   * @param candidate - The document to place
   * @returns Placement relative to current page:
   *   - 'before': Item belongs on a previous page
   *   - 'within': Item belongs on the current page
   *   - 'after': Item belongs on a later page
   *   - 'unknown': Cannot determine placement (needs full refresh)
   *
   * Uses page boundaries when available for O(1) placement checks.
   * Falls back to comparing against first/last items in current page.
   * Supports multi-field sorting with tie-breaking.
   */
  private determineOptimisticPlacement(subscription: Subscription, candidate: FrappeDoc<FrappeDocData>): PlacementType {
    const { docIds } = subscription;
    if (!docIds.length) {
      return PlacementType.Unknown;
    }

    // Use boundaries if available for more accurate placement
    const firstBoundary = subscription.boundaries?.firstItem;
    const lastBoundary = subscription.boundaries?.lastItem;
    if (firstBoundary && lastBoundary) {
      return placeBetween(parseSortFields(subscription.query.orderBy), candidate, firstBoundary, lastBoundary);
    }

    // Fallback: compare against first/last items when boundaries unavailable
    const order = subscription.query.orderBy;
    if (!order) {
      return PlacementType.Unknown;
    }
    const { doctype } = subscription.query;
    const first = this.normalizedCache.get({ doctype, name: docIds[0] });
    const last = this.normalizedCache.get({ doctype, name: docIds.at(-1) ?? '' });

    if (!first || !last) {
      return PlacementType.Unknown;
    }

    // Parse sort fields (support multiple columns)
    return placeBetween(parseSortFields(order), candidate, first, last);
  }

  /**
   * Replays pending mutations with simplified error handling and rate limiting.
   *
   * Since HTTP client now handles retries automatically for transient errors,
   * we only need to handle:
   * - Success → confirm and remove from journal
   * - Conflict (409/412) → attempt merge resolution, then retry
   * - Auth (401/403) → notify user, keep in journal for later retry
   * - Permanent (4xx validation) → fail and remove from journal
   * - Failed (exhausted retries) → keep in journal but notify
   *
   * The replay path uses plain CRUD without optimistic writes,
   * since optimistic state is already reflected in the cache.
   *
   * Rate limiting is applied to prevent hammering the server when replaying
   * large numbers of queued mutations after coming back online.
   */
  async replayPending() {
    let anyFailed = false;

    if (this.options.onReplayStart) {
      this.options.onReplayStart();
    }

    const pendingMutations = this.mutationJournal.listPending();
    if (pendingMutations.length === 0) {
      if (this.options.onReplayComplete) {
        this.options.onReplayComplete({ anyFailed: false });
      }
      return;
    }

    // Rate limit: default 10 mutations per second to avoid server overload
    const rateLimit = this.options.replayRateLimit ?? 10;

    // Process mutations with rate limiting
    const processMutation = async (mutation: { id: string; entry: Pending }) => {
      const { id, entry } = mutation;
      if (this.options.onRetry) {
        this.options.onRetry({ id, operation: entry.operation });
      }
      try {
        await this.replayEntry(id, entry);
        // Success - confirm and remove from journal
        this.mutationJournal.confirm(id);
      } catch (error) {
        const errorClass = classifyError(error);
        anyFailed = true;

        if (errorClass === 'conflict') {
          // Conflict - try to handle with merge logic in future replay
          // Keep in journal for retry after conflict resolution
          if (this.options.onConflict) {
            this.options.onConflict({
              doctype: entry.doctype,
              name: entry.docname,
            });
          }
        } else if (errorClass === 'auth') {
          // Auth error - keep in journal, user needs to refresh auth
          // Don't mark as failed since this might resolve later
        } else {
          // Permanent validation error - remove from journal, or
          // retries exhausted ('failed') - keep in journal but notify
          this.mutationJournal.fail(id, toJournalError(error));
          this.notifyMutationError(id, entry, error);
        }
      }
    };

    // Process mutations with rate limiting to avoid hammering the server
    // Rate limit is mutations per second
    const delayMs = Math.ceil(1000 / rateLimit);

    for (const [index, mutation] of pendingMutations.entries()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- replay is deliberately sequential (rate limited)
      await processMutation(mutation);
      // Add delay between mutations (except after the last one)
      if (index < pendingMutations.length - 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop, promise/avoid-new -- the rate-limit pause between sequential replays
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
    }

    if (this.options.onReplayComplete) {
      this.options.onReplayComplete({ anyFailed });
    }
  }

  /** Sends one journal entry to the server through the plain CRUD path. */
  private async replayEntry(id: string, entry: Pending) {
    const hasDocname = entry.docname !== undefined && entry.docname !== '';
    if (entry.operation === Operation.Create) {
      const created = await this.db.createDoc({
        ...entry.values,
        client_mutation_id: id,
        doctype: entry.doctype,
        name: entry.docname ?? cryptoRandomId(),
      });
      // A replayed create acks with the authoritative document (possibly
      // an idempotent replay of an earlier success) — reconcile the
      // optimistic identity exactly like the first attempt.
      if (created?.name) {
        this.normalizedCache.upsert({
          ...created,
          doctype: created.doctype || entry.doctype,
        });
        if (hasDocname && entry.docname !== undefined && created.name !== entry.docname) {
          this.handleTemporaryToRealMapping(entry.doctype, entry.docname, created.name);
          this.rehydrationManager.registerTempIdMapping(entry.docname, created.name);
        }
      }
    } else if (entry.operation === Operation.Update && hasDocname && entry.docname !== undefined) {
      await this.db.updateDoc({
        ...entry.values,
        client_mutation_id: id,
        base_modified: entry.version,
        doctype: entry.doctype,
        name: entry.docname,
      });
    } else if (entry.operation === Operation.Delete && hasDocname && entry.docname !== undefined) {
      await this.db.deleteDoc({
        doctype: entry.doctype,
        name: entry.docname,
        client_mutation_id: id,
      });
    }
  }

  /**
   * Helper to notify about mutation errors with proper typing
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- forwards the raw caught rejection to the host callback
  private notifyMutationError(id: string, entry: Pending, err: unknown) {
    if (!this.options.onMutationError) {
      return;
    }

    // Update/delete journal entries always carry a docname (mutate() rejects
    // nameless ones), so the '' fallback only types the unreachable case.
    const name = entry.docname ?? '';
    let mutation: Mutation<FrappeDocData>;
    if (entry.operation === Operation.Create) {
      mutation = {
        mutationId: id,
        operation: Operation.Create,
        doc: entry.values ?? { doctype: entry.doctype, name },
        version: entry.version,
        affected: [],
      };
    } else if (entry.operation === Operation.Update) {
      mutation = {
        mutationId: id,
        operation: Operation.Update,
        doc: { ...entry.values, doctype: entry.doctype, name },
        version: entry.version,
        affected: [],
      };
    } else {
      mutation = {
        mutationId: id,
        operation: Operation.Delete,
        doc: { doctype: entry.doctype, name },
        version: entry.version,
        affected: [],
      };
    }

    this.options.onMutationError({ mutation, err });
  }

  /**
   * Converts SyncOptions.fieldMergeConfig into the MergeConfig format
   * expected by the merge() function.
   */
  private buildMergeConfig(): MergeConfig | undefined {
    const fmc = this.options.fieldMergeConfig;
    if (!fmc) {
      return undefined;
    }

    const doctypes: Record<string, DoctypeConfig> = {};
    for (const [dt, fields] of Object.entries(fmc)) {
      doctypes[dt] = { fields };
    }
    return { defaultStrategy: MergeStrategy.ServerWins, doctypes };
  }

  /** Gets temporary to real name mapping. */
  getTemporaryIdToRealNameMap(): Map<string, string> {
    return this.temporaryIdToRealNameMap;
  }

  /** Clears all temporary mappings. */
  clearTemporaryMappings() {
    this.temporaryIdToRealNameMap.clear();
    this.globalOptimisticDocIds.clear();
  }

  /**
   * Disposes of resources.
   */
  dispose() {
    // Cancel any pending batch
    this.batchDebouncer.cancel();
    this.pendingBatch = [];
    this.clearTemporaryMappings();
  }
}

import type { CollectionConfig, SyncConfig } from '@tanstack/db';
import { createCollection } from '@tanstack/db';

import type { FixtureProvider } from './fixtures';
import type { SyncModule } from './sync';
import { defaultPageLength, Operation } from './sync/types';
import type { SubscriptionQuery } from './sync/types';

/**
 * Configuration for creating a Frappe-backed TanStack DB collection.
 *
 * @template TDoc - The document type stored in the collection
 */
export interface FrappeCollectionOptionsConfig<_TDoc extends object & { name: string; doctype: string }> {
  /** The Frappe SyncModule instance to use for data sync */
  sync: SyncModule;
  /** Fields to subscribe to from the doctype */
  fields?: readonly string[];
  /** Frappe filters to apply to the subscription */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Frappe filter operands are arbitrary field values, passed through to the server as-is
  filters?: Record<string, unknown> | [string, string, unknown][];
  /** Optional override for the collection id (defaults to doctype) */
  id?: string;
  /** Order-by configuration */
  orderBy?: SubscriptionQuery['orderBy'];
  /**
   * Rows to read. Omitting it reads {@link defaultPageLength} (20) rows in
   * BOTH fixture mode and against a live bench. Pass `limit: 0` for every
   * row, which also means the same on both.
   */
  limit?: number;
  /**
   * Called when the initial subscription fetch fails (network down,
   * PermissionError/403, bad doctype). Without this the collection just
   * looks empty — consumers should surface an honest error state instead.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- forwards a caught error, which is untyped by nature
  onSyncError?: (error: unknown) => void;
}

// ---------------------------------------------------------------------------
// External sync release
// ---------------------------------------------------------------------------
//
// Registered per collection while a Frappe sync session is active. Lets the
// shared-collection GC in frappeReact free the REAL resources (SyncModule
// subscription, store listener, realtime room) of a collection that leaked
// live queries still pin, WITHOUT calling collection.cleanup(): TanStack DB
// transitions every attached live query to a permanent error state (plus a
// console.error per query — "Source collection … was manually cleaned up
// while live query … depends on it") when a depended-on collection is
// cleaned up. Releasing externally leaves the collection object alive but
// inert: attached queries keep their last data, no error, no leak beyond
// the plain object graph the leaked query itself already holds.
const externalSyncReleases = new WeakMap<object, () => void>();

/**
 * Releases the Frappe-side sync resources (SyncModule subscription + store
 * listener → realtime room) of a collection created by
 * {@link createFrappeCollection}, without touching TanStack DB's lifecycle.
 * Idempotent; also runs automatically when TanStack stops the sync itself.
 *
 * @returns true when an active sync session was released, false when the
 * collection has no registered session (sync never started, already
 * stopped, or not a Frappe collection) — callers may fall back to
 * `collection.cleanup()` in that case.
 */
// oxlint-disable-next-line anti-slop/no-object-parameters -- any collection object is a valid WeakMap lookup key; non-Frappe collections just report false
export const releaseFrappeCollectionSync = (collection: object): boolean => {
  const release = externalSyncReleases.get(collection);
  if (!release) {
    return false;
  }
  release();
  return true;
};

// Mutation ids only need to be unique per client; Math.random is the
// fallback for runtimes without crypto.randomUUID (e.g. older Hermes).
const newMutationId = (): string =>
  // oxlint-disable-next-line sonarjs/pseudo-random -- uniqueness id, not a security token
  crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

/**
 * Creates TanStack DB collection options wired to Frappe's SyncModule.
 *
 * This follows TanStack DB's collection options creator pattern (Pattern B),
 * where mutation handlers are built-in and delegate to SyncModule.
 *
 * ROW LIMIT. A collection created without `limit` reads
 * {@link defaultPageLength} (20) rows, and reads the same 20 in fixture mode
 * as it does against a live bench. Frappe clamps a request with no
 * `limit_page_length` to 20 while a fixture provider returns every row, so
 * the limit is now always sent rather than left off. Pass `limit: 0` for
 * every row.
 *
 * @template TDoc - The Frappe document type
 * @param doctype - The Frappe doctype name (e.g. "Note", "Pokemon")
 * @param config - Configuration for the collection
 * @returns A CollectionConfig object suitable for `createCollection()`
 *
 * @example
 * ```typescript
 * const pokemonCollection = createCollection(
 *   frappeCollectionOptions<Pokemon>("Pokemon", {
 *     sync: syncModule,
 *     fields: ["name", "pokemon_name", "poke_id"],
 *   })
 * );
 * ```
 */
export const frappeCollectionOptions = <TDoc extends object & { name: string; doctype: string }>(
  doctype: string,
  config: FrappeCollectionOptionsConfig<TDoc>,
): CollectionConfig<TDoc, string> => {
  const { sync: syncModule, fields, filters, orderBy, limit, onSyncError } = config;

  const syncFn: SyncConfig<TDoc, string>['sync'] = (params) => {
    const { begin, write, commit, markReady } = params;

    let subscriptionId: string | null = null;
    let storeUnsubscribe: (() => void) | null = null;
    let lastKnownNames = new Set<string>();
    // Set when the collection is cleaned up while the initial subscribe is
    // still in flight. Without it the continuation would orphan a live
    // SyncModule subscription (nothing left to unsubscribe it) and the
    // trailing markReady() would throw on the cleaned-up collection
    // (invalid "cleaned-up" → "ready" status transition).
    let cancelled = false;

    // Idempotent resource release shared by TanStack's own sync teardown
    // and the external escape hatch (releaseFrappeCollectionSync).
    const releaseResources = () => {
      cancelled = true;
      if (storeUnsubscribe) {
        storeUnsubscribe();
        storeUnsubscribe = null;
      }
      if (subscriptionId !== null) {
        syncModule.unsubscribe(subscriptionId);
        subscriptionId = null;
      }
    };
    // Typed as required, but tests drive syncFn with partial params.
    const syncedCollection: object | undefined = params.collection;
    if (syncedCollection !== undefined) {
      externalSyncReleases.set(syncedCollection, releaseResources);
    }

    const initSync = async () => {
      try {
        // Subscribe to the SyncModule for this doctype
        const query: SubscriptionQuery = {
          doctype,
          fields,
          filters,
          orderBy,
          limit,
        };

        const result = await syncModule.subscribe<TDoc>(query);
        if (cancelled) {
          syncModule.unsubscribe(result.subscriptionId);
          return;
        }
        ({ subscriptionId } = result);

        // Seed initial data from the subscription
        const initialDocs = syncModule.getDocsForSubscription<TDoc>(subscriptionId);
        if (initialDocs.length > 0) {
          begin();
          for (const doc of initialDocs) {
            write({ type: 'insert', value: doc });
            lastKnownNames.add(doc.name);
          }
          commit();
        }

        // Listen for SyncModule store changes and forward to collection
        storeUnsubscribe = syncModule.subscribeStore(() => {
          if (subscriptionId === null) {
            return;
          }

          const currentDocs = syncModule.getDocsForSubscription<TDoc>(subscriptionId);
          const currentNames = new Set<string>();

          begin();

          // Upsert current docs
          for (const doc of currentDocs) {
            currentNames.add(doc.name);
            if (lastKnownNames.has(doc.name)) {
              write({ type: 'update', value: doc });
            } else {
              write({ type: 'insert', value: doc });
            }
          }

          // Delete docs that disappeared
          for (const name of lastKnownNames) {
            if (!currentNames.has(name)) {
              write({
                type: 'delete',
                // SAFETY: TanStack resolves a delete by getKey(value) = value.name; the other TDoc fields are never read.
                // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
                value: { name, doctype } as unknown as TDoc,
              });
            }
          }

          commit();
          lastKnownNames = currentNames;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(`[frappe-collection] Initial sync failed for ${doctype}:`, error);
        onSyncError?.(error);
      } finally {
        if (!cancelled) {
          markReady();
        }
      }
    };

    void initSync();

    // Return cleanup function
    return () => {
      if (syncedCollection !== undefined && externalSyncReleases.get(syncedCollection) === releaseResources) {
        externalSyncReleases.delete(syncedCollection);
      }
      releaseResources();
    };
  };

  return {
    id: config.id ?? doctype,
    getKey: (doc: TDoc) => doc.name,
    sync: { sync: syncFn },

    onInsert: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        const doc = mutation.modified;
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- mutations must reach the server in transaction order
        await syncModule.mutate({
          mutationId: newMutationId(),
          operation: Operation.Create,
          doc: { ...doc, doctype },
        });
      }
    },

    onUpdate: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        const doc = mutation.changes ?? mutation.modified;
        // SAFETY: getKey returns doc.name, so every key in this collection is a string.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        const name = mutation.key as string;
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- mutations must reach the server in transaction order
        await syncModule.mutate({
          mutationId: newMutationId(),
          operation: Operation.Update,
          doc: { ...doc, doctype, name },
        });
      }
    },

    onDelete: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        // SAFETY: getKey returns doc.name, so every key in this collection is a string.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        const name = mutation.key as string;
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- mutations must reach the server in transaction order
        await syncModule.mutate({
          mutationId: newMutationId(),
          operation: Operation.Delete,
          doc: { doctype, name },
        });
      }
    },
  };
};

/**
 * Creates a TanStack DB Collection backed by a Frappe doctype via SyncModule.
 *
 * Convenience wrapper that calls `createCollection(frappeCollectionOptions(...))`.
 * Without `limit` it reads {@link defaultPageLength} (20) rows in fixture mode
 * and against a live bench alike; `limit: 0` reads every row.
 *
 * @template TDoc - The Frappe document type
 * @param doctype - The Frappe doctype name
 * @param config - Configuration for the collection
 * @returns A TanStack DB Collection instance
 *
 * @example
 * ```typescript
 * const pokemonCollection = createFrappeCollection<Pokemon>("Pokemon", {
 *   sync: syncModule,
 *   fields: ["name", "pokemon_name", "poke_id"],
 * });
 *
 * // Use with useLiveQuery
 * const { data } = useLiveQuery((q) =>
 *   q.from({ pokemon: pokemonCollection })
 * );
 *
 * // Direct mutations
 * pokemonCollection.insert({ name: "pikachu", doctype: "Pokemon", ... });
 * ```
 */
export const createFrappeCollection = <TDoc extends object & { name: string; doctype: string }>(
  doctype: string,
  config: FrappeCollectionOptionsConfig<TDoc>,
) => createCollection<TDoc, string>(frappeCollectionOptions<TDoc>(doctype, config));

/**
 * Configuration for creating a fixture-backed TanStack DB collection.
 * Used when fixtures are provided (e.g. in Storybook or tests).
 */
export interface FixtureCollectionOptionsConfig<_TDoc extends object & { name: string; doctype: string }> {
  /** The fixture provider to use for data */
  fixtures: FixtureProvider;
  /** Fields to load from the doctype */
  fields?: readonly string[];
  /** Frappe filters to apply */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Frappe filter operands are arbitrary field values, passed through to the fixture provider as-is
  filters?: Record<string, unknown> | [string, string, unknown][];
  /** Optional override for the collection id */
  id?: string;
  /** Order-by configuration */
  orderBy?: SubscriptionQuery['orderBy'];
  /**
   * Rows to read. Omitting it reads {@link defaultPageLength} (20) rows, the
   * same as against a live bench. Pass `limit: 0` for every row.
   */
  limit?: number;
  /** Offset for pagination */
  limitStart?: number;
}

/**
 * Creates TanStack DB collection options wired to a FixtureProvider.
 * Used when config.fixtures is set (e.g. in tests or Storybook).
 *
 * ROW LIMIT. Without `limit` this reads {@link defaultPageLength} (20) rows,
 * the same count a live bench returns for a request with no
 * `limit_page_length`. Pass `limit: 0` for every row.
 */
export const fixtureCollectionOptions = <TDoc extends object & { name: string; doctype: string }>(
  doctype: string,
  config: FixtureCollectionOptionsConfig<TDoc>,
): CollectionConfig<TDoc, string> => {
  const { fixtures, fields, filters, orderBy, limit, limitStart } = config;

  const syncFn: SyncConfig<TDoc, string>['sync'] = (params) => {
    const { begin, write, commit, markReady } = params;

    // Same guard as the SyncModule-backed syncFn above: cleanup while the
    // fixture fetch is in flight must skip the trailing writes + markReady()
    // — markReady() on a cleaned-up collection throws (invalid
    // "cleaned-up" → "ready" status transition) as an unhandled rejection.
    let cancelled = false;

    const initSync = async () => {
      try {
        const orderByForFixture = Array.isArray(orderBy)
          ? orderBy.map((ob) => ({ field: ob.field, order: ob.order }))
          : orderBy && { field: orderBy.field, order: orderBy.order };

        const docs = await fixtures.getList<TDoc>(doctype, {
          fields,
          // SAFETY: a filter record names TDoc fields; the fixture provider only matches them against row values.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          filters: filters as Partial<TDoc> | [string, string, unknown][] | undefined,
          orderBy: orderByForFixture,
          limitStart,
          // Same page length the bench applies to a request that carries no
          // limit_page_length, so a no-limit collection reads the same rows
          // here as it does in production.
          limit: limit ?? defaultPageLength,
        });

        if (cancelled) {
          return;
        }
        if (docs.length > 0) {
          begin();
          for (const doc of docs) {
            // SAFETY: fixture rows are complete docs; the provider types them Partial only because `fields` may narrow them.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            const fullDoc = { ...doc, doctype } as TDoc;
            write({ type: 'insert', value: fullDoc });
          }
          commit();
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(`[frappe-collection] Fixture sync failed for ${doctype}:`, error);
      } finally {
        if (!cancelled) {
          markReady();
        }
      }
    };

    void initSync();

    return () => {
      cancelled = true;
    };
  };

  return {
    id: config.id ?? doctype,
    getKey: (doc: TDoc) => doc.name,
    sync: { sync: syncFn },

    onInsert: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        const doc = mutation.modified;
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- mutations apply in transaction order
        await fixtures.createDoc(doctype, { ...doc, doctype });
      }
    },

    onUpdate: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        const doc = mutation.changes ?? mutation.modified;
        // SAFETY: getKey returns doc.name, so every key in this collection is a string.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        const name = mutation.key as string;
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- mutations apply in transaction order
        await fixtures.updateDoc(doctype, name, { ...doc, doctype });
      }
    },

    onDelete: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        // SAFETY: getKey returns doc.name, so every key in this collection is a string.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        const name = mutation.key as string;
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- mutations apply in transaction order
        await fixtures.deleteDoc(doctype, name);
      }
    },
  };
};

/**
 * Creates a TanStack DB Collection backed by a FixtureProvider.
 * Used when config.fixtures is set (e.g. in tests or Storybook).
 * Without `limit` it reads {@link defaultPageLength} (20) rows, matching a
 * live bench; `limit: 0` reads every row.
 */
export const createFixtureCollection = <TDoc extends object & { name: string; doctype: string }>(
  doctype: string,
  config: FixtureCollectionOptionsConfig<TDoc>,
) => createCollection<TDoc, string>(fixtureCollectionOptions<TDoc>(doctype, config));

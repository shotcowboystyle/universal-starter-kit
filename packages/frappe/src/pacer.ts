import type { Collection } from '@tanstack/db';
import { AsyncRateLimiter } from '@tanstack/pacer';
import { useAsyncDebouncer, useThrottledCallback } from '@tanstack/react-pacer';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { FrappeDoc, FrappeDocData } from './common/types';
import { HttpClient } from './core/http';
import type { AuthConfig } from './core/types';
import { DbModule } from './db';
import type { FixtureProvider } from './fixtures';
import type { SyncModule } from './sync';
import { Operation } from './sync/types';
import { useLiveQuery } from './useLiveQuery';

// ---------------------------------------------------------------------------
// useDebouncedSearch
// ---------------------------------------------------------------------------

/**
 * Options for `useDebouncedSearch`.
 */
export interface DebouncedSearchOptions<TDoc extends FrappeDocData> {
  /** Debounce delay in milliseconds (default 300) */
  wait?: number;
  /** Fields to return from the search */
  fields?: readonly (keyof TDoc & string)[];
  /** Additional static filters merged into every request */
  filters?: Record<string, unknown> | [string, string, unknown][];
  /** Maximum results per search (default 20) */
  limit?: number;
  /** Minimum query length before firing a search (default 1) */
  minLength?: number;
  /** Field to match against with `like` (default "name") */
  searchField?: string;
}

/**
 * Return type of `useDebouncedSearch`.
 */
export interface DebouncedSearchResult<TDoc extends FrappeDocData> {
  /** Current query string */
  query: string;
  /** Set the search query (triggers debounced search) */
  setQuery: (query: string) => void;
  /** Search results from the most recent completed search */
  results: FrappeDoc<TDoc>[];
  /** Whether a search API call is in-flight */
  isSearching: boolean;
  /** Cancel any pending debounced search */
  cancel: () => void;
}

/**
 * Connection configuration for hooks that need a Frappe backend.
 */
export interface FrappeConnectionConfig {
  /**
   * The base URL of the Frappe server. Required unless `fixtures` is set:
   * a fixtures-only host has no server, and the hooks here read the corpus
   * (or park) instead of dialling one.
   */
  baseURL?: string;
  /** False disables realtime when this connection is used by collection hooks. */
  realtime?: boolean;
  /** Override port for Socket.IO realtime connection (e.g. 9000 in dev). */
  socketPort?: number;
  /** Authentication configuration */
  auth?: {
    useToken?: boolean;
    token?: string | (() => string | Promise<string>);
    type?: string;
  };
  /**
   * Fixture provider for story / test hosts. Consumers already forward it
   * (frappe-ui's FrappeProvider builds this config from its own context), and
   * `useDocTypeMeta` reads doctype metadata from it before reaching for the
   * network.
   */
  fixtures?: FixtureProvider;
}

function createDbModule(config: FrappeConnectionConfig): DbModule | undefined {
  if (!config.baseURL) {
    return undefined;
  }
  const authConfig: AuthConfig | undefined = config.auth
    ? {
        useToken: config.auth.useToken,
        token: config.auth.token,
        type: config.auth.type as AuthConfig['type'],
      }
    : undefined;
  return new DbModule(new HttpClient(config.baseURL, authConfig));
}

/**
 * Debounced search hook for Frappe doctypes.
 *
 * Uses TanStack Pacer's `AsyncDebouncer` to debounce user input before
 * firing a `getDocList` API call with a `like` filter.
 *
 * @typeParam TDoc - The Frappe document type
 * @param config - Connection configuration (baseURL, auth), or undefined to disable
 * @param doctype - The Frappe doctype to search
 * @param options - Search options (wait, fields, filters, limit, minLength, searchField)
 * @returns `{ query, setQuery, results, isSearching, cancel }`
 *
 * @example
 * ```tsx
 * function PokemonSearch() {
 *   const { query, setQuery, results, isSearching } = useDebouncedSearch<Pokemon>(
 *     { baseURL: "https://frappe.example.com" },
 *     "Pokemon",
 *     { fields: ["name", "pokemon_name"], wait: 250 },
 *   );
 *   return (
 *     <div>
 *       <input value={query} onChange={e => setQuery(e.target.value)} />
 *       {isSearching && <span>Searching...</span>}
 *       {results.map(p => <div key={p.name}>{p.pokemon_name}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useDebouncedSearch<TDoc extends FrappeDocData>(
  config: FrappeConnectionConfig | undefined,
  doctype: string,
  options?: DebouncedSearchOptions<TDoc>,
): DebouncedSearchResult<TDoc> {
  const wait = options?.wait ?? 300;
  const fields = options?.fields;
  const limit = options?.limit ?? 20;
  const minLength = options?.minLength ?? 1;
  const additionalFilters = options?.filters;
  const searchField = options?.searchField ?? 'name';

  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<FrappeDoc<TDoc>[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Stable DbModule reference
  const dbRef = useRef<DbModule | undefined>(undefined);
  const configKeyRef = useRef('');
  const configKey = config
    ? `${config.baseURL}:${config.auth?.useToken ? 't' : ''}:${config.auth?.token ?? ''}:${config.auth?.type ?? ''}`
    : '';
  if (config && configKey !== configKeyRef.current) {
    dbRef.current = createDbModule(config);
    configKeyRef.current = configKey;
  }
  if (!config) {
    dbRef.current = undefined;
    configKeyRef.current = '';
  }

  const debouncer = useAsyncDebouncer(
    async (searchQuery: string) => {
      const db = dbRef.current;
      if (!db || searchQuery.length < minLength) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const searchFilters: [string, string, unknown][] = [[searchField, 'like', `%${searchQuery}%`]];

        // Merge additional static filters
        if (additionalFilters) {
          if (Array.isArray(additionalFilters)) {
            searchFilters.push(...additionalFilters);
          } else {
            for (const [key, value] of Object.entries(additionalFilters)) {
              searchFilters.push([key, '=', value]);
            }
          }
        }

        const docs = await db.getDocList<TDoc>(doctype, {
          fields: fields as readonly string[] | undefined,
          filters: searchFilters,
          limit,
        });
        setResults(docs);
      } catch (error) {
        console.error(`[useDebouncedSearch] Search failed for ${doctype}:`, error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    { wait },
  );

  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryState(newQuery);
      if (newQuery.length < minLength) {
        setResults([]);
        debouncer.cancel();
        return;
      }
      debouncer.maybeExecute(newQuery);
    },
    [debouncer, minLength],
  );

  const cancel = useCallback(() => {
    debouncer.cancel();
    setIsSearching(false);
  }, [debouncer]);

  return { query, setQuery, results, isSearching, cancel };
}

// ---------------------------------------------------------------------------
// useThrottledPagination
// ---------------------------------------------------------------------------

/**
 * Options for `useThrottledPagination`.
 */
export interface ThrottledPaginationOptions {
  /** Number of items per page (default 20) */
  pageSize?: number;
  /** Throttle interval in milliseconds for loadMore (default 200) */
  throttleMs?: number;
}

/**
 * Return type of `useThrottledPagination`.
 */
export interface ThrottledPaginationResult<TDoc extends FrappeDocData> {
  /** Currently visible items (paginated view of the collection) */
  items: TDoc[];
  /** Load the next page of items (throttled) */
  loadMore: () => void;
  /** Whether more items are available beyond the current page */
  hasMore: boolean;
  /** Whether the collection is still loading */
  isLoading: boolean;
}

/**
 * Throttled pagination hook for TanStack DB collections.
 *
 * Provides a paginated window over a TanStack DB collection backed by Frappe.
 * The `loadMore` callback is throttled using TanStack Pacer to prevent
 * rapid-fire scroll events from over-fetching.
 *
 * @typeParam TDoc - The Frappe document type
 * @param collection - A TanStack DB Collection, or undefined
 * @param options - Pagination options (pageSize, throttleMs)
 * @returns `{ items, loadMore, hasMore, isLoading }`
 *
 * @example
 * ```tsx
 * function PokemonList() {
 *   const collection = useFrappeCollection<Pokemon>(config, "Pokemon");
 *   const { items, loadMore, hasMore, isLoading } = useThrottledPagination(
 *     collection,
 *     { pageSize: 10, throttleMs: 200 },
 *   );
 *
 *   return (
 *     <div onScroll={handleScroll}>
 *       {items.map(p => <div key={p.name}>{p.pokemon_name}</div>)}
 *       {hasMore && <button onClick={loadMore}>Load More</button>}
 *       {isLoading && <span>Loading...</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useThrottledPagination<TDoc extends FrappeDocData>(
  collection: Collection<TDoc, string> | undefined,
  options?: ThrottledPaginationOptions,
): ThrottledPaginationResult<TDoc> {
  const pageSize = options?.pageSize ?? 20;
  const throttleMs = options?.throttleMs ?? 200;

  const [visibleCount, setVisibleCount] = useState(pageSize);

  // Query all items from the collection
  const liveResult = useLiveQuery((q) => (collection ? q.from({ _items: collection }) : null), [collection]);

  const allItems = (liveResult?.data ?? []) as TDoc[];

  const items = useMemo(() => allItems.slice(0, visibleCount), [allItems, visibleCount]);

  const hasMore = allItems.length > visibleCount;
  const isLoading = liveResult?.isLoading ?? !collection;

  const throttledLoadMore = useThrottledCallback(
    () => {
      setVisibleCount((prev) => prev + pageSize);
    },
    { wait: throttleMs },
  );

  return { items, loadMore: throttledLoadMore, hasMore, isLoading };
}

// ---------------------------------------------------------------------------
// createRateLimitedBatch
// ---------------------------------------------------------------------------

/**
 * Options for `createRateLimitedBatch`.
 */
export interface RateLimitedBatchOptions {
  /** The Frappe doctype */
  doctype: string;
  /** The mutation operation to perform (create | update | delete) */
  operation: 'create' | 'update' | 'delete';
  /** Maximum operations per second (default 5) */
  maxPerSecond?: number;
  /** Number of items to send per batch request (default 10) */
  batchSize?: number;
  /** SyncModule instance for sending mutations */
  syncModule: SyncModule;
}

/**
 * A queued item for batch processing.
 */
interface BatchItem<TDoc extends FrappeDocData> {
  name: string;
  data?: Partial<TDoc>;
}

/**
 * Return type of `createRateLimitedBatch`.
 */
export interface RateLimitedBatchHandle<TDoc extends FrappeDocData> {
  /** Add an item to the batch queue */
  add: (name: string, data?: Partial<TDoc>) => void;
  /** Execute all queued items with rate limiting */
  execute: (callbacks?: { onProgress?: (completed: number, total: number) => void }) => Promise<void>;
}

/**
 * Creates a rate-limited batch processor for bulk Frappe operations.
 *
 * Uses TanStack Pacer's `AsyncRateLimiter` to enforce per-second rate
 * limits when executing bulk create/update/delete operations against
 * a Frappe backend via SyncModule.
 *
 * @typeParam TDoc - The Frappe document type
 * @param options - Batch configuration (doctype, operation, rate limits, syncModule)
 * @returns `{ add(name, data), execute({ onProgress }) }`
 *
 * @example
 * ```typescript
 * const batch = createRateLimitedBatch<Pokemon>({
 *   doctype: "Pokemon",
 *   operation: "update",
 *   maxPerSecond: 5,
 *   batchSize: 10,
 *   syncModule,
 * });
 *
 * for (const pokemon of allPokemon) {
 *   batch.add(pokemon.name, { hp: 100 });
 * }
 *
 * await batch.execute({
 *   onProgress: (done, total) => console.log(`${done}/${total}`),
 * });
 * ```
 */
export function createRateLimitedBatch<TDoc extends FrappeDocData>(
  options: RateLimitedBatchOptions,
): RateLimitedBatchHandle<TDoc> {
  const { doctype, operation, maxPerSecond = 5, batchSize = 10, syncModule } = options;

  const queue: BatchItem<TDoc>[] = [];

  const operationMap: Record<string, Operation> = {
    create: Operation.Create,
    update: Operation.Update,
    delete: Operation.Delete,
  };

  function add(name: string, data?: Partial<TDoc>) {
    queue.push({ name, data });
  }

  async function execute(callbacks?: { onProgress?: (completed: number, total: number) => void }) {
    const total = queue.length;
    if (total === 0) {
      return;
    }

    let completed = 0;

    // Chunk the queue into batches
    const batches: BatchItem<TDoc>[][] = [];
    for (let i = 0; i < queue.length; i += batchSize) {
      batches.push(queue.slice(i, i + batchSize));
    }

    // Rate limiter that processes one batch at a time
    const rateLimiter = new AsyncRateLimiter(
      async (batch: BatchItem<TDoc>[]) => {
        const mutations = batch.map((item) => ({
          mutationId: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
          operation: operationMap[operation],
          doc: {
            doctype,
            name: item.name,
            ...item.data,
          } as FrappeDocData,
        }));

        // Execute mutations sequentially through SyncModule
        for (const mutation of mutations) {
          await syncModule.mutate(mutation);
          completed++;
          callbacks?.onProgress?.(completed, total);
        }
      },
      {
        limit: maxPerSecond,
        window: 1000,
      },
    );

    // Submit all batches to the rate limiter
    for (const batch of batches) {
      await rateLimiter.maybeExecute(batch);
    }

    // Clear the queue
    queue.length = 0;
  }

  return { add, execute };
}

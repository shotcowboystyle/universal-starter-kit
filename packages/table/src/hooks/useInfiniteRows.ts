/**
 * useInfiniteRows - accumulation + prefetch engine for DataTable's
 * `paginationMode="infinite"`.
 *
 * Two data shapes, one contract:
 *
 * - Client mode (no `loadPage`): all rows are already in memory; the hook
 *   only tracks how many page-chunks are revealed (`loadedPages`). "Prefetch"
 *   is trivial — appending is a synchronous slice.
 * - Loader mode (`loadPage` provided): the hook owns a small page cache
 *   keyed by page index. Page N+1 is pre-loaded in the background as soon
 *   as page N is appended (including page 0 on initial load), so the append
 *   at the scroll tail resolves instantly from cache.
 *
 * Reset semantics: any change to sorting / filters / column filters /
 * global search / page size invalidates the cache and restarts from page 0
 * (a generation counter drops stale in-flight responses).
 *
 * Framework-agnostic by design: `loadPage` is a plain async callback, so
 * adapters (e.g. FrappeTable in @repo/frappe-ui) supply their
 * own fetching without this package knowing about them.
 */

import type { ColumnFiltersState } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DataTablePageLoader, PageLoadResult, TableFilter, TableSorting } from '../types';

export interface UseInfiniteRowsOptions<TData = any> {
  /** paginationMode === "infinite" */
  enabled: boolean;
  /** Async page loader; when omitted, client mode (in-memory slicing) is used */
  loadPage?: DataTablePageLoader<TData>;
  pageSize: number;
  sorting: TableSorting[];
  filters: TableFilter[];
  columnFilters: ColumnFiltersState;
  globalFilter?: string;
}

export interface UseInfiniteRowsReturn<TData = any> {
  /** True when infinite mode drives the loader path (loadPage provided) */
  isLoaderMode: boolean;
  /** Accumulated rows from the loader (loader mode only; [] otherwise) */
  rows: TData[];
  /** Number of revealed page-chunks (client mode; loader mode mirrors pages loaded) */
  loadedPages: number;
  /** Total row count reported by the loader, when known */
  totalCount?: number;
  /** Loader mode: no further pages exist */
  exhausted: boolean;
  /** Loader mode: page 0 for the current query is still loading AND no previous rows exist */
  isInitialLoading: boolean;
  /**
   * Loader mode: the query key changed and a new page 0 is in flight, but
   * the previous query's rows are still on screen (keepPreviousData).
   */
  isFetching: boolean;
  /** True while `rows` belong to the previous query key. */
  isPlaceholderData: boolean;
  /** Loader mode: a page append is awaiting the loader (cache miss) */
  isAppending: boolean;
  /** Append the next page (loader mode) */
  loadMore: () => void;
  /** Reveal the next chunk (client mode); maxRowCount clamps exhaustion */
  loadMoreClient: (maxRowCount: number) => void;
}

function isLastPage(result: PageLoadResult, pagesLoaded: number, pageSize: number): boolean {
  if (result.rows.length < pageSize) {
    return true;
  }
  if (result.totalCount != null && pagesLoaded * pageSize >= result.totalCount) {
    return true;
  }
  return false;
}

export function useInfiniteRows<TData = any>({
  enabled,
  loadPage,
  pageSize,
  sorting,
  filters,
  columnFilters,
  globalFilter,
}: UseInfiniteRowsOptions<TData>): UseInfiniteRowsReturn<TData> {
  const isLoaderMode = enabled && loadPage != null;

  // Latest loader without retriggering resets when an inline callback changes identity.
  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;

  // Any query-state change resets accumulation back to page one.
  const queryKey = useMemo(
    () => JSON.stringify({ sorting, filters, columnFilters, globalFilter, pageSize }),
    [sorting, filters, columnFilters, globalFilter, pageSize],
  );
  const queryRef = useRef({ sorting, filters, columnFilters, globalFilter, pageSize });
  queryRef.current = { sorting, filters, columnFilters, globalFilter, pageSize };

  // ---- Client mode ----
  const [clientPages, setClientPages] = useState(1);

  const loadMoreClient = useCallback(
    (maxRowCount: number) => {
      if (!enabled) {
        return;
      }
      setClientPages((prev) => (prev * pageSize >= maxRowCount ? prev : prev + 1));
    },
    [enabled, pageSize],
  );

  // ---- Loader mode ----
  const [pages, setPages] = useState<TData[][]>([]);
  const [totalCount, setTotalCount] = useState<number | undefined>();
  const [exhausted, setExhausted] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isPlaceholderData, setIsPlaceholderData] = useState(false);
  const [isAppending, setIsAppending] = useState(false);
  /** True after the first successful page-0 settle — later query-key
   * changes keep the previous rows (or an empty body) mounted. */
  const hasLoadedRef = useRef(false);

  const generationRef = useRef(0);
  const cacheRef = useRef<Map<number, Promise<PageLoadResult<TData>>>>(new Map());
  /** Pages whose promise already resolved — appended synchronously (no tail skeleton). */
  const resolvedRef = useRef<Map<number, PageLoadResult<TData>>>(new Map());
  const appendPendingRef = useRef(false);

  const ensurePage = useCallback(async (pageIndex: number): Promise<PageLoadResult<TData>> => {
    const cached = cacheRef.current.get(pageIndex);
    if (cached) {
      return cached;
    }
    const loader = loadPageRef.current;
    if (!loader) {
      return Promise.resolve({ rows: [] });
    }
    const q = queryRef.current;
    const generation = generationRef.current;
    const promise = loader({
      pageIndex,
      pageSize: q.pageSize,
      sorting: q.sorting,
      filters: q.filters,
      columnFilters: q.columnFilters,
      globalFilter: q.globalFilter,
    });
    cacheRef.current.set(pageIndex, promise);
    promise.then(
      (result) => {
        if (generation !== generationRef.current) {
          return;
        }
        resolvedRef.current.set(pageIndex, result);
      },
      // Failed loads are evicted so the next loadMore retries instead of
      // permanently caching the rejection.
      () => {
        if (cacheRef.current.get(pageIndex) === promise) {
          cacheRef.current.delete(pageIndex);
        }
      },
    );
    return promise;
  }, []);

  // Reset + initial load (page 0) + prefetch page 1 as soon as page 0 lands.
  // Query-key changes (filter/sort/search/pageSize) must NOT blank the body:
  // previous rows stay as placeholderData until the new page 0 arrives
  // (keepPreviousData). Only the very first load (no prior rows) may set
  // isInitialLoading and clear the page cache visually.
  useEffect(() => {
    setClientPages(1);
    if (!enabled || !loadPageRef.current) {
      return;
    }
    const generation = ++generationRef.current;
    cacheRef.current = new Map();
    resolvedRef.current = new Map();
    appendPendingRef.current = false;
    setExhausted(false);
    setIsAppending(false);
    const keepPlaceholder = hasLoadedRef.current;
    if (keepPlaceholder) {
      setIsFetching(true);
      setIsPlaceholderData(true);
    } else {
      setPages([]);
      setTotalCount(undefined);
      setIsInitialLoading(true);
      setIsFetching(false);
      setIsPlaceholderData(false);
    }
    ensurePage(0)
      .then((result) => {
        if (generation !== generationRef.current) {
          return;
        }
        setPages([result.rows]);
        if (result.totalCount != null) {
          setTotalCount(result.totalCount);
        }
        const done = isLastPage(result, 1, queryRef.current.pageSize);
        setExhausted(done);
        hasLoadedRef.current = true;
        setIsInitialLoading(false);
        setIsFetching(false);
        setIsPlaceholderData(false);
        // Prefetch-ahead: page 1 starts loading while the user views page 0.
        if (!done) {
          void ensurePage(1);
        }
      })
      .catch(() => {
        if (generation !== generationRef.current) {
          return;
        }
        setIsInitialLoading(false);
        setIsFetching(false);
      });
  }, [enabled, isLoaderMode, queryKey, ensurePage]);

  const rows = useMemo(() => pages.flat(), [pages]);
  const rowsLoadedRef = useRef(0);
  rowsLoadedRef.current = rows.length;
  const pagesLoadedRef = useRef(0);
  pagesLoadedRef.current = pages.length;
  const exhaustedRef = useRef(false);
  exhaustedRef.current = exhausted;
  const initialLoadingRef = useRef(false);
  initialLoadingRef.current = isInitialLoading;

  const loadMore = useCallback(() => {
    if (!enabled || !loadPageRef.current) {
      return;
    }
    if (exhaustedRef.current || initialLoadingRef.current || appendPendingRef.current) {
      return;
    }
    const generation = generationRef.current;
    const nextPage = pagesLoadedRef.current;
    appendPendingRef.current = true;

    const appendResult = (result: PageLoadResult<TData>) => {
      appendPendingRef.current = false;
      setIsAppending(false);
      setPages((prev) => {
        if (prev.length !== nextPage) {
          return prev;
        }
        return [...prev, result.rows];
      });
      if (result.totalCount != null) {
        setTotalCount(result.totalCount);
      }
      const done = isLastPage(result, nextPage + 1, queryRef.current.pageSize);
      if (done) {
        setExhausted(true);
      } else {
        // Keep one page ahead of the viewport.
        void ensurePage(nextPage + 1);
      }
    };

    // Prefetched and resolved — append synchronously, no tail skeleton.
    const resolved = resolvedRef.current.get(nextPage);
    if (resolved) {
      appendResult(resolved);
      return;
    }

    // Cache miss or prefetch still in flight — honest loading affordance.
    setIsAppending(true);
    ensurePage(nextPage)
      .then((result) => {
        if (generation !== generationRef.current) {
          return;
        }
        appendResult(result);
      })
      .catch(() => {
        if (generation !== generationRef.current) {
          return;
        }
        appendPendingRef.current = false;
        setIsAppending(false);
      });
  }, [enabled, ensurePage]);

  return {
    isLoaderMode,
    rows,
    loadedPages: isLoaderMode ? pages.length : clientPages,
    totalCount,
    exhausted,
    isInitialLoading,
    isFetching,
    isPlaceholderData,
    isAppending,
    loadMore,
    loadMoreClient,
  };
}

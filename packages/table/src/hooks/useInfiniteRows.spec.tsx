/**
 * useInfiniteRows — accumulation + prefetch engine specs.
 *
 * Covers the infinite pagination contract:
 * - page 0 load prefetches page 1 while the user is still viewing page 0
 * - loadMore appends synchronously from the prefetch cache (no skeleton)
 * - a cache miss / in-flight prefetch flags isAppending (honest tail state)
 * - sorting/filter/search/pageSize changes reset accumulation + cache
 * - short last page / totalCount exhaustion stops further prefetch
 * - client mode reveals chunks and clamps at the row-model count
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PageLoadQuery, PageLoadResult } from '../types';

import { useInfiniteRows } from './useInfiniteRows';

interface Row {
  id: number;
}

const ROWS: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));

function makeInstantLoader(all: Row[] = ROWS, totalCount = all.length) {
  return vi.fn(async (query: PageLoadQuery): Promise<PageLoadResult<Row>> => {
    const start = query.pageIndex * query.pageSize;
    return { rows: all.slice(start, start + query.pageSize), totalCount };
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const baseQuery = {
  enabled: true,
  pageSize: 20,
  sorting: [] as any[],
  filters: [] as any[],
  columnFilters: [] as any[],
  globalFilter: '',
};

describe(useInfiniteRows, () => {
  describe('loader mode prefetch', () => {
    it('loads page 0 and prefetches page 1 while page 0 is on screen', async () => {
      const loader = makeInstantLoader();
      const { result } = renderHook(() => useInfiniteRows<Row>({ ...baseQuery, loadPage: loader }));

      expect(result.current.isLoaderMode).toBe(true);
      await waitFor(() => {
        expect(result.current.rows).toHaveLength(20);
      });

      // Only page 0 is appended, but page 1 was already requested.
      expect(result.current.loadedPages).toBe(1);
      const requested = loader.mock.calls.map(([q]) => q.pageIndex);
      expect(requested).toEqual([0, 1]);
      expect(result.current.totalCount).toBe(100);
      expect(result.current.exhausted).toBe(false);
    });

    it('appends instantly from the prefetch cache and prefetches the next page', async () => {
      const loader = makeInstantLoader();
      const { result } = renderHook(() => useInfiniteRows<Row>({ ...baseQuery, loadPage: loader }));
      await waitFor(() => {
        expect(result.current.rows).toHaveLength(20);
      });
      // Let the page-1 prefetch resolve into the cache.
      await act(async () => {});

      act(() => {
        result.current.loadMore();
      });

      // Synchronous append (no extra loader call for page 1); page 2 prefetched.
      expect(result.current.rows).toHaveLength(40);
      expect(result.current.isAppending).toBe(false);
      const requested = loader.mock.calls.map(([q]) => q.pageIndex);
      expect(requested).toEqual([0, 1, 2]);
    });

    it('flags isAppending while a slow prefetch is still in flight', async () => {
      const deferreds = new Map<number, ReturnType<typeof deferred<PageLoadResult<Row>>>>();
      const loader = vi.fn(async (query: PageLoadQuery) => {
        const d = deferred<PageLoadResult<Row>>();
        deferreds.set(query.pageIndex, d);
        return d.promise;
      });
      const { result } = renderHook(() => useInfiniteRows<Row>({ ...baseQuery, loadPage: loader }));

      expect(result.current.isInitialLoading).toBe(true);
      await act(async () => {
        deferreds.get(0)!.resolve({ rows: ROWS.slice(0, 20), totalCount: 100 });
      });
      expect(result.current.rows).toHaveLength(20);
      expect(result.current.isInitialLoading).toBe(false);
      // Prefetch for page 1 started but has NOT resolved.
      expect(deferreds.has(1)).toBe(true);

      act(() => {
        result.current.loadMore();
      });
      expect(result.current.isAppending).toBe(true);
      expect(result.current.rows).toHaveLength(20);

      await act(async () => {
        deferreds.get(1)!.resolve({ rows: ROWS.slice(20, 40), totalCount: 100 });
      });
      expect(result.current.isAppending).toBe(false);
      expect(result.current.rows).toHaveLength(40);
    });

    it('resets accumulation and cache when sorting changes', async () => {
      const loader = makeInstantLoader();
      const { result, rerender } = renderHook(
        ({ sorting }: { sorting: any[] }) => useInfiniteRows<Row>({ ...baseQuery, sorting, loadPage: loader }),
        { initialProps: { sorting: [] as any[] } },
      );
      await waitFor(() => {
        expect(result.current.rows).toHaveLength(20);
      });
      await act(async () => {});
      act(() => {
        result.current.loadMore();
      });
      expect(result.current.rows).toHaveLength(40);

      loader.mockClear();
      rerender({ sorting: [{ id: 'id', desc: true }] });

      // Back to page 0 for the new query; fresh prefetch of page 1.
      await waitFor(() => {
        expect(result.current.loadedPages).toBe(1);
      });
      expect(result.current.rows).toHaveLength(20);
      const requested = loader.mock.calls.map(([q]) => q.pageIndex);
      expect(requested).toEqual([0, 1]);
      expect(loader.mock.calls[0][0].sorting).toEqual([{ id: 'id', desc: true }]);
    });

    it('keeps previous rows on screen while a new query is in flight (keepPreviousData)', async () => {
      const deferreds = new Map<string, ReturnType<typeof deferred<PageLoadResult<Row>>>>();
      const loader = vi.fn(async (query: PageLoadQuery) => {
        const d = deferred<PageLoadResult<Row>>();
        deferreds.set(`${query.globalFilter ?? ''}:${query.pageIndex}`, d);
        return d.promise;
      });
      const { result, rerender } = renderHook(
        ({ globalFilter }: { globalFilter: string }) =>
          useInfiniteRows<Row>({ ...baseQuery, globalFilter, loadPage: loader }),
        { initialProps: { globalFilter: '' } },
      );

      await act(async () => {
        deferreds.get(':0')!.resolve({ rows: ROWS.slice(0, 20), totalCount: 100 });
      });
      expect(result.current.rows).toHaveLength(20);
      expect(result.current.isInitialLoading).toBe(false);

      rerender({ globalFilter: 'abc' });

      // DURING the gap: previous rows stay, no initial-load teardown.
      expect(result.current.rows).toHaveLength(20);
      expect(result.current.rows[0].id).toBe(1);
      expect(result.current.isInitialLoading).toBe(false);
      expect(result.current.isFetching).toBe(true);
      expect(result.current.isPlaceholderData).toBe(true);

      await act(async () => {
        deferreds.get('abc:0')!.resolve({ rows: ROWS.slice(40, 60), totalCount: 100 });
      });
      expect(result.current.rows).toHaveLength(20);
      expect(result.current.rows[0].id).toBe(41);
      expect(result.current.isFetching).toBe(false);
      expect(result.current.isPlaceholderData).toBe(false);
    });

    it('resets when the global filter changes', async () => {
      const loader = makeInstantLoader();
      const { result, rerender } = renderHook(
        ({ globalFilter }: { globalFilter: string }) =>
          useInfiniteRows<Row>({ ...baseQuery, globalFilter, loadPage: loader }),
        { initialProps: { globalFilter: '' } },
      );
      await waitFor(() => {
        expect(result.current.rows).toHaveLength(20);
      });
      loader.mockClear();

      rerender({ globalFilter: 'abc' });
      await waitFor(() => {
        expect(loader.mock.calls.some(([q]) => q.globalFilter === 'abc' && q.pageIndex === 0)).toBe(true);
      });
      await waitFor(() => {
        expect(result.current.loadedPages).toBe(1);
      });
    });

    it('marks exhausted on a short last page and stops prefetching', async () => {
      const short = ROWS.slice(0, 30); // 20 + 10 with pageSize 20
      const loader = makeInstantLoader(short, 30);
      const { result } = renderHook(() => useInfiniteRows<Row>({ ...baseQuery, loadPage: loader }));
      await waitFor(() => {
        expect(result.current.rows).toHaveLength(20);
      });
      await act(async () => {});

      act(() => {
        result.current.loadMore();
      });
      expect(result.current.rows).toHaveLength(30);
      expect(result.current.exhausted).toBe(true);

      // No page-2 request: last page was short.
      const requested = loader.mock.calls.map(([q]) => q.pageIndex);
      expect(requested).toEqual([0, 1]);
      act(() => {
        result.current.loadMore();
      });
      expect(requested).toEqual([0, 1]);
    });

    it('marks exhausted when totalCount is reached exactly at a page boundary', async () => {
      const exact = ROWS.slice(0, 40); // exactly two pages of 20
      const loader = makeInstantLoader(exact, 40);
      const { result } = renderHook(() => useInfiniteRows<Row>({ ...baseQuery, loadPage: loader }));
      await waitFor(() => {
        expect(result.current.rows).toHaveLength(20);
      });
      await act(async () => {});
      act(() => {
        result.current.loadMore();
      });
      expect(result.current.rows).toHaveLength(40);
      expect(result.current.exhausted).toBe(true);
    });
  });

  describe('client mode', () => {
    it('reveals chunks and clamps at the row-model count', () => {
      const { result } = renderHook(() => useInfiniteRows<Row>({ ...baseQuery }));
      expect(result.current.isLoaderMode).toBe(false);
      expect(result.current.loadedPages).toBe(1);

      act(() => {
        result.current.loadMoreClient(50);
      });
      expect(result.current.loadedPages).toBe(2);
      act(() => {
        result.current.loadMoreClient(50);
      });
      expect(result.current.loadedPages).toBe(3);
      // 3 * 20 = 60 >= 50 — exhausted, no further reveal.
      act(() => {
        result.current.loadMoreClient(50);
      });
      expect(result.current.loadedPages).toBe(3);
    });

    it('resets revealed chunks when the query changes', () => {
      const { result, rerender } = renderHook(
        ({ globalFilter }: { globalFilter: string }) => useInfiniteRows<Row>({ ...baseQuery, globalFilter }),
        { initialProps: { globalFilter: '' } },
      );
      act(() => {
        result.current.loadMoreClient(100);
      });
      expect(result.current.loadedPages).toBe(2);
      rerender({ globalFilter: 'x' });
      expect(result.current.loadedPages).toBe(1);
    });

    it('does nothing when disabled', () => {
      const { result } = renderHook(() => useInfiniteRows<Row>({ ...baseQuery, enabled: false }));
      act(() => {
        result.current.loadMoreClient(100);
      });
      expect(result.current.loadedPages).toBe(1);
    });
  });
});

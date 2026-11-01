/**
 * Hook that bridges Frappe's VirtualPageManager cursor-based pagination
 * to the generic `onLoadMore` / `hasMore` interface expected by
 * view components like `List` from `@repo/ui`.
 *
 * Usage:
 * ```tsx
 * const { items, isLoading, onLoadMore, hasMore } = useFrappePagination<TDoc>(
 *   connectionConfig,
 *   doctype,
 *   { fields, filters, pageSize: 20 },
 * );
 * return <List items={items} onLoadMore={onLoadMore} hasMore={hasMore} />;
 * ```
 *
 * The read itself is {@link useFrappeRows} (MPO-251), so FrappeList shares
 * the one implementation every other doctype view uses. On top of it this
 * hook manages an increasing `limit` over the rows it returns. When the
 * number of returned items equals the limit, `hasMore` is `true`. Calling
 * `onLoadMore` increases the limit by `pageSize`.
 */

import type { UseFrappeCollectionConfig } from '@repo/frappe';
import { useCallback, useMemo, useState } from 'react';

import { useFrappeRows } from './use-frappe-rows';
import type { UseFrappeRowsOptions } from './use-frappe-rows';

export interface UseFrappePaginationOptions<TDoc> {
  fields?: readonly (keyof TDoc & string)[];
  filters?: Partial<TDoc> | [keyof TDoc & string, string, unknown][];
  pageSize?: number;
  /**
   * Rows the subscription reads. Omitted, the bench's own page length
   * applies (20 on a stock site), which truncates any longer list.
   */
  limit?: number;
  orderBy?: UseFrappeRowsOptions<TDoc>['orderBy'];
  /**
   * Rows a route loader rendered on the server for this same query. They
   * stand in until the live collection's first sync lands, so the server
   * page and the hydrated page match; the live rows replace them after.
   */
  initialRows?: readonly TDoc[];
}

export interface UseFrappePaginationResult<TDoc> {
  items: TDoc[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  /** Current fetch limit (for debugging / display). */
  limit: number;
  /** Reset back to the first page. */
  reset: () => void;
  /**
   * Initial-load failure (permission/network) surfaced by the sync layer.
   * Null while healthy — consumers must render an honest error state
   * instead of an empty list when set.
   */
  error: Error | null;
}

const defaultPageSize = 20;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives whatever the sync layer threw; normalised to an Error here
const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

type OrderBy<TDoc> = NonNullable<UseFrappeRowsOptions<TDoc>['orderBy']>;

/** Row order for an `orderBy`, missing values last, the way the bench sorts a page. */
const compareRows =
  <TDoc>(orderBy: OrderBy<TDoc>) =>
  (a: TDoc, b: TDoc): number => {
    for (const { field, order } of orderBy) {
      // SAFETY: `field` is `keyof TDoc & string`, so indexing the row by it reads that field's (unknown) value
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- see SAFETY above
      const left = (a as Record<string, unknown>)[field];
      // SAFETY: same as above for the right-hand row
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- see SAFETY above
      const right = (b as Record<string, unknown>)[field];
      if (left === right) {
        continue;
      }
      if (left === null || left === undefined) {
        return 1;
      }
      if (right === null || right === undefined) {
        return -1;
      }
      const compared =
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- row field values are untyped wire values; numbers sort numerically, everything else lexically
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : // oxlint-disable-next-line typescript/no-base-to-string -- sort keys are scalar doc fields; stringifying is the bench's lexical order
            String(left).localeCompare(String(right));
      if (compared !== 0) {
        return order.toLowerCase() === 'desc' ? -compared : compared;
      }
    }
    return 0;
  };

export const useFrappePagination = <TDoc extends { name: string; doctype: string }>(
  config: UseFrappeCollectionConfig | undefined,
  doctype: string,
  options?: UseFrappePaginationOptions<TDoc>,
): UseFrappePaginationResult<TDoc> => {
  const pageSize = options?.pageSize ?? defaultPageSize;
  const [limit, setLimit] = useState(pageSize);

  // `limit: null` keeps the subscription on the bench's own page length, as
  // it was before the shared read; `mapError` hands FrappeList the raw sync
  // failure its isPermissionError check reads.
  const {
    rows: liveRows,
    isLoading: isReading,
    isQueryLoading,
    syncError: error,
  } = useFrappeRows<TDoc>(config, doctype, {
    fields: options?.fields,
    filters: options?.filters,
    orderBy: options?.orderBy,
    limit: options?.limit ?? null,
    mapError: toError,
  });

  // The collection holds rows by name, whatever order the page was read in,
  // so an ordered read is put back in its order here.
  const orderBy = options?.orderBy;
  const liveItems = useMemo(
    () => (orderBy !== undefined && orderBy.length > 0 ? liveRows.toSorted(compareRows(orderBy)) : liveRows),
    [liveRows, orderBy],
  );

  // The server-rendered page holds until the first sync answers, and past a
  // failed one: rows the visitor already sees never give way to an empty
  // list. SSR and the hydration pass have no collection, so both render it.
  const seed = options?.initialRows;
  const seeded = Boolean(seed?.length) && (isReading || (error !== null && liveItems.length === 0));
  const allItems: readonly TDoc[] = seeded && seed !== undefined ? seed : liveItems;
  const isLoading = isQueryLoading && !seeded;

  // Slice to the current limit (progressive disclosure)
  const items = useMemo(() => allItems.slice(0, limit), [allItems, limit]);

  // If the total data available equals or exceeds the limit, there might
  // be more to load. If the sync layer has fetched all available docs and
  // they're fewer than the limit, hasMore is false.
  const hasMore = allItems.length >= limit;

  const onLoadMore = useCallback(() => {
    setLimit((prev) => prev + pageSize);
  }, [pageSize]);

  const reset = useCallback(() => {
    setLimit(pageSize);
  }, [pageSize]);

  return { items, isLoading, hasMore, onLoadMore, limit, reset, error: seeded ? null : error };
};

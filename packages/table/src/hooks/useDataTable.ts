import { useSearchParams, useUrlState as useUrlStateFromRouter } from '@repo/router';
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type {
  ColumnDef,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ExpandedState,
  GroupingState,
  PaginationState,
  VisibilityState,
} from '@tanstack/react-table';

import { useTableSelection } from './useTableSelection';

const useUrlState: typeof useUrlStateFromRouter = useUrlStateFromRouter;

// URL State Strategy Interface

export interface UrlStateStrategy {
  getState: <T extends Record<string, any>>(
    defaultValue: T,
  ) => [T, (value: Partial<T> | ((prev: T) => Partial<T>) | T | ((prev: T) => T)) => void];
  debounceMs?: number;
}

// Default OneStack strategy
const createOneStackUrlStrategy = (debounceMs?: number): UrlStateStrategy => ({
  getState: <T extends Record<string, any>>(defaultValue: T) => useUrlState(defaultValue, { debounceMs }),
  debounceMs,
});

// React Router strategy
const createReactRouterUrlStrategy = (useSearchParams: any, debounceMs?: number): UrlStateStrategy => ({
  getState: <T extends Record<string, any>>(defaultValue: T) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const getValueFromUrl = () => {
      try {
        const serialized = searchParams.get('tableState');
        if (!serialized) {
          return defaultValue;
        }

        return JSON.parse(decodeURIComponent(serialized));
      } catch (error) {
        console.warn('Failed to parse table state from URL:', error);
        return defaultValue;
      }
    };

    const [state, _setState] = React.useState<T>(getValueFromUrl());

    const updateUrl = React.useCallback(
      (newState: Partial<T> | ((prev: T) => Partial<T>)) => {
        try {
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.set('tableState', encodeURIComponent(JSON.stringify(newState)));
          setSearchParams(newSearchParams);
        } catch (error) {
          console.warn('Failed to update URL with table state:', error);
        }
      },
      [searchParams, setSearchParams],
    );

    return [state, updateUrl];
  },
  debounceMs,
});

// Next.js App Router strategy
const createNextJsAppRouterStrategy = (
  useSearchParams: any,
  useRouter: any,
  debounceMs?: number,
): UrlStateStrategy => ({
  getState: <T extends Record<string, any>>(defaultValue: T) => {
    const searchParams = useSearchParams();
    const router = useRouter();

    const getValueFromUrl = () => {
      try {
        const serialized = searchParams.get('tableState');
        if (!serialized) {
          return defaultValue;
        }

        return JSON.parse(decodeURIComponent(serialized));
      } catch (error) {
        console.warn('Failed to parse table state from URL:', error);
        return defaultValue;
      }
    };

    const [state, _setState] = React.useState<T>(getValueFromUrl());

    const updateUrl = React.useCallback(
      (newState: Partial<T> | ((prev: T) => Partial<T>)) => {
        try {
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.set('tableState', encodeURIComponent(JSON.stringify(newState)));
          router.replace(`?${newSearchParams.toString()}`, { scroll: false });
        } catch (error) {
          console.warn('Failed to update URL with table state:', error);
        }
      },
      [searchParams, router],
    );

    return [state, updateUrl];
  },
  debounceMs,
});

// Universal strategy (works everywhere)
const createUniversalUrlStrategy = (debounceMs?: number): UrlStateStrategy => ({
  getState: <T extends Record<string, any>>(defaultValue: T) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const state = React.useMemo<T>(() => {
      try {
        const serialized = searchParams.tableState;
        if (serialized && typeof serialized === 'string') {
          return JSON.parse(decodeURIComponent(serialized));
        }
      } catch (error) {
        console.warn('Failed to parse table state from URL:', error);
      }
      return defaultValue;
    }, [searchParams]);

    const updateUrl = React.useCallback(
      (newState: Partial<T> | ((prev: T) => Partial<T>)) => {
        try {
          setSearchParams({ tableState: encodeURIComponent(JSON.stringify(newState)) }, { replace: true, debounceMs });
        } catch (error) {
          console.warn('Failed to update URL with table state:', error);
        }
      },
      [setSearchParams],
    );

    return [state, updateUrl];
  },
  debounceMs,
});

// Strategy Factory

export const createUrlStrategy = {
  oneStack: createOneStackUrlStrategy,
  reactRouter: (useSearchParams: any, debounceMs?: number) => createReactRouterUrlStrategy(useSearchParams, debounceMs),
  nextJs: (useSearchParams: any, useRouter: any, debounceMs?: number) =>
    createNextJsAppRouterStrategy(useSearchParams, useRouter, debounceMs),
  universal: createUniversalUrlStrategy,
  custom: (strategy: UrlStateStrategy) => strategy,
};

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';

import type {
  DataTableColumn,
  DataTableData,
  DataTableField,
  DataTableInfiniteState,
  DataTableState,
  UseDataTableOptions,
  UseDataTableReturn,
} from '../types';
import { applyFiltersToData, getFilterFieldType, isFilterValueShape, resolveFilterFields } from '../utils/filterFields';
import { applyFilterToValue } from '../utils/filterUtils';
import { moneyComparator } from '../utils/money';
import { DEFAULT_PAGE_SIZE } from '../utils/paginationDefaults';
import { accumulateRows } from '../utils/rowAccumulator';
import { deserializeTableState, serializeTableState } from '../utils/urlStateUtils';

import { useInfiniteRows } from './useInfiniteRows';
import { useTableFiltering } from './useTableFiltering';
import { useTableSorting } from './useTableSorting';
import { useTableViews } from './useTableViews';

/**
 * TanStack sort for a `money` column: exact decimal-string ordering, so
 * "9.00" sorts below "10.00" (MPO-252).
 */
const moneySortingFn = (rowA: any, rowB: any, columnId: string): number =>
  moneyComparator(rowA.getValue(columnId), rowB.getValue(columnId));

function normalizeColumnWidths<TData extends DataTableData>(column: ColumnDef<TData>): ColumnDef<TData> {
  if ('columns' in column && column.columns) {
    const children = column.columns.map(normalizeColumnWidths);
    return children.some((child, index) => child !== column.columns?.[index])
      ? { ...column, columns: children }
      : column;
  }
  const { width, minWidth, maxWidth } = column as DataTableColumn<TData>;
  const validWidth = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const sizing = {
    ...(column.size === undefined && validWidth(width) ? { size: width } : {}),
    ...(column.minSize === undefined && validWidth(minWidth) ? { minSize: minWidth } : {}),
    ...(column.maxSize === undefined && validWidth(maxWidth) ? { maxSize: maxWidth } : {}),
  };
  return Object.keys(sizing).length ? { ...column, ...sizing } : column;
}

// TanStack keys an id-less column by its accessorKey (dots folded to "_"),
// then by a string header; a seeded order must use that same key or the
// column falls behind every matched one.
function columnOrderKey<TData extends DataTableData>(column: ColumnDef<TData>, index: number): string {
  if (column.id) {
    return column.id;
  }
  const { accessorKey, header } = column as { accessorKey?: unknown; header?: unknown };
  if (typeof accessorKey === 'string' && accessorKey) {
    return accessorKey.replace(/\./g, '_');
  }
  if (typeof header === 'string' && header) {
    return header;
  }
  return String(index);
}

export function useDataTable<TData extends DataTableData = DataTableData>({
  data = [],
  columns = [],
  initialState,
  controlledState,
  onStateChange,
  syncWithUrl = false,
  urlDebounceMs = 500,
  urlStrategy,
  manualFiltering = false,
  manualPagination = false,
  manualSorting = false,
  enableFiltering = true,
  filterableFields,
  enableSorting = true,
  enablePagination: _enablePagination = true,
  paginationMode = 'pages',
  loadPage,
  rowAccumulator,
  enableColumnVisibility = true,
  enableColumnOrdering: _enableColumnOrdering = false,
  enableColumnResizing = false,
  enableGlobalSearch = true,
  enableViews: _enableViews = false,
  enableRowExpansion = false,
  getSubRows,
  enableColumnPinning = false,
  enableGrouping = false,
  enableRowSelection = false,
  rowCount,
  pageCount,
  isLoading: isLoadingProp,
  isFetching: isFetchingProp,
}: UseDataTableOptions<TData> & {
  urlStrategy?: UrlStateStrategy;
} = {}): UseDataTableReturn<TData> {
  // ---- Default State ----

  const defaultTableState: Partial<DataTableState> = {
    pagination: {
      pageIndex: 0,
      pageSize: DEFAULT_PAGE_SIZE,
    },
    sorting: [],
    filters: [],
    columnFilters: [],
    globalFilter: '',
    columnVisibility: {},
    columnOrder: columns.map((column, index) => columnOrderKey(column, index)),
    columnSizing: {},
    views: [],
    ...initialState,
  };

  // ---- URL State ----

  const urlStateStrategy = urlStrategy ?? createUrlStrategy.oneStack(urlDebounceMs);

  const [urlState, setUrlState] = syncWithUrl
    ? urlStateStrategy.getState(serializeTableState(defaultTableState))
    : [serializeTableState(defaultTableState), () => {}];

  const deserializedState = useMemo(() => deserializeTableState(urlState), [urlState]);

  // ---- Feature Hooks: Filtering ----

  const filtering = useTableFiltering({
    enableFiltering,
    manualFiltering,
    initialFilters: deserializedState.filters ?? defaultTableState.filters!,
    initialColumnFilters: deserializedState.columnFilters ?? defaultTableState.columnFilters!,
    initialGlobalFilter: deserializedState.globalFilter ?? defaultTableState.globalFilter!,
  });

  // ---- Feature Hooks: Sorting ----

  const sortingHook = useTableSorting({
    enableSorting,
    manualSorting,
    initialSorting: deserializedState.sorting ?? defaultTableState.sorting!,
  });

  // ---- Feature Hooks: Views ----

  const viewsHook = useTableViews({
    initialViews: deserializedState.views ?? defaultTableState.views!,
    initialActiveViewId: deserializedState.activeViewId ?? defaultTableState.activeViewId,
  });

  // ---- Pagination State ----

  const [pagination, setPagination] = useState<PaginationState>(
    deserializedState.pagination ?? defaultTableState.pagination!,
  );

  // ---- Controlled-state adoption (keep-rows reconcile channel) ----
  //
  // Adopts INBOUND filter/sort content changes in place — the no-remount
  // alternative to keying the table on a filter generation. Adoption is
  // content-keyed (JSON) against the last ADOPTED content, not live state,
  // so internal chrome changes (header sort clicks) are never fought; a
  // same-content echo from the outer surface is a no-op. Adoption resets
  // the page to 0, matching a filter/sort change made through the table's
  // own chrome.
  const controlledFiltersKey =
    controlledState?.filters === undefined ? undefined : JSON.stringify(controlledState.filters);
  const controlledSortingKey =
    controlledState?.sorting === undefined ? undefined : JSON.stringify(controlledState.sorting);
  const adoptedFiltersRef = useRef(controlledFiltersKey);
  const adoptedSortingRef = useRef(controlledSortingKey);
  useEffect(() => {
    if (controlledFiltersKey === undefined) {
      return;
    }
    if (adoptedFiltersRef.current === controlledFiltersKey) {
      return;
    }
    adoptedFiltersRef.current = controlledFiltersKey;
    filtering.setFilters(JSON.parse(controlledFiltersKey));
    setPagination((previous) => (previous.pageIndex === 0 ? previous : { ...previous, pageIndex: 0 }));
    // oxlint-disable-next-line exhaustive-deps -- content key IS the dependency
  }, [controlledFiltersKey]);
  useEffect(() => {
    if (controlledSortingKey === undefined) {
      return;
    }
    if (adoptedSortingRef.current === controlledSortingKey) {
      return;
    }
    adoptedSortingRef.current = controlledSortingKey;
    sortingHook.setSorting(JSON.parse(controlledSortingKey));
    setPagination((previous) => (previous.pageIndex === 0 ? previous : { ...previous, pageIndex: 0 }));
    // oxlint-disable-next-line exhaustive-deps -- content key IS the dependency
  }, [controlledSortingKey]);

  // ---- Column Management State ----

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    deserializedState.columnVisibility ?? defaultTableState.columnVisibility!,
  );

  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    deserializedState.columnOrder ?? defaultTableState.columnOrder!,
  );

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    deserializedState.columnSizing ?? defaultTableState.columnSizing!,
  );

  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [grouping, setGrouping] = useState<GroupingState>([]);

  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: [], right: [] });

  const selection = useTableSelection();

  // ---- Infinite pagination (paginationMode="infinite") ----

  const infiniteEnabled = paginationMode === 'infinite';
  const isLoaderMode = infiniteEnabled && loadPage != null;

  const infiniteRows = useInfiniteRows<TData>({
    enabled: infiniteEnabled,
    loadPage,
    pageSize: pagination.pageSize,
    sorting: sortingHook.sorting,
    filters: filtering.advancedFilters,
    columnFilters: filtering.columnFilters,
    globalFilter: filtering.globalFilter,
  });

  // Loader mode: accumulated pages replace the data prop; rows arrive
  // pre-filtered/sorted, so manual modes are forced on. In infinite mode the
  // pagination row model is never applied (rows accumulate instead of slice).
  const effectiveData = isLoaderMode ? infiniteRows.rows : data;

  // ---- Row accumulator (MPO-250) ----
  //
  // The fold runs HERE — over the whole row set, before the advanced filters
  // below and before TanStack's filter/sort/paginate models — because a
  // derived column like a running balance depends on every row before it and
  // would restart on page two otherwise. `order` (when given) is also the
  // order the rows reach the table in: a fold order is the order its column
  // reads down. Sorting on another column reorders for display and does NOT
  // refold; see the contract on RowAccumulator.
  const { rows: accumulatedData, total: foldTotal } = useMemo(
    () => accumulateRows(effectiveData, rowAccumulator),
    [effectiveData, rowAccumulator],
  );

  const effectiveManualFiltering = manualFiltering || isLoaderMode;
  const effectiveManualSorting = manualSorting || isLoaderMode;
  const effectiveManualPagination = manualPagination || infiniteEnabled;

  // ---- Filterable Fields (visible columns + declared hidden fields) ----

  const filterFields = useMemo(
    () => resolveFilterFields(columns as any, filterableFields),
    [columns, filterableFields],
  );

  // Advanced filters apply BEFORE TanStack so they work on any row-data key,
  // including hidden / non-column fields. Server-side tables (manualFiltering)
  // map the same filters to query params instead.
  const preFilteredData = useMemo(() => {
    if (effectiveManualFiltering) {
      return accumulatedData;
    }
    return applyFiltersToData(accumulatedData, filtering.advancedFilters, filterFields);
  }, [accumulatedData, effectiveManualFiltering, filtering.advancedFilters, filterFields]);

  // Column-funnel filters store FilterValue objects ({operator, value}) —
  // interpret them with the shared operator semantics instead of TanStack's
  // string auto-filter (which stringifies objects).
  const operatorFilterFn = useCallback(
    (row: any, columnId: string, filterValue: any) => {
      if (filterValue == null || filterValue === '') {
        return true;
      }
      if (isFilterValueShape(filterValue)) {
        const type = getFilterFieldType(filterFields, columnId);
        return applyFilterToValue(row.getValue(columnId), filterValue, type === 'select' ? 'text' : type);
      }
      if (Array.isArray(filterValue)) {
        return filterValue.length === 0 || filterValue.includes(row.getValue(columnId));
      }
      return String(row.getValue(columnId) ?? '')
        .toLowerCase()
        .includes(String(filterValue).toLowerCase());
    },
    [filterFields],
  );

  // ---- URL State Synchronization ----

  useEffect(() => {
    if (!syncWithUrl) {
      return;
    }

    const currentState: Partial<DataTableState> = {
      pagination,
      sorting: sortingHook.sorting,
      columnFilters: filtering.columnFilters,
      globalFilter: filtering.globalFilter,
      columnVisibility,
      columnOrder,
      columnSizing,
      filters: filtering.advancedFilters,
      views: viewsHook.views,
      activeViewId: viewsHook.activeViewId,
    };

    const serialized = serializeTableState(currentState);
    setUrlState(serialized);
  }, [
    syncWithUrl,
    pagination,
    sortingHook.sorting,
    filtering.columnFilters,
    filtering.globalFilter,
    columnVisibility,
    columnOrder,
    columnSizing,
    filtering.advancedFilters,
    viewsHook.views,
    viewsHook.activeViewId,
    setUrlState,
  ]);

  // ---- TanStack Table Configuration ----

  const getRowId = useCallback((row: TData, index: number) => {
    if (row && typeof row === 'object' && 'id' in row && (row as any).id != null) {
      return String((row as any).id);
    }
    return String(index);
  }, []);

  // Map the package column aliases onto TanStack's per-column switches:
  // `sortable`/`filterable` were documented API but previously reached no
  // TanStack option, so `sortable: false` columns still rendered a live sort
  // header (caret, tab stop, aria-sort) — chrome asserting an interaction
  // the column declined (Axiom 6 HONEST STATE). Explicit TanStack props win.
  const normalizedColumns = useMemo(
    () =>
      columns.map((inputColumn) => {
        const column = normalizeColumnWidths(inputColumn);
        const { sortable, filterable, field } = column as {
          sortable?: boolean;
          filterable?: boolean;
          field?: DataTableField;
        };
        // A money column holds a decimal STRING, and TanStack's auto sort
        // would compare it as text — "9.00" above "10.00", silently wrong on
        // every amount column (MPO-252). Give it the exact comparator so
        // `sortable: true` is safe to turn on. An explicit sortingFn wins.
        const needsMoneySort = field === 'money' && column.sortingFn === undefined;
        if (sortable === undefined && filterable === undefined && !needsMoneySort) {
          return column;
        }
        return {
          ...column,
          ...(needsMoneySort ? { sortingFn: moneySortingFn } : {}),
          ...(sortable !== undefined && column.enableSorting === undefined ? { enableSorting: sortable } : {}),
          ...(filterable !== undefined && column.enableColumnFilter === undefined
            ? { enableColumnFilter: filterable }
            : {}),
        };
      }),
    [columns],
  );

  const table = useReactTable({
    data: preFilteredData,
    columns: normalizedColumns as ColumnDef<TData>[],
    defaultColumn: { filterFn: operatorFilterFn as any },
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: enableRowExpansion ? getExpandedRowModel() : undefined,
    // TanStack getSubRows receives the ORIGINAL data object (not a Row), so
    // reading `.original` here always yielded undefined — every row reported
    // getCanExpand() === false and the expansion caret column never rendered.
    getSubRows: getSubRows ? (originalRow) => getSubRows(originalRow) : (originalRow) => (originalRow as any)?.subRows,
    getRowId,

    state: {
      pagination,
      sorting: sortingHook.sorting,
      columnFilters: filtering.columnFilters,
      globalFilter: filtering.globalFilter,
      columnVisibility,
      columnOrder,
      columnSizing,
      ...(enableRowExpansion ? { expanded } : {}),
      ...(enableColumnPinning ? { columnPinning } : {}),
      ...(enableGrouping ? { grouping } : {}),
      ...(enableRowSelection ? { rowSelection: selection.rowSelection } : {}),
    },

    onPaginationChange: setPagination,
    onSortingChange: sortingHook.setSorting,
    onColumnFiltersChange: filtering.setColumnFilters,
    onGlobalFilterChange: filtering.setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    ...(enableRowExpansion ? { onExpandedChange: setExpanded } : {}),
    ...(enableColumnPinning ? { onColumnPinningChange: setColumnPinning } : {}),
    ...(enableGrouping ? { onGroupingChange: setGrouping } : {}),
    ...(enableRowSelection ? { onRowSelectionChange: selection.setRowSelection } : {}),

    getFilteredRowModel: effectiveManualFiltering ? undefined : getFilteredRowModel(),
    getPaginationRowModel: effectiveManualPagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: effectiveManualSorting ? undefined : getSortedRowModel(),
    getGroupedRowModel: enableGrouping ? getGroupedRowModel() : undefined,
    getFacetedRowModel: enableFiltering ? getFacetedRowModel() : undefined,
    getFacetedUniqueValues: enableFiltering ? getFacetedUniqueValues() : undefined,
    getFacetedMinMaxValues: enableFiltering ? getFacetedMinMaxValues() : undefined,

    manualFiltering: effectiveManualFiltering,
    manualPagination: effectiveManualPagination,
    manualSorting: effectiveManualSorting,

    ...(effectiveManualPagination && rowCount != null ? { rowCount } : {}),
    ...(effectiveManualPagination && pageCount != null ? { pageCount } : {}),

    columnResizeMode: 'onChange',

    enableSorting,
    enableMultiSort: true,
    enableColumnFilters: enableFiltering,
    enableGlobalFilter: enableGlobalSearch,
    enableHiding: enableColumnVisibility,
    enableColumnResizing,
    enableRowSelection,
  });

  // ---- View Management ----

  const saveView = useCallback(
    (name: string) => {
      viewsHook.saveView(name, {
        columnVisibility,
        columnSizing,
        columnOrder,
        filters: filtering.advancedFilters,
        sorting: sortingHook.sorting,
        pagination,
        globalFilter: filtering.globalFilter,
      });
    },
    [
      viewsHook,
      columnVisibility,
      columnSizing,
      columnOrder,
      filtering.advancedFilters,
      sortingHook.sorting,
      pagination,
      filtering.globalFilter,
    ],
  );

  const loadView = useCallback(
    (viewId: string) => {
      const view = viewsHook.loadView(viewId);
      if (!view) {
        return;
      }

      filtering.setFilters(view.filters);
      sortingHook.setSorting(view.sorting);
      setPagination({
        pageIndex: view.pagination.pageIndex,
        pageSize: view.pagination.pageSize,
      });
      filtering.setGlobalFilter(view.searchQuery ?? '');

      const visibility: VisibilityState = {};
      Object.values(view.columns).forEach((col) => {
        visibility[col.id] = col.visible;
      });
      setColumnVisibility(visibility);

      const sizing: ColumnSizingState = {};
      Object.values(view.columns).forEach((col) => {
        if (col.width) {
          sizing[col.id] = col.width;
        }
      });
      setColumnSizing(sizing);
    },
    [viewsHook, filtering, sortingHook],
  );

  // ---- Computed Values ----

  const filteredData = useMemo(() => {
    if (effectiveManualFiltering) {
      return accumulatedData;
    }
    return table.getFilteredRowModel().rows.map((row) => row.original);
  }, [accumulatedData, table, effectiveManualFiltering]);

  const paginatedData = useMemo(() => {
    if (effectiveManualPagination) {
      return filteredData;
    }
    return table.getPaginationRowModel().rows.map((row) => row.original);
  }, [filteredData, table, effectiveManualPagination]);

  const totalPages =
    effectiveManualPagination && pageCount != null
      ? pageCount
      : effectiveManualPagination && rowCount != null
        ? Math.ceil(rowCount / pagination.pageSize)
        : Math.ceil((table.getFilteredRowModel().rows.length || 0) / pagination.pageSize);

  // ---- Infinite computed state ----

  // Final row-model count (post filter/sort/group/expand): the slicing +
  // exhaustion base for client mode; loader mode reveals everything loaded.
  const rowModelCount = table.getRowModel().rows.length;
  const rowModelCountRef = useRef(rowModelCount);
  rowModelCountRef.current = rowModelCount;

  const loadMoreInfinite = useCallback(() => {
    if (isLoaderMode) {
      infiniteRows.loadMore();
    } else {
      infiniteRows.loadMoreClient(rowModelCountRef.current);
    }
  }, [isLoaderMode, infiniteRows.loadMore, infiniteRows.loadMoreClient]);

  const infinite: DataTableInfiniteState | undefined = infiniteEnabled
    ? {
        visibleRowCount: isLoaderMode
          ? rowModelCount
          : Math.min(infiniteRows.loadedPages * pagination.pageSize, rowModelCount),
        loadedPages: infiniteRows.loadedPages,
        totalCount: isLoaderMode ? infiniteRows.totalCount : rowModelCount,
        exhausted: isLoaderMode
          ? infiniteRows.exhausted
          : infiniteRows.loadedPages * pagination.pageSize >= rowModelCount,
        isInitialLoading: infiniteRows.isInitialLoading,
        isAppending: infiniteRows.isAppending,
        loadMore: loadMoreInfinite,
      }
    : undefined;

  // ---- Actions ----

  const actions = {
    setGlobalFilter: filtering.setGlobalFilter,
    setFilters: filtering.setFilters,
    addFilter: filtering.addFilter,
    updateFilter: filtering.updateFilter,
    removeFilter: filtering.removeFilter,
    clearFilters: filtering.clearFilters,
    setPagination,
    setSorting: sortingHook.setSorting,
    toggleColumnVisibility: (columnId: string) => {
      setColumnVisibility((prev) => ({
        ...prev,
        [columnId]: !prev[columnId],
      }));
    },
    setColumnOrder,
    setColumnSizing,
    saveView,
    loadView,
    resetToDefault: () => {
      setPagination(defaultTableState.pagination!);
      sortingHook.setSorting(defaultTableState.sorting! as any);
      filtering.setColumnFilters(defaultTableState.columnFilters! as any);
      filtering.setGlobalFilter(defaultTableState.globalFilter!);
      setColumnVisibility(defaultTableState.columnVisibility!);
      setColumnOrder(defaultTableState.columnOrder!);
      setColumnSizing(defaultTableState.columnSizing!);
      filtering.setFilters(defaultTableState.filters! as any);
      viewsHook.setActiveViewId(defaultTableState.activeViewId);
      if (enableRowExpansion) {
        setExpanded({});
      }
      if (enableColumnPinning) {
        setColumnPinning({ left: [], right: [] });
      }
      if (enableGrouping) {
        setGrouping([]);
      }
      if (enableRowSelection) {
        selection.clearSelection();
      }
    },
    ...(enableRowExpansion ? { setExpanded } : {}),
    ...(enableGrouping ? { grouping, setGrouping } : {}),
    ...(enableRowSelection
      ? {
          clearSelection: selection.clearSelection,
          selectAll: selection.selectAll,
          setRowSelection: selection.setRowSelection,
        }
      : {}),
  };

  // Total row count across all pages (post-filter; server total in manual /
  // loader modes). Consumed by the footer range summary and pagination chrome.
  const resolvedTotalCount = isLoaderMode
    ? (infiniteRows.totalCount ?? infiniteRows.rows.length)
    : effectiveManualPagination && rowCount != null
      ? rowCount
      : table.getFilteredRowModel().rows.length;

  const computed = {
    filteredData,
    paginatedData,
    totalPages,
    totalRows: resolvedTotalCount,
    hasActiveFilters: filtering.hasActiveFilters,
    activeFilterCount: filtering.activeFilterCount,
    filterFields,
    infinite,
    // The fold read once at the end — a footer cell renders it through
    // useDataTableState() (MPO-250).
    foldTotal,
  };

  // ---- State Change Callback ----

  const currentState: DataTableState = {
    data,
    columns: columns as any,
    pagination: {
      ...pagination,
      totalCount: resolvedTotalCount,
      totalPages,
      hasNextPage: table.getCanNextPage(),
      hasPreviousPage: table.getCanPreviousPage(),
    },
    sorting: sortingHook.sorting,
    filters: filtering.advancedFilters,
    columnFilters: filtering.columnFilters,
    globalFilter: filtering.globalFilter,
    columnVisibility,
    columnOrder,
    columnSizing,
    views: viewsHook.views,
    activeViewId: viewsHook.activeViewId,
    isLoading: isLoadingProp ?? initialState?.isLoading,
    // Subsequent query in flight — toolbar spinner, body stays mounted.
    // Infinite loader mode ORs its own keepPreviousData fetching flag.
    isFetching: isFetchingProp ?? initialState?.isFetching ?? infiniteRows.isFetching,
    isPlaceholderData: infiniteRows.isPlaceholderData,
    // Carried through like isLoading so the root's error chrome is actually
    // reachable from the public API (DG-ST-01) — previously dropped here.
    error: initialState?.error,
  };

  useEffect(() => {
    onStateChange?.(currentState);
  }, [currentState, onStateChange]);

  return {
    table,
    state: currentState,
    actions,
    computed,
  };
}

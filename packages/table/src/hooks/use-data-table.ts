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
  FilterFn,
  GroupingState,
  PaginationState,
  Row,
  TableOptions,
  TableState,
  VisibilityState,
} from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  DataTableColumn,
  DataTableData,
  DataTableField,
  DataTableInfiniteState,
  DataTableState,
  TableFilter,
  TableSorting,
  UseDataTableOptions,
  UseDataTableReturn,
} from '../types';
import { applyFilterToValue } from '../utils/filter-utils';
import {
  applyFiltersToData,
  getFilterFieldType,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- existing public guard name exported by utils/filterFields
  isFilterValueShape,
  resolveFilterFields,
} from '../utils/filter-fields';
import { moneyComparator } from '../utils/money';
import { DEFAULT_PAGE_SIZE } from '../utils/pagination-defaults';
import { accumulateRows } from '../utils/row-accumulator';
import { deserializeTableState, serializeTableState } from '../utils/url-state-utils';

import { useInfiniteRows } from './use-infinite-rows';
import { useTableFiltering } from './use-table-filtering';
import { useTableSelection } from './use-table-selection';
import { useTableSorting } from './use-table-sorting';
import { useTableViews } from './use-table-views';

const useUrlState: typeof useUrlStateFromRouter = useUrlStateFromRouter;

// URL State Strategy Interface

type UrlStateUpdate<T> = Partial<T> | ((prev: T) => Partial<T>) | T | ((prev: T) => T);

export interface UrlStateStrategy {
  getState: <T extends object>(defaultValue: T) => [T, (value: UrlStateUpdate<T>) => void];
  debounceMs?: number;
}

/** React Router's `useSearchParams` shape (only what the strategy uses). */
type ReactRouterSearchParamsHook = () => [URLSearchParams, (params: URLSearchParams) => void];
/** Next.js App Router's `useSearchParams` shape (only what the strategy uses). */
type NextSearchParamsHook = () => URLSearchParams;
/** Next.js App Router's `useRouter` shape (only what the strategy uses). */
type NextRouterHook = () => { replace: (href: string, options?: { scroll?: boolean }) => void };

const TABLE_STATE_PARAM = 'tableState';

const noopSetUrlState = (): undefined => undefined;

const readTableStateParam = <T>(serialized: string | null | undefined, defaultValue: T): T => {
  try {
    if (serialized === null || serialized === undefined || serialized === '') {
      return defaultValue;
    }
    // SAFETY: the param is written by this module's own updateUrl from a serialized table state
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- URL content is not schema-validated here; a malformed value falls back via the catch
    return JSON.parse(decodeURIComponent(serialized)) as T;
  } catch (error) {
    console.warn('Failed to parse table state from URL:', error);
    return defaultValue;
  }
};

const URL_UPDATE_FAILED = 'Failed to update URL with table state:';

// Default OneStack strategy
const createOneStackUrlStrategy = (debounceMs?: number): UrlStateStrategy => {
  const useOneStackUrlState = <T extends object>(defaultValue: T) => useUrlState(defaultValue, { debounceMs });
  return { getState: useOneStackUrlState, debounceMs };
};

// React Router strategy
const createReactRouterUrlStrategy = (
  useRouterSearchParams: ReactRouterSearchParamsHook,
  debounceMs?: number,
): UrlStateStrategy => {
  const useReactRouterUrlState = <T extends object>(defaultValue: T): [T, (value: UrlStateUpdate<T>) => void] => {
    const [searchParams, setSearchParams] = useRouterSearchParams();
    // oxlint-disable-next-line react/hook-use-state -- the URL is the source of truth; the parsed state is read once and never set locally
    const [state] = useState<T>(() => readTableStateParam(searchParams.get(TABLE_STATE_PARAM), defaultValue));

    const updateUrl = useCallback(
      (newState: UrlStateUpdate<T>) => {
        try {
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.set(TABLE_STATE_PARAM, encodeURIComponent(JSON.stringify(newState)));
          setSearchParams(newSearchParams);
        } catch (error) {
          console.warn(URL_UPDATE_FAILED, error);
        }
      },
      [searchParams, setSearchParams],
    );

    return [state, updateUrl];
  };
  return { getState: useReactRouterUrlState, debounceMs };
};

// Next.js App Router strategy
const createNextJsAppRouterStrategy = (
  useNextSearchParams: NextSearchParamsHook,
  useNextRouter: NextRouterHook,
  debounceMs?: number,
): UrlStateStrategy => {
  const useNextJsUrlState = <T extends object>(defaultValue: T): [T, (value: UrlStateUpdate<T>) => void] => {
    const searchParams = useNextSearchParams();
    const router = useNextRouter();
    // oxlint-disable-next-line react/hook-use-state -- the URL is the source of truth; the parsed state is read once and never set locally
    const [state] = useState<T>(() => readTableStateParam(searchParams.get(TABLE_STATE_PARAM), defaultValue));

    const updateUrl = useCallback(
      (newState: UrlStateUpdate<T>) => {
        try {
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.set(TABLE_STATE_PARAM, encodeURIComponent(JSON.stringify(newState)));
          router.replace(`?${newSearchParams.toString()}`, { scroll: false });
        } catch (error) {
          console.warn(URL_UPDATE_FAILED, error);
        }
      },
      [searchParams, router],
    );

    return [state, updateUrl];
  };
  return { getState: useNextJsUrlState, debounceMs };
};

// Universal strategy (works everywhere)
const createUniversalUrlStrategy = (debounceMs?: number): UrlStateStrategy => {
  const useUniversalUrlState = <T extends object>(defaultValue: T): [T, (value: UrlStateUpdate<T>) => void] => {
    const [searchParams, setSearchParams] = useSearchParams();

    const state = useMemo<T>(() => {
      const serialized = searchParams[TABLE_STATE_PARAM];
      return readTableStateParam(Array.isArray(serialized) ? undefined : serialized, defaultValue);
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- recompute only when the URL params change; defaultValue is a fresh object every render
    }, [searchParams]);

    const updateUrl = useCallback(
      (newState: UrlStateUpdate<T>) => {
        try {
          setSearchParams(
            { [TABLE_STATE_PARAM]: encodeURIComponent(JSON.stringify(newState)) },
            { replace: true, debounceMs },
          );
        } catch (error) {
          console.warn(URL_UPDATE_FAILED, error);
        }
      },
      [setSearchParams],
    );

    return [state, updateUrl];
  };
  return { getState: useUniversalUrlState, debounceMs };
};

// Strategy Factory

export const createUrlStrategy = {
  oneStack: createOneStackUrlStrategy,
  reactRouter: (useRouterSearchParams: ReactRouterSearchParamsHook, debounceMs?: number) =>
    createReactRouterUrlStrategy(useRouterSearchParams, debounceMs),
  nextJs: (useNextSearchParams: NextSearchParamsHook, useNextRouter: NextRouterHook, debounceMs?: number) =>
    createNextJsAppRouterStrategy(useNextSearchParams, useNextRouter, debounceMs),
  universal: createUniversalUrlStrategy,
  custom: (strategy: UrlStateStrategy) => strategy,
};

/**
 * TanStack sort for a `money` column: exact decimal-string ordering, so
 * "9.00" sorts below "10.00" (MPO-252).
 */
const moneySortingFn = <TData>(rowA: Row<TData>, rowB: Row<TData>, columnId: string): number =>
  moneyComparator(rowA.getValue(columnId), rowB.getValue(columnId));

// SAFETY: a nested `subRows` array on a row holds rows of the same shape; rows without one yield undefined
const readNestedSubRows = <TData>(originalRow: TData): TData[] | undefined =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- consumer row data has no parse boundary
  (originalRow as { subRows?: TData[] } | undefined)?.subRows;

const validWidth = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const normalizeColumnWidths = <TData extends DataTableData>(column: ColumnDef<TData>): ColumnDef<TData> => {
  if ('columns' in column && column.columns) {
    const children = column.columns.map(normalizeColumnWidths);
    return children.some((child, index) => child !== column.columns?.[index])
      ? { ...column, columns: children }
      : column;
  }
  // SAFETY: every column handed to useDataTable is a DataTableColumn (ColumnDef plus the width aliases)
  const { width, minWidth, maxWidth } = column as DataTableColumn<TData>;
  const sizing: Pick<ColumnDef<TData>, 'size' | 'minSize' | 'maxSize'> = {};
  if (column.size === undefined && validWidth(width)) {
    sizing.size = width;
  }
  if (column.minSize === undefined && validWidth(minWidth)) {
    sizing.minSize = minWidth;
  }
  if (column.maxSize === undefined && validWidth(maxWidth)) {
    sizing.maxSize = maxWidth;
  }
  return Object.keys(sizing).length > 0 ? { ...column, ...sizing } : column;
};

// TanStack keys an id-less column by its accessorKey (dots folded to "_"),
// then by a string header; a seeded order must use that same key or the
// column falls behind every matched one.
const columnOrderKey = <TData extends DataTableData>(column: ColumnDef<TData>, index: number): string => {
  if (column.id !== undefined && column.id !== '') {
    return column.id;
  }
  // SAFETY: accessorKey/header are read as unknown and narrowed below; nothing is assumed about their type
  const { accessorKey, header } = column as { accessorKey?: unknown; header?: unknown };
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- accessorKey is absent on accessorFn/display columns; only a non-empty string is a key
  if (typeof accessorKey === 'string' && accessorKey !== '') {
    return accessorKey.replaceAll('.', '_');
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- header may be a render function; only a non-empty string is a key
  if (typeof header === 'string' && header !== '') {
    return header;
  }
  return String(index);
};

// oxlint-disable-next-line eslint/complexity -- the branches are option defaults and per-feature toggles of one TanStack config
export const useDataTable = <TData extends DataTableData = DataTableData>({
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
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- the hook composes every table feature; each branch is a feature toggle
} = {}): UseDataTableReturn<TData> => {
  // ---- Default State ----

  const baseTableState: Required<
    Pick<
      DataTableState,
      | 'pagination'
      | 'sorting'
      | 'filters'
      | 'columnFilters'
      | 'globalFilter'
      | 'columnVisibility'
      | 'columnOrder'
      | 'columnSizing'
      | 'views'
    >
  > = {
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
  };
  const defaultTableState = { ...baseTableState, ...initialState };

  // ---- URL State ----

  const urlStateStrategy = urlStrategy ?? createUrlStrategy.oneStack(urlDebounceMs);

  const [urlState, setUrlState] = syncWithUrl
    ? urlStateStrategy.getState(serializeTableState(defaultTableState))
    : [serializeTableState(defaultTableState), noopSetUrlState];

  const deserializedState = useMemo(() => deserializeTableState(urlState), [urlState]);

  // ---- Feature Hooks: Filtering ----

  const filtering = useTableFiltering({
    enableFiltering,
    manualFiltering,
    initialFilters: deserializedState.filters ?? defaultTableState.filters,
    initialColumnFilters: deserializedState.columnFilters ?? defaultTableState.columnFilters,
    initialGlobalFilter: deserializedState.globalFilter ?? defaultTableState.globalFilter,
  });

  // ---- Feature Hooks: Sorting ----

  const sortingHook = useTableSorting({
    enableSorting,
    manualSorting,
    initialSorting: deserializedState.sorting ?? defaultTableState.sorting,
  });

  // ---- Feature Hooks: Views ----

  const viewsHook = useTableViews({
    initialViews: deserializedState.views ?? defaultTableState.views,
    initialActiveViewId: deserializedState.activeViewId ?? defaultTableState.activeViewId,
  });

  // ---- Pagination State ----

  const [pagination, setPagination] = useState<PaginationState>(
    deserializedState.pagination ?? defaultTableState.pagination,
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
    // SAFETY: the key is JSON.stringify(controlledState.filters) from this render, so it parses back to TableFilter[]
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- round-trip of a value this hook serialized itself
    filtering.setFilters(JSON.parse(controlledFiltersKey) as TableFilter[]);
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
    // SAFETY: the key is JSON.stringify(controlledState.sorting) from this render, so it parses back to TableSorting[]
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- round-trip of a value this hook serialized itself
    sortingHook.setSorting(JSON.parse(controlledSortingKey) as TableSorting[]);
    setPagination((previous) => (previous.pageIndex === 0 ? previous : { ...previous, pageIndex: 0 }));
    // oxlint-disable-next-line exhaustive-deps -- content key IS the dependency
  }, [controlledSortingKey]);

  // ---- Column Management State ----

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    deserializedState.columnVisibility ?? defaultTableState.columnVisibility,
  );

  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    deserializedState.columnOrder ?? defaultTableState.columnOrder,
  );

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    deserializedState.columnSizing ?? defaultTableState.columnSizing,
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
    () =>
      resolveFilterFields(
        // SAFETY: resolveFilterFields only reads id/accessorKey/header/type metadata, which is independent of TData
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ColumnDef is invariant in TData; the metadata read is row-type agnostic
        columns as DataTableColumn[],
        filterableFields,
      ),
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
  const operatorFilterFn: FilterFn<TData> = useCallback(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- TanStack hands column filter values through untyped; each branch narrows it
    (row: Row<TData>, columnId: string, filterValue: unknown) => {
      if (filterValue == null || filterValue === '') {
        return true;
      }
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- existing public guard name exported by utils/filterFields
      if (isFilterValueShape(filterValue)) {
        const type = getFilterFieldType(filterFields, columnId);
        return applyFilterToValue(row.getValue(columnId), filterValue, type === 'select' ? 'text' : type);
      }
      if (Array.isArray(filterValue)) {
        return filterValue.length === 0 || filterValue.includes(row.getValue(columnId));
      }
      return (
        String(row.getValue(columnId) ?? '')
          .toLowerCase()
          // oxlint-disable-next-line typescript/no-base-to-string -- remaining filter values are primitive search terms
          .includes(String(filterValue).toLowerCase())
      );
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
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- rows are consumer data; guard null/primitives before reading an id
    if (row != null && typeof row === 'object' && 'id' in row && row.id != null) {
      return String(row.id);
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
        // SAFETY: the alias fields are optional and only compared against undefined / 'money'
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the DataTableColumn alias fields are not part of ColumnDef's type
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
        const mapped: ColumnDef<TData> = { ...column };
        if (needsMoneySort) {
          mapped.sortingFn = moneySortingFn;
        }
        if (sortable !== undefined && column.enableSorting === undefined) {
          mapped.enableSorting = sortable;
        }
        if (filterable !== undefined && column.enableColumnFilter === undefined) {
          mapped.enableColumnFilter = filterable;
        }
        return mapped;
      }),
    [columns],
  );

  // Optional features only contribute state/handlers when enabled: an explicit
  // undefined would override TanStack's internal default updaters.
  const featureState: Partial<TableState> = {};
  const featureOptions: Partial<TableOptions<TData>> = {};
  if (enableRowExpansion) {
    featureState.expanded = expanded;
    featureOptions.onExpandedChange = setExpanded;
  }
  if (enableColumnPinning) {
    featureState.columnPinning = columnPinning;
    featureOptions.onColumnPinningChange = setColumnPinning;
  }
  if (enableGrouping) {
    featureState.grouping = grouping;
    featureOptions.onGroupingChange = setGrouping;
  }
  if (enableRowSelection) {
    featureState.rowSelection = selection.rowSelection;
    featureOptions.onRowSelectionChange = selection.setRowSelection;
  }
  if (effectiveManualPagination && rowCount != null) {
    featureOptions.rowCount = rowCount;
  }
  if (effectiveManualPagination && pageCount != null) {
    featureOptions.pageCount = pageCount;
  }

  // oxlint-disable-next-line react/incompatible-library -- TanStack Table returns non-memoizable functions; the compiler skips this hook by design
  const table = useReactTable({
    data: preFilteredData,
    columns: normalizedColumns,
    defaultColumn: { filterFn: operatorFilterFn },
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: enableRowExpansion ? getExpandedRowModel() : undefined,
    // TanStack getSubRows receives the ORIGINAL data object (not a Row), so
    // reading `.original` here always yielded undefined — every row reported
    // getCanExpand() === false and the expansion caret column never rendered.
    getSubRows: getSubRows ? (originalRow) => getSubRows(originalRow) : readNestedSubRows,
    getRowId,

    state: {
      pagination,
      sorting: sortingHook.sorting,
      columnFilters: filtering.columnFilters,
      globalFilter: filtering.globalFilter,
      columnVisibility,
      columnOrder,
      columnSizing,
      ...featureState,
    },

    onPaginationChange: setPagination,
    onSortingChange: sortingHook.setSorting,
    onColumnFiltersChange: filtering.setColumnFilters,
    onGlobalFilterChange: filtering.setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    ...featureOptions,

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
      for (const col of Object.values(view.columns)) {
        visibility[col.id] = col.visible;
      }
      setColumnVisibility(visibility);

      const sizing: ColumnSizingState = {};
      for (const col of Object.values(view.columns)) {
        if (col.width !== undefined && col.width !== 0 && !Number.isNaN(col.width)) {
          sizing[col.id] = col.width;
        }
      }
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

  let totalPages: number;
  if (effectiveManualPagination && pageCount != null) {
    totalPages = pageCount;
  } else if (effectiveManualPagination && rowCount != null) {
    totalPages = Math.ceil(rowCount / pagination.pageSize);
  } else {
    totalPages = Math.ceil(table.getFilteredRowModel().rows.length / pagination.pageSize);
  }

  // ---- Infinite computed state ----

  // Final row-model count (post filter/sort/group/expand): the slicing +
  // exhaustion base for client mode; loader mode reveals everything loaded.
  const rowModelCount = table.getRowModel().rows.length;
  const rowModelCountRef = useRef(rowModelCount);
  rowModelCountRef.current = rowModelCount;

  const { loadMore: loadMoreRows, loadMoreClient } = infiniteRows;
  const loadMoreInfinite = useCallback(() => {
    if (isLoaderMode) {
      loadMoreRows();
    } else {
      loadMoreClient(rowModelCountRef.current);
    }
  }, [isLoaderMode, loadMoreRows, loadMoreClient]);

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

  const actions: UseDataTableReturn<TData>['actions'] & {
    grouping?: GroupingState;
    setGrouping?: typeof setGrouping;
    clearSelection?: typeof selection.clearSelection;
    selectAll?: typeof selection.selectAll;
    setRowSelection?: typeof selection.setRowSelection;
  } = {
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
      setPagination(defaultTableState.pagination);
      sortingHook.setSorting(defaultTableState.sorting);
      filtering.setColumnFilters(defaultTableState.columnFilters);
      filtering.setGlobalFilter(defaultTableState.globalFilter);
      setColumnVisibility(defaultTableState.columnVisibility);
      setColumnOrder(defaultTableState.columnOrder);
      setColumnSizing(defaultTableState.columnSizing);
      filtering.setFilters(defaultTableState.filters);
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
  };
  if (enableRowExpansion) {
    actions.setExpanded = setExpanded;
  }
  if (enableGrouping) {
    actions.grouping = grouping;
    actions.setGrouping = setGrouping;
  }
  if (enableRowSelection) {
    actions.clearSelection = selection.clearSelection;
    actions.selectAll = selection.selectAll;
    actions.setRowSelection = selection.setRowSelection;
  }

  // Total row count across all pages (post-filter; server total in manual /
  // loader modes). Consumed by the footer range summary and pagination chrome.
  let resolvedTotalCount: number;
  if (isLoaderMode) {
    resolvedTotalCount = infiniteRows.totalCount ?? infiniteRows.rows.length;
  } else if (effectiveManualPagination && rowCount != null) {
    resolvedTotalCount = rowCount;
  } else {
    resolvedTotalCount = table.getFilteredRowModel().rows.length;
  }

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
    // SAFETY: DataTableState stores the column defs untyped by row; TData only narrows the accessor keys
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ColumnDef is invariant in TData; consumers read the defs row-type agnostically
    columns: columns as DataTableColumn[],
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
    // oxlint-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent -- public onStateChange contract: notify the consumer after every commit
    onStateChange?.(currentState);
    // oxlint-disable-next-line react-doctor/no-effect-with-fresh-deps, react-hooks/exhaustive-deps -- currentState is rebuilt each render by design; the callback fires after every commit
  }, [currentState, onStateChange]);

  return {
    table,
    state: currentState,
    actions,
    computed,
  };
};

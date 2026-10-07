/**
 * DataTableStateContext - regular React context for sharing table state.
 *
 * Shares the useDataTable return value (table instance, state, actions,
 * computed values) across the compound tree. Sub-components consume this
 * context instead of receiving state/action props.
 *
 * Uses regular createContext (not createStyledContext) because this
 * shares non-style state -- table instance, callbacks, computed values.
 */

import type { Table as ReactTable } from '@tanstack/react-table';
import { createContext, useContext } from 'react';

import type { DataTableState, SelectAllScope } from '../../types';

/**
 * What the toolbar filter surface should edit when it opens:
 * - `new`: start from the searchable field list
 * - `advanced`: an existing toolbar/hidden-field filter (chip press)
 * - `column`: an existing column-funnel filter (chip press)
 */
export type FilterEditTarget =
  | { kind: 'new' }
  | { kind: 'advanced'; filterId: string }
  | { kind: 'column'; columnId: string };

/** Shared channel between the filter chips bar and the toolbar filter surface. */
export interface DataTableFilterUi {
  editTarget: FilterEditTarget | null;
  requestEdit: (target: FilterEditTarget | null) => void;
}

export interface DataTableStateContextValue<TData = any> {
  table: ReactTable<TData>;
  state: DataTableState;
  /** Effective select-all scope (house `selectAllScope` knob / prop). */
  selectAllScope?: SelectAllScope;
  /** Chip-press → toolbar filter editor channel. Present when Root wires it. */
  filterUi?: DataTableFilterUi;
  actions: {
    setGlobalFilter: (value: string) => void;
    setFilters: (filters: any[]) => void;
    addFilter: (filter: any) => void;
    removeFilter: (filterId: string) => void;
    clearFilters: () => void;
    setPagination: (pagination: any) => void;
    setSorting: (sorting: any) => void;
    toggleColumnVisibility: (columnId: string, visible?: boolean) => void;
    setColumnOrder: (order: string[]) => void;
    setColumnSizing: (sizing: Record<string, number>) => void;
    saveView: (name: string) => void;
    loadView: (viewId: string) => void;
    resetToDefault: () => void;
    setExpanded?: (expanded: any) => void;
    [key: string]: any;
  };
  computed: {
    filteredData: any[];
    paginatedData: any[];
    totalPages: number;
    /** Total row count across all pages (post-filter; server total when paginating manually). */
    totalRows: number;
    hasActiveFilters: boolean;
    activeFilterCount: number;
    /**
     * The row accumulator's `total(finalAccumulator, rowCount)` — the fold
     * read once at the end (MPO-250). A column's TanStack `footer` renderer
     * reads it from here to paint a total row; the table already renders a
     * footer whenever any column defines one.
     */
    foldTotal?: unknown;
    [key: string]: any;
  };
}

export const DataTableStateContext = createContext<DataTableStateContextValue | null>(null);

/**
 * Hook for sub-components to access the DataTable state context.
 *
 * Returns the table instance, state, actions, and computed values
 * from the nearest DataTable ancestor. Returns null when no provider
 * is present (for example when a sub-component is used with explicit props only).
 */
export function useDataTableState<TData = any>(): DataTableStateContextValue<TData> | null {
  return useContext(DataTableStateContext) as DataTableStateContextValue<TData> | null;
}

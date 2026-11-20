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

// oxlint-disable-next-line typescript/no-explicit-any -- the context carries a table of erased row type; consumers opt into TData
export interface DataTableStateContextValue<TData = any> {
  table: ReactTable<TData>;
  state: DataTableState;
  /** Effective select-all scope (house `selectAllScope` knob / prop). */
  selectAllScope?: SelectAllScope;
  /** Chip-press → toolbar filter editor channel. Present when Root wires it. */
  filterUi?: DataTableFilterUi;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the hook spreads optional, feature-gated actions onto this object
  actions: {
    setGlobalFilter: (value: string) => void;
    // oxlint-disable-next-line typescript/no-explicit-any -- exported context shape shared by a dozen sub-components; tightening it would ripple into every consumer
    setFilters: (filters: any[]) => void;
    // oxlint-disable-next-line typescript/no-explicit-any -- exported context shape shared by a dozen sub-components; tightening it would ripple into every consumer
    addFilter: (filter: any) => void;
    removeFilter: (filterId: string) => void;
    clearFilters: () => void;
    // oxlint-disable-next-line typescript/no-explicit-any -- exported context shape shared by a dozen sub-components; tightening it would ripple into every consumer
    setPagination: (pagination: any) => void;
    // oxlint-disable-next-line typescript/no-explicit-any -- exported context shape shared by a dozen sub-components; tightening it would ripple into every consumer
    setSorting: (sorting: any) => void;
    toggleColumnVisibility: (columnId: string, visible?: boolean) => void;
    setColumnOrder: (order: string[]) => void;
    setColumnSizing: (sizing: Record<string, number>) => void;
    saveView: (name: string) => void;
    loadView: (viewId: string) => void;
    resetToDefault: () => void;
    // oxlint-disable-next-line typescript/no-explicit-any -- exported context shape shared by a dozen sub-components; tightening it would ripple into every consumer
    setExpanded?: (expanded: any) => void;
    // oxlint-disable-next-line typescript/no-explicit-any -- exported context shape shared by a dozen sub-components; tightening it would ripple into every consumer
    [key: string]: any;
  };
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the hook spreads optional, mode-specific computed values onto this object
  computed: {
    // oxlint-disable-next-line typescript/no-explicit-any -- exported context shape shared by a dozen sub-components; tightening it would ripple into every consumer
    filteredData: any[];
    // oxlint-disable-next-line typescript/no-explicit-any -- exported context shape shared by a dozen sub-components; tightening it would ripple into every consumer
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
    // oxlint-disable-next-line typescript/no-explicit-any -- exported context shape shared by a dozen sub-components; tightening it would ripple into every consumer
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
// oxlint-disable-next-line typescript/no-explicit-any -- the context carries a table of erased row type; consumers opt into TData
export const useDataTableState = <TData = any>(): DataTableStateContextValue<TData> | null =>
  // SAFETY: the provider holds the Root's table; TData is the caller's claim about that table's row type
  useContext(DataTableStateContext) as DataTableStateContextValue<TData> | null;

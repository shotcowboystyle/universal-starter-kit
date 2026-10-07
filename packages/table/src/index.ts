/**
 * @repo/table
 *
 * Advanced table components with filtering, pagination, sorting, and URL state management.
 */

// Export types
export type * from './types';

// Export hooks - main entry point
export { useDataTable, createUrlStrategy } from './hooks/useDataTable';
export { useRowSelection } from './components/DataTableBulkActions';

// Export hooks - decomposed feature hooks for advanced compositions
export { useTableFiltering } from './hooks/useTableFiltering';
export type { UseTableFilteringOptions, UseTableFilteringReturn } from './hooks/useTableFiltering';
export { useTableSorting } from './hooks/useTableSorting';
export type { UseTableSortingOptions, UseTableSortingReturn } from './hooks/useTableSorting';
export { useInfiniteRows } from './hooks/useInfiniteRows';
export type { UseInfiniteRowsOptions, UseInfiniteRowsReturn } from './hooks/useInfiniteRows';
export { useTablePagination } from './hooks/useTablePagination';
export type { UseTablePaginationOptions, UseTablePaginationReturn } from './hooks/useTablePagination';
export { useTableSearch } from './hooks/useTableSearch';
export type { UseTableSearchOptions, UseTableSearchReturn } from './hooks/useTableSearch';
export { useTableSelection } from './hooks/useTableSelection';
export type { UseTableSelectionOptions, UseTableSelectionReturn } from './hooks/useTableSelection';
export { useTableGrouping } from './hooks/useTableGrouping';
export type { UseTableGroupingOptions, UseTableGroupingReturn } from './hooks/useTableGrouping';
export { useTableUrlSync } from './hooks/useTableUrlSync';
export type { UseTableUrlSyncOptions, UseTableUrlSyncReturn } from './hooks/useTableUrlSync';
export { useTableColumnPinning } from './hooks/useTableColumnPinning';
export type { UseTableColumnPinningOptions, UseTableColumnPinningReturn } from './hooks/useTableColumnPinning';
export { useTableViews } from './hooks/useTableViews';
export type { UseTableViewsOptions, UseTableViewsReturn } from './hooks/useTableViews';
export { useTableKeyboard } from './hooks/useTableKeyboard';
export type { UseTableKeyboardOptions, UseTableKeyboardReturn } from './hooks/useTableKeyboard';
export { useDragScroll } from './hooks/useDragScroll';

// Export components - compound DataTable
export { DataTable } from './components/DataTable';
export { DataTableVirtualized } from './components/DataTable/DataTableVirtualized';
export { DataTableContext } from './components/DataTable/DataTableContext';
export { DataTableStateContext, useDataTableState } from './components/DataTable/DataTableStateContext';
export type {
  DataTableFilterUi,
  DataTableStateContextValue,
  FilterEditTarget,
} from './components/DataTable/DataTableStateContext';
export type { DataTableRootProps } from './components/DataTable/DataTableRoot';

// Export components - SimpleTable (lightweight, zero TanStack Table dependency)
export { SimpleTable } from './components/SimpleTable';
export type { SimpleTableProps, SimpleTableColumn } from './components/SimpleTable';

// Export sub-components (for standalone usage)
export { DataTableToolbar } from './components/DataTableToolbar';
export { DataTableFilters } from './components/DataTableFilters';
export { DataTableFilterButton } from './components/DataTableFilterButton';
export { DataTableFilterChips } from './components/DataTableFilterChips';
export {
  DataTableFacetMenu,
  type DataTableFacetMenuProps,
  type DataTableFacetMenuItemProps,
  type DataTableFacetOption,
  type DataTableFacetSelection,
} from './components/DataTableFacetMenu';
export { FilterOperatorValueEditor, type FilterOperatorValueEditorProps } from './components/FilterOperatorValueEditor';
export { DataTablePagination } from './components/DataTablePagination';
export { DataTableViewOptions } from './components/DataTableViewOptions';
export { DataTableBulkActions } from './components/DataTableBulkActions';
export type { BulkAction, SelectAllScope } from './types';
export { DataTableExport, type ExportOptions } from './components/DataTableExport';
export { DataTableSearch, useFullTextSearch, type SearchOptions } from './components/DataTableSearch';
export { DataTableDateFilter, useDateFilter, type DateFilterValue } from './components/DataTableDateFilter';
export {
  DataTableGrouping,
  DataTableGroupingConfig,
  type GroupingConfig,
  useGrouping,
  groupData,
} from './components/DataTableGrouping';
export {
  DataTableColumnPinning,
  useColumnPinning,
  type StickyColumnProps,
  type PinnedIndicatorProps,
} from './components/DataTableColumnPinning';
export { Table, TableCellContext, useIsInTableCell, useTableCellContext } from '@repo/table-primitives';
export type {
  TableBodyProps,
  TableCaptionProps,
  TableCellContextValue,
  TableCellProps,
  TableFootProps,
  TableHeadProps,
  TableHeaderCellProps,
  TableProps,
  TableRowProps,
} from '@repo/table-primitives';

export { TableInput, type TableInputProps } from './components/TableInput';
export { ChildTable, type ChildTableProps } from './components/ChildTable';
export type { ChildCellHidden } from './components/TableInput/shared';
export { DataTableCell, type DataTableCellProps } from './components/DataTableCell';
export { FilterManager, type FilterManagerProps } from './components/FilterManager';
export { SavedFilterDropdown, type SavedFilterDropdownProps } from './components/SavedFilterDropdown';

// Export hooks - saved filters
export {
  useSavedFilters,
  type SavedFilter,
  type ParsedFilter,
  type SavedFiltersStorage,
  type UseSavedFiltersOptions,
  type SavedFiltersHook,
} from './hooks/useSavedFilters';

// Export utilities
export * from './utils/filterUtils';
export {
  applyFiltersToData,
  defaultOperatorForFilterType,
  filterOperatorLabel,
  getFilterChipLabel,
  getFilterFieldType,
  isFilterValueShape,
  mapFieldToFilterType,
  operatorNeedsNoValue,
  operatorsForFilterType,
  resolveFilterFields,
} from './utils/filterFields';
export * from './utils/urlStateUtils';
export {
  addMoney,
  compareMoney,
  formatMoney,
  isMoneyString,
  isNegativeMoney,
  moneyComparator,
  subtractMoney,
  sumMoney,
  sumMoneyByCurrency,
} from './utils/money';
export { accumulateRows } from './utils/rowAccumulator';
export type { RowAccumulator, RowAccumulatorResult } from './utils/rowAccumulator';
export { getDefaultColumnAlign, alignToFlex, type ColumnAlign, type ColumnAlignInput } from './utils/columnAlign';
export { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, type DefaultPageSizeOption } from './utils/paginationDefaults';

// Re-export TanStack Table types for convenience
export type { ColumnDef, Table as TanStackTable, Row, Cell, Header, Column } from '@tanstack/react-table';

/**
 * Package `@repo/table`.
 *
 * Advanced table components with filtering, pagination, sorting, and URL state management.
 */

// Export types
export type {
  ColumnView,
  DataTableCellRenderContext,
  DataTableColumn,
  DataTableColumnConfig,
  DataTableColumnType,
  DataTableData,
  DataTableField,
  DataTableFieldProps,
  DataTableFiltersProps,
  DataTableInfiniteState,
  DataTableLayout,
  DataTablePageLoader,
  DataTablePaginationProps,
  DataTableProps,
  DataTableState,
  DataTableToolbarProps,
  FacetedFilterOption,
  FilterableField,
  FilterOperator,
  FilterValue,
  PageLoadQuery,
  PageLoadResult,
  PaginationMode,
  ResolvedFilterField,
  TableFilter,
  TablePagination,
  TablePaginationState,
  TableSorting,
  TableView,
  UseDataTableOptions,
  UseDataTableReturn,
} from './types';

// Export hooks - main entry point
export { useDataTable, createUrlStrategy } from './hooks/use-data-table';
export { useRowSelection } from './components/DataTableBulkActions';

// Export hooks - decomposed feature hooks for advanced compositions
export { useTableFiltering } from './hooks/use-table-filtering';
export type { UseTableFilteringOptions, UseTableFilteringReturn } from './hooks/use-table-filtering';
export { useTableSorting } from './hooks/use-table-sorting';
export type { UseTableSortingOptions, UseTableSortingReturn } from './hooks/use-table-sorting';
export { useInfiniteRows } from './hooks/use-infinite-rows';
export type { UseInfiniteRowsOptions, UseInfiniteRowsReturn } from './hooks/use-infinite-rows';
export { useTablePagination } from './hooks/use-table-pagination';
export type { UseTablePaginationOptions, UseTablePaginationReturn } from './hooks/use-table-pagination';
export { useTableSearch } from './hooks/use-table-search';
export type { UseTableSearchOptions, UseTableSearchReturn } from './hooks/use-table-search';
export { useTableSelection } from './hooks/use-table-selection';
export type { UseTableSelectionOptions, UseTableSelectionReturn } from './hooks/use-table-selection';
export { useTableGrouping } from './hooks/use-table-grouping';
export type { UseTableGroupingOptions, UseTableGroupingReturn } from './hooks/use-table-grouping';
export { useTableUrlSync } from './hooks/use-table-url-sync';
export type { UseTableUrlSyncOptions, UseTableUrlSyncReturn } from './hooks/use-table-url-sync';
export { useTableColumnPinning } from './hooks/use-table-column-pinning';
export type { UseTableColumnPinningOptions, UseTableColumnPinningReturn } from './hooks/use-table-column-pinning';
export { useTableViews } from './hooks/use-table-views';
export type { UseTableViewsOptions, UseTableViewsReturn } from './hooks/use-table-views';
export { useTableKeyboard } from './hooks/use-table-keyboard';
export type { UseTableKeyboardOptions, UseTableKeyboardReturn } from './hooks/use-table-keyboard';
export { useDragScroll } from './hooks/use-drag-scroll';

// Export components - compound DataTable
export { DataTable } from './components/DataTable';
export { DataTableVirtualized } from './components/DataTable/DataTableVirtualized';
export { DataTableContext } from './components/DataTable/data-table-context';
export { DataTableStateContext, useDataTableState } from './components/DataTable/data-table-state-context';
export type {
  DataTableFilterUi,
  DataTableStateContextValue,
  FilterEditTarget,
} from './components/DataTable/data-table-state-context';
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
} from './hooks/use-saved-filters';

// Export utilities
export {
  applyFilterToValue,
  combineFilters,
  createFilterPreset,
  deserializeFilterPresets,
  deserializeFilters,
  generateFilterId,
  getFilterDescription,
  inferColumnType,
  serializeFilterPresets,
  serializeFilters,
  validateFilter,
  type FilterPreset,
} from './utils/filter-utils';
export {
  applyFiltersToData,
  defaultOperatorForFilterType,
  filterOperatorLabel,
  getFilterChipLabel,
  getFilterFieldType,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- re-export of an existing public name; renaming would break consumers
  isFilterValueShape,
  mapFieldToFilterType,
  operatorNeedsNoValue,
  operatorsForFilterType,
  resolveFilterFields,
} from './utils/filter-fields';
export { deserializeTableState, serializeTableState, validateUrlState } from './utils/url-state-utils';
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
export { accumulateRows } from './utils/row-accumulator';
export type { RowAccumulator, RowAccumulatorResult } from './utils/row-accumulator';
export { getDefaultColumnAlign, alignToFlex, type ColumnAlign, type ColumnAlignInput } from './utils/column-align';
export { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, type DefaultPageSizeOption } from './utils/pagination-defaults';

// Re-export TanStack Table types for convenience
export type { ColumnDef, Table as TanStackTable, Row, Cell, Header, Column } from '@tanstack/react-table';

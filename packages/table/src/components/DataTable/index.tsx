/**
 * DataTable - compound component for data tables.
 *
 * Orchestrates DataTableRoot with all sub-components attached via
 * withStaticProperties. Supports both compound composition:
 *
 *   <DataTable data={data} columns={columns}>
 *     <DataTable.Toolbar />
 *     <DataTable.Pagination />
 *   </DataTable>
 *
 * Or the root only (no child slots):
 *
 *   <DataTable data={data} columns={columns} />
 */

import { withStaticProperties } from 'tamagui';

import { DataTableBulkActions } from '../DataTableBulkActions';
import { DataTableExport } from '../DataTableExport';
import { DataTableFilters } from '../DataTableFilters';
import { DataTableGrouping } from '../DataTableGrouping';
import { DataTablePagination } from '../DataTablePagination';
import { DataTableSearch } from '../DataTableSearch';
import { DataTableToolbar } from '../DataTableToolbar';
import { DataTableViewOptions } from '../DataTableViewOptions';

import { DataTableRoot } from './DataTableRoot';

export { DataTableContext } from './data-table-context';
export { DataTableStateContext, useDataTableState } from './data-table-state-context';
export type { DataTableStateContextValue } from './data-table-state-context';
export type { DataTableRootProps } from './DataTableRoot';

export const DataTable = withStaticProperties(DataTableRoot, {
  Toolbar: DataTableToolbar,
  Filters: DataTableFilters,
  Pagination: DataTablePagination,
  BulkActions: DataTableBulkActions,
  /** Alias for BulkActions — auto-shown by DataTableRoot when enableRowSelection is on. */
  SelectionToolbar: DataTableBulkActions,
  Export: DataTableExport,
  Search: DataTableSearch,
  ViewOptions: DataTableViewOptions,
  Grouping: DataTableGrouping,
});

export type DataTableComponent = typeof DataTable;

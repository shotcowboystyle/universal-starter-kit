import type { Row, Table } from '@tanstack/react-table';

/**
 * Rows as the user currently sees them: the sorted (post-filter) row model,
 * flattened to leaf rows so group-header rows never leak downstream.
 * Pagination is intentionally NOT applied — "current view" means everything
 * matching the active filters in the visible order, not just the visible
 * page. Shared by DataTableExport (file contents) and DataTableGrouping
 * (group building) so both stay in lockstep with what the table shows
 * (LC-16 one implementation).
 */
export const getViewLeafRows = <T>(table: Table<T>): T[] => {
  try {
    const leaves: T[] = [];
    const walk = (rows: Row<T>[]) => {
      for (const row of rows) {
        if (row.getIsGrouped()) {
          walk(row.subRows);
        } else {
          leaves.push(row.original);
        }
      }
    };
    walk(table.getSortedRowModel().rows);
    return leaves;
  } catch {
    return [];
  }
};

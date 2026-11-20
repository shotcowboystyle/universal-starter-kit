/**
 * TableCellContext - re-exported from @repo/table-primitives.
 *
 * The canonical TableCellContext lives in `@repo/table-primitives`.
 * This re-export ensures forms field components share the same context instance
 * as Table.Cell, so chromeless rendering detection works correctly.
 */

export {
  TableCellContext,
  useTableCellContext,
  useIsInTableCell,
  type TableCellContextValue,
} from '@repo/table-primitives';

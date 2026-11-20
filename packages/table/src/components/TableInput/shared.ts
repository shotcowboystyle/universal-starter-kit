/** Shared TableInput internals (web + native). */

import type { DataTableColumn, DataTableData } from '../../types';

let rowIdCounter = 0;

/**
 * Collision-free generated row id. `Date.now()` alone collides when two rows
 * are added in the same millisecond (double-click on Add Row); the monotonic
 * suffix keeps ids unique within a session.
 */
export const generateRowId = (): string => {
  rowIdCounter += 1;
  return `row-${Date.now()}-${rowIdCounter}`;
};

/** Rows rendered by the skeleton branch. */
export const SKELETON_ROW_COUNT = 3;

/** Required-validator emptiness for row arrays (default only catches null/""). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- required-validator hook receives the raw field value of any type
export const isEmptyRows = (value: unknown): boolean =>
  value === null || value === undefined || (Array.isArray(value) && value.length === 0);

/** DOM hooks for grid keyboard (Tab-on-last-adds-row, arrow between rows). */
export const childRowAttrs = {
  row: 'data-child-row',
  rowId: 'data-child-row-id',
  rowIndex: 'data-child-row-index',
  columnId: 'data-column-id',
  lastInput: 'data-last-input',
  field: 'data-field',
  active: 'data-active',
} as const;

const STEPPER_FIELD = 'stepper';

/**
 * Grid keyboard: Tab on the last data cell of the last row
 * inserts a row; Up/Down move to the same column in the adjacent row.
 * Returns the action the grid should take, or null when the event is not ours
 * (textarea, stepper, open listbox, etc.).
 */
export const childTableKeyAction = (
  e: {
    key: string;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  },
  ctx: {
    rowIndex: number;
    rowCount: number;
    columnId: string | null;
    inLastDataCell: boolean;
    field: string | null;
    tagName: string;
    listboxOpen: boolean;
    canAddRow: boolean;
  },
): { type: 'addRow' } | { type: 'move'; rowIndex: number; columnId: string } | null => {
  if (e.altKey || e.metaKey || e.ctrlKey) {
    return null;
  }
  if (ctx.tagName === 'TEXTAREA') {
    return null;
  }
  if (ctx.field === STEPPER_FIELD) {
    return null;
  }
  if (ctx.listboxOpen) {
    return null;
  }

  if (e.key === 'Tab' && !e.shiftKey) {
    if (ctx.inLastDataCell && ctx.rowIndex === ctx.rowCount - 1 && ctx.canAddRow) {
      return { type: 'addRow' };
    }
    return null;
  }

  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
    return null;
  }
  if (ctx.columnId === null || ctx.columnId === '') {
    return null;
  }
  const next = e.key === 'ArrowDown' ? ctx.rowIndex + 1 : ctx.rowIndex - 1;
  if (next < 0 || next >= ctx.rowCount) {
    return null;
  }
  return { type: 'move', rowIndex: next, columnId: ctx.columnId };
};

/**
 * Per-row cell visibility (a per-row rule evaluated by the caller). True hides that cell's editor in the grid and its field in the
 * row detail editor.
 */
export type ChildCellHidden<TData extends DataTableData = DataTableData> = (
  row: TData,
  columnId: string,
  rowIndex: number,
) => boolean;

/** Row-data key a column reads (accessorKey, else id). */
export const columnKey = <TData extends DataTableData>(col: DataTableColumn<TData>): string =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- accessorKey is `keyof TData` (string | number | symbol); only a string is used verbatim
  typeof col.accessorKey === 'string' ? col.accessorKey : (col.id ?? String(col.accessorKey));

/** Column keys whose value differs between two versions of a row. */
export const changedColumns = <TData extends DataTableData>(
  before: TData,
  after: TData,
  columns: DataTableColumn<TData>[],
): string[] => {
  const changed: string[] = [];
  for (const col of columns) {
    const key = columnKey(col);
    if (!Object.is(before[key], after[key])) {
      changed.push(key);
    }
  }
  return changed;
};

/**
 * DG-TBL-01 — default column alignment by field / data type.
 *
 * numbers/currency → right, text → left, actions → right.
 * Explicit `align` (or meta.align) always wins.
 */

import type { DataTableField, DataTableFieldProps } from '../types';

export type ColumnAlign = 'left' | 'center' | 'right';

export interface ColumnAlignInput {
  id?: string;
  align?: ColumnAlign;
  field?: DataTableField;
  fieldProps?: Pick<DataTableFieldProps, 'currency'> | DataTableFieldProps;
  meta?: { align?: ColumnAlign; role?: string };
}

const NUMERIC_FIELDS = new Set<DataTableField>([
  'stepper',
  'slider',
  'progress',
  'duration',
  // A money column right-aligns on its own, without needing a column-level
  // `currency` constant — a ledger reads its code off each row (MPO-252).
  'money',
]);

/** Booleans + icon-like metrics (EUI: center symbols). */
const CENTER_FIELDS = new Set<DataTableField>(['checkbox', 'switch', 'rating']);

function isActionsColumn(column: ColumnAlignInput): boolean {
  if (column.meta?.role === 'actions') {
    return true;
  }
  const id = column.id ?? '';
  return id === 'actions' || id.endsWith('_actions') || id.endsWith(':actions');
}

function isCurrencyColumn(column: ColumnAlignInput): boolean {
  return column.fieldProps?.currency != null && column.fieldProps.currency !== '';
}

function isNumericColumn(column: ColumnAlignInput): boolean {
  if (isCurrencyColumn(column)) {
    return true;
  }
  return column.field != null && NUMERIC_FIELDS.has(column.field);
}

/** Resolve smart-default column alignment (DG-TBL-01). */
export function getDefaultColumnAlign(column: ColumnAlignInput): ColumnAlign {
  if (column.align) {
    return column.align;
  }
  if (column.meta?.align) {
    return column.meta.align;
  }
  if (isActionsColumn(column)) {
    return 'right';
  }
  if (isNumericColumn(column)) {
    return 'right';
  }
  if (column.field && CENTER_FIELDS.has(column.field)) {
    return 'center';
  }
  return 'left';
}

/** Map ColumnAlign → Tamagui/flex justifyContent. */
export function alignToFlex(align?: ColumnAlign): 'flex-start' | 'center' | 'flex-end' {
  switch (align) {
    case 'center': {
      return 'center';
    }
    case 'right': {
      return 'flex-end';
    }
    default: {
      return 'flex-start';
    }
  }
}

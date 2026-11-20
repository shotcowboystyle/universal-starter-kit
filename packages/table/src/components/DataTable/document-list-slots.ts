/**
 * Document-list slot taxonomy (Polaris Index, not a grid).
 *
 * A list row is subject-led: title + stacked muted meta, then a trailing
 * indicator cluster and actions. Remaining columns never lay out as equal
 * grid tracks — that is the table layout.
 */

import type { DataTableColumn, DataTableField } from '../../types';

export type DocumentListSlot = 'title' | 'indicator' | 'meta' | 'actions' | 'skip';

const INDICATOR_FIELDS = new Set<DataTableField>(['select', 'combobox', 'togglegroup', 'radiogroup']);

const INDICATOR_IDS = new Set(['status', 'priority', 'workflow_state', 'state']);

export const classifyDocumentListSlot = (cell: { column: { id: string; columnDef: unknown } }): DocumentListSlot => {
  const { id } = cell.column;
  // SAFETY: every DataTable column def is built from a DataTableColumn
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
  const def = cell.column.columnDef as DataTableColumn;
  const role = def.meta?.role;
  if (role === 'title') {
    return 'title';
  }
  if (role === 'indicator') {
    return 'indicator';
  }
  if (role === 'actions') {
    return 'actions';
  }
  if (role === 'hidden' || role === 'skip') {
    return 'skip';
  }
  if (id.startsWith('_')) {
    return 'actions';
  }
  if (INDICATOR_IDS.has(id) || (def.field != null && INDICATOR_FIELDS.has(def.field))) {
    return 'indicator';
  }
  return 'meta';
};

export const partitionDocumentListCells = <TCell extends { id: string; column: { id: string; columnDef: unknown } }>(
  visibleCells: TCell[],
  titleCell: TCell | undefined,
) => {
  const rest = visibleCells.filter((cell) => cell.id !== titleCell?.id);
  const indicators: TCell[] = [];
  const metas: TCell[] = [];
  const actions: TCell[] = [];
  for (const cell of rest) {
    const slot = classifyDocumentListSlot(cell);
    if (slot === 'indicator') {
      indicators.push(cell);
    } else if (slot === 'actions') {
      actions.push(cell);
    } else if (slot === 'skip' || slot === 'title') {
      continue;
    } else {
      metas.push(cell);
    }
  }
  return { indicators, metas, actions };
};

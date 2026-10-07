/**
 * What a record page draws from one record, its linked rows and the list it
 * sits in: pure, no React, no IO.
 */
import type { FrappeListFacet } from '../list/listState';

type Row = Record<string, unknown>;

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a ?? '').localeCompare(String(b ?? ''));
}

/** Rows ordered ascending by each key in turn. */
export function sortRows<TRow extends Row>(rows: readonly TRow[], keys: readonly string[]): TRow[] {
  if (keys.length === 0) {
    return [...rows];
  }
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const order = compareValues(a[key], b[key]);
      if (order !== 0) {
        return order;
      }
    }
    return 0;
  });
}

export interface RowGroup<TRow> {
  value: string;
  rows: TRow[];
}

/** Rows grouped by a field, groups in the order their values first appear. */
export function groupRows<TRow extends Row>(rows: readonly TRow[], field: string): RowGroup<TRow>[] {
  const groups = new Map<string, TRow[]>();
  for (const row of rows) {
    const value = String(row[field] ?? '');
    const group = groups.get(value);
    if (group) {
      group.push(row);
    } else {
      groups.set(value, [row]);
    }
  }
  return [...groups].map(([value, grouped]) => ({ value, rows: grouped }));
}

/** A facet's values on one record: its linked rows in order, or its own field. */
export function recordFacetValues(
  facet: Pick<FrappeListFacet, 'doctype' | 'field' | 'orderBy'>,
  doc: Row,
  connections: Record<string, readonly Row[]>,
): string[] {
  if (!facet.doctype) {
    const own = doc[facet.field];
    return own === undefined || own === null || own === '' ? [] : [String(own)];
  }
  const rows = connections[facet.doctype] ?? [];
  return sortRows(rows, facet.orderBy ? [facet.orderBy] : [])
    .map((row) => row[facet.field])
    .filter((value): value is string | number => value !== undefined && value !== null)
    .map(String);
}

export interface AdjacentRecords<TRow> {
  prev: TRow | null;
  next: TRow | null;
}

/** The records either side of `name` in the list's order, without wrapping. */
export function adjacentRecords<TRow extends { name?: string }>(
  rows: readonly TRow[],
  name: string,
): AdjacentRecords<TRow> {
  const index = rows.findIndex((row) => row.name === name);
  if (index === -1) {
    return { prev: null, next: null };
  }
  return {
    prev: index > 0 ? (rows[index - 1] ?? null) : null,
    next: index < rows.length - 1 ? (rows[index + 1] ?? null) : null,
  };
}

export interface RecordHistoryEntry {
  kind: 'modified' | 'created';
  author: string;
  timestamp: string;
}

/** The record's own audit trail, newest first; an edit only when one happened. */
export function recordHistory(doc: Row): RecordHistoryEntry[] {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const creation = text(doc.creation);
  const modified = text(doc.modified);
  const owner = text(doc.owner);
  const modifiedBy = text(doc.modified_by) || owner;
  const entries: RecordHistoryEntry[] = [];
  if (modified && modified !== creation && modifiedBy) {
    entries.push({ kind: 'modified', author: modifiedBy, timestamp: modified });
  }
  if (creation) {
    entries.push({ kind: 'created', author: owner, timestamp: creation });
  }
  return entries;
}

export interface ChildBar {
  key: string;
  value: number;
}

/** A child table's rows as bars, in the declared order first, and their sum. */
export function childBars(
  rows: readonly Row[],
  { label, value, order = [] }: { label: string; value: string; order?: readonly string[] },
): { bars: ChildBar[]; total: number } {
  const rank = (row: Row) => {
    const index = order.indexOf(String(row[label] ?? ''));
    return index === -1 ? order.length : index;
  };
  const ranked = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index);
  const bars = ranked.map(({ row }) => ({
    key: String(row[label] ?? ''),
    value: typeof row[value] === 'number' ? row[value] : Number(row[value]) || 0,
  }));
  return { bars, total: bars.reduce((sum, bar) => sum + bar.value, 0) };
}

/**
 * What a record page draws from one record, its linked rows and the list it
 * sits in: pure, no React, no IO.
 */
import type { FrappeListFacet } from '../list/list-state';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- rows are DocType-defined; fields are only known from the page config
type Row = Record<string, unknown>;

/** A row cell as text, the way the list renders it (missing → ''). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- reads a cell of an untyped DocType row
const cellText = (value: unknown): string =>
  // oxlint-disable-next-line typescript/no-base-to-string -- cells are scalar JSON values from the server
  String(value ?? '');

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- compares cells of untyped DocType rows
const compareValues = (a: unknown, b: unknown): number => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- numeric cells sort by value, everything else as text
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return cellText(a).localeCompare(cellText(b));
};

/** Rows ordered ascending by each key in turn. */
export const sortRows = <TRow extends Row>(rows: readonly TRow[], keys: readonly string[]): TRow[] => {
  if (keys.length === 0) {
    return [...rows];
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is not guaranteed on every Hermes/GJS runtime this ships to
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const order = compareValues(a[key], b[key]);
      if (order !== 0) {
        return order;
      }
    }
    return 0;
  });
};

export interface RowGroup<TRow> {
  value: string;
  rows: TRow[];
}

/** Rows grouped by a field, groups in the order their values first appear. */
export const groupRows = <TRow extends Row>(rows: readonly TRow[], field: string): RowGroup<TRow>[] => {
  const groups = new Map<string, TRow[]>();
  for (const row of rows) {
    const value = cellText(row[field]);
    const group = groups.get(value);
    if (group) {
      group.push(row);
    } else {
      groups.set(value, [row]);
    }
  }
  return [...groups].map(([value, grouped]) => ({ value, rows: grouped }));
};

/** A facet's values on one record: its linked rows in order, or its own field. */
export const recordFacetValues = (
  facet: Pick<FrappeListFacet, 'doctype' | 'field' | 'orderBy'>,
  doc: Row,
  connections: Record<string, readonly Row[]>,
): string[] => {
  if (facet.doctype === undefined || facet.doctype === '') {
    const own = doc[facet.field];
    return own === undefined || own === null || own === '' ? [] : [cellText(own)];
  }
  const rows = connections[facet.doctype] ?? [];
  return sortRows(rows, facet.orderBy !== undefined && facet.orderBy !== '' ? [facet.orderBy] : [])
    .map((row) => row[facet.field])
    .filter((value): value is string | number => value !== undefined && value !== null)
    .map(String);
};

export interface AdjacentRecords<TRow> {
  prev: TRow | null;
  next: TRow | null;
}

/** The records either side of `name` in the list's order, without wrapping. */
export const adjacentRecords = <TRow extends { name?: string }>(
  rows: readonly TRow[],
  name: string,
): AdjacentRecords<TRow> => {
  const index = rows.findIndex((row) => row.name === name);
  if (index === -1) {
    return { prev: null, next: null };
  }
  return {
    prev: index > 0 ? (rows[index - 1] ?? null) : null,
    next: index < rows.length - 1 ? (rows[index + 1] ?? null) : null,
  };
};

export interface RecordHistoryEntry {
  kind: 'modified' | 'created';
  author: string;
  timestamp: string;
}

/** A string cell, or '' when the cell is missing or not a string. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- reads a cell of an untyped DocType row
const stringCell = (value: unknown): string =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the audit fields are strings when present
  typeof value === 'string' ? value : '';

/** The record's own audit trail, newest first; an edit only when one happened. */
export const recordHistory = (doc: Row): RecordHistoryEntry[] => {
  const creation = stringCell(doc.creation);
  const modified = stringCell(doc.modified);
  const owner = stringCell(doc.owner);
  const modifiedBy = stringCell(doc.modified_by) || owner;
  const entries: RecordHistoryEntry[] = [];
  if (modified && modified !== creation && modifiedBy) {
    entries.push({ kind: 'modified', author: modifiedBy, timestamp: modified });
  }
  if (creation) {
    entries.push({ kind: 'created', author: owner, timestamp: creation });
  }
  return entries;
};

export interface ChildBar {
  key: string;
  value: number;
}

export interface ChildBars {
  bars: ChildBar[];
  total: number;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- reads a cell of an untyped DocType row
const numberCell = (value: unknown): number =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- numeric cells pass through; text cells are parsed
  typeof value === 'number' ? value : Number(value) || 0;

/** A child table's rows as bars, in the declared order first, and their sum. */
export const childBars = (
  rows: readonly Row[],
  { label, value, order = [] }: { label: string; value: string; order?: readonly string[] },
): ChildBars => {
  const rank = (row: Row) => {
    const index = order.indexOf(cellText(row[label]));
    return index === -1 ? order.length : index;
  };
  const ranked = rows
    .map((row, index) => ({ row, index }))
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts the fresh mapped array; toSorted is not guaranteed on every Hermes/GJS runtime this ships to
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index);
  const bars = ranked.map(({ row }) => ({ key: cellText(row[label]), value: numberCell(row[value]) }));
  return { bars, total: bars.reduce((sum, bar) => sum + bar.value, 0) };
};

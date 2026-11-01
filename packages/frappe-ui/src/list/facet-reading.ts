/**
 * How a facet's values are read: which rows, and how they fold into each
 * record's values and each value's record count. Pure: no React, no IO.
 */
import type { FrappeConnection } from '../frappe-connections';

import type { FrappeListFacet } from './list-state';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- rows of any doctype; the facet names the fields read from them at runtime
type Row = Record<string, unknown>;

export interface FacetReading {
  /** Record name to its values, ordered by the facet's `orderBy`. */
  values: ReadonlyMap<string, string[]>;
  /** Value to the number of records carrying it. */
  counts: Readonly<Record<string, number>>;
}

export interface FacetRead {
  /** The doctype whose rows carry the facet's field. */
  doctype: string;
  /** The field of those rows naming the record; "name" on the list doctype. */
  linkField: string;
  options: { fields: string[]; limit: number };
  /** False while a connection doctype's link is still unknown. */
  ready: boolean;
}

/**
 * The read behind a facet. A connection doctype's read asks for the fields
 * its declared connection reads too, so both share one collection.
 */
export const facetRead = (
  facet: FrappeListFacet,
  doctype: string,
  connections: readonly FrappeConnection[] | undefined,
  limit: number | undefined,
): FacetRead => {
  const onConnection = facet.doctype !== undefined && facet.doctype !== '';
  const link = onConnection ? connections?.find((candidate) => candidate.doctype === facet.doctype) : undefined;
  const linkField = onConnection ? (link?.fieldname ?? '') : 'name';
  const fields = new Set<string>(['name', linkField, facet.field]);
  if (facet.orderBy !== undefined && facet.orderBy !== '') {
    fields.add(facet.orderBy);
  }
  for (const field of link?.fields ?? []) {
    fields.add(field);
  }
  fields.delete('');
  return {
    doctype: facet.doctype ?? doctype,
    linkField,
    options: { fields: [...fields], limit: onConnection ? (link?.limit ?? 0) : (limit ?? 0) },
    ready: !onConnection || link !== undefined,
  };
};

export const readFacet = (facet: FrappeListFacet, linkField: string, rows: readonly Row[]): FacetReading => {
  const byRecord = new Map<string, { value: string; order: number }[]>();
  for (const row of rows) {
    const record = row[linkField];
    const value = row[facet.field];
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- row values are untyped doctype fields; only a non-empty string names a record
    const named = typeof record === 'string' && record !== '';
    if (!named || value === null || value === undefined || value === '') {
      continue;
    }
    const { orderBy } = facet;
    const entry = byRecord.get(record) ?? [];
    entry.push({
      // oxlint-disable-next-line typescript/no-base-to-string -- facet values are scalar wire values (string / number)
      value: String(value),
      order: Number(orderBy !== undefined && orderBy !== '' ? row[orderBy] : 0) || 0,
    });
    byRecord.set(record, entry);
  }
  const values = new Map<string, string[]>();
  const counts: Record<string, number> = {};
  for (const [record, entries] of byRecord) {
    const ordered = [...new Set(entries.toSorted((a, b) => a.order - b.order).map((e) => e.value))];
    values.set(record, ordered);
    for (const value of ordered) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return { values, counts };
};

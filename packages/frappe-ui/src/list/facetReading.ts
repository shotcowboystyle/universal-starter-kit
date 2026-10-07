/**
 * How a facet's values are read: which rows, and how they fold into each
 * record's values and each value's record count. Pure: no React, no IO.
 */
import type { FrappeConnection } from '../frappeConnections';

import type { FrappeListFacet } from './listState';

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
export function facetRead(
  facet: FrappeListFacet,
  doctype: string,
  connections: readonly FrappeConnection[] | undefined,
  limit: number | undefined,
): FacetRead {
  const link = facet.doctype ? connections?.find((candidate) => candidate.doctype === facet.doctype) : undefined;
  const linkField = facet.doctype ? (link?.fieldname ?? '') : 'name';
  const fields = new Set<string>(['name', linkField, facet.field]);
  if (facet.orderBy) {
    fields.add(facet.orderBy);
  }
  for (const field of link?.fields ?? []) {
    fields.add(field);
  }
  fields.delete('');
  return {
    doctype: facet.doctype ?? doctype,
    linkField,
    options: { fields: [...fields], limit: facet.doctype ? (link?.limit ?? 0) : (limit ?? 0) },
    ready: !facet.doctype || Boolean(link),
  };
}

export function readFacet(facet: FrappeListFacet, linkField: string, rows: readonly Row[]): FacetReading {
  const byRecord = new Map<string, { value: string; order: number }[]>();
  for (const row of rows) {
    const record = row[linkField];
    const value = row[facet.field];
    if (typeof record !== 'string' || !record || value === null || value === undefined) {
      continue;
    }
    if (value === '') {
      continue;
    }
    const entry = byRecord.get(record) ?? [];
    entry.push({
      value: String(value),
      order: Number(facet.orderBy ? row[facet.orderBy] : 0) || 0,
    });
    byRecord.set(record, entry);
  }
  const values = new Map<string, string[]>();
  const counts: Record<string, number> = {};
  for (const [record, entries] of byRecord) {
    const ordered = [...new Set(entries.sort((a, b) => a.order - b.order).map((e) => e.value))];
    values.set(record, ordered);
    for (const value of ordered) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return { values, counts };
}

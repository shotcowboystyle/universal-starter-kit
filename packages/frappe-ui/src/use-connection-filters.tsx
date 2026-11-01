import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { FrappeConnection } from './frappe-connections';
import { FrappeRowsReader } from './FrappeRowsReader';
import type { FrappeRowsSnapshot } from './FrappeRowsReader';
import type { FrappeRowsConnection } from './use-frappe-rows';

/** `[field, operator, value]` on the doctype itself. */
export type FrappeFieldFilter = [string, string, unknown];
/** `[doctype, field, operator, value]`: Frappe's filter on another doctype's rows. */
export type FrappeDoctypeFilter = [string, string, string, unknown];
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Frappe filter operands are arbitrary field values, passed through to the server as-is
export type FrappeFilters = Record<string, unknown> | (FrappeFieldFilter | FrappeDoctypeFilter)[];

export interface ConnectionFiltersResult {
  /**
   * The filters to send: the doctype's own, plus one `["name", "in", names]`
   * per connection filtered on. A `[doctype, …]` filter on a doctype that is
   * no declared connection passes through untouched (a child table, which
   * the bench joins itself).
   */
  filters: FrappeFilters | undefined;
  /** A connection's rows are still being read; the result is not known yet. */
  pending: boolean;
  error: Error | null;
  /** Mount these: one reader per connection filtered on. */
  readers: React.ReactNode;
}

interface LinkedFilter {
  connection: FrappeConnection;
  conditions: FrappeFieldFilter[];
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a connection's linked rows are read by a fieldname known only at runtime
type Snapshot = FrappeRowsSnapshot<Record<string, unknown> & { name: string; doctype: string }>;

/**
 * Resolves filters on a connection (Pokemon by `Pokemon Poke Type.poke_type`)
 * into a filter on the doctype itself. Frappe's four-part filter joins child
 * tables on the server; a standalone doctype linking back through a Link field
 * is no child table, so the linked rows are read live here and their link
 * values become `name in (...)`. Several conditions on one connection hold on
 * the same linked row, as they do for a child table.
 */
const ownFilterList = (own: FrappeFilters | undefined): (FrappeFieldFilter | FrappeDoctypeFilter)[] => {
  if (Array.isArray(own)) {
    return own;
  }
  if (own === undefined) {
    return [];
  }
  return Object.entries(own).map(([field, value]): FrappeFieldFilter => [field, '=', value]);
};

export const useConnectionFilters = (
  connection: FrappeRowsConnection | undefined,
  doctype: string,
  filters: FrappeFilters | undefined,
  /** `undefined` while the declaration is still loading (meta.links). */
  connections: readonly FrappeConnection[] | undefined,
): ConnectionFiltersResult => {
  const filtersKey = JSON.stringify(filters ?? null);
  const connectionsKey = JSON.stringify(connections ?? null);

  const { own, linked, undeclared } = useMemo(() => {
    // SAFETY: filtersKey is JSON.stringify of a `FrappeFilters | undefined` (undefined → null) built above
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const parsed = JSON.parse(filtersKey) as FrappeFilters | null;
    // SAFETY: connectionsKey is JSON.stringify of a `FrappeConnection[] | undefined` (undefined → null) built above
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const declaredList = JSON.parse(connectionsKey) as FrappeConnection[] | null;
    const declared = declaredList ?? [];
    const noLinks: LinkedFilter[] = [];
    if (!parsed || !Array.isArray(parsed)) {
      return { own: parsed ?? undefined, linked: noLinks, undeclared: false };
    }
    let waitsOnDeclaration = false;
    const ownFilters: (FrappeFieldFilter | FrappeDoctypeFilter)[] = [];
    const byDoctype = new Map<string, LinkedFilter>();
    // oxlint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- each filter routes to exactly one bucket; early continues keep the routing flat
    for (const filter of parsed) {
      if (filter.length !== 4) {
        ownFilters.push(filter);
        continue;
      }
      const [target, field, operator, value] = filter;
      if (target === doctype) {
        ownFilters.push([field, operator, value]);
        continue;
      }
      // oxlint-disable-next-line react-doctor/js-index-maps -- a doctype declares a handful of connections; find keeps first-match semantics
      const declaration = declared.find((candidate) => candidate.doctype === target);
      if (!declaration) {
        if (!declaredList) {
          waitsOnDeclaration = true;
        }
        ownFilters.push(filter);
        continue;
      }
      const entry = byDoctype.get(target) ?? { connection: declaration, conditions: [] };
      entry.conditions.push([field, operator, value]);
      byDoctype.set(target, entry);
    }
    return { own: ownFilters, linked: [...byDoctype.values()], undeclared: waitsOnDeclaration };
  }, [filtersKey, connectionsKey, doctype]);

  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const handlers = useRef(new Map<string, (snapshot: Snapshot) => void>());
  const handlerFor = useCallback((key: string) => {
    let handler = handlers.current.get(key);
    if (!handler) {
      handler = (snapshot: Snapshot) => {
        setSnapshots((prev) => ({ ...prev, [key]: snapshot }));
      };
      handlers.current.set(key, handler);
    }
    return handler;
  }, []);

  const reads = useMemo(
    () =>
      linked.map(({ connection: link, conditions }) => ({
        key: JSON.stringify([link.doctype, link.fieldname, conditions]),
        link,
        options: {
          fields: ['name', link.fieldname],
          filters: conditions,
          limit: link.limit ?? 0,
        },
      })),
    [linked],
  );

  return useMemo(() => {
    // oxlint-disable-next-line react/refs -- handlerFor caches one stable callback per key in a ref; it never changes render output
    const readers = reads.map((read) => (
      <FrappeRowsReader
        key={read.key}
        connection={connection}
        doctype={read.link.doctype}
        options={read.options}
        onChange={handlerFor(read.key)}
      />
    ));
    if (reads.length === 0) {
      return { filters: own, pending: undeclared, error: null, readers };
    }
    let names: Set<string> | undefined;
    let pending = false;
    let error: Error | null = null;
    // oxlint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- each read is either pending, failed or contributes names; early continues keep it flat
    for (const read of reads) {
      const snapshot: Snapshot | undefined = snapshots[read.key];
      if (snapshot === undefined || snapshot.isLoading) {
        pending = true;
        continue;
      }
      if (snapshot.error) {
        // oxlint-disable-next-line eslint/logical-assignment-operators -- the React compiler rejects ??= (react/todo); keeps the first failure
        error = error ?? snapshot.error;
        continue;
      }
      const linkedNames = new Set(
        snapshot.rows
          .map((row) => row[read.link.fieldname])
          .filter((value): value is string => typeof value === 'string' && value !== ''),
      );
      names = names ? new Set([...names].filter((name) => linkedNames.has(name))) : linkedNames;
    }
    const resolved: (FrappeFieldFilter | FrappeDoctypeFilter)[] = [
      ...ownFilterList(own),
      ['name', 'in', [...(names ?? [])].toSorted()],
    ];
    return { filters: resolved, pending: (pending || undeclared) && !error, error, readers };
  }, [reads, snapshots, own, undeclared, connection, handlerFor]);
};

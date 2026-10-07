import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { FrappeConnection } from './frappeConnections';
import { FrappeRowsReader } from './FrappeRowsReader';
import type { FrappeRowsSnapshot } from './FrappeRowsReader';
import type { FrappeRowsConnection } from './useFrappeRows';

/** `[field, operator, value]` on the doctype itself. */
export type FrappeFieldFilter = [string, string, unknown];
/** `[doctype, field, operator, value]`: Frappe's filter on another doctype's rows. */
export type FrappeDoctypeFilter = [string, string, string, unknown];
export type FrappeFilters = Record<string, unknown> | (FrappeFieldFilter | FrappeDoctypeFilter)[];

export interface ConnectionFiltersResult {
  /**
   * The filters to send: the doctype's own, plus one `["name", "in", names]`
   * per connection filtered on. A `[doctype, …]` filter on a doctype that is
   * no declared connection passes through untouched (a child table, which
   * the bench joins itself).
   */
  filters: Record<string, unknown> | (FrappeFieldFilter | FrappeDoctypeFilter)[] | undefined;
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

type Snapshot = FrappeRowsSnapshot<Record<string, unknown> & { name: string; doctype: string }>;

/**
 * Resolves filters on a connection (Pokemon by `Pokemon Poke Type.poke_type`)
 * into a filter on the doctype itself. Frappe's four-part filter joins child
 * tables on the server; a standalone doctype linking back through a Link field
 * is no child table, so the linked rows are read live here and their link
 * values become `name in (...)`. Several conditions on one connection hold on
 * the same linked row, as they do for a child table.
 */
export function useConnectionFilters(
  connection: FrappeRowsConnection | undefined,
  doctype: string,
  filters: FrappeFilters | undefined,
  /** `undefined` while the declaration is still loading (meta.links). */
  connections: readonly FrappeConnection[] | undefined,
): ConnectionFiltersResult {
  const filtersKey = JSON.stringify(filters ?? null);
  const connectionsKey = JSON.stringify(connections ?? null);

  const { own, linked, undeclared } = useMemo(() => {
    const parsed = JSON.parse(filtersKey) as FrappeFilters | null;
    const declaredList = JSON.parse(connectionsKey) as FrappeConnection[] | null;
    const declared = declaredList ?? [];
    if (!parsed || !Array.isArray(parsed)) {
      return { own: parsed ?? undefined, linked: [] as LinkedFilter[], undeclared: false };
    }
    let waitsOnDeclaration = false;
    const ownFilters: (FrappeFieldFilter | FrappeDoctypeFilter)[] = [];
    const byDoctype = new Map<string, LinkedFilter>();
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
    const readers = reads.map((read) => (
      <FrappeRowsReader
        key={read.key}
        connection={connection}
        doctype={read.link.doctype}
        options={read.options as never}
        onChange={handlerFor(read.key)}
      />
    ));
    if (reads.length === 0) {
      return { filters: own, pending: undeclared, error: null, readers };
    }
    let names: Set<string> | undefined;
    let pending = false;
    let error: Error | null = null;
    for (const read of reads) {
      const snapshot = snapshots[read.key];
      if (!snapshot || snapshot.isLoading) {
        pending = true;
        continue;
      }
      if (snapshot.error) {
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
    const ownList = Array.isArray(own)
      ? own
      : own
        ? Object.entries(own).map(([field, value]) => [field, '=', value] as FrappeFieldFilter)
        : [];
    const resolved: (FrappeFieldFilter | FrappeDoctypeFilter)[] = [
      ...ownList,
      ['name', 'in', [...(names ?? [])].sort()],
    ];
    return { filters: resolved, pending: (pending || undeclared) && !error, error, readers };
  }, [reads, snapshots, own, undeclared, connection, handlerFor]);
}

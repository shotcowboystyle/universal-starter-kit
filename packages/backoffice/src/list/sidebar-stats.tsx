/**
 * Data layer for the desk list-sidebar facets (Assigned To / Created By /
 * Tags / status field), verified against a live bench:
 *
 * - `frappe.desk.listview.get_group_by_count` (POST {doctype,
 *   current_filters, field}) → `{ message: [{ name, count }] }`, ordered by
 *   count desc. For `field: "assigned_to"` the server aggregates the ToDo
 *   assignment table per user (System Users, non-cancelled assignments) —
 *   the proper desk semantics for the JSON-array `_assign` column. Used for
 *   the Assigned To and Created By facets (desk list_sidebar_group_by.js
 *   parity, including the Guest/Administrator scrub and "Me" pinning).
 *
 * - `frappe.desk.reportview.get_sidebar_stats` (POST {stats, doctype,
 *   filters}) → `{ message: { stats: { [fieldname]: [label, count][] } } }`.
 *   `_user_tags` entries are per-tag (comma-split server-side) plus a
 *   trailing translated `["No Tags", n]` row; other columns are raw grouped
 *   values (empties excluded server-side). Used for the Tags and status
 *   facets. NOTE: `stats` and `filters` MUST be JSON-encoded strings — the
 *   endpoint json.loads() them and 500s on raw arrays.
 *
 * Desk parity on filter context: each facet's counts are computed with
 * every OTHER active filter applied (tuples on the facet's own fieldname
 * excluded), mirroring desk's group-by sidebar behavior.
 */
import { matchesFilters } from '@repo/frappe';
import type { FrappeApp } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type { FrappeFilter, FrappeFilters } from '../shared/types';
import { useFrappeApp } from '../shared/useFrappeApp';

/**
 * Server-side label of the pseudo tag row (frappe translates it, so this
 * detection — like desk's own `label == "No Tags"` compare — only works on
 * English benches; non-English benches show it as a regular tag row).
 */
export const NO_TAGS_LABEL = 'No Tags';

export interface SidebarFacetCount {
  /** Raw facet value (user id, tag, status value). */
  value: string;
  count: number;
  /** True for the server's synthetic "No Tags" row. */
  isNoTags?: boolean;
}

export interface SidebarFacetState {
  /** Undefined while loading or when the facet errored / is unavailable. */
  rows?: SidebarFacetCount[];
  loading: boolean;
  error?: Error;
}

export interface SidebarStatsState {
  /** Unscrubbed user rows — pass through scrubUserFacetRows() to render. */
  assigned: SidebarFacetState;
  /** Unscrubbed user rows — pass through scrubUserFacetRows() to render. */
  owner: SidebarFacetState;
  tags: SidebarFacetState;
  status: SidebarFacetState;
}

export interface UseSidebarStatsOptions {
  doctype: string;
  /** Current list filters — each facet excludes its own fieldname's tuples. */
  filters: FrappeFilters;
  /** Fieldname of the doctype's status/workflow Select field, when present. */
  statusFieldname?: string;
}

/** Tuples on `fieldname` removed — the "other" filters for that facet. */
export function filtersExcludingField(filters: FrappeFilters, fieldname: string): FrappeFilters {
  return filters.filter((filter) => filter[0] !== fieldname);
}

/** Exact-tuple active check (fieldname + operator + stringified value). */
export function isFacetFilterActive(filters: FrappeFilters, tuple: FrappeFilter): boolean {
  return filters.some(
    (filter) =>
      filter[0] === tuple[0] &&
      String(filter[1]).toLowerCase() === String(tuple[1]).toLowerCase() &&
      String(filter[2]) === String(tuple[2]),
  );
}

/**
 * Desk toggle semantics (list_sidebar_group_by.js setup_filter_by): clicking
 * a row first clears every filter on that facet's fieldname, then applies
 * the row's tuple unless it was already active (toggle off / replace).
 */
export function toggleFacetFilter(filters: FrappeFilters, tuple: FrappeFilter): FrappeFilters {
  const active = isFacetFilterActive(filters, tuple);
  const rest = filtersExcludingField(filters, tuple[0]);
  return active ? rest : [...rest, tuple];
}

// ── Server fetchers ───────────────────────────────────────────

interface GroupByCountRow {
  name: string | null;
  count: number;
}

async function fetchGroupByCount(
  app: FrappeApp,
  doctype: string,
  currentFilters: FrappeFilters,
  field: 'assigned_to' | 'owner',
): Promise<SidebarFacetCount[]> {
  const res = await app.call().post<{ message?: GroupByCountRow[] }>('frappe.desk.listview.get_group_by_count', {
    doctype,
    current_filters: JSON.stringify(currentFilters),
    field,
  });
  const rows = res.payload?.message ?? [];
  // Null groups ("Not Set") and zero counts are dropped like desk does; the
  // session-user scrub happens at render time (scrubUserFacetRows) so rows
  // don't need a refetch when the session user resolves.
  return rows
    .filter((row): row is GroupByCountRow & { name: string } => !!row.name && row.count !== 0)
    .map((row) => ({ value: row.name, count: Number(row.count) || 0 }));
}

async function fetchColumnStats(
  app: FrappeApp,
  doctype: string,
  fieldname: string,
  currentFilters: FrappeFilters,
): Promise<[string, number][]> {
  const res = await app
    .call()
    .post<{ message?: { stats?: Record<string, [string, number][]> } }>('frappe.desk.reportview.get_sidebar_stats', {
      doctype,
      stats: JSON.stringify([fieldname]),
      filters: JSON.stringify(currentFilters),
    });
  return res.payload?.message?.stats?.[fieldname] ?? [];
}

/**
 * Desk scrub for the user facets (list_sidebar_group_by.js): hide the
 * Guest/Administrator noise — except the session user, who is pinned to
 * the top ("Me"). Pure, applied at render time; skipped entirely while the
 * session user is unknown so an Administrator-only bench still shows rows.
 */
export function scrubUserFacetRows(rows: SidebarFacetCount[], sessionUser?: string): SidebarFacetCount[] {
  if (!sessionUser) {
    return rows;
  }
  const current = rows.find((row) => row.value === sessionUser);
  const rest = rows.filter((row) => !['Guest', 'Administrator', sessionUser].includes(row.value));
  return current ? [current, ...rest] : rest;
}

function mapTagStats(entries: [string, number][]): SidebarFacetCount[] {
  return entries
    .map(([label, count]) => ({
      value: String(label),
      count: Number(count) || 0,
      isNoTags: String(label) === NO_TAGS_LABEL,
    }))
    .filter((row) => row.value !== '' && (!row.isNoTags || row.count > 0));
}

function mapStatusStats(entries: [string, number][]): SidebarFacetCount[] {
  return entries
    .map(([value, count]) => ({ value: String(value), count: Number(count) || 0 }))
    .filter((row) => row.value !== '')
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// ── Fixture mode (Storybook / tests) ──────────────────────────

interface FixtureLister {
  getList(doctype: string): Promise<unknown[]>;
}

function parseAssignedUsers(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((user): user is string => typeof user === 'string' && !!user);
  }
  if (typeof raw !== 'string' || !raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((user): user is string => typeof user === 'string' && !!user) : [];
  } catch {
    return [];
  }
}

function toSortedCounts(counts: Map<string, number>): SidebarFacetCount[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

interface FixtureFacets {
  assigned: SidebarFacetCount[];
  owner: SidebarFacetCount[];
  tags: SidebarFacetCount[];
  status?: SidebarFacetCount[];
}

async function fetchFixtureFacets(
  fixtures: FixtureLister,
  doctype: string,
  filters: FrappeFilters,
  statusFieldname?: string,
): Promise<FixtureFacets> {
  const all = (await fixtures.getList(doctype)) as Record<string, unknown>[];
  const rowsFor = (fieldname: string) => {
    const others = filtersExcludingField(filters, fieldname);
    if (others.length === 0) {
      return all;
    }
    // matchesFilters implements the frappe operator set (like/not like/…),
    // which the fixture provider's own getList filtering does not.
    return all.filter((row) =>
      matchesFilters(row as Parameters<typeof matchesFilters>[0], others as Parameters<typeof matchesFilters>[1]),
    );
  };

  const assignedCounts = new Map<string, number>();
  for (const row of rowsFor('_assign')) {
    for (const user of parseAssignedUsers(row._assign)) {
      assignedCounts.set(user, (assignedCounts.get(user) ?? 0) + 1);
    }
  }

  const ownerCounts = new Map<string, number>();
  for (const row of rowsFor('owner')) {
    if (typeof row.owner === 'string' && row.owner) {
      ownerCounts.set(row.owner, (ownerCounts.get(row.owner) ?? 0) + 1);
    }
  }

  const tagCounts = new Map<string, number>();
  let noTagCount = 0;
  for (const row of rowsFor('_user_tags')) {
    const tags = String((row._user_tags as string | undefined) ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length === 0) {
      noTagCount += 1;
      continue;
    }
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const tags = toSortedCounts(tagCounts);
  if (tags.length > 0 && noTagCount > 0) {
    tags.push({ value: NO_TAGS_LABEL, count: noTagCount, isNoTags: true });
  }

  let status: SidebarFacetCount[] | undefined;
  if (statusFieldname) {
    const statusCounts = new Map<string, number>();
    for (const row of rowsFor(statusFieldname)) {
      const value = row[statusFieldname];
      if (value !== undefined && value !== null && value !== '') {
        statusCounts.set(String(value), (statusCounts.get(String(value)) ?? 0) + 1);
      }
    }
    status = toSortedCounts(statusCounts);
  }

  return {
    assigned: toSortedCounts(assignedCounts),
    owner: toSortedCounts(ownerCounts),
    tags,
    status,
  };
}

// ── Hook ──────────────────────────────────────────────────────

const INITIAL_STATE: SidebarStatsState = {
  assigned: { loading: true },
  owner: { loading: true },
  tags: { loading: true },
  status: { loading: false },
};

/**
 * Facet counts for the list sidebar. Refetches whenever the doctype, the
 * (serialized) filters, or the status field change; per-facet results land
 * independently so fast facets render before slow ones.
 */
export function useSidebarStats({
  doctype,
  filters,
  statusFieldname,
}: UseSidebarStatsOptions): SidebarStatsState & { refresh: () => void } {
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const fixtures = config?.fixtures;
  const [state, setState] = useState<SidebarStatsState>(INITIAL_STATE);
  const [generation, setGeneration] = useState(0);

  // Value-identity key: list-core may pass a new array each render.
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    if (!doctype || (!app && !fixtures)) {
      return;
    }
    let cancelled = false;
    // Filter tuples round-trip through JSON on the wire anyway, so parsing
    // the key back is lossless and keeps the effect deps value-exact.
    const activeFilters = JSON.parse(filtersKey) as FrappeFilters;

    setState({
      assigned: { loading: true },
      owner: { loading: true },
      tags: { loading: true },
      status: { loading: Boolean(statusFieldname) },
    });

    const done = (key: 'assigned' | 'owner' | 'tags' | 'status', rows: SidebarFacetCount[]) => {
      if (!cancelled) {
        setState((prev) => ({ ...prev, [key]: { rows, loading: false } }));
      }
    };
    const fail = (key: 'assigned' | 'owner' | 'tags' | 'status', error: unknown) => {
      if (!cancelled) {
        setState((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          },
        }));
      }
    };

    if (fixtures) {
      fetchFixtureFacets(fixtures, doctype, activeFilters, statusFieldname)
        .then((facets) => {
          done('assigned', facets.assigned);
          done('owner', facets.owner);
          done('tags', facets.tags);
          if (statusFieldname) {
            done('status', facets.status ?? []);
          }
        })
        .catch((error) => {
          fail('assigned', error);
          fail('owner', error);
          fail('tags', error);
          if (statusFieldname) {
            fail('status', error);
          }
        });
      return () => {
        cancelled = true;
      };
    }

    const liveApp = app!;
    fetchGroupByCount(liveApp, doctype, filtersExcludingField(activeFilters, '_assign'), 'assigned_to')
      .then((rows) => {
        done('assigned', rows);
      })
      .catch((error) => {
        fail('assigned', error);
      });

    fetchGroupByCount(liveApp, doctype, filtersExcludingField(activeFilters, 'owner'), 'owner')
      .then((rows) => {
        done('owner', rows);
      })
      .catch((error) => {
        fail('owner', error);
      });

    fetchColumnStats(liveApp, doctype, '_user_tags', filtersExcludingField(activeFilters, '_user_tags'))
      .then((entries) => {
        done('tags', mapTagStats(entries));
      })
      .catch((error) => {
        fail('tags', error);
      });

    if (statusFieldname) {
      fetchColumnStats(liveApp, doctype, statusFieldname, filtersExcludingField(activeFilters, statusFieldname))
        .then((entries) => {
          done('status', mapStatusStats(entries));
        })
        .catch((error) => {
          fail('status', error);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [app, fixtures, doctype, filtersKey, statusFieldname, generation]);

  const refresh = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
}

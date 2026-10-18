/**
 * Data layer for the desk list-sidebar facets (Assigned To / Created By /
 * Tags / status field), verified against a live bench:
 *
 * - `frappe.desk.listview.get_group_by_count` (POST {doctype,
 *   current_filters, field}) → `{ message: [{ name, count }] }`, ordered by
 *   count desc. For `field: "assigned_to"` the server aggregates the to-do
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
import { useFrappeApp } from '../shared/use-frappe-app';

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
export const filtersExcludingField = (filters: FrappeFilters, fieldname: string): FrappeFilters =>
  filters.filter((filter) => filter[0] !== fieldname);

/** Exact-tuple active check (fieldname + operator + stringified value). */
export const isFacetFilterActive = (filters: FrappeFilters, tuple: FrappeFilter): boolean =>
  filters.some(
    (filter) =>
      filter[0] === tuple[0] &&
      filter[1].toLowerCase() === tuple[1].toLowerCase() &&
      String(filter[2]) === String(tuple[2]),
  );

/**
 * Desk toggle semantics (list_sidebar_group_by.js setup_filter_by): clicking
 * a row first clears every filter on that facet's fieldname, then applies
 * the row's tuple unless it was already active (toggle off / replace).
 */
export const toggleFacetFilter = (filters: FrappeFilters, tuple: FrappeFilter): FrappeFilters => {
  const active = isFacetFilterActive(filters, tuple);
  const rest = filtersExcludingField(filters, tuple[0]);
  return active ? rest : [...rest, tuple];
};

// ── Server fetchers ───────────────────────────────────────────

interface GroupByCountRow {
  name: string | null;
  count: number;
}

const fetchGroupByCount = async (
  app: FrappeApp,
  doctype: string,
  currentFilters: FrappeFilters,
  field: 'assigned_to' | 'owner',
): Promise<SidebarFacetCount[]> => {
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
    .filter((row): row is GroupByCountRow & { name: string } => row.name !== null && row.name !== '' && row.count !== 0)
    .map((row) => ({ value: row.name, count: row.count || 0 }));
};

const fetchColumnStats = async (
  app: FrappeApp,
  doctype: string,
  fieldname: string,
  currentFilters: FrappeFilters,
): Promise<[string, number][]> => {
  const res = await app
    .call()
    .post<{ message?: { stats?: Record<string, [string, number][]> } }>('frappe.desk.reportview.get_sidebar_stats', {
      doctype,
      stats: JSON.stringify([fieldname]),
      filters: JSON.stringify(currentFilters),
    });
  return res.payload?.message?.stats?.[fieldname] ?? [];
};

/**
 * Desk scrub for the user facets (list_sidebar_group_by.js): hide the
 * Guest/Administrator noise — except the session user, who is pinned to
 * the top ("Me"). Pure, applied at render time; skipped entirely while the
 * session user is unknown so an Administrator-only bench still shows rows.
 */
export const scrubUserFacetRows = (rows: SidebarFacetCount[], sessionUser?: string): SidebarFacetCount[] => {
  if (sessionUser === undefined || sessionUser === '') {
    return rows;
  }
  const current = rows.find((row) => row.value === sessionUser);
  const rest = rows.filter((row) => !['Guest', 'Administrator', sessionUser].includes(row.value));
  return current ? [current, ...rest] : rest;
};

const mapTagStats = (entries: [string, number][]): SidebarFacetCount[] => {
  const rows: SidebarFacetCount[] = [];
  for (const [label, count] of entries) {
    const row = { value: label, count: count || 0, isNoTags: label === NO_TAGS_LABEL };
    if (row.value !== '' && (!row.isNoTags || row.count > 0)) {
      rows.push(row);
    }
  }
  return rows;
};

const byCountThenValue = (a: SidebarFacetCount, b: SidebarFacetCount): number =>
  b.count - a.count || a.value.localeCompare(b.value);

const mapStatusStats = (entries: [string, number][]): SidebarFacetCount[] => {
  const rows: SidebarFacetCount[] = [];
  for (const [value, count] of entries) {
    if (value !== '') {
      rows.push({ value, count: count || 0 });
    }
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array; toSorted is not guaranteed on every Hermes runtime this ships to
  return rows.sort(byCountThenValue);
};

// ── Fixture mode (Storybook / tests) ──────────────────────────

interface FixtureLister {
  getList: (doctype: string) => Promise<unknown[]>;
}

/** Fixture rows are untyped JSON documents. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- fixture documents carry arbitrary doctype fields
type FixtureRow = Record<string, unknown>;

const isUserId = (user: unknown): user is string => typeof user === 'string' && user !== '';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- `raw` is the untyped `_assign` column (array or JSON string); this is its parser
const parseAssignedUsers = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.filter(isUserId);
  }
  if (!isUserId(raw)) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isUserId) : [];
  } catch {
    // Malformed `_assign` JSON counts as unassigned, like desk.
    return [];
  }
};

const toSortedCounts = (counts: Map<string, number>): SidebarFacetCount[] =>
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array; toSorted is not guaranteed on every Hermes runtime this ships to
  Array.from(counts.entries(), ([value, count]) => ({ value, count })).sort(byCountThenValue);

const countTags = (rows: FixtureRow[]): SidebarFacetCount[] => {
  const tagCounts = new Map<string, number>();
  let noTagCount = 0;
  for (const row of rows) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `_user_tags` of an untyped fixture row; anything but a string is untagged
    const raw = typeof row._user_tags === 'string' ? row._user_tags : '';
    const tags = raw
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
  return tags;
};

const countValues = (rows: FixtureRow[], fieldname: string): SidebarFacetCount[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[fieldname];
    if (value !== undefined && value !== null && value !== '') {
      // oxlint-disable-next-line typescript/no-base-to-string -- status/select fixture values are scalars
      const key = String(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return toSortedCounts(counts);
};

interface FixtureFacets {
  assigned: SidebarFacetCount[];
  owner: SidebarFacetCount[];
  tags: SidebarFacetCount[];
  status?: SidebarFacetCount[];
}

const fetchFixtureFacets = async (
  fixtures: FixtureLister,
  doctype: string,
  filters: FrappeFilters,
  statusFieldname?: string,
): Promise<FixtureFacets> => {
  // SAFETY: fixture getList resolves to the stored documents, which are plain objects
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const all = (await fixtures.getList(doctype)) as FixtureRow[];
  const rowsFor = (fieldname: string) => {
    const others = filtersExcludingField(filters, fieldname);
    if (others.length === 0) {
      return all;
    }
    // matchesFilters implements the frappe operator set (like/not like/…),
    // which the fixture provider's own getList filtering does not.
    // SAFETY: fixture rows are documents and FrappeFilters are the tuples matchesFilters evaluates
    return all.filter((row) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
    if (isUserId(row.owner)) {
      ownerCounts.set(row.owner, (ownerCounts.get(row.owner) ?? 0) + 1);
    }
  }

  return {
    assigned: toSortedCounts(assignedCounts),
    owner: toSortedCounts(ownerCounts),
    tags: countTags(rowsFor('_user_tags')),
    status:
      statusFieldname === undefined || statusFieldname === ''
        ? undefined
        : countValues(rowsFor(statusFieldname), statusFieldname),
  };
};

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
export const useSidebarStats = ({
  doctype,
  filters,
  statusFieldname,
}: UseSidebarStatsOptions): SidebarStatsState & { refresh: () => void } => {
  const app = useFrappeApp();
  const config = useFrappeConfig();
  const fixtures = config?.fixtures;
  const [state, setState] = useState<SidebarStatsState>(INITIAL_STATE);
  const [generation, setGeneration] = useState(0);

  // Value-identity key: list-core may pass a new array each render.
  const filtersKey = JSON.stringify(filters);

  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- the effect starts fetches; the reset below is their loading state, not derived state
  useEffect(() => {
    let cancelled = false;
    const hasStatus = statusFieldname !== undefined && statusFieldname !== '';
    // SAFETY: filtersKey is JSON.stringify(filters); filter tuples round-trip through JSON on
    // the wire anyway, so parsing the key back is lossless and keeps the effect deps value-exact.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const activeFilters = JSON.parse(filtersKey) as FrappeFilters;

    const done = (key: keyof SidebarStatsState, rows: SidebarFacetCount[]) => {
      if (!cancelled) {
        setState((prev) => ({ ...prev, [key]: { rows, loading: false } }));
      }
    };
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives whatever a failed fetch rejected with
    const fail = (key: keyof SidebarStatsState, error: unknown) => {
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
    const load = async (key: keyof SidebarStatsState, fetchRows: () => Promise<SidebarFacetCount[]>) => {
      try {
        done(key, await fetchRows());
      } catch (error) {
        // The facet renders its error state; the other facets are unaffected.
        fail(key, error);
      }
    };
    const loadFixtures = async (lister: FixtureLister) => {
      try {
        const facets = await fetchFixtureFacets(lister, doctype, activeFilters, statusFieldname);
        done('assigned', facets.assigned);
        done('owner', facets.owner);
        done('tags', facets.tags);
        if (hasStatus) {
          done('status', facets.status ?? []);
        }
      } catch (error) {
        // Every facet renders its error state.
        fail('assigned', error);
        fail('owner', error);
        fail('tags', error);
        if (hasStatus) {
          fail('status', error);
        }
      }
    };

    if (doctype !== '' && (app !== undefined || fixtures !== undefined)) {
      // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-derived-state -- resets every facet to loading as its refetch starts
      setState({
        assigned: { loading: true },
        owner: { loading: true },
        tags: { loading: true },
        status: { loading: hasStatus },
      });
      if (fixtures !== undefined) {
        void loadFixtures(fixtures);
      } else if (app !== undefined) {
        void load(
          'assigned',
          async () =>
            await fetchGroupByCount(app, doctype, filtersExcludingField(activeFilters, '_assign'), 'assigned_to'),
        );
        void load(
          'owner',
          async () => await fetchGroupByCount(app, doctype, filtersExcludingField(activeFilters, 'owner'), 'owner'),
        );
        void load('tags', async () =>
          mapTagStats(
            await fetchColumnStats(app, doctype, '_user_tags', filtersExcludingField(activeFilters, '_user_tags')),
          ),
        );
        if (hasStatus) {
          void load('status', async () =>
            mapStatusStats(
              await fetchColumnStats(
                app,
                doctype,
                statusFieldname,
                filtersExcludingField(activeFilters, statusFieldname),
              ),
            ),
          );
        }
      }
    }

    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `generation` is the refresh() trigger
  }, [app, fixtures, doctype, filtersKey, statusFieldname, generation]);

  const refresh = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
};

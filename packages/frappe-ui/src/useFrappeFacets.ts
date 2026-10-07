/**
 * useFrappeFacets — reusable facet counts for a doctype list, promoted from
 * the backoffice list-sidebar data layer (sidebar-stats) so any table header
 * can feed DataTableFacetMenu. Verified against a live bench:
 *
 * - `frappe.desk.listview.get_group_by_count` (POST {doctype,
 *   current_filters, field}) → `{ message: [{ name, count }] }`, ordered by
 *   count desc. For `field: "assigned_to"` the server aggregates the ToDo
 *   assignment table per user (System Users, non-cancelled assignments) —
 *   the proper desk semantics for the JSON-array `_assign` column. Used for
 *   the Assigned To and Created By facets (desk list_sidebar_group_by.js
 *   parity, including the Guest/Administrator scrub and "Me" pinning via
 *   `scrubUserFacetRows`).
 *
 * - `frappe.desk.reportview.get_sidebar_stats` (POST {stats, doctype,
 *   filters}) → `{ message: { stats: { [fieldname]: [label, count][] } } }`.
 *   `_user_tags` entries are per-tag (comma-split server-side) plus a
 *   trailing translated `["No Tags", n]` row; other columns are raw grouped
 *   values (empties excluded server-side). Used for the Tags, status, and
 *   arbitrary column facets (e.g. `module`). NOTE: `stats` and `filters`
 *   MUST be JSON-encoded strings — the endpoint json.loads() them and 500s
 *   on raw arrays.
 *
 * Desk parity on filter context: each facet's counts are computed with
 * every OTHER active filter applied (tuples on the facet's own fieldname
 * excluded — `filtersExcludingField`), mirroring desk's group-by sidebar.
 *
 * Revalidation is STALE-WHILE-VISIBLE: after a facet's first load, a
 * doctype-scoped filter change keeps the shown options rendered and marks
 * the facet `isStale` while the new counts reconcile in place — menus never
 * blank while the user composes filters. `isLoading` is first-load only.
 *
 * Fixture mode (`connection.fixtures` — Storybook / tests): counts are
 * computed client-side from the fixture rows via `matchesFilters` (the
 * frappe operator set) and no network is touched.
 */
import { CallModule, HttpClient, matchesFilters } from '@repo/frappe';
import type { AuthConfig, FixtureProvider } from '@repo/frappe';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFrappeConfig } from './FrappeProvider';

/** One frappe filter tuple — `[fieldname, operator, value]`. */
export type FrappeFacetFilter = [string, string, unknown];
export type FrappeFacetFilters = FrappeFacetFilter[];

/**
 * Server-side label of the pseudo tag row (frappe translates it, so this
 * detection — like desk's own `label == "No Tags"` compare — only works on
 * English benches; non-English benches show it as a regular tag row).
 */
export const NO_TAGS_LABEL = 'No Tags';

export interface FrappeFacetOption {
  /** Raw facet value (user id, tag, status value). */
  value: string;
  count: number;
  /** True for the server's synthetic "No Tags" row. */
  isNoTags?: boolean;
}

export interface FrappeFacetState {
  /**
   * Undefined until the first load resolves (or after a doctype swap);
   * kept POPULATED during revalidation — pair with `isStale`.
   */
  options?: FrappeFacetOption[];
  /** First load in flight — nothing to show yet. */
  isLoading: boolean;
  /** Revalidation in flight — shown options may be outdated. */
  isStale: boolean;
  error?: Error;
}

/** Connection shape shared with the other frappe-ui widgets. */
export interface FrappeFacetsConnection {
  /** Required unless `fixtures` is set (see FrappeConfig.baseURL). */
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string | (() => string | Promise<string>); type?: string };
  fixtures?: FixtureProvider;
}

export interface UseFrappeFacetsOptions {
  /** Override the ambient FrappeProvider connection. */
  connection?: FrappeFacetsConnection;
  /** Fieldname of the doctype's status/workflow Select field, when present. */
  statusFieldname?: string;
  /**
   * Extra column facets via get_sidebar_stats (e.g. `["module"]`) — results
   * land under `columns[fieldname]`.
   */
  columns?: readonly string[];
  /** Set false to pause fetching (default true). */
  enabled?: boolean;
}

export interface UseFrappeFacetsResult {
  /** Unscrubbed user rows — pass through scrubUserFacetRows() to render. */
  assigned: FrappeFacetState;
  /** Unscrubbed user rows — pass through scrubUserFacetRows() to render. */
  owner: FrappeFacetState;
  tags: FrappeFacetState;
  /** Empty-idle unless `statusFieldname` is set. */
  status: FrappeFacetState;
  /** Extra column facets, keyed by fieldname (see `options.columns`). */
  columns: Record<string, FrappeFacetState>;
  /** Immediate refetch of every facet. */
  refresh: () => void;
}

// ── Pure helpers (desk list_sidebar_group_by.js parity) ───────

/** Tuples on `fieldname` removed — the "other" filters for that facet. */
export function filtersExcludingField(filters: FrappeFacetFilters, fieldname: string): FrappeFacetFilters {
  return filters.filter((filter) => filter[0] !== fieldname);
}

/** Exact-tuple active check (fieldname + operator + stringified value). */
export function isFacetFilterActive(filters: FrappeFacetFilters, tuple: FrappeFacetFilter): boolean {
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
export function toggleFacetFilter(filters: FrappeFacetFilters, tuple: FrappeFacetFilter): FrappeFacetFilters {
  const active = isFacetFilterActive(filters, tuple);
  const rest = filtersExcludingField(filters, tuple[0]);
  return active ? rest : [...rest, tuple];
}

/**
 * Desk scrub for the user facets (list_sidebar_group_by.js): hide the
 * Guest/Administrator noise — except the session user, who is pinned to
 * the top ("Me"). Pure, applied at render time; skipped entirely while the
 * session user is unknown so an Administrator-only bench still shows rows.
 */
export function scrubUserFacetRows(rows: FrappeFacetOption[], sessionUser?: string): FrappeFacetOption[] {
  if (!sessionUser) {
    return rows;
  }
  const current = rows.find((row) => row.value === sessionUser);
  const rest = rows.filter((row) => !['Guest', 'Administrator', sessionUser].includes(row.value));
  return current ? [current, ...rest] : rest;
}

// ── Server fetchers ───────────────────────────────────────────

// One RPC client per connection — facets sharing a bench share it.
const callCache = new Map<string, CallModule>();

function getCall(baseURL: string, auth: FrappeFacetsConnection['auth']): CallModule {
  const key = `${baseURL}:${auth?.useToken ? 't' : ''}:${auth?.token ?? ''}:${auth?.type ?? ''}`;
  let call = callCache.get(key);
  if (!call) {
    const authConfig: AuthConfig | undefined = auth
      ? {
          useToken: auth.useToken,
          token: auth.token,
          type: auth.type as AuthConfig['type'],
        }
      : undefined;
    call = new CallModule(new HttpClient(baseURL, authConfig));
    callCache.set(key, call);
  }
  return call;
}

interface GroupByCountRow {
  name: string | null;
  count: number;
}

async function fetchGroupByCount(
  call: CallModule,
  doctype: string,
  currentFilters: FrappeFacetFilters,
  field: 'assigned_to' | 'owner',
): Promise<FrappeFacetOption[]> {
  const res = await call.post<{ message?: GroupByCountRow[] }>('frappe.desk.listview.get_group_by_count', {
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
  call: CallModule,
  doctype: string,
  fieldname: string,
  currentFilters: FrappeFacetFilters,
): Promise<[string, number][]> {
  const res = await call.post<{ message?: { stats?: Record<string, [string, number][]> } }>(
    'frappe.desk.reportview.get_sidebar_stats',
    {
      doctype,
      stats: JSON.stringify([fieldname]),
      filters: JSON.stringify(currentFilters),
    },
  );
  return res.payload?.message?.stats?.[fieldname] ?? [];
}

function mapTagStats(entries: [string, number][]): FrappeFacetOption[] {
  return entries
    .map(([label, count]) => ({
      value: String(label),
      count: Number(count) || 0,
      isNoTags: String(label) === NO_TAGS_LABEL,
    }))
    .filter((row) => row.value !== '' && (!row.isNoTags || row.count > 0));
}

function mapColumnStats(entries: [string, number][]): FrappeFacetOption[] {
  return entries
    .map(([value, count]) => ({ value: String(value), count: Number(count) || 0 }))
    .filter((row) => row.value !== '')
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// ── Fixture mode (Storybook / tests) ──────────────────────────

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

function toSortedCounts(counts: Map<string, number>): FrappeFacetOption[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

interface FixtureFacets {
  assigned: FrappeFacetOption[];
  owner: FrappeFacetOption[];
  tags: FrappeFacetOption[];
  status?: FrappeFacetOption[];
  columns: Record<string, FrappeFacetOption[]>;
}

async function fetchFixtureFacets(
  fixtures: FixtureProvider,
  doctype: string,
  filters: FrappeFacetFilters,
  statusFieldname?: string,
  columnFieldnames?: readonly string[],
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

  const countColumn = (fieldname: string): FrappeFacetOption[] => {
    const counts = new Map<string, number>();
    for (const row of rowsFor(fieldname)) {
      const value = row[fieldname];
      if (value !== undefined && value !== null && value !== '') {
        counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
      }
    }
    return toSortedCounts(counts);
  };

  const columns: Record<string, FrappeFacetOption[]> = {};
  for (const fieldname of columnFieldnames ?? []) {
    columns[fieldname] = countColumn(fieldname);
  }

  return {
    assigned: toSortedCounts(assignedCounts),
    owner: toSortedCounts(ownerCounts),
    tags,
    status: statusFieldname ? countColumn(statusFieldname) : undefined,
    columns,
  };
}

// ── Hook ──────────────────────────────────────────────────────

type BuiltinFacetKey = 'assigned' | 'owner' | 'tags' | 'status';

interface FacetsState {
  assigned: FrappeFacetState;
  owner: FrappeFacetState;
  tags: FrappeFacetState;
  status: FrappeFacetState;
  columns: Record<string, FrappeFacetState>;
}

const IDLE_FACET: FrappeFacetState = { isLoading: false, isStale: false };

function initialState(columnFieldnames: readonly string[]): FacetsState {
  return {
    assigned: { isLoading: true, isStale: false },
    owner: { isLoading: true, isStale: false },
    tags: { isLoading: true, isStale: false },
    status: IDLE_FACET,
    columns: Object.fromEntries(columnFieldnames.map((fieldname) => [fieldname, { isLoading: true, isStale: false }])),
  };
}

/**
 * Facet counts for a doctype list (Assigned To / Created By / Tags / status
 * / arbitrary columns), revalidating stale-while-visible whenever the
 * doctype, the (serialized) filters, or the facet set change. Per-facet
 * results land independently so fast facets render before slow ones.
 *
 * @example
 * ```tsx
 * const facets = useFrappeFacets(doctype, filters, {
 *   statusFieldname: "status",
 *   columns: ["module"],
 * });
 * <DataTableFacetMenu
 *   label={t("Created By")}
 *   loading={facets.owner.isLoading || facets.owner.isStale}
 *   options={scrubUserFacetRows(facets.owner.options ?? [], sessionUser).map((row) => ({
 *     value: row.value,
 *     label: row.value === sessionUser ? t("Me") : row.value,
 *     count: row.count,
 *   }))}
 * />
 * ```
 */
export function useFrappeFacets(
  doctype: string,
  filters: FrappeFacetFilters,
  options?: UseFrappeFacetsOptions,
): UseFrappeFacetsResult {
  const ambient = useFrappeConfig();
  const connection = options?.connection ?? ambient;
  const statusFieldname = options?.statusFieldname;
  const enabled = options?.enabled !== false && !!doctype && !!connection;

  // Value-identity keys: hosts may pass fresh arrays each render.
  const filtersKey = JSON.stringify(filters ?? []);
  const columnsKey = JSON.stringify(options?.columns ?? []);
  const columnFieldnames = useMemo(() => JSON.parse(columnsKey) as string[], [columnsKey]);

  const [state, setState] = useState<FacetsState>(() => initialState(columnFieldnames));
  const [generation, setGeneration] = useState(0);

  // Facet-set identity — a swap resets hard (different domain, no stale
  // options to keep); a filter change within the identity revalidates SWR.
  const identity = `${connection?.baseURL ?? ''}:${doctype}:${statusFieldname ?? ''}:${columnsKey}`;
  const identityRef = useRef(identity);
  const fetchSeq = useRef(0);

  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const conn = connectionRef.current;
    // Neither a corpus nor a bench can answer, so stay idle instead of
    // entering a loading state nothing will ever resolve.
    if (!conn || (!conn.fixtures && !conn.baseURL)) {
      return;
    }
    const seq = ++fetchSeq.current;
    const activeFilters = JSON.parse(filtersKey) as FrappeFacetFilters;

    if (identityRef.current === identity) {
      // SWR revalidation: keep options rendered, flag facets stale (first
      // loads stay isLoading).
      setState((prev) => {
        const revalidate = (facet: FrappeFacetState): FrappeFacetState =>
          facet.options === undefined
            ? { ...facet, isLoading: true, error: undefined }
            : { ...facet, isStale: true, error: undefined };
        return {
          assigned: revalidate(prev.assigned),
          owner: revalidate(prev.owner),
          tags: revalidate(prev.tags),
          status: statusFieldname ? revalidate(prev.status) : IDLE_FACET,
          columns: Object.fromEntries(
            columnFieldnames.map((fieldname) => [
              fieldname,
              revalidate(prev.columns[fieldname] ?? { isLoading: true, isStale: false }),
            ]),
          ),
        };
      });
    } else {
      identityRef.current = identity;
      setState(initialState(columnFieldnames));
    }

    const done = (key: BuiltinFacetKey | ['columns', string], rows: FrappeFacetOption[]) => {
      if (seq !== fetchSeq.current) {
        return;
      } // a newer fetch won
      setState((prev) =>
        Array.isArray(key)
          ? {
              ...prev,
              columns: {
                ...prev.columns,
                [key[1]]: { options: rows, isLoading: false, isStale: false },
              },
            }
          : { ...prev, [key]: { options: rows, isLoading: false, isStale: false } },
      );
    };
    const fail = (key: BuiltinFacetKey | ['columns', string], error: unknown) => {
      if (seq !== fetchSeq.current) {
        return;
      }
      const failed = (facet: FrappeFacetState): FrappeFacetState => ({
        ...facet,
        isLoading: false,
        isStale: false,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      setState((prev) =>
        Array.isArray(key)
          ? {
              ...prev,
              columns: {
                ...prev.columns,
                [key[1]]: failed(prev.columns[key[1]] ?? IDLE_FACET),
              },
            }
          : { ...prev, [key]: failed(prev[key]) },
      );
    };

    if (conn.fixtures) {
      fetchFixtureFacets(conn.fixtures, doctype, activeFilters, statusFieldname, columnFieldnames)
        .then((facets) => {
          done('assigned', facets.assigned);
          done('owner', facets.owner);
          done('tags', facets.tags);
          if (statusFieldname) {
            done('status', facets.status ?? []);
          }
          for (const fieldname of columnFieldnames) {
            done(['columns', fieldname], facets.columns[fieldname] ?? []);
          }
        })
        .catch((error) => {
          fail('assigned', error);
          fail('owner', error);
          fail('tags', error);
          if (statusFieldname) {
            fail('status', error);
          }
          for (const fieldname of columnFieldnames) {
            fail(['columns', fieldname], error);
          }
        });
      return;
    }

    // Narrowing only: the guard at the top of the effect already returned
    // when neither a corpus nor a baseURL is configured.
    if (!conn.baseURL) {
      return;
    }

    const call = getCall(conn.baseURL, conn.auth);
    fetchGroupByCount(call, doctype, filtersExcludingField(activeFilters, '_assign'), 'assigned_to')
      .then((rows) => {
        done('assigned', rows);
      })
      .catch((error) => {
        fail('assigned', error);
      });

    fetchGroupByCount(call, doctype, filtersExcludingField(activeFilters, 'owner'), 'owner')
      .then((rows) => {
        done('owner', rows);
      })
      .catch((error) => {
        fail('owner', error);
      });

    fetchColumnStats(call, doctype, '_user_tags', filtersExcludingField(activeFilters, '_user_tags'))
      .then((entries) => {
        done('tags', mapTagStats(entries));
      })
      .catch((error) => {
        fail('tags', error);
      });

    if (statusFieldname) {
      fetchColumnStats(call, doctype, statusFieldname, filtersExcludingField(activeFilters, statusFieldname))
        .then((entries) => {
          done('status', mapColumnStats(entries));
        })
        .catch((error) => {
          fail('status', error);
        });
    }

    for (const fieldname of columnFieldnames) {
      fetchColumnStats(call, doctype, fieldname, filtersExcludingField(activeFilters, fieldname))
        .then((entries) => {
          done(['columns', fieldname], mapColumnStats(entries));
        })
        .catch((error) => {
          fail(['columns', fieldname], error);
        });
    }
    // oxlint-disable-next-line exhaustive-deps -- identity/filtersKey are the value-exact deps
  }, [enabled, identity, filtersKey, generation]);

  const refresh = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  return useMemo(
    () => ({
      assigned: state.assigned,
      owner: state.owner,
      tags: state.tags,
      status: state.status,
      columns: state.columns,
      refresh,
    }),
    [state, refresh],
  );
}

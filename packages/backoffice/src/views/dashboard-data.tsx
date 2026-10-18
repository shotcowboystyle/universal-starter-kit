// Data layer for the per-doctype dashboard view: status-field detection,
// list-view filter links, and the created-per-week series.
//
// Weekly series strategy (probed against the bench):
//   - `useFrappeAggregate` cannot express date-truncation group-bys — its
//     groupBy is a bare fieldname and `date(creation)` is rejected by the
//     injection guard. The REST list endpoint DOES accept
//     `fields=["date(creation) as _day","count(name) as _aggregate_value"]`
//     + `group_by=date(creation)`, so the live path fetches per-DAY counts
//     (≤ 7 × WEEKS_WINDOW rows) and buckets them into weeks client-side.
//   - If the grouped query is rejected (older bench / restricted backend),
//     fall back to fetching raw `creation` values in the window and
//     bucketing those.
//   - Fixture mode (stories/tests) always buckets raw fixture rows.
// Realtime parity with FrappeKPICard/FrappeChartCard: doctype room events
// schedule a debounced refetch (shared refcounted room via SyncModule).
import { AsyncDebouncer, DbModule, HttpClient, useFrappeDoctypeEvents } from '@repo/frappe';
import type { AuthConfig, FixtureProvider } from '@repo/frappe';
import { formatAbsoluteDate, formatCalendarDate } from '@repo/theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { createBackofficePaths } from '../navigation/paths';
import type { BackofficePaths } from '../navigation/paths';
import type { FrappeFilters } from '../shared/types';
import type { DocFieldMeta, DoctypeMeta } from '../shared/use-doctype-meta';

import type { ViewConnection } from './connection';
import { isHiddenField } from './view-meta';

/** Row shape for the per-day aggregate query (closed type — implied index
 * signature keeps it inside the FrappeDocData constraint). */
// oxlint-disable-next-line typescript/consistent-type-definitions -- must stay an alias: interfaces lack the implied index signature FrappeDocData requires
type DayAggregateRow = {
  name: string;
  doctype: string;
  _day?: string;
  _aggregate_value?: number | string;
};

// oxlint-disable-next-line typescript/consistent-type-definitions -- must stay an alias, see DayAggregateRow
type CreationRow = {
  name: string;
  doctype: string;
  creation?: string;
};

export const WEEKS_WINDOW = 12;

/** Cap on per-status KPI cards — pathological Selects get the chart only. */
export const MAX_STATUS_KPI_CARDS = 8;

// ---------------------------------------------------------------------------
// Status field detection + list links
// ---------------------------------------------------------------------------

const isSelectCandidate = (field: DocFieldMeta): boolean =>
  field.fieldtype === 'Select' && !isHiddenField(field) && (field.options ?? '').trim().length > 0;

/**
 * The doctype's status axis: a visible Select named `status` when one
 * exists (desk convention), else the first visible Select with options
 * (same fallback axis the kanban view uses).
 */
export const detectStatusField = (meta: DoctypeMeta): DocFieldMeta | undefined => {
  const candidates = meta.fields.filter(isSelectCandidate);
  return candidates.find((field) => field.fieldname === 'status') ?? candidates[0];
};

const defaultPaths = createBackofficePaths();

/**
 * List-view URL pre-filtered to one field value (basePath-aware when the
 * provider's `paths` are passed; defaults to the canonical "/backoffice").
 * `?f=` carries the shared `FrappeFilters` tuple array (shared/types.ts)
 * as URI-encoded JSON:
 *   /backoffice/todo?f=%5B%5B%22status%22%2C%22%3D%22%2C%22Open%22%5D%5D
 */
export const filteredListHref = (
  doctype: string,
  fieldname: string,
  value: string,
  paths: BackofficePaths = defaultPaths,
): string => {
  const filters: FrappeFilters = [[fieldname, '=', value]];
  return `${paths.list(doctype)}?f=${encodeURIComponent(JSON.stringify(filters))}`;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export const isoDate = (date: Date): string => formatCalendarDate(date);

/** Frappe date-string (YYYY-MM-DD) for `days` days before now. */
export const daysAgoIso = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
};

/** Monday-start week bucket for a date. */
export const weekStart = (date: Date): Date => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - mondayOffset);
  return copy;
};

/** Parse "YYYY-MM-DD" as LOCAL midnight (new Date("YYYY-MM-DD") is UTC). */
const parseIsoDateLocal = (value: string): Date | undefined => {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) {
    return undefined;
  }
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Parse a frappe datetime ("YYYY-MM-DD HH:mm:ss.SSSSSS") leniently. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- raw fixture/server creation values; this is their parse boundary
const parseFrappeDatetime = (value: unknown): Date | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see above; typeof is the read boundary
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

// ---------------------------------------------------------------------------
// Created-per-week series
// ---------------------------------------------------------------------------

export interface WeeklyCreatedPoint {
  label: string;
  value: number;
}

export interface WeeklyCreatedState {
  /** One point per week, oldest first, empty weeks included. */
  data: WeeklyCreatedPoint[] | undefined;
  isLoading: boolean;
  /** A realtime event arrived / refetch in flight — series may lag. */
  isStale: boolean;
  error: Error | undefined;
  /** Series is ready and no docs were created inside the window. */
  isEmpty: boolean;
  /** Immediate refetch (error retry). */
  refresh: () => void;
}

const toAuthConfig = (auth: ViewConnection['auth']): AuthConfig | undefined => {
  if (!auth) {
    return undefined;
  }
  return {
    useToken: auth.useToken,
    token: auth.token,
    // SAFETY: FrappeConfig types auth.type as a plain string; it carries the AuthConfig auth-type names.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    type: auth.type as AuthConfig['type'],
  };
};

/** Day-ISO → count from raw rows carrying a `creation` value. */
const bucketRowsByDay = (rows: { creation?: unknown }[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const created = parseFrappeDatetime(row.creation);
    if (!created) {
      continue;
    }
    const day = isoDate(created);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
};

const fetchLiveDayCounts = async (
  connection: ViewConnection,
  doctype: string,
  cutoff: string,
  scope: FrappeFilters,
): Promise<Map<string, number>> => {
  const db = new DbModule(new HttpClient(connection.baseURL, toAuthConfig(connection.auth)));
  try {
    // Server-side per-day aggregate: bounded payload regardless of doc count.
    const rows = await db.getDocList<DayAggregateRow>(doctype, {
      fields: ['date(creation) as _day', 'count(name) as _aggregate_value'],
      filters: [...scope, ['creation', '>=', cutoff]],
      groupBy: 'date(creation)',
      limit: 0,
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- raw server JSON; typeof is the read boundary
      const day = typeof row._day === 'string' ? row._day.slice(0, 10) : '';
      if (!day) {
        continue;
      }
      const value = Number(row._aggregate_value);
      counts.set(day, (counts.get(day) ?? 0) + (Number.isFinite(value) ? value : 0));
    }
    return counts;
  } catch {
    // Grouped-by-function query rejected — fetch raw creation values instead.
    const rows = await db.getDocList<CreationRow>(doctype, {
      fields: ['creation'],
      filters: [...scope, ['creation', '>=', cutoff]],
      limit: 0,
    });
    return bucketRowsByDay(rows);
  }
};

const fetchFixtureDayCounts = async (
  fixtures: FixtureProvider,
  doctype: string,
  scope: FrappeFilters,
): Promise<Map<string, number>> => {
  const rows = await fixtures.getList<CreationRow>(doctype, {
    fields: ['creation'],
    filters: scope,
  });
  return bucketRowsByDay(rows);
};

const REFETCH_DEBOUNCE_MS = 300;
const NO_SCOPE: FrappeFilters = [];

/**
 * Docs created per week over the last {@link WEEKS_WINDOW} weeks (Monday
 * buckets, empty weeks included so the series is continuous), refetched on
 * doctype realtime events with a coalescing debounce — same recompute
 * contract as `useFrappeAggregate`. `scope` (the desk scope, GL-5) ANDs
 * into both the live and the fixture query.
 */
export const useWeeklyCreated = (
  connection: ViewConnection | undefined,
  doctype: string,
  weeks: number = WEEKS_WINDOW,
  scope: FrappeFilters = NO_SCOPE,
): WeeklyCreatedState => {
  const [data, setData] = useState<WeeklyCreatedPoint[] | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [fetchError, setFetchError] = useState<Error | undefined>();

  const fetchSeq = useRef(0);
  const connectionRef = useRef(connection);
  // oxlint-disable-next-line react/refs -- latest-value ref synced during render so the stable runFetch reads current props
  connectionRef.current = connection;
  const specRef = useRef({ doctype, weeks, scope });
  // oxlint-disable-next-line react/refs -- latest-value ref sync, see above
  specRef.current = { doctype, weeks, scope };

  const runFetch = useCallback(async () => {
    const conn = connectionRef.current;
    const { doctype: currentDoctype, weeks: currentWeeks, scope: currentScope } = specRef.current;
    if (!conn || !currentDoctype) {
      return;
    }
    fetchSeq.current += 1;
    const seq = fetchSeq.current;
    try {
      const firstWeek = weekStart(new Date());
      firstWeek.setDate(firstWeek.getDate() - (currentWeeks - 1) * 7);
      const dayCounts = conn.fixtures
        ? await fetchFixtureDayCounts(conn.fixtures, currentDoctype, currentScope)
        : await fetchLiveDayCounts(conn, currentDoctype, isoDate(firstWeek), currentScope);

      const weekCounts = new Map<string, number>();
      for (const [day, count] of dayCounts) {
        const date = parseIsoDateLocal(day);
        if (!date || date < firstWeek) {
          continue;
        }
        const bucket = isoDate(weekStart(date));
        weekCounts.set(bucket, (weekCounts.get(bucket) ?? 0) + count);
      }

      const series: WeeklyCreatedPoint[] = [];
      for (let i = 0; i < currentWeeks; i += 1) {
        const week = new Date(firstWeek);
        week.setDate(week.getDate() + i * 7);
        series.push({
          // House date channel (LC-12), axis-tick register: these labels are
          // the bar chart's x ticks, so the year is elided ("Aug 11") — the
          // 12-week window's period context carries it. Never a raw
          // toLocaleDateString beside channel-formatted dates elsewhere.
          label: formatAbsoluteDate(week, { year: 'never' }),
          value: weekCounts.get(isoDate(week)) ?? 0,
        });
      }
      // Stale response — a newer fetch won.
      if (seq !== fetchSeq.current) {
        return;
      }
      setData(series);
      setFetchError(undefined);
    } catch (error) {
      if (seq !== fetchSeq.current) {
        return;
      }
      setFetchError(error instanceof Error ? error : new Error(String(error)));
      // oxlint-disable-next-line react/todo -- the compiler can't lower try/finally yet; it skips this callback, which stays manually memoized
    } finally {
      if (seq === fetchSeq.current) {
        setIsLoading(false);
        setIsStale(false);
      }
    }
  }, []);

  // Debouncer coalescing bursts of realtime events into one refetch.
  // oxlint-disable-next-line unicorn/no-useless-undefined -- React 19's useRef requires an initial value
  const debouncerRef = useRef<AsyncDebouncer<() => Promise<void>> | undefined>(undefined);
  // oxlint-disable-next-line react/todo -- the compiler can't lower ??= yet; it skips this hook, which stays manually memoized
  debouncerRef.current ??= new AsyncDebouncer(
    async () => {
      await runFetch();
    },
    { wait: REFETCH_DEBOUNCE_MS },
  );
  useEffect(
    () => () => {
      debouncerRef.current?.cancel();
    },
    [],
  );

  const baseURL = connection?.baseURL;
  const hasFixtures = !!connection?.fixtures;
  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    if (baseURL === undefined || baseURL === '' || !doctype) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- resets the series to loading when the query target changes
    setIsLoading(true);
    setFetchError(undefined);
    void runFetch();
    // Refetch on connection target / doctype / scope change only — the
    // connection object identity churns with provider re-renders.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- hasFixtures/weeks/scopeKey are deliberate refetch triggers read through refs
  }, [baseURL, hasFixtures, doctype, weeks, scopeKey, runFetch]);

  // SAFETY: ViewConnection is the FrappeConfig subset the realtime hook reads (baseURL, socket, site, auth).
  useFrappeDoctypeEvents(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    connection as Parameters<typeof useFrappeDoctypeEvents>[0],
    doctype,
    () => {
      setIsStale(true);
      void debouncerRef.current?.maybeExecute();
    },
    !!connection && !connection.fixtures,
  );

  const refresh = useCallback(() => {
    debouncerRef.current?.cancel();
    setIsStale(true);
    void runFetch();
  }, [runFetch]);

  const isEmpty = !!data && data.every((point) => point.value === 0);

  return { data, isLoading, isStale, error: fetchError, isEmpty, refresh };
};

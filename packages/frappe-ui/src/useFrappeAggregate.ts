/**
 * useFrappeAggregate — live server-side aggregates for KPI / chart widgets.
 *
 * Recompute strategy (live-wiring-aggregates mission): aggregates are NOT
 * maintained incrementally on the client — the sync engine's collection row
 * set is a bounded window (Frappe's default page length), so counting synced
 * rows would lie on any doctype larger than one page. Instead the aggregate
 * is computed by the server (`frappe.client.get_count`, or `get_list` with
 * an aggregate field + `group_by`) and refetched through the client whenever
 * the doctype's realtime room reports a change (`list_update` / `doc_update`
 * / `doc_deleted`), coalesced through a debounce window (default 300ms —
 * same band as the sync engine's rehydration debounce).
 *
 * Subscription sharing: realtime room membership rides the shared
 * `SyncModule` (cached per baseURL) via `useFrappeDoctypeEvents`, whose
 * doctype rooms are refcounted — any number of widgets watching the same
 * doctype share one socket and one room join. The REST `DbModule` used for
 * aggregate fetches is likewise cached per connection.
 *
 * Honest states: `isLoading` (first load — render a skeleton), `isStale`
 * (an event arrived / a refetch is in flight — the shown number may be
 * outdated), `error` + `isPermissionError` (403 from the permission
 * envelope), and `value === undefined` when the aggregate has no result
 * (e.g. avg/min/max over an empty set).
 *
 * Fixture mode (`connection.fixtures`, used by Storybook fallback and
 * tests): aggregates are computed client-side from the fixture rows and
 * realtime is disabled.
 */
import { AsyncDebouncer, DbModule, HttpClient, useFrappeDoctypeEvents } from '@repo/frappe';
import type { AuthConfig, FixtureProvider } from '@repo/frappe';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type FrappeAggregateOperation = 'count' | 'sum' | 'avg' | 'min' | 'max';

/** Connection shape shared with the other frappe-ui widgets. */
export interface FrappeAggregateConnection {
  /** Required unless `fixtures` is set (see FrappeConfig.baseURL). */
  baseURL?: string;
  /** False keeps HTTP reads without realtime subscriptions. */
  realtime?: boolean;
  socketPort?: number;
  /** Same-origin socket override (see FrappeConfig.socketBaseURL). */
  socketBaseURL?: string;
  /** Frappe site name — the realtime Socket.IO namespace. */
  siteName?: string;
  auth?: { useToken?: boolean; token?: string | (() => string | Promise<string>); type?: string };
  syncOptions?: unknown;
  fixtures?: FixtureProvider;
}

export interface FrappeAggregateSpec {
  doctype: string;
  /** Aggregate operation (default `"count"`). */
  aggregate?: FrappeAggregateOperation;
  /** Field the aggregate operates on. Required for sum/avg/min/max. */
  field?: string;
  filters?: Record<string, unknown> | [string, string, unknown][];
  /** Group results by this field (chart series: one point per group). */
  groupBy?: string;
  /** Coalescing window for event-driven refetches in ms (default 300). */
  debounceMs?: number;
  /** Set false to pause fetching + realtime (default true). */
  enabled?: boolean;
}

export interface FrappeAggregateGroup {
  label: string;
  value: number;
}

export interface UseFrappeAggregateResult {
  /** Scalar aggregate (spec without `groupBy`). */
  value: number | undefined;
  /** Grouped aggregate rows (spec with `groupBy`). */
  groups: FrappeAggregateGroup[] | undefined;
  /** First load in flight — no number to show yet. */
  isLoading: boolean;
  /** A change event arrived / refetch in flight — shown value may be outdated. */
  isStale: boolean;
  error: Error | undefined;
  /** True when the server rejected the read (HTTP 403). */
  isPermissionError: boolean;
  /** When the shown value was last confirmed by the server. */
  lastUpdated: Date | undefined;
  /** Immediate refetch (skips the debounce window). */
  refresh: () => void;
}

const DEFAULT_DEBOUNCE_MS = 300;

// One REST client per connection — widgets sharing a bench share it.
const dbCache = new Map<string, DbModule>();

function getDb(baseURL: string, auth: FrappeAggregateConnection['auth']): DbModule {
  const key = `${baseURL}:${auth?.useToken ? 't' : ''}:${auth?.token ?? ''}:${auth?.type ?? ''}`;
  let db = dbCache.get(key);
  if (!db) {
    const authConfig: AuthConfig | undefined = auth
      ? {
          useToken: auth.useToken,
          token: auth.token,
          type: auth.type as AuthConfig['type'],
        }
      : undefined;
    db = new DbModule(new HttpClient(baseURL, authConfig));
    dbCache.set(key, db);
  }
  return db;
}

/** Frappe fieldnames only — keeps the aggregate expression injection-proof. */
const FIELDNAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertFieldname(name: string, what: string): void {
  if (!FIELDNAME_RE.test(name)) {
    throw new Error(`[useFrappeAggregate] invalid ${what}: ${JSON.stringify(name)}`);
  }
}

function toFiniteNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

interface AggregateData {
  value?: number;
  groups?: FrappeAggregateGroup[];
}

async function fetchLiveAggregate(db: DbModule, spec: FrappeAggregateSpec): Promise<AggregateData> {
  const operation = spec.aggregate ?? 'count';
  const field = spec.field ?? 'name';
  assertFieldname(field, 'aggregate field');
  if (spec.groupBy) {
    assertFieldname(spec.groupBy, 'groupBy field');
  }
  if (operation !== 'count' && !spec.field) {
    throw new Error(`[useFrappeAggregate] "${operation}" requires a field`);
  }

  // Scalar count has a dedicated permission-checked endpoint.
  if (operation === 'count' && !spec.groupBy) {
    const count = await db.getCount(spec.doctype, spec.filters);
    return { value: count };
  }

  const aggregateExpr = `${operation}(${field}) as _aggregate_value`;
  const fields = spec.groupBy ? [spec.groupBy, aggregateExpr] : [aggregateExpr];
  const rows = await db.getDocList(spec.doctype, {
    fields,
    filters: spec.filters,
    groupBy: spec.groupBy,
    // 0 = no page cap: aggregates must cover the whole (filtered) doctype.
    limit: 0,
  });

  if (spec.groupBy) {
    const { groupBy } = spec;
    return {
      groups: rows.map((row) => ({
        label: String(row[groupBy] ?? ''),
        value: toFiniteNumber(row._aggregate_value) ?? 0,
      })),
    };
  }
  return { value: toFiniteNumber(rows[0]?._aggregate_value) };
}

async function fetchFixtureAggregate(fixtures: FixtureProvider, spec: FrappeAggregateSpec): Promise<AggregateData> {
  const operation = spec.aggregate ?? 'count';
  const field = spec.field ?? 'name';
  const rows = (await fixtures.getList(spec.doctype, {
    filters: spec.filters as [string, string, unknown][] | undefined,
  })) as Record<string, unknown>[];

  const aggregate = (subset: Record<string, unknown>[]): number | undefined => {
    if (operation === 'count') {
      return subset.length;
    }
    const values = subset
      .map((row) => toFiniteNumber(row[field]))
      .filter((value): value is number => value !== undefined);
    if (values.length === 0) {
      return undefined;
    }
    switch (operation) {
      case 'sum': {
        return values.reduce((a, b) => a + b, 0);
      }
      case 'avg': {
        return values.reduce((a, b) => a + b, 0) / values.length;
      }
      case 'min': {
        return Math.min(...values);
      }
      case 'max': {
        return Math.max(...values);
      }
    }
  };

  if (spec.groupBy) {
    const { groupBy } = spec;
    const buckets = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const label = String(row[groupBy] ?? '');
      const bucket = buckets.get(label) ?? [];
      bucket.push(row);
      buckets.set(label, bucket);
    }
    return {
      groups: [...buckets.entries()].map(([label, bucket]) => ({
        label,
        value: aggregate(bucket) ?? 0,
      })),
    };
  }
  return { value: aggregate(rows) };
}

/**
 * Live server-side aggregate over a Frappe doctype.
 *
 * @example
 * ```tsx
 * const { value, isLoading, isStale } = useFrappeAggregate(config, {
 *   doctype: "ToDo",
 *   filters: { status: "Open" },
 * });
 * const { groups } = useFrappeAggregate(config, {
 *   doctype: "ToDo",
 *   groupBy: "status",
 * });
 * ```
 */
export function useFrappeAggregate(
  connection: FrappeAggregateConnection | undefined,
  spec: FrappeAggregateSpec,
): UseFrappeAggregateResult {
  const enabled = spec.enabled !== false && !!connection && !!spec.doctype;
  const debounceMs = spec.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  const [data, setData] = useState<AggregateData>({});
  const [isLoading, setIsLoading] = useState(enabled);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>();

  // Identity of the query — refetch from scratch when it changes.
  const specKey = JSON.stringify([
    connection?.baseURL,
    !!connection?.fixtures,
    spec.doctype,
    spec.aggregate ?? 'count',
    spec.field,
    spec.filters,
    spec.groupBy,
  ]);

  const fetchSeq = useRef(0);
  const specRef = useRef(spec);
  specRef.current = spec;
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const hasSettledRef = useRef(false);
  const identityRef = useRef(`${connection?.baseURL}:${spec.doctype}`);

  const runFetch = useCallback(async () => {
    const conn = connectionRef.current;
    const currentSpec = specRef.current;
    if (!conn || !currentSpec.doctype) {
      return;
    }
    const seq = ++fetchSeq.current;
    try {
      let result: AggregateData;
      if (conn.fixtures) {
        result = await fetchFixtureAggregate(conn.fixtures, currentSpec);
      } else if (conn.baseURL) {
        result = await fetchLiveAggregate(getDb(conn.baseURL, conn.auth), currentSpec);
      } else {
        throw new Error('useFrappeAggregate requires a connection with baseURL or fixtures');
      }
      if (seq !== fetchSeq.current) {
        return;
      } // stale response — a newer fetch won
      setData(result);
      setError(undefined);
      setLastUpdated(new Date());
      hasSettledRef.current = true;
    } catch (error) {
      if (seq !== fetchSeq.current) {
        return;
      }
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (seq === fetchSeq.current) {
        setIsLoading(false);
        setIsStale(false);
      }
    }
  }, []);

  // Debouncer coalescing bursts of realtime events into one refetch.
  const debouncerRef = useRef<AsyncDebouncer<() => Promise<void>> | undefined>(undefined);
  debouncerRef.current ??= new AsyncDebouncer(async () => await runFetch(), { wait: debounceMs });
  useEffect(() => {
    debouncerRef.current?.setOptions({ wait: debounceMs });
  }, [debounceMs]);
  useEffect(() => () => debouncerRef.current?.cancel(), []);

  // Initial load + reload when the query identity changes.
  // After the first settle, a filter/spec change is a refetch (isStale),
  // not a first load (isLoading) — the shown number stays so the list
  // chrome cannot jump when the user toggles a filter.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const identity = `${connectionRef.current?.baseURL}:${specRef.current.doctype}`;
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      hasSettledRef.current = false;
    }
    if (hasSettledRef.current) {
      setIsStale(true);
    } else {
      setIsLoading(true);
    }
    setError(undefined);
    void runFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, specKey]);

  // Realtime: any change on the doctype schedules a debounced refetch. The
  // room join is refcounted on the shared SyncModule, so widgets watching
  // the same doctype share the subscription. `connected` (reconnect) also
  // refetches — cheap catch-up for events missed while offline.
  useFrappeDoctypeEvents(
    connection as Parameters<typeof useFrappeDoctypeEvents>[0],
    spec.doctype,
    () => {
      setIsStale(true);
      void debouncerRef.current?.maybeExecute();
    },
    enabled && !connection?.fixtures,
  );

  const refresh = useCallback(() => {
    debouncerRef.current?.cancel();
    setIsStale(true);
    void runFetch();
  }, [runFetch]);

  const isPermissionError = useMemo(() => (error as { status?: number } | undefined)?.status === 403, [error]);

  return {
    value: data.value,
    groups: data.groups,
    isLoading,
    isStale,
    error,
    isPermissionError,
    lastUpdated,
    refresh,
  };
}

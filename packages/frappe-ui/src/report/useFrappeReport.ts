/**
 * The query-report transport: one `frappe.desk.query_report.run` caller per
 * connection, debounced filter changes, the Report's DB-defined filters via
 * `get_script`. FrappeReportView runs on it directly and the desk's
 * `useQueryReport` runs its reports through it, so both surfaces send the
 * same request and read the same normalized payload (MPO-15, GL-28).
 */
import { AsyncDebouncer, CallModule, HttpClient } from '@repo/frappe';
import type { AuthConfig } from '@repo/frappe';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { compactFilterValues, normalizeQueryReportPayload } from './queryReport';
import type {
  QueryReportFilterInput,
  QueryReportFilters,
  QueryReportPayload,
  QueryReportRunMessage,
} from './queryReport';

/** Fixture payload or loader — renders the report without any network. */
export type FrappeReportFixture =
  | QueryReportRunMessage
  | ((args: {
      reportName: string;
      filters: QueryReportFilters;
    }) => QueryReportRunMessage | Promise<QueryReportRunMessage>);

export interface FrappeReportConnection {
  baseURL: string;
  auth?: {
    useToken?: boolean;
    token?: string | (() => string | Promise<string>);
    type?: string;
  };
}

// One whitelisted-method caller per connection — report views sharing a
// bench share it (same pattern as useFrappeAggregate's DbModule cache).
const callCache = new Map<string, CallModule>();

/** The shared caller for a connection (report runs, Report doc reads, get_script). */
export function reportCall(connection: FrappeReportConnection): CallModule {
  const key = `${connection.baseURL}:${connection.auth?.useToken ? 't' : ''}:${connection.auth?.token ?? ''}:${connection.auth?.type ?? ''}`;
  let call = callCache.get(key);
  if (!call) {
    const authConfig: AuthConfig | undefined = connection.auth
      ? {
          useToken: connection.auth.useToken,
          token: connection.auth.token,
          type: connection.auth.type as AuthConfig['type'],
        }
      : undefined;
    call = new CallModule(new HttpClient(connection.baseURL, authConfig));
    callCache.set(key, call);
  }
  return call;
}

const DEFAULT_DEBOUNCE_MS = 400;

export interface UseFrappeReportOptions {
  reportName: string;
  /** Current filter values (already compacted values are fine too). */
  filters?: QueryReportFilters;
  /** Fixture payload / loader — no network is touched when set. */
  fixture?: FrappeReportFixture;
  /**
   * Fetch the report's DB-defined filter definitions (`get_script`).
   * Off when the consumer supplies `filterFields` explicitly.
   */
  fetchFilterDefs?: boolean;
  /** Bypass the prepared-report cache and execute the report now. */
  ignorePreparedReport?: boolean;
  /** Debounce for filter-change refetches in ms (default 400). */
  debounceMs?: number;
  enabled?: boolean;
}

export interface UseFrappeReportResult {
  payload: QueryReportPayload | undefined;
  /** DB-defined filter defs (`get_script`); undefined while unknown. */
  scriptFilters: QueryReportFilterInput[] | undefined;
  /** First run in flight — nothing to show yet. */
  isLoading: boolean;
  /** Any run in flight (filter-change / refresh refetches included). */
  isFetching: boolean;
  error: Error | undefined;
  /** Immediate re-run (skips the debounce window). */
  refresh: () => void;
}

/**
 * Run a named server-side report (`frappe.desk.query_report.run`) with the
 * given filters. Filter-value changes are debounced; report changes and
 * explicit `refresh()` run immediately.
 */
export function useFrappeReport(
  connection: FrappeReportConnection | undefined,
  {
    reportName,
    filters,
    fixture,
    fetchFilterDefs = false,
    ignorePreparedReport = false,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    enabled = true,
  }: UseFrappeReportOptions,
): UseFrappeReportResult {
  const isEnabled = enabled && !!reportName && (!!connection || !!fixture);

  const [payload, setPayload] = useState<QueryReportPayload | undefined>();
  const [scriptFilters, setScriptFilters] = useState<QueryReportFilterInput[] | undefined>();
  const [isLoading, setIsLoading] = useState(isEnabled);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  const compactedFilters = useMemo(() => compactFilterValues(filters), [filters]);
  const filtersKey = JSON.stringify(compactedFilters);
  const runKey = JSON.stringify([connection?.baseURL, !!fixture, reportName, filtersKey, ignorePreparedReport]);

  const fetchSeq = useRef(0);
  const argsRef = useRef({ reportName, filters: compactedFilters, fixture, ignorePreparedReport });
  argsRef.current = { reportName, filters: compactedFilters, fixture, ignorePreparedReport };
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  const runFetch = useCallback(async () => {
    const { reportName: name, filters: values, fixture: fx, ignorePreparedReport: skipPrepared } = argsRef.current;
    const conn = connectionRef.current;
    if (!name || (!conn && !fx)) {
      return;
    }
    const seq = ++fetchSeq.current;
    setIsFetching(true);
    try {
      let raw: QueryReportRunMessage | undefined;
      if (fx) {
        raw = typeof fx === 'function' ? await fx({ reportName: name, filters: values }) : fx;
      } else if (conn) {
        const res = await reportCall(conn).post<{ message: QueryReportRunMessage }>('frappe.desk.query_report.run', {
          report_name: name,
          filters: values,
          ignore_prepared_report: skipPrepared ? 1 : 0,
          // Desk parity: only let the server substitute saved custom
          // filters when the caller sent no filter values at all.
          are_default_filters: Object.keys(values).length ? 0 : 1,
        });
        raw = res.payload.message;
      }
      if (seq !== fetchSeq.current) {
        return;
      } // stale response — a newer run won
      setPayload(normalizeQueryReportPayload(raw ?? {}));
      setError(undefined);
    } catch (error) {
      if (seq !== fetchSeq.current) {
        return;
      }
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (seq === fetchSeq.current) {
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, []);

  // Debouncer coalescing filter keystrokes into one refetch.
  const debouncerRef = useRef<AsyncDebouncer<() => Promise<void>> | undefined>(undefined);
  debouncerRef.current ??= new AsyncDebouncer(async () => await runFetch(), {
    wait: debounceMs,
  });
  useEffect(() => {
    debouncerRef.current?.setOptions({ wait: debounceMs });
  }, [debounceMs]);
  useEffect(() => () => debouncerRef.current?.cancel(), []);

  // Report identity changes (and first mount) run immediately; filter-value
  // changes ride the debouncer so per-keystroke Data filters cost one run.
  // The run key guards actual query changes; captured args ride argsRef.
  const lastRunKeyRef = useRef<string | undefined>(undefined);
  const lastReportRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!isEnabled || lastRunKeyRef.current === runKey) {
      return;
    }
    lastRunKeyRef.current = runKey;
    const reportChanged = lastReportRef.current !== argsRef.current.reportName;
    lastReportRef.current = argsRef.current.reportName;
    setError(undefined);
    if (reportChanged) {
      setIsLoading(true);
      debouncerRef.current?.cancel();
      void runFetch();
    } else if (debounceMs <= 0) {
      void runFetch();
    } else {
      void debouncerRef.current?.maybeExecute();
    }
  }, [isEnabled, runKey, debounceMs, runFetch]);

  // DB-defined filter definitions (Report doc `filters` child table) via
  // get_script — live mode only; fixtures carry defs on the payload itself.
  useEffect(() => {
    if (!isEnabled || !fetchFilterDefs || fixture || !connection) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await reportCall(connection).get<{
          message: { filters?: QueryReportFilterInput[] };
        }>('frappe.desk.query_report.get_script', { report_name: reportName });
        if (!cancelled) {
          setScriptFilters(res.payload.message?.filters ?? []);
        }
      } catch {
        // Filter defs are progressive enhancement — a failing get_script
        // must not take the report down (run() surfaces real errors).
        if (!cancelled) {
          setScriptFilters([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEnabled, fetchFilterDefs, fixture, connection, reportName]);

  const refresh = useCallback(() => {
    debouncerRef.current?.cancel();
    void runFetch();
  }, [runFetch]);

  return { payload, scriptFilters, isLoading, isFetching, error, refresh };
}

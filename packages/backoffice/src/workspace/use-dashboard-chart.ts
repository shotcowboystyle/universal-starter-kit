/**
 * Dashboard Chart data for workspace chart blocks.
 *
 * Desk fetches chart data through the whitelisted RPC
 * `frappe.desk.doctype.dashboard_chart.dashboard_chart.get` (POST with
 * `chart_name`), which returns `{message: {labels: string[], datasets:
 * [{name, values: number[]}]}}` — verified against the control bench.
 * The chart *type* (Line/Bar/Pie/…) lives on the Dashboard Chart doc,
 * which the block reads separately via `useFrappeDoc`.
 *
 * Fixture mode has no RPC surface — the hook reports `unsupported` and
 * the block renders an informational card instead (documented gap).
 */
import { CallModule, HttpClient } from '@repo/frappe';
import type { AuthConfig } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import type { FrappeConfig } from '@repo/frappe-ui';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface DashboardChartSeries {
  labels: string[];
  datasets: { name?: string; values: number[] }[];
}

export interface DashboardChartDoc {
  name: string;
  doctype: string;
  chart_name?: string;
  /** Render style: "Line" | "Bar" | "Percentage" | "Pie" | "Donut" | "Heatmap" */
  type?: string;
  /** Data source kind: "Count" | "Sum" | "Average" | "Group By" | "Report" | "Custom" */
  chart_type?: string;
  document_type?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a Frappe doc carries any number of extra fields
  [key: string]: unknown;
}

export interface UseDashboardChartDataResult {
  series: DashboardChartSeries | undefined;
  isLoading: boolean;
  error: Error | undefined;
  /** Fixture mode (stories/tests) — no RPC available for chart data. */
  unsupported: boolean;
  refresh: () => void;
}

const callCache = new Map<string, CallModule>();

const getCall = (baseURL: string, auth: FrappeConfig['auth']): CallModule => {
  const key = `${baseURL}:${auth?.useToken ? 't' : ''}:${String(auth?.token ?? '')}:${auth?.type ?? ''}`;
  let call = callCache.get(key);
  if (!call) {
    const authConfig: AuthConfig | undefined = auth
      ? {
          useToken: auth.useToken,
          token: auth.token,
          // SAFETY: FrappeProvider documents auth.type as an AuthType value ('Bearer' | 'token').
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
          type: auth.type as AuthConfig['type'],
        }
      : undefined;
    call = new CallModule(new HttpClient(baseURL, authConfig));
    callCache.set(key, call);
  }
  return call;
};

const CHART_GET_METHOD = 'frappe.desk.doctype.dashboard_chart.dashboard_chart.get';

const fetchSeries = async (conn: FrappeConfig | undefined, chartName: string): Promise<DashboardChartSeries> => {
  if (conn?.baseURL === undefined || conn.baseURL === '') {
    throw new Error('useDashboardChartData requires a FrappeProvider with baseURL');
  }
  const res = await getCall(conn.baseURL, conn.auth).post<{
    message: DashboardChartSeries;
  }>(CHART_GET_METHOD, {
    chart_name: chartName,
    refresh: 1,
  });
  return res.payload.message;
};

/** Fetch a Dashboard Chart's series via the desk RPC (live mode only). */
export const useDashboardChartData = (chartName: string | undefined): UseDashboardChartDataResult => {
  const config = useFrappeConfig();
  const [series, setSeries] = useState<DashboardChartSeries | undefined>();
  const [isLoading, setIsLoading] = useState(chartName !== undefined && chartName !== '' && !config?.fixtures);
  const [error, setError] = useState<Error | undefined>();
  const fetchSeq = useRef(0);

  const configRef = useRef(config);
  // oxlint-disable-next-line react/refs -- latest-value ref sync; read only inside the async fetch
  configRef.current = config;

  const unsupported = !!config?.fixtures;

  const runFetch = useCallback(async (name: string) => {
    const conn = configRef.current;
    if (conn?.fixtures) {
      return;
    }
    fetchSeq.current += 1;
    const seq = fetchSeq.current;
    setIsLoading(true);
    setError(undefined);
    let result: DashboardChartSeries | undefined;
    let failure: Error | undefined;
    try {
      result = await fetchSeries(conn, name);
    } catch (fetchError) {
      failure = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
    }
    if (seq !== fetchSeq.current) {
      return;
    }
    if (failure) {
      setError(failure);
    } else {
      setSeries(result);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (chartName === undefined || chartName === '' || unsupported) {
      // oxlint-disable-next-line react/set-state-in-effect -- nothing to fetch, so the loading flag settles here
      setIsLoading(false);
      return;
    }
    void runFetch(chartName);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- a baseURL change must refetch; runFetch reads it via configRef
  }, [chartName, unsupported, runFetch, config?.baseURL]);

  const refresh = useCallback(() => {
    if (chartName !== undefined && chartName !== '') {
      void runFetch(chartName);
    }
  }, [chartName, runFetch]);

  return { series, isLoading, error, unsupported, refresh };
};

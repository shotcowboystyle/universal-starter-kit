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

function getCall(baseURL: string, auth: FrappeConfig['auth']): CallModule {
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

const CHART_GET_METHOD = 'frappe.desk.doctype.dashboard_chart.dashboard_chart.get';

/** Fetch a Dashboard Chart's series via the desk RPC (live mode only). */
export function useDashboardChartData(chartName: string | undefined): UseDashboardChartDataResult {
  const config = useFrappeConfig();
  const [series, setSeries] = useState<DashboardChartSeries | undefined>();
  const [isLoading, setIsLoading] = useState(!!chartName && !config?.fixtures);
  const [error, setError] = useState<Error | undefined>();
  const fetchSeq = useRef(0);

  const configRef = useRef(config);
  configRef.current = config;

  const unsupported = !!config?.fixtures;

  const runFetch = useCallback(async (name: string) => {
    const conn = configRef.current;
    if (conn?.fixtures) {
      return;
    }
    const seq = ++fetchSeq.current;
    setIsLoading(true);
    setError(undefined);
    try {
      if (!conn?.baseURL) {
        throw new Error('useDashboardChartData requires a FrappeProvider with baseURL');
      }
      const res = await getCall(conn.baseURL, conn.auth).post<{
        message: DashboardChartSeries;
      }>(CHART_GET_METHOD, {
        chart_name: name,
        refresh: 1,
      });
      if (seq !== fetchSeq.current) {
        return;
      }
      setSeries(res.payload.message);
    } catch (error) {
      if (seq !== fetchSeq.current) {
        return;
      }
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (seq === fetchSeq.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!chartName || unsupported) {
      setIsLoading(false);
      return;
    }
    void runFetch(chartName);
  }, [chartName, unsupported, runFetch, config?.baseURL]);

  const refresh = useCallback(() => {
    if (chartName) {
      void runFetch(chartName);
    }
  }, [chartName, runFetch]);

  return { series, isLoading, error, unsupported, refresh };
}

// Data hook for frappe Query / Script Reports (the desk
// /app/query-report/<name> surface): loads the Report doc (title,
// ref_doctype, doc-level filters) plus the desk-side script module
// (frappe.desk.query_report.get_script) and runs the report through
// useFrappeReport, the transport FrappeReportView uses too. Wire-shape
// normalization (and the probed response documentation) lives in
// queryReport.ts; this file owns the desk's filter state and gating.
//
//   GET /api/method/frappe.client.get {doctype:"Report", name}
//   → {message: {report_name, ref_doctype, report_type, disabled,
//      prepared_report, add_total_row, filters: [...], ...}}
//   GET /api/method/frappe.desk.query_report.get_script {report_name}
//   → {message: {script, html_format, execution_time, filters}}
//
// Filter meta sources (desk precedence, query_report.js setup): the script
// module's declarative `filters` win when the script declares any; the
// Report doc `filters` child table applies only when it doesn't. Script
// filters are extracted from the raw JS text without eval
// (queryReport.extractScriptFilters) — entries beyond the declarative
// subset (get_query functions, dynamic defaults, desk-only fieldtypes)
// surface as `scriptFilterGap` so the screen can render an honest note.
// `ignore_prepared_report` forces a synchronous run for prepared reports
// (desk's background Prepared Report queue is out of scope here).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFrappeConfig } from '../FrappeProvider';
import { isPermissionError } from '../liveErrors';

import {
  buildRunFilters,
  defaultFilterValues,
  extractScriptFilters,
  humanizeFrappeError,
  isEmptyFilterValue,
  normalizeFilterMeta,
  normalizeQueryReportColumns,
  normalizeQueryReportRows,
} from './queryReport';
import type {
  QueryReportColumn,
  QueryReportFilterMeta,
  QueryReportFilters,
  QueryReportFixture,
  QueryReportMeta,
  QueryReportRow,
} from './queryReport';
import { reportCall, useFrappeReport } from './useFrappeReport';
import type { FrappeReportConnection } from './useFrappeReport';

const SCRIPT_METHOD = 'frappe.desk.query_report.get_script';
const EMPTY_COLUMNS: QueryReportColumn[] = [];
const EMPTY_ROWS: QueryReportRow[] = [];

export interface UseQueryReportOptions {
  fixture?: QueryReportFixture;
  /** Filter values applied before the first run (report swaps re-apply them). */
  initialFilters?: QueryReportFilters;
}

export interface UseQueryReportResult {
  meta?: QueryReportMeta;
  columns: QueryReportColumn[];
  rows: QueryReportRow[];
  /** True until the first meta+script+run cycle settles. */
  loading: boolean;
  /** True while a (re)run is in flight. */
  running: boolean;
  /** The failed run's server sentence; `status` and `exc_type` ride along. */
  error?: Error;
  /** The server refused the run: the session may not run this report (LC-96). */
  refused: boolean;
  /** The report's informational `message` payload (may embed HTML). */
  serverMessage?: string;
  /** Server-reported run time in seconds. */
  executionTime?: number;
  /** Merged filter meta: script-declared filters, else doc-level rows. */
  filterMeta: QueryReportFilterMeta[];
  /**
   * True when the desk script declares filters this surface could not
   * derive (non-declarative entries) — the honest "defined in code" note.
   */
  scriptFilterGap: boolean;
  /** Mandatory filters currently unfilled — the run is skipped while non-empty. */
  missingRequired: QueryReportFilterMeta[];
  filters: QueryReportFilters;
  setFilters: (next: QueryReportFilters) => void;
  reload: () => void;
}

async function fetchReportMeta(connection: FrappeReportConnection, reportName: string): Promise<QueryReportMeta> {
  const res = await reportCall(connection).get<{ message?: QueryReportMeta }>('frappe.client.get', {
    doctype: 'Report',
    name: reportName,
  });
  const doc = res.payload?.message;
  if (!doc) {
    throw new Error(`Report "${reportName}" not found`);
  }
  return doc;
}

async function fetchReportScript(connection: FrappeReportConnection, reportName: string): Promise<string | undefined> {
  const res = await reportCall(connection).get<{ message?: { script?: string | null } }>(SCRIPT_METHOD, {
    report_name: reportName,
  });
  const script = res.payload?.message?.script;
  return typeof script === 'string' ? script : undefined;
}

export function useQueryReport(reportName: string, options: UseQueryReportOptions = {}): UseQueryReportResult {
  const { fixture } = options;
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const auth = config?.auth;
  const connection = useMemo<FrappeReportConnection | undefined>(
    () => (baseURL ? { baseURL, auth } : undefined),
    [baseURL, auth],
  );

  // Latest initialFilters without re-running effects on identity churn.
  const initialFiltersRef = useRef(options.initialFilters);
  initialFiltersRef.current = options.initialFilters;

  const [meta, setMeta] = useState<QueryReportMeta | undefined>();
  const [script, setScript] = useState<string | undefined>();
  const [sourcesSettled, setSourcesSettled] = useState(false);
  const [filters, setFiltersState] = useState<QueryReportFilters>(() => ({
    ...initialFiltersRef.current,
  }));
  const seededFor = useRef<string | undefined>(undefined);

  // The route component is reused across query-report navigations — a
  // report swap resets filters and shows the loading state again.
  const lastReport = useRef(reportName);
  useEffect(() => {
    if (lastReport.current === reportName) {
      return;
    }
    lastReport.current = reportName;
    setFiltersState({ ...initialFiltersRef.current });
    setMeta(undefined);
    setScript(undefined);
    setSourcesSettled(false);
  }, [reportName]);

  // Report doc meta (title, ref_doctype, doc filters) + the desk script
  // module, fetched together. Both are non-fatal niceties — the run below
  // reports the real errors — but the run waits for them so declared
  // defaults are seeded into the FIRST run (desk parity).
  useEffect(() => {
    if (fixture) {
      return;
    }
    if (!connection) {
      setSourcesSettled(true);
      return;
    }
    let cancelled = false;
    setSourcesSettled(false);
    Promise.allSettled([fetchReportMeta(connection, reportName), fetchReportScript(connection, reportName)]).then(
      ([metaResult, scriptResult]) => {
        if (cancelled) {
          return;
        }
        const doc = metaResult.status === 'fulfilled' ? metaResult.value : undefined;
        const scriptText = scriptResult.status === 'fulfilled' ? scriptResult.value : undefined;
        if (doc) {
          setMeta(doc);
        }
        if (scriptText) {
          setScript(scriptText);
        }
        // Seed filter defaults once per report; user edits (and deep-link
        // initialFilters, already in state) win over defaults.
        if (seededFor.current !== reportName) {
          seededFor.current = reportName;
          const extraction = extractScriptFilters(scriptText);
          const merged = extraction.declared ? extraction.filters : normalizeFilterMeta(doc?.filters);
          const defaults = defaultFilterValues(merged);
          if (Object.keys(defaults).length > 0) {
            setFiltersState((previous) => ({ ...defaults, ...previous }));
          }
        }
        setSourcesSettled(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [connection, fixture, reportName]);

  const scriptExtraction = useMemo(() => extractScriptFilters(fixture ? fixture.script : script), [fixture, script]);
  const docFilterMeta = useMemo(
    () => normalizeFilterMeta(fixture ? fixture.meta?.filters : meta?.filters),
    [fixture, meta],
  );
  // Desk precedence (query_report.js): the script module's filters apply
  // when the script declares the key at all; doc rows only otherwise.
  const filterMeta = useMemo(
    () => (scriptExtraction.declared ? scriptExtraction.filters : docFilterMeta),
    [scriptExtraction, docFilterMeta],
  );
  const scriptFilterGap = scriptExtraction.declaredCount > scriptExtraction.filters.length;

  // Fixture branch seeds defaults too (no fetch effect runs for fixtures).
  useEffect(() => {
    if (!fixture) {
      return;
    }
    if (seededFor.current === reportName) {
      return;
    }
    seededFor.current = reportName;
    const defaults = defaultFilterValues(filterMeta);
    if (Object.keys(defaults).length > 0) {
      setFiltersState((previous) => ({ ...defaults, ...previous }));
    }
  }, [fixture, reportName, filterMeta]);

  // Desk parity: defaults SEED the controls (state) once; after that the
  // gate reads the live values only — clearing a defaulted mandatory filter
  // re-gates instead of firing a doomed run (desk's get_filter_values reads
  // control values, not declarations).
  const missingRequired = useMemo(
    () => filterMeta.filter((filter) => filter.mandatory === 1 && isEmptyFilterValue(filters[filter.fieldname])),
    [filterMeta, filters],
  );
  const hasMissingRequired = missingRequired.length > 0;
  const metaDisabled = (fixture ? fixture.meta?.disabled : meta?.disabled) === 1;

  const runFilters = useMemo(() => buildRunFilters(filterMeta, filters), [filterMeta, filters]);
  const runEnabled = !fixture && sourcesSettled && Boolean(connection) && !metaDisabled && !hasMissingRequired;
  const run = useFrappeReport(connection, {
    reportName,
    filters: runFilters,
    ignorePreparedReport: true,
    debounceMs: 0,
    enabled: runEnabled,
  });
  const { refresh } = run;

  const setFilters = useCallback((next: QueryReportFilters) => {
    setFiltersState(next);
  }, []);

  const reload = useCallback(() => {
    if (runEnabled) {
      refresh();
    }
  }, [runEnabled, refresh]);

  const runError = useMemo(() => (run.error ? humanizeFrappeError(run.error) : undefined), [run.error]);

  // Fixture branch: static data, no RPCs (stories/tests).
  const fixtureResult = useMemo(() => {
    if (!fixture) {
      return;
    }
    const fixtureColumns = normalizeQueryReportColumns(fixture.columns);
    return {
      columns: fixtureColumns,
      rows: normalizeQueryReportRows(fixture.rows, fixtureColumns),
      meta: fixture.meta ? ({ name: reportName, ...fixture.meta } as QueryReportMeta) : undefined,
    };
  }, [fixture, reportName]);

  if (fixtureResult) {
    return {
      meta: fixtureResult.meta,
      columns: fixtureResult.columns,
      rows: hasMissingRequired ? EMPTY_ROWS : fixtureResult.rows,
      loading: false,
      running: false,
      error: undefined,
      refused: false,
      serverMessage: fixture?.message,
      executionTime: undefined,
      filterMeta,
      scriptFilterGap,
      missingRequired,
      filters,
      setFilters,
      reload,
    };
  }

  const noConnection = sourcesSettled && !connection;
  // A settled run shows its result; a gated one (disabled report, missing
  // mandatory filters) shows nothing rather than the last report's rows.
  const showsRun = runEnabled && !runError;
  const payload = showsRun ? run.payload : undefined;
  const error = noConnection ? new Error('No Frappe connection configured') : runEnabled ? runError : undefined;
  return {
    meta,
    columns: payload?.columns ?? EMPTY_COLUMNS,
    rows: payload?.rows ?? EMPTY_ROWS,
    loading: !sourcesSettled || (runEnabled && (run.isLoading || (!run.payload && !run.error))),
    running: runEnabled && run.isFetching,
    error,
    refused: error !== undefined && isPermissionError(error),
    serverMessage: payload?.message,
    executionTime: typeof payload?.raw.execution_time === 'number' ? payload.raw.execution_time : undefined,
    filterMeta,
    scriptFilterGap,
    missingRequired,
    filters,
    setFilters,
    reload,
  };
}

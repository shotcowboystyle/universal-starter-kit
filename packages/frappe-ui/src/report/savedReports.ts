// Saved reports — desk parity via the `Report` doctype (report_type
// "Report Builder"): the same records desk's "Select Report" dropdown
// lists. Save/Save As ride the whitelisted frappe.desk.reportview
// save_report / delete_report methods (identical payload shape, so desk
// opens reports saved here and vice versa). Fixture mode (stories / no
// bench) keeps an in-memory list so the control stays demonstrable.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFrappeConfig } from '../FrappeProvider';

import { toDeskReportSettings, fromDeskReportSettings } from './reportViewModel';
import type { ReportViewConfig } from './reportViewModel';
import { reportCall } from './useFrappeReport';
import type { FrappeReportConnection } from './useFrappeReport';

export interface SavedReportSummary {
  /** Report document name (usually equals the report title). */
  name: string;
  reportName: string;
  json?: string;
}

export interface UseSavedReportsResult {
  reports: SavedReportSummary[];
  loading: boolean;
  /** Load a saved report's view config (fields/filters/sort/…). */
  load: (name: string) => Promise<ReportViewConfig | undefined>;
  /** Create or update a Report doc; returns the server-side name. */
  save: (name: string, config: ReportViewConfig) => Promise<string>;
  remove: (name: string) => Promise<void>;
  refresh: () => void;
}

interface ReportListRow {
  name: string;
  report_name?: string;
  json?: string;
}

/**
 * Where saved reports are read and written. Omitted, the ambient
 * FrappeProvider's connection; `fixtures` keeps them in memory.
 */
export interface SavedReportsConnection extends FrappeReportConnection {
  fixtures?: unknown;
}

export function useSavedReports(doctype: string, connection?: SavedReportsConnection): UseSavedReportsResult {
  const config = useFrappeConfig();
  const baseURL = connection ? connection.baseURL : config?.baseURL;
  const auth = connection ? connection.auth : config?.auth;
  const fixtureMode = Boolean(connection ? connection.fixtures : config?.fixtures);
  const call = useMemo(() => (baseURL ? reportCall({ baseURL, auth }) : undefined), [baseURL, auth]);
  const [reports, setReports] = useState<SavedReportSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generation, setGeneration] = useState(0);
  // Fixture-mode saves live here (stories/tests) — never reaches a bench.
  const memoryConfigs = useRef(new Map<string, ReportViewConfig>());

  useEffect(() => {
    memoryConfigs.current = new Map();
    setReports([]);
  }, [doctype]);

  useEffect(() => {
    if (!call || fixtureMode) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    call
      .get<{ message?: ReportListRow[] }>('frappe.client.get_list', {
        doctype: 'Report',
        filters: JSON.stringify([
          ['ref_doctype', '=', doctype],
          ['report_type', '=', 'Report Builder'],
          ['disabled', '=', 0],
        ]),
        fields: JSON.stringify(['name', 'report_name', 'json']),
        limit_page_length: 0,
        order_by: 'report_name asc',
      })
      .then((res) => {
        if (cancelled) {
          return;
        }
        const rows = res.payload?.message ?? [];
        setReports(
          rows.map((row) => ({
            name: row.name,
            reportName: row.report_name ?? row.name,
            json: row.json,
          })),
        );
        setLoading(false);
      })
      .catch(() => {
        // Report doctype may be unreadable for restricted roles — the
        // selector then simply offers no saved reports.
        if (cancelled) {
          return;
        }
        setReports([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [call, fixtureMode, doctype, generation]);

  const load = useCallback(
    async (name: string): Promise<ReportViewConfig | undefined> => {
      if (fixtureMode) {
        return memoryConfigs.current.get(name);
      }
      const summary = reports.find((report) => report.name === name);
      let json = summary?.json;
      if (json === undefined && call) {
        const res = await call.get<{ message?: { json?: string } }>('frappe.client.get_value', {
          doctype: 'Report',
          filters: JSON.stringify({ name }),
          fieldname: JSON.stringify(['json']),
        });
        json = res.payload?.message?.json;
      }
      if (!json) {
        return undefined;
      }
      try {
        return fromDeskReportSettings(doctype, JSON.parse(json));
      } catch {
        return undefined;
      }
    },
    [call, fixtureMode, reports, doctype],
  );

  const save = useCallback(
    async (name: string, viewConfig: ReportViewConfig): Promise<string> => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error('Report name is required');
      }
      if (fixtureMode || !call) {
        memoryConfigs.current.set(trimmed, viewConfig);
        setReports((previous) => [
          ...previous.filter((report) => report.name !== trimmed),
          { name: trimmed, reportName: trimmed },
        ]);
        return trimmed;
      }
      const res = await call.post<{ message?: string }>('frappe.desk.reportview.save_report', {
        name: trimmed,
        doctype,
        report_settings: JSON.stringify(toDeskReportSettings(doctype, viewConfig)),
      });
      setGeneration((value) => value + 1);
      return res.payload?.message ?? trimmed;
    },
    [call, fixtureMode, doctype],
  );

  const remove = useCallback(
    async (name: string): Promise<void> => {
      if (fixtureMode || !call) {
        memoryConfigs.current.delete(name);
        setReports((previous) => previous.filter((report) => report.name !== name));
        return;
      }
      await call.post('frappe.desk.reportview.delete_report', { name });
      setGeneration((value) => value + 1);
    },
    [call, fixtureMode],
  );

  const refresh = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  return useMemo(
    () => ({ reports, loading, load, save, remove, refresh }),
    [reports, loading, load, save, remove, refresh],
  );
}

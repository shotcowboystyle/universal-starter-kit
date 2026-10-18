import { Button } from '@repo/forms';
import { Order, frappeFieldTypes, useDocTypeMeta } from '@repo/frappe';
import type { DocTypeField, FrappeFieldType } from '@repo/frappe';
import { downloadBlob } from '@repo/platform';
import { storage } from '@repo/store';
import { DataTablePagination } from '@repo/table';
import { useResolvedKnobs } from '@repo/theme';
/**
 * FrappeReportBuilder — a doctype's report view, the desk's
 * /app/<doctype>/view/report (MPO-15, GL-28). The desk's view=report renders
 * this component, so an app that reaches for it gets the same report the desk
 * shows:
 *   - desk default columns (name, status, title/image fields, in_list_view
 *     and in_standard_filter fields, currency sources, modified), a column
 *     picker whose choice persists per doctype on this device while no saved
 *     report is selected
 *   - a per-column filter row on the standard frappe filter pipeline
 *   - one toolbar row: columns, group-by, saved reports, filter chips, export
 *   - saved reports on the `Report` doctype, the records desk's "Select
 *     Report" lists (in memory on a fixture corpus)
 *   - live rows through the collection channel: the full filtered result
 *     stays client-side (totals and export need it), ordered
 *     deterministically and paged client-side, with a totals row
 *   - a reader refused DocType meta (Guest) still gets the rows, laid out
 *     from `initialColumns` or one record's own fields, with nothing to save
 *     (LC-96); rows refused too is a permission state, never a retry
 * The model is `./report/reportViewModel`; navigation, scope and the selected
 * saved report come in as props, so the desk and a plain app mount the same
 * component.
 */
import { BarChart, EmptyState, ScrollView, Spinner, YStack, isWeb, notify } from '@repo/ui';
import type { GroupByConfig, ReportColumn } from '@repo/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { YStackProps } from 'tamagui';

import { FrappeNotConfigured } from './FrappeNotConfigured';
import { useFrappeConfig } from './FrappeProvider';
import { isPermissionError, refusalReason } from './liveErrors';
import { recordKeyLabel, useRecordShape } from './recordShape';
import { ReportGrid } from './report/ReportGrid';
import {
  DEFAULT_REPORT_PAGE_SIZE,
  REPORT_PAGE_SIZES,
  buildGridRows,
  buildReportCsv,
  columnFilterTuples,
  computeTotals,
  defaultReportFieldnames,
  orderReportRows,
  reportColumnsFromMeta,
  resolveSelectedColumns,
} from './report/reportViewModel';
import type { ReportFilters, ReportMetaSource, ReportRow, ReportSortState } from './report/reportViewModel';
import { ReportViewToolbar } from './report/ReportViewToolbar';
import { useSavedReports } from './report/savedReports';
import { useFrappeRows } from './useFrappeRows';

type FilterTuple = [string, string, unknown];

export interface FrappeReportBuilderProps extends Omit<YStackProps, 'children'> {
  /** Proper-cased doctype name (e.g. "ToDo", "Sales Order"). */
  doctype: string;
  /**
   * The report's own filters (a deep link, a host's preset). They show as
   * chips the user can clear. The object form means `field = value`.
   */
  filters?: Record<string, unknown> | FilterTuple[];
  /**
   * Filters ANDed into every query: invisible to the chips and not
   * clearable (a desk or tenant scope).
   */
  scopeFilters?: FilterTuple[];
  /** After the user clears `filters`, so a host can drop them from its address too. */
  onClearFilters?: () => void;
  /**
   * Starting columns by fieldname, or as `ReportColumn` rows (the enabled
   * ones). Defaults to desk's default columns.
   */
  initialColumns?: readonly (string | ReportColumn)[];
  /** Starting group-by field; a `GroupByConfig` also sets the chart's aggregation. */
  initialGroupBy?: string | GroupByConfig;
  /** A bar chart of the groups above the grid while the rows are grouped. */
  showChart?: boolean;
  /** Open a row's document. */
  onOpenRow?: (name: string) => void;
  /** A row press with the row and its index in the full ordered result. */
  onRowPress?: (row: Record<string, unknown>, index: number) => void;
  /** Open a Link cell's target document. */
  onOpenLink?: (doctype: string, name: string) => void;
  /**
   * The selected saved report (a `Report Builder` Report doc name), or null
   * for an unsaved report. Given, the selection is controlled.
   */
  report?: string | null;
  onReportChange?: (report: string | null) => void;
  /** Replaces the CSV download; receives the full filtered, ordered rows. */
  onExport?: (rows: Record<string, unknown>[]) => void;
  /** Shown while the doctype's meta loads. */
  loading?: ReactNode;
  /** Shown when the doctype's meta cannot be read. */
  error?: (error: Error) => ReactNode;
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: Record<string, unknown>;
}

const EMPTY_FILTERS: ReportFilters = [];
const COLUMN_FILTER_DEBOUNCE_MS = 350;

function columnsStorageKey(doctype: string): string {
  return `backoffice.report.columns.${doctype}`;
}

async function readStoredColumns(doctype: string): Promise<string[] | undefined> {
  try {
    const raw = await Promise.resolve(storage.getItem(columnsStorageKey(doctype)));
    if (!raw) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed;
    }
  } catch {
    // storage unavailable or corrupted — defaults win
  }
  return undefined;
}

function persistStoredColumns(doctype: string, fieldnames: readonly string[]): void {
  try {
    void Promise.resolve(storage.setItem(columnsStorageKey(doctype), JSON.stringify(fieldnames)));
  } catch {
    // storage unavailable — selection stays session-only
  }
}

/** `{field: value}` → equality tuples; tuple arrays pass through. */
function toReportFilters(filters: FrappeReportBuilderProps['filters']): ReportFilters | undefined {
  if (!filters) {
    return undefined;
  }
  if (Array.isArray(filters)) {
    return filters.length > 0 ? filters : undefined;
  }
  const tuples = Object.entries(filters).map(([field, value]): FilterTuple => [field, '=', value]);
  return tuples.length > 0 ? tuples : undefined;
}

function initialFieldnames(columns: FrappeReportBuilderProps['initialColumns']): string[] | null {
  if (!columns) {
    return null;
  }
  const fieldnames = columns.flatMap((column) =>
    typeof column === 'string' ? [column] : column.enabled ? [column.fieldname] : [],
  );
  return fieldnames.length > 0 ? fieldnames : null;
}

function asFieldType(fieldtype: string | undefined): FrappeFieldType {
  return frappeFieldTypes.find((known) => known === fieldtype) ?? 'Data';
}

/**
 * What a reader refused DocType meta lays the report out from (LC-96): the
 * host's `initialColumns`, else one record's own fields. Read-only and all in
 * the default columns.
 */
function refusedMetaFields(
  initialColumns: FrappeReportBuilderProps['initialColumns'],
  recordFields: readonly DocTypeField[] | undefined,
): DocTypeField[] {
  const declared = (initialColumns ?? []).map((column): DocTypeField =>
    typeof column === 'string'
      ? { fieldname: column, label: recordKeyLabel(column), fieldtype: 'Data' }
      : {
          fieldname: column.fieldname,
          label: column.label,
          fieldtype: asFieldType(column.fieldtype),
        },
  );
  return (declared.length > 0 ? declared : (recordFields ?? []))
    .filter((field) => field.fieldname !== 'name')
    .map((field) => ({ ...field, read_only: 1, in_list_view: 1 }));
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function groupField(groupBy: FrappeReportBuilderProps['initialGroupBy']): string | null {
  if (!groupBy) {
    return null;
  }
  return typeof groupBy === 'string' ? groupBy : groupBy.field;
}

/** Group value → aggregate over its rows (count unless the config names one). */
function aggregateGroups(
  rows: readonly ReportRow[],
  field: string,
  config: GroupByConfig | undefined,
): { label: string; value: number }[] {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = row[field] === null || row[field] === undefined ? '' : String(row[field]);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  const numbers = (group: ReportRow[]) =>
    group.map((row) => Number(config?.aggregationField ? row[config.aggregationField] : 0) || 0);
  return [...groups.entries()].map(([label, group]) => {
    switch (config?.aggregationField ? config.aggregation : 'count') {
      case 'sum': {
        return { label, value: numbers(group).reduce((sum, value) => sum + value, 0) };
      }
      case 'avg': {
        return {
          label,
          value: numbers(group).reduce((sum, value) => sum + value, 0) / group.length,
        };
      }
      case 'min': {
        return { label, value: Math.min(...numbers(group)) };
      }
      case 'max': {
        return { label, value: Math.max(...numbers(group)) };
      }
      default: {
        return { label, value: group.length };
      }
    }
  });
}

/**
 * The export button needs somewhere to put a file: a DOM anchor and an
 * object URL. Native and GTK have neither, so the built-in CSV path is left
 * out there (B12); a host `onExport` owns delivery and shows everywhere.
 */
function canDownloadCsv(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

export function FrappeReportBuilder(props: FrappeReportBuilderProps) {
  const config = useFrappeConfig();
  if (!(props.baseURL ?? config?.baseURL) && !config?.fixtures) {
    return <FrappeNotConfigured doctype={props.doctype} />;
  }
  return <FrappeReportBuilderBody {...props} />;
}

function FrappeReportBuilderBody({
  doctype,
  filters,
  scopeFilters,
  onClearFilters,
  initialColumns,
  initialGroupBy,
  showChart = false,
  onOpenRow,
  onRowPress,
  onOpenLink,
  report: reportProp,
  onReportChange,
  onExport,
  loading: loadingFallback,
  error: errorFallback,
  baseURL,
  auth,
  syncOptions,
  ...stackProps
}: FrappeReportBuilderProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const config = useFrappeConfig();
  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;
  const fixtureMode = Boolean(config?.fixtures);

  const connection = useMemo(
    () => ({
      baseURL: finalBaseURL,
      socketPort: config?.socketPort,
      siteName: config?.siteName,
      socketBaseURL: config?.socketBaseURL,
      auth: finalAuth,
      syncOptions: finalSyncOptions,
      realtime: config?.realtime,
      fixtures: config?.fixtures,
    }),
    [
      finalBaseURL,
      config?.socketPort,
      config?.siteName,
      config?.socketBaseURL,
      finalAuth,
      finalSyncOptions,
      config?.realtime,
      config?.fixtures,
    ],
  );
  const { meta, isLoading: metaLoading, error: metaError } = useDocTypeMeta(connection, doctype);
  const metaRefused = !meta && metaError !== undefined && isPermissionError(metaError);
  const initialColumnsJson = JSON.stringify(initialColumns ?? []);
  const declaresColumns = initialColumnsJson !== '[]';
  const recordShape = useRecordShape(connection, doctype, metaRefused && !declaresColumns);
  const layoutMeta = useMemo((): ReportMetaSource | undefined => {
    if (meta) {
      return meta;
    }
    if (!metaRefused) {
      return undefined;
    }
    const fields = refusedMetaFields(
      JSON.parse(initialColumnsJson) as FrappeReportBuilderProps['initialColumns'],
      recordShape.fields,
    );
    return fields.length > 0 ? { fields } : undefined;
  }, [meta, metaRefused, initialColumnsJson, recordShape.fields]);
  const readsWithoutMeta = !meta && layoutMeta !== undefined;
  const savedReports = useSavedReports(
    doctype,
    useMemo(
      () => ({
        baseURL: metaRefused ? '' : (connection.baseURL ?? ''),
        auth: connection.auth,
        fixtures: connection.fixtures,
      }),
      [metaRefused, connection.baseURL, connection.auth, connection.fixtures],
    ),
  );

  // ── Saved-report selection: controlled by `report`, else internal ──
  const [internalReport, setInternalReport] = useState<string | null>(null);
  const currentReport = reportProp === undefined ? internalReport : reportProp;

  // ── Columns: defaults → device-stored → initial → explicit override ──
  const allColumns = useMemo(() => {
    const columns = reportColumnsFromMeta(layoutMeta);
    if (!readsWithoutMeta || !layoutMeta) {
      return columns;
    }
    const own = new Set(layoutMeta.fields.map((field) => field.fieldname));
    return columns.filter((column) => column.fieldname === 'name' || own.has(column.fieldname));
  }, [layoutMeta, readsWithoutMeta]);
  const defaultFieldnames = useMemo(
    () =>
      readsWithoutMeta && layoutMeta
        ? ['name', ...layoutMeta.fields.map((field) => field.fieldname)]
        : defaultReportFieldnames(layoutMeta),
    [layoutMeta, readsWithoutMeta],
  );
  const initialColumnsKey = JSON.stringify(initialFieldnames(initialColumns));
  const startFieldnames = useMemo(() => JSON.parse(initialColumnsKey) as string[] | null, [initialColumnsKey]);
  const [storedColumns, setStoredColumns] = useState<string[] | undefined>();
  const [selectedOverride, setSelectedOverride] = useState<string[] | null>(null);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
    let cancelled = false;
    void readStoredColumns(doctype).then((stored) => {
      if (!cancelled) {
        setStoredColumns(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doctype, fixtureMode]);

  const selectedFieldnames = selectedOverride ?? startFieldnames ?? storedColumns ?? defaultFieldnames;
  const selectedColumns = useMemo(
    () => resolveSelectedColumns(allColumns, selectedFieldnames),
    [allColumns, selectedFieldnames],
  );

  // ── Filters: the report's own + the per-column filter row ─────
  const filtersKey = JSON.stringify(filters ?? null);
  const propFilters = useMemo(
    () => toReportFilters(JSON.parse(filtersKey) as FrappeReportBuilderProps['filters']),
    [filtersKey],
  );
  const [filtersCleared, setFiltersCleared] = useState(false);
  const [reportFilters, setReportFilters] = useState<ReportFilters | null>(null);
  const baseFilters = filtersCleared ? EMPTY_FILTERS : (reportFilters ?? propFilters ?? EMPTY_FILTERS);

  const [filterDrafts, setFilterDrafts] = useState<Record<string, string>>({});
  const [committedFilters, setCommittedFilters] = useState<Record<string, string>>({});
  useEffect(() => {
    const handle = setTimeout(() => {
      setCommittedFilters((previous) =>
        JSON.stringify(previous) === JSON.stringify(filterDrafts) ? previous : filterDrafts,
      );
    }, COLUMN_FILTER_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [filterDrafts]);

  const columnTuples = useMemo(
    () => columnFilterTuples(selectedColumns, committedFilters),
    [selectedColumns, committedFilters],
  );
  const scopeKey = JSON.stringify(scopeFilters ?? []);
  const scope = useMemo(() => JSON.parse(scopeKey) as ReportFilters, [scopeKey]);
  const effectiveFilters = useMemo(
    () => [...scope, ...baseFilters, ...columnTuples],
    [scope, baseFilters, columnTuples],
  );

  // ── Sort / group / paging ───────────────────────────────────
  const metaSort = useMemo<ReportSortState>(
    () => ({
      field: (meta?.sort_field ?? 'modified').split(' ')[0],
      order: (meta?.sort_order ?? 'DESC').toLowerCase() === 'asc' ? 'asc' : 'desc',
    }),
    [meta?.sort_field, meta?.sort_order],
  );
  const [sortOverride, setSortOverride] = useState<ReportSortState | null>(null);
  const sort = sortOverride ?? metaSort;
  const startGroupBy = groupField(initialGroupBy);
  const chartConfig = typeof initialGroupBy === 'object' ? initialGroupBy : undefined;
  const [groupBy, setGroupBy] = useState<string | null>(startGroupBy);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_REPORT_PAGE_SIZE);
  const [page, setPage] = useState(0);

  // A doctype swap resets every view state (a route reuses the component).
  useEffect(() => {
    setSelectedOverride(null);
    setStoredColumns(undefined);
    setSortOverride(null);
    setGroupBy(startGroupBy);
    setPage(0);
    setPageSize(DEFAULT_REPORT_PAGE_SIZE);
    setFilterDrafts({});
    setCommittedFilters({});
    setFiltersCleared(false);
    setReportFilters(null);
    // startGroupBy is the mount-time seed; only a doctype swap re-seeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype]);

  useEffect(() => {
    setFiltersCleared(false);
  }, [filtersKey]);

  const effectiveFiltersKey = useMemo(() => JSON.stringify(effectiveFilters), [effectiveFilters]);
  useEffect(() => {
    setPage(0);
  }, [effectiveFiltersKey, pageSize, groupBy]);

  // ── Apply a saved report's config when the selection changes ─
  useEffect(() => {
    if (!currentReport) {
      setReportFilters(null);
      return;
    }
    let cancelled = false;
    void savedReports.load(currentReport).then((saved) => {
      if (cancelled || !saved) {
        return;
      }
      setSelectedOverride(saved.fieldnames.length > 0 ? saved.fieldnames : null);
      setReportFilters(saved.filters);
      setFilterDrafts({});
      setCommittedFilters({});
      setFiltersCleared(false);
      if (saved.sort) {
        setSortOverride(saved.sort);
      }
      if (saved.pageSize && REPORT_PAGE_SIZES.some((size) => size === saved.pageSize)) {
        setPageSize(saved.pageSize);
      }
      setGroupBy(saved.groupBy ?? null);
    });
    return () => {
      cancelled = true;
    };
    // savedReports.load changes identity with its report list; reloading the
    // config on list refreshes would clobber in-progress edits — key on the
    // selected report (and doctype via load's closure) only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentReport, doctype]);

  // ── Column selection changes ────────────────────────────────
  const handleToggleColumn = useCallback(
    (fieldname: string) => {
      setSelectedOverride((previous) => {
        const current = previous ?? startFieldnames ?? storedColumns ?? defaultFieldnames;
        const next = current.includes(fieldname)
          ? current.length === 1
            ? current
            : current.filter((entry) => entry !== fieldname)
          : [...current, fieldname];
        if (!fixtureMode && !currentReport) {
          persistStoredColumns(doctype, next);
        }
        return next;
      });
    },
    [startFieldnames, storedColumns, defaultFieldnames, fixtureMode, currentReport, doctype],
  );

  const handleResetColumns = useCallback(() => {
    setSelectedOverride(defaultFieldnames);
    setStoredColumns(undefined);
    if (!fixtureMode) {
      persistStoredColumns(doctype, defaultFieldnames);
    }
  }, [defaultFieldnames, fixtureMode, doctype]);

  // ── Data: live collection over the full filtered result ─────
  const fetchFields = useMemo(() => {
    const fields = new Set<string>(['name', sort.field]);
    for (const column of selectedColumns) {
      fields.add(column.fieldname);
    }
    if (groupBy) {
      fields.add(groupBy);
    }
    if (chartConfig?.aggregationField) {
      fields.add(chartConfig.aggregationField);
    }
    return [...fields];
  }, [selectedColumns, sort.field, groupBy, chartConfig?.aggregationField]);

  const orderBy = useMemo(
    () => [{ field: sort.field, order: sort.order === 'asc' ? Order.Asc : Order.Desc }],
    [sort.field, sort.order],
  );
  const {
    rows: rowsData,
    syncError,
    isLoading: rowsLoading,
  } = useFrappeRows<ReportRow & { doctype: string }>(connection, doctype, {
    fields: fetchFields,
    filters: effectiveFilters,
    orderBy,
    limit: null,
    enabled: layoutMeta !== undefined,
    mapError: asError,
  });

  const orderedRows = useMemo(() => orderReportRows(rowsData, sort, groupBy), [rowsData, sort, groupBy]);

  const total = orderedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, pageCount - 1);
  const gridRows = useMemo(
    () => buildGridRows(orderedRows, effectivePage * pageSize, pageSize, groupBy),
    [orderedRows, effectivePage, pageSize, groupBy],
  );
  const totals = useMemo(() => computeTotals(selectedColumns, orderedRows), [selectedColumns, orderedRows]);
  const groupByColumn = groupBy ? allColumns.find((column) => column.fieldname === groupBy) : undefined;
  const chartData = useMemo(
    () => (showChart && groupBy ? aggregateGroups(orderedRows, groupBy, chartConfig) : []),
    [showChart, groupBy, orderedRows, chartConfig],
  );

  // ── Navigation ──────────────────────────────────────────────
  const rowsPressable = Boolean(onOpenRow ?? onRowPress);
  const handleOpenRow = useCallback(
    (name: string) => {
      onOpenRow?.(name);
      if (onRowPress) {
        const index = orderedRows.findIndex((row) => row.name === name);
        if (index !== -1) {
          onRowPress(orderedRows[index], index);
        }
      }
    },
    [onOpenRow, onRowPress, orderedRows],
  );

  const handleSelectReport = useCallback(
    (name: string | null) => {
      if (reportProp === undefined) {
        setInternalReport(name);
      }
      onReportChange?.(name);
      if (!name) {
        setReportFilters(null);
        setSelectedOverride(null);
        setSortOverride(null);
        setGroupBy(null);
      }
    },
    [reportProp, onReportChange],
  );

  const handleClearBaseFilters = useCallback(() => {
    setFiltersCleared(true);
    if (propFilters && !reportFilters) {
      onClearFilters?.();
    }
  }, [propFilters, reportFilters, onClearFilters]);

  // ── Saved-report actions ────────────────────────────────────
  const handleSaveReport = useCallback(
    (name: string) => {
      void savedReports
        .save(name, {
          fieldnames: [...selectedFieldnames],
          filters: effectiveFilters,
          sort,
          pageSize,
          groupBy,
          addTotals: totals.length > 0,
        })
        .then((savedName) => {
          notify({
            severity: 'success',
            scope: 'page',
            body: t('report.saveDone', {
              defaultValue: 'Saved report “{{name}}”',
              name: savedName,
            }),
          });
          if (savedName !== currentReport) {
            handleSelectReport(savedName);
          }
        })
        .catch((error: unknown) => {
          notify({
            severity: 'error',
            scope: 'page',
            body: error instanceof Error ? error.message : t('report.saveFailed', 'Could not save the report'),
          });
        });
    },
    [
      savedReports,
      selectedFieldnames,
      effectiveFilters,
      sort,
      pageSize,
      groupBy,
      totals.length,
      currentReport,
      handleSelectReport,
      t,
    ],
  );

  const handleDeleteReport = useCallback(
    (name: string) => {
      void savedReports
        .remove(name)
        .then(() => {
          notify({
            severity: 'success',
            scope: 'page',
            body: t('report.deleteDone', {
              defaultValue: 'Deleted report “{{name}}”',
              name,
            }),
          });
          if (name === currentReport) {
            handleSelectReport(null);
          }
        })
        .catch((error: unknown) => {
          notify({
            severity: 'error',
            scope: 'page',
            body: error instanceof Error ? error.message : t('report.deleteFailed', 'Could not delete the report'),
          });
        });
    },
    [savedReports, currentReport, handleSelectReport, t],
  );

  // ── Export: full filtered + ordered result ──────────────────
  const exportEnabled = Boolean(onExport) || canDownloadCsv();
  const handleExport = useCallback(() => {
    if (onExport) {
      onExport(orderedRows);
      return;
    }
    downloadBlob(
      new Blob([buildReportCsv(selectedColumns, orderedRows)], {
        type: 'text/csv;charset=utf-8;',
      }),
      `${doctype}_report.csv`,
    );
    notify({
      severity: 'success',
      scope: 'page',
      body: t('report.exportDone', {
        count: orderedRows.length,
        defaultValue_one: 'Exported {{count}} row to CSV',
        defaultValue_other: 'Exported {{count}} rows to CSV',
      }),
    });
  }, [onExport, selectedColumns, orderedRows, doctype, t]);

  const handleColumnFilterChange = useCallback((fieldname: string, value: string) => {
    setFilterDrafts((previous) => {
      if (value === '') {
        if (!(fieldname in previous)) {
          return previous;
        }
        const { [fieldname]: _dropped, ...rest } = previous;
        return rest;
      }
      return { ...previous, [fieldname]: value };
    });
  }, []);

  const handleClearColumnFilters = useCallback(() => {
    setFilterDrafts({});
    setCommittedFilters({});
  }, []);

  // ── Render ──────────────────────────────────────────────────
  if (metaLoading && !meta) {
    return (
      <>
        {loadingFallback ?? (
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            {...stackProps}>
            <Spinner size="large" />
          </YStack>
        )}
      </>
    );
  }
  if (metaError && metaRefused && !layoutMeta) {
    if (recordShape.status === 'pending') {
      return (
        <>
          {loadingFallback ?? (
            <YStack
              flex={1}
              alignItems="center"
              justifyContent="center"
              {...stackProps}>
              <Spinner size="large" />
            </YStack>
          )}
        </>
      );
    }
    return (
      <>
        {errorFallback ? (
          errorFallback(metaError)
        ) : (
          <EmptyState
            testID="frappe-report-not-permitted"
            title={t('report.notPermitted', {
              defaultValue: "You can't open the {{doctype}} report",
              doctype,
            })}
            description={refusalReason(metaError)}
          />
        )}
      </>
    );
  }
  if (metaError && !meta && !readsWithoutMeta) {
    return (
      <>
        {errorFallback ? (
          errorFallback(metaError)
        ) : (
          <EmptyState
            intent="error"
            title={t('report.metaFailed', {
              defaultValue: "Couldn't load the {{doctype}} report",
              doctype,
            })}
            description={metaError.message}
          />
        )}
      </>
    );
  }

  let body: React.ReactNode;
  if (syncError && isPermissionError(syncError)) {
    body = (
      <EmptyState
        testID="frappe-report-not-permitted"
        title={t('report.notPermitted', {
          defaultValue: "You can't open the {{doctype}} report",
          doctype,
        })}
        description={refusalReason(syncError)}
      />
    );
  } else if (syncError) {
    body = (
      <EmptyState
        intent="error"
        title={t('report.loadFailed', "Couldn't load report rows")}
        description={syncError.message}
      />
    );
  } else if (rowsLoading && total === 0) {
    body = (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center">
        <Spinner size="large" />
      </YStack>
    );
  } else if (total === 0) {
    const hasFilters = effectiveFilters.length > 0;
    body = (
      <EmptyState
        title={t('report.emptyTitle', 'No results')}
        description={
          hasFilters
            ? t('report.emptyFiltered', 'No rows match the current filters')
            : t('report.emptyDescription', {
                defaultValue: 'There are no {{doctype}} records yet',
                doctype,
              })
        }
        action={
          hasFilters ? (
            <Button
              size="$3"
              onPress={() => {
                handleClearColumnFilters();
                handleClearBaseFilters();
              }}>
              {t('report.clearAllFilters', 'Clear all filters')}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <YStack
        flex={1}
        minWidth={0}
        {...knobProps.gap}>
        {chartData.length > 0 && (
          <YStack
            {...knobProps.surface}
            {...knobProps.containerRadius}
            {...knobProps.panelPadding}>
            <BarChart data={chartData} />
          </YStack>
        )}
        <ReportGrid
          columns={selectedColumns}
          rows={gridRows}
          sort={sort}
          onSortChange={setSortOverride}
          columnFilters={filterDrafts}
          onColumnFilterChange={handleColumnFilterChange}
          onOpenRow={rowsPressable ? handleOpenRow : undefined}
          onOpenLink={onOpenLink}
          totals={totals}
          groupByColumn={groupByColumn}
        />
      </YStack>
    );
  }

  const content = (
    <YStack
      flex={1}
      minWidth={0}
      {...stackProps}>
      <ReportViewToolbar
        columns={allColumns}
        selected={selectedFieldnames}
        onToggleColumn={handleToggleColumn}
        onResetColumns={handleResetColumns}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        baseFilters={baseFilters}
        onClearBaseFilters={baseFilters.length > 0 ? handleClearBaseFilters : undefined}
        columnFilterCount={columnTuples.length}
        onClearColumnFilters={handleClearColumnFilters}
        savedReports={savedReports.reports}
        currentReport={currentReport}
        onSelectReport={handleSelectReport}
        onSaveReport={readsWithoutMeta ? undefined : handleSaveReport}
        onDeleteReport={readsWithoutMeta ? undefined : handleDeleteReport}
        onExport={exportEnabled ? handleExport : undefined}
        exportDisabled={total === 0}
      />
      <YStack
        flex={1}
        minWidth={0}
        paddingHorizontal="$3">
        {body}
      </YStack>
      {total > 0 && !syncError && (
        <YStack
          paddingHorizontal="$3"
          paddingVertical="$2">
          <DataTablePagination
            pagination={{
              pageIndex: effectivePage,
              pageSize,
              totalCount: total,
              totalPages: pageCount,
            }}
            onPaginationChange={(next) => {
              setPage(next.pageIndex);
              setPageSize(next.pageSize);
            }}
            pageSizeOptions={[...REPORT_PAGE_SIZES]}
            compact
          />
        </YStack>
      )}
    </YStack>
  );

  // Native has no page-level scroll (the desk list precedent) — wrap so rows
  // below the fold stay reachable. Web keeps the flex layout.
  return isWeb ? content : <ScrollView flex={1}>{content}</ScrollView>;
}

export type { ReportColumn, GroupByConfig } from '@repo/ui';

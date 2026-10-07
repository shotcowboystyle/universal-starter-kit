/**
 * FrappeReportView — renders a named server-side report (Query Report /
 * Script Report) through the house DataTable.
 *
 * Backend contract (verified against the bench source,
 * `frappe/desk/query_report.py`):
 *   `frappe.desk.query_report.run(report_name, filters)` →
 *   `{ result, columns, message, chart, report_summary, add_total_row, … }`
 *   - `columns` are dicts (`get_column_as_dict`) carrying
 *     `label` / `fieldname` / `fieldtype` / `width` / `options`; legacy
 *     string columns (`"Label:Fieldtype/Options:Width"`) are normalized
 *     client-side too because prepared-report payloads can still carry them.
 *   - `result` rows are dicts after the server's `normalize_result`, BUT the
 *     server-appended total row (`add_total_row`) is a plain array — rows are
 *     therefore re-keyed defensively here (`normalizeReportRows`).
 *
 * The payload, filter and column shapes are the one query-report model in
 * `./report/queryReport` (MPO-15, GL-28), and the transport is
 * `./report/useFrappeReport`, the same caller the desk's QueryReportScreen
 * runs its reports through. This file owns rendering only.
 *
 * Filter bar: built from the report's DB-defined filters (the Report doc's
 * `filters` child table, fetched via `frappe.desk.query_report.get_script`).
 * Standard reports define filters in their client `.js` instead — the child
 * table is empty there, so consumers pass `filterFields` explicitly. Filter
 * fieldtypes map to the house form fields (Data / Select / Date / Check);
 * anything else falls back to Data.
 *
 * Column mapping targets read-only display: fieldtypes map to DataTable
 * `field` types and cells format through the forms `FieldDisplay` pipeline
 * (`readOnly`); the DG-TBL-01 align-by-type resolution (numerics right via
 * `stepper`, Check centered via `checkbox`, text left) is pinned once per
 * column on the typed `meta.align` channel. Row activation rides
 * DataTable's first-class `onRowPress`/`rowLabel` contract — the whole row
 * is ONE pressable unit (no per-cell pressable wrappers), named by the
 * report row's `name`/`title` value when present.
 *
 * CSV/JSON export reuses `DataTableExport` from `@repo/table`
 * (no new export machinery), capability-gated like FrappeReportBuilder (B12):
 * hidden where the web download pipeline does not exist.
 */
import { AsyncBoundary, EmptyState } from '@repo/ui';
import { Button, DatePicker, Spinner, formCommonColors } from '@repo/forms';
import { DataTable, DataTableExport, getDefaultColumnAlign } from '@repo/table';
import type { DataTableColumn, DataTableProps, DataTableField } from '@repo/table';
import { formatCalendarDate, useResolvedKnobs } from '@repo/theme';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { Check } from './fields/Check';
import { Data } from './fields/Data';
import { Select } from './fields/Select';
import { useFrappeConfig } from './FrappeProvider';
import { isPermissionError, refusalReason, toLiveLoadError } from './liveErrors';
import { humanizeFrappeError, normalizeFilterMeta, scrubFieldname } from './report/queryReport';
import type {
  FrappeReportColumn,
  FrappeReportFilterDef,
  FrappeReportRow,
  FrappeReportValues,
  QueryReportFilterMeta,
} from './report/queryReport';
import { useFrappeReport } from './report/useFrappeReport';
import type { FrappeReportConnection, FrappeReportFixture } from './report/useFrappeReport';

export {
  compactFilterValues,
  normalizeReportColumn,
  normalizeReportPayload,
  normalizeReportRows,
  scrubFieldname,
  type FrappeReportColumn,
  type FrappeReportFilterDef,
  type FrappeReportPayload,
  type FrappeReportRow,
  type FrappeReportRunResponse,
  type FrappeReportValues,
} from './report/queryReport';
export {
  useFrappeReport,
  type FrappeReportConnection,
  type FrappeReportFixture,
  type UseFrappeReportOptions,
  type UseFrappeReportResult,
} from './report/useFrappeReport';

/** A column as the render helpers take it: normalized, or with the wire's string width. */
type RenderableReportColumn = Omit<FrappeReportColumn, 'fieldtype' | 'width'> & {
  fieldtype?: string;
  width?: number | string;
};

// Generic JSX (`<DataTable<FrappeReportRow> …/>`) breaks one-dev's source
// annotation transform; instantiate the type argument outside JSX instead.
const ReportDataTable = DataTable<FrappeReportRow>;

/** Parse a Select column/filter option string (newline-separated). */
function parseSelectOptions(options: string | undefined): { label: string; value: string }[] {
  return (options ?? '')
    .split('\n')
    .map((opt) => opt.trim())
    .filter((opt, idx, arr) => arr.indexOf(opt) === idx)
    .map((opt) => ({ label: opt, value: opt }));
}

/**
 * Map a report column fieldtype to a read-only DataTable `field` so the
 * forms `FieldDisplay` pipeline formats the value and DG-TBL-01
 * align-by-type defaults apply (numerics → right, Check → center).
 */
export function reportFieldtypeToTableField(column: RenderableReportColumn): {
  field: DataTableField;
  fieldProps?: Record<string, unknown>;
} {
  switch (column.fieldtype) {
    case 'Int': {
      return { field: 'stepper', fieldProps: { precision: 0 } };
    }
    case 'Float':
    case 'Currency':
    case 'Percent': {
      return { field: 'stepper', fieldProps: { precision: column.precision ?? 2 } };
    }
    case 'Check': {
      return { field: 'checkbox' };
    }
    case 'Date': {
      return { field: 'datepicker' };
    }
    case 'Datetime': {
      return { field: 'datetimepicker' };
    }
    case 'Time': {
      return { field: 'timepicker' };
    }
    case 'Duration': {
      return { field: 'duration' };
    }
    case 'Select': {
      const options = parseSelectOptions(column.options).filter((o) => o.value !== '');
      return { field: 'select', fieldProps: options.length ? { options } : undefined };
    }
    default: {
      // Data / Link / Dynamic Link / HTML / everything else: plain text.
      return { field: 'input' };
    }
  }
}

/**
 * Map a normalized report column to a DataTableColumn.
 *
 * The column carries a plain `field` (FieldDisplay via the table's
 * readOnly path) and pins its DG-TBL-01 alignment on the typed
 * `meta.align` channel (numerics right, Check centered, text left) so the
 * resolved alignment survives every downstream cell surface, custom
 * renderers included (DataTable's aligned cell wrapper reads it).
 */
export function reportColumnToDataTableColumn(column: RenderableReportColumn): DataTableColumn<FrappeReportRow> {
  const { field, fieldProps } = reportFieldtypeToTableField(column);
  const width = column.width == null ? undefined : Number(column.width);
  return {
    id: column.fieldname,
    accessorKey: column.fieldname,
    header: column.label,
    ...(width && Number.isFinite(width) ? { width } : {}),
    field,
    ...(fieldProps ? { fieldProps } : {}),
    meta: { align: getDefaultColumnAlign({ id: column.fieldname, field, fieldProps }) },
  };
}

/**
 * Accessible row identity for pressable report rows (DG-A11Y-06): report
 * rows carry no doctype meta, so identity is the conventional report
 * identity columns — the linked document `name`, else `title`. An empty
 * result defers to DataTable's own fallbacks (first visible cell value →
 * positional "Row N").
 */
export function reportRowLabel(row: FrappeReportRow): string {
  for (const key of ['name', 'title'] as const) {
    const value = row[key];
    if (typeof value === 'string' && value) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }
  return '';
}

/**
 * Download capability gate for the built-in export path (B12 precedent from
 * FrappeReportBuilder): `downloadBlob` rides a DOM anchor + object URL and
 * its native/GTK twins warn + no-op, so the Export control is hidden where
 * no file could actually be delivered. Presence checks, not `typeof window`
 * (Hermes defines `window` without DOM).
 */
function canDownloadFiles(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface ReportFilterFieldProps {
  def: QueryReportFilterMeta;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ReportFilterField({ def, value, onChange }: ReportFilterFieldProps) {
  const { t } = useTranslation();
  const label = def.label ?? def.fieldname;
  switch (def.fieldtype) {
    case 'Select': {
      const options = parseSelectOptions(def.options).map((opt) =>
        opt.value === '' ? { label: t('All'), value: '' } : opt,
      );
      return (
        <Select
          label={label}
          compact
          options={options}
          value={value == null ? '' : String(value)}
          onChange={onChange}
        />
      );
    }
    case 'Date':
    case 'Datetime': {
      return (
        <DatePicker
          label={label}
          compact
          value={value == null ? null : String(value)}
          onChange={(date) => {
            onChange(date ? formatCalendarDate(date) : '');
          }}
        />
      );
    }
    case 'Check': {
      return (
        <Check
          label={label}
          compact
          value={Boolean(value)}
          // Wire shape parity with desk: checkboxes travel as 1 / 0.
          onChange={(checked) => {
            onChange(checked ? 1 : 0);
          }}
        />
      );
    }
    default: {
      // Data / Link / Dynamic Link / Int / Float / …: free-text entry.
      return (
        <Data
          label={label}
          compact
          value={value == null ? '' : String(value)}
          onChange={onChange}
          placeholder={label}
        />
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FrappeReportViewProps extends Omit<YStackProps, 'children'> {
  /** Name of the Report document (e.g. "Database Storage Usage By Tables"). */
  reportName: string;
  /** Controlled filter values (pair with onFiltersChange). */
  filters?: FrappeReportValues;
  /** Initial filter values (uncontrolled mode). */
  defaultFilters?: FrappeReportValues;
  /** Fires with the full filter-value map on every filter change. */
  onFiltersChange?: (filters: FrappeReportValues) => void;
  /**
   * Filter bar definitions. Wins over the report's DB-defined filters —
   * required for standard reports, whose filters live in client JS that
   * only the desk evaluates.
   */
  filterFields?: FrappeReportFilterDef[];
  /**
   * Callback when a row is activated (row, index into the full row set).
   * Rides DataTable's first-class `onRowPress` contract: the whole row is
   * ONE pressable unit (no per-cell pressable wrappers), the row set
   * exposes a single roving tab stop (LC-49), Enter AND Space activate
   * the focused row (LC-50), and presses on inner interactive controls
   * never fire the row press.
   */
  onRowPress?: (row: FrappeReportRow, index: number) => void;
  /** Fixture payload or loader — renders without any network. */
  fixture?: FrappeReportFixture;
  /** Base URL for the Frappe server (uses FrappeProvider config if not set). */
  baseURL?: string;
  /** Authentication configuration (uses FrappeProvider config if not set). */
  auth?: FrappeReportConnection['auth'];
  /** Show the CSV/JSON export control (capability-gated; default true). */
  showExport?: boolean;
  /** Show the Refresh button (default true). */
  showRefresh?: boolean;
  /** Bypass the prepared-report cache and execute the report now. */
  ignorePreparedReport?: boolean;
  /** Debounce for filter-change refetches in ms (default 400). */
  debounceMs?: number;
  /** Custom loading indicator. */
  loading?: ReactNode;
  /** Custom error renderer. */
  error?: (error: Error) => ReactNode;
  /** Extra props threaded to the underlying DataTable. */
  tableProps?: Partial<DataTableProps<FrappeReportRow>>;
}

export function FrappeReportView({
  reportName,
  filters: controlledFilters,
  defaultFilters,
  onFiltersChange,
  filterFields,
  onRowPress,
  fixture,
  baseURL,
  auth,
  showExport = true,
  showRefresh = true,
  ignorePreparedReport = false,
  debounceMs,
  loading,
  error: errorRenderer,
  tableProps,
  ...stackProps
}: FrappeReportViewProps) {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const config = useFrappeConfig();

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  if (!finalBaseURL && !fixture) {
    throw new Error('FrappeReportView requires baseURL prop or FrappeProvider with baseURL');
  }

  const connection = useMemo(
    () => (finalBaseURL ? { baseURL: finalBaseURL, realtime: config?.realtime, auth: finalAuth } : undefined),
    [finalBaseURL, config?.realtime, finalAuth],
  );

  // Controlled + uncontrolled filter values (standard pattern).
  const isControlled = controlledFilters !== undefined;
  const [internalFilters, setInternalFilters] = useState<FrappeReportValues>(() => defaultFilters ?? {});
  const filterValues = isControlled ? controlledFilters : internalFilters;

  const setFilterValue = useCallback(
    (fieldname: string, value: unknown) => {
      const next = { ...(isControlled ? controlledFilters : internalFilters), [fieldname]: value };
      if (!isControlled) {
        setInternalFilters(next);
      }
      onFiltersChange?.(next);
    },
    [isControlled, controlledFilters, internalFilters, onFiltersChange],
  );

  const { payload, scriptFilters, isLoading, isFetching, error, refresh } = useFrappeReport(connection, {
    reportName,
    filters: filterValues,
    fixture,
    fetchFilterDefs: !filterFields,
    ignorePreparedReport,
    debounceMs,
  });

  // Filter bar definitions: explicit prop > fixture payload > get_script,
  // normalized through the one filter model (hidden filters apply their
  // defaults and never render, desk parity).
  const filterDefs = useMemo(
    () => normalizeFilterMeta(filterFields ?? payload?.filters ?? scriptFilters ?? []),
    [filterFields, payload?.filters, scriptFilters],
  );
  const shownFilterDefs = useMemo(() => filterDefs.filter((def) => def.hidden !== 1), [filterDefs]);

  // Seed DB-defined defaults once per report (uncontrolled mode only —
  // controlled callers own their values).
  const seededReportRef = useRef<string | undefined>();
  useEffect(() => {
    if (isControlled || seededReportRef.current === reportName || !filterDefs.length) {
      return;
    }
    seededReportRef.current = reportName;
    setInternalFilters((prev) => {
      const seeded: FrappeReportValues = {};
      for (const def of filterDefs) {
        if (def.default !== undefined && def.default !== '' && prev[def.fieldname] == null) {
          seeded[def.fieldname] = def.default;
        }
      }
      return Object.keys(seeded).length ? { ...seeded, ...prev } : prev;
    });
  }, [isControlled, reportName, filterDefs]);

  const rows = payload?.rows ?? [];

  const columns = useMemo(
    () => (payload?.columns ?? []).map((col) => reportColumnToDataTableColumn(col)),
    [payload?.columns],
  );

  const exportColumns = useMemo(
    () =>
      (payload?.columns ?? []).map((col) => ({
        accessorKey: col.fieldname,
        header: col.label,
      })),
    [payload?.columns],
  );

  const exportEnabled = showExport && canDownloadFiles();
  const refused = error !== undefined && isPermissionError(error);
  const refreshShown = showRefresh && !refused;
  const hasToolbar = shownFilterDefs.length > 0 || refreshShown || exportEnabled;

  if (error && errorRenderer) {
    return <>{errorRenderer(error)}</>;
  }

  const normalizedError =
    error && !refused
      ? toLiveLoadError(error, {
          permissionMessage: t('You do not have permission to run {{reportName}}', { reportName }),
          genericMessage: t('Error running {{reportName}}', { reportName }),
        })
      : null;

  // Honest states via AsyncBoundary (DG-ST-01: error > loading > empty).
  const boundaryState = refused
    ? null
    : normalizedError
      ? { error: normalizedError }
      : isLoading
        ? { loading: loading ?? true }
        : rows.length === 0
          ? { empty: true }
          : null;

  return (
    <YStack
      {...knobProps.gap}
      flex={1}
      {...stackProps}>
      {/* Filter bar + actions — stays mounted across empty/error states so a
          bad filter can always be corrected. */}
      {hasToolbar && (
        <XStack
          {...knobProps.gap}
          alignItems="flex-end"
          flexWrap="wrap">
          {shownFilterDefs.map((def) => (
            <YStack
              key={def.fieldname}
              minWidth={180}
              maxWidth={280}
              flexShrink={1}>
              <ReportFilterField
                def={def}
                value={filterValues[def.fieldname]}
                onChange={(value) => {
                  setFilterValue(def.fieldname, value);
                }}
              />
            </YStack>
          ))}
          <XStack flex={1} />
          {isFetching && !isLoading && (
            <XStack
              gap="$2"
              alignItems="center"
              paddingBottom="$2">
              <Spinner
                size="small"
                aria-label={t('Updating')}
              />
              <Text
                {...knobProps.label}
                color={formCommonColors.muted}>
                {t('Updating...')}
              </Text>
            </XStack>
          )}
          {refreshShown && (
            <Button
              size="$2"
              icon={ArrowClockwiseIcon}
              onPress={refresh}
              aria-label={t('Refresh report')}>
              {t('Refresh')}
            </Button>
          )}
          {exportEnabled && rows.length > 0 && (
            <DataTableExport
              data={rows}
              columns={exportColumns}
              filename={scrubFieldname(reportName)}
              exportFormats={[
                {
                  id: 'csv',
                  label: t('CSV'),
                  icon: null,
                  extension: 'csv',
                  mimeType: 'text/csv',
                  description: t('Comma-separated values'),
                  enabled: true,
                },
                {
                  id: 'json',
                  label: t('JSON'),
                  icon: null,
                  extension: 'json',
                  mimeType: 'application/json',
                  description: t('JavaScript object notation'),
                  enabled: true,
                },
              ]}
            />
          )}
        </XStack>
      )}

      {/* Server-side report message (already user-facing). */}
      {payload?.message && (
        <Text
          {...knobProps.label}
          color={formCommonColors.muted}>
          {payload.message}
        </Text>
      )}

      {refused ? (
        <EmptyState
          testID="frappe-report-not-permitted"
          title={t("You can't run {{reportName}}", { reportName })}
          description={refusalReason(humanizeFrappeError(error))}
        />
      ) : boundaryState ? (
        <AsyncBoundary
          layout="table"
          errorTitle={t('Error running {{reportName}}', { reportName })}
          emptyTitle={t('No results for {{reportName}}', { reportName })}
          onRetry={refresh}
          {...boundaryState}
        />
      ) : (
        <ReportDataTable
          data={rows}
          columns={columns}
          readOnly
          // onRowPress (the stable FrappeReportView prop) rides DataTable's
          // first-class row activation: whole-row press target, roving tab
          // stop (LC-49), Enter/Space activation (LC-50), inner interactive
          // controls win. The forwarded index keeps its full-row-set
          // meaning (DataTable reports page-local indexes). rowLabel names
          // each pressable row by report identity. Both spread BEFORE
          // {...tableProps} so an explicit consumer onRowPress/rowLabel
          // still ejects (consumer-last house rule).
          {...(onRowPress
            ? {
                onRowPress: (row: FrappeReportRow) => {
                  onRowPress(row, rows.indexOf(row));
                },
              }
            : {})}
          rowLabel={reportRowLabel}
          {...tableProps}
        />
      )}
    </YStack>
  );
}

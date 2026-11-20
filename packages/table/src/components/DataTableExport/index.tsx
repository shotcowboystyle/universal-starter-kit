import { FileJsIcon, FileXlsIcon, FileTextIcon, PrinterIcon, GearIcon } from '@phosphor-icons/react';
import { Button, Checkbox, FloatingPanel, Input } from '@repo/forms';
import { downloadBlob } from '@repo/platform';
import { formatCalendarDate, useResolvedKnobs } from '@repo/theme';
import { ScrollView } from '@repo/ui';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Separator, Text, XStack, YStack, isWeb } from 'tamagui';

import type { DataTableField } from '../../types';
import { iconSizeForToken } from '../../utils/chrome-icons';
import { getViewLeafRows } from '../../utils/view-data';
import { useDataTableState } from '../DataTable/data-table-state-context';

export type ExportFormatId = 'csv' | 'excel' | 'pdf' | 'json';

export interface ExportOptions {
  format: ExportFormatId;
  includeHeaders: boolean;
  filename: string;
  selectedColumns?: string[];
  customColumns?: {
    key: string;
    header: string;
    // oxlint-disable-next-line typescript/no-explicit-any -- public API: the row is the caller's untyped T and ExportOptions is not generic; `unknown` would reject typed accessors
    accessor?: (row: any) => any;
  }[];
  dateFormat?: string;
  numberFormat?: string;
}

export interface ExportFormat {
  id: string;
  label: string;
  icon: ReactNode;
  extension: string;
  mimeType: string;
  description: string;
  enabled: boolean;
}

/**
 * Column metadata the export needs. Structurally a subset of
 * `DataTableColumn`, so table column defs pass straight through.
 */
export interface ExportColumn {
  accessorKey?: string;
  header?: string;
  id?: string;
  cell?: (info: never) => ReactNode;
  /**
   * The column's editor type. Only read to tell a calendar day apart from an
   * instant when serializing `Date` values — see `toExportValue`.
   */
  field?: DataTableField;
}

export interface DataTableExportProps<T = unknown> {
  data?: T[];
  columns?: ExportColumn[];
  filename?: string;
  exportFormats?: ExportFormat[];
  onExport?: (options: ExportOptions) => Promise<void>;
  disabled?: boolean;
}

const columnKey = (col: ExportColumn): string => col.accessorKey ?? col.id ?? '';

// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- rows are the caller's generic T and cells arbitrary data; this accessor is where a row is read by column key
const readCell = (row: unknown, key: string): unknown =>
  // SAFETY: rows are the table's data records (objects keyed by accessorKey); a
  // non-object row throws on property access exactly as it always did.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- rows are caller-typed records with no parse boundary here
  (row as Record<string, unknown>)[key];

/**
 * Editor types whose value is a calendar DAY rather than an instant. A
 * `datepicker` hands back `new Date(y, m, d)` — local midnight standing in for
 * a day with no time in it — so the export writes the day and nothing else.
 * Every other date editor (`datetimepicker`) means a real timestamp.
 */
const CALENDAR_DAY_FIELDS: ReadonlySet<DataTableField> = new Set<DataTableField>([
  'datepicker',
  'daterangepicker',
  'multidatepicker',
]);

const isCalendarDayColumn = (column?: ExportColumn): boolean =>
  column?.field != null && CALENDAR_DAY_FIELDS.has(column.field);

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Render a `Date` onto the LOCAL calendar, which is the calendar the grid
 * shows: every date cell displays through `formatAbsoluteDate`, and that
 * formats a `Date` in local time. `toISOString()` renders the UTC instant
 * instead, so east of Greenwich the exported date part named the day BEFORE
 * the one in the cell the user was looking at (and west of it, the day after).
 *
 * A calendar-day column emits the bare day. An instant keeps full ISO-8601 —
 * still lossless and still `Date.parse`-able — but stamped with the local
 * offset rather than `Z`, so the same instant now leads with the displayed
 * day. At UTC the two renderings are byte-identical, which is why this only
 * ever looked correct.
 */
const serializeExportDate = (value: Date, calendarDay: boolean): string => {
  if (Number.isNaN(value.getTime())) {
    return '';
  }
  if (calendarDay) {
    return formatCalendarDate(value, 'date');
  }
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const offset = offsetMinutes === 0 ? 'Z' : `${sign}${pad2(Math.trunc(abs / 60))}:${pad2(abs % 60)}`;
  const ms = String(value.getMilliseconds()).padStart(3, '0');
  return `${formatCalendarDate(value, 'datetime').replace(' ', 'T')}.${ms}${offset}`;
};

/**
 * Replace every `Date` reachable inside an array or plain object (a picked
 * `{start,end}` range, a multi-date array) before it reaches JSON.
 * `JSON.stringify` calls `Date.prototype.toJSON`, which is `toISOString()` —
 * the same UTC day-shift, one level down.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- serializer over arbitrary cell data; it maps any value to the same shape with Dates rendered
const withExportDates = (value: unknown, calendarDay: boolean): unknown => {
  if (value instanceof Date) {
    return serializeExportDate(value, calendarDay);
  }
  if (Array.isArray(value)) {
    return value.map((item) => withExportDates(item, calendarDay));
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- cell values are arbitrary row data; this serializer is the boundary that inspects them
  if (value != null && typeof value === 'object') {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withExportDates(item, calendarDay)]));
  }
  return value;
};

/**
 * Serialize a raw cell value for export. Nullish → empty string, but falsy
 * values like 0 and false survive (String(value || "") used to blank them).
 * Dates render on the calendar the cell displays and plain objects become
 * JSON so nothing ever exports as "[object Object]".
 *
 * Values already held as strings are copied verbatim — the export never
 * reinterprets source text. It only picks a rendering where the row leaves it
 * no choice, which is when the value is a `Date`.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- serialization boundary for arbitrary cell data
const toExportValue = (value: unknown, column?: ExportColumn): string => {
  if (value == null) {
    return '';
  }
  const calendarDay = isCalendarDayColumn(column);
  if (value instanceof Date) {
    return serializeExportDate(value, calendarDay);
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- cell values are arbitrary row data; this serializer is the boundary that inspects them
  if (typeof value === 'object') {
    try {
      return JSON.stringify(withExportDates(value, calendarDay));
    } catch {
      // oxlint-disable-next-line typescript/no-base-to-string -- deliberate last-resort rendering of a value JSON could not serialize
      return String(value);
    }
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- objects returned above; only primitives (and functions) reach here
  return String(value);
};

const CSV_SPECIAL_CHARS = /[",\n\r]/u;
const CSV_FORMULA_PREFIX = /^[=+\-@\t]/u;

/** Quote a CSV field when it contains a delimiter, quote, or line break. */
const escapeCsvField = (value: string): string =>
  CSV_SPECIAL_CHARS.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/**
 * CSV/formula-injection guard (OWASP): string cells beginning with =, +, -, @
 * or tab get a leading apostrophe so spreadsheet apps treat them as text
 * instead of evaluating them. Only raw string values are guarded — genuine
 * numbers (e.g. -42) keep their sign and export unchanged.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- inspects the raw cell (arbitrary data) only to tell strings from other values
const guardCsvInjection = (raw: unknown, value: string): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the guard applies only to raw string cells of arbitrary row data
  if (typeof raw === 'string' && CSV_FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
};

// Web-only download. Native has no Blob-URL download path (MPO-22);
// throw so the inline alert fires instead of a silent console.warn no-op.
const assertWebFileDownload = (): void => {
  if (
    !isWeb ||
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- host API feature detection, not data parsing
    typeof URL.createObjectURL !== 'function'
  ) {
    throw new Error('File download is not available on this platform. Provide an onExport handler.');
  }
};

const downloadFile = (content: string, filename: string, mimeType: string): void => {
  assertWebFileDownload();
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
};

// CSV Export
const exportAsCSV = async (
  data: readonly unknown[],
  columns: ExportColumn[],
  options: ExportOptions,
): Promise<void> => {
  const { includeHeaders, filename } = options;

  let csvContent = '';

  // Headers (escaped like data fields — a comma in a header must not split it)
  if (includeHeaders) {
    const headers = columns.map((col) => escapeCsvField(col.header ?? col.accessorKey ?? '')).join(',');
    csvContent += `${headers}\n`;
  }

  // Data rows
  for (const row of data) {
    const values = columns.map((col) => {
      // Export the raw accessor value. Cell renderers return JSX (which
      // stringifies to "[object Object]") and bake presentation into the data,
      // so they are intentionally NOT invoked here.
      const raw = readCell(row, columnKey(col));
      return escapeCsvField(guardCsvInjection(raw, toExportValue(raw, col)));
    });
    csvContent += `${values.join(',')}\n`;
  }

  downloadFile(csvContent, `${filename}.csv`, 'text/csv');
};

// JSON Export
const exportAsJSON = async (
  data: readonly unknown[],
  columns: ExportColumn[],
  options: ExportOptions,
): Promise<void> => {
  const { filename } = options;

  const jsonData = data.map((row) =>
    Object.fromEntries(
      columns.map((col) => {
        const key = columnKey(col);
        // Non-date values stay native JSON types (numbers are numbers); only
        // Dates are rendered, because JSON.stringify would otherwise reach
        // Date.prototype.toJSON and emit the UTC day.
        return [key, withExportDates(readCell(row, key), isCalendarDayColumn(col))];
      }),
    ),
  );

  const jsonContent = JSON.stringify(jsonData, null, 2);
  downloadFile(jsonContent, `${filename}.json`, 'application/json');
};

// Excel Export — built-in implementation requires a library like `xlsx` or
// `exceljs` which we don't ship by default to keep the table package light.
// Apps that need .xlsx output should provide their own `onExport` handler:
//
//   <DataTable.Export
//     onExport={(format, data, columns) => {
//       if (format === "excel") {
//         const wb = XLSX.utils.book_new();
//         const ws = XLSX.utils.json_to_sheet(data);
//         XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
//         XLSX.writeFile(wb, `${filename}.xlsx`);
//         return true; // mark handled
//       }
//     }}
//   />
const exportAsExcel = async (
  _data: readonly unknown[],
  _columns: ExportColumn[],
  _options: ExportOptions,
): Promise<void> => {
  throw new Error(
    'Excel export not built in. Install `xlsx` (or `exceljs`) and provide a custom `onExport` handler — see DataTableExport source for an example.',
  );
};

// PDF Export — same story: requires `jsPDF` (or server-side rendering) which
// we don't ship. The included `print` action opens the browser print dialog
// with a styled HTML table; that's the closest no-dependency equivalent and
// users can "Save as PDF" from there.
const exportAsPDF = async (
  _data: readonly unknown[],
  _columns: ExportColumn[],
  _options: ExportOptions,
): Promise<void> => {
  throw new Error(
    'PDF export not built in. Install `jspdf` and provide a custom `onExport` handler, or use the `print` format which opens the browser print dialog (Save as PDF).',
  );
};

// Default Export Implementation

const defaultExport = async (
  data: readonly unknown[],
  columns: ExportColumn[],
  options: ExportOptions,
): Promise<void> => {
  const { format, selectedColumns } = options;

  // Filter columns if specified
  const selectedSet = selectedColumns ? new Set(selectedColumns) : undefined;
  const exportColumns = selectedSet ? columns.filter((col) => selectedSet.has(columnKey(col))) : columns;

  switch (format) {
    case 'csv': {
      await exportAsCSV(data, exportColumns, options);
      return;
    }
    case 'json': {
      await exportAsJSON(data, exportColumns, options);
      return;
    }
    case 'excel': {
      await exportAsExcel(data, exportColumns, options);
      return;
    }
    case 'pdf': {
      await exportAsPDF(data, exportColumns, options);
      return;
    }
    default: {
      throw new Error(`Unsupported export format: ${String(format)}`);
    }
  }
};

// Print functionality. Built with DOM nodes + textContent (never HTML string
// interpolation) so cell values containing markup cannot inject into the
// print document (XSS via `<img onerror>`-style data).
const printTable = async (data: readonly unknown[], columns: ExportColumn[]): Promise<void> => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- host API feature detection, not data parsing
  if (!isWeb || typeof window.open !== 'function') {
    throw new Error('Print is not available on this platform.');
  }
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Print window was blocked. Allow popups for this site and try again.');
  }

  const doc = printWindow.document;
  doc.title = 'Table Export';

  const style = doc.createElement('style');
  style.textContent = `
    /* Explicit print theme (Part 3 DataTableExport): scheme-safe paper palette,
       not page chrome. Headers use the 400/700 weight ladder — never 500/600. */
    body { color: CanvasText; background: Canvas; font-family: system-ui, sans-serif; margin: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid CanvasText; padding: 8px; text-align: left; }
    th { font-weight: 700; }
    @media print {
      body { color: #111; background: #fff; margin: 0; }
      th, td { border-color: #111; }
    }
  `;
  doc.head.append(style);

  const heading = doc.createElement('h1');
  heading.textContent = 'Data Export';
  doc.body.append(heading);

  const tableEl = doc.createElement('table');
  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  for (const col of columns) {
    const th = doc.createElement('th');
    th.textContent = col.header ?? col.accessorKey ?? '';
    headRow.append(th);
  }
  thead.append(headRow);
  tableEl.append(thead);

  const tbody = doc.createElement('tbody');
  for (const row of data) {
    const tr = doc.createElement('tr');
    for (const col of columns) {
      const td = doc.createElement('td');
      // Same raw-value derivation as the CSV export — cell renderers return
      // JSX and must not reach the document.
      td.textContent = toExportValue(readCell(row, columnKey(col)), col);
      tr.append(td);
    }
    tbody.append(tr);
  }
  tableEl.append(tbody);
  doc.body.append(tableEl);

  printWindow.print();
};

interface ExportSourceTable {
  getVisibleLeafColumns: () => readonly { id: string; columnDef: { header?: unknown; field?: DataTableField } }[];
}

// Extract column metadata from TanStack Table instance for context fallback.
// Visible leaf columns only, in display order — hidden columns are excluded
// from the export and column reordering/pinning is honored.
const extractColumnsFromTable = (table: ExportSourceTable): ExportColumn[] => {
  try {
    return table.getVisibleLeafColumns().map((col) => {
      const def = col.columnDef;
      return {
        id: col.id,
        accessorKey: col.id,
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- TanStack headers are a string or a render function; only a string is exportable text
        header: typeof def.header === 'string' ? def.header : col.id,
        // Carried so date columns export the calendar day the cell renders.
        field: def.field,
      };
    });
  } catch {
    return [];
  }
};

const defaultExportFormats = (iconPx: number): ExportFormat[] => [
  {
    id: 'csv',
    label: 'CSV',
    icon: <FileTextIcon size={iconPx} />,
    extension: 'csv',
    mimeType: 'text/csv',
    description: 'Comma-separated values',
    enabled: true,
  },
  {
    id: 'excel',
    label: 'Excel',
    icon: <FileXlsIcon size={iconPx} />,
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    description: 'Microsoft Excel format',
    enabled: true,
  },
  {
    id: 'pdf',
    label: 'PDF',
    icon: <FileTextIcon size={iconPx} />,
    extension: 'pdf',
    mimeType: 'application/pdf',
    description: 'Portable document format',
    enabled: true,
  },
  {
    id: 'json',
    label: 'JSON',
    icon: <FileJsIcon size={iconPx} />,
    extension: 'json',
    mimeType: 'application/json',
    description: 'JavaScript object notation',
    enabled: true,
  },
];

const popoverMinWidthFor = (sizeToken: string): number => {
  if (sizeToken === '$3') {
    return 240;
  }
  if (sizeToken === '$5') {
    return 360;
  }
  return 300;
};

// Export Options Panel

interface ExportOptionsPanelProps {
  exportFormats: ExportFormat[];
  exportOptions: Partial<ExportOptions>;
  onOptionsChange: (options: Partial<ExportOptions>) => void;
  onExport: (format: ExportFormat) => void;
  onPrint: () => void;
  disabled: boolean;
  isExporting: string | null;
  columns: ExportColumn[];
}

const ExportOptionsPanel = ({
  exportFormats,
  exportOptions,
  onOptionsChange,
  onExport,
  onPrint,
  disabled,
  isExporting,
  columns,
}: ExportOptionsPanelProps) => {
  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(knobProps.sizeToken);
  const popoverMinWidth = popoverMinWidthFor(knobProps.sizeToken);
  const [open, setOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(columns.map(columnKey)));

  const availableColumns = columns.map((col) => ({
    key: columnKey(col),
    header: col.header ?? col.accessorKey ?? col.id ?? '',
  }));

  const trigger = (
    <Button
      size={knobProps.sizeToken}
      chromeless
      icon={<GearIcon size={iconPx} />}
      disabled={disabled}
      aria-label="Export options">
      Options
    </Button>
  );

  return (
    // LC-06/LC-10: the option list is taller than most viewports. FloatingPanel
    // clamps it inside the viewport and scrolls, so the Export Formats and
    // Print rows below the fold stay reachable.
    <FloatingPanel
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      triggerSizing="content"
      disabled={disabled}
      scrollable>
      <YStack
        gap="$4"
        minWidth={popoverMinWidth}
        data-dismiss-class="compose">
        <Text
          {...knobProps.label}
          fontWeight="400">
          Export Options
        </Text>

        {/* Filename */}
        <YStack gap="$2">
          <Text
            {...knobProps.label}
            fontWeight="400">
            Filename
          </Text>
          <Input
            value={exportOptions.filename ?? ''}
            onChangeText={(text) => {
              onOptionsChange({
                ...exportOptions,
                filename: text,
              });
            }}
            placeholder="Enter filename"
          />
        </YStack>

        {/* Include Headers */}
        <Checkbox
          label="Include headers"
          checked={exportOptions.includeHeaders ?? true}
          onChange={(checked) => {
            onOptionsChange({
              ...exportOptions,
              includeHeaders: checked !== false,
            });
          }}
        />

        {/* Column Selection */}
        <YStack gap="$2">
          <Text
            {...knobProps.label}
            fontWeight="400">
            Select Columns ({selectedColumns.size} of {availableColumns.length})
          </Text>
          <ScrollView maxHeight={200}>
            <YStack gap="$1">
              {availableColumns.map((col) => (
                <Checkbox
                  key={col.key}
                  label={col.header}
                  checked={selectedColumns.has(col.key)}
                  onChange={(checked) => {
                    const newSelected = new Set(selectedColumns);
                    if (checked === false) {
                      newSelected.delete(col.key);
                    } else {
                      newSelected.add(col.key);
                    }
                    setSelectedColumns(newSelected);
                    onOptionsChange({
                      ...exportOptions,
                      selectedColumns: [...newSelected],
                    });
                  }}
                />
              ))}
            </YStack>
          </ScrollView>
        </YStack>

        <Separator />

        {/* Export Formats */}
        <YStack gap="$2">
          <Text
            {...knobProps.label}
            fontWeight="400">
            Export Formats
          </Text>
          {exportFormats.map((format) => (
            <Button
              key={format.id}
              size={knobProps.sizeToken}
              chromeless
              justifyContent="flex-start"
              disabled={disabled || isExporting === format.id || !format.enabled}
              onPress={() => {
                onExport(format);
              }}
              icon={format.icon}>
              <YStack gap="$1">
                <Text
                  {...knobProps.label}
                  fontWeight="400">
                  {format.label}
                </Text>
                <Text
                  fontSize="$2"
                  color="$color10">
                  {format.description}
                </Text>
              </YStack>
              {isExporting === format.id && (
                <XStack
                  flexGrow={1}
                  justifyContent="flex-end">
                  <Text
                    fontSize="$2"
                    color="$accentColor">
                    ...
                  </Text>
                </XStack>
              )}
            </Button>
          ))}
        </YStack>

        <Separator />

        {/* Print */}
        <Button
          size={knobProps.sizeToken}
          chromeless
          justifyContent="flex-start"
          disabled={disabled || isExporting === 'print'}
          onPress={onPrint}
          icon={<PrinterIcon size={iconPx} />}>
          Print Table
          {isExporting === 'print' && (
            <XStack
              flexGrow={1}
              justifyContent="flex-end">
              <Text
                fontSize="$2"
                color="$accentColor">
                ...
              </Text>
            </XStack>
          )}
        </Button>
      </YStack>
    </FloatingPanel>
  );
};

export const DataTableExport = <T = unknown,>(props: DataTableExportProps<T>) => {
  // Try to consume from DataTableStateContext (compound component pattern)
  const ctx = useDataTableState<T>();

  // Resolve values: explicit props override context values.
  // Context data is the CURRENT VIEW: filtered + sorted rows (the raw
  // computed.filteredData is the pre-sort model, which exported rows in
  // insertion order regardless of the visible sort).
  const data = props.data ?? (ctx ? getViewLeafRows<T>(ctx.table) : []);
  const columns = props.columns ?? (ctx ? extractColumnsFromTable(ctx.table) : []);

  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(knobProps.sizeToken);

  const { filename = 'export', onExport, disabled = false } = props;
  const exportFormats = props.exportFormats ?? defaultExportFormats(iconPx);

  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportOptions, setExportOptions] = useState<Partial<ExportOptions>>({
    includeHeaders: true,
    filename,
  });

  const isBusy = isExporting !== null && isExporting !== '';

  const handleExport = async (format: ExportFormat) => {
    if (disabled || isBusy) {
      return;
    }

    setIsExporting(format.id);
    setExportError(null);

    try {
      const options: ExportOptions = {
        // SAFETY: format ids are the ExportFormatId values; custom ids fall
        // through to defaultExport's "Unsupported export format" error.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ExportFormat.id stays `string` so callers can declare custom formats
        format: format.id as ExportFormatId,
        includeHeaders: exportOptions.includeHeaders ?? true,
        filename: exportOptions.filename ?? filename,
        selectedColumns: exportOptions.selectedColumns,
        customColumns: exportOptions.customColumns,
        dateFormat: exportOptions.dateFormat,
        numberFormat: exportOptions.numberFormat,
      };

      // Default export implementation
      await (onExport ? onExport(options) : defaultExport(data, columns, options));
    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error instanceof Error ? error.message : String(error));
    }
    setIsExporting(null);
  };

  const handlePrint = async () => {
    if (disabled || isBusy) {
      return;
    }

    setIsExporting('print');
    setExportError(null);
    try {
      // Honor the same column selection the file exports use.
      const selected = exportOptions.selectedColumns;
      const selectedSet = selected ? new Set(selected) : undefined;
      const printColumns = selectedSet ? columns.filter((col) => selectedSet.has(columnKey(col))) : columns;
      await printTable(data, printColumns);
    } catch (error) {
      console.error('Print failed:', error);
      setExportError(error instanceof Error ? error.message : String(error));
    }
    setIsExporting(null);
  };

  const startExport = (format: ExportFormat) => {
    void handleExport(format);
  };

  const startPrint = () => {
    void handlePrint();
  };

  return (
    <XStack
      gap="$2"
      alignItems="center"
      flexWrap="wrap">
      {/* Quick Export Buttons */}
      {exportFormats
        .filter((format) => format.enabled)
        .slice(0, 3)
        .map((format) => (
          <Button
            key={format.id}
            size={knobProps.sizeToken}
            chromeless
            icon={format.icon}
            disabled={disabled || isExporting === format.id}
            onPress={() => {
              startExport(format);
            }}
            aria-label={`Export as ${format.label}`}>
            {isExporting === format.id ? '...' : format.label}
          </Button>
        ))}

      {/* Print Button */}
      <Button
        size={knobProps.sizeToken}
        chromeless
        icon={<PrinterIcon size={iconPx} />}
        disabled={disabled || isExporting === 'print'}
        onPress={startPrint}
        aria-label="Print table">
        {isExporting === 'print' ? '...' : 'Print'}
      </Button>

      {/* Advanced Export Options */}
      <ExportOptionsPanel
        exportFormats={exportFormats}
        exportOptions={exportOptions}
        onOptionsChange={setExportOptions}
        onExport={startExport}
        onPrint={startPrint}
        disabled={disabled}
        isExporting={isExporting}
        columns={columns}
      />

      {/* Export/print failures were previously swallowed into console.error;
          surface them inline like form field errors (role=alert). */}
      {exportError != null && (
        <Text
          role="alert"
          aria-live="polite"
          fontSize="$3"
          color="$red11">
          {exportError}
        </Text>
      )}
    </XStack>
  );
};

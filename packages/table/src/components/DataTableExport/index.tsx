import {
  FileJsIcon,
  FileXlsIcon,
  FileTextIcon,
  PrinterIcon,
  GearIcon,
} from "@phosphor-icons/react";
import { downloadBlob } from "@repo/platform";
import { formatCalendarDate, useResolvedKnobs } from "@repo/theme";
import { useState } from "react";
import { Button, Checkbox, FloatingPanel, Input } from "@repo/forms";
import { Separator, Text, XStack, YStack, isWeb } from "tamagui";
import { ScrollView } from "@repo/ui";
import type { DataTableField } from "../../types";
import { iconSizeForToken } from "../../utils/chromeIcons";
import { getViewLeafRows } from "../../utils/viewData";
import { useDataTableState } from "../DataTable/DataTableStateContext";

export interface ExportOptions {
  format: "csv" | "excel" | "pdf" | "json";
  includeHeaders: boolean;
  filename: string;
  selectedColumns?: string[];
  customColumns?: {
    key: string;
    header: string;
    accessor?: (row: any) => any;
  }[];
  dateFormat?: string;
  numberFormat?: string;
}

export interface ExportFormat {
  id: string;
  label: string;
  icon: any;
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
  cell?: (info: any) => any;
  /**
   * The column's editor type. Only read to tell a calendar day apart from an
   * instant when serializing `Date` values — see `toExportValue`.
   */
  field?: DataTableField;
}

export interface DataTableExportProps<T = any> {
  data?: T[];
  columns?: ExportColumn[];
  filename?: string;
  exportFormats?: ExportFormat[];
  onExport?: (options: ExportOptions) => Promise<void>;
  disabled?: boolean;
}

export function DataTableExport<T = any>(props: DataTableExportProps<T>) {
  // Try to consume from DataTableStateContext (compound component pattern)
  const ctx = useDataTableState();

  // Resolve values: explicit props override context values.
  // Context data is the CURRENT VIEW: filtered + sorted rows (the raw
  // computed.filteredData is the pre-sort model, which exported rows in
  // insertion order regardless of the visible sort).
  const data = props.data ?? (ctx ? getViewLeafRows<T>(ctx.table) : []);
  const columns = props.columns ?? (ctx ? extractColumnsFromTable(ctx.table) : []);

  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(String(knobProps.sizeToken));

  const {
    filename = "export",
    exportFormats = [
      {
        id: "csv",
        label: "CSV",
        icon: <FileTextIcon size={iconPx} />,
        extension: "csv",
        mimeType: "text/csv",
        description: "Comma-separated values",
        enabled: true,
      },
      {
        id: "excel",
        label: "Excel",
        icon: <FileXlsIcon size={iconPx} />,
        extension: "xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        description: "Microsoft Excel format",
        enabled: true,
      },
      {
        id: "pdf",
        label: "PDF",
        icon: <FileTextIcon size={iconPx} />,
        extension: "pdf",
        mimeType: "application/pdf",
        description: "Portable document format",
        enabled: true,
      },
      {
        id: "json",
        label: "JSON",
        icon: <FileJsIcon size={iconPx} />,
        extension: "json",
        mimeType: "application/json",
        description: "JavaScript object notation",
        enabled: true,
      },
    ],
    onExport,
    disabled = false,
  } = props;

  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportOptions, setExportOptions] = useState<Partial<ExportOptions>>({
    includeHeaders: true,
    filename,
  });

  const handleExport = async (format: ExportFormat) => {
    if (disabled || isExporting) {return;}

    setIsExporting(format.id);
    setExportError(null);

    try {
      const options: ExportOptions = {
        format: format.id as any,
        includeHeaders: exportOptions.includeHeaders ?? true,
        filename: exportOptions.filename ?? filename,
        selectedColumns: exportOptions.selectedColumns,
        customColumns: exportOptions.customColumns,
        dateFormat: exportOptions.dateFormat,
        numberFormat: exportOptions.numberFormat,
      };

      if (onExport) {
        await onExport(options);
      } else {
        // Default export implementation
        await defaultExport(data, columns, options);
      }
    } catch (error) {
      console.error("Export failed:", error);
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(null);
    }
  };

  const handlePrint = async () => {
    if (disabled || isExporting) {return;}

    setIsExporting("print");
    setExportError(null);
    try {
      // Honor the same column selection the file exports use.
      const selected = exportOptions.selectedColumns;
      const printColumns = selected
        ? columns.filter((col) => selected.includes((col.accessorKey ?? col.id) ?? ""))
        : columns;
      await printTable(data, printColumns);
    } catch (error) {
      console.error("Print failed:", error);
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <XStack gap="$2" alignItems="center" flexWrap="wrap">
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
            onPress={ async () => handleExport(format)}
            aria-label={`Export as ${format.label}`}
          >
            {isExporting === format.id ? "..." : format.label}
          </Button>
        ))}

      {/* Print Button */}
      <Button
        size={knobProps.sizeToken}
        chromeless
        icon={<PrinterIcon size={iconPx} />}
        disabled={disabled || isExporting === "print"}
        onPress={handlePrint}
        aria-label="Print table"
      >
        {isExporting === "print" ? "..." : "Print"}
      </Button>

      {/* Advanced Export Options */}
      <ExportOptionsPanel
        exportFormats={exportFormats}
        exportOptions={exportOptions}
        onOptionsChange={setExportOptions}
        onExport={handleExport}
        onPrint={handlePrint}
        disabled={disabled}
        isExporting={isExporting}
        columns={columns}
      />

      {/* Export/print failures were previously swallowed into console.error;
          surface them inline like form field errors (role=alert). */}
      {exportError != null && (
        <Text role="alert" aria-live="polite" fontSize="$3" color="$red11">
          {exportError}
        </Text>
      )}
    </XStack>
  );
}

// Extract column metadata from TanStack Table instance for context fallback.
// Visible leaf columns only, in display order — hidden columns are excluded
// from the export and column reordering/pinning is honored.
function extractColumnsFromTable(table: any): ExportColumn[] {
  try {
    return table.getVisibleLeafColumns().map((col: any) => ({
      id: col.id,
      accessorKey: col.id,
      header: typeof col.columnDef.header === "string" ? col.columnDef.header : col.id,
      // Carried so date columns export the calendar day the cell renders.
      field: col.columnDef.field,
    }));
  } catch {
    return [];
  }
}

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

function ExportOptionsPanel({
  exportFormats,
  exportOptions,
  onOptionsChange,
  onExport,
  onPrint,
  disabled,
  isExporting,
  columns,
}: ExportOptionsPanelProps) {
  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(String(knobProps.sizeToken));
  const sz = knobProps.sizeToken;
  const popoverMinWidth = sz === "$3" ? 240 : sz === "$5" ? 360 : 300;
  const [open, setOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(columns.map((col) => (col.accessorKey ?? col.id) ?? "")),
  );

  const availableColumns = columns.map((col) => ({
    key: (col.accessorKey ?? col.id) ?? "",
    header: (col.header ?? col.accessorKey) || col.id ?? "",
  }));

  const trigger = (
    <Button
      size={knobProps.sizeToken}
      chromeless
      icon={<GearIcon size={iconPx} />}
      disabled={disabled}
      aria-label="Export options"
    >
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
      scrollable
    >
      <YStack gap="$4" minWidth={popoverMinWidth} data-dismiss-class="compose">
        <Text {...knobProps.label} fontWeight="400">
          Export Options
        </Text>

        {/* Filename */}
        <YStack gap="$2">
          <Text {...knobProps.label} fontWeight="400">
            Filename
          </Text>
          <Input
            value={exportOptions.filename ?? ""}
            onChangeText={(text) =>{ 
              onOptionsChange({
                ...exportOptions,
                filename: text,
              }); }
            }
            placeholder="Enter filename"
          />
        </YStack>

        {/* Include Headers */}
        <Checkbox
          label="Include headers"
          checked={exportOptions.includeHeaders ?? true}
          onCheckedChange={(checked) =>{ 
            onOptionsChange({
              ...exportOptions,
              includeHeaders: checked as boolean,
            }); }
          }
        />

        {/* Column Selection */}
        <YStack gap="$2">
          <Text {...knobProps.label} fontWeight="400">
            Select Columns ({selectedColumns.size} of {availableColumns.length})
          </Text>
          <ScrollView maxHeight={200}>
            <YStack gap="$1">
              {availableColumns.map((col) => (
                <Checkbox
                  key={col.key}
                  label={col.header}
                  checked={selectedColumns.has(col.key)}
                  onCheckedChange={(checked) => {
                    const newSelected = new Set(selectedColumns);
                    if (checked) {
                      newSelected.add(col.key);
                    } else {
                      newSelected.delete(col.key);
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
          <Text {...knobProps.label} fontWeight="400">
            Export Formats
          </Text>
          {exportFormats.map((format) => (
            <Button
              key={format.id}
              size={knobProps.sizeToken}
              chromeless
              justifyContent="flex-start"
              disabled={disabled || isExporting === format.id || !format.enabled}
              onPress={() =>{  onExport(format); }}
              icon={format.icon}
            >
              <YStack gap="$1">
                <Text {...knobProps.label} fontWeight="400">
                  {format.label}
                </Text>
                <Text fontSize="$2" color="$color10">
                  {format.description}
                </Text>
              </YStack>
              {isExporting === format.id && (
                <XStack flexGrow={1} justifyContent="flex-end">
                  <Text fontSize="$2" color="$accentColor">
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
          disabled={disabled || isExporting === "print"}
          onPress={onPrint}
          icon={<PrinterIcon size={iconPx} />}
        >
          Print Table
          {isExporting === "print" && (
            <XStack flexGrow={1} justifyContent="flex-end">
              <Text fontSize="$2" color="$accentColor">
                ...
              </Text>
            </XStack>
          )}
        </Button>
      </YStack>
    </FloatingPanel>
  );
}

// Default Export Implementation

async function defaultExport<T>(
  data: T[],
  columns: ExportColumn[],
  options: ExportOptions,
): Promise<void> {
  const { format, selectedColumns } = options;

  // Filter columns if specified
  const exportColumns = selectedColumns
    ? columns.filter((col) => selectedColumns.includes((col.accessorKey ?? col.id) ?? ""))
    : columns;

  switch (format) {
    case "csv": {
      return await exportAsCSV(data, exportColumns, options);
    }
    case "json": {
      return await exportAsJSON(data, exportColumns, options);
    }
    case "excel": {
      return await exportAsExcel(data, exportColumns, options);
    }
    case "pdf": {
      return await exportAsPDF(data, exportColumns, options);
    }
    default: {
      throw new Error(`Unsupported export format: ${format}`);
    }
  }
}

/**
 * Editor types whose value is a calendar DAY rather than an instant. A
 * `datepicker` hands back `new Date(y, m, d)` — local midnight standing in for
 * a day with no time in it — so the export writes the day and nothing else.
 * Every other date editor (`datetimepicker`) means a real timestamp.
 */
const CALENDAR_DAY_FIELDS: ReadonlySet<DataTableField> = new Set<DataTableField>([
  "datepicker",
  "daterangepicker",
  "multidatepicker",
]);

function isCalendarDayColumn(column?: ExportColumn): boolean {
  return column?.field != null && CALENDAR_DAY_FIELDS.has(column.field);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

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
function serializeExportDate(value: Date, calendarDay: boolean): string {
  if (Number.isNaN(value.getTime())) {return "";}
  if (calendarDay) {return formatCalendarDate(value, "date");}
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset =
    offsetMinutes === 0 ? "Z" : `${sign}${pad2(Math.trunc(abs / 60))}:${pad2(abs % 60)}`;
  const ms = String(value.getMilliseconds()).padStart(3, "0");
  return `${formatCalendarDate(value, "datetime").replace(" ", "T")}.${ms}${offset}`;
}

/**
 * Replace every `Date` reachable inside an array or plain object (a picked
 * `{start,end}` range, a multi-date array) before it reaches JSON.
 * `JSON.stringify` calls `Date.prototype.toJSON`, which is `toISOString()` —
 * the same UTC day-shift, one level down.
 */
function withExportDates(value: any, calendarDay: boolean): any {
  if (value instanceof Date) {return serializeExportDate(value, calendarDay);}
  if (Array.isArray(value)) {return value.map((item) => withExportDates(item, calendarDay));}
  if (value != null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {return value;}
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withExportDates(item, calendarDay)]),
    );
  }
  return value;
}

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
function toExportValue(value: any, column?: ExportColumn): string {
  if (value == null) {return "";}
  const calendarDay = isCalendarDayColumn(column);
  if (value instanceof Date) {return serializeExportDate(value, calendarDay);}
  if (typeof value === "object") {
    try {
      return JSON.stringify(withExportDates(value, calendarDay));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Quote a CSV field when it contains a delimiter, quote, or line break. */
function escapeCsvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * CSV/formula-injection guard (OWASP): string cells beginning with =, +, -, @
 * or tab get a leading apostrophe so spreadsheet apps treat them as text
 * instead of evaluating them. Only raw string values are guarded — genuine
 * numbers (e.g. -42) keep their sign and export unchanged.
 */
function guardCsvInjection(raw: any, value: string): string {
  if (typeof raw === "string" && /^[=+\-@\t]/.test(value)) {return `'${value}`;}
  return value;
}

// CSV Export
async function exportAsCSV<T>(
  data: T[],
  columns: ExportColumn[],
  options: ExportOptions,
): Promise<void> {
  const { includeHeaders = true, filename = "export" } = options;

  let csvContent = "";

  // Headers (escaped like data fields — a comma in a header must not split it)
  if (includeHeaders) {
    const headers = columns
      .map((col) => escapeCsvField(String((col.header ?? col.accessorKey) ?? "")))
      .join(",");
    csvContent += `${headers}\n`;
  }

  // Data rows
  data.forEach((row) => {
    const values = columns.map((col) => {
      const key = (col.accessorKey ?? col.id) ?? "";
      // Export the raw accessor value. Cell renderers return JSX (which
      // stringifies to "[object Object]") and bake presentation into the data,
      // so they are intentionally NOT invoked here.
      const raw = (row as any)[key];
      return escapeCsvField(guardCsvInjection(raw, toExportValue(raw, col)));
    });
    csvContent += `${values.join(",")}\n`;
  });

  downloadFile(csvContent, `${filename}.csv`, "text/csv");
}

// JSON Export
async function exportAsJSON<T>(
  data: T[],
  columns: ExportColumn[],
  options: ExportOptions,
): Promise<void> {
  const { filename = "export" } = options;

  const jsonData = data.map((row) => {
    const obj: any = {};
    columns.forEach((col) => {
      const key = (col.accessorKey ?? col.id) ?? "";
      // Non-date values stay native JSON types (numbers are numbers); only
      // Dates are rendered, because JSON.stringify would otherwise reach
      // Date.prototype.toJSON and emit the UTC day.
      obj[key] = withExportDates((row as any)[key], isCalendarDayColumn(col));
    });
    return obj;
  });

  const jsonContent = JSON.stringify(jsonData, null, 2);
  downloadFile(jsonContent, `${filename}.json`, "application/json");
}

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
async function exportAsExcel<T>(
  _data: T[],
  _columns: ExportColumn[],
  _options: ExportOptions,
): Promise<void> {
  throw new Error(
    "Excel export not built in. Install `xlsx` (or `exceljs`) and provide a custom `onExport` handler — see DataTableExport source for an example.",
  );
}

// PDF Export — same story: requires `jsPDF` (or server-side rendering) which
// we don't ship. The included `print` action opens the browser print dialog
// with a styled HTML table; that's the closest no-dependency equivalent and
// users can "Save as PDF" from there.
async function exportAsPDF<T>(
  _data: T[],
  _columns: ExportColumn[],
  _options: ExportOptions,
): Promise<void> {
  throw new Error(
    "PDF export not built in. Install `jspdf` and provide a custom `onExport` handler, or use the `print` format which opens the browser print dialog (Save as PDF).",
  );
}

// Print functionality. Built with DOM nodes + textContent (never HTML string
// interpolation) so cell values containing markup cannot inject into the
// print document (XSS via `<img onerror>`-style data).
async function printTable<T>(data: T[], columns: ExportColumn[]): Promise<void> {
  if (!isWeb || typeof window.open !== "function") {
    throw new Error("Print is not available on this platform.");
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Print window was blocked. Allow popups for this site and try again.");
  }

  const doc = printWindow.document;
  doc.title = "Table Export";

  const style = doc.createElement("style");
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

  const heading = doc.createElement("h1");
  heading.textContent = "Data Export";
  doc.body.append(heading);

  const tableEl = doc.createElement("table");
  const thead = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  for (const col of columns) {
    const th = doc.createElement("th");
    th.textContent = String((col.header ?? col.accessorKey) ?? "");
    headRow.append(th);
  }
  thead.append(headRow);
  tableEl.append(thead);

  const tbody = doc.createElement("tbody");
  for (const row of data) {
    const tr = doc.createElement("tr");
    for (const col of columns) {
      const key = (col.accessorKey ?? col.id) ?? "";
      const td = doc.createElement("td");
      // Same raw-value derivation as the CSV export — cell renderers return
      // JSX and must not reach the document.
      td.textContent = toExportValue((row as any)[key], col);
      tr.append(td);
    }
    tbody.append(tr);
  }
  tableEl.append(tbody);
  doc.body.append(tableEl);

  printWindow.print();
}

// Web-only download. Native/GTK have no Blob-URL download path (MPO-22);
// throw so the inline alert fires instead of a silent console.warn no-op.
function assertWebFileDownload(): void {
  if (
    !isWeb ||
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new Error(
      "File download is not available on this platform. Provide an onExport handler.",
    );
  }
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  assertWebFileDownload();
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

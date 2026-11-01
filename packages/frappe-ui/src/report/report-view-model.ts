// Pure model for the doctype REPORT view (desk report-builder parity), the
// one FrappeReportBuilder renders and the desk's view=report shows
// (MPO-15, GL-28). UI-free on purpose: default-column derivation (desk set_default_fields),
// the per-column filter-row → frappe-tuple mapping (list filter-fields
// vocabulary), desk `report_settings` JSON round-trip (saved Report docs
// desk can open and vice versa), deterministic sort/group/totals over the
// live collection rows, and CSV assembly for export.
import { fieldKind, selectOptionsFromField } from '../filter-fields';
import type { FilterFieldKind } from '../filter-fields';
import type { DocFieldMeta, DoctypeMeta } from '../formEngine/doctype-meta';
import type { FrappeFieldFilter } from '../use-connection-filters';

type FrappeFilter = FrappeFieldFilter;
type FrappeFilters = FrappeFieldFilter[];

/** The report's filter tuples: `[fieldname, operator, value]`. */
export type ReportFilters = FrappeFieldFilter[];

/**
 * What the report view reads off a doctype's meta. Only `fields` is
 * required, so a source without DocType meta (the shape of a record the
 * reader can see) stands in for it.
 */
export type ReportMetaSource = Pick<DoctypeMeta, 'fields'> &
  Partial<Pick<DoctypeMeta, 'title_field' | 'image_field' | 'sort_field' | 'sort_order'>>;

// ── Column model ──────────────────────────────────────────────

export interface ReportColumnDef {
  fieldname: string;
  label: string;
  fieldtype: string;
  kind: FilterFieldKind;
  /** Link target doctype or raw Select options string. */
  options?: string;
  /** Fixed column width (px) — one scrollport, so widths align all rows. */
  width: number;
  align: 'left' | 'right' | 'center';
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a row carries whichever doctype fields the report selected
export type ReportRow = { name: string } & Record<string, unknown>;

/** A JSON object from the wire; its keys are read as unknown and narrowed field by field. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- desk Report json carries keys of any type
type WireObject = Record<string, unknown>;

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number';
const isWireObject = (value: unknown): value is WireObject => typeof value === 'object' && value !== null;

/** A cell's text form, as the desk renders and exports it ("" for null/undefined). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- report cells hold any wire value
const cellText = (value: unknown): string =>
  // oxlint-disable-next-line typescript/no-base-to-string -- cells are wire scalars; String() is the desk's own text form
  String(value ?? '');

export interface ReportSortState {
  field: string;
  order: 'asc' | 'desc';
}

/** Field types that can render/sort as report cells (desk is_value_type). */
const VALUELESS_FIELDTYPES = new Set([
  'Section Break',
  'Column Break',
  'Tab Break',
  'HTML',
  'Table',
  'Table MultiSelect',
  'Button',
  'Image',
  'Fold',
  'Heading',
]);

export const REPORT_NUMERIC_FIELDTYPES = new Set(['Int', 'Float', 'Currency', 'Percent', 'Rating', 'Duration']);

const WIDE_FIELDTYPES = new Set(['Small Text', 'Text', 'Long Text', 'Text Editor', 'Markdown Editor', 'Code', 'JSON']);

/** Desk report page lengths. */
export const REPORT_PAGE_SIZES = [20, 100, 500] as const;
export const DEFAULT_REPORT_PAGE_SIZE: number = REPORT_PAGE_SIZES[0];

export const defaultColumnWidth = (fieldtype: string): number => {
  if (fieldtype === 'Check') {
    return 90;
  }
  if (REPORT_NUMERIC_FIELDTYPES.has(fieldtype)) {
    return 110;
  }
  if (fieldtype === 'Date') {
    return 120;
  }
  if (fieldtype === 'Datetime') {
    return 165;
  }
  if (WIDE_FIELDTYPES.has(fieldtype)) {
    return 240;
  }
  return 160;
};

export const columnAlign = (fieldtype: string): ReportColumnDef['align'] => {
  if (fieldtype === 'Check') {
    return 'center';
  }
  return REPORT_NUMERIC_FIELDTYPES.has(fieldtype) ? 'right' : 'left';
};

const toColumnDef = (field: DocFieldMeta): ReportColumnDef => {
  const { fieldtype } = field;
  return {
    fieldname: field.fieldname,
    label: field.label ?? field.fieldname,
    fieldtype,
    kind: fieldKind(fieldtype),
    options: field.options,
    width: defaultColumnWidth(fieldtype),
    align: columnAlign(fieldtype),
  };
};

/** Standard doc fields every doctype carries (absent from meta.fields). */
const standardReportColumns = (): ReportColumnDef[] => [
  {
    fieldname: 'name',
    label: 'ID',
    fieldtype: 'Data',
    kind: 'text',
    width: 160,
    align: 'left',
  },
  {
    fieldname: 'owner',
    label: 'Created By',
    fieldtype: 'Link',
    kind: 'link',
    options: 'User',
    width: 160,
    align: 'left',
  },
  {
    fieldname: 'creation',
    label: 'Created On',
    fieldtype: 'Datetime',
    kind: 'date',
    width: 165,
    align: 'left',
  },
  {
    fieldname: 'modified',
    label: 'Last Updated On',
    fieldtype: 'Datetime',
    kind: 'date',
    width: 165,
    align: 'left',
  },
  {
    fieldname: 'modified_by',
    label: 'Last Updated By',
    fieldtype: 'Link',
    kind: 'link',
    options: 'User',
    width: 160,
    align: 'left',
  },
];

/**
 * Every column the picker can offer: ID + meta value-type data fields (in
 * meta order, hidden included — desk's picker offers them too) + the
 * remaining standard doc fields.
 */
export const reportColumnsFromMeta = (meta?: ReportMetaSource): ReportColumnDef[] => {
  const out: ReportColumnDef[] = [];
  const seen = new Set<string>();
  const push = (column: ReportColumnDef) => {
    if (!column.fieldname || seen.has(column.fieldname)) {
      return;
    }
    seen.add(column.fieldname);
    out.push(column);
  };
  // ID first, desk parity.
  push(standardReportColumns()[0]);
  for (const field of meta?.fields ?? []) {
    const { fieldtype } = field;
    if (VALUELESS_FIELDTYPES.has(fieldtype) || fieldtype.startsWith('Table')) {
      continue;
    }
    push(toColumnDef(field));
  }
  for (const standard of standardReportColumns()) {
    push(standard);
  }
  return out;
};

const isPickableField = (field: DocFieldMeta): boolean =>
  !VALUELESS_FIELDTYPES.has(field.fieldtype) && !field.fieldtype.startsWith('Table') && field.report_hide !== 1;

/**
 * Desk default report columns (report_view.js set_default_fields):
 * name, a `status` docfield when the doctype has one (nearest meta-derivable
 * stand-in for desk's computed Status indicator), title_field + image_field,
 * fields flagged in_list_view OR in_standard_filter (value-type, not
 * report_hide), currency-source fields referenced by flagged Currency
 * columns, then modified (a fresh report should carry recency). Desk's
 * listview_settings.add_fields (e.g. User's "enabled") live in desk-side JS
 * bundles and cannot be derived from the meta channel — honest subset.
 */
export const defaultReportFieldnames = (meta?: ReportMetaSource): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (fieldname?: string) => {
    if (fieldname === undefined || fieldname === '' || seen.has(fieldname)) {
      return;
    }
    seen.add(fieldname);
    out.push(fieldname);
  };
  const fields = meta?.fields ?? [];
  push('name');
  const status = fields.find((field) => field.fieldname === 'status');
  if (status && isPickableField(status)) {
    push('status');
  }
  push(meta?.title_field);
  push(meta?.image_field);
  const flagged = fields.filter(
    (field) => isPickableField(field) && (field.in_list_view === 1 || field.in_standard_filter === 1),
  );
  for (const field of flagged) {
    push(field.fieldname);
  }
  // Desk: a flagged Currency column pulls in the field naming its currency.
  for (const field of flagged) {
    if (field.fieldtype !== 'Currency' || field.options === undefined || field.options === '') {
      continue;
    }
    push(field.options.includes(':') ? field.options.split(':')[1] : field.options);
  }
  push('modified');
  return out;
};

/** Resolve selected fieldnames against the pickable set (drops unknowns). */
export const resolveSelectedColumns = (all: ReportColumnDef[], fieldnames: readonly string[]): ReportColumnDef[] => {
  const byName = new Map(all.map((column) => [column.fieldname, column]));
  const out: ReportColumnDef[] = [];
  for (const fieldname of fieldnames) {
    const column = byName.get(fieldname);
    if (column) {
      out.push(column);
    }
  }
  return out;
};

// ── Per-column filter row → frappe tuples ─────────────────────

const COMPARISON_PREFIXES = ['>=', '<=', '!=', '>', '<', '='] as const;

const CHECK_TRUE = new Set(['1', 'true', 'yes', 'y', '✓']);
const CHECK_FALSE = new Set(['0', 'false', 'no', 'n']);

const containsTuple = (column: ReportColumnDef, text: string): FrappeFilter => [
  column.fieldname,
  'like',
  text.includes('%') ? text : `%${text}%`,
];

const checkTuple = (column: ReportColumnDef, text: string): FrappeFilter | null => {
  const lowered = text.toLowerCase();
  if (CHECK_TRUE.has(lowered)) {
    return [column.fieldname, '=', 1];
  }
  if (CHECK_FALSE.has(lowered)) {
    return [column.fieldname, '=', 0];
  }
  return null;
};

const selectTuple = (column: ReportColumnDef, text: string): FrappeFilter => {
  const match = selectOptionsFromField(column.options).find(
    (option) => option.value.toLowerCase() === text.toLowerCase(),
  );
  return match ? [column.fieldname, '=', match.value] : containsTuple(column, text);
};

const comparisonTuple = (column: ReportColumnDef, text: string): FrappeFilter | null => {
  const prefix = COMPARISON_PREFIXES.find((candidate) => text.startsWith(candidate));
  if (prefix === undefined) {
    return [column.fieldname, '=', text];
  }
  const value = text.slice(prefix.length).trim();
  return value ? [column.fieldname, prefix, value] : null;
};

/**
 * One filter-row input → one frappe tuple (null = no filter yet).
 * Mapping mirrors the list filter vocabulary (filter-fields):
 *   text / link → `like %value%` (contains; user-typed % wins)
 *   select      → `=` on an exact option match (case-insensitive),
 *                 else `like %value%` so partial typing still narrows
 *   check       → yes/no/1/0/true/false → `= 1|0`
 *   number/date → optional comparison prefix (`>`, `<`, `>=`, `<=`, `!=`,
 *                 `=`), bare values equal-match (desk operator-hint parity)
 */
export const columnFilterTuple = (column: ReportColumnDef, raw: string): FrappeFilter | null => {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  if (column.kind === 'check') {
    return checkTuple(column, text);
  }
  if (column.kind === 'select') {
    return selectTuple(column, text);
  }
  if (column.kind === 'number' || column.kind === 'date') {
    return comparisonTuple(column, text);
  }
  return containsTuple(column, text);
};

/** All committed filter-row inputs → tuples (unparseable inputs skipped). */
export const columnFilterTuples = (
  columns: readonly ReportColumnDef[],
  filters: Readonly<Record<string, string>>,
): FrappeFilters => {
  const out: FrappeFilters = [];
  for (const column of columns) {
    const raw = filters[column.fieldname];
    if (raw === undefined) {
      continue;
    }
    const tuple = columnFilterTuple(column, raw);
    if (tuple) {
      out.push(tuple);
    }
  }
  return out;
};

// ── `?f=` deep-link param ─────────────────────────────────────

/**
 * Parse the `?f=` search param: urlencoded JSON FrappeFilters. The router
 * usually decodes the param already, so the raw value is tried first
 * (same contract as the list screen's parser). Malformed input degrades to
 * "no filters".
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw router search param; this is its parser
export const parseReportFiltersParam = (raw: unknown): FrappeFilters | undefined => {
  if (!isString(raw) || !raw) {
    return undefined;
  }
  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) {
      candidates.push(decoded);
    }
  } catch {
    // raw is not percent-encoded — the direct candidate covers it
  }
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (!Array.isArray(parsed)) {
        continue;
      }
      const filters: FrappeFilters = [];
      for (const tuple of parsed) {
        if (Array.isArray(tuple) && tuple.length === 3 && isString(tuple[0]) && isString(tuple[1])) {
          filters.push([tuple[0], tuple[1], tuple[2]]);
        }
      }
      if (filters.length > 0) {
        return filters;
      }
    } catch {
      // not JSON — try the next candidate
    }
  }
  return undefined;
};

// ── Desk saved-report round trip ──────────────────────────────
// Report docs store json = { fields: [fieldname, doctype][], filters:
// [doctype, fieldname, operator, value][], order_by: "`tabX`.`field` desc",
// add_totals_row, page_length, group_by, column_widths, ... }. Serialize
// the same shape so desk opens our reports and we open desk's.

export interface ReportViewConfig {
  fieldnames: string[];
  filters: FrappeFilters;
  sort?: ReportSortState;
  pageSize?: number;
  groupBy?: string | null;
  addTotals?: boolean;
}

interface DeskGroupBySettings {
  group_by?: string | null;
  aggregate_function?: string;
  aggregate_on?: string | null;
}

export interface DeskReportSettings {
  fields: [string, string][];
  filters: [string, string, string, unknown][];
  order_by: string;
  add_totals_row: 0 | 1;
  page_length: number;
  column_widths: Record<string, number>;
  group_by?: DeskGroupBySettings | null;
}

const BACKTICK_FIELD_RE = /`tab(?<doctype>[^`]+)`\.`(?<field>[^`]+)`/u;

const toDeskFieldExpr = (doctype: string, fieldname: string): string => `\`tab${doctype}\`.\`${fieldname}\``;

/** Parse "`tabUser`.`modified` desc" (or bare "modified desc"). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw `order_by` field of a desk Report json; this is its parser
export const parseDeskOrderBy = (orderBy: unknown): ReportSortState | undefined => {
  if (!isString(orderBy) || !orderBy.trim()) {
    return undefined;
  }
  const [expr, direction] = orderBy.trim().split(/\s+/u);
  const backticked = BACKTICK_FIELD_RE.exec(expr);
  const field = backticked ? backticked[2] : expr.replaceAll('`', '');
  if (!field) {
    return undefined;
  }
  return { field, order: direction?.toLowerCase() === 'asc' ? 'asc' : 'desc' };
};

export const toDeskReportSettings = (doctype: string, config: ReportViewConfig): DeskReportSettings => {
  const sort = config.sort ?? { field: 'modified', order: 'desc' };
  const groupBy = config.groupBy ?? '';
  return {
    fields: config.fieldnames.map((fieldname) => [fieldname, doctype]),
    filters: config.filters.map(([fieldname, operator, value]) => [doctype, fieldname, operator, value]),
    order_by: `${toDeskFieldExpr(doctype, sort.field)} ${sort.order}`,
    add_totals_row: config.addTotals ? 1 : 0,
    page_length: config.pageSize ?? DEFAULT_REPORT_PAGE_SIZE,
    column_widths: {},
    group_by:
      groupBy === ''
        ? null
        : {
            group_by: toDeskFieldExpr(doctype, groupBy),
            aggregate_function: 'count',
            aggregate_on: null,
          },
  };
};

/** Parent-doctype fieldnames from desk `fields` ([fieldname, doctype] pairs or legacy strings). */
const deskFieldnames = (raw: WireObject, doctype: string): string[] => {
  const fieldnames: string[] = [];
  if (!Array.isArray(raw.fields)) {
    return fieldnames;
  }
  for (const entry of raw.fields) {
    if (isString(entry)) {
      fieldnames.push(entry);
    } else if (Array.isArray(entry) && isString(entry[0])) {
      const fieldDoctype = isString(entry[1]) ? entry[1] : doctype;
      if (fieldDoctype === doctype) {
        fieldnames.push(entry[0]);
      }
    }
  }
  return fieldnames;
};

/** One desk filter entry ([doctype, field, op, value] or [field, op, value]) → a parent tuple. */
// oxlint-disable-next-line typescript/no-explicit-any -- an Array.isArray-narrowed wire array; each slot is checked before use
const deskFilterTuple = (entry: any[], doctype: string): FrappeFilter | undefined => {
  if (entry.length === 4) {
    return entry[0] === doctype && isString(entry[1]) && isString(entry[2])
      ? [entry[1], entry[2], entry[3]]
      : undefined;
  }
  return entry.length === 3 && isString(entry[0]) && isString(entry[1]) ? [entry[0], entry[1], entry[2]] : undefined;
};

const deskFilters = (raw: WireObject, doctype: string): FrappeFilters => {
  const filters: FrappeFilters = [];
  if (!Array.isArray(raw.filters)) {
    return filters;
  }
  for (const entry of raw.filters) {
    const tuple = Array.isArray(entry) ? deskFilterTuple(entry, doctype) : undefined;
    if (tuple) {
      filters.push(tuple);
    }
  }
  return filters;
};

/** The fieldname inside desk `group_by.group_by` ("`tabX`.`field`"), or null. */
const deskGroupBy = (raw: WireObject): string | null => {
  const groupByExpr = isWireObject(raw.group_by) ? raw.group_by.group_by : undefined;
  const groupByMatch = isString(groupByExpr) ? BACKTICK_FIELD_RE.exec(groupByExpr) : null;
  return groupByMatch ? groupByMatch[2] : null;
};

/**
 * Desk Report json → view config. Child-doctype fields/filters are dropped
 * (this view renders parent fields only — honest subset), legacy plain
 * string field entries are honored.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw Report doc `json` field; this is its parser
export const fromDeskReportSettings = (doctype: string, json: unknown): ReportViewConfig | undefined => {
  if (!isWireObject(json)) {
    return undefined;
  }
  return {
    fieldnames: deskFieldnames(json, doctype),
    filters: deskFilters(json, doctype),
    sort: parseDeskOrderBy(json.order_by),
    pageSize: isNumber(json.page_length) && json.page_length > 0 ? json.page_length : undefined,
    groupBy: deskGroupBy(json),
    addTotals: json.add_totals_row === 1,
  };
};

// ── Sorting, grouping, totals ─────────────────────────────────

const isNullish = (value: unknown): value is null | undefined => value === null || value === undefined;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- report cells hold any wire value; numbers compare numerically, the rest by text
export const compareCellValues = (a: unknown, b: unknown): number => {
  if (isNullish(a) && isNullish(b)) {
    return 0;
  }
  if (isNullish(a)) {
    return 1;
  }
  if (isNullish(b)) {
    return -1;
  }
  if (isNumber(a) && isNumber(b)) {
    return a - b;
  }
  const left = cellText(a);
  const right = cellText(b);
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

/**
 * Deterministic client ordering of the live collection rows (live-query row
 * order is not guaranteed): group field first (when grouping), then the
 * sort field in its direction, name as the final tiebreak.
 */
export const orderReportRows = (
  rows: readonly ReportRow[],
  sort: ReportSortState,
  groupBy?: string | null,
): ReportRow[] => {
  const direction = sort.order === 'asc' ? 1 : -1;
  const groupField = groupBy ?? '';
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (groupField !== '') {
      const grouped = compareCellValues(a[groupField], b[groupField]);
      if (grouped !== 0) {
        return grouped;
      }
    }
    const left = a[sort.field];
    const right = b[sort.field];
    const ordered =
      isNullish(left) || isNullish(right) ? compareCellValues(left, right) : direction * compareCellValues(left, right);
    return ordered || compareCellValues(a.name, b.name);
  });
  return sorted;
};

export interface ReportGroupHeader {
  kind: 'group';
  key: string;
  value: unknown;
  /** Rows carrying this value across the FULL filtered result. */
  count: number;
}

export interface ReportDataRow {
  kind: 'row';
  key: string;
  row: ReportRow;
  /** 1-based position in the full ordered result (row-number column). */
  index: number;
}

export type ReportGridRow = ReportGroupHeader | ReportDataRow;

/**
 * Page slice → grid rows. With grouping active, group headers are injected
 * at value boundaries inside the page; counts cover the full ordered result
 * so a group spanning pages reads honestly.
 */
export const buildGridRows = (
  orderedRows: readonly ReportRow[],
  pageStart: number,
  pageSize: number,
  groupBy?: string | null,
): ReportGridRow[] => {
  const page = orderedRows.slice(pageStart, pageStart + pageSize);
  const out: ReportGridRow[] = [];
  let previousGroup: string | undefined;
  const counts = new Map<string, number>();
  const groupField = groupBy ?? '';
  if (groupField !== '') {
    for (const row of orderedRows) {
      const groupKey = cellText(row[groupField]);
      counts.set(groupKey, (counts.get(groupKey) ?? 0) + 1);
    }
  }
  for (const [index, row] of page.entries()) {
    if (groupField !== '') {
      const groupKey = cellText(row[groupField]);
      if (previousGroup === undefined || groupKey !== previousGroup) {
        previousGroup = groupKey;
        out.push({
          kind: 'group',
          key: `group:${groupKey}:${pageStart + index}`,
          value: row[groupField],
          count: counts.get(groupKey) ?? 0,
        });
      }
    }
    out.push({ kind: 'row', key: row.name, row, index: pageStart + index + 1 });
  }
  return out;
};

export interface ReportTotalsCell {
  fieldname: string;
  fieldtype: string;
  value: number;
}

/** Sums per visible numeric column over the FULL filtered result. */
export const computeTotals = (columns: readonly ReportColumnDef[], rows: readonly ReportRow[]): ReportTotalsCell[] => {
  if (rows.length === 0) {
    return [];
  }
  return columns.flatMap((column) =>
    REPORT_NUMERIC_FIELDTYPES.has(column.fieldtype)
      ? [
          {
            fieldname: column.fieldname,
            fieldtype: column.fieldtype,
            value: rows.reduce((sum, row) => sum + (Number(row[column.fieldname]) || 0), 0),
          },
        ]
      : [],
  );
};

// ── CSV export ────────────────────────────────────────────────

const CSV_SPECIAL = /[",\n]/u;

const escapeCsvCell = (text: string): string => (CSV_SPECIAL.test(text) ? `"${text.replaceAll('"', '""')}"` : text);

/** CSV over the FULL filtered + ordered result (not just the page). */
export const buildReportCsv = (columns: readonly ReportColumnDef[], rows: readonly ReportRow[]): string => {
  const lines = [
    columns.map((column) => escapeCsvCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(cellText(row[column.fieldname]))).join(',')),
  ];
  return lines.join('\n');
};

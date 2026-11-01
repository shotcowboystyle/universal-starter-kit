// The query/script report model: the one normalization of what
// frappe.desk.query_report.run and the Report doc send, shared by
// FrappeReportView and the desk's QueryReportScreen (MPO-15, GL-28).
// React-free; server messages decode through @repo/frappe's one
// decoder, the same one HttpClient uses for every failed response.
//
// oxlint-disable-next-line sonarjs/todo-tag -- the quoted report name below is a Frappe doctype, not a task marker
// PROBED response shapes (bench v15 — reports "ToDo", "Permitted Documents
// For User", and the SQL query report "Backoffice QR Probe"):
//   POST /api/method/frappe.desk.query_report.run {report_name, filters}
//   → {message: {columns, result, message, chart, report_summary,
//      add_total_row, skip_total_row, execution_time, status}}
//   - columns: [{label, fieldname, fieldtype, width?, options?}] — width is
//     a STRING ("90"), fieldtype may be "". v15 normalizes even old-style
//     SQL alias columns ("Label:Fieldtype/Options:Width") into this dict
//     shape server-side (get_column_as_dict); the string + positional-array
//     row forms are still handled here (older benches, prepared payloads,
//     the server-appended total row).
//   - result: array of objects keyed by fieldname; values may embed HTML
//     (e.g. desk anchor tags). The totals row is appended SERVER-side when
//     add_total_row=1, so no client aggregation happens here.
//   - errors: {exc_type, _server_messages} where _server_messages is a
//     JSON-encoded array of JSON-encoded {message} — humanized below.

import { readServerMessages } from '@repo/frappe';

export interface QueryReportColumn {
  fieldname: string;
  label: string;
  /** Frappe fieldtype ("Link", "Date", "Currency", … or "" when untyped). */
  fieldtype: string;
  /** Link target doctype (fieldtype "Link"). */
  options?: string;
  /** Desk pixel width hint (server sends strings like "90"). */
  width?: number;
  /** Float/Currency decimal places, when the column declares them. */
  precision?: number;
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- rows are keyed by server-declared column fieldnames; cell values are any wire value
export type QueryReportRow = Record<string, unknown>;
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- public API: filter values are per-fieldtype operands the server validates
export type QueryReportFilters = Record<string, unknown>;

/** A JSON object from the wire; its keys are read as unknown and narrowed field by field. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- report wire objects carry server-declared keys of any type
type WireObject = Record<string, unknown>;

const isString = (value: unknown): value is string => typeof value === 'string';

const isNumber = (value: unknown): value is number => typeof value === 'number';

const isWireObject = (value: unknown): value is WireObject => typeof value === 'object' && value !== null;

const NUMERIC_FILTER_FIELDTYPES = new Set(['Int', 'Float', 'Currency', 'Percent']);

/**
 * One report filter's declaration — from the Report doc `filters` child
 * table (Report Filter rows) or extracted from the desk-side script module
 * (which spells mandatory as `required`; both normalize to `mandatory`).
 */
export interface QueryReportFilterMeta {
  fieldname: string;
  label?: string;
  fieldtype?: string;
  options?: string;
  /** Script modules declare numeric/boolean defaults; doc rows are strings. */
  default?: string | number;
  mandatory?: 0 | 1;
  /** Desk wraps this filter's value in `%…%` before the run. */
  wildcard_filter?: 0 | 1;
  /** Applied (defaults included) but never rendered — desk parity. */
  hidden?: 0 | 1;
  /**
   * Desk `read_only` — the control renders (so the value is honest) but
   * cannot be edited. Locked filters must not open pickers (LC-21 family:
   * a disabled control opens nothing).
   */
  read_only?: 0 | 1;
}

/** Report doc bits the screen cares about (loose — server owns the schema). */
export interface QueryReportMeta {
  name: string;
  report_name?: string;
  ref_doctype?: string;
  report_type?: string;
  disabled?: 0 | 1;
  prepared_report?: 0 | 1;
  add_total_row?: 0 | 1;
  filters?: QueryReportFilterMeta[];
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the Report doc carries server keys beyond the ones read here
  [key: string]: unknown;
}

/** Static data for stories/tests — skips every bench RPC. */
export interface QueryReportFixture {
  meta?: Partial<QueryReportMeta>;
  /** Raw column shapes (dicts or "Label:Fieldtype/Options:Width" strings). */
  columns: unknown[];
  /** Raw rows (dicts or positional arrays). */
  rows: unknown[];
  message?: string;
  /** Desk-side script module text (get_script response) for filter extraction. */
  script?: string;
}

/**
 * A report filter as a caller or the wire declares it (Report Filter rows,
 * a `filterFields` prop, a fixture's `filters`): flags may be 0/1 or
 * booleans, and a script module spells mandatory `required`.
 * `normalizeFilterMeta` turns it into {@link QueryReportFilterMeta}.
 */
export interface QueryReportFilterInput {
  fieldname: string;
  label?: string;
  fieldtype?: string;
  options?: string | string[];
  default?: unknown;
  mandatory?: number | boolean;
  required?: number | boolean;
  wildcard_filter?: number | boolean;
  hidden?: number | boolean;
  read_only?: number | boolean;
}

/** Raw `frappe.desk.query_report.run` response body (`message`). */
export interface QueryReportRunMessage {
  columns?: unknown[];
  result?: unknown[];
  message?: string | string[] | null;
  chart?: unknown;
  report_summary?: unknown;
  add_total_row?: number | boolean;
  skip_total_row?: number | boolean;
  execution_time?: number;
  status?: string | null;
  /**
   * Fixture extension: filter declarations. The live endpoint does not send
   * filters with `run`; fixtures may, so a fixture-backed view gets a filter
   * bar without a second fixture surface.
   */
  filters?: QueryReportFilterInput[];
}

/** A normalized run: what a report table renders. */
export interface QueryReportPayload {
  columns: QueryReportColumn[];
  rows: QueryReportRow[];
  /** Server-side report message (already user-facing). */
  message?: string;
  /** True when the last row is the server-computed total row. */
  addTotalRow: boolean;
  /** Fixture-provided filter declarations (see QueryReportRunMessage). */
  filters?: QueryReportFilterInput[];
  /** The untouched response, for chart / report_summary consumers. */
  raw: QueryReportRunMessage;
}

/**
 * The server's `frappe.scrub`: `txt.replace(" ", "_").replace("-", "_").lower()`.
 * A label-only column gets its fieldname this way on the server
 * (`get_column_as_dict`), and the rows are keyed by that fieldname, so the
 * client has to produce the same string, parentheses and slashes included.
 */
export const scrubFieldname = (label: string): string => label.replaceAll(' ', '_').replaceAll('-', '_').toLowerCase();

/** Best-effort HTML → text for report cell values and server messages. */
export const stripHtml = (value: string): string => {
  if (!value.includes('<') && !value.includes('&')) {
    return value;
  }
  return (
    value
      // oxlint-disable-next-line sonarjs/super-linear-regex -- input is one report cell or server message, never user-sized
      .replaceAll(/<[^>]*>/gu, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll(/\s+/gu, ' ')
      .trim()
  );
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parses the raw wire width (a number, or a string like "90")
const parseWidth = (raw: unknown): number | undefined => {
  if (isNumber(raw)) {
    return raw > 0 ? raw : undefined;
  }
  if (isString(raw) && raw) {
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- parseInt keeps the leading digits of "90px"; Number() would reject it
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parses the raw wire precision (a number, or a numeric string)
const parsePrecision = (raw: unknown): number | undefined => {
  const parsed = isString(raw) && raw ? Number(raw) : raw;
  return isNumber(parsed) && Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

/**
 * Normalize run() columns: v15 sends dicts, older/custom reports may send
 * "Label:Fieldtype/Options:Width" alias strings. Fieldnames are deduped so
 * positional rows always land somewhere addressable.
 */
export const normalizeQueryReportColumns = (raw: readonly unknown[] | undefined): QueryReportColumn[] => {
  const used = new Set<string>();
  const columns: QueryReportColumn[] = [];
  for (const [index, entry] of (raw ?? []).entries()) {
    let label = '';
    let fieldname = '';
    let fieldtype = '';
    let options: string | undefined;
    let width: number | undefined;
    let precision: number | undefined;
    if (isString(entry)) {
      const [labelPart = '', typePart = '', widthPart = ''] = entry.split(':');
      label = labelPart.trim();
      const [typeBit = '', optionsBit = ''] = typePart.split('/');
      fieldtype = typeBit.trim();
      options = optionsBit.trim() || undefined;
      width = parseWidth(widthPart.trim());
    } else if (isWireObject(entry)) {
      label = isString(entry.label) ? entry.label : '';
      fieldname = isString(entry.fieldname) ? entry.fieldname : '';
      fieldtype = isString(entry.fieldtype) ? entry.fieldtype : '';
      options = isString(entry.options) && entry.options ? entry.options : undefined;
      width = parseWidth(entry.width);
      precision = parsePrecision(entry.precision);
    } else {
      continue;
    }
    let id = fieldname || scrubFieldname(label) || `col_${index}`;
    if (used.has(id)) {
      id = `${id}_${index}`;
    }
    used.add(id);
    columns.push({ fieldname: id, label: label || id, fieldtype, options, width, precision });
  }
  return columns;
};

/** Normalize run() rows: positional arrays are zipped onto column fieldnames. */
export const normalizeQueryReportRows = (
  raw: readonly unknown[] | undefined,
  columns: readonly QueryReportColumn[],
): QueryReportRow[] => {
  const rows: QueryReportRow[] = [];
  for (const entry of raw ?? []) {
    if (Array.isArray(entry)) {
      const row: QueryReportRow = {};
      for (const [index, column] of columns.entries()) {
        row[column.fieldname] = entry[index];
      }
      rows.push(row);
    } else if (isWireObject(entry)) {
      rows.push(entry);
    }
  }
  return rows;
};

/** Truthy check/flag coercion (accepts 1, "1", true — the wire variants). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- coerces the raw wire flag variants (1, "1", true)
const coerceFlag = (raw: unknown): 0 | 1 => (raw === 1 || raw === '1' || raw === true ? 1 : 0);

/** The declared fieldname, else the scrubbed label, else "". */
const filterFieldname = (row: WireObject): string => {
  if (isString(row.fieldname) && row.fieldname) {
    return row.fieldname;
  }
  if (isString(row.label) && row.label) {
    return scrubFieldname(row.label);
  }
  return '';
};

/** A string option list, or a string array joined one option per line. */
const filterOptions = (row: WireObject): string | undefined => {
  if (isString(row.options)) {
    return row.options;
  }
  if (Array.isArray(row.options) && row.options.every(isString)) {
    return row.options.join('\n');
  }
  return undefined;
};

/** A declared default: non-empty strings and numbers as-is, booleans as 1/0. */
const filterDefault = (row: WireObject): string | number | undefined => {
  const raw = row.default;
  if (isString(raw) && raw !== '') {
    return raw;
  }
  if (isNumber(raw)) {
    return raw;
  }
  if (raw === true || raw === false) {
    return raw ? 1 : 0;
  }
  return undefined;
};

/**
 * One filter declaration record (a Report Filter doc row or a script-object
 * extraction) → normalized meta. Script modules spell mandatory as `required`
 * and may declare numeric/boolean defaults.
 */
const coerceFilterMetaEntry = (row: WireObject): QueryReportFilterMeta | undefined => {
  const fieldname = filterFieldname(row);
  if (!fieldname) {
    return undefined;
  }
  return {
    fieldname,
    label: isString(row.label) ? row.label : undefined,
    fieldtype: isString(row.fieldtype) ? row.fieldtype : undefined,
    options: filterOptions(row),
    default: filterDefault(row),
    mandatory: coerceFlag(row.mandatory) || coerceFlag(row.required) ? 1 : 0,
    wildcard_filter: coerceFlag(row.wildcard_filter),
    hidden: coerceFlag(row.hidden),
    read_only: coerceFlag(row.read_only) || coerceFlag(row.readOnly) ? 1 : 0,
  };
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- public API: parses the raw Report Filter rows / filterFields declarations
export const normalizeFilterMeta = (raw: unknown): QueryReportFilterMeta[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const filters: QueryReportFilterMeta[] = [];
  for (const entry of raw) {
    const meta = isWireObject(entry) ? coerceFilterMetaEntry(entry) : undefined;
    if (meta) {
      filters.push(meta);
    }
  }
  return filters;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- public API: filter values are arbitrary per-fieldtype operands
export const isEmptyFilterValue = (value: unknown): boolean => value === undefined || value === null || value === '';

/** Drop empty values so a cleared control never reaches the server. */
export const compactFilterValues = (values?: QueryReportFilters): QueryReportFilters => {
  const out: QueryReportFilters = {};
  for (const [fieldname, value] of Object.entries(values ?? {})) {
    if (!isEmptyFilterValue(value)) {
      out[fieldname] = value;
    }
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- public API: callers receive the open QueryReportFilters dict
  return out;
};

/** A run response → the columns, rows and message a report table renders. */
export const normalizeQueryReportPayload = (raw: QueryReportRunMessage): QueryReportPayload => {
  const columns = normalizeQueryReportColumns(raw.columns);
  const rows = normalizeQueryReportRows(raw.result, columns);
  const skipTotalRow = Boolean(raw.skip_total_row);
  const message = Array.isArray(raw.message) ? raw.message.filter(Boolean).join(' ') : (raw.message ?? undefined);
  return {
    columns,
    rows,
    message: message ?? undefined,
    addTotalRow: Boolean(raw.add_total_row) && !skipTotalRow,
    filters: raw.filters,
    raw,
  };
};

/**
 * Draft/applied values → the dict that round-trips through `?filters=` and
 * `query_report.run`. Empty values drop; hidden filters keep their values
 * so a clear-all on the visible bar does not strip seeded hidden defaults.
 */
export const compactQueryReportFilters = (
  filterMeta: readonly QueryReportFilterMeta[],
  values: QueryReportFilters,
): QueryReportFilters => {
  const declared: QueryReportFilters = {};
  for (const filter of filterMeta) {
    declared[filter.fieldname] = values[filter.fieldname];
  }
  return compactFilterValues(declared);
};

/** Seedable default values ("" defaults are non-values, desk parity). */
export const defaultFilterValues = (filterMeta: readonly QueryReportFilterMeta[]): QueryReportFilters => {
  const defaults: QueryReportFilters = {};
  for (const filter of filterMeta) {
    if (filter.default !== undefined && filter.default !== '') {
      defaults[filter.fieldname] = filter.default;
    }
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- public API: callers receive the open QueryReportFilters dict
  return defaults;
};

/**
 * Filter values → the `filters` dict for frappe.desk.query_report.run.
 * Desk parity (query_report.js get_filter_values): falsy values are OMITTED
 * (an unchecked Check or empty input sends nothing), `wildcard_filter`
 * values wrap in `%…%` unless the user typed their own wildcard, and
 * numeric fieldtypes send numbers (script reports do arithmetic on them).
 */
export const buildRunFilters = (
  filterMeta: readonly QueryReportFilterMeta[],
  filters: QueryReportFilters,
): QueryReportFilters => {
  const metaByField = new Map(filterMeta.map((filter) => [filter.fieldname, filter]));
  const out: QueryReportFilters = {};
  for (const [fieldname, rawValue] of Object.entries(filters)) {
    let value = rawValue === true ? 1 : rawValue;
    if (isEmptyFilterValue(value) || value === false || value === 0) {
      continue;
    }
    const meta = metaByField.get(fieldname);
    if (meta?.wildcard_filter === 1 && isString(value) && !value.includes('%')) {
      value = `%${value}%`;
    }
    const isNumericField = meta?.fieldtype !== undefined && NUMERIC_FILTER_FIELDTYPES.has(meta.fieldtype);
    if (isNumericField && isString(value) && value.trim() !== '' && Number.isFinite(Number(value))) {
      value = Number(value);
    }
    out[fieldname] = value;
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- public API: callers receive the open QueryReportFilters dict
  return out;
};

// ── Script-declared filters (desk-side report JS modules) ───────
//
// Standard reports declare filters in their desk JS module, reachable only
// as raw text via frappe.desk.query_report.get_script:
//   frappe.query_reports["<name>"] = { filters: [{fieldname, label: __("…"),
//     fieldtype, options, required, default, get_query() {…}}, …] }
// The declarative subset (string/number/boolean values, __() labels, string
// arrays) is extracted WITHOUT eval by a small string/comment-aware scanner;
// function-valued keys (get_query, on_change, formatters) are skipped.
// Entries that don't yield a renderable control count toward `declaredCount`
// so the surface can render an honest "defined in code" gap note.

export interface ScriptFilterExtraction {
  /** True when the module declares a `filters` key (even an empty one). */
  declared: boolean;
  /** Top-level entries the script declares (parseable or not). */
  declaredCount: number;
  /** The renderable (declarative) subset, normalized. */
  filters: QueryReportFilterMeta[];
}

/** The declarative literal kinds a script filter key can hold. */
type ScriptValue = string | number | boolean | string[];

/** The declarative keys of one script filter object. */
type ScriptObject = Record<string, ScriptValue>;

const EMPTY_EXTRACTION: ScriptFilterExtraction = { declared: false, declaredCount: 0, filters: [] };

/** Filter fieldtypes the surface can render (desk-only ones are gaps). */
const RENDERABLE_FILTER_FIELDTYPES = new Set([
  'Data',
  'Small Text',
  'Text',
  'Int',
  'Float',
  'Currency',
  'Percent',
  'Date',
  'Datetime',
  'Time',
  'Check',
  'Select',
  'Link',
]);

const QUOTES = new Set(["'", '"', '`']);
const CLOSING_BRACKETS = new Map([
  ['[', ']'],
  ['{', '}'],
  ['(', ')'],
]);
const STRING_ESCAPES = new Map([
  ['n', '\n'],
  ['t', '\t'],
  ['r', '\r'],
]);
const ARRAY_SEPARATORS = new Set([',', ' ', '\t', '\n', '\r']);
const ESCAPE_SEQUENCE = /\\(?<ch>.)/gu;
const TRANSLATION_CALL = /^__\s*\(/u;
const NUMBER_LITERAL = /^-?\d+(?:\.\d+)?$/u;
const OBJECT_SEPARATOR = /\s|,/u;
const WHITESPACE = /\s/u;
const SCRIPT_KEY = /^[A-Za-z_$][\w$]*/u;
const FILTERS_KEY = /\bfilters\s*:\s*\[/u;

/** True when a `//` or `/*` comment opens at `index`. */
const isCommentStart = (text: string, index: number): boolean =>
  text[index] === '/' && (text[index + 1] === '/' || text[index + 1] === '*');

/** Index AFTER the string literal opening at `start` (escape-aware). */
const scanStringEnd = (text: string, start: number): number => {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    const ch = text[index];
    if (ch === '\\') {
      index += 2;
      continue;
    }
    if (ch === quote) {
      return index + 1;
    }
    index += 1;
  }
  return index;
};

/** Index after a line or block comment opening at `start` (start+1 for a bare slash). */
const scanCommentEnd = (text: string, start: number): number => {
  const next = text[start + 1];
  if (next === '/') {
    const newline = text.indexOf('\n', start);
    return newline === -1 ? text.length : newline + 1;
  }
  if (next === '*') {
    const end = text.indexOf('*/', start + 2);
    return end === -1 ? text.length : end + 2;
  }
  return start + 1;
};

/** Matching close-bracket index for the opener at `open` (-1 when unbalanced). */
const matchBracket = (text: string, open: number): number => {
  const openCh = text[open];
  const closeCh = CLOSING_BRACKETS.get(openCh) ?? '';
  if (!closeCh) {
    return -1;
  }
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const ch = text[index];
    if (QUOTES.has(ch)) {
      index = scanStringEnd(text, index);
    } else if (ch === '/') {
      index = scanCommentEnd(text, index);
    } else {
      if (ch === openCh) {
        depth += 1;
      } else if (ch === closeCh) {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
      index += 1;
    }
  }
  return -1;
};

/** Unescape the common sequences inside a scanned string literal body. */
const unescapeStringBody = (body: string): string =>
  body.replaceAll(ESCAPE_SEQUENCE, (_, ch: string) => STRING_ESCAPES.get(ch) ?? ch);

/** A quoted literal that spans the whole value; template strings with interpolations are not declarative. */
const interpretQuotedValue = (value: string, quote: string): string | undefined => {
  if (scanStringEnd(value, 0) !== value.length) {
    return undefined;
  }
  const body = value.slice(1, -1);
  if (quote === '`' && body.includes('${')) {
    return undefined;
  }
  return unescapeStringBody(body);
};

/** A translation call — the first string argument is the label. */
const interpretTranslationCall = (value: string): string | undefined => {
  const parenIndex = value.indexOf('(');
  const [quote] = value.slice(parenIndex + 1).trim();
  if (!QUOTES.has(quote)) {
    return undefined;
  }
  const quoteIndex = value.indexOf(quote, parenIndex);
  const end = scanStringEnd(value, quoteIndex);
  return unescapeStringBody(value.slice(quoteIndex + 1, end - 1));
};

/** An array of string literals; any other entry makes it non-declarative. */
const interpretStringArray = (value: string): string[] | undefined => {
  const close = matchBracket(value, 0);
  if (close !== value.length - 1) {
    return undefined;
  }
  const entries: string[] = [];
  let index = 1;
  while (index < close) {
    const ch = value[index];
    if (QUOTES.has(ch)) {
      const end = scanStringEnd(value, index);
      const body = value.slice(index + 1, end - 1);
      if (ch === '`' && body.includes('${')) {
        return undefined;
      }
      entries.push(unescapeStringBody(body));
      index = end;
    } else if (isCommentStart(value, index)) {
      index = scanCommentEnd(value, index);
    } else if (ARRAY_SEPARATORS.has(ch)) {
      index += 1;
    } else {
      // A non-string entry (objects, expressions) — not declarative.
      return undefined;
    }
  }
  return entries;
};

/**
 * Interpret one raw value slice from a script object literal. Returns
 * undefined for anything non-declarative (functions, frappe.* expressions,
 * template strings with interpolations, ternaries…).
 */
const interpretScriptValue = (raw: string): ScriptValue | undefined => {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  const [first] = value;
  if (QUOTES.has(first)) {
    return interpretQuotedValue(value, first);
  }
  if (TRANSLATION_CALL.test(value)) {
    return interpretTranslationCall(value);
  }
  if (NUMBER_LITERAL.test(value)) {
    return Number(value);
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (first === '[') {
    return interpretStringArray(value);
  }
  return undefined;
};

interface ScanStep {
  text: string;
  next: number;
}

/** The object key at `index` (identifier or quoted string); undefined when none starts there. */
const readScriptKey = (source: string, index: number): ScanStep | undefined => {
  const ch = source[index];
  if (ch === "'" || ch === '"') {
    const keyEnd = scanStringEnd(source, index);
    return { text: source.slice(index + 1, keyEnd - 1), next: keyEnd };
  }
  const keyMatch = SCRIPT_KEY.exec(source.slice(index, index + 64));
  if (keyMatch === null) {
    return undefined;
  }
  const [key] = keyMatch;
  return { text: key, next: index + key.length };
};

/** The comment-free value text up to the next top-level comma; undefined when a bracket is unbalanced. */
const readScriptValue = (source: string, start: number, end: number): ScanStep | undefined => {
  let text = '';
  let index = start;
  while (index < end) {
    const ch = source[index];
    if (ch === ',') {
      return { text, next: index + 1 };
    }
    if (QUOTES.has(ch)) {
      const stringEnd = scanStringEnd(source, index);
      text += source.slice(index, stringEnd);
      index = stringEnd;
    } else if (isCommentStart(source, index)) {
      index = scanCommentEnd(source, index);
    } else if (CLOSING_BRACKETS.has(ch)) {
      const close = matchBracket(source, index);
      if (close === -1) {
        return undefined;
      }
      text += source.slice(index, close + 1);
      index = close + 1;
    } else {
      text += ch;
      index += 1;
    }
  }
  return { text, next: index };
};

interface ScriptEntry {
  key: string;
  value: string;
  next: number;
}

/** One `key: value` entry at `index`; undefined when the entry is not declarative or the source is unbalanced. */
const readScriptEntry = (source: string, index: number, end: number): ScriptEntry | undefined => {
  const key = readScriptKey(source, index);
  if (key === undefined) {
    return undefined;
  }
  let cursor = key.next;
  while (cursor < end && WHITESPACE.test(source[cursor])) {
    cursor += 1;
  }
  // Shorthand properties and methods are not declarative.
  if (source[cursor] !== ':') {
    return undefined;
  }
  const value = readScriptValue(source, cursor + 1, end);
  return value === undefined ? undefined : { key: key.text, value: value.text, next: value.next };
};

/** Parse one `{…}` object literal into declarative key/value pairs. */
const parseScriptObject = (source: string): ScriptObject => {
  const record: ScriptObject = {};
  // Past the opening brace, up to before the closing one.
  let index = 1;
  const end = source.length - 1;
  while (index < end) {
    if (isCommentStart(source, index)) {
      index = scanCommentEnd(source, index);
    } else if (OBJECT_SEPARATOR.test(source[index])) {
      index += 1;
    } else {
      const entry = readScriptEntry(source, index, end);
      if (entry === undefined) {
        break;
      }
      const interpreted = interpretScriptValue(entry.value);
      if (interpreted !== undefined) {
        record[entry.key] = interpreted;
      }
      index = entry.next;
    }
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- the keys are whatever the script declares; there is no closed key set
  return record;
};

/** The filter as the surface renders it, or undefined when its fieldtype or options make it a gap. */
const toRenderableFilter = (meta: QueryReportFilterMeta | undefined): QueryReportFilterMeta | undefined => {
  if (meta === undefined) {
    return undefined;
  }
  const fieldtype = meta.fieldtype ?? 'Data';
  if (!RENDERABLE_FILTER_FIELDTYPES.has(fieldtype)) {
    return undefined;
  }
  const needsOptions = fieldtype === 'Select' || fieldtype === 'Link';
  if (needsOptions && (meta.options ?? '') === '') {
    return undefined;
  }
  return { ...meta, fieldtype };
};

/**
 * Extract the declarative filter subset from a desk report script module.
 * Never throws; anything unparseable degrades to a smaller `filters` list
 * (the `declaredCount` delta is the honest gap).
 */
export const extractScriptFilters = (script?: string): ScriptFilterExtraction => {
  if (script === undefined || script === '') {
    return EMPTY_EXTRACTION;
  }
  const keyMatch = FILTERS_KEY.exec(script);
  if (keyMatch === null) {
    return EMPTY_EXTRACTION;
  }
  const openBracket = keyMatch.index + keyMatch[0].length - 1;
  const closeBracket = matchBracket(script, openBracket);
  if (closeBracket === -1) {
    return EMPTY_EXTRACTION;
  }
  const filters: QueryReportFilterMeta[] = [];
  let declaredCount = 0;
  let index = openBracket + 1;
  while (index < closeBracket) {
    const ch = script[index];
    if (ch === '{') {
      const close = matchBracket(script, index);
      if (close === -1 || close > closeBracket) {
        break;
      }
      declaredCount += 1;
      const filter = toRenderableFilter(coerceFilterMetaEntry(parseScriptObject(script.slice(index, close + 1))));
      if (filter) {
        filters.push(filter);
      }
      index = close + 1;
    } else if (QUOTES.has(ch)) {
      index = scanStringEnd(script, index);
    } else if (isCommentStart(script, index)) {
      index = scanCommentEnd(script, index);
    } else {
      index += 1;
    }
  }
  return { declared: true, declaredCount, filters };
};

/** `_server_messages` as one line per message, block and `<br>` (MPO-473). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw `_server_messages` field; this is its decoder
const decodeServerMessages = (raw: unknown): string | undefined => {
  if (!isString(raw) || !raw.startsWith('[')) {
    return undefined;
  }
  const lines = readServerMessages(raw);
  return lines.length > 0 ? lines.join('\n') : undefined;
};

interface ReportErrorFields {
  data?: unknown;
  status?: unknown;
  exc_type?: unknown;
}

/**
 * A failed report call → an Error whose message is the server's own sentence.
 * The HTTP `status` and frappe `exc_type` ride along, so a caller can still
 * tell a refused run (403 / PermissionError) from a broken one.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives the raw caught rejection, which is untyped by nature
export const humanizeFrappeError = (err: unknown): Error => {
  if (!(err instanceof Error)) {
    return new Error(String(err));
  }
  // SAFETY: every added field is optional and typed unknown, so this only names what HttpClient may attach
  const source = err as Error & ReportErrorFields;
  const data = isWireObject(source.data) ? source.data : undefined;
  const decoded = decodeServerMessages(data?._server_messages) ?? decodeServerMessages(err.message);
  if (decoded === undefined || decoded === '') {
    return err;
  }
  const humanized: Error & ReportErrorFields = new Error(decoded);
  if (source.status !== undefined) {
    humanized.status = source.status;
  }
  const excType = source.exc_type ?? data?.exc_type;
  if (excType !== undefined) {
    humanized.exc_type = excType;
  }
  if (source.data !== undefined) {
    humanized.data = source.data;
  }
  if (err.stack !== undefined && err.stack !== '') {
    humanized.stack = err.stack;
  }
  return humanized;
};

// ── FrappeReportView's names for the same model ────────────────
// FrappeReportView shipped these names before the model was one. They stay
// on the barrel as aliases so existing imports keep compiling; none of them
// is a second implementation.

export type FrappeReportColumn = QueryReportColumn;
// oxlint-disable-next-line sonarjs/redundant-type-aliases, anti-slop/no-unsafe-dictionary-type -- public alias kept so existing FrappeReportView imports compile
export type FrappeReportRow = QueryReportRow;
// oxlint-disable-next-line sonarjs/redundant-type-aliases, anti-slop/no-unsafe-dictionary-type -- public alias kept so existing FrappeReportView imports compile
export type FrappeReportValues = QueryReportFilters;
export type FrappeReportFilterDef = QueryReportFilterInput;
export type FrappeReportRunResponse = QueryReportRunMessage;
export type FrappeReportPayload = QueryReportPayload;

export const normalizeReportPayload = normalizeQueryReportPayload;

/** One column, dict or `"Label:Fieldtype/Options:Width"`, in its normalized shape. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- public API: accepts a raw dict or alias-string column
export const normalizeReportColumn = (column: unknown): QueryReportColumn =>
  normalizeQueryReportColumns([column])[0] ?? {
    fieldname: 'col_0',
    label: 'col_0',
    fieldtype: '',
  };

/** `normalizeQueryReportRows` with FrappeReportView's argument order. */
export const normalizeReportRows = (
  columns: readonly QueryReportColumn[],
  result: readonly unknown[] | undefined,
): QueryReportRow[] => normalizeQueryReportRows(result, columns);

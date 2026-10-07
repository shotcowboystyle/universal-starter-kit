// The query/script report model: the one normalization of what
// frappe.desk.query_report.run and the Report doc send, shared by
// FrappeReportView and the desk's QueryReportScreen (MPO-15, GL-28).
// React-free; server messages decode through @repo/frappe's one
// decoder, the same one HttpClient uses for every failed response.
//
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

export type QueryReportRow = Record<string, unknown>;
export type QueryReportFilters = Record<string, unknown>;

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
export function scrubFieldname(label: string): string {
  return label.replaceAll(' ', '_').replaceAll('-', '_').toLowerCase();
}

/** Best-effort HTML → text for report cell values and server messages. */
export function stripHtml(value: string): string {
  if (!value.includes('<') && !value.includes('&')) {
    return value;
  }
  return value
    .replaceAll(/<[^>]*>/g, '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function parseWidth(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    return raw > 0 ? raw : undefined;
  }
  if (typeof raw === 'string' && raw) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function parsePrecision(raw: unknown): number | undefined {
  const parsed = typeof raw === 'string' && raw ? Number(raw) : raw;
  return typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Normalize run() columns: v15 sends dicts, older/custom reports may send
 * "Label:Fieldtype/Options:Width" alias strings. Fieldnames are deduped so
 * positional rows always land somewhere addressable.
 */
export function normalizeQueryReportColumns(raw: readonly unknown[] | undefined): QueryReportColumn[] {
  const used = new Set<string>();
  const columns: QueryReportColumn[] = [];
  (raw ?? []).forEach((entry, index) => {
    let label = '';
    let fieldname = '';
    let fieldtype = '';
    let options: string | undefined;
    let width: number | undefined;
    let precision: number | undefined;
    if (typeof entry === 'string') {
      const [labelPart = '', typePart = '', widthPart = ''] = entry.split(':');
      label = labelPart.trim();
      const [typeBit = '', optionsBit = ''] = typePart.split('/');
      fieldtype = typeBit.trim();
      options = optionsBit.trim() || undefined;
      width = parseWidth(widthPart.trim());
    } else if (entry && typeof entry === 'object') {
      const column = entry as Record<string, unknown>;
      label = typeof column.label === 'string' ? column.label : '';
      fieldname = typeof column.fieldname === 'string' ? column.fieldname : '';
      fieldtype = typeof column.fieldtype === 'string' ? column.fieldtype : '';
      options = typeof column.options === 'string' && column.options ? column.options : undefined;
      width = parseWidth(column.width);
      precision = parsePrecision(column.precision);
    } else {
      return;
    }
    let id = fieldname || scrubFieldname(label) || `col_${index}`;
    if (used.has(id)) {
      id = `${id}_${index}`;
    }
    used.add(id);
    columns.push({ fieldname: id, label: label || id, fieldtype, options, width, precision });
  });
  return columns;
}

/** Normalize run() rows: positional arrays are zipped onto column fieldnames. */
export function normalizeQueryReportRows(
  raw: readonly unknown[] | undefined,
  columns: readonly QueryReportColumn[],
): QueryReportRow[] {
  const rows: QueryReportRow[] = [];
  for (const entry of raw ?? []) {
    if (Array.isArray(entry)) {
      const row: QueryReportRow = {};
      columns.forEach((column, index) => {
        row[column.fieldname] = entry[index];
      });
      rows.push(row);
    } else if (entry && typeof entry === 'object') {
      rows.push(entry as QueryReportRow);
    }
  }
  return rows;
}

/** Truthy check/flag coercion (accepts 1, "1", true — the wire variants). */
function coerceFlag(raw: unknown): 0 | 1 {
  return raw === 1 || raw === '1' || raw === true ? 1 : 0;
}

/**
 * One filter declaration record (a Report Filter doc row or a script-object
 * extraction) → normalized meta. Script modules spell mandatory as `required`
 * and may declare numeric/boolean defaults.
 */
function coerceFilterMetaEntry(row: Record<string, unknown>): QueryReportFilterMeta | undefined {
  const fieldname =
    typeof row.fieldname === 'string' && row.fieldname
      ? row.fieldname
      : typeof row.label === 'string' && row.label
        ? scrubFieldname(row.label)
        : '';
  if (!fieldname) {
    return undefined;
  }
  let defaultValue: string | number | undefined;
  if (typeof row.default === 'string' && row.default !== '') {
    defaultValue = row.default;
  } else if (typeof row.default === 'number') {
    defaultValue = row.default;
  } else if (typeof row.default === 'boolean') {
    defaultValue = row.default ? 1 : 0;
  }
  return {
    fieldname,
    label: typeof row.label === 'string' ? row.label : undefined,
    fieldtype: typeof row.fieldtype === 'string' ? row.fieldtype : undefined,
    options:
      typeof row.options === 'string'
        ? row.options
        : Array.isArray(row.options) && row.options.every((entry) => typeof entry === 'string')
          ? row.options.join('\n')
          : undefined,
    default: defaultValue,
    mandatory: coerceFlag(row.mandatory) || coerceFlag(row.required) ? 1 : 0,
    wildcard_filter: coerceFlag(row.wildcard_filter),
    hidden: coerceFlag(row.hidden),
    read_only: coerceFlag(row.read_only) || coerceFlag(row.readOnly) ? 1 : 0,
  };
}

export function normalizeFilterMeta(raw: unknown): QueryReportFilterMeta[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const filters: QueryReportFilterMeta[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const meta = coerceFilterMetaEntry(entry as Record<string, unknown>);
    if (meta) {
      filters.push(meta);
    }
  }
  return filters;
}

export function isEmptyFilterValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Drop empty values so a cleared control never reaches the server. */
export function compactFilterValues(values: QueryReportFilters | undefined): QueryReportFilters {
  const out: QueryReportFilters = {};
  for (const [fieldname, value] of Object.entries(values ?? {})) {
    if (!isEmptyFilterValue(value)) {
      out[fieldname] = value;
    }
  }
  return out;
}

/** A run response → the columns, rows and message a report table renders. */
export function normalizeQueryReportPayload(raw: QueryReportRunMessage): QueryReportPayload {
  const columns = normalizeQueryReportColumns(raw.columns);
  const rows = normalizeQueryReportRows(raw.result, columns);
  const message = Array.isArray(raw.message) ? raw.message.filter(Boolean).join(' ') : (raw.message ?? undefined);
  return {
    columns,
    rows,
    message: message ?? undefined,
    addTotalRow: Boolean(raw.add_total_row) && !raw.skip_total_row,
    filters: raw.filters,
    raw,
  };
}

/**
 * Draft/applied values → the dict that round-trips through `?filters=` and
 * `query_report.run`. Empty values drop; hidden filters keep their values
 * so a clear-all on the visible bar does not strip seeded hidden defaults.
 */
export function compactQueryReportFilters(
  filterMeta: readonly QueryReportFilterMeta[],
  values: QueryReportFilters,
): QueryReportFilters {
  const declared: QueryReportFilters = {};
  for (const filter of filterMeta) {
    declared[filter.fieldname] = values[filter.fieldname];
  }
  return compactFilterValues(declared);
}

/** Seedable default values ("" defaults are non-values, desk parity). */
export function defaultFilterValues(filterMeta: readonly QueryReportFilterMeta[]): QueryReportFilters {
  const defaults: QueryReportFilters = {};
  for (const filter of filterMeta) {
    if (filter.default !== undefined && filter.default !== '') {
      defaults[filter.fieldname] = filter.default;
    }
  }
  return defaults;
}

/**
 * Filter values → the `filters` dict for frappe.desk.query_report.run.
 * Desk parity (query_report.js get_filter_values): falsy values are OMITTED
 * (an unchecked Check or empty input sends nothing), `wildcard_filter`
 * values wrap in `%…%` unless the user typed their own wildcard, and
 * numeric fieldtypes send numbers (script reports do arithmetic on them).
 */
export function buildRunFilters(
  filterMeta: readonly QueryReportFilterMeta[],
  filters: QueryReportFilters,
): QueryReportFilters {
  const metaByField = new Map(filterMeta.map((filter) => [filter.fieldname, filter]));
  const out: QueryReportFilters = {};
  for (const [fieldname, rawValue] of Object.entries(filters)) {
    let value: unknown = rawValue === true ? 1 : rawValue;
    if (isEmptyFilterValue(value) || value === false || value === 0) {
      continue;
    }
    const meta = metaByField.get(fieldname);
    if (meta?.wildcard_filter === 1 && typeof value === 'string' && !value.includes('%')) {
      value = `%${value}%`;
    }
    if (
      meta?.fieldtype !== undefined &&
      NUMERIC_FILTER_FIELDTYPES.has(meta.fieldtype) &&
      typeof value === 'string' &&
      value.trim() !== '' &&
      Number.isFinite(Number(value))
    ) {
      value = Number(value);
    }
    out[fieldname] = value;
  }
  return out;
}

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

const NUMERIC_FILTER_FIELDTYPES = new Set(['Int', 'Float', 'Currency', 'Percent']);

/** Index AFTER the string literal opening at `start` (escape-aware). */
function scanStringEnd(text: string, start: number): number {
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
}

/** Index after a line or block comment opening at `start` (start+1 for a bare slash). */
function scanCommentEnd(text: string, start: number): number {
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
}

/** Matching close-bracket index for the opener at `open` (-1 when unbalanced). */
function matchBracket(text: string, open: number): number {
  const openCh = text[open];
  const closeCh = openCh === '[' ? ']' : openCh === '{' ? '}' : openCh === '(' ? ')' : '';
  if (!closeCh) {
    return -1;
  }
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const ch = text[index];
    if (ch === "'" || ch === '"' || ch === '`') {
      index = scanStringEnd(text, index);
      continue;
    }
    if (ch === '/') {
      index = scanCommentEnd(text, index);
      continue;
    }
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
  return -1;
}

/** Unescape the common sequences inside a scanned string literal body. */
function unescapeStringBody(body: string): string {
  return body.replaceAll(/\\(.)/g, (_, ch: string) => (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '\r' : ch));
}

/**
 * Interpret one raw value slice from a script object literal. Returns
 * undefined for anything non-declarative (functions, frappe.* expressions,
 * template strings with interpolations, ternaries…).
 */
function interpretScriptValue(raw: string): string | number | boolean | string[] | undefined {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  const first = value[0];
  if (first === "'" || first === '"' || first === '`') {
    const end = scanStringEnd(value, 0);
    if (end !== value.length) {
      return undefined;
    }
    const body = value.slice(1, -1);
    if (first === '`' && body.includes('${')) {
      return undefined;
    }
    return unescapeStringBody(body);
  }
  if (/^__\s*\(/.test(value)) {
    // Translation call — the first string argument is the label.
    const parenIndex = value.indexOf('(');
    const rest = value.slice(parenIndex + 1).trim();
    const quote = rest[0];
    if (quote !== "'" && quote !== '"' && quote !== '`') {
      return undefined;
    }
    const quoteIndex = value.indexOf(quote, parenIndex);
    const end = scanStringEnd(value, quoteIndex);
    return unescapeStringBody(value.slice(quoteIndex + 1, end - 1));
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (first === '[') {
    const close = matchBracket(value, 0);
    if (close !== value.length - 1) {
      return undefined;
    }
    const entries: string[] = [];
    let index = 1;
    while (index < close) {
      const ch = value[index];
      if (ch === "'" || ch === '"' || ch === '`') {
        const end = scanStringEnd(value, index);
        const body = value.slice(index + 1, end - 1);
        if (ch === '`' && body.includes('${')) {
          return undefined;
        }
        entries.push(unescapeStringBody(body));
        index = end;
        continue;
      }
      if (ch === '/' && (value[index + 1] === '/' || value[index + 1] === '*')) {
        index = scanCommentEnd(value, index);
        continue;
      }
      if (ch === ',' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        index += 1;
        continue;
      }
      return undefined; // non-string entry (objects, expressions) — not declarative
    }
    return entries;
  }
  return undefined;
}

/** Parse one `{…}` object literal into declarative key/value pairs. */
function parseScriptObject(source: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  let index = 1; // past the opening brace
  const end = source.length - 1; // before the closing brace
  while (index < end) {
    const ch = source[index];
    if (ch === '/' && (source[index + 1] === '/' || source[index + 1] === '*')) {
      index = scanCommentEnd(source, index);
      continue;
    }
    if (/\s|,/.test(ch)) {
      index += 1;
      continue;
    }
    // Key: identifier or quoted string.
    let key = '';
    if (ch === "'" || ch === '"') {
      const keyEnd = scanStringEnd(source, index);
      key = source.slice(index + 1, keyEnd - 1);
      index = keyEnd;
    } else {
      const keyMatch = /^[A-Za-z_$][\w$]*/.exec(source.slice(index, index + 64));
      if (!keyMatch) {
        break;
      } // not an object key — bail out of this entry
      key = keyMatch[0];
      index += key.length;
    }
    while (index < end && /\s/.test(source[index])) {
      index += 1;
    }
    if (source[index] !== ':') {
      break;
    } // shorthand/method — not declarative
    index += 1;
    // Value: scan to the next top-level comma, collecting comment-free text.
    let valueRaw = '';
    while (index < end) {
      const valueCh = source[index];
      if (valueCh === "'" || valueCh === '"' || valueCh === '`') {
        const stringEnd = scanStringEnd(source, index);
        valueRaw += source.slice(index, stringEnd);
        index = stringEnd;
        continue;
      }
      if (valueCh === '/' && (source[index + 1] === '/' || source[index + 1] === '*')) {
        index = scanCommentEnd(source, index);
        continue;
      }
      if (valueCh === '{' || valueCh === '[' || valueCh === '(') {
        const close = matchBracket(source, index);
        if (close === -1) {
          return record;
        } // unbalanced — stop parsing
        valueRaw += source.slice(index, close + 1);
        index = close + 1;
        continue;
      }
      if (valueCh === ',') {
        index += 1;
        break;
      }
      valueRaw += valueCh;
      index += 1;
    }
    const interpreted = interpretScriptValue(valueRaw);
    if (interpreted !== undefined) {
      record[key] = interpreted;
    }
  }
  return record;
}

/**
 * Extract the declarative filter subset from a desk report script module.
 * Never throws; anything unparseable degrades to a smaller `filters` list
 * (the `declaredCount` delta is the honest gap).
 */
export function extractScriptFilters(script: string | undefined): ScriptFilterExtraction {
  if (!script) {
    return EMPTY_EXTRACTION;
  }
  const keyMatch = /\bfilters\s*:\s*\[/.exec(script);
  if (!keyMatch || keyMatch.index === undefined) {
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
      const record = parseScriptObject(script.slice(index, close + 1));
      const meta = coerceFilterMetaEntry(record);
      const fieldtype = meta?.fieldtype ?? 'Data';
      const needsOptions = fieldtype === 'Select' || fieldtype === 'Link';
      if (meta && RENDERABLE_FILTER_FIELDTYPES.has(fieldtype) && (!needsOptions || (meta.options ?? '') !== '')) {
        filters.push({ ...meta, fieldtype });
      }
      index = close + 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      index = scanStringEnd(script, index);
      continue;
    }
    if (ch === '/' && (script[index + 1] === '/' || script[index + 1] === '*')) {
      index = scanCommentEnd(script, index);
      continue;
    }
    index += 1;
  }
  return { declared: true, declaredCount, filters };
}

/** `_server_messages` as one line per message, block and `<br>` (MPO-473). */
function decodeServerMessages(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.startsWith('[')) {
    return undefined;
  }
  const lines = readServerMessages(raw);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * A failed report call → an Error whose message is the server's own sentence.
 * The HTTP `status` and frappe `exc_type` ride along, so a caller can still
 * tell a refused run (403 / PermissionError) from a broken one.
 */
export function humanizeFrappeError(err: unknown): Error {
  if (err instanceof Error) {
    const source = err as Error & { data?: unknown; status?: unknown; exc_type?: unknown };
    const data = source.data as Record<string, unknown> | undefined;
    const decoded = decodeServerMessages(data?._server_messages) ?? decodeServerMessages(err.message);
    if (!decoded) {
      return err;
    }
    const humanized = new Error(decoded) as Error & Record<string, unknown>;
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
    if (err.stack) {
      humanized.stack = err.stack;
    }
    return humanized;
  }
  return new Error(String(err));
}

// ── FrappeReportView's names for the same model ────────────────
// FrappeReportView shipped these names before the model was one. They stay
// on the barrel as aliases so existing imports keep compiling; none of them
// is a second implementation.

export type FrappeReportColumn = QueryReportColumn;
export type FrappeReportRow = QueryReportRow;
export type FrappeReportValues = QueryReportFilters;
export type FrappeReportFilterDef = QueryReportFilterInput;
export type FrappeReportRunResponse = QueryReportRunMessage;
export type FrappeReportPayload = QueryReportPayload;

export const normalizeReportPayload = normalizeQueryReportPayload;

/** One column, dict or `"Label:Fieldtype/Options:Width"`, in its normalized shape. */
export function normalizeReportColumn(column: unknown): QueryReportColumn {
  return (
    normalizeQueryReportColumns([column])[0] ?? {
      fieldname: 'col_0',
      label: 'col_0',
      fieldtype: '',
    }
  );
}

/** `normalizeQueryReportRows` with FrappeReportView's argument order. */
export function normalizeReportRows(
  columns: readonly QueryReportColumn[],
  result: readonly unknown[] | undefined,
): QueryReportRow[] {
  return normalizeQueryReportRows(result, columns);
}

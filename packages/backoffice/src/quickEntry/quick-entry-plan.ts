/**
 * Quick-entry planning — desk parity with
 * frappe/public/js/frappe/form/quick_entry.js:
 *
 * - Field selection unions `required`, `bold`, and `allow_in_quick_entry` fields
 *   (excluding read-only / hidden / virtual / layout breaks). The union
 *   matters: a doctype whose quick-entry-flagged fields don't cover its
 *   mandatory fields (the stock to-do doctype: `date` is flagged, `description` is only
 *   required) would otherwise always fail server-side validation.
 * - Quick entry applies only when `meta.quick_entry == 1`, at least one
 *   usable field exists, and no selected field is a child `Table` —
 *   otherwise the desk routes straight to the full form.
 * - Prompt-named doctypes (`autoname: "Prompt"`) prepend a required name
 *   field (rendered as the synthetic `__newname` Data field).
 */

import type { FieldSchema, FormSchema } from '@repo/frappe-ui';
import { formatCalendarDate } from '@repo/theme';

import type { DocFieldMeta, DoctypeMeta } from '../shared/use-doctype-meta';

const LAYOUT_FIELDTYPES = new Set(['Section Break', 'Column Break', 'Tab Break', 'Fold']);
/** Fieldtypes whose string meta `default` coerces to a number (incl. Check 0/1). */
const NUMERIC_FIELDTYPES = new Set(['Int', 'Float', 'Currency', 'Percent', 'Check', 'Rating']);

/** Synthetic fieldname for the prompt-autoname input (maps to `name` on insert). */
export const PROMPT_NAME_FIELD = '__newname';

/** Form draft keyed by fieldname — mirrors SchemaForm's open `doc` field bag. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- SchemaForm's doc is an open field bag; values are whatever each field control emits
export type QuickEntryDraft = Record<string, unknown>;

export type QuickEntryPlan =
  | { kind: 'fields'; fields: DocFieldMeta[]; promptName: boolean }
  | { kind: 'full-form'; reason: 'quick-entry-disabled' | 'no-fields' | 'child-table' };

/** Decide whether a doctype quick-enters or defers to the full form. */
export const planQuickEntry = (meta: DoctypeMeta): QuickEntryPlan => {
  if (meta.quick_entry !== 1) {
    return { kind: 'full-form', reason: 'quick-entry-disabled' };
  }
  const fields = meta.fields.filter((field) => {
    const flagged = field.required === 1 || field.bold === 1 || field.allow_in_quick_entry === 1;
    const editable = field.hidden !== 1 && field.read_only !== 1;
    // SAFETY: `is_virtual` is a live DocField key the DocTypeField type omits; it is a 0/1 flag when present.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const virtual = (field as { is_virtual?: 0 | 1 }).is_virtual === 1;
    return flagged && editable && !virtual && !LAYOUT_FIELDTYPES.has(field.fieldtype);
  });
  if (fields.length === 0) {
    return { kind: 'full-form', reason: 'no-fields' };
  }
  if (fields.some((field) => field.fieldtype === 'Table')) {
    return { kind: 'full-form', reason: 'child-table' };
  }
  return {
    kind: 'fields',
    fields,
    promptName: (meta.autoname ?? '').toLowerCase() === 'prompt',
  };
};

const todayISO = () => formatCalendarDate(new Date());

/**
 * Seed a draft from simple meta field defaults ("Today" for Date/Datetime,
 * numeric coercion for numeric/Check types, literal strings). Session /
 * server-resolved tokens (`__user`, `:field`, `frappe.*`) are skipped — the
 * server fills those on insert.
 */
/** One field's draft seed from its meta default; undefined leaves it unset. */
const metaDefaultValue = (field: DocFieldMeta): string | number | undefined => {
  const raw = field.default;
  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- meta is typed `string` but loose payloads carry pre-coerced values
  if (typeof raw !== 'string') {
    // Loose meta payloads may carry pre-coerced numbers/booleans — use as-is.
    return raw;
  }
  if (raw === 'Today' && (field.fieldtype === 'Date' || field.fieldtype === 'Datetime')) {
    return todayISO();
  }
  if (raw === '__user' || raw.startsWith(':') || raw.startsWith('frappe.')) {
    return undefined;
  }
  return NUMERIC_FIELDTYPES.has(field.fieldtype) ? Number(raw) || 0 : raw;
};

export const buildQuickEntryDefaults = (fields: DocFieldMeta[], extra?: QuickEntryDraft): QuickEntryDraft => {
  const draft: QuickEntryDraft = {};
  for (const field of fields) {
    const value = metaDefaultValue(field);
    if (value !== undefined) {
      draft[field.fieldname] = value;
    }
  }
  return extra ? { ...draft, ...extra } : draft;
};

const fieldToSchema = (field: DocFieldMeta): FieldSchema => {
  const hasPrecision = field.precision !== null && field.precision !== undefined && field.precision !== '';
  return {
    type: field.fieldtype,
    name: field.fieldname,
    label: field.label,
    options: field.options,
    description: field.description,
    required: field.required === 1,
    readOnly: field.read_only === 1,
    precision: hasPrecision ? Number(field.precision) || undefined : undefined,
    depends_on: field.depends_on,
    fieldtype: field.fieldtype,
    fieldname: field.fieldname,
  };
};

/** Single-section, single-column compact schema for the mini-form. */
export const buildQuickEntrySchema = (fields: DocFieldMeta[]): FormSchema => {
  const schemaFields = fields.map(fieldToSchema);
  return { sections: [{ columns: [{ fields: schemaFields }] }], fields: schemaFields };
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- draft values are whatever each field control emits
export const isEmptyFieldValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return true;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- draft values are untyped control output; typeof is the discriminant
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Server response / error parsing (defensive — probed against a live bench)
// ---------------------------------------------------------------------------

/** Raw JSON object read at the HTTP response boundary. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- raw server JSON; each key is probed and narrowed below
type JsonRecord = Record<string, unknown>;

const isJsonRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null;

/** A non-empty string at `key`, else undefined. */
const readString = (record: JsonRecord, key: string): string | undefined => {
  const value = record[key];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- raw server JSON; typeof is the read boundary
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/**
 * Created-doc name from an insert response. `live.live.api.create_doc`
 * wraps the doc in `{message: {...}}` (whitelisted-method envelope); fixture
 * providers return the doc directly. Handles both.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- raw insert response; parsed here at the I/O boundary
export const resolveCreatedName = (payload: unknown): string => {
  if (!isJsonRecord(payload)) {
    return '';
  }
  const ownName = readString(payload, 'name');
  if (ownName !== undefined) {
    return ownName;
  }
  const { message } = payload;
  return isJsonRecord(message) ? (readString(message, 'name') ?? '') : '';
};

export interface ParsedServerError {
  /** Human-readable message for the general slot (never a traceback). */
  general?: string;
  /** Fieldnames the server reported missing (MandatoryError). */
  missingFields: string[];
}

const TRACEBACK_PATTERN = /Traceback/iu;
/** Longer `err.message` strings are raw dumps, not user-facing text. */
const MAX_SURFACED_MESSAGE_LENGTH = 300;

/** FrappeError carries the JSON error body in `.data`; plain errors don't. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- caught errors are untyped; parsed here at the I/O boundary
const errorPayload = (err: unknown): JsonRecord => {
  if (!isJsonRecord(err)) {
    return {};
  }
  return isJsonRecord(err.data) ? err.data : err;
};

const stripHtml = (text: string): string =>
  // oxlint-disable-next-line sonarjs/super-linear-regex -- strips tags from short server messages; `<a<b>` must still drop as one tag
  text.replaceAll(/<[^>]*>/gu, '').trim();

/** "[DocType, name]: a, b" → ['a', 'b']; [] when the delimiter is absent. */
const parseMissingFields = (exception: string): string[] => {
  // lastIndexOf miss (-1) + 2 would otherwise slice garbage from index 1.
  const delim = exception.lastIndexOf(']:');
  if (delim === -1) {
    return [];
  }
  return exception
    .slice(delim + 2)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

/** One `_server_messages` entry: a JSON-encoded `{message}`, or plain text. */
const serverMessageText = (entry: string): string => {
  try {
    const parsed: unknown = JSON.parse(entry);
    const message = isJsonRecord(parsed) ? parsed.message : undefined;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- raw server JSON; typeof is the read boundary
    return typeof message === 'string' ? message : entry;
  } catch {
    // Safe to continue: a non-JSON entry is already the plain message text.
    return entry;
  }
};

/** `_server_messages` is a JSON array of JSON-encoded `{message}` strings. */
const parseServerMessages = (raw: string): string[] => {
  const texts: string[] = [];
  try {
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) {
      return texts;
    }
    for (const entry of entries) {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- raw server JSON; non-string entries carry no message
      const text = typeof entry === 'string' ? stripHtml(serverMessageText(entry)) : '';
      if (text !== '') {
        texts.push(text);
      }
    }
  } catch {
    // Safe to continue: a malformed envelope falls through to the exception string.
  }
  return texts;
};

/**
 * Parse a frappe error response into an honest message. Probed shapes:
 * - `frappe.throw` → `_server_messages`: JSON array of JSON strings with a
 *   `message` key (+ `exc_type`, `exception`).
 * - Direct exceptions (MandatoryError) → `exc_type` + `exception`
 *   ("frappe.exceptions.MandatoryError: [Task, xxx]: field_a, field_b"),
 *   no `_server_messages`.
 * - `err.message` can be a raw traceback (`payload.exc` fallback in the
 *   HTTP client) — never surfaced to the user.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- caught errors are untyped; parsed here at the I/O boundary
export const parseServerError = (err: unknown, fallback: string): ParsedServerError => {
  const payload = errorPayload(err);
  const exception = readString(payload, 'exception');

  if (readString(payload, 'exc_type') === 'MandatoryError' && exception !== undefined) {
    const missingFields = parseMissingFields(exception);
    if (missingFields.length > 0) {
      return { missingFields };
    }
  }

  const rawMessages = readString(payload, '_server_messages');
  const texts = rawMessages === undefined ? [] : parseServerMessages(rawMessages);
  if (texts.length > 0) {
    return { general: texts.join('\n'), missingFields: [] };
  }

  if (exception !== undefined) {
    // "frappe.exceptions.ValidationError: human text" → keep the human part.
    const colon = exception.indexOf(': ');
    const human = colon === -1 ? exception : exception.slice(colon + 2);
    if (human !== '') {
      return { general: stripHtml(human), missingFields: [] };
    }
  }

  const message = isJsonRecord(err) ? readString(err, 'message') : undefined;
  if (message !== undefined && message.length <= MAX_SURFACED_MESSAGE_LENGTH && !TRACEBACK_PATTERN.test(message)) {
    return { general: stripHtml(message), missingFields: [] };
  }
  return { general: fallback, missingFields: [] };
};

/**
 * Quick-entry planning — desk parity with
 * frappe/public/js/frappe/form/quick_entry.js:
 *
 * - Field selection unions `required`, `bold`, and `allow_in_quick_entry` fields
 *   (excluding read-only / hidden / virtual / layout breaks). The union
 *   matters: a doctype whose quick-entry-flagged fields don't cover its
 *   mandatory fields (stock ToDo: `date` is flagged, `description` is only
 *   required) would otherwise always fail server-side validation.
 * - Quick entry applies only when `meta.quick_entry == 1`, at least one
 *   usable field exists, and no selected field is a child `Table` —
 *   otherwise the desk routes straight to the full form.
 * - Prompt-named doctypes (`autoname: "Prompt"`) prepend a required name
 *   field (rendered as the synthetic `__newname` Data field).
 */

import type { FieldSchema, FormSchema } from '@repo/frappe-ui';
import { formatCalendarDate } from '@repo/theme';

import type { DocFieldMeta, DoctypeMeta } from '../shared/useDoctypeMeta';

const LAYOUT_FIELDTYPES = new Set(['Section Break', 'Column Break', 'Tab Break', 'Fold']);
/** Fieldtypes whose string meta `default` coerces to a number (incl. Check 0/1). */
const NUMERIC_FIELDTYPES = new Set(['Int', 'Float', 'Currency', 'Percent', 'Check', 'Rating']);

/** Synthetic fieldname for the prompt-autoname input (maps to `name` on insert). */
export const PROMPT_NAME_FIELD = '__newname';

export type QuickEntryPlan =
  | { kind: 'fields'; fields: DocFieldMeta[]; promptName: boolean }
  | { kind: 'full-form'; reason: 'quick-entry-disabled' | 'no-fields' | 'child-table' };

/** Decide whether a doctype quick-enters or defers to the full form. */
export function planQuickEntry(meta: DoctypeMeta): QuickEntryPlan {
  if (meta.quick_entry !== 1) {
    return { kind: 'full-form', reason: 'quick-entry-disabled' };
  }
  const fields = meta.fields.filter(
    (field) =>
      (field.required || field.bold || field.allow_in_quick_entry) &&
      !field.hidden &&
      !field.read_only &&
      !(field as { is_virtual?: 0 | 1 }).is_virtual &&
      !LAYOUT_FIELDTYPES.has(field.fieldtype),
  );
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
}

const todayISO = () => formatCalendarDate(new Date());

/**
 * Seed a draft from simple meta field defaults ("Today" for Date/Datetime,
 * numeric coercion for numeric/Check types, literal strings). Session /
 * server-resolved tokens (`__user`, `:field`, `frappe.*`) are skipped — the
 * server fills those on insert.
 */
export function buildQuickEntryDefaults(
  fields: DocFieldMeta[],
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = field.default;
    if (raw === null || raw === undefined || raw === '') {
      continue;
    }
    if (typeof raw !== 'string') {
      // Loose meta payloads may carry pre-coerced numbers/booleans — use as-is.
      draft[field.fieldname] = raw;
      continue;
    }
    if (raw === 'Today' && (field.fieldtype === 'Date' || field.fieldtype === 'Datetime')) {
      draft[field.fieldname] = todayISO();
      continue;
    }
    if (raw === '__user' || raw.startsWith(':') || raw.startsWith('frappe.')) {
      continue;
    }
    draft[field.fieldname] = NUMERIC_FIELDTYPES.has(field.fieldtype) ? Number(raw) || 0 : raw;
  }
  return extra ? { ...draft, ...extra } : draft;
}

function fieldToSchema(field: DocFieldMeta): FieldSchema {
  return {
    type: field.fieldtype,
    name: field.fieldname,
    label: field.label,
    options: field.options,
    description: field.description,
    required: !!field.required,
    readOnly: !!field.read_only,
    precision:
      field.precision !== null && field.precision !== undefined && field.precision !== ''
        ? Number(field.precision) || undefined
        : undefined,
    depends_on: field.depends_on,
    fieldtype: field.fieldtype,
    fieldname: field.fieldname,
  };
}

/** Single-section, single-column compact schema for the mini-form. */
export function buildQuickEntrySchema(fields: DocFieldMeta[]): FormSchema {
  const schemaFields = fields.map(fieldToSchema);
  return { sections: [{ columns: [{ fields: schemaFields }] }], fields: schemaFields };
}

export function isEmptyFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Server response / error parsing (defensive — probed against a live bench)
// ---------------------------------------------------------------------------

/**
 * Created-doc name from an insert response. `live.live.api.create_doc`
 * wraps the doc in `{message: {...}}` (whitelisted-method envelope); fixture
 * providers return the doc directly. Handles both.
 */
export function resolveCreatedName(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.name === 'string' && record.name) {
    return record.name;
  }
  if (record.message && typeof record.message === 'object') {
    const { name } = record.message as Record<string, unknown>;
    if (typeof name === 'string' && name) {
      return name;
    }
  }
  return '';
}

export interface ParsedServerError {
  /** Human-readable message for the general slot (never a traceback). */
  general?: string;
  /** Fieldnames the server reported missing (MandatoryError). */
  missingFields: string[];
}

/** FrappeError carries the JSON error body in `.data`; plain errors don't. */
function errorPayload(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== 'object') {
    return {};
  }
  const { data } = err as { data?: unknown };
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return err as Record<string, unknown>;
}

function stripHtml(text: string): string {
  return text.replaceAll(/<[^>]*>/g, '').trim();
}

/**
 * Parse a frappe error response into an honest message. Probed shapes:
 * - `frappe.throw` → `_server_messages`: JSON array of JSON strings with a
 *   `message` key (+ `exc_type`, `exception`).
 * - Direct exceptions (MandatoryError) → `exc_type` + `exception`
 *   ("frappe.exceptions.MandatoryError: [ToDo, xxx]: field_a, field_b"),
 *   no `_server_messages`.
 * - `err.message` can be a raw traceback (`payload.exc` fallback in the
 *   HTTP client) — never surfaced to the user.
 */
export function parseServerError(err: unknown, fallback: string): ParsedServerError {
  const payload = errorPayload(err);
  const excType = typeof payload.exc_type === 'string' ? payload.exc_type : undefined;
  const exception = typeof payload.exception === 'string' ? payload.exception : undefined;

  if (excType === 'MandatoryError' && exception) {
    // Only extract fields when the "[DocType, name]: a, b" delimiter is present;
    // lastIndexOf miss (-1) + 2 would otherwise slice garbage from index 1.
    const delim = exception.lastIndexOf(']:');
    if (delim !== -1) {
      const tail = exception.slice(delim + 2);
      const missingFields = tail
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      if (missingFields.length > 0) {
        return { missingFields };
      }
    }
  }

  const rawMessages = payload._server_messages;
  if (typeof rawMessages === 'string' && rawMessages) {
    try {
      const entries = JSON.parse(rawMessages) as unknown[];
      const texts = entries
        .map((entry) => {
          if (typeof entry !== 'string') {
            return '';
          }
          try {
            const parsed = JSON.parse(entry) as { message?: unknown };
            return typeof parsed.message === 'string' ? parsed.message : entry;
          } catch {
            return entry;
          }
        })
        .map(stripHtml)
        .filter(Boolean);
      if (texts.length > 0) {
        return { general: texts.join('\n'), missingFields: [] };
      }
    } catch {
      // fall through to the exception string
    }
  }

  if (exception) {
    // "frappe.exceptions.ValidationError: human text" → keep the human part.
    const colon = exception.indexOf(': ');
    const human = colon === -1 ? exception : exception.slice(colon + 2);
    if (human) {
      return { general: stripHtml(human), missingFields: [] };
    }
  }

  const message = (err as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string' && message && !/Traceback/i.test(message) && message.length <= 300) {
    return { general: stripHtml(message), missingFields: [] };
  }
  return { general: fallback, missingFields: [] };
}

// Field-detection helpers shared by the alternate views, riding the
// sanctioned backoffice meta loader (shared/useDoctypeMeta: getdoctype RPC,
// module-wide cache, fixture branch for stories) — every backoffice surface
// shares one meta fetch per doctype per session.
import { useDoctypeMeta } from '../shared/useDoctypeMeta';
import type { DocFieldMeta, DoctypeMeta } from '../shared/useDoctypeMeta';

export function useViewMeta(doctype: string): {
  meta: DoctypeMeta | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { meta, loading, error, reload } = useDoctypeMeta(doctype);
  return { meta, isLoading: loading, error: error ?? null, refetch: reload };
}

const DATE_FIELD_TYPES = new Set(['Date', 'Datetime']);

function isDateField(field: DocFieldMeta): boolean {
  return DATE_FIELD_TYPES.has(field.fieldtype) && !field.hidden;
}

/**
 * Desk calendar-view conventions: known start/end fieldname pairs, checked
 * in order. Mirrors the common `calendar_settings` shapes stock doctypes use.
 */
const DATE_PAIR_CONVENTIONS: readonly (readonly [string, string])[] = [
  ['starts_on', 'ends_on'],
  ['start_date', 'end_date'],
  ['from_date', 'to_date'],
  ['start_datetime', 'end_datetime'],
  ['start', 'end'],
];

export interface DetectedDateFields {
  dateField?: string;
  endDateField?: string;
}

/**
 * Pick the calendar date field(s) for a doctype: an explicit override wins
 * (when it names a real Date/Datetime field), then the desk start/end pair
 * conventions, then the first visible Date/Datetime field.
 */
export function detectDateFields(meta: DoctypeMeta, override?: string): DetectedDateFields {
  const dateFields = new Map(meta.fields.filter(isDateField).map((f) => [f.fieldname, f]));
  if (override && dateFields.has(override)) {
    const pair = DATE_PAIR_CONVENTIONS.find(([start]) => start === override);
    return {
      dateField: override,
      endDateField: pair && dateFields.has(pair[1]) ? pair[1] : undefined,
    };
  }
  for (const [start, end] of DATE_PAIR_CONVENTIONS) {
    if (dateFields.has(start)) {
      return { dateField: start, endDateField: dateFields.has(end) ? end : undefined };
    }
  }
  const first = meta.fields.find(isDateField);
  return first ? { dateField: first.fieldname } : {};
}

/** First visible Select field with options — desk's kanban fallback axis. */
export function detectSelectField(meta: DoctypeMeta): DocFieldMeta | undefined {
  return meta.fields.find((f) => f.fieldtype === 'Select' && !f.hidden && (f.options ?? '').trim().length > 0);
}

export function selectFieldOptions(field: DocFieldMeta): string[] {
  return (field.options ?? '')
    .split('\n')
    .map((option) => option.trim())
    .filter(Boolean);
}

/** meta.image_field, else the first visible Attach Image field. */
export function detectImageField(meta: DoctypeMeta): string | undefined {
  if (meta.image_field) {
    return meta.image_field;
  }
  return meta.fields.find((f) => f.fieldtype === 'Attach Image' && !f.hidden)?.fieldname;
}

const LAYOUT_FIELD_TYPES = new Set(['Section Break', 'Column Break', 'Tab Break']);

export interface DetectedCardFields {
  titleField: string;
  /** Up to `max` extra in_list_view fields for the card body. */
  extraFields: string[];
}

/**
 * Card anatomy for kanban/image cards: the doctype's title field plus a
 * couple of `in_list_view` fields (excluding the title and the kanban
 * status axis).
 */
export function detectCardFields(
  meta: DoctypeMeta,
  excludeFields: readonly string[] = [],
  max = 2,
): DetectedCardFields {
  const titleField = meta.title_field ?? 'name';
  const exclude = new Set([titleField, 'name', ...excludeFields]);
  const extraFields = meta.fields
    .filter((f) => f.in_list_view && !f.hidden && !LAYOUT_FIELD_TYPES.has(f.fieldtype) && !exclude.has(f.fieldname))
    .slice(0, max)
    .map((f) => f.fieldname);
  return { titleField, extraFields };
}

/** Loose doc shape for the generic frappe-ui view wrappers. */
export type AnyDoc = { name: string; doctype: string } & Record<string, unknown>;

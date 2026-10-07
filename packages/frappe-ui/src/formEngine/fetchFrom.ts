/**
 * fetch_from client-side preview — desk parity with
 * frappe/public/js/frappe/form/script_manager.js (`setup_add_fetch`) and
 * controls/link.js (`validate_link_and_fetch`):
 *
 * - A field participates when `fetch_from` is "<link_field>.<source_field>"
 *   AND (its fieldtype is in the scalar set desk registers, or it is
 *   read_only / is_virtual).
 * - When the link field changes to a value, desk calls
 *   `frappe.client.validate_link` with the source columns and writes the
 *   returned values onto the targets; clearing the link clears the targets.
 * - `fetch_if_empty` targets keep a non-empty existing value (server
 *   semantics; desk leaves such fields editable — see
 *   `read_only_because_of_fetch_from`, base_input.js:56-66).
 *
 * The server remains authoritative: this is a preview so the user sees the
 * fetched values before save.
 */

import type { DocFieldMeta } from './doctypeMeta';

/** Fieldtypes desk registers for client-side fetch (script_manager.js:196-215). */
const FETCHABLE_FIELDTYPES = new Set([
  'Data',
  'Read Only',
  'Text',
  'Small Text',
  'Currency',
  'Check',
  'Text Editor',
  'Attach Image',
  'Code',
  'Link',
  'Float',
  'Int',
  'Date',
  'Datetime',
  'Select',
  'Duration',
  'Time',
]);

export interface FetchRule {
  /** Field to populate. */
  target: string;
  /** Column on the linked doc to read. */
  source: string;
  /** Only fill when the target is currently empty; never lock the field. */
  fetchIfEmpty: boolean;
}

/** Map of link fieldname → fetch rules hanging off that link. */
export type FetchMap = Map<string, FetchRule[]>;

export function buildFetchMap(fields: DocFieldMeta[]): FetchMap {
  const map: FetchMap = new Map();
  for (const field of fields) {
    const fetchFrom = typeof field.fetch_from === 'string' ? field.fetch_from : '';
    if (!fetchFrom || !fetchFrom.includes('.')) {
      continue;
    }
    const eligible =
      FETCHABLE_FIELDTYPES.has(field.fieldtype) || !!field.read_only || !!(field as { is_virtual?: 0 | 1 }).is_virtual;
    if (!eligible) {
      continue;
    }
    const [linkField, ...rest] = fetchFrom.split('.');
    const source = rest.join('.');
    if (!linkField || !source) {
      continue;
    }
    const rules = map.get(linkField) ?? [];
    rules.push({
      target: field.fieldname,
      source,
      fetchIfEmpty: !!field.fetch_if_empty,
    });
    map.set(linkField, rules);
  }
  return map;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Values to patch onto the doc after the linked doc's columns arrive.
 * `fetched` is empty when the link was cleared — desk then blanks the
 * targets; `fetch_if_empty` targets holding a value are left alone in both
 * directions (they belong to the user until the server reconciles).
 */
export function applyFetchedValues(
  rules: FetchRule[],
  fetched: Record<string, unknown>,
  currentDoc: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const rule of rules) {
    if (rule.fetchIfEmpty && !isEmpty(currentDoc[rule.target])) {
      continue;
    }
    patch[rule.target] = fetched[rule.source] ?? '';
  }
  return patch;
}

/**
 * Desk's `read_only_because_of_fetch_from`: a fetch target without
 * `fetch_if_empty` renders read-only while its source link holds a value.
 */
export function isFetchLocked(field: DocFieldMeta, doc: Record<string, unknown>): boolean {
  const fetchFrom = typeof field.fetch_from === 'string' ? field.fetch_from : '';
  if (!fetchFrom || !fetchFrom.includes('.') || field.fetch_if_empty) {
    return false;
  }
  const linkField = fetchFrom.split('.')[0];
  return !isEmpty(doc[linkField]);
}

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

import type { DocFieldMeta } from './doctype-meta';

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

/** The link field and rule a field's fetch_from declares, when desk would fetch it. */
const parseFetchRule = (field: DocFieldMeta): { linkField: string; rule: FetchRule } | undefined => {
  const fetchFrom = field.fetch_from ?? '';
  const eligible = FETCHABLE_FIELDTYPES.has(field.fieldtype) || Boolean(field.read_only) || Boolean(field.is_virtual);
  if (!fetchFrom.includes('.') || !eligible) {
    return undefined;
  }
  const [linkField, ...rest] = fetchFrom.split('.');
  const source = rest.join('.');
  if (linkField === '' || source === '') {
    return undefined;
  }
  return { linkField, rule: { target: field.fieldname, source, fetchIfEmpty: Boolean(field.fetch_if_empty) } };
};

export const buildFetchMap = (fields: DocFieldMeta[]): FetchMap => {
  const map: FetchMap = new Map();
  for (const field of fields) {
    const parsed = parseFetchRule(field);
    if (parsed) {
      const rules = map.get(parsed.linkField) ?? [];
      rules.push(parsed.rule);
      map.set(parsed.linkField, rules);
    }
  }
  return map;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- checks a doc value of any fieldtype for emptiness
const isEmpty = (value: unknown): boolean => value === undefined || value === null || value === '';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- doc field values are DocType-defined; keys and types are only known from runtime meta
type DocValues = Record<string, unknown>;

/**
 * Values to patch onto the doc after the linked doc's columns arrive.
 * `fetched` is empty when the link was cleared — desk then blanks the
 * targets; `fetch_if_empty` targets holding a value are left alone in both
 * directions (they belong to the user until the server reconciles).
 */
export const applyFetchedValues = (rules: FetchRule[], fetched: DocValues, currentDoc: DocValues) => {
  const patch: DocValues = {};
  for (const rule of rules) {
    if (!rule.fetchIfEmpty || isEmpty(currentDoc[rule.target])) {
      patch[rule.target] = fetched[rule.source] ?? '';
    }
  }
  return patch;
};

/**
 * Desk's `read_only_because_of_fetch_from`: a fetch target without
 * `fetch_if_empty` renders read-only while its source link holds a value.
 */
export const isFetchLocked = (field: DocFieldMeta, doc: DocValues): boolean => {
  const fetchFrom = field.fetch_from ?? '';
  if (!fetchFrom.includes('.') || Boolean(field.fetch_if_empty)) {
    return false;
  }
  const [linkField] = fetchFrom.split('.');
  return !isEmpty(doc[linkField]);
};

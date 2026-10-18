/**
 * The one filterable-field vocabulary (MPO-15, LC-16).
 *
 * Which doctype fields can filter, the standard doc fields every doctype
 * carries, how they are labelled, desk's operator vocabulary (=, !=, like,
 * not like, in, not in, comparisons, between, is set / is not set) and the
 * two-way frappe tuple conversion. Both list stacks read it: the desk list
 * chrome (filter editor, chips, quick filters) takes the descriptors, and
 * FrappeTable's toolbar takes `docFieldsToFilterFields`, the same fields on
 * the table's `filterableFields` contract. Table filter types come from the
 * field registry (fieldtypeToTableField) and the table's own field→filter
 * type mapping: one chain, no parallel fieldtype table.
 */
import type { DocTypeField } from '@repo/frappe';
import { mapFieldToFilterType } from '@repo/table';
import type { DataTableField, FilterableField } from '@repo/table';

import { fieldtypeToTableField } from './fieldRegistry';
import type { DocFieldMeta, DoctypeMeta } from './formEngine/doctypeMeta';
import type { FrappeFieldFilter } from './useConnectionFilters';

// ── Field descriptors ─────────────────────────────────────────

export type FilterFieldKind = 'select' | 'link' | 'check' | 'date' | 'number' | 'text';

export interface FilterFieldDescriptor {
  fieldname: string;
  label: string;
  fieldtype: string;
  kind: FilterFieldKind;
  /** Link target doctype, or the raw Select options string. */
  options?: string;
}

/** Layout / non-data fieldtypes that cannot meaningfully filter. */
const NON_FILTERABLE_FIELDTYPES = new Set([
  'Section Break',
  'Column Break',
  'Tab Break',
  'Fold',
  'Heading',
  'HTML',
  'Button',
  'Image',
  'Attach',
  'Attach Image',
  'Signature',
  'Geolocation',
  'Password',
]);

const NUMBER_FIELDTYPES = new Set(['Int', 'Float', 'Currency', 'Percent', 'Duration', 'Rating']);
const DATE_FIELDTYPES = new Set(['Date', 'Datetime', 'Time']);

/** Editor kind for a frappe fieldtype (Dynamic Link has no static target → text). */
export function fieldKind(fieldtype: string): FilterFieldKind {
  if (fieldtype === 'Select') {
    return 'select';
  }
  if (fieldtype === 'Link') {
    return 'link';
  }
  if (fieldtype === 'Check') {
    return 'check';
  }
  if (DATE_FIELDTYPES.has(fieldtype)) {
    return 'date';
  }
  if (NUMBER_FIELDTYPES.has(fieldtype)) {
    return 'number';
  }
  return 'text';
}

function toDescriptor(field: DocFieldMeta): FilterFieldDescriptor {
  return {
    fieldname: field.fieldname,
    label: field.label ?? field.fieldname,
    fieldtype: field.fieldtype,
    kind: fieldKind(field.fieldtype),
    options: field.options,
  };
}

/** Standard doc fields present on every doctype but absent from meta.fields. */
export function standardDocFilterFields(): FilterFieldDescriptor[] {
  return [
    { fieldname: 'name', label: 'ID', fieldtype: 'Data', kind: 'text' },
    { fieldname: 'owner', label: 'Created By', fieldtype: 'Link', kind: 'link', options: 'User' },
    { fieldname: 'creation', label: 'Created On', fieldtype: 'Datetime', kind: 'date' },
    { fieldname: 'modified', label: 'Last Updated On', fieldtype: 'Datetime', kind: 'date' },
    {
      fieldname: 'modified_by',
      label: 'Last Updated By',
      fieldtype: 'Link',
      kind: 'link',
      options: 'User',
    },
    // Desk `_` facet columns — the sidebar facets and heart column write
    // tuples on these, so chips and the editor must label them (desk offers
    // them in its filter field picker too). Never surface the raw
    // underscore fieldname (no-raw-fieldname rule candidate).
    { fieldname: '_assign', label: 'Assigned To', fieldtype: 'Data', kind: 'text' },
    { fieldname: '_user_tags', label: 'Tags', fieldtype: 'Data', kind: 'text' },
    { fieldname: '_liked_by', label: 'Liked By', fieldtype: 'Data', kind: 'text' },
    { fieldname: '_comments', label: 'Comments', fieldtype: 'Data', kind: 'text' },
  ];
}

function filterableDescriptors(fields: readonly DocFieldMeta[]): FilterFieldDescriptor[] {
  const out: FilterFieldDescriptor[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (!field.fieldname || seen.has(field.fieldname)) {
      continue;
    }
    const fieldtype = String(field.fieldtype);
    if (NON_FILTERABLE_FIELDTYPES.has(fieldtype) || fieldtype.startsWith('Table')) {
      continue;
    }
    seen.add(field.fieldname);
    out.push(toDescriptor(field));
  }
  for (const standard of standardDocFilterFields()) {
    if (!seen.has(standard.fieldname)) {
      out.push(standard);
    }
  }
  return out;
}

/**
 * All fields offered by the filter editor's field picker — data fields from
 * meta (hidden ones included, desk parity) plus the standard doc fields.
 */
export function filterableFieldsFromMeta(meta?: DoctypeMeta): FilterFieldDescriptor[] {
  return filterableDescriptors(meta?.fields ?? []);
}

function toTableFilterField(field: FilterFieldDescriptor): FilterableField {
  const tableField = fieldtypeToTableField(field.fieldtype, field.options);
  const options = (tableField.fieldProps as { options?: { label: string; value: any }[] })?.options;
  return {
    id: field.fieldname,
    label: field.label,
    // Rating cells map to a custom render (fraction contract) which would
    // otherwise fall through to "text"; it filters as the number it is.
    type: field.fieldtype === 'Rating' ? 'number' : mapFieldToFilterType(tableField.field),
    ...(options ? { options } : {}),
  };
}

/**
 * The same vocabulary on the table's `filterableFields` contract: the
 * doctype's filterable fields plus the standard doc fields, typed through
 * the field registry. FrappeTable derives its toolbar menu from this.
 */
export function docFieldsToFilterFields(fields: DocTypeField[]): FilterableField[] {
  return filterableDescriptors(fields).map(toTableFilterField);
}

/** Fields flagged `in_standard_filter`, in meta order (the quick-filter row).
 *  Desk always offers ID plus the title field as live header inputs even when
 *  those flags are off — typing a fragment of ID/subject is the fastest
 *  narrowing habit list users have (audit E1). */
export function standardFiltersFromMeta(meta?: DoctypeMeta): FilterFieldDescriptor[] {
  const fromMeta = (meta?.fields ?? [])
    .filter((field) => field.in_standard_filter === 1 && field.hidden !== 1 && field.fieldname)
    .map(toDescriptor);
  const seen = new Set(fromMeta.map((field) => field.fieldname));
  const extras: FilterFieldDescriptor[] = [];
  if (!seen.has('name')) {
    extras.push({ fieldname: 'name', label: 'ID', fieldtype: 'Data', kind: 'text' });
    seen.add('name');
  }
  const titleField = meta?.title_field;
  if (titleField && !seen.has(titleField)) {
    const titleMeta = meta?.fields?.find((field) => field.fieldname === titleField);
    extras.push({
      fieldname: titleField,
      label: titleMeta?.label ?? 'Title',
      fieldtype: titleMeta?.fieldtype ?? 'Data',
      kind: fieldKind(titleMeta?.fieldtype ?? 'Data'),
    });
  }
  return extras.length > 0 ? [...extras, ...fromMeta] : fromMeta;
}

/** Select fieldtype options string → dropdown options (blank lines dropped). */
export function selectOptionsFromField(options?: string): { label: string; value: string }[] {
  return (options ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ label: line, value: line }));
}

/**
 * Human label for a fieldname — descriptor label when known, else a
 * title-cased form. The raw identifier (underscores) never reaches chips or
 * editor rows (no-raw-fieldname rule candidate, parity audit pair 04/16).
 */
export function fieldLabelFor(fields: FilterFieldDescriptor[], fieldname: string): string {
  const known = fields.find((field) => field.fieldname === fieldname)?.label;
  if (known) {
    return known;
  }
  const pretty = fieldname
    .replace(/^_+/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return pretty || fieldname;
}

// ── Desk operator vocabulary ──────────────────────────────────

export type DeskOperator =
  | '='
  | '!='
  | 'like'
  | 'not like'
  | 'in'
  | 'not in'
  | '>'
  | '<'
  | '>='
  | '<='
  | 'between'
  | 'is set'
  | 'is not set';

/** English operator labels — translate at render time via t(). */
export const DESK_OPERATOR_LABELS: Record<DeskOperator, string> = {
  '=': 'Equals',
  '!=': 'Not Equals',
  like: 'Like',
  'not like': 'Not Like',
  in: 'In',
  'not in': 'Not In',
  '>': 'Greater Than',
  '<': 'Less Than',
  '>=': 'Greater Than or Equal',
  '<=': 'Less Than or Equal',
  between: 'Between',
  'is set': 'Is Set',
  'is not set': 'Is Not Set',
};

const BASE_OPERATORS: DeskOperator[] = ['=', '!=', 'like', 'not like', 'in', 'not in', 'is set', 'is not set'];

/** Operators offered for an editor kind (desk's list, comparisons gated). */
export function operatorsForKind(kind: FilterFieldKind): DeskOperator[] {
  switch (kind) {
    case 'check': {
      return ['=', '!='];
    }
    case 'number':
    case 'date': {
      return ['=', '!=', '>', '<', '>=', '<=', 'between', 'in', 'not in', 'is set', 'is not set'];
    }
    default: {
      return BASE_OPERATORS;
    }
  }
}

/** Initial operator when a field is picked (desk: text searches, others match). */
export function defaultOperatorForKind(kind: FilterFieldKind): DeskOperator {
  return kind === 'text' ? 'like' : '=';
}

// ── Editor row model + tuple conversion ───────────────────────

export interface FilterRowDraft {
  fieldname: string;
  operator: DeskOperator;
  /** Scalar editor value (single input / select / link / comma list). */
  value: string;
  /** Multi values: in / not in multi-select, or [from, to] for between. */
  values: string[];
}

/**
 * Draft → frappe tuple; null while the draft is incomplete.
 * `like` wraps `%value%` unless the user typed their own wildcard;
 * `is set` / `is not set` become ["field", "is", "set" | "not set"].
 */
export function draftToTuple(draft: FilterRowDraft, kind: FilterFieldKind): FrappeFieldFilter | null {
  const { fieldname, operator } = draft;
  if (!fieldname) {
    return null;
  }
  switch (operator) {
    case 'is set': {
      return [fieldname, 'is', 'set'];
    }
    case 'is not set': {
      return [fieldname, 'is', 'not set'];
    }
    case 'in':
    case 'not in': {
      const values =
        kind === 'select'
          ? draft.values.map((value) => value.trim()).filter(Boolean)
          : draft.value
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean);
      return values.length ? [fieldname, operator, values] : null;
    }
    case 'between': {
      const from = (draft.values[0] ?? '').trim();
      const to = (draft.values[1] ?? '').trim();
      return from && to ? [fieldname, 'between', [from, to]] : null;
    }
    case 'like':
    case 'not like': {
      const text = draft.value.trim();
      if (!text) {
        return null;
      }
      return [fieldname, operator, text.includes('%') ? text : `%${text}%`];
    }
    default: {
      const text = draft.value.trim();
      return text ? [fieldname, operator, text] : null;
    }
  }
}

const SCALAR_OPERATORS: ReadonlySet<string> = new Set(['=', '!=', 'like', 'not like', '>', '<', '>=', '<=']);

/** Frappe tuple → editable draft (inverse of draftToTuple). */
export function tupleToDraft(tuple: FrappeFieldFilter): FilterRowDraft {
  const [fieldname, operator, raw] = tuple;
  if (operator === 'is') {
    return {
      fieldname,
      operator: raw === 'set' ? 'is set' : 'is not set',
      value: '',
      values: [],
    };
  }
  if (operator === 'in' || operator === 'not in') {
    const values = Array.isArray(raw)
      ? raw.map(String)
      : String(raw ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
    return { fieldname, operator, value: values.join(', '), values };
  }
  if (operator === 'between') {
    const values = Array.isArray(raw) ? raw.map(String) : [];
    return {
      fieldname,
      operator: 'between',
      value: '',
      values: [values[0] ?? '', values[1] ?? ''],
    };
  }
  const known = SCALAR_OPERATORS.has(operator) ? (operator as DeskOperator) : '=';
  return {
    fieldname,
    operator: known,
    value: raw === null || raw === undefined ? '' : String(raw),
    values: [],
  };
}

// ── Filter list helpers ───────────────────────────────────────

/**
 * Quick-filter semantics: a standard filter control owns every tuple for its
 * fieldname — replace them with `tuple`, or clear when `tuple` is undefined.
 */
export function setFieldFilter(
  filters: FrappeFieldFilter[],
  fieldname: string,
  tuple?: FrappeFieldFilter,
): FrappeFieldFilter[] {
  const rest = filters.filter(([name]) => name !== fieldname);
  return tuple ? [...rest, tuple] : rest;
}

/** The active quick-filter display value for a fieldname ("" when none). */
export function quickFilterValue(filters: FrappeFieldFilter[], fieldname: string): string {
  const tuple = filters.find(([name]) => name === fieldname);
  if (!tuple) {
    return '';
  }
  const [, operator, raw] = tuple;
  if (operator === 'like') {
    const text = String(raw ?? '');
    return text.startsWith('%') && text.endsWith('%') && text.length >= 2 ? text.slice(1, -1) : text;
  }
  if (operator === '=') {
    return raw === null || raw === undefined ? '' : String(raw);
  }
  return '';
}

/** Chip label: "Status = Open", "Due Date between a, b", "Owner is set". */
export function filterTupleLabel(fields: FilterFieldDescriptor[], tuple: FrappeFieldFilter): string {
  const [fieldname, operator, raw] = tuple;
  const label = fieldLabelFor(fields, fieldname);
  if (operator === 'is') {
    return `${label} ${raw === 'set' ? 'is set' : 'is not set'}`;
  }
  const value = Array.isArray(raw) ? raw.map(String).join(', ') : String(raw ?? '');
  return `${label} ${operator} ${value}`;
}

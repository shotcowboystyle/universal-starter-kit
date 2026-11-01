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
import type { FilterableField } from '@repo/table';

import { fieldtypeToTableField } from './field-registry';
import type { DocFieldMeta, DoctypeMeta } from './formEngine/doctype-meta';
import type { FrappeFieldFilter } from './use-connection-filters';

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
export const fieldKind = (fieldtype: string): FilterFieldKind => {
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
};

const toDescriptor = (field: DocFieldMeta): FilterFieldDescriptor => ({
  fieldname: field.fieldname,
  label: field.label ?? field.fieldname,
  fieldtype: field.fieldtype,
  kind: fieldKind(field.fieldtype),
  options: field.options,
});

/** Standard doc fields present on every doctype but absent from meta.fields. */
export const standardDocFilterFields = (): FilterFieldDescriptor[] => [
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

const filterableDescriptors = (fields: readonly DocFieldMeta[]): FilterFieldDescriptor[] => {
  const out: FilterFieldDescriptor[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const { fieldname, fieldtype } = field;
    const filterable = !NON_FILTERABLE_FIELDTYPES.has(fieldtype) && !fieldtype.startsWith('Table');
    if (fieldname !== '' && !seen.has(fieldname) && filterable) {
      seen.add(fieldname);
      out.push(toDescriptor(field));
    }
  }
  for (const standard of standardDocFilterFields()) {
    if (!seen.has(standard.fieldname)) {
      out.push(standard);
    }
  }
  return out;
};

/**
 * All fields offered by the filter editor's field picker — data fields from
 * meta (hidden ones included, desk parity) plus the standard doc fields.
 */
export const filterableFieldsFromMeta = (meta?: DoctypeMeta): FilterFieldDescriptor[] =>
  filterableDescriptors(meta?.fields ?? []);

const toTableFilterField = (field: FilterFieldDescriptor): FilterableField => {
  const tableField = fieldtypeToTableField(field.fieldtype, field.options);
  // SAFETY: the registry puts a Select's dropdown options, when any, on fieldProps.options
  const options = (tableField.fieldProps as Pick<FilterableField, 'options'> | undefined)?.options;
  const filterField: FilterableField = {
    id: field.fieldname,
    label: field.label,
    // Rating cells map to a custom render (fraction contract) which would
    // otherwise fall through to "text"; it filters as the number it is.
    type: field.fieldtype === 'Rating' ? 'number' : mapFieldToFilterType(tableField.field),
  };
  if (options) {
    filterField.options = options;
  }
  return filterField;
};

/**
 * The same vocabulary on the table's `filterableFields` contract: the
 * doctype's filterable fields plus the standard doc fields, typed through
 * the field registry. FrappeTable derives its toolbar menu from this.
 */
export const docFieldsToFilterFields = (fields: DocTypeField[]): FilterableField[] =>
  filterableDescriptors(fields).map(toTableFilterField);

/** The title field's descriptor; a title field missing from meta reads as Data. */
const titleDescriptor = (titleField: string, fields: readonly DocFieldMeta[] | undefined): FilterFieldDescriptor => {
  const titleMeta = fields?.find((field) => field.fieldname === titleField);
  const fieldtype = titleMeta?.fieldtype ?? 'Data';
  return { fieldname: titleField, label: titleMeta?.label ?? 'Title', fieldtype, kind: fieldKind(fieldtype) };
};

/** Fields flagged `in_standard_filter`, in meta order (the quick-filter row).
 *  Desk always offers ID plus the title field as live header inputs even when
 *  those flags are off — typing a fragment of ID/subject is the fastest
 *  narrowing habit list users have (audit E1). */
export const standardFiltersFromMeta = (meta?: DoctypeMeta): FilterFieldDescriptor[] => {
  const fromMeta: FilterFieldDescriptor[] = [];
  for (const field of meta?.fields ?? []) {
    if (field.in_standard_filter === 1 && field.hidden !== 1 && field.fieldname !== '') {
      fromMeta.push(toDescriptor(field));
    }
  }
  const seen = new Set(fromMeta.map((field) => field.fieldname));
  const extras: FilterFieldDescriptor[] = [];
  if (!seen.has('name')) {
    extras.push({ fieldname: 'name', label: 'ID', fieldtype: 'Data', kind: 'text' });
    seen.add('name');
  }
  const titleField = meta?.title_field;
  if (titleField !== undefined && titleField !== '' && !seen.has(titleField)) {
    extras.push(titleDescriptor(titleField, meta?.fields));
  }
  return extras.length > 0 ? [...extras, ...fromMeta] : fromMeta;
};

/** Select fieldtype options string → dropdown options (blank lines dropped). */
export const selectOptionsFromField = (options?: string): { label: string; value: string }[] =>
  (options ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ label: line, value: line }));

/**
 * Human label for a fieldname — descriptor label when known, else a
 * title-cased form. The raw identifier (underscores) never reaches chips or
 * editor rows (no-raw-fieldname rule candidate, parity audit pair 04/16).
 */
export const fieldLabelFor = (fields: FilterFieldDescriptor[], fieldname: string): string => {
  const known = fields.find((field) => field.fieldname === fieldname)?.label;
  if (known !== undefined && known !== '') {
    return known;
  }
  const pretty = fieldname
    .replace(/^_+/u, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return pretty || fieldname;
};

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

// oxlint-disable-next-line sonarjs/no-duplicate-string -- operator names are the desk's wire vocabulary, spelled out where each list or tuple uses them
const BASE_OPERATORS: DeskOperator[] = ['=', '!=', 'like', 'not like', 'in', 'not in', 'is set', 'is not set'];

/** Operators offered for an editor kind (desk's list, comparisons gated). */
export const operatorsForKind = (kind: FilterFieldKind): DeskOperator[] => {
  if (kind === 'check') {
    return ['=', '!='];
  }
  if (kind === 'number' || kind === 'date') {
    return ['=', '!=', '>', '<', '>=', '<=', 'between', 'in', 'not in', 'is set', 'is not set'];
  }
  return BASE_OPERATORS;
};

/** Initial operator when a field is picked (desk: text searches, others match). */
export const defaultOperatorForKind = (kind: FilterFieldKind): DeskOperator => (kind === 'text' ? 'like' : '=');

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
/** Trimmed, non-blank entries. */
const trimmedValues = (values: readonly string[]): string[] => {
  const out: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (text !== '') {
      out.push(text);
    }
  }
  return out;
};

const betweenTuple = (fieldname: string, values: readonly string[]): FrappeFieldFilter | null => {
  const from = (values[0] ?? '').trim();
  const to = (values[1] ?? '').trim();
  return from && to ? [fieldname, 'between', [from, to]] : null;
};

export const draftToTuple = (draft: FilterRowDraft, kind: FilterFieldKind): FrappeFieldFilter | null => {
  const { fieldname, operator } = draft;
  if (!fieldname) {
    return null;
  }
  if (operator === 'is set' || operator === 'is not set') {
    return [fieldname, 'is', operator === 'is set' ? 'set' : 'not set'];
  }
  if (operator === 'in' || operator === 'not in') {
    const values = trimmedValues(kind === 'select' ? draft.values : draft.value.split(','));
    return values.length > 0 ? [fieldname, operator, values] : null;
  }
  if (operator === 'between') {
    return betweenTuple(fieldname, draft.values);
  }
  const text = draft.value.trim();
  if (!text) {
    return null;
  }
  if (operator === 'like' || operator === 'not like') {
    return [fieldname, operator, text.includes('%') ? text : `%${text}%`];
  }
  return [fieldname, operator, text];
};

/** A tuple's value as text; unset reads as "". */
const valueText = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a frappe tuple's value slot is untyped by contract
  raw: unknown,
): string =>
  // oxlint-disable-next-line typescript/no-base-to-string -- tuple values are scalars, stringified as the server does
  String(raw ?? '');

const SCALAR_OPERATORS: ReadonlySet<string> = new Set(['=', '!=', 'like', 'not like', '>', '<', '>=', '<=']);

const isScalarOperator = (operator: string): operator is DeskOperator => SCALAR_OPERATORS.has(operator);

/** Frappe tuple → editable draft (inverse of draftToTuple). */
export const tupleToDraft = (tuple: FrappeFieldFilter): FilterRowDraft => {
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
      : valueText(raw)
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
  const known = isScalarOperator(operator) ? operator : '=';
  return {
    fieldname,
    operator: known,
    value: valueText(raw),
    values: [],
  };
};

// ── Filter list helpers ───────────────────────────────────────

/**
 * Quick-filter semantics: a standard filter control owns every tuple for its
 * fieldname — replace them with `tuple`, or clear when `tuple` is undefined.
 */
export const setFieldFilter = (
  filters: FrappeFieldFilter[],
  fieldname: string,
  tuple?: FrappeFieldFilter,
): FrappeFieldFilter[] => {
  const rest = filters.filter(([name]) => name !== fieldname);
  return tuple ? [...rest, tuple] : rest;
};

/** The active quick-filter display value for a fieldname ("" when none). */
export const quickFilterValue = (filters: FrappeFieldFilter[], fieldname: string): string => {
  const tuple = filters.find(([name]) => name === fieldname);
  if (!tuple) {
    return '';
  }
  const [, operator, raw] = tuple;
  if (operator === 'like') {
    const text = valueText(raw);
    return text.startsWith('%') && text.endsWith('%') && text.length >= 2 ? text.slice(1, -1) : text;
  }
  if (operator === '=') {
    return valueText(raw);
  }
  return '';
};

/** Chip label: "Status = Open", "Due Date between a, b", "Owner is set". */
export const filterTupleLabel = (fields: FilterFieldDescriptor[], tuple: FrappeFieldFilter): string => {
  const [fieldname, operator, raw] = tuple;
  const label = fieldLabelFor(fields, fieldname);
  if (operator === 'is') {
    return `${label} ${raw === 'set' ? 'is set' : 'is not set'}`;
  }
  const value = Array.isArray(raw) ? raw.map(String).join(', ') : valueText(raw);
  return `${label} ${operator} ${value}`;
};

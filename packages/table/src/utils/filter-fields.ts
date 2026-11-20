/**
 * Filter-field model — the backend-agnostic backbone for filtering on fields
 * that are NOT visible columns (owner ask: "filter on columns that are not
 * visible").
 *
 * A table declares `filterableFields` (id, label, type, options) separately
 * from its visible columns. The toolbar filter surface merges the two lists
 * (visible columns first, then "More fields"), and `applyFiltersToData`
 * applies the advanced-filter model client-side against ANY row key — column
 * or not. Server-side tables (manualFiltering) skip the client pass and map
 * the same TableFilter[] to their own query params.
 *
 * One implementation per concept (LC-16): the operator vocabulary here is the
 * SAME set the ColumnHeaderFilter funnel uses — the funnel imports these maps
 * rather than keeping its own copy.
 */

import { t } from '../shared/t';
import type {
  DataTableColumn,
  DataTableColumnType,
  DataTableData,
  DataTableField,
  FilterOperator,
  FilterValue,
  FilterableField,
  ResolvedFilterField,
  TableFilter,
} from '../types';

import { applyFilterToValue } from './filter-utils';

export type { FilterableField, ResolvedFilterField } from '../types';

// ── Field descriptors ─────────────────────────────────────────

/** Non-text filter editor type per cell field type; every other field filters as text. */
const FIELD_FILTER_TYPES: Partial<Record<DataTableField, DataTableColumnType>> = {
  stepper: 'number',
  slider: 'number',
  progress: 'number',
  rating: 'number',
  duration: 'number',
  money: 'money',
  datepicker: 'date',
  datetimepicker: 'date',
  timepicker: 'date',
  daterangepicker: 'date',
  multidatepicker: 'date',
  checkbox: 'boolean',
  switch: 'boolean',
  select: 'select',
  combobox: 'select',
  radiogroup: 'select',
  togglegroup: 'select',
};

/** Maps a column's cell field type to its filter editor type. */
export const mapFieldToFilterType = (field?: DataTableField): DataTableColumnType =>
  (field === undefined ? undefined : FIELD_FILTER_TYPES[field]) ?? 'text';

/** Row-data key for a column (accessorKey wins, id falls back). */
export const columnFieldId = (column: DataTableColumn): string | undefined => {
  const key = column.accessorKey;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- accessorKey is `keyof TData` (string | number); only a string key names a field
  if (typeof key === 'string' && key !== '') {
    return key;
  }
  return column.id !== undefined && column.id !== '' ? column.id : undefined;
};

/** Human label for a column (string header wins, id falls back). */
const columnFieldLabel = (column: DataTableColumn, id: string): string =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ColumnDef header is a string or a render function; only a string is a label
  typeof column.header === 'string' && column.header !== '' ? column.header : id;

/**
 * Merge column-derived fields with extra `filterableFields`.
 * Columns come first (they match what the user sees); extras that share an
 * id override the column-derived descriptor, other extras append after.
 */
export const resolveFilterFields = (
  columns: DataTableColumn[],
  filterableFields?: FilterableField[],
): ResolvedFilterField[] => {
  const byId = new Map<string, ResolvedFilterField>();
  for (const column of columns) {
    const id = columnFieldId(column);
    if (id === undefined || column.filterable === false) {
      continue;
    }
    byId.set(id, {
      id,
      label: columnFieldLabel(column, id),
      type: mapFieldToFilterType(column.field),
      options: column.fieldProps?.options,
    });
  }
  for (const field of filterableFields ?? []) {
    if (!field.id) {
      continue;
    }
    const existing = byId.get(field.id);
    byId.set(field.id, {
      id: field.id,
      label: field.label || (existing?.label ?? field.id),
      type: field.type ?? existing?.type ?? 'text',
      options: field.options ?? existing?.options,
    });
  }
  return [...byId.values()];
};

/** Filter editor type for a field id ("text" when unknown). */
export const getFilterFieldType = (fields: ResolvedFilterField[], fieldId: string): DataTableColumnType =>
  fields.find((f) => f.id === fieldId)?.type ?? 'text';

// ── Client-side application ───────────────────────────────────

/** "select" fields compare as text; the others map 1:1. */
const comparisonType = (type: DataTableColumnType): Exclude<DataTableColumnType, 'select'> =>
  type === 'select' ? 'text' : type;

/**
 * Apply the advanced-filter model (TableFilter[]) to raw rows. Works for any
 * row key — visible column, hidden column, or non-column field. AND semantics
 * across filters (same as the funnel's per-column filters).
 */
export const applyFiltersToData = <TData extends DataTableData>(
  data: TData[],
  filters: TableFilter[],
  fields: ResolvedFilterField[],
): TData[] => {
  if (!filters.length) {
    return data;
  }
  const active = filters.filter((f) => f.columnId && f.value?.operator);
  if (!active.length) {
    return data;
  }
  return data.filter((row) =>
    active.every((filter) =>
      applyFilterToValue(
        row[filter.columnId],
        filter.value,
        comparisonType(getFilterFieldType(fields, filter.columnId)),
      ),
    ),
  );
};

// ── Operator vocabulary (shared with the column funnel) ───────

const TEXT_OPERATORS: FilterOperator[] = [
  'contains',
  'doesNotContain',
  'is',
  'isNot',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
];

const NUMBER_OPERATORS: FilterOperator[] = [
  'is',
  'isNot',
  'isLessThan',
  'isGreaterThan',
  'isLessThanOrEqual',
  'isGreaterThanOrEqual',
];

/**
 * Money takes the numeric operators PLUS the range pair — "every posting over
 * 500" and "between 100 and 500" are the two questions asked of an amount
 * column, and typing it "text" offered `contains` instead (MPO-252).
 */
const MONEY_OPERATORS: FilterOperator[] = [
  'is',
  'isNot',
  'isLessThan',
  'isGreaterThan',
  'isLessThanOrEqual',
  'isGreaterThanOrEqual',
  'isBetween',
  'isNotBetween',
];

const DATE_OPERATORS: FilterOperator[] = ['is', 'isNot', 'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter'];

const BOOLEAN_OPERATORS: FilterOperator[] = ['is', 'isNot'];

const SELECT_OPERATORS: FilterOperator[] = ['is', 'isNot', 'isAnyOf'];

const OPERATORS_BY_FILTER_TYPE: Record<DataTableColumnType, FilterOperator[]> = {
  text: TEXT_OPERATORS,
  number: NUMBER_OPERATORS,
  money: MONEY_OPERATORS,
  date: DATE_OPERATORS,
  boolean: BOOLEAN_OPERATORS,
  select: SELECT_OPERATORS,
};

/** Operators offered for a filter editor type (same set as the funnel). */
export const operatorsForFilterType = (type: DataTableColumnType): FilterOperator[] =>
  // `??` keeps the text fallback for an untyped runtime value outside the union.
  OPERATORS_BY_FILTER_TYPE[type] ?? TEXT_OPERATORS;

/** English operator labels — translate at render time via t(). */
export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: 'Contains',
  doesNotContain: 'Does not contain',
  is: 'Is',
  isNot: 'Is not',
  startsWith: 'Starts with',
  endsWith: 'Ends with',
  isEmpty: 'Is empty',
  isNotEmpty: 'Is not empty',
  isLessThan: 'Less than',
  isGreaterThan: 'Greater than',
  isLessThanOrEqual: 'Less than or equal',
  isGreaterThanOrEqual: 'Greater than or equal',
  isBefore: 'Before',
  isAfter: 'After',
  isOnOrBefore: 'On or before',
  isOnOrAfter: 'On or after',
  isAnyOf: 'Is any of',
  isNoneOf: 'Is none of',
  isBetween: 'Between',
  isNotBetween: 'Not between',
};

/** Translated operator label ("Contains", "Before", ...). */
export const filterOperatorLabel = (operator: FilterOperator): string => {
  const label = FILTER_OPERATOR_LABELS[operator];
  return label ? t(label) : operator;
};

/** True when the operator carries no value (isEmpty / isNotEmpty). */
export const operatorNeedsNoValue = (operator: FilterOperator): boolean =>
  operator === 'isEmpty' || operator === 'isNotEmpty';

/** Initial operator when a field is first picked (text → contains, else is). */
export const defaultOperatorForFilterType = (type: DataTableColumnType): FilterOperator =>
  type === 'text' ? 'contains' : 'is';

// ── Chip labels ───────────────────────────────────────────────

const displayValue = (value: FilterValue, options?: ResolvedFilterField['options']): string => {
  if (operatorNeedsNoValue(value.operator)) {
    return '';
  }
  const { values } = value;
  if (values && values.length > 0) {
    return values.map(String).join(', ');
  }
  if (value.value === null || value.value === undefined || value.value === '') {
    return '';
  }
  const option = options?.find((o) => String(o.value) === String(value.value));
  return option ? option.label : String(value.value);
};

/**
 * Chip label — "Field: operator value" (HONEST STATE: the chip is how the
 * user sees a hidden-column filter acting on the data).
 */
export const getFilterChipLabel = (
  fieldLabel: string,
  value: FilterValue,
  options?: ResolvedFilterField['options'],
): string => {
  const operator = filterOperatorLabel(value.operator).toLocaleLowerCase();
  const shown = displayValue(value, options);
  return shown
    ? t('{{field}}: {{operator}} {{value}}', { field: fieldLabel, operator, value: shown })
    : t('{{field}}: {{operator}}', { field: fieldLabel, operator });
};

/** True when a raw columnFilter value is FilterValue-shaped ({operator, ...}). */
// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- public export (index.ts); renaming would break consumers
export const isFilterValueShape = (value: unknown): value is FilterValue =>
  typeof value === 'object' && value !== null && 'operator' in value && typeof value.operator === 'string';

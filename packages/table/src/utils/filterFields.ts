/**
 * Filter-field model — the Frappe-agnostic backbone for filtering on fields
 * that are NOT visible columns (owner ask: "filter on columns that are not
 * visible").
 *
 * A table declares `filterableFields` (id, label, type, options) separately
 * from its visible columns. The toolbar filter surface merges the two lists
 * (visible columns first, then "More fields"), and `applyFiltersToData`
 * applies the advanced-filter model client-side against ANY row key — column
 * or not. Server-side tables (manualFiltering) skip the client pass and map
 * the same TableFilter[] to their own query params (frappe-ui does this).
 *
 * One implementation per concept (LC-16): the operator vocabulary here is the
 * SAME set the ColumnHeaderFilter funnel uses — the funnel imports these maps
 * rather than keeping its own copy.
 */

import { t } from "../shared/t";
import type {
  DataTableColumn,
  DataTableColumnType,
  DataTableField,
  FilterOperator,
  FilterValue,
  FilterableField,
  ResolvedFilterField,
  TableFilter,
} from "../types";
import { applyFilterToValue } from "./filterUtils";

export type { FilterableField, ResolvedFilterField };

// ── Field descriptors ─────────────────────────────────────────

/** Maps a column's cell field type to its filter editor type. */
export function mapFieldToFilterType(field?: DataTableField): DataTableColumnType {
  switch (field) {
    case "stepper":
    case "slider":
    case "progress":
    case "rating":
    case "duration": {
      return "number";
    }
    case "money": {
      return "money";
    }
    case "datepicker":
    case "datetimepicker":
    case "timepicker":
    case "daterangepicker":
    case "multidatepicker": {
      return "date";
    }
    case "checkbox":
    case "switch": {
      return "boolean";
    }
    case "select":
    case "combobox":
    case "radiogroup":
    case "togglegroup": {
      return "select";
    }
    default: {
      return "text";
    }
  }
}

/** Row-data key for a column (accessorKey wins, id falls back). */
export function columnFieldId(column: DataTableColumn): string | undefined {
  const key = (column as { accessorKey?: unknown }).accessorKey;
  if (typeof key === "string" && key) {return key;}
  return typeof column.id === "string" && column.id ? column.id : undefined;
}

/** Human label for a column (string header wins, id falls back). */
function columnFieldLabel(column: DataTableColumn, id: string): string {
  return typeof column.header === "string" && column.header ? column.header : id;
}

/**
 * Merge column-derived fields with extra `filterableFields`.
 * Columns come first (they match what the user sees); extras that share an
 * id override the column-derived descriptor, other extras append after.
 */
export function resolveFilterFields(
  columns: DataTableColumn[],
  filterableFields?: FilterableField[],
): ResolvedFilterField[] {
  const byId = new Map<string, ResolvedFilterField>();
  for (const column of columns) {
    const id = columnFieldId(column);
    if (!id) {continue;}
    if (column.filterable === false) {continue;}
    byId.set(id, {
      id,
      label: columnFieldLabel(column, id),
      type: mapFieldToFilterType(column.field),
      options: column.fieldProps?.options,
    });
  }
  for (const field of filterableFields ?? []) {
    if (!field.id) {continue;}
    const existing = byId.get(field.id);
    byId.set(field.id, {
      id: field.id,
      label: field.label || existing?.label ?? field.id,
      type: field.type ?? existing?.type ?? "text",
      options: field.options ?? existing?.options,
    });
  }
  return [...byId.values()];
}

/** Filter editor type for a field id ("text" when unknown). */
export function getFilterFieldType(
  fields: ResolvedFilterField[],
  fieldId: string,
): DataTableColumnType {
  return fields.find((f) => f.id === fieldId)?.type ?? "text";
}

// ── Client-side application ───────────────────────────────────

/** "select" fields compare as text; the others map 1:1. */
function comparisonType(
  type: DataTableColumnType,
): "text" | "number" | "money" | "date" | "boolean" {
  return type === "select" ? "text" : type;
}

/**
 * Apply the advanced-filter model (TableFilter[]) to raw rows. Works for any
 * row key — visible column, hidden column, or non-column field. AND semantics
 * across filters (same as the funnel's per-column filters).
 */
export function applyFiltersToData<TData extends Record<string, any>>(
  data: TData[],
  filters: TableFilter[],
  fields: ResolvedFilterField[],
): TData[] {
  if (!filters.length) {return data;}
  const active = filters.filter((f) => f.columnId && f.value?.operator);
  if (!active.length) {return data;}
  return data.filter((row) =>
    active.every((filter) =>
      applyFilterToValue(
        row[filter.columnId],
        filter.value,
        comparisonType(getFilterFieldType(fields, filter.columnId)),
      ),
    ),
  );
}

// ── Operator vocabulary (shared with the column funnel) ───────

const TEXT_OPERATORS: FilterOperator[] = [
  "contains",
  "doesNotContain",
  "is",
  "isNot",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
];

const NUMBER_OPERATORS: FilterOperator[] = [
  "is",
  "isNot",
  "isLessThan",
  "isGreaterThan",
  "isLessThanOrEqual",
  "isGreaterThanOrEqual",
];

/**
 * Money takes the numeric operators PLUS the range pair — "every posting over
 * 500" and "between 100 and 500" are the two questions asked of an amount
 * column, and typing it "text" offered `contains` instead (MPO-252).
 */
const MONEY_OPERATORS: FilterOperator[] = [
  "is",
  "isNot",
  "isLessThan",
  "isGreaterThan",
  "isLessThanOrEqual",
  "isGreaterThanOrEqual",
  "isBetween",
  "isNotBetween",
];

const DATE_OPERATORS: FilterOperator[] = [
  "is",
  "isNot",
  "isBefore",
  "isAfter",
  "isOnOrBefore",
  "isOnOrAfter",
];

const BOOLEAN_OPERATORS: FilterOperator[] = ["is", "isNot"];

const SELECT_OPERATORS: FilterOperator[] = ["is", "isNot", "isAnyOf"];

/** Operators offered for a filter editor type (same set as the funnel). */
export function operatorsForFilterType(type: DataTableColumnType): FilterOperator[] {
  switch (type) {
    case "number": {
      return NUMBER_OPERATORS;
    }
    case "money": {
      return MONEY_OPERATORS;
    }
    case "date": {
      return DATE_OPERATORS;
    }
    case "boolean": {
      return BOOLEAN_OPERATORS;
    }
    case "select": {
      return SELECT_OPERATORS;
    }
    default: {
      return TEXT_OPERATORS;
    }
  }
}

/** English operator labels — translate at render time via t(). */
export const FILTER_OPERATOR_LABELS: Record<string, string> = {
  contains: "Contains",
  doesNotContain: "Does not contain",
  is: "Is",
  isNot: "Is not",
  startsWith: "Starts with",
  endsWith: "Ends with",
  isEmpty: "Is empty",
  isNotEmpty: "Is not empty",
  isLessThan: "Less than",
  isGreaterThan: "Greater than",
  isLessThanOrEqual: "Less than or equal",
  isGreaterThanOrEqual: "Greater than or equal",
  isBefore: "Before",
  isAfter: "After",
  isOnOrBefore: "On or before",
  isOnOrAfter: "On or after",
  isAnyOf: "Is any of",
  isNoneOf: "Is none of",
  isBetween: "Between",
  isNotBetween: "Not between",
};

/** Translated operator label ("Contains", "Before", ...). */
export function filterOperatorLabel(operator: FilterOperator): string {
  const label = FILTER_OPERATOR_LABELS[operator];
  return label ? t(label) : operator;
}

/** True when the operator carries no value (isEmpty / isNotEmpty). */
export function operatorNeedsNoValue(operator: FilterOperator): boolean {
  return operator === "isEmpty" || operator === "isNotEmpty";
}

/** Initial operator when a field is first picked (text → contains, else is). */
export function defaultOperatorForFilterType(type: DataTableColumnType): FilterOperator {
  return type === "text" ? "contains" : "is";
}

// ── Chip labels ───────────────────────────────────────────────

function displayValue(value: FilterValue, options?: { label: string; value: any }[]): string {
  if (operatorNeedsNoValue(value.operator)) {return "";}
  if (value.values?.length) {return value.values.map(String).join(", ");}
  const raw = value.value;
  if (raw === null || raw === undefined || raw === "") {return "";}
  const option = options?.find((o) => String(o.value) === String(raw));
  return option ? option.label : String(raw);
}

/**
 * Chip label — "Field: operator value" (HONEST STATE: the chip is how the
 * user sees a hidden-column filter acting on the data).
 */
export function getFilterChipLabel(
  fieldLabel: string,
  value: FilterValue,
  options?: { label: string; value: any }[],
): string {
  const operator = filterOperatorLabel(value.operator).toLocaleLowerCase();
  const shown = displayValue(value, options);
  return shown
    ? t("{{field}}: {{operator}} {{value}}", { field: fieldLabel, operator, value: shown })
    : t("{{field}}: {{operator}}", { field: fieldLabel, operator });
}

/** True when a raw columnFilter value is FilterValue-shaped ({operator, ...}). */
export function isFilterValueShape(value: unknown): value is FilterValue {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FilterValue).operator === "string"
  );
}

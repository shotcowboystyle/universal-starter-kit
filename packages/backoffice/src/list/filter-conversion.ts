// Two-way mapping between frappe filter tuples ([field, op, value]) and the
// table package's TableFilter state entries, so sidebar facets and the
// DataTable toolbar speak one filter language. The tuple→FilterValue map is
// the inverse of frappe-ui's filterValueToFrappeTuple (LC-16: one chain).
import { filterValueToFrappeTuple } from '@repo/frappe-ui';
import type { DataTableState, FilterOperator, FilterValue, TableFilter } from '@repo/table';

import type { FrappeFilter, FrappeFilters } from '../shared/types';

/** Operators with no scalar operand (multi-value and emptiness checks). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the tuple's value slot is untyped on the wire
const withoutOperand = (operator: FilterOperator, value?: unknown): FilterValue =>
  // SAFETY: multi-value tuples carry their operand list in the tuple's value slot (frappe's wire shape)
  // oxlint-disable-next-line sonarjs/no-undefined-assignment, typescript/no-unsafe-type-assertion -- FilterValue.value is required; these operators have none
  value === undefined ? { operator, value: undefined } : { operator, value: undefined, values: value as unknown[] };

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the tuple's value slot is untyped on the wire
const likeText = (value: unknown): string =>
  // oxlint-disable-next-line typescript/no-base-to-string -- like operands are strings
  String(value ?? '');

/** "%x%" → contains; "x%" → startsWith; "%x" → endsWith; else raw like. */
const likeToFilterValue = (text: string): FilterValue => {
  if (text.startsWith('%') && text.endsWith('%') && text.length >= 2) {
    return { operator: 'contains', value: text.slice(1, -1) };
  }
  if (text.endsWith('%')) {
    return { operator: 'startsWith', value: text.slice(0, -1) };
  }
  if (text.startsWith('%')) {
    return { operator: 'endsWith', value: text.slice(1) };
  }
  return { operator: 'contains', value: text };
};

const isFilterValue = (value: unknown): value is FilterValue =>
  typeof value === 'object' && value !== null && 'operator' in value;

/** Map one frappe tuple to the table's FilterValue shape. */
export const frappeTupleToFilterValue = ([, operator, value]: FrappeFilter): FilterValue => {
  switch (operator) {
    case '=': {
      return { operator: 'is', value };
    }
    case '!=': {
      return { operator: 'isNot', value };
    }
    case '<': {
      return { operator: 'isLessThan', value };
    }
    case '>': {
      return { operator: 'isGreaterThan', value };
    }
    case '<=': {
      return { operator: 'isLessThanOrEqual', value };
    }
    case '>=': {
      return { operator: 'isGreaterThanOrEqual', value };
    }
    case 'in': {
      return withoutOperand('isAnyOf', value);
    }
    case 'not in': {
      return withoutOperand('isNoneOf', value);
    }
    case 'between': {
      return withoutOperand('isBetween', value);
    }
    case 'is': {
      return withoutOperand(value === 'set' ? 'isNotEmpty' : 'isEmpty');
    }
    case 'like': {
      return likeToFilterValue(likeText(value));
    }
    case 'not like': {
      const text = likeText(value);
      const inner = text.startsWith('%') && text.endsWith('%') && text.length >= 2 ? text.slice(1, -1) : text;
      return { operator: 'doesNotContain', value: inner };
    }
    default: {
      return { operator: 'is', value };
    }
  }
};

/** Frappe tuples → DataTable `initialState.filters` entries. */
export const frappeFiltersToTableFilters = (filters: FrappeFilters): TableFilter[] =>
  filters.map((tuple, index) => ({
    id: `bo-${tuple[0]}-${index}`,
    columnId: tuple[0],
    value: frappeTupleToFilterValue(tuple),
  }));

/**
 * Extract the effective frappe tuples from a DataTable state (toolbar
 * filters + column filters + global search) — the exact set FrappeTable's
 * serverSide fetch sends, reused for live counts and sidebar facet counts.
 */
export const tableStateToFrappeFilters = (state: DataTableState): FrappeFilters => {
  const tuples: FrappeFilters = [];
  for (const filter of state.filters ?? []) {
    if (!filter.value?.operator) {
      continue;
    }
    const tuple = filterValueToFrappeTuple(filter.columnId, filter.value);
    if (tuple) {
      tuples.push(tuple);
    }
  }
  for (const columnFilter of state.columnFilters ?? []) {
    const { value } = columnFilter;
    if (isFilterValue(value)) {
      const tuple = filterValueToFrappeTuple(columnFilter.id, value);
      if (tuple) {
        tuples.push(tuple);
      }
    } else if (value !== null && value !== undefined && value !== '') {
      tuples.push([columnFilter.id, '=', value]);
    }
  }
  if (state.globalFilter !== undefined && state.globalFilter.trim() !== '') {
    tuples.push(['name', 'like', `%${state.globalFilter}%`]);
  }
  return tuples;
};

/** Structural equality for filter tuples (facet active-state checks). */
export const sameFilterTuple = (a: FrappeFilter, b: FrappeFilter): boolean =>
  a[0] === b[0] && a[1] === b[1] && String(a[2]) === String(b[2]);

/** Toggle a tuple in a filter list (add when absent, remove when present). */
export const toggleFilterTuple = (filters: FrappeFilters, tuple: FrappeFilter): FrappeFilters => {
  const without = filters.filter((existing) => !sameFilterTuple(existing, tuple));
  return without.length === filters.length ? [...filters, tuple] : without;
};

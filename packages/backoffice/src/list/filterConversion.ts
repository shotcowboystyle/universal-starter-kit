// Two-way mapping between frappe filter tuples ([field, op, value]) and the
// table package's TableFilter state entries, so sidebar facets and the
// DataTable toolbar speak one filter language. The tuple→FilterValue map is
// the inverse of frappe-ui's filterValueToFrappeTuple (LC-16: one chain).
import { filterValueToFrappeTuple } from '@repo/frappe-ui';
import type { DataTableState, FilterValue, TableFilter } from '@repo/table';

import type { FrappeFilter, FrappeFilters } from '../shared/types';

/** Map one frappe tuple to the table's FilterValue shape. */
export function frappeTupleToFilterValue([, operator, value]: FrappeFilter): FilterValue {
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
      return { operator: 'isAnyOf', value: undefined, values: value as unknown[] };
    }
    case 'not in': {
      return { operator: 'isNoneOf', value: undefined, values: value as unknown[] };
    }
    case 'between': {
      return { operator: 'isBetween', value: undefined, values: value as unknown[] };
    }
    case 'is': {
      return value === 'set' ? { operator: 'isNotEmpty', value: undefined } : { operator: 'isEmpty', value: undefined };
    }
    case 'like': {
      // "%x%" → contains; "x%" → startsWith; "%x" → endsWith; else raw like.
      const text = String(value ?? '');
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
    }
    case 'not like': {
      const text = String(value ?? '');
      const inner = text.startsWith('%') && text.endsWith('%') && text.length >= 2 ? text.slice(1, -1) : text;
      return { operator: 'doesNotContain', value: inner };
    }
    default: {
      return { operator: 'is', value };
    }
  }
}

/** Frappe tuples → DataTable `initialState.filters` entries. */
export function frappeFiltersToTableFilters(filters: FrappeFilters): TableFilter[] {
  return filters.map((tuple, index) => ({
    id: `bo-${tuple[0]}-${index}`,
    columnId: tuple[0],
    value: frappeTupleToFilterValue(tuple),
  }));
}

/**
 * Extract the effective frappe tuples from a DataTable state (toolbar
 * filters + column filters + global search) — the exact set FrappeTable's
 * serverSide fetch sends, reused for live counts and sidebar facet counts.
 */
export function tableStateToFrappeFilters(state: DataTableState): FrappeFilters {
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
    if (value && typeof value === 'object' && 'operator' in (value as FilterValue)) {
      const tuple = filterValueToFrappeTuple(columnFilter.id, value as FilterValue);
      if (tuple) {
        tuples.push(tuple);
      }
    } else if (value !== null && value !== undefined && value !== '') {
      tuples.push([columnFilter.id, '=', value]);
    }
  }
  if (typeof state.globalFilter === 'string' && state.globalFilter.trim()) {
    tuples.push(['name', 'like', `%${state.globalFilter}%`]);
  }
  return tuples;
}

/** Structural equality for filter tuples (facet active-state checks). */
export function sameFilterTuple(a: FrappeFilter, b: FrappeFilter): boolean {
  return a[0] === b[0] && a[1] === b[1] && String(a[2]) === String(b[2]);
}

/** Toggle a tuple in a filter list (add when absent, remove when present). */
export function toggleFilterTuple(filters: FrappeFilters, tuple: FrappeFilter): FrappeFilters {
  const without = filters.filter((existing) => !sameFilterTuple(existing, tuple));
  return without.length === filters.length ? [...filters, tuple] : without;
}

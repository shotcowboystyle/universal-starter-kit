import { parseCalendarDate } from '@repo/theme';
import type { DateInput } from '@repo/theme';

import { t } from '../shared/t';
import type { FilterValue, TableFilter } from '../types';

import { isMoneyString, moneyComparator } from './money';

/**
 * Order a date cell against a date comparand.
 *
 * Both sides go through the day-grid parse, because they routinely arrive in
 * different forms: rows carry date-only "YYYY-MM-DD" strings while the filter
 * UI hands back `Date` objects built from local parts. `new Date("YYYY-MM-DD")`
 * is UTC midnight, so parsing them apart put a row on the previous local day
 * west of UTC and ordered it before a comparand naming the very same day.
 * Unparseable input on either side matches nothing, as NaN comparison did.
 */
function compareDates(value: DateInput, filterValue: DateInput, ordered: (a: number, b: number) => boolean): boolean {
  const left = parseCalendarDate(value);
  const right = parseCalendarDate(filterValue);
  return left && right ? ordered(left.getTime(), right.getTime()) : false;
}

// Filter ID Generation

export function generateFilterId(): string {
  return `filter-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Filter Serialization/Deserialization

export function serializeFilters(filters: TableFilter[]): string {
  try {
    return JSON.stringify(filters);
  } catch (error) {
    console.warn('Failed to serialize filters:', error);
    return '[]';
  }
}

export function deserializeFilters(filterString: string): TableFilter[] {
  try {
    const parsed = JSON.parse(filterString);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to deserialize filters:', error);
    return [];
  }
}

// Filter Application Logic

/**
 * Order a money cell against a money comparand (MPO-252).
 *
 * Money is a decimal STRING, so `Number()` would round it and `<` would
 * compare it lexically — "9.00" above "10.00". Both sides go through the
 * exact BigInt comparator. A comparand that is not a decimal string matches
 * nothing, the way a NaN numeric comparison already did.
 */
function compareMoneyValues(value: unknown, filterValue: unknown, ordered: (delta: number) => boolean): boolean {
  const right = typeof filterValue === 'number' ? String(filterValue) : filterValue;
  if (!isMoneyString(value) || !isMoneyString(right)) {
    return false;
  }
  return ordered(moneyComparator(value, right));
}

export function applyFilterToValue(
  value: any,
  filterValue: FilterValue,
  columnType: 'text' | 'number' | 'money' | 'date' | 'boolean' = 'text',
): boolean {
  const { operator, value: filterVal, values } = filterValue;

  // Handle null/undefined values
  if (value == null) {
    return operator === 'isEmpty' || operator === 'isNotEmpty' ? operator === 'isEmpty' : false;
  }

  const stringValue = String(value).toLowerCase();
  const filterStringValue = String(filterVal).toLowerCase();

  switch (operator) {
    // Text Filters
    case 'contains': {
      return stringValue.includes(filterStringValue);
    }
    case 'doesNotContain': {
      return !stringValue.includes(filterStringValue);
    }
    case 'startsWith': {
      return stringValue.startsWith(filterStringValue);
    }
    case 'endsWith': {
      return stringValue.endsWith(filterStringValue);
    }
    case 'isEmpty': {
      return value === '' || value == null;
    }
    case 'isNotEmpty': {
      return value !== '' && value != null;
    }

    // Equality operators - handle different types
    case 'is': {
      if (columnType === 'money') {
        return compareMoneyValues(value, filterVal, (delta) => delta === 0);
      }
      if (columnType === 'number') {
        return Number(value) === Number(filterVal);
      }
      if (columnType === 'boolean') {
        return Boolean(value) === Boolean(filterVal);
      }
      return stringValue === filterStringValue;
    }
    case 'isNot': {
      if (columnType === 'money') {
        return !compareMoneyValues(value, filterVal, (delta) => delta === 0);
      }
      if (columnType === 'number') {
        return Number(value) !== Number(filterVal);
      }
      return stringValue !== filterStringValue;
    }

    // Number/Date Filters
    case 'isLessThan': {
      if (columnType === 'money') {
        return compareMoneyValues(value, filterVal, (delta) => delta < 0);
      }
      return columnType === 'number' ? Number(value) < Number(filterVal) : stringValue < filterStringValue;
    }
    case 'isGreaterThan': {
      if (columnType === 'money') {
        return compareMoneyValues(value, filterVal, (delta) => delta > 0);
      }
      return columnType === 'number' ? Number(value) > Number(filterVal) : stringValue > filterStringValue;
    }
    case 'isLessThanOrEqual': {
      if (columnType === 'money') {
        return compareMoneyValues(value, filterVal, (delta) => delta <= 0);
      }
      return columnType === 'number' ? Number(value) <= Number(filterVal) : stringValue <= filterStringValue;
    }
    case 'isGreaterThanOrEqual': {
      if (columnType === 'money') {
        return compareMoneyValues(value, filterVal, (delta) => delta >= 0);
      }
      return columnType === 'number' ? Number(value) >= Number(filterVal) : stringValue >= filterStringValue;
    }
    case 'isBetween': {
      if (values && values.length >= 2) {
        if (columnType === 'money') {
          return (
            compareMoneyValues(value, values[0], (delta) => delta >= 0) &&
            compareMoneyValues(value, values[1], (delta) => delta <= 0)
          );
        }
        const numValue = Number(value);
        const min = Number(values[0]);
        const max = Number(values[1]);
        return numValue >= min && numValue <= max;
      }
      return false;
    }
    case 'isNotBetween': {
      if (values && values.length >= 2) {
        if (columnType === 'money') {
          return (
            compareMoneyValues(value, values[0], (delta) => delta < 0) ||
            compareMoneyValues(value, values[1], (delta) => delta > 0)
          );
        }
        const numValue = Number(value);
        const min = Number(values[0]);
        const max = Number(values[1]);
        return numValue < min || numValue > max;
      }
      return true;
    }

    // Date Filters — see `compareDates`: both sides take the day-grid parse so
    // a date-only row never compares as UTC midnight against a local comparand.
    case 'isBefore': {
      return columnType === 'date' ? compareDates(value, filterVal, (a, b) => a < b) : stringValue < filterStringValue;
    }
    case 'isAfter': {
      return columnType === 'date' ? compareDates(value, filterVal, (a, b) => a > b) : stringValue > filterStringValue;
    }
    case 'isOnOrBefore': {
      return columnType === 'date'
        ? compareDates(value, filterVal, (a, b) => a <= b)
        : stringValue <= filterStringValue;
    }
    case 'isOnOrAfter': {
      return columnType === 'date'
        ? compareDates(value, filterVal, (a, b) => a >= b)
        : stringValue >= filterStringValue;
    }

    // Option Filters
    case 'isAnyOf': {
      if (values) {
        return values.some((v) => String(v).toLowerCase() === stringValue);
      }
      return String(filterVal).toLowerCase() === stringValue;
    }
    case 'isNoneOf': {
      if (values) {
        return !values.some((v) => String(v).toLowerCase() === stringValue);
      }
      return String(filterVal).toLowerCase() !== stringValue;
    }

    default: {
      return true;
    }
  }
}

// Filter Validation

export function validateFilter(filter: Partial<TableFilter>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!filter.columnId) {
    errors.push('Column ID is required');
  }

  if (!filter.value?.operator) {
    errors.push('Filter operator is required');
  }

  // Validate operator-specific requirements
  const { operator, value, values } = filter.value ?? {};

  switch (operator) {
    case 'isBetween':
    case 'isNotBetween': {
      if (!values || values.length < 2) {
        errors.push('Between operators require at least 2 values');
      }
      break;
    }
    case 'isAnyOf':
    case 'isNoneOf': {
      if (!values && !value) {
        errors.push('Option operators require values array or single value');
      }
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Filter Combination Logic (AND/OR operations)

export function combineFilters(
  filters: TableFilter[],
  combinationMode: 'AND' | 'OR' = 'AND',
): (value: any, columnId: string) => boolean {
  return (value: any, columnId: string) => {
    if (filters.length === 0) {
      return true;
    }

    const columnFilters = filters.filter((f) => f.columnId === columnId);

    if (columnFilters.length === 0) {
      return true;
    }

    if (combinationMode === 'AND') {
      return columnFilters.every((filter) => {
        // Get column type (you'd need to pass this or infer it)
        const columnType = inferColumnType(value);
        return applyFilterToValue(value, filter.value, columnType);
      });
    }
    return columnFilters.some((filter) => {
      const columnType = inferColumnType(value);
      return applyFilterToValue(value, filter.value, columnType);
    });
  };
}

// Column Type Inference

export function inferColumnType(value: any): 'text' | 'number' | 'date' | 'boolean' {
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (value instanceof Date || (!Number.isNaN(Date.parse(value)) && !Number.isNaN(Number(value)))) {
    return 'date';
  }
  return 'text';
}

// Filter Description Generation

export function getFilterDescription(filter: TableFilter): string {
  const { operator, value, values } = filter.value;
  const columnLabel = filter.label ?? filter.columnId;
  const opts = { column: columnLabel, value } as Record<string, unknown>;

  switch (operator) {
    case 'contains': {
      return t('{{column}} contains "{{value}}"', opts);
    }
    case 'doesNotContain': {
      return t('{{column}} does not contain "{{value}}"', opts);
    }
    case 'is': {
      return t('{{column}} is "{{value}}"', opts);
    }
    case 'isNot': {
      return t('{{column}} is not "{{value}}"', opts);
    }
    case 'startsWith': {
      return t('{{column}} starts with "{{value}}"', opts);
    }
    case 'endsWith': {
      return t('{{column}} ends with "{{value}}"', opts);
    }
    case 'isEmpty': {
      return t('{{column}} is empty', opts);
    }
    case 'isNotEmpty': {
      return t('{{column}} is not empty', opts);
    }
    case 'isLessThan': {
      return t('{{column}} < {{value}}', opts);
    }
    case 'isGreaterThan': {
      return t('{{column}} > {{value}}', opts);
    }
    case 'isLessThanOrEqual': {
      return t('{{column}} ≤ {{value}}', opts);
    }
    case 'isGreaterThanOrEqual': {
      return t('{{column}} ≥ {{value}}', opts);
    }
    case 'isBetween': {
      return values
        ? t('{{column}} between {{min}} and {{max}}', {
            column: columnLabel,
            min: values[0],
            max: values[1],
          })
        : t('{{column}} is between', opts);
    }
    case 'isNotBetween': {
      return values
        ? t('{{column}} not between {{min}} and {{max}}', {
            column: columnLabel,
            min: values[0],
            max: values[1],
          })
        : t('{{column}} is not between', opts);
    }
    case 'isBefore': {
      return t('{{column}} is before {{value}}', opts);
    }
    case 'isAfter': {
      return t('{{column}} is after {{value}}', opts);
    }
    case 'isOnOrBefore': {
      return t('{{column}} is on or before {{value}}', opts);
    }
    case 'isOnOrAfter': {
      return t('{{column}} is on or after {{value}}', opts);
    }
    case 'isAnyOf': {
      return values
        ? t('{{column}} is any of: {{list}}', { column: columnLabel, list: values.join(', ') })
        : t('{{column}} is "{{value}}"', opts);
    }
    case 'isNoneOf': {
      return values
        ? t('{{column}} is none of: {{list}}', { column: columnLabel, list: values.join(', ') })
        : t('{{column}} is not "{{value}}"', opts);
    }
    default: {
      return `${columnLabel} ${operator} ${value}`;
    }
  }
}

// Filter Preset Management

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: TableFilter[];
  createdAt: Date;
  updatedAt: Date;
}

export function createFilterPreset(name: string, filters: TableFilter[], description?: string): FilterPreset {
  const now = new Date();
  return {
    id: `preset-${Date.now()}`,
    name,
    description,
    filters: JSON.parse(JSON.stringify(filters)), // Deep copy
    createdAt: now,
    updatedAt: now,
  };
}

export function serializeFilterPresets(presets: FilterPreset[]): string {
  try {
    return JSON.stringify(presets);
  } catch (error) {
    console.warn('Failed to serialize filter presets:', error);
    return '[]';
  }
}

export function deserializeFilterPresets(presetString: string): FilterPreset[] {
  try {
    const parsed = JSON.parse(presetString);
    return Array.isArray(parsed)
      ? parsed.map((preset) => ({
          ...preset,
          createdAt: new Date(preset.createdAt),
          updatedAt: new Date(preset.updatedAt),
        }))
      : [];
  } catch (error) {
    console.warn('Failed to deserialize filter presets:', error);
    return [];
  }
}

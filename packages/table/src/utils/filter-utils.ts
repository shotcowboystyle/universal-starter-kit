import { parseCalendarDate } from '@repo/theme';
import type { DateInput } from '@repo/theme';

import { t } from '../shared/t';
import type { DataTableColumnType, FilterOperator, FilterValue, TableFilter } from '../types';

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
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- arbitrary cell value and comparand; parseCalendarDate is the parse boundary
const compareDates = (value: unknown, filterValue: unknown, ordered: (a: number, b: number) => boolean): boolean => {
  // SAFETY: parseCalendarDate returns null for any unparseable input (non-strings go through `new Date(value)`)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const left = parseCalendarDate(value as DateInput);
  // SAFETY: as above, the comparand is parsed the same way
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const right = parseCalendarDate(filterValue as DateInput);
  return left && right ? ordered(left.getTime(), right.getTime()) : false;
};

// Filter ID Generation

// oxlint-disable-next-line sonarjs/pseudo-random -- uniqueness for a UI-local id, not a security token
export const generateFilterId = (): string => `filter-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

// Filter Serialization/Deserialization

export const serializeFilters = (filters: TableFilter[]): string => {
  try {
    return JSON.stringify(filters);
  } catch (error) {
    console.warn('Failed to serialize filters:', error);
    return '[]';
  }
};

export const deserializeFilters = (filterString: string): TableFilter[] => {
  try {
    const parsed: unknown = JSON.parse(filterString);
    // SAFETY: the string is produced by serializeFilters from TableFilter[]; element shape is not re-validated here
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Array.isArray narrows to any[]; see SAFETY above
    return Array.isArray(parsed) ? (parsed as TableFilter[]) : [];
  } catch (error) {
    console.warn('Failed to deserialize filters:', error);
    return [];
  }
};

// Filter Application Logic

/**
 * Order a money cell against a money comparand (MPO-252).
 *
 * Money is a decimal STRING, so `Number()` would round it and `<` would
 * compare it lexically — "9.00" above "10.00". Both sides go through the
 * exact BigInt comparator. A comparand that is not a decimal string matches
 * nothing, the way a NaN numeric comparison already did.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- arbitrary cell value and comparand; isMoneyString is the parse boundary
const compareMoneyValues = (value: unknown, filterValue: unknown, ordered: (delta: number) => boolean): boolean => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a numeric comparand is accepted as its decimal string
  const right = typeof filterValue === 'number' ? String(filterValue) : filterValue;
  if (!isMoneyString(value) || !isMoneyString(right)) {
    return false;
  }
  return ordered(moneyComparator(value, right));
};

/** Loose, case-insensitive text form used by the text operators. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- arbitrary cell/filter values; loose String() matching is the operator contract
const lowerText = (input: unknown): string => String(input).toLowerCase();

// oxlint-disable-next-line eslint/complexity -- one flat branch per filter operator
export const applyFilterToValue = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- arbitrary row cell value; each operator coerces it the way it needs
  value: unknown,
  filterValue: FilterValue,
  columnType: Exclude<DataTableColumnType, 'select'> = 'text',
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- one flat branch per filter operator
): boolean => {
  const { operator } = filterValue;
  const filterVal: unknown = filterValue.value;
  const values: readonly unknown[] | undefined = filterValue.values;

  // Handle null/undefined values
  if (value == null) {
    return operator === 'isEmpty' || operator === 'isNotEmpty' ? operator === 'isEmpty' : false;
  }

  const stringValue = lowerText(value);
  const filterStringValue = lowerText(filterVal);

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
        return values.some((v) => lowerText(v) === stringValue);
      }
      return lowerText(filterVal) === stringValue;
    }
    case 'isNoneOf': {
      if (values) {
        return !values.some((v) => lowerText(v) === stringValue);
      }
      return lowerText(filterVal) !== stringValue;
    }

    default: {
      return true;
    }
  }
};

// Filter Validation

interface FilterValidation {
  isValid: boolean;
  errors: string[];
}

export const validateFilter = (filter: Partial<TableFilter>): FilterValidation => {
  const errors: string[] = [];

  if (filter.columnId === undefined || filter.columnId === '') {
    errors.push('Column ID is required');
  }

  if (!filter.value?.operator) {
    errors.push('Filter operator is required');
  }

  // Validate operator-specific requirements
  const operator = filter.value?.operator;
  const values = filter.value?.values;
  const hasSingleValue = Boolean(filter.value?.value);

  if (operator === 'isBetween' || operator === 'isNotBetween') {
    if (!values || values.length < 2) {
      errors.push('Between operators require at least 2 values');
    }
  } else if ((operator === 'isAnyOf' || operator === 'isNoneOf') && !values && !hasSingleValue) {
    errors.push('Option operators require values array or single value');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Column Type Inference

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- inference over an arbitrary cell value is the point of this helper
export const inferColumnType = (value: unknown): Exclude<DataTableColumnType, 'select' | 'money'> => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- type inference from the runtime representation is the point of this helper
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see above
  if (typeof value === 'number') {
    return 'number';
  }
  if (value instanceof Date || (!Number.isNaN(Date.parse(String(value))) && !Number.isNaN(Number(value)))) {
    return 'date';
  }
  return 'text';
};

// Filter Combination Logic (AND/OR operations)

export const combineFilters =
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- returned predicate runs over arbitrary cell values
  (filters: TableFilter[], combinationMode: 'AND' | 'OR' = 'AND'): ((value: unknown, columnId: string) => boolean) =>
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- predicate over arbitrary cell values
    (value: unknown, columnId: string) => {
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

// Filter Description Generation

// oxlint-disable-next-line eslint/complexity -- one flat branch per filter operator
export const getFilterDescription = (filter: TableFilter): string => {
  const described: { operator: FilterOperator; value: unknown; values?: readonly unknown[] } = filter.value;
  const { operator, value, values } = described;
  const columnLabel = filter.label ?? filter.columnId;
  const opts = { column: columnLabel, value };

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
      // Unreachable for a typed operator; keeps the old raw text for an unknown runtime operator.
      return `${columnLabel} ${String(operator)} ${String(value)}`;
    }
  }
};

// Filter Preset Management

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: TableFilter[];
  createdAt: Date;
  updatedAt: Date;
}

/** A FilterPreset after a JSON round-trip: the Dates arrive as strings. */
type SerializedFilterPreset = Omit<FilterPreset, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string };

export const createFilterPreset = (name: string, filters: TableFilter[], description?: string): FilterPreset => {
  const now = new Date();
  return {
    id: `preset-${Date.now()}`,
    name,
    description,
    // Deep copy. JSON round-trip on purpose: presets are persisted as JSON, and structuredClone is not on every Hermes runtime.
    // oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone, typescript/no-unsafe-assignment -- see above
    filters: JSON.parse(JSON.stringify(filters)),
    createdAt: now,
    updatedAt: now,
  };
};

export const serializeFilterPresets = (presets: FilterPreset[]): string => {
  try {
    return JSON.stringify(presets);
  } catch (error) {
    console.warn('Failed to serialize filter presets:', error);
    return '[]';
  }
};

export const deserializeFilterPresets = (presetString: string): FilterPreset[] => {
  try {
    const parsed: unknown = JSON.parse(presetString);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // SAFETY: the string is produced by serializeFilterPresets; only the Date fields need reviving
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Array.isArray narrows to any[]; see SAFETY above
    const presets = parsed as SerializedFilterPreset[];
    return presets.map((preset) => ({
      ...preset,
      createdAt: new Date(preset.createdAt),
      updatedAt: new Date(preset.updatedAt),
    }));
  } catch (error) {
    console.warn('Failed to deserialize filter presets:', error);
    return [];
  }
};

import { describe, expect, it } from 'vitest';

import type { DataTableColumn, TableFilter } from '../types';

import {
  applyFiltersToData,
  defaultOperatorForFilterType,
  filterOperatorLabel,
  getFilterChipLabel,
  getFilterFieldType,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- exported API name; aliased below
  isFilterValueShape as isFilterValueObject,
  mapFieldToFilterType,
  operatorNeedsNoValue,
  operatorsForFilterType,
  resolveFilterFields,
} from './filter-fields';

const columns: DataTableColumn[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'age', header: 'Age', field: 'stepper' },
  {
    accessorKey: 'status',
    header: 'Status',
    field: 'select',
    fieldProps: {
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ],
    },
  },
];

const hiddenFields = [
  { id: 'email', label: 'Email' },
  { id: 'salary', label: 'Salary', type: 'number' as const },
  { id: 'joinDate', label: 'Join Date', type: 'date' as const },
];

const rows = [
  {
    firstName: 'Ada',
    age: 36,
    status: 'active',
    email: 'ada@corp.com',
    salary: 90,
    joinDate: '2021-03-01',
    verified: true,
  },
  {
    firstName: 'Grace',
    age: 45,
    status: 'inactive',
    email: 'grace@corp.com',
    salary: 120,
    joinDate: '2019-07-15',
    verified: false,
  },
  {
    firstName: 'Alan',
    age: 41,
    status: 'active',
    email: 'alan@other.org',
    salary: 100,
    joinDate: '2020-01-20',
    verified: true,
  },
];

const filter = (columnId: string, operator: string, value: any, values?: any[]): TableFilter => ({
  id: `f-${columnId}`,
  columnId,
  value: { operator: operator as any, value, values },
});

describe(resolveFilterFields, () => {
  it('derives fields from columns (visible first) and appends declared hidden fields', () => {
    const fields = resolveFilterFields(columns, hiddenFields);
    expect(fields.map((f) => f.id)).toStrictEqual(['firstName', 'age', 'status', 'email', 'salary', 'joinDate']);
  });

  it('maps column field types to filter types and carries select options', () => {
    const fields = resolveFilterFields(columns, hiddenFields);
    const byId = Object.fromEntries(fields.map((f) => [f.id, f]));
    expect(byId.firstName.type).toBe('text');
    expect(byId.age.type).toBe('number');
    expect(byId.status.type).toBe('select');
    expect(byId.status.options).toHaveLength(2);
    // default
    expect(byId.email.type).toBe('text');
    expect(byId.salary.type).toBe('number');
  });

  it('lets a declared field override the column-derived descriptor by id', () => {
    const fields = resolveFilterFields(columns, [{ id: 'age', label: 'Age (years)', type: 'text' }]);
    const age = fields.find((f) => f.id === 'age');
    expect(age?.label).toBe('Age (years)');
    expect(age?.type).toBe('text');
    // Position preserved (still grouped with columns)
    expect(fields.findIndex((f) => f.id === 'age')).toBe(1);
  });

  it('skips columns with filterable: false', () => {
    const fields = resolveFilterFields([
      { accessorKey: 'a', header: 'A' },
      { accessorKey: 'b', header: 'B', filterable: false },
    ]);
    expect(fields.map((f) => f.id)).toStrictEqual(['a']);
  });
});

describe('applyFiltersToData (hidden / non-column fields)', () => {
  const fields = resolveFilterFields(columns, hiddenFields);

  it('filters on a field with no visible column (text contains)', () => {
    const out = applyFiltersToData(rows, [filter('email', 'contains', 'corp')], fields);
    expect(out.map((r) => r.firstName)).toStrictEqual(['Ada', 'Grace']);
  });

  it('filters numbers with comparison operators', () => {
    const out = applyFiltersToData(rows, [filter('salary', 'isGreaterThan', '95')], fields);
    expect(out.map((r) => r.firstName)).toStrictEqual(['Grace', 'Alan']);
  });

  it('filters dates with before/after', () => {
    const out = applyFiltersToData(rows, [filter('joinDate', 'isBefore', '2020-06-01')], fields);
    expect(out.map((r) => r.firstName)).toStrictEqual(['Grace', 'Alan']);
  });

  it('treats select fields as text comparisons', () => {
    const out = applyFiltersToData(rows, [filter('status', 'is', 'active')], fields);
    expect(out.map((r) => r.firstName)).toStrictEqual(['Ada', 'Alan']);
  });

  it('ANDs multiple filters together', () => {
    const out = applyFiltersToData(
      rows,
      [filter('status', 'is', 'active'), filter('salary', 'isGreaterThan', '95')],
      fields,
    );
    expect(out.map((r) => r.firstName)).toStrictEqual(['Alan']);
  });

  it('returns data unchanged when there are no filters', () => {
    expect(applyFiltersToData(rows, [], fields)).toBe(rows);
  });

  it('handles isEmpty / isNotEmpty without a value', () => {
    const withEmpty = [...rows, { firstName: 'Nia', email: '', age: 30 }];
    const out = applyFiltersToData(withEmpty, [filter('email', 'isEmpty', null)], fields);
    expect(out.map((r) => r.firstName)).toStrictEqual(['Nia']);
  });
});

describe('operator vocabulary', () => {
  it('offers type-appropriate operators (same sets as the column funnel)', () => {
    expect(operatorsForFilterType('text')).toContain('contains');
    expect(operatorsForFilterType('text')).toContain('isEmpty');
    expect(operatorsForFilterType('number')).toContain('isGreaterThan');
    expect(operatorsForFilterType('number')).not.toContain('contains');
    expect(operatorsForFilterType('date')).toContain('isBefore');
    expect(operatorsForFilterType('boolean')).toStrictEqual(['is', 'isNot']);
    expect(operatorsForFilterType('select')).toContain('isAnyOf');
  });

  it('knows which operators carry no value', () => {
    expect(operatorNeedsNoValue('isEmpty')).toBe(true);
    expect(operatorNeedsNoValue('isNotEmpty')).toBe(true);
    expect(operatorNeedsNoValue('contains')).toBe(false);
  });

  it('defaults text to contains and everything else to is', () => {
    expect(defaultOperatorForFilterType('text')).toBe('contains');
    expect(defaultOperatorForFilterType('number')).toBe('is');
    expect(defaultOperatorForFilterType('select')).toBe('is');
  });

  it('labels operators in English (translated at render)', () => {
    expect(filterOperatorLabel('contains')).toBe('Contains');
    expect(filterOperatorLabel('isOnOrAfter')).toBe('On or after');
  });
});

describe(getFilterChipLabel, () => {
  it('reads "Field: operator value"', () => {
    expect(getFilterChipLabel('Email', { operator: 'contains', value: 'corp' })).toBe('Email: contains corp');
  });

  it('omits the value for no-value operators', () => {
    expect(getFilterChipLabel('Email', { operator: 'isEmpty', value: null })).toBe('Email: is empty');
  });

  it('shows option labels instead of raw values for select fields', () => {
    expect(
      getFilterChipLabel('Status', { operator: 'is', value: 'active' }, [{ label: 'Active', value: 'active' }]),
    ).toBe('Status: is Active');
  });

  it('joins multi-values', () => {
    expect(getFilterChipLabel('Status', { operator: 'isAnyOf', value: null, values: ['a', 'b'] })).toBe(
      'Status: is any of a, b',
    );
  });
});

describe(isFilterValueObject, () => {
  it('detects FilterValue objects and rejects plain values', () => {
    expect(isFilterValueObject({ operator: 'contains', value: 'x' })).toBe(true);
    expect(isFilterValueObject('x')).toBe(false);
    expect(isFilterValueObject(null)).toBe(false);
    expect(isFilterValueObject(['a'])).toBe(false);
  });
});

describe('mapFieldToFilterType / getFilterFieldType', () => {
  it('maps cell field types to filter editor types', () => {
    expect(mapFieldToFilterType('stepper')).toBe('number');
    expect(mapFieldToFilterType('datepicker')).toBe('date');
    expect(mapFieldToFilterType('switch')).toBe('boolean');
    expect(mapFieldToFilterType('combobox')).toBe('select');
    expect(mapFieldToFilterType()).toBe('text');
  });

  it('falls back to text for unknown field ids', () => {
    expect(getFilterFieldType([], 'nope')).toBe('text');
  });
});

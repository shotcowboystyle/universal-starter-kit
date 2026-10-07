/**
 * filterUtils contracts not covered by filterUtils.spec.ts: filter
 * validation rules, AND/OR column-scoped combination, column type inference,
 * the human-readable chip descriptions, and the filter-preset persistence
 * round-trip (deep-copy on create, Date revival on deserialize).
 */

import { describe, expect, it, vi } from 'vitest';

import type { TableFilter } from '../types';

import {
  combineFilters,
  createFilterPreset,
  deserializeFilterPresets,
  getFilterDescription,
  inferColumnType,
  serializeFilterPresets,
  validateFilter,
} from './filterUtils';

function makeFilter(overrides: Partial<TableFilter> = {}): TableFilter {
  return {
    id: 'f1',
    columnId: 'name',
    value: { operator: 'contains', value: 'ada' },
    ...overrides,
  } as TableFilter;
}

describe(validateFilter, () => {
  it('accepts a complete filter', () => {
    expect(validateFilter(makeFilter())).toEqual({ isValid: true, errors: [] });
  });

  it('requires a column id and an operator', () => {
    const result = validateFilter({ value: { operator: undefined } } as any);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Column ID is required');
    expect(result.errors).toContain('Filter operator is required');
  });

  it('requires two values for between operators', () => {
    const result = validateFilter(makeFilter({ value: { operator: 'isBetween', values: [1] } as any }));
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Between operators require at least 2 values');
    const ok = validateFilter(makeFilter({ value: { operator: 'isNotBetween', values: [1, 10] } as any }));
    expect(ok.isValid).toBe(true);
  });

  it('requires values or a value for option operators', () => {
    const bad = validateFilter(makeFilter({ value: { operator: 'isAnyOf' } as any }));
    expect(bad.isValid).toBe(false);
    expect(bad.errors).toContain('Option operators require values array or single value');
    const ok = validateFilter(makeFilter({ value: { operator: 'isNoneOf', values: ['x'] } as any }));
    expect(ok.isValid).toBe(true);
  });
});

describe(combineFilters, () => {
  const containsA = makeFilter({ id: 'a', value: { operator: 'contains', value: 'a' } as any });
  const containsB = makeFilter({ id: 'b', value: { operator: 'contains', value: 'b' } as any });

  it('passes everything with no filters', () => {
    expect(combineFilters([])('anything', 'name')).toBe(true);
  });

  it('only applies filters scoped to the queried column', () => {
    const otherColumn = makeFilter({ columnId: 'age' });
    expect(combineFilters([otherColumn])('zzz', 'name')).toBe(true);
  });

  it('ANDs multiple filters on the same column by default', () => {
    const predicate = combineFilters([containsA, containsB]);
    expect(predicate('ab', 'name')).toBe(true);
    expect(predicate('a-only', 'name')).toBe(false);
  });

  it('ORs filters when requested', () => {
    const predicate = combineFilters([containsA, containsB], 'OR');
    expect(predicate('a-only', 'name')).toBe(true);
    expect(predicate('b-only', 'name')).toBe(true);
    expect(predicate('neither', 'name')).toBe(false);
  });
});

describe(inferColumnType, () => {
  it('classifies primitives', () => {
    expect(inferColumnType(true)).toBe('boolean');
    expect(inferColumnType(42)).toBe('number');
    expect(inferColumnType(new Date())).toBe('date');
    expect(inferColumnType('plain words')).toBe('text');
  });
});

describe(getFilterDescription, () => {
  it('describes text operators with the column label', () => {
    expect(
      getFilterDescription(makeFilter({ label: 'Name', value: { operator: 'contains', value: 'ada' } as any })),
    ).toBe('Name contains "ada"');
    expect(getFilterDescription(makeFilter({ value: { operator: 'isEmpty' } as any }))).toBe('name is empty');
  });

  it('falls back to the column id when no label is set', () => {
    expect(getFilterDescription(makeFilter({ value: { operator: 'is', value: 'x' } as any }))).toBe('name is "x"');
  });

  it('describes comparison operators with symbols', () => {
    expect(getFilterDescription(makeFilter({ value: { operator: 'isLessThan', value: 5 } as any }))).toBe('name < 5');
    expect(getFilterDescription(makeFilter({ value: { operator: 'isGreaterThanOrEqual', value: 5 } as any }))).toBe(
      'name ≥ 5',
    );
  });

  it('describes between and option operators from their values arrays', () => {
    expect(getFilterDescription(makeFilter({ value: { operator: 'isBetween', values: [1, 10] } as any }))).toBe(
      'name between 1 and 10',
    );
    expect(getFilterDescription(makeFilter({ value: { operator: 'isAnyOf', values: ['a', 'b'] } as any }))).toBe(
      'name is any of: a, b',
    );
    expect(getFilterDescription(makeFilter({ value: { operator: 'isNoneOf', values: ['a'] } as any }))).toBe(
      'name is none of: a',
    );
  });

  it('describes date operators', () => {
    expect(getFilterDescription(makeFilter({ value: { operator: 'isAfter', value: '2024-01-01' } as any }))).toBe(
      'name is after 2024-01-01',
    );
  });

  it('falls back to a raw description for unknown operators', () => {
    expect(getFilterDescription(makeFilter({ value: { operator: 'someFuture', value: 'x' } as any }))).toBe(
      'name someFuture x',
    );
  });
});

describe('filter presets round-trip', () => {
  it('createFilterPreset deep-copies the filters snapshot', () => {
    const filters = [makeFilter()];
    const preset = createFilterPreset('My view', filters, 'saved');
    (filters[0].value as any).value = 'mutated';
    expect((preset.filters[0].value as any).value).toBe('ada');
    expect(preset.name).toBe('My view');
    expect(preset.description).toBe('saved');
    expect(preset.createdAt).toBeInstanceOf(Date);
  });

  it('serializes and revives presets including Date fields', () => {
    const preset = createFilterPreset('Roundtrip', [makeFilter()]);
    const revived = deserializeFilterPresets(serializeFilterPresets([preset]));
    expect(revived).toHaveLength(1);
    expect(revived[0].name).toBe('Roundtrip');
    expect(revived[0].filters).toEqual(preset.filters);
    expect(revived[0].createdAt).toBeInstanceOf(Date);
    expect(revived[0].createdAt.getTime()).toBe(preset.createdAt.getTime());
  });

  it('returns an empty list for corrupted or non-array preset payloads', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(deserializeFilterPresets('{oops')).toEqual([]);
      expect(deserializeFilterPresets('{"not":"array"}')).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});

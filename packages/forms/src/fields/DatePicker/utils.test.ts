import { describe, expect, it } from 'vitest';

import { coerceToDate } from './utils';

describe('coerceToDate (forgiving paste normalization)', () => {
  it('parses strict ISO date-only strings as local midnight', () => {
    const d = coerceToDate('2024-01-15');
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(0);
    expect(d?.getDate()).toBe(15);
    expect(d?.getHours()).toBe(0);
  });

  it('accepts `/`, `.`, and space separators (paste normalization)', () => {
    for (const value of ['2024/01/15', '2024.01.15', '2024 01 15']) {
      const d = coerceToDate(value);
      expect(d?.getFullYear(), value).toBe(2024);
      expect(d?.getMonth(), value).toBe(0);
      expect(d?.getDate(), value).toBe(15);
    }
  });

  it('accepts 1-digit month/day and surrounding whitespace', () => {
    const d = coerceToDate('  2024-1-5  ');
    expect(d?.getMonth()).toBe(0);
    expect(d?.getDate()).toBe(5);
  });

  it('rejects out-of-range months/days instead of rolling over', () => {
    expect(coerceToDate('2024-13-01')).toBeNull();
    expect(coerceToDate('2024-02-31')).toBeNull();
  });

  it('passes through Date instances and epoch numbers', () => {
    const now = new Date();
    expect(coerceToDate(now)).toBe(now);
    expect(coerceToDate(now.getTime())?.getTime()).toBe(now.getTime());
  });

  it('returns null for empty / invalid inputs', () => {
    expect(coerceToDate(null)).toBeNull();
    expect(coerceToDate('')).toBeNull();
    expect(coerceToDate('   ')).toBeNull();
    expect(coerceToDate('not a date')).toBeNull();
    expect(coerceToDate(new Date('invalid'))).toBeNull();
  });

  it('still parses full ISO datetime strings', () => {
    const d = coerceToDate('2024-01-15T10:30:00.000Z');
    expect(d?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });
});

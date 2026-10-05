import { describe, expect, it } from 'vitest';

import { createDateFormatter, createNumberFormatter, createCurrencyFormatter } from './formatters';

describe('createDateFormatter', () => {
  const formatter = createDateFormatter('en-US');

  it('formats a date with default options', () => {
    const result = formatter.format(new Date('2025-06-15T12:00:00Z'));
    expect(result).toMatch(/6\/15\/2025|Jun/);
  });

  it('formats a date with custom options', () => {
    const result = formatter.format(new Date('2025-01-15T12:00:00Z'), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    expect(result).toContain('January');
    expect(result).toContain('2025');
  });

  it('formats a timestamp number', () => {
    const result = formatter.format(0);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  describe('relative', () => {
    it('returns a relative time string', () => {
      const future = Date.now() + 3600 * 1000;
      const result = formatter.relative(future);
      expect(result).toMatch(/hour|in/i);
    });

    it('handles past dates', () => {
      const past = Date.now() - 86400 * 1000;
      const result = formatter.relative(past);
      expect(result).toMatch(/day|yesterday|ago/i);
    });
  });
});

describe('createNumberFormatter', () => {
  const formatter = createNumberFormatter('en-US');

  it('formats a number with default options', () => {
    expect(formatter.format(1234567.89)).toBe('1,234,567.89');
  });

  it('formats with custom options', () => {
    const result = formatter.format(0.756, {
      style: 'percent',
    });
    expect(result).toContain('76%');
  });

  it('formats negative numbers', () => {
    const result = formatter.format(-42);
    expect(result).toContain('42');
  });

  it('formats zero', () => {
    expect(formatter.format(0)).toBe('0');
  });
});

describe('createNumberFormatter with different locale', () => {
  const formatter = createNumberFormatter('de-DE');

  it('uses locale-appropriate separators', () => {
    const result = formatter.format(1234.56);
    expect(result).toMatch(/1\.234,56|1.234,56/);
  });
});

describe('createCurrencyFormatter', () => {
  const formatter = createCurrencyFormatter('en-US');

  it('formats USD currency', () => {
    const result = formatter.format(99.99, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('99.99');
  });

  it('formats EUR currency', () => {
    const result = formatter.format(42, 'EUR');
    expect(result.includes('€') || result.includes('EUR')).toBe(true);
  });

  it('formats large amounts', () => {
    const result = formatter.format(1000000, 'USD');
    expect(result).toContain('1,000,000');
  });

  it('formats zero', () => {
    const result = formatter.format(0, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('0');
  });
});

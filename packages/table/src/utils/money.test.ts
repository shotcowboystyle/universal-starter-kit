/**
 * Money — exact decimal arithmetic and numeric ordering (MPO-252).
 *
 * The defect this closes is one line long and invisible on screen:
 * `"9.00" > "10.00"` is TRUE for strings, so an amount column typed "text"
 * sorts wrong and says nothing. Everything here is the answer to that.
 */

import { describe, expect, it } from 'vitest';

import {
  addMoney,
  compareMoney,
  formatMoney,
  isMoneyString,
  isNegativeMoney,
  moneyComparator,
  subtractMoney,
  sumMoney,
  sumMoneyByCurrency,
} from './money';

describe(compareMoney, () => {
  it('orders "9.00" BELOW "10.00" — the whole reason the type exists', () => {
    // oxlint-disable-next-line eslint/no-constant-binary-expression -- the constant comparison IS the documented pitfall
    expect('9.00' > '10.00', 'string comparison gets this backwards').toBe(true);
    expect(compareMoney('9.00', '10.00')).toBeLessThan(0);
    expect(compareMoney('10.00', '9.00')).toBeGreaterThan(0);
  });

  it('compares across differing scales', () => {
    expect(compareMoney('10.5', '10.50')).toBe(0);
    expect(compareMoney('10.500', '10.5001')).toBeLessThan(0);
    expect(compareMoney('-0.01', '0')).toBeLessThan(0);
    expect(compareMoney('-100', '-99.99')).toBeLessThan(0);
  });

  it('sorts a column of decimal strings numerically', () => {
    const amounts = ['9.00', '10.00', '-455.87', '0', '100.5', '99.999'];
    expect(amounts.toSorted(moneyComparator)).toStrictEqual(['-455.87', '0', '9.00', '10.00', '99.999', '100.5']);
  });

  it('sorts blanks and junk before every real figure rather than throwing', () => {
    expect(['10.00', null, '', 'n/a', '2.00'].toSorted(moneyComparator)).toStrictEqual([
      null,
      '',
      'n/a',
      '2.00',
      '10.00',
    ]);
  });
});

describe('addMoney / sumMoney', () => {
  it('is exact where a float is not', () => {
    expect(0.1 + 0.2, 'the float answer').not.toBe(0.3);
    expect(addMoney('0.1', '0.2')).toBe('0.3');
    expect(addMoney('10.50', '0.125')).toBe('10.625');
    expect(addMoney('-455.87', '455.87')).toBe('0.00');
  });

  it('folds a hundred cents without drifting into 0.99999', () => {
    let running = '0';
    for (let i = 0; i < 100; i += 1) {
      running = addMoney(running, '0.01');
    }
    expect(running).toBe('1.00');
  });

  it('subtracts exactly', () => {
    expect(subtractMoney('10.00', '0.125')).toBe('9.875');
    expect(subtractMoney('0', '455.87')).toBe('-455.87');
  });

  it('sums at the widest scale present', () => {
    expect(sumMoney([])).toBe('0');
    expect(sumMoney(['1.5', '2.25', '3'])).toBe('6.75');
  });

  it('throws on malformed input rather than folding a NaN into a balance', () => {
    expect(() => addMoney('1.00', 'abc')).toThrow(/not a decimal string/u);
    expect(() => sumMoney(['1.00', ''])).toThrow(/not a decimal string/u);
  });
});

describe('the mixed-currency rule', () => {
  const postings = [
    { amount: '10.00', currency: 'USD' },
    { amount: '250.75', currency: 'INR' },
    { amount: '5.50', currency: 'USD' },
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an absent currency is the case under test
    { amount: '1.00', currency: undefined },
    { amount: null, currency: 'USD' },
  ];

  it('returns one figure PER currency — never one number', () => {
    const totals = sumMoneyByCurrency(
      postings,
      (row) => row.amount,
      (row) => row.currency,
    );
    expect(totals).toStrictEqual({ USD: '15.50', INR: '250.75', '—': '1.00' });
    expect(Object.keys(totals)).toHaveLength(3);
  });

  it('skips rows whose amount is not a decimal string instead of coercing them', () => {
    const totals = sumMoneyByCurrency(
      [{ amount: 'n/a', currency: 'USD' }],
      (row) => row.amount,
      (row) => row.currency,
    );
    expect(totals).toStrictEqual({});
  });
});

describe(formatMoney, () => {
  it('formats with the given currency', () => {
    expect(formatMoney('1234.5', 'USD', 'en-US')).toBe('$1,234.50');
    expect(formatMoney('-455.87', 'USD', 'en-US')).toBe('-$455.87');
  });

  it('formats without one when the row carries no code', () => {
    expect(formatMoney('1234.5', undefined, 'en-US')).toBe('1,234.50');
  });

  it('renders the figure even when the code is not ISO', () => {
    expect(formatMoney('12.00', 'XYZZY', 'en-US')).toBe('XYZZY 12.00');
  });

  it('returns a bad value as itself, so it reads as bad rather than as zero', () => {
    expect(formatMoney('n/a', 'USD', 'en-US')).toBe('n/a');
    expect(formatMoney('', 'USD')).toBe('');
    expect(formatMoney(null, 'USD')).toBe('');
  });
});

describe('isMoneyString / isNegativeMoney', () => {
  it('recognizes decimal strings and rejects everything else', () => {
    expect(isMoneyString('0')).toBe(true);
    expect(isMoneyString('-455.87')).toBe(true);
    expect(isMoneyString('.5')).toBe(true);
    expect(isMoneyString('')).toBe(false);
    expect(isMoneyString('1,000')).toBe(false);
    expect(isMoneyString('$10')).toBe(false);
    expect(isMoneyString(10)).toBe(false);
  });

  it('reads the sign for colour without parsing', () => {
    expect(isNegativeMoney('-0.01')).toBe(true);
    expect(isNegativeMoney('0.00')).toBe(false);
  });
});

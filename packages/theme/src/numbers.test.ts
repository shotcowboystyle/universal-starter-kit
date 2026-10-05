import { describe, expect, it } from 'vitest';

import { currencyAffix, formatCurrency, formatNumber, formatPercent, resolveCurrencyCode } from './numbers';

// Pin locale so assertions don't depend on the host machine.
const enUS = { locale: 'en-US' } as const;

describe('formatNumber (cardinal register)', () => {
  it('groups thousands — the aggregate that used to render raw', () => {
    expect(formatNumber(15400, enUS)).toBe('15,400');
    expect(formatNumber(1234567, enUS)).toBe('1,234,567');
  });

  it('keeps up to two fraction digits without inventing any', () => {
    expect(formatNumber(5133.33, enUS)).toBe('5,133.33');
    expect(formatNumber(5133.3, enUS)).toBe('5,133.3');
    expect(formatNumber(5133, enUS)).toBe('5,133');
    expect(formatNumber(5133.336, enUS)).toBe('5,133.34');
  });

  it('pins fraction digits with precision (fixed-precision columns)', () => {
    expect(formatNumber(15400, { ...enUS, precision: 2 })).toBe('15,400.00');
    expect(formatNumber(15400.6, { ...enUS, precision: 0 })).toBe('15,401');
  });

  it('honours a wider maximum for report floats', () => {
    expect(formatNumber(3.14159, { ...enUS, maximumFractionDigits: 4 })).toBe('3.1416');
  });

  it('can drop grouping when a caller owns the layout', () => {
    expect(formatNumber(15400, { ...enUS, grouping: false })).toBe('15400');
  });

  it('coerces numeric strings — wire values still reach the register', () => {
    expect(formatNumber('15400', enUS)).toBe('15,400');
  });

  it('renders empty input as empty and passes unparseable text through', () => {
    expect(formatNumber(null, enUS)).toBe('');
    expect(formatNumber(undefined, enUS)).toBe('');
    expect(formatNumber('', enUS)).toBe('');
    expect(formatNumber('n/a', enUS)).toBe('n/a');
    expect(formatNumber(Number.NaN, enUS)).toBe('');
  });
});

describe('formatCurrency (money register)', () => {
  it('defaults to two fraction digits so a money column stays aligned', () => {
    expect(formatCurrency(15400, enUS)).toBe('15,400.00');
    expect(formatCurrency(15400, { ...enUS, symbol: '$' })).toBe('$15,400.00');
  });

  it('elides a whole-value .00 in the summary-tile variant', () => {
    expect(formatCurrency(48250, { ...enUS, symbol: '$', fractionDigits: 'auto' })).toBe('$48,250');
  });

  it('still shows cents in the summary variant when the value has them', () => {
    expect(formatCurrency(48250.5, { ...enUS, symbol: '$', fractionDigits: 'auto' })).toBe('$48,250.50');
  });

  it("renders an ISO code through the currency's own symbol placement", () => {
    expect(formatCurrency(15400, { ...enUS, currency: 'USD' })).toBe('$15,400.00');
    expect(formatCurrency(15400, { ...enUS, currency: 'EUR' })).toBe('€15,400.00');
  });

  it('resolves a known symbol to its code, prefixes an unknown one', () => {
    expect(formatCurrency(1500, { ...enUS, symbol: '₹' })).toBe('₹1,500.00');
    expect(formatCurrency(1500, { ...enUS, symbol: '¤' })).toBe('¤1,500.00');
  });

  it('keeps the grouped register when a bad code makes Intl throw', () => {
    // A Frappe field can hand over a malformed code; the money register must
    // still group ("EUROS1,500.00", never a bare "1500").
    expect(formatCurrency(1500, { ...enUS, currency: 'EUROS' })).toBe('EUROS1,500.00');
  });

  it('honours an explicit precision from a Frappe field', () => {
    expect(formatCurrency(1500.456, { ...enUS, symbol: '$', precision: 3 })).toBe('$1,500.456');
  });

  it('renders empty input as empty', () => {
    expect(formatCurrency(null, enUS)).toBe('');
    expect(formatCurrency('', { ...enUS, symbol: '$' })).toBe('');
  });
});

describe('formatPercent (rate register)', () => {
  it('takes percent units, not a ratio', () => {
    expect(formatPercent(94.2, enUS)).toBe('94.2%');
    expect(formatPercent(3, enUS)).toBe('3%');
  });

  it('pins report precision', () => {
    expect(formatPercent(94.25, { ...enUS, precision: 1 })).toBe('94.3%');
  });

  it('renders empty input as empty', () => {
    expect(formatPercent(null, enUS)).toBe('');
  });
});

describe('resolveCurrencyCode', () => {
  it('maps the common symbols and passes codes through', () => {
    expect(resolveCurrencyCode('$')).toBe('USD');
    expect(resolveCurrencyCode('₹')).toBe('INR');
    expect(resolveCurrencyCode('eur')).toBe('EUR');
    expect(resolveCurrencyCode('R$')).toBe('BRL');
    expect(resolveCurrencyCode('¤')).toBeUndefined();
    expect(resolveCurrencyCode(undefined)).toBeUndefined();
  });
});

describe('currencyAffix (money editor glyph)', () => {
  it("takes the glyph and its side from the locale's money register", () => {
    expect(currencyAffix('USD', 'en-US')).toEqual({ glyph: '$', position: 'leading' });
    expect(currencyAffix('EUR', 'de-DE')).toEqual({ glyph: '€', position: 'trailing' });
  });

  it('resolves a Frappe-style symbol through its code', () => {
    expect(currencyAffix('₹', 'en-IN')).toEqual({ glyph: '₹', position: 'leading' });
  });

  it('returns a symbol with no known code as itself, leading', () => {
    expect(currencyAffix('Fr', 'en-US')).toEqual({ glyph: 'Fr', position: 'leading' });
  });

  it('returns nothing without a currency', () => {
    expect(currencyAffix(undefined)).toBeUndefined();
    expect(currencyAffix('')).toBeUndefined();
  });
});

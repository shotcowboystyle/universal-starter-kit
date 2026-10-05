/**
 * Canonical number / currency registers (render channel, Axiom 9).
 *
 * One formatter owns every number the catalog renders — table aggregates,
 * KPI values, report cells, chart value labels — so the same data class
 * never speaks in two voices ("15400" in a group header beside "15,400" in
 * the cell two rows below).
 *
 * Content class picks the register:
 *   - cardinal / aggregate → `formatNumber` (grouped, ≤2 fraction digits)
 *   - money                → `formatCurrency` (grouped, 2 fraction digits;
 *                            `fractionDigits: "auto"` elides a whole-value
 *                            `.00` for summary tiles)
 *   - rate                 → `formatPercent` (value already carries percent
 *                            units: 94.2 → "94.2%")
 *
 * Not covered (declared exemptions): chart AXIS tick labels, whose
 * density-driven register is owned by `charts/math.ts#formatAxisTick`;
 * app-land `useFormatNumber` / `useFormatCurrency` (i18n package), which
 * bind the active UI language outside the catalog; and machine formats
 * (export/serialization).
 */

export type NumberInput = number | string | null | undefined;

export interface NumberFormatOptions {
  /** BCP-47 locale forwarded to Intl. Default: system locale. */
  locale?: string;
  /** Pins min and max fraction digits together (fixed-precision columns). */
  precision?: number;
  minimumFractionDigits?: number;
  /** House cap for the cardinal register. Default 2. */
  maximumFractionDigits?: number;
  /** Thousands grouping. Default true. */
  grouping?: boolean;
}

export interface CurrencyFormatOptions extends NumberFormatOptions {
  /** ISO 4217 code, e.g. "USD" — renders through Intl's currency style. */
  currency?: string;
  /**
   * Currency symbol as handed over by Frappe-style adapters. Resolved to an
   * ISO code when known, otherwise prefixed literally.
   */
  symbol?: string;
  /**
   * `"always"` (default) pins 2 fraction digits — the money register that
   * keeps columns aligned. `"auto"` drops them for whole values — the
   * summary-tile register (KPI cards read "$48,250", not "$48,250.00")
   * while still showing cents when a value has them.
   */
  fractionDigits?: 'always' | 'auto';
}

export type PercentFormatOptions = NumberFormatOptions;

/** Frappe adapters hand over a symbol; Intl's currency style wants a code. */
const CURRENCY_SYMBOL_TO_CODE: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₩': 'KRW',
  '₽': 'RUB',
  R$: 'BRL',
};

/**
 * ISO 4217 code for a currency symbol (or a code passed straight through).
 * `undefined` when the symbol has no known code — callers prefix it.
 */
export function resolveCurrencyCode(symbol: string | undefined): string | undefined {
  if (!symbol) {
    return undefined;
  }
  if (/^[A-Za-z]{3}$/.test(symbol)) {
    return symbol.toUpperCase();
  }
  return CURRENCY_SYMBOL_TO_CODE[symbol];
}

export interface CurrencyAffix {
  glyph: string;
  /** Which side of the amount the locale writes the glyph on. */
  position: 'leading' | 'trailing';
}

/**
 * The glyph a money field writes beside its amount ("$", "€", "₹"), and on
 * which side, for a code or a Frappe-style symbol. The money register's own
 * placement, so an editor and `formatCurrency` agree. A symbol with no known
 * code comes back as itself, leading.
 */
export function currencyAffix(currency: string | undefined, locale?: string): CurrencyAffix | undefined {
  if (!currency) {
    return undefined;
  }
  const code = resolveCurrencyCode(currency);
  if (code) {
    try {
      const parts = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
      }).formatToParts(1);
      const glyphIndex = parts.findIndex((part) => part.type === 'currency');
      const amountIndex = parts.findIndex((part) => part.type === 'integer');
      if (glyphIndex !== -1) {
        return {
          glyph: parts[glyphIndex].value,
          position: amountIndex !== -1 && glyphIndex > amountIndex ? 'trailing' : 'leading',
        };
      }
    } catch {
      // A malformed code falls through to the literal glyph below.
    }
  }
  return { glyph: currency, position: 'leading' };
}

interface CoercedNumber {
  num: number;
}

function coerceNumberInput(value: NumberInput): CoercedNumber | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { num: value } : null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? { num } : null;
}

function resolveDigits(
  options: NumberFormatOptions,
): Pick<Intl.NumberFormatOptions, 'minimumFractionDigits' | 'maximumFractionDigits'> {
  const { precision, minimumFractionDigits, maximumFractionDigits } = options;
  if (precision != null) {
    return { minimumFractionDigits: precision, maximumFractionDigits: precision };
  }
  const max = maximumFractionDigits ?? 2;
  const min = minimumFractionDigits ?? 0;
  return { minimumFractionDigits: min, maximumFractionDigits: Math.max(min, max) };
}

function tryFormatWith(num: number, options: Intl.NumberFormatOptions, locale?: string): string | null {
  try {
    return new Intl.NumberFormat(locale, options).format(num);
  } catch {
    return null;
  }
}

function formatWith(num: number, options: Intl.NumberFormatOptions, locale?: string): string {
  return tryFormatWith(num, options, locale) ?? String(num);
}

/**
 * Cardinal / aggregate register — grouped digits, at most two fraction
 * digits ("15,400", "5,133.33"). Empty input renders "" and an unparseable
 * string passes through unchanged (honest passthrough — never invents).
 */
export function formatNumber(value: NumberInput, options: NumberFormatOptions = {}): string {
  const coerced = coerceNumberInput(value);
  if (!coerced) {
    return typeof value === 'string' ? value : '';
  }
  return formatWith(coerced.num, { ...resolveDigits(options), useGrouping: options.grouping ?? true }, options.locale);
}

/**
 * Money register — grouped digits with two fraction digits, rendered with
 * the currency's own symbol placement when the code is known ("$15,400.00",
 * "₹15,400.00") and symbol-prefixed otherwise.
 */
export function formatCurrency(value: NumberInput, options: CurrencyFormatOptions = {}): string {
  const coerced = coerceNumberInput(value);
  if (!coerced) {
    return typeof value === 'string' ? value : '';
  }
  const { currency, symbol, fractionDigits = 'always', locale, grouping } = options;
  const hasExplicitDigits =
    options.precision != null || options.minimumFractionDigits != null || options.maximumFractionDigits != null;
  const wholeValue = Number.isInteger(coerced.num);
  const digits = hasExplicitDigits
    ? resolveDigits(options)
    : fractionDigits === 'auto' && wholeValue
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const code = currency ?? resolveCurrencyCode(symbol);
  const useGrouping = grouping ?? true;
  if (code) {
    // A malformed code from a Frappe field must not cost the whole money
    // register: fall back to the grouped register with the label prefixed
    // rather than letting Intl's throw leak a bare `String(num)`.
    const styled = tryFormatWith(coerced.num, { ...digits, useGrouping, style: 'currency', currency: code }, locale);
    if (styled != null) {
      return styled;
    }
  }
  const amount = formatWith(coerced.num, { ...digits, useGrouping }, locale);
  const label = symbol ?? currency;
  return label ? `${label}${amount}` : amount;
}

/**
 * Rate register — the value already carries percent units (94.2 → "94.2%"),
 * never a 0..1 ratio; ratios are converted by the caller that owns the unit.
 */
export function formatPercent(value: NumberInput, options: PercentFormatOptions = {}): string {
  const formatted = formatNumber(value, options);
  if (formatted === '') {
    return '';
  }
  const coerced = coerceNumberInput(value);
  return coerced ? `${formatted}%` : formatted;
}

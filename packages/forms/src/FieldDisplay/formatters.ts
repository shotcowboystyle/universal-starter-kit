/**
 * Shared read-only value formatters.
 *
 * FieldDisplay (table cells) and frappe-ui's ReadOnly field both format
 * through these so the same value renders identically in a table read cell
 * and a Frappe read-only field. Keep formatting logic here, not inline in
 * either component.
 */

import { formatAbsoluteDate, formatCurrency, formatNumber } from '@repo/theme';

export const EMPTY = '—';

export function asText(v: any): string {
  if (v == null || v === '') {
    return EMPTY;
  }
  if (typeof v === 'string') {
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  // A Date instance is date-class data even in an untyped column (Axiom 9) —
  // house absolute register, never the ISO system voice.
  if (v instanceof Date) {
    return formatAbsoluteDate(v, { year: 'always' });
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export interface NumericFormatOptions {
  precision?: number;
  /** ISO 4217 currency code (or a symbol a code is known for), e.g. "USD". */
  currency?: string;
}

/**
 * Read-only numeric cells speak the house number registers (render
 * channel): the same figure reads identically in a table cell, a KPI tile
 * and a group aggregate. `precision` pins the fraction digits a Frappe field
 * declares; the register owns everything else.
 */
export function formatNumericText(num: number, options: NumericFormatOptions = {}): string {
  const { precision, currency } = options;
  if (currency) {
    return formatCurrency(num, { precision, symbol: currency });
  }
  return formatNumber(num, { precision });
}

// Re-exported for existing consumers; the canonical shape lives in theme.
export { ISO_DATE_ONLY } from '@repo/theme';

export interface DateFormatOptions {
  withTime?: boolean;
  dateFormat?: string;
}

/**
 * Read-only date cells speak the house absolute register:
 * "Jul 1" / "Jul 1, 2025" (year auto-elided when current), "Aug 9, 3:30 PM"
 * with time — one voice with Timeline and picker display values, never raw
 * ISO or verbose locale output. `dateFormat` is accepted for compatibility
 * but the register channel owns the shape.
 */
export function formatDateText(value: any, options: DateFormatOptions = {}): string {
  const { withTime } = options;
  const formatted = formatAbsoluteDate(value, { withTime });
  return formatted === '' ? asText(value) : formatted;
}

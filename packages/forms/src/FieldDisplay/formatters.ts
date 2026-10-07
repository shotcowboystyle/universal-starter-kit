/**
 * Shared read-only value formatters.
 *
 * FieldDisplay (table cells) and frappe-ui's ReadOnly field both format
 * through these so the same value renders identically in a table read cell
 * and a Frappe read-only field. Keep formatting logic here, not inline in
 * either component.
 */

import { formatAbsoluteDate, formatCurrency, formatNumber } from '@repo/theme';
import type { DateInput } from '@repo/theme';

export const EMPTY = '—';

/** What a table column or description row can hold: scalars, dates, and plain nested data. */
export type CellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | CellValue[]
  | { [key: string]: CellValue };

/** Runtime narrowing for cell values, which arrive untyped from any column. */
export const isString = <T>(value: T): value is T & string => typeof value === 'string';

export const isNumber = <T>(value: T): value is T & number => typeof value === 'number';

export const isBoolean = <T>(value: T): value is T & boolean => typeof value === 'boolean';

export const isObject = <T>(value: T): value is T & object => typeof value === 'object' && value !== null;

const isCellValue = (value: unknown): value is CellValue => {
  if (value == null) {
    return true;
  }
  return isString(value) || isNumber(value) || isBoolean(value) || isObject(value);
};

/** Parse boundary: a cell holds data, so anything else (functions, symbols, bigints) reads as empty. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parse boundary for untyped column values
export const toCellValue = (value: unknown): CellValue => (isCellValue(value) ? value : undefined);

export const asText = (v: CellValue): string => {
  if (v == null || v === '') {
    return EMPTY;
  }
  if (isString(v)) {
    return v;
  }
  if (isNumber(v) || isBoolean(v)) {
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
    // JSON.stringify throws on circular structures; fall back to the default string form.
    // oxlint-disable-next-line typescript/no-base-to-string -- last-resort rendering of an unserializable value
    return String(v);
  }
};

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
export const formatNumericText = (num: number, options: NumericFormatOptions = {}): string => {
  const { precision, currency } = options;
  if (currency !== undefined && currency !== '') {
    return formatCurrency(num, { precision, symbol: currency });
  }
  return formatNumber(num, { precision });
};

// Re-exported for existing consumers; the canonical shape lives in theme.
export { ISO_DATE_ONLY } from '@repo/theme';

const isDateInput = (value: CellValue): value is DateInput =>
  isString(value) || isNumber(value) || value instanceof Date;

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
export const formatDateText = (value: CellValue, options: DateFormatOptions = {}): string => {
  const { withTime } = options;
  const formatted = formatAbsoluteDate(isDateInput(value) ? value : undefined, { withTime });
  return formatted === '' ? asText(value) : formatted;
};

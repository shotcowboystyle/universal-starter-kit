/**
 * Coerce an arbitrary input (Date | string | number | null | undefined) into
 * a valid Date or null. Used by DatePicker / DatetimePicker / DateRangePicker /
 * MultiDatePicker to initialize internal state from `value`/`defaultValue` in
 * standalone mode.
 *
 * ISO date-only strings ("YYYY-MM-DD") parse as UTC midnight by default, so
 * `toLocaleDateString` shifts them by one day in negative-offset timezones.
 * We construct them as local midnight so the day component round-trips.
 */
// Forgiving date-only match: accepts `-`, `/`, `.`, or spaces as separators
// and 1–2 digit month/day (paste normalization — DG input-mask dial: parse
// forgivingly, never reject on separator style).
const DATE_ONLY = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/;

export function coerceToDate(input: unknown): Date | null {
  if (input == null || input === '') {
    return null;
  }
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'string') {
    // Forgiving normalize: trim padding and collapse runs of whitespace so
    // pasted values like " 2024-01-15 " or "2024 01 15" parse.
    const cleaned = input.trim().replace(/\s+/g, ' ');
    if (cleaned === '') {
      return null;
    }
    const m = cleaned.match(DATE_ONLY);
    if (m) {
      const month = Number(m[2]);
      const day = Number(m[3]);
      const d = new Date(Number(m[1]), month - 1, day);
      // Reject rollover (e.g. 2024-13-45) instead of silently shifting.
      if (d.getMonth() !== month - 1 || d.getDate() !== day) {
        return null;
      }
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(cleaned);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

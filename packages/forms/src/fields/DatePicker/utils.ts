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
const DATE_ONLY = /^(?<year>\d{4})[-/. ](?<month>\d{1,2})[-/. ](?<day>\d{1,2})$/u;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this function IS the boundary parser; it accepts raw picker input
export const coerceToDate = (input: unknown): Date | null => {
  if (input == null || input === '') {
    return null;
  }
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- coercion boundary: input is untyped
  if (typeof input === 'string') {
    // Forgiving normalize: trim padding and collapse runs of whitespace so
    // pasted values like " 2024-01-15 " or "2024 01 15" parse.
    const cleaned = input.trim().replaceAll(/\s+/gu, ' ');
    if (cleaned === '') {
      return null;
    }
    const groups = DATE_ONLY.exec(cleaned)?.groups;
    if (groups) {
      const month = Number(groups.month);
      const day = Number(groups.day);
      const d = new Date(Number(groups.year), month - 1, day);
      // Reject rollover (e.g. 2024-13-45) instead of silently shifting.
      if (d.getMonth() !== month - 1 || d.getDate() !== day) {
        return null;
      }
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(cleaned);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- coercion boundary: input is untyped
  if (typeof input === 'number') {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

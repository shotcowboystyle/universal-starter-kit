/**
 * Canonical timestamp/date registers (TIMESTAMP-REGISTER, Axiom 9).
 *
 * One formatter owns every absolute date the catalog renders — Timeline
 * timestamps, table date cells (FieldDisplay), DatePicker display values —
 * so the same data class never speaks in multiple voices ("2026-07-01" vs
 * "Aug 9, 3:30 PM" vs "11/01/2026").
 *
 * Content class picks the register (paired with the `timestampStyle` knob):
 *   - feeds/social       → relative ("2h ago") via `formatRelativeTimestamp`
 *   - tables/system      → compact absolute ("Jul 1" / "Aug 9, 3:30 PM"),
 *                          current year elided (`year: "auto"`)
 *   - editing surfaces   → compact absolute with the year always shown
 *                          ("Jul 1, 2026") — pickers are precision contexts
 *   - calendar chrome    → the day/month/time-of-day registers below
 *                          (weekday and month names, "2 PM" hour ticks,
 *                          "2:00 PM" times, "Tuesday, March 10" day names)
 *   - date axis ticks    → compact absolute with `year: "never"`, because
 *                          the surrounding chrome already states the year
 * No default may emit verbose locale output with seconds.
 */

export type DateInput = Date | string | number | null | undefined;

export interface AbsoluteDateFormatOptions {
  /**
   * `"auto"` (default) elides the current year — the display register for
   * tables, feeds, and system events. `"always"` keeps it — the editing
   * register for picker display values. `"never"` drops it — the axis-tick
   * register, where a wider label would collide with its neighbours and the
   * period header carries the year.
   */
  year?: 'auto' | 'always' | 'never';
  /** Include the time component ("Aug 9, 3:30 PM"). Default false. */
  withTime?: boolean;
  /**
   * Append seconds to the time component ("Aug 9, 3:30:45 PM"). Off by
   * default — no register emits seconds unless a surface asks. Only the
   * editing register does: a `showSeconds` picker has to display the second
   * it lets you set. Ignored without `withTime`.
   */
  seconds?: boolean;
  /**
   * Pin the 12/24-hour clock instead of following the locale — the
   * `timeFormat` contract a datetime picker exposes to its consumers.
   * Ignored without `withTime`.
   */
  hour12?: boolean;
  /** BCP-47 locale forwarded to Intl. Default: system locale. */
  locale?: string;
  /** Reference date for current-year elision (injectable for tests). */
  now?: Date;
}

/** ISO date-only shape ("YYYY-MM-DD"). */
export const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

interface CoercedDate {
  date: Date;
  /**
   * ISO date-only strings parse as UTC midnight, so local-time formatting
   * shifts them a day in negative-offset timezones. Format those in UTC.
   */
  dateOnly: boolean;
}

function coerceDateInput(value: DateInput): CoercedDate | null {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { date: value, dateOnly: false };
  }
  if (typeof value === 'string') {
    const dateOnly = ISO_DATE_ONLY.test(value.trim());
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : { date, dateOnly };
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

/**
 * Parse a date value onto the LOCAL calendar day it names — the canonical
 * parse for anything that will be positioned on a day grid (calendar cells,
 * Gantt bars, date axes) rather than merely formatted.
 *
 * A date-only string ("YYYY-MM-DD") is a calendar date carrying no timezone,
 * which is how Frappe sends `Date` fields. ECMA-262 parses that form as UTC
 * midnight, so every zone west of UTC reads it as the *previous* local day,
 * and no zone but UTC lands it on the local midnight that day-grid math tests
 * for. Those are built from local parts instead.
 *
 * Values that carry a time ("YYYY-MM-DD HH:MM:SS", ISO with an offset, epoch
 * millis) are genuine instants and keep the timezone-aware parse untouched.
 *
 * Returns null for empty and unparseable input, and for out-of-range parts
 * ("2026-13-45") rather than silently rolling them into the next month.
 */
export function parseCalendarDate(value: DateInput): Date | null {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const fromEpoch = new Date(value);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch;
  }
  const trimmed = value.trim();
  if (ISO_DATE_ONLY.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    // `new Date(50, …)` means 1950 — pin the year the string actually named.
    if (year < 100) {
      date.setFullYear(year);
    }
    if (date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }
  const parsed = new Date(trimmed.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Timezone-naive wire shapes: Frappe's `Date`, `Datetime` and `Time`. */
export type CalendarDateShape = 'date' | 'datetime' | 'time';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Serialize a date onto the LOCAL calendar parts it names — the write
 * counterpart to `parseCalendarDate`, and the only place the repo builds a
 * timezone-naive wire string.
 *
 * `"date"` emits `YYYY-MM-DD`, `"datetime"` emits `YYYY-MM-DD HH:mm:ss`, and
 * `"time"` emits `HH:mm:ss` — the shapes Frappe stores, none of which carries
 * an offset. `toISOString()` renders the UTC instant instead, so it names the
 * wrong day whenever the value's local time of day sits across the UTC date
 * boundary, and shifts a wall clock by the whole offset. Reading such a string
 * back through `parseCalendarDate` then compounds the error, because the read
 * side treats it as local.
 *
 * Accepts anything `parseCalendarDate` does, so a value already on the wire
 * round-trips unchanged; empty and unparseable input serialize to "".
 */
export function formatCalendarDate(value: DateInput, shape: CalendarDateShape = 'date'): string {
  const date = parseCalendarDate(value);
  if (!date) {
    return '';
  }
  const timePart = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  if (shape === 'time') {
    return timePart;
  }
  const datePart = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return shape === 'datetime' ? `${datePart} ${timePart}` : datePart;
}

/**
 * Compact absolute date — the house register for every absolute date.
 * "Jul 1" / "Jul 1, 2025" (year auto-elided when current), or with
 * `withTime` "Aug 9, 3:30 PM". Empty input renders "" and an unparseable
 * string passes through unchanged (honest passthrough — never invents).
 */
export function formatAbsoluteDate(value: DateInput, options: AbsoluteDateFormatOptions = {}): string {
  const coerced = coerceDateInput(value);
  if (!coerced) {
    return typeof value === 'string' ? value : '';
  }
  const { date, dateOnly } = coerced;
  const { year = 'auto', withTime = false, seconds = false, hour12, locale, now } = options;
  const referenceYear = (now ?? new Date()).getFullYear();
  const displayYear = dateOnly ? date.getUTCFullYear() : date.getFullYear();
  const intlOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };
  if (year === 'always' || (year !== 'never' && displayYear !== referenceYear)) {
    intlOptions.year = 'numeric';
  }
  if (withTime) {
    intlOptions.hour = 'numeric';
    intlOptions.minute = '2-digit';
    if (seconds) {
      intlOptions.second = '2-digit';
    }
    if (hour12 !== undefined) {
      intlOptions.hour12 = hour12;
    }
  }
  if (dateOnly) {
    intlOptions.timeZone = 'UTC';
  }
  try {
    return date.toLocaleString(locale, intlOptions);
  } catch {
    return typeof value === 'string' ? value : date.toISOString();
  }
}

/**
 * Compact absolute date-time ("Aug 9, 3:30 PM"; year added when not
 * current). The system-event register, the tooltip form for relative
 * timestamps, and — with `year: "always"` — the datetime picker display on
 * BOTH platform halves, which is why it takes `hour12` / `seconds`: the two
 * halves used to compose their own and drifted by a comma.
 */
export function formatAbsoluteDateTime(
  value: DateInput,
  options: Omit<AbsoluteDateFormatOptions, 'withTime'> = {},
): string {
  return formatAbsoluteDate(value, { ...options, withTime: true });
}

/**
 * Relative timestamp ("just now", "5m ago", "2h ago", "10 days ago") — the
 * feed/social register, selected by `timestampStyle: "relative"`.
 */
export function formatRelativeTimestamp(value: DateInput, now: number = Date.now()): string {
  if (value == null || value === '') {
    return '';
  }
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(t)) {
    return typeof value === 'string' ? value : '';
  }
  const sec = Math.floor(Math.max(0, now - t) / 1000);
  if (sec < 60) {
    return 'just now';
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `${hr}h ago`;
  }
  const day = Math.floor(hr / 24);
  if (day < 30) {
    return `${day} day${day === 1 ? '' : 's'} ago`;
  }
  const mo = Math.floor(day / 30);
  if (mo < 12) {
    return `${mo}mo ago`;
  }
  const yr = Math.floor(day / 365);
  return `${Math.max(1, yr)}y ago`;
}

/** Clock-time shape ("HH:MM" / "HH:MM:SS") — how Frappe `Time` values arrive. */
export const CLOCK_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export interface TimeOfDayFormatOptions {
  /** BCP-47 locale forwarded to Intl. Default: system locale. */
  locale?: string;
  /** Minutes ride along by default; `false` is the hour-tick register. */
  minutes?: boolean;
  /** Pin the 12/24-hour clock. Default: whatever the locale uses. */
  hour12?: boolean;
}

/**
 * Time-of-day register ("2:00 PM", or "2 PM" with `minutes: false` for
 * hour ticks) — calendar time grids, Frappe `Time` fields, and
 * "last updated" chrome. Accepts a clock-time string as well as a date,
 * and never emits seconds.
 */
export function formatTimeOfDay(value: DateInput, options: TimeOfDayFormatOptions = {}): string {
  const { locale, minutes = true, hour12 } = options;
  let date: Date | null = null;
  if (typeof value === 'string') {
    const clock = value.trim().match(CLOCK_TIME);
    if (clock) {
      const parsed = new Date(2000, 0, 1, Number(clock[1]), Number(clock[2]));
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed;
      }
    }
  }
  if (!date) {
    const coerced = coerceDateInput(value);
    if (!coerced) {
      return typeof value === 'string' ? value : '';
    }
    date = coerced.date;
  }
  const intlOptions: Intl.DateTimeFormatOptions = { hour: 'numeric' };
  if (minutes) {
    intlOptions.minute = '2-digit';
  }
  if (hour12 !== undefined) {
    intlOptions.hour12 = hour12;
  }
  try {
    return date.toLocaleTimeString(locale, intlOptions);
  } catch {
    return typeof value === 'string' ? value : '';
  }
}

export interface DayLongFormatOptions {
  locale?: string;
  /** Lead with the weekday ("Tuesday, March 10"). Default true. */
  weekday?: boolean;
  /** Append the year ("Tuesday, March 10, 2026"). Default false. */
  year?: boolean;
}

/**
 * Long day register ("Tuesday, March 10") — calendar day headers and the
 * accessible names that read a date aloud, where the compact absolute
 * register is too terse to speak.
 */
export function formatDayLong(value: DateInput, options: DayLongFormatOptions = {}): string {
  const coerced = coerceDateInput(value);
  if (!coerced) {
    return typeof value === 'string' ? value : '';
  }
  const { locale, weekday = true, year = false } = options;
  const intlOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  if (weekday) {
    intlOptions.weekday = 'long';
  }
  if (year) {
    intlOptions.year = 'numeric';
  }
  if (coerced.dateOnly) {
    intlOptions.timeZone = 'UTC';
  }
  try {
    return coerced.date.toLocaleDateString(locale, intlOptions);
  } catch {
    return typeof value === 'string' ? value : '';
  }
}

export interface MonthYearFormatOptions {
  locale?: string;
  /** `"short"` ("Mar 2026", the tick register) or `"long"` ("March 2026"). */
  month?: 'short' | 'long';
}

/** Month-year register ("Mar 2026") — period headers and month axis ticks. */
export function formatMonthYear(value: DateInput, options: MonthYearFormatOptions = {}): string {
  const coerced = coerceDateInput(value);
  if (!coerced) {
    return typeof value === 'string' ? value : '';
  }
  const { locale, month = 'short' } = options;
  const intlOptions: Intl.DateTimeFormatOptions = { month, year: 'numeric' };
  if (coerced.dateOnly) {
    intlOptions.timeZone = 'UTC';
  }
  try {
    return coerced.date.toLocaleDateString(locale, intlOptions);
  } catch {
    return typeof value === 'string' ? value : '';
  }
}

/** Day-of-month register ("10") — the densest date axis tick. */
export function formatDayOfMonth(value: DateInput, options: { locale?: string } = {}): string {
  const coerced = coerceDateInput(value);
  if (!coerced) {
    return typeof value === 'string' ? value : '';
  }
  const intlOptions: Intl.DateTimeFormatOptions = { day: 'numeric' };
  if (coerced.dateOnly) {
    intlOptions.timeZone = 'UTC';
  }
  try {
    return coerced.date.toLocaleDateString(options.locale, intlOptions);
  } catch {
    return String(coerced.date.getDate());
  }
}

export interface WeekdayNamesOptions {
  locale?: string;
  /** `"short"` ("Mon"), `"long"` ("Monday") or `"narrow"` ("M"). */
  style?: 'short' | 'long' | 'narrow';
  /** Week start, 0 = Sunday (default) — the index base callers rely on. */
  firstDay?: number;
}

/** Weekday names for calendar chrome, in week order from `firstDay`. */
export function getWeekdayNames(options: WeekdayNamesOptions = {}): string[] {
  const { locale, style = 'short', firstDay = 0 } = options;
  const formatter = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
  // 2004-01-04 is a Sunday, so day-of-week and offset line up.
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(Date.UTC(2004, 0, 4 + ((firstDay + i) % 7)))));
}

/** Month names for calendar chrome and picker headers, January first. */
export function getMonthNames(options: { locale?: string; style?: 'long' | 'short' } = {}): string[] {
  const { locale, style = 'long' } = options;
  const formatter = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => formatter.format(new Date(Date.UTC(2000, i, 1))));
}

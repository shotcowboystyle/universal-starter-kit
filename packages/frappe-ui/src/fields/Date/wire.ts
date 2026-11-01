/**
 * The Date field's Frappe wire contract, in both directions — one body shared
 * by the web half (`index.tsx`) and the native half (`index.native.tsx`), so
 * the same pick persists the same string on either platform.
 *
 * Frappe date fields are timezone-NAIVE: `Date` is a bare calendar date
 * (`YYYY-MM-DD`), `Datetime` is a bare local wall clock
 * (`YYYY-MM-DD HH:mm:ss`), `Time` is a bare clock (`HH:mm:ss`). None carries an
 * offset, so both directions build from LOCAL parts: the write half through
 * `formatCalendarDate` and the read half through the local-midnight branch
 * below, matching `parseCalendarDate` — all three in
 * `@repo/theme`, which is where the repo's one body for this
 * lives.
 *
 * Serializing through `toISOString()` instead renders the UTC instant, which
 * breaks both halves of that contract: it names the wrong calendar day whenever
 * the picked local time of day sits across the UTC date boundary (picking
 * Aug 15 at UTC+14 wrote `2026-08-14`), and it shifts every datetime by the
 * whole UTC offset, because the value is then read back as local wall clock.
 */

import { formatCalendarDate } from '@repo/theme';

export type FrappeDateFieldType = 'date' | 'datetime' | 'time';

/**
 * Serialize a picked `Date` into the wire shape for the fieldtype.
 *
 * `previousValue` is for a caller whose picker edits only the day, so that an
 * existing time part survives the edit. NEITHER half passes it any more, and
 * neither should: both now mount a picker that owns the whole value (the web
 * datetime branch uses the forms `DatetimePicker`, which preserves an existing
 * clock across a day change itself), so carrying the old time part here would
 * overwrite a time the user had just set. It stays on the contract because the
 * capability is real for a date-only writer, and it stays covered below.
 */
export const toFrappeDateValue = (date: Date, type: FrappeDateFieldType, previousValue?: string): string => {
  if (type !== 'datetime') {
    return formatCalendarDate(date, type);
  }
  const carriedTime = previousValue?.trim().split(/[ T]/u)[1];
  return `${formatCalendarDate(date, 'date')} ${carriedTime ?? formatCalendarDate(date, 'time')}`;
};

/**
 * Read a wire value back into the `Date` the picker opens on. Empty input
 * seeds on today — this is a picker's initial value, not a parse of stored
 * data, so it has no null branch.
 *
 * A bare `YYYY-MM-DD` gets an explicit local midnight, because
 * `new Date("YYYY-MM-DD")` means UTC midnight per ECMA-262 and would open the
 * picker on the previous day west of UTC. A wall clock with no offset is
 * already read as local per ES2016+.
 */
export const fromFrappeDateValue = (value: string, type: FrappeDateFieldType): Date => {
  if (!value) {
    return new Date();
  }
  if (type === 'time') {
    const [hours, minutes] = value.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 0, minutes || 0, 0, 0);
    return date;
  }
  // Accepts both "YYYY-MM-DD HH:MM" and "YYYY-MM-DDTHH:MM".
  if (type === 'datetime') {
    return new Date(value.replace(' ', 'T'));
  }
  return new Date(`${value}T00:00:00`);
};

import { describe, expect, it } from 'vitest';

import {
  formatAbsoluteDate,
  formatAbsoluteDateTime,
  formatCalendarDate,
  formatDayLong,
  formatDayOfMonth,
  formatMonthYear,
  formatRelativeTimestamp,
  formatTimeOfDay,
  getMonthNames,
  getWeekdayNames,
  parseCalendarDate,
  type DateInput,
} from './dates';

// Pin locale so assertions don't depend on the host machine.
const enUS = { locale: 'en-US' } as const;
// Reference "today" for current-year elision.
const now = new Date(2026, 7, 12); // Aug 12, 2026

describe('formatAbsoluteDate (compact absolute register)', () => {
  it('elides the current year by default (display register)', () => {
    expect(formatAbsoluteDate(new Date(2026, 6, 1), { ...enUS, now })).toBe('Jul 1');
  });

  it('adds the year when not current', () => {
    expect(formatAbsoluteDate(new Date(2025, 10, 1), { ...enUS, now })).toBe('Nov 1, 2025');
  });

  it("always shows the year for editing surfaces (year: 'always')", () => {
    expect(formatAbsoluteDate(new Date(2026, 6, 1), { ...enUS, now, year: 'always' })).toBe('Jul 1, 2026');
  });

  it('formats ISO date-only strings in UTC (no timezone day-shift)', () => {
    expect(formatAbsoluteDate('2026-07-01', { ...enUS, now })).toBe('Jul 1');
    expect(formatAbsoluteDate('2026-12-31', { ...enUS, now, year: 'always' })).toBe('Dec 31, 2026');
  });

  it('renders empty input as empty string', () => {
    expect(formatAbsoluteDate(null, enUS)).toBe('');
    expect(formatAbsoluteDate(undefined, enUS)).toBe('');
    expect(formatAbsoluteDate('', enUS)).toBe('');
  });

  it('passes unparseable strings through unchanged (honest passthrough)', () => {
    expect(formatAbsoluteDate('not-a-date', enUS)).toBe('not-a-date');
  });

  it('never emits seconds unless asked', () => {
    const out = formatAbsoluteDateTime(new Date(2026, 7, 9, 15, 30, 45), { ...enUS, now });
    expect(out).not.toMatch(/:\d{2}:\d{2}/);
  });
});

describe('formatAbsoluteDateTime (system-event register)', () => {
  it('renders the compact absolute form', () => {
    expect(formatAbsoluteDateTime(new Date(2026, 7, 9, 15, 30), { ...enUS, now })).toBe('Aug 9, 3:30 PM');
  });

  it('adds the year when not current', () => {
    expect(formatAbsoluteDateTime(new Date(2025, 7, 9, 15, 30), { ...enUS, now })).toBe('Aug 9, 2025, 3:30 PM');
  });

  // The editing register: both DatetimePicker halves format through this, so
  // the picker's timeFormat / showSeconds contract has to live here or the two
  // halves compose their own and drift (they drifted by the Intl comma).
  describe('editing register (datetime picker display)', () => {
    const at = new Date(2026, 2, 5, 14, 30, 45);

    it('is the same string both platform halves emit for the same value', () => {
      const web = formatAbsoluteDateTime(at, { ...enUS, year: 'always', hour12: true });
      const native = formatAbsoluteDateTime(at, { ...enUS, year: 'always' });
      expect(web).toBe('Mar 5, 2026, 2:30 PM');
      expect(native).toBe(web);
    });

    it('pins the 24-hour clock on request', () => {
      expect(formatAbsoluteDateTime(at, { ...enUS, year: 'always', hour12: false })).toBe('Mar 5, 2026, 14:30');
      // Midnight reads 00, not 24 — h23, the clock a picker column shows.
      expect(
        formatAbsoluteDateTime(new Date(2026, 2, 5, 0, 5), {
          ...enUS,
          year: 'always',
          hour12: false,
        }),
      ).toBe('Mar 5, 2026, 00:05');
    });

    it('appends seconds on request, in both clocks', () => {
      expect(formatAbsoluteDateTime(at, { ...enUS, year: 'always', hour12: true, seconds: true })).toBe(
        'Mar 5, 2026, 2:30:45 PM',
      );
      expect(formatAbsoluteDateTime(at, { ...enUS, year: 'always', hour12: false, seconds: true })).toBe(
        'Mar 5, 2026, 14:30:45',
      );
    });

    it('ignores the time options when there is no time component', () => {
      expect(formatAbsoluteDate(at, { ...enUS, year: 'always', hour12: false, seconds: true })).toBe('Mar 5, 2026');
    });
  });
});

describe('formatRelativeTimestamp (feed/social register)', () => {
  const base = Date.UTC(2026, 7, 12, 12, 0, 0);

  it("covers the ladder from 'just now' to years", () => {
    const at = (msAgo: number) => new Date(base - msAgo).toISOString();
    expect(formatRelativeTimestamp(at(10_000), base)).toBe('just now');
    expect(formatRelativeTimestamp(at(5 * 60_000), base)).toBe('5m ago');
    expect(formatRelativeTimestamp(at(2 * 3_600_000), base)).toBe('2h ago');
    expect(formatRelativeTimestamp(at(10 * 86_400_000), base)).toBe('10 days ago');
    expect(formatRelativeTimestamp(at(60 * 86_400_000), base)).toBe('2mo ago');
    expect(formatRelativeTimestamp(at(400 * 86_400_000), base)).toBe('1y ago');
  });

  it('passes unparseable strings through unchanged', () => {
    expect(formatRelativeTimestamp('garbage', base)).toBe('garbage');
  });
});

describe('formatTimeOfDay (time-of-day register)', () => {
  it('renders hour and minutes, never seconds', () => {
    expect(formatTimeOfDay(new Date(2026, 7, 12, 14, 30, 45), enUS)).toBe('2:30 PM');
  });

  it('drops minutes for hour ticks', () => {
    expect(formatTimeOfDay(new Date(2026, 7, 12, 14, 0), { ...enUS, minutes: false })).toBe('2 PM');
  });

  it('accepts a clock-time string — the wire shape Frappe Time fields send', () => {
    expect(formatTimeOfDay('14:30', enUS)).toBe('2:30 PM');
    expect(formatTimeOfDay('14:30:00', enUS)).toBe('2:30 PM');
  });

  it('passes unparseable strings through and renders empty input empty', () => {
    expect(formatTimeOfDay('later', enUS)).toBe('later');
    expect(formatTimeOfDay(null, enUS)).toBe('');
  });
});

describe('calendar chrome registers', () => {
  it('speaks a long day name for headers and accessible names', () => {
    expect(formatDayLong(new Date(2026, 2, 10), enUS)).toBe('Tuesday, March 10');
    expect(formatDayLong(new Date(2026, 2, 10), { ...enUS, weekday: false })).toBe('March 10');
    expect(formatDayLong(new Date(2026, 2, 10), { ...enUS, year: true })).toBe('Tuesday, March 10, 2026');
  });

  it('names months and weekdays for calendar grids', () => {
    expect(getMonthNames(enUS)[0]).toBe('January');
    expect(getMonthNames({ ...enUS, style: 'short' })[2]).toBe('Mar');
    expect(getWeekdayNames(enUS)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(getWeekdayNames({ ...enUS, firstDay: 1 })[0]).toBe('Mon');
  });
});

describe('axis-tick registers', () => {
  it('drops the year entirely so ticks keep a stable width', () => {
    expect(formatAbsoluteDate(new Date(2025, 2, 10), { ...enUS, now, year: 'never' })).toBe('Mar 10');
  });

  it('renders month-year and day-of-month ticks', () => {
    expect(formatMonthYear(new Date(2026, 2, 10), enUS)).toBe('Mar 2026');
    expect(formatMonthYear(new Date(2026, 2, 10), { ...enUS, month: 'long' })).toBe('March 2026');
    expect(formatDayOfMonth(new Date(2026, 2, 10), enUS)).toBe('10');
  });
});

// Spans UTC, two negative offsets and the far positive extreme (UTC+14), so a
// parse that leans on the host zone fails somewhere in this list.
const ZONES = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Pacific/Kiritimati'] as const;

function inZone<T>(timeZone: string, read: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return read();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
}

/**
 * Local wall-clock reading of a parse, taken INSIDE the zone — a Date is an
 * instant, so its day and hour only mean something against an ambient zone.
 */
function readLocal(timeZone: string, value: DateInput) {
  return inZone(timeZone, () => {
    const date = parseCalendarDate(value);
    if (!date) {
      return null;
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      clock: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    };
  });
}

describe('parseCalendarDate (day-grid parse)', () => {
  it('reads a date-only string as the same calendar day in every timezone', () => {
    for (const timeZone of ZONES) {
      expect({ timeZone, ...readLocal(timeZone, '2026-03-10') }).toEqual({
        timeZone,
        day: '2026-03-10',
        // Local midnight, which is what day-grid math tests for: Gantt's
        // normalizeSpanEdges only grants a date-only end its inclusive last
        // day when the edge sits exactly on midnight.
        clock: '00:00',
      });
    }
  });

  it('guards the ECMA-262 default this exists to avoid', () => {
    // `new Date("YYYY-MM-DD")` is UTC midnight, so the naive parse names the
    // previous day west of UTC. If this ever stops shifting, the test above
    // has stopped proving anything.
    const naive = inZone('America/Los_Angeles', () => new Date('2026-03-10').getDate());
    expect(naive).toBe(9);
  });

  it('keeps the timezone-aware parse for values that carry a time', () => {
    for (const timeZone of ZONES) {
      // No offset in the string — a local wall-clock reading, unchanged.
      expect(readLocal(timeZone, '2026-03-10 14:30:00')).toEqual({
        day: '2026-03-10',
        clock: '14:30',
      });
    }
    // An explicit offset names one instant, which lands on different local
    // days by design — genuine datetime semantics are untouched.
    expect(readLocal('UTC', '2026-03-10T00:00:00Z')).toEqual({ day: '2026-03-10', clock: '00:00' });
    expect(readLocal('America/Los_Angeles', '2026-03-10T00:00:00Z')).toEqual({
      day: '2026-03-09',
      clock: '17:00', // PDT — March 10 is past the 2026 DST switch
    });
  });

  it('passes Date instances and epoch millis through untouched', () => {
    const instance = new Date(2026, 2, 10, 9, 15);
    expect(parseCalendarDate(instance)).toBe(instance);
    expect(parseCalendarDate(Date.UTC(2026, 2, 10))?.toISOString()).toBe('2026-03-10T00:00:00.000Z');
  });

  it('returns null for empty, unparseable and out-of-range input', () => {
    expect(parseCalendarDate(null)).toBeNull();
    expect(parseCalendarDate(undefined)).toBeNull();
    expect(parseCalendarDate('')).toBeNull();
    expect(parseCalendarDate('not-a-date')).toBeNull();
    expect(parseCalendarDate(new Date('nonsense'))).toBeNull();
    // Rolled over rather than rejected would silently render April 14.
    expect(parseCalendarDate('2026-13-45')).toBeNull();
    expect(parseCalendarDate('2026-02-30')).toBeNull();
  });

  it('keeps a two-digit-looking year literal instead of mapping it to 19xx', () => {
    expect(inZone('UTC', () => parseCalendarDate('0050-03-10')?.getFullYear())).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// formatCalendarDate — the write counterpart to parseCalendarDate
// ---------------------------------------------------------------------------

/**
 * TWO instants, because one cannot discriminate.
 *
 * The span from UTC−7 to UTC+14 is 21 hours — under a day — so no single
 * instant has UTC disagreeing with both extremes at once. `A` is the evening
 * in Los Angeles (UTC has already rolled over); `B` is the small hours in
 * Kiritimati (UTC has not yet). Together they catch a UTC rendering in either
 * hemisphere.
 */
const INSTANT_A = '2026-08-15T05:00:00Z';
const INSTANT_B = '2026-08-14T11:00:00Z';

/** UTC day, local day, and the local wall clock the value carries per zone. */
const LOCAL_READINGS: Record<string, Record<string, { day: string; clock: string }>> = {
  [INSTANT_A]: {
    UTC: { day: '2026-08-15', clock: '05:00:00' },
    'America/Los_Angeles': { day: '2026-08-14', clock: '22:00:00' },
    'America/New_York': { day: '2026-08-15', clock: '01:00:00' },
    'Pacific/Kiritimati': { day: '2026-08-15', clock: '19:00:00' },
  },
  [INSTANT_B]: {
    UTC: { day: '2026-08-14', clock: '11:00:00' },
    'America/Los_Angeles': { day: '2026-08-14', clock: '04:00:00' },
    'America/New_York': { day: '2026-08-14', clock: '07:00:00' },
    'Pacific/Kiritimati': { day: '2026-08-15', clock: '01:00:00' },
  },
};

describe('formatCalendarDate (local-parts wire serializer)', () => {
  it('names the local calendar day at both instants in every timezone', () => {
    const rows = [INSTANT_A, INSTANT_B].flatMap((instant) =>
      ZONES.map((timeZone) => ({
        instant,
        timeZone,
        wrote: inZone(timeZone, () => formatCalendarDate(new Date(instant))),
      })),
    );
    expect(rows).toEqual(
      rows.map(({ instant, timeZone }) => ({
        instant,
        timeZone,
        wrote: LOCAL_READINGS[instant][timeZone].day,
      })),
    );
  });

  it('negative control: the toISOString() formulation fails this expectation', () => {
    // The deleted expression, verbatim, through the identical matrix. Asserting
    // the disagreements as a LIST proves two things at once: the old code is
    // wrong where the fix is right, and it agrees in the other six rows — so
    // the matrix above is not passing vacuously on instants where every zone
    // happens to land on the same day.
    const isoDay = (date: Date) => date.toISOString().slice(0, 10);
    const disagreements = [INSTANT_A, INSTANT_B]
      .flatMap((instant) =>
        ZONES.map((timeZone) =>
          inZone(timeZone, () => {
            const wrote = isoDay(new Date(instant));
            const shouldBe = LOCAL_READINGS[instant][timeZone].day;
            return wrote === shouldBe ? null : { instant, timeZone, wrote, shouldBe };
          }),
        ),
      )
      .filter(Boolean);
    expect(disagreements).toEqual([
      {
        instant: INSTANT_A,
        timeZone: 'America/Los_Angeles',
        wrote: '2026-08-15',
        shouldBe: '2026-08-14',
      },
      {
        instant: INSTANT_B,
        timeZone: 'Pacific/Kiritimati',
        wrote: '2026-08-14',
        shouldBe: '2026-08-15',
      },
    ]);
  });

  it('host guard: process.env.TZ actually moves the local reading in-process', () => {
    // Without this, a host ignoring TZ would collapse `inZone` to a no-op and
    // the matrices above would stop meaning anything. The negative control
    // alone cannot cover it — `toISOString()` is UTC on a broken host too, so
    // it would keep "failing" correctly.
    expect(inZone('America/Los_Angeles', () => new Date(INSTANT_A).getDate())).toBe(14);
    expect(inZone('Pacific/Kiritimati', () => new Date(INSTANT_B).getDate())).toBe(15);
  });

  it('writes the local wall clock for datetime and time shapes', () => {
    for (const instant of [INSTANT_A, INSTANT_B]) {
      for (const timeZone of ZONES) {
        const { day, clock } = LOCAL_READINGS[instant][timeZone];
        expect({
          instant,
          timeZone,
          datetime: inZone(timeZone, () => formatCalendarDate(new Date(instant), 'datetime')),
          time: inZone(timeZone, () => formatCalendarDate(new Date(instant), 'time')),
        }).toEqual({ instant, timeZone, datetime: `${day} ${clock}`, time: clock });
      }
    }
  });

  it('negative control: toISOString() shifts a datetime by the whole offset', () => {
    // The other deleted branch: `.slice(0, 16).replace("T", " ")`. Reading it
    // back as local wall clock walks the instant forward on every save.
    const isoDatetime = (date: Date) => date.toISOString().slice(0, 16).replace('T', ' ');
    expect(inZone('America/Los_Angeles', () => isoDatetime(new Date(INSTANT_A)))).toBe('2026-08-15 05:00');
    expect(inZone('America/Los_Angeles', () => formatCalendarDate(new Date(INSTANT_A), 'datetime'))).toBe(
      '2026-08-14 22:00:00',
    );
  });

  it('round-trips through parseCalendarDate in every timezone', () => {
    for (const timeZone of ZONES) {
      for (const wire of ['2026-08-15', '2026-08-15 14:30:00']) {
        const shape = wire.includes(':') ? 'datetime' : 'date';
        expect({
          timeZone,
          wire,
          back: inZone(timeZone, () => formatCalendarDate(wire, shape)),
        }).toEqual({ timeZone, wire, back: wire });
      }
    }
  });

  it('serializes the input shapes the call sites hand it', () => {
    // Built AND read inside the zone: a Date is an instant, so constructing it
    // on the host clock and reading it at UTC+14 would name a different day.
    const at = (make: () => DateInput, shape?: 'date' | 'datetime' | 'time') =>
      inZone('Pacific/Kiritimati', () => formatCalendarDate(make(), shape));
    const picked = () => new Date(2026, 7, 15, 14, 30, 5);
    // A Date — what every replaced copy took.
    expect(at(picked)).toBe('2026-08-15');
    expect(at(picked, 'datetime')).toBe('2026-08-15 14:30:05');
    expect(at(picked, 'time')).toBe('14:30:05');
    // Already on the wire — idempotent, not shifted a day by a UTC re-read.
    expect(at(() => '2026-08-15')).toBe('2026-08-15');
    expect(at(() => '2026-08-15 14:30:05', 'datetime')).toBe('2026-08-15 14:30:05');
    // Empty and unparseable are "", the honest passthrough the formatters use.
    expect(at(() => null)).toBe('');
    expect(at(() => undefined)).toBe('');
    expect(at(() => '')).toBe('');
    expect(at(() => 'not-a-date')).toBe('');
    expect(at(() => new Date('nonsense'))).toBe('');
  });
});

// ---------------------------------------------------------------------------
// The consolidation: one body where there were eight
// ---------------------------------------------------------------------------

/**
 * Each replaced copy's string-building body, pasted VERBATIM from the tree
 * before this change. The point is not that they look alike — it is that the
 * canonical helper emits the same bytes for the same input, so repointing the
 * call sites moved no behavior.
 */
const COPIES = {
  // public/frappe-ui/src/fields/Date/wire.ts — toFrappeDateValue
  'frappe-ui wire.ts': (date: Date, shape: string) => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const datePart = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    const timePart = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
    if (shape === 'time') {
      return timePart;
    }
    if (shape === 'datetime') {
      return `${datePart} ${timePart}`;
    }
    return datePart;
  },
  // public/frappe-ui/src/FrappeCalendar.tsx — toFrappeFieldValue
  'frappe-ui FrappeCalendar.tsx': (next: Date, shape: string) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
    if (shape === 'datetime') {
      return `${datePart} ${pad(next.getHours())}:${pad(next.getMinutes())}:${pad(next.getSeconds())}`;
    }
    return datePart;
  },
  // public/frappe-ui/src/FrappeGantt.tsx — toFrappeFieldValue (identical body)
  'frappe-ui FrappeGantt.tsx': (next: Date, shape: string) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
    if (shape === 'datetime') {
      return `${datePart} ${pad(next.getHours())}:${pad(next.getMinutes())}:${pad(next.getSeconds())}`;
    }
    return datePart;
  },
  // public/frappe-ui/src/FrappeReportView.tsx — toFrappeDate
  'frappe-ui FrappeReportView.tsx': (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },
  // admin app CalendarView.tsx — toFrappeDateValue
  'backoffice CalendarView.tsx': (date: Date, shape: string) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    if (shape !== 'datetime') {
      return datePart;
    }
    return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },
  // admin app dashboard-data.tsx — isoDate
  'backoffice dashboard-data.tsx': (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },
  // admin app formLayout.ts — todayISO / nowTime
  'backoffice formLayout.ts': (now: Date, shape: string) => {
    if (shape === 'time') {
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  },
  // admin app quickEntryPlan.ts — todayISO
  'backoffice quickEntryPlan.ts': (now: Date) => {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  },
  // public/components/src/views/Calendar.tsx — formatDateKey
  'components Calendar.tsx': (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
} satisfies Record<string, (date: Date, shape: string) => string>;

/** Which shapes each copy could emit — nothing is claimed beyond that. */
const COPY_SHAPES: Record<keyof typeof COPIES, readonly ('date' | 'datetime' | 'time')[]> = {
  'frappe-ui wire.ts': ['date', 'datetime', 'time'],
  'frappe-ui FrappeCalendar.tsx': ['date', 'datetime'],
  'frappe-ui FrappeGantt.tsx': ['date', 'datetime'],
  'frappe-ui FrappeReportView.tsx': ['date'],
  'backoffice CalendarView.tsx': ['date', 'datetime'],
  'backoffice dashboard-data.tsx': ['date'],
  'backoffice formLayout.ts': ['date', 'time'],
  'backoffice quickEntryPlan.ts': ['date'],
  'components Calendar.tsx': ['date'],
};

describe('formatCalendarDate is byte-identical to the copies it replaced', () => {
  // Every Date the copies could be handed: instants either side of the UTC
  // date boundary, a midnight, a zero-padding case, and the unpadded-year
  // quirk all nine shared (`${getFullYear()}` never pads below 1000).
  const SAMPLES = [
    new Date(INSTANT_A),
    new Date(INSTANT_B),
    new Date(2026, 7, 15, 0, 0, 0),
    new Date(2026, 0, 5, 9, 8, 7),
    new Date(2026, 11, 31, 23, 59, 59),
    (() => {
      const early = new Date(2026, 2, 10);
      early.setFullYear(99);
      return early;
    })(),
  ];

  for (const [name, copy] of Object.entries(COPIES)) {
    it(name, () => {
      const disagreements: unknown[] = [];
      for (const timeZone of ZONES) {
        for (const sample of SAMPLES) {
          for (const shape of COPY_SHAPES[name as keyof typeof COPIES]) {
            inZone(timeZone, () => {
              const was = copy(sample, shape);
              const now = formatCalendarDate(sample, shape);
              if (was !== now) {
                disagreements.push({ timeZone, shape, was, now });
              }
            });
          }
        }
      }
      expect(disagreements).toEqual([]);
    });
  }

  it('the samples are discriminating — a UTC rendering would fail this', () => {
    // Guards the loop above: if every sample landed on the same day in every
    // zone, "byte-identical" would be true of a broken helper too.
    const utcRendering = (date: Date) => date.toISOString().slice(0, 10);
    const disagreements = ZONES.flatMap((timeZone) =>
      SAMPLES.filter((sample) => inZone(timeZone, () => formatCalendarDate(sample)) !== utcRendering(sample)),
    );
    expect(disagreements.length).toBeGreaterThan(0);
  });
});

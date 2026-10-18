/**
 * Date filtering across timezones, for the case the rest of the suite never
 * exercises: rows carrying a DATE-ONLY value.
 *
 * Every fixture elsewhere in this folder stamps rows with `toISOString()`, so
 * both sides of every comparison were full instants and the filter looked
 * correct. A Frappe `Date` column — and any CSV, API or fixture that stores a
 * calendar day — sends bare `YYYY-MM-DD`, which ECMA-262 parses as UTC
 * midnight. The relative windows (`isToday`, `isThisWeek`, …) are built from
 * LOCAL parts, so the two sides disagreed by a day and the filter dropped or
 * admitted a whole day of rows.
 *
 * Each matrix below is paired with a negative control that runs the old
 * formulation through the identical expectation, asserting the exact set of
 * rows where it disagrees. That proves the fix discriminates, and that the
 * matrix is not passing vacuously on instants where every zone lands on the
 * same day.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyFilterToValue } from '../../utils/filter-utils';

import { applyDateFilter, resolveDateFilterRange } from './index';

// Spans UTC, two negative offsets and the far positive extreme (UTC+14), so a
// comparison that leans on the host zone fails somewhere in this list.
const ZONES = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Pacific/Kiritimati'] as const;

const inZone = <T>(timeZone: string, read: () => T): T => {
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
};

/**
 * Two frozen instants, because the span from UTC−7 to UTC+14 is 21 hours —
 * under a day — so no single instant has UTC disagreeing with both extremes.
 * `A` is late evening in Los Angeles; `B` is the small hours in Kiritimati.
 */
const INSTANT_A = '2026-08-15T05:00:00Z';
const INSTANT_B = '2026-08-14T11:00:00Z';
const INSTANTS = [INSTANT_A, INSTANT_B] as const;

/** The local calendar day each instant names, per zone. */
const LOCAL_TODAY = {
  [INSTANT_A]: {
    UTC: '2026-08-15',
    'America/Los_Angeles': '2026-08-14',
    'America/New_York': '2026-08-15',
    'Pacific/Kiritimati': '2026-08-15',
  },
  [INSTANT_B]: {
    UTC: '2026-08-14',
    'America/Los_Angeles': '2026-08-14',
    'America/New_York': '2026-08-14',
    'Pacific/Kiritimati': '2026-08-15',
  },
} satisfies Record<string, Record<(typeof ZONES)[number], string>>;

/** Rows are bare calendar days, the shape a Frappe `Date` column sends. */
const DATE_ONLY_ROWS = ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'].map((day) => ({
  id: day,
  due: day,
}));

/** The row-parsing formulation this fix replaced, kept as the control. */
const naiveApplyIsToday = (rows: typeof DATE_ONLY_ROWS) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return rows.filter((row) => new Date(row.due).toDateString() === today.toDateString());
};

/** The shipped "Last 7 Days" preset: a rolling window of real instants. */
const lastSevenDays = () => ({
  operator: 'isBetween' as const,
  values: [new Date(Date.now() - 7 * 86_400_000).toISOString(), new Date().toISOString()] as [string, string],
});

// The filter UI hands back `Date` objects built from local parts while rows
// carry date-only strings, so the two sides used to be parsed differently.
const sameDayPick = () => new Date(2026, 7, 15);

const naiveCompare = (value: string, filterVal: Date, op: 'after' | 'before') =>
  op === 'after' ? new Date(value) >= new Date(filterVal) : new Date(value) <= new Date(filterVal);

describe('applyDateFilter — a date-only row is the day it names', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('isToday matches the local calendar day at both instants, in every zone', () => {
    const rows = INSTANTS.flatMap((instant) =>
      ZONES.map((timeZone) =>
        inZone(timeZone, () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date(instant));
          const matched = applyDateFilter(DATE_ONLY_ROWS, 'due', { operator: 'isToday' });
          vi.useRealTimers();
          return { instant, timeZone, matched: matched.map((row) => row.id) };
        }),
      ),
    );
    expect(rows).toStrictEqual(
      rows.map(({ instant, timeZone }) => ({
        instant,
        timeZone,
        matched: [LOCAL_TODAY[instant][timeZone]],
      })),
    );
  });

  it("negative control: the UTC-midnight parse returns TOMORROW's row west of UTC", () => {
    const disagreements = INSTANTS.flatMap((instant) =>
      ZONES.map((timeZone) =>
        inZone(timeZone, () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date(instant));
          const matched = naiveApplyIsToday(DATE_ONLY_ROWS).map((row) => row.id);
          vi.useRealTimers();
          const shouldBe = [LOCAL_TODAY[instant][timeZone]];
          return matched.join(',') === shouldBe.join(',') ? null : { instant, timeZone, matched, shouldBe };
        }),
      ),
    ).filter(Boolean);
    // A date-only row parsed as UTC midnight lands mid-afternoon of the
    // PREVIOUS local day in any negative-offset zone, so "today" picks up the
    // row stamped tomorrow and misses the one stamped today. East of UTC the
    // instant stays inside the same local day (the offset is under 24h), which
    // is why this only ever broke the Americas — and why it shipped.
    expect(disagreements).toStrictEqual([
      {
        instant: INSTANT_A,
        timeZone: 'America/Los_Angeles',
        matched: ['2026-08-15'],
        shouldBe: ['2026-08-14'],
      },
      {
        instant: INSTANT_A,
        timeZone: 'America/New_York',
        matched: ['2026-08-16'],
        shouldBe: ['2026-08-15'],
      },
      {
        instant: INSTANT_B,
        timeZone: 'America/Los_Angeles',
        matched: ['2026-08-15'],
        shouldBe: ['2026-08-14'],
      },
      {
        instant: INSTANT_B,
        timeZone: 'America/New_York',
        matched: ['2026-08-15'],
        shouldBe: ['2026-08-14'],
      },
    ]);
  });

  it('host guard: process.env.TZ actually moves the local reading in-process', () => {
    // Without this a host ignoring TZ would collapse `inZone` to a no-op and
    // the matrices above would stop meaning anything.
    expect(inZone('America/Los_Angeles', () => new Date(INSTANT_A).getDate())).toBe(14);
    expect(inZone('Pacific/Kiritimati', () => new Date(INSTANT_B).getDate())).toBe(15);
  });
});

describe('applyDateFilter — an instant comparand against a date-only row', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes today's row in every zone", () => {
    const rows = INSTANTS.flatMap((instant) =>
      ZONES.map((timeZone) =>
        inZone(timeZone, () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date(instant));
          const matched = applyDateFilter(DATE_ONLY_ROWS, 'due', lastSevenDays());
          vi.useRealTimers();
          return {
            instant,
            timeZone,
            includesToday: matched.some((row) => row.id === LOCAL_TODAY[instant][timeZone]),
          };
        }),
      ),
    );
    expect(rows).toStrictEqual(rows.map((row) => ({ ...row, includesToday: true })));
  });

  it("negative control: UTC midnight puts today's row in the FUTURE east of UTC", () => {
    // At UTC+14 before 14:00 local, UTC midnight of today's date is still
    // ahead of `now`, so a window ending at `now` excluded the very day the
    // user is looking at. This is the mirror of the negative-offset symptom
    // above, and the pair is why both instants are needed.
    const excluded = INSTANTS.flatMap((instant) =>
      ZONES.map((timeZone) =>
        inZone(timeZone, () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date(instant));
          const { values } = lastSevenDays();
          const today = LOCAL_TODAY[instant][timeZone];
          const naive = new Date(today);
          const inWindow = naive >= new Date(values[0]) && naive <= new Date(values[1]);
          vi.useRealTimers();
          return inWindow ? null : { instant, timeZone, droppedRow: today };
        }),
      ),
    ).filter(Boolean);
    expect(excluded).toStrictEqual([{ instant: INSTANT_B, timeZone: 'Pacific/Kiritimati', droppedRow: '2026-08-15' }]);
  });
});

describe('resolveDateFilterRange — the pickers open on the day the filter names', () => {
  it('resolves a date-only comparand to local midnight in every zone', () => {
    for (const timeZone of ZONES) {
      const resolved = inZone(timeZone, () => {
        const { start } = resolveDateFilterRange({ operator: 'is', value: '2026-08-15' });
        return {
          timeZone,
          day: start?.getDate(),
          month: start?.getMonth(),
          hour: start?.getHours(),
        };
      });
      expect(resolved).toStrictEqual({ timeZone, day: 15, month: 7, hour: 0 });
    }
  });

  it('negative control: the bare parse opens the picker a day early west of UTC', () => {
    expect(inZone('America/Los_Angeles', () => new Date('2026-08-15').getDate())).toBe(14);
  });

  it('leaves an instant comparand on its instant', () => {
    // Genuine datetimes keep the timezone-aware parse — only the date-only
    // branch moved.
    const iso = '2026-08-15T05:00:00Z';
    for (const timeZone of ZONES) {
      expect(inZone(timeZone, () => resolveDateFilterRange({ operator: 'is', value: iso }).start?.toISOString())).toBe(
        '2026-08-15T05:00:00.000Z',
      );
    }
  });
});

describe('applyFilterToValue — a date-only row against a locally-picked comparand', () => {
  it("orders a row on the comparand's own day as on-or-after AND on-or-before", () => {
    for (const timeZone of ZONES) {
      expect(
        inZone(timeZone, () => ({
          timeZone,
          onOrAfter: applyFilterToValue('2026-08-15', { operator: 'isOnOrAfter', value: sameDayPick() }, 'date'),
          onOrBefore: applyFilterToValue('2026-08-15', { operator: 'isOnOrBefore', value: sameDayPick() }, 'date'),
        })),
      ).toStrictEqual({ timeZone, onOrAfter: true, onOrBefore: true });
    }
  });

  it('negative control: parsing the two sides apart breaks in BOTH hemispheres', () => {
    const disagreements = ZONES.flatMap((timeZone) =>
      inZone(timeZone, () => {
        const rows: unknown[] = [];
        if (!naiveCompare('2026-08-15', sameDayPick(), 'after')) {
          rows.push({ timeZone, operator: 'isOnOrAfter', matched: false });
        }
        if (!naiveCompare('2026-08-15', sameDayPick(), 'before')) {
          rows.push({ timeZone, operator: 'isOnOrBefore', matched: false });
        }
        return rows;
      }),
    );
    // West of UTC the UTC-midnight row sorts BEFORE local midnight of the same
    // day, so "on or after today" loses it; east of UTC it sorts after, so
    // "on or before today" loses it. UTC agrees with both, which is why the
    // comparison read as correct wherever it was written.
    expect(disagreements).toStrictEqual([
      { timeZone: 'America/Los_Angeles', operator: 'isOnOrAfter', matched: false },
      { timeZone: 'America/New_York', operator: 'isOnOrAfter', matched: false },
      { timeZone: 'Pacific/Kiritimati', operator: 'isOnOrBefore', matched: false },
    ]);
  });

  it('keeps ordering genuine instants untouched', () => {
    for (const timeZone of ZONES) {
      expect(
        inZone(timeZone, () =>
          applyFilterToValue('2026-08-15T05:00:00Z', { operator: 'isAfter', value: '2026-08-15T04:00:00Z' }, 'date'),
        ),
      ).toBe(true);
    }
  });
});

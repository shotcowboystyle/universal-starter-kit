/**
 * The Date field's Frappe wire contract, proved in both directions across
 * timezones — the WRITE counterpart to `parseCalendarDate`'s matrix in
 * `@repo/theme` (tests/dateParsing.spec.tsx covers the read side
 * through the two Frappe views).
 *
 * The field used to serialize picks with `toISOString()`, which renders the
 * UTC instant rather than the timezone-naive local value Frappe stores. Each
 * assertion below is paired with a negative control running that old
 * formulation through the same expectation, so a matrix that stopped
 * discriminating — because the host stopped honoring `TZ`, say — fails
 * loudly instead of passing vacuously.
 */

import { describe, expect, it } from 'vitest';

import { fromFrappeDateValue, toFrappeDateValue } from './wire';

// Spans UTC, two negative offsets and the far positive extreme (UTC+14), so a
// serializer that leans on the host zone fails somewhere in this list.
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

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The formulation this fix replaced, kept as the negative control. */
const isoWireValue = (date: Date, type: 'date' | 'datetime'): string =>
  type === 'datetime' ? date.toISOString().slice(0, 16).replace('T', ' ') : date.toISOString().slice(0, 10);

/**
 * The two shapes of Date the picker hands back, because which one it is
 * decides the DIRECTION of the old defect:
 *   - `midnight` — the field held a value, so the picker was seeded from it;
 *   - `evening`  — the field was empty, so the picker was seeded with
 *                  `new Date()` and the pick carries the current wall clock.
 * Both name Aug 15 2026 on the user's calendar.
 */
const DATE_PICKS = {
  midnight: () => new Date(2026, 7, 15),
  evening: () => new Date(2026, 7, 15, 18, 30),
} as const;

describe('toFrappeDateValue — a date-only pick round-trips as a calendar date', () => {
  it.each(['midnight', 'evening'] as const)(
    'persists the day the user picked in every timezone (picker held %s)',
    (pick) => {
      for (const timeZone of ZONES) {
        const result = inZone(timeZone, () => {
          const wire = toFrappeDateValue(DATE_PICKS[pick](), 'date');
          // Read it straight back: write and read must agree, or a no-op
          // edit silently rewrites the document (the drag-move defect the
          // read-path fix found on the Gantt).
          return { timeZone, wire, readsBackAs: localDay(fromFrappeDateValue(wire, 'date')) };
        });
        expect(result).toStrictEqual({
          timeZone,
          wire: '2026-08-15',
          readsBackAs: '2026-08-15',
        });
      }
    },
  );

  it('negative control: the ISO formulation writes a different day, both ways', () => {
    // UTC+14 before local noon: the UTC day is still yesterday.
    expect(inZone('Pacific/Kiritimati', () => isoWireValue(DATE_PICKS.midnight(), 'date'))).toBe('2026-08-14');
    // UTC−7 after local 17:00: the UTC day has already rolled over.
    expect(inZone('America/Los_Angeles', () => isoWireValue(DATE_PICKS.evening(), 'date'))).toBe('2026-08-16');
    // ...and it agrees with the fixed body exactly where the offset cannot
    // reach across the date boundary, which is why this shipped for so long.
    expect(inZone('America/New_York', () => isoWireValue(DATE_PICKS.evening(), 'date'))).toBe('2026-08-15');
  });
});

describe('toFrappeDateValue — a datetime pick preserves the instant', () => {
  it('round-trips to the same instant and the same wall clock in every timezone', () => {
    for (const timeZone of ZONES) {
      const result = inZone(timeZone, () => {
        const picked = new Date(2026, 7, 15, 15, 0, 0);
        const wire = toFrappeDateValue(picked, 'datetime');
        const readBack = fromFrappeDateValue(wire, 'datetime');
        return {
          timeZone,
          wire,
          // The instant itself — not merely the digits.
          instantPreserved: readBack.getTime() === picked.getTime(),
          readsBackAtHour: readBack.getHours(),
        };
      });
      expect(result).toStrictEqual({
        timeZone,
        wire: '2026-08-15 15:00:00',
        instantPreserved: true,
        readsBackAtHour: 15,
      });
    }
  });

  it('negative control: the ISO formulation shifts the instant by the whole offset', () => {
    const shifted = inZone('America/Los_Angeles', () => {
      const picked = new Date(2026, 7, 15, 15, 0, 0);
      const wire = isoWireValue(picked, 'datetime');
      const readBack = fromFrappeDateValue(wire, 'datetime');
      return {
        wire,
        instantPreserved: readBack.getTime() === picked.getTime(),
        driftHours: (readBack.getTime() - picked.getTime()) / 3_600_000,
      };
    });
    // 15:00 picked in Los Angeles was persisted as 22:00 and read back as
    // 22:00 LOCAL — seven hours later than the user chose, every save.
    expect(shifted).toStrictEqual({ wire: '2026-08-15 22:00', instantPreserved: false, driftHours: 7 });
  });

  // `previousValue` has no shipped caller since the web datetime branch moved
  // onto a picker that owns the whole value — kept because it is an exported
  // capability for any date-only writer, and untested capabilities rot.
  it('keeps an existing time part when a caller says only the day was edited', () => {
    for (const separator of [' ', 'T']) {
      expect(
        inZone('Pacific/Kiritimati', () =>
          toFrappeDateValue(new Date(2026, 7, 15), 'datetime', `2026-03-05${separator}14:30:00`),
        ),
      ).toBe('2026-08-15 14:30:00');
    }
  });
});

describe('toFrappeDateValue — a time pick is a local clock', () => {
  it('emits local HH:mm:ss, never the UTC clock', () => {
    for (const timeZone of ZONES) {
      expect({
        timeZone,
        wire: inZone(timeZone, () => toFrappeDateValue(new Date(2026, 7, 15, 15, 45, 30), 'time')),
      }).toStrictEqual({ timeZone, wire: '15:45:30' });
    }
  });
});

/**
 * The body this function carried before it moved onto `formatCalendarDate`
 * in `@repo/theme`, pasted verbatim. Consolidating the repo's
 * date serializers was a de-duplication, not a behavior change, and this is
 * what makes that claim checkable rather than asserted.
 */
const pad2 = (n: number) => String(n).padStart(2, '0');

const previousBody = (date: Date, type: 'date' | 'datetime' | 'time', previousValue?: string): string => {
  const datePart = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const timePart = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  if (type === 'time') {
    return timePart;
  }
  if (type === 'datetime') {
    return `${datePart} ${previousValue?.trim().split(/[ T]/u)[1] ?? timePart}`;
  }
  return datePart;
};

describe('toFrappeDateValue delegates without changing a byte', () => {
  // Every `previousValue` the web half can hand the datetime branch, including
  // the shapes with no time part at all (where the pick's own clock is used).
  const CARRIED = [
    undefined,
    '',
    '2026-03-05',
    '2026-03-05 14:30:00',
    '2026-03-05T14:30:00',
    '2026-03-05 14:30:00.123456',
    '  2026-03-05 09:00:00  ',
  ];

  it('emits the identical string for every pick, shape and carried value', () => {
    const disagreements: unknown[] = [];
    for (const timeZone of ZONES) {
      inZone(timeZone, () => {
        for (const make of [
          () => new Date(2026, 7, 15),
          () => new Date(2026, 7, 15, 18, 30),
          () => new Date(2026, 7, 15, 15, 0, 0),
          () => new Date(2026, 0, 5, 9, 8, 7),
          () => new Date(2026, 11, 31, 23, 59, 59),
        ]) {
          for (const type of ['date', 'datetime', 'time'] as const) {
            for (const carried of CARRIED) {
              const was = previousBody(make(), type, carried);
              const now = toFrappeDateValue(make(), type, carried);
              if (was !== now) {
                disagreements.push({ timeZone, type, carried, was, now });
              }
            }
          }
        }
      });
    }
    expect(disagreements).toStrictEqual([]);
  });
});

describe('fromFrappeDateValue — the read side is local too', () => {
  it('opens a bare YYYY-MM-DD on local midnight in every timezone', () => {
    for (const timeZone of ZONES) {
      expect(
        inZone(timeZone, () => {
          const date = fromFrappeDateValue('2026-08-15', 'date');
          return { timeZone, day: localDay(date), hour: date.getHours() };
        }),
      ).toStrictEqual({ timeZone, day: '2026-08-15', hour: 0 });
    }
  });

  it('negative control: the bare ECMA-262 parse still shifts west of UTC', () => {
    // If this ever stops shifting, the test above has stopped proving anything.
    expect(inZone('America/Los_Angeles', () => new Date('2026-08-15').getDate())).toBe(14);
  });
});

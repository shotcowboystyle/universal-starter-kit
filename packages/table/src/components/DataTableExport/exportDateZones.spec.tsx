/**
 * What the export writes for a date-bearing column, across timezones.
 *
 * Every date cell in the grid displays through `formatAbsoluteDate`, which
 * renders a `Date` in LOCAL time. The export rendered the same value with
 * `toISOString()` — the UTC instant — so the exported date part named a
 * different calendar day than the cell it came from whenever the value's
 * local time of day sat across the UTC date boundary: the day BEFORE east of
 * Greenwich, the day after west of it. A CSV that disagrees with the grid is
 * what people reconcile against, so the day is the assertion here.
 *
 * Two frozen instants, because the span from UTC−7 to UTC+14 is 21 hours —
 * under a day — so no single instant has UTC disagreeing with both extremes.
 * Each matrix is paired with a negative control that runs the old
 * `toISOString()` formulation through the identical expectation and asserts
 * the exact set of cells where it disagrees, so the matrix cannot pass
 * vacuously on values every zone happens to render the same way.
 */

import { renderWithProviders } from '@repo/test-utils';
import { formatAbsoluteDate } from '@repo/theme';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTableExport } from './index';

// Spans UTC, two negative offsets and the far positive extreme (UTC+14), so a
// serializer that leans on the host zone fails somewhere in this list.
const ZONES = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Pacific/Kiritimati'] as const;
type Zone = (typeof ZONES)[number];

/** Late evening in Los Angeles; still the 15th everywhere else. */
const INSTANT_A = '2026-08-15T05:00:00.000Z';
/** The small hours of the 15th in Kiritimati; still the 14th everywhere else. */
const INSTANT_B = '2026-08-14T11:00:00.000Z';

/**
 * What the export must write, per zone. The `day` column is a calendar day —
 * a `datepicker` hands back local midnight — and the two instant columns are
 * real timestamps, kept as full ISO-8601 but stamped with the local offset so
 * the day they lead with is the day the cell shows.
 */
const EXPECTED: Record<Zone, { day: string; instantA: string; instantB: string }> = {
  UTC: {
    day: '2026-08-15',
    instantA: '2026-08-15T05:00:00.000Z',
    instantB: '2026-08-14T11:00:00.000Z',
  },
  'America/Los_Angeles': {
    day: '2026-08-15',
    instantA: '2026-08-14T22:00:00.000-07:00',
    instantB: '2026-08-14T04:00:00.000-07:00',
  },
  'America/New_York': {
    day: '2026-08-15',
    instantA: '2026-08-15T01:00:00.000-04:00',
    instantB: '2026-08-14T07:00:00.000-04:00',
  },
  'Pacific/Kiritimati': {
    day: '2026-08-15',
    instantA: '2026-08-15T19:00:00.000+14:00',
    instantB: '2026-08-15T01:00:00.000+14:00',
  },
};

const mockCreateObjectURL = vi.fn(() => 'mock-url');

beforeAll(() => {
  Object.defineProperty(window.URL, 'createObjectURL', {
    writable: true,
    value: mockCreateObjectURL,
  });
  Object.defineProperty(window.URL, 'revokeObjectURL', { writable: true, value: vi.fn() });
});

const originalTZ = process.env.TZ;
afterEach(() => {
  if (originalTZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTZ;
  }
});

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

/** The single data row of the CSV the component just wrote. */
async function exportRow(data: any[], columns: any[]): Promise<string[]> {
  mockCreateObjectURL.mockClear();
  renderWithProviders(
    <DataTableExport
      data={data}
      columns={columns}
    />,
  );
  fireEvent.click(screen.getByText('CSV'));
  await waitFor(() => {
    expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });
  const blob = (mockCreateObjectURL.mock.calls.at(-1) as unknown as [Blob])[0];
  const text = await blob.text();
  return text.trim().split('\n')[1].split(',');
}

/** The old formulation, verbatim, for the negative controls. */
function legacyExportValue(value: any): string {
  if (value == null) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

const dayPart = (iso: string) => iso.slice(0, 10);

describe('DataTableExport date rendering across timezones', () => {
  describe.each(ZONES)('%s', (zone) => {
    beforeEach(() => {
      process.env.TZ = zone;
    });

    it('writes the calendar day the cell displays, for days and for instants', async () => {
      // What a DatePicker hands back: local midnight standing in for a day.
      const day = new Date(2026, 7, 15);
      const row = {
        day,
        instantA: new Date(INSTANT_A),
        instantB: new Date(INSTANT_B),
        // No declared field — the export cannot know the class, so it keeps a
        // full instant, and still leads with the displayed day.
        loose: new Date(INSTANT_A),
      };
      const columns = [
        { accessorKey: 'day', header: 'Day', field: 'datepicker' as const },
        { accessorKey: 'instantA', header: 'A', field: 'datetimepicker' as const },
        { accessorKey: 'instantB', header: 'B', field: 'datetimepicker' as const },
        { accessorKey: 'loose', header: 'Loose' },
      ];

      const [dayCell, aCell, bCell, looseCell] = await exportRow([row], columns);

      expect(dayCell).toBe(EXPECTED[zone].day);
      expect(aCell).toBe(EXPECTED[zone].instantA);
      expect(bCell).toBe(EXPECTED[zone].instantB);
      expect(looseCell).toBe(EXPECTED[zone].instantA);
    });

    it('agrees with the display register on every date-bearing column', async () => {
      const row = {
        day: new Date(2026, 7, 15),
        instantA: new Date(INSTANT_A),
        instantB: new Date(INSTANT_B),
      };
      const columns = [
        { accessorKey: 'day', header: 'Day', field: 'datepicker' as const },
        { accessorKey: 'instantA', header: 'A', field: 'datetimepicker' as const },
        { accessorKey: 'instantB', header: 'B', field: 'datetimepicker' as const },
      ];

      const cells = await exportRow([row], columns);

      // The exported day, read back through the house register, is the label
      // the cell renders for the same value. Stated in the register's own
      // terms rather than by re-deriving local parts the way the fix does.
      for (const [index, key] of (['day', 'instantA', 'instantB'] as const).entries()) {
        expect(formatAbsoluteDate(dayPart(cells[index]), { year: 'always' })).toBe(
          formatAbsoluteDate(row[key], { year: 'always' }),
        );
      }
    });

    it('keeps instants lossless — the exported string re-reads as the same moment', async () => {
      const instants = [new Date(INSTANT_A), new Date(INSTANT_B)];
      const cells = await exportRow(
        [{ a: instants[0], b: instants[1] }],
        [
          { accessorKey: 'a', header: 'A', field: 'datetimepicker' as const },
          { accessorKey: 'b', header: 'B', field: 'datetimepicker' as const },
        ],
      );

      expect(cells.map((cell) => new Date(cell).getTime())).toEqual(instants.map((instant) => instant.getTime()));
    });
  });

  it('host guard: TZ actually moves the in-process reading', () => {
    // Without this, a host that stopped honouring TZ would make every matrix
    // above pass by rendering the same thing four times. The negative control
    // cannot cover it — toISOString() is UTC on a broken host too, so it would
    // keep "disagreeing" in exactly the right places.
    expect(inZone('America/Los_Angeles', () => new Date(INSTANT_A).getDate())).toBe(14);
    expect(inZone('Pacific/Kiritimati', () => new Date(INSTANT_B).getDate())).toBe(15);
    expect(inZone('Pacific/Kiritimati', () => new Date(2026, 7, 15).toISOString().slice(0, 10))).toBe('2026-08-14');
  });

  it('negative control: the old toISOString() names the wrong day in exactly three cells', () => {
    const disagreements: string[] = [];
    for (const zone of ZONES) {
      inZone(zone, () => {
        const cells = {
          day: { value: new Date(2026, 7, 15), want: EXPECTED[zone].day },
          instantA: { value: new Date(INSTANT_A), want: dayPart(EXPECTED[zone].instantA) },
          instantB: { value: new Date(INSTANT_B), want: dayPart(EXPECTED[zone].instantB) },
        };
        for (const [name, { value, want }] of Object.entries(cells)) {
          const wrote = dayPart(legacyExportValue(value));
          if (wrote !== want) {
            disagreements.push(`${zone}/${name}: wrote ${wrote} want ${want}`);
          }
        }
      });
    }

    // A calendar day written as UTC lands a day early east of Greenwich; an
    // instant rendered in UTC lands a day late west of it. Nine of the twelve
    // cells agree, which is why this shipped — and why the matrix above is
    // discriminating rather than a restatement of toISOString().
    expect(disagreements).toEqual([
      'America/Los_Angeles/instantA: wrote 2026-08-15 want 2026-08-14',
      'Pacific/Kiritimati/day: wrote 2026-08-14 want 2026-08-15',
      'Pacific/Kiritimati/instantB: wrote 2026-08-14 want 2026-08-15',
    ]);
  });

  it('negative control: the old formulation was lossless too — only the day was wrong', () => {
    // Names what did NOT change, so the fix is not read as trading precision
    // for a readable day. Both formulations denote the same instant; only one
    // of them leads with the day the user was looking at.
    for (const zone of ZONES) {
      inZone(zone, () => {
        const instant = new Date(INSTANT_B);
        expect(new Date(legacyExportValue(instant)).getTime()).toBe(instant.getTime());
        expect(new Date(EXPECTED[zone].instantB).getTime()).toBe(instant.getTime());
      });
    }
  });
});

describe('DataTableExport date rendering, other channels', () => {
  beforeEach(() => {
    process.env.TZ = 'Pacific/Kiritimati';
  });

  it('copies string values verbatim — the export never reinterprets source text', async () => {
    const cells = await exportRow(
      [{ wireDay: '2026-08-15', wireStamp: INSTANT_A, code: '5-1' }],
      [
        { accessorKey: 'wireDay', header: 'Day', field: 'datepicker' as const },
        { accessorKey: 'wireStamp', header: 'Stamp', field: 'datetimepicker' as const },
        { accessorKey: 'code', header: 'Code' },
      ],
    );

    // A bare calendar day already names its day and the grid renders it in
    // UTC, so the two already agree. `code` is the reason the export does not
    // sniff strings for dates: "5-1" is a product code that Date.parse would
    // happily read as the 1st of May.
    expect(cells).toEqual(['2026-08-15', INSTANT_A, '5-1']);
    expect(new Date('5-1').getMonth()).toBe(4);
  });

  it('renders Dates nested in a range or a multi-date array, not their UTC day', async () => {
    const cells = await exportRow(
      [
        {
          range: { start: new Date(2026, 7, 15), end: new Date(2026, 7, 17) },
          days: [new Date(2026, 7, 15), new Date(2026, 7, 16)],
        },
      ],
      [
        { accessorKey: 'range', header: 'Range', field: 'daterangepicker' as const },
        { accessorKey: 'days', header: 'Days', field: 'multidatepicker' as const },
      ],
    );

    // JSON.stringify reaches Date.prototype.toJSON, which is toISOString() —
    // the same UTC shift, one level down. At +14 these each read a day early.
    expect(cells.join(',')).toBe(
      '"{""start"":""2026-08-15"",""end"":""2026-08-17""}","[""2026-08-15"",""2026-08-16""]"',
    );
  });

  it('writes the displayed day in the JSON export, and leaves other types native', async () => {
    mockCreateObjectURL.mockClear();
    renderWithProviders(
      <DataTableExport
        data={[{ due: new Date(2026, 7, 15), at: new Date(INSTANT_B), qty: 3, ok: false }]}
        columns={[
          { accessorKey: 'due', header: 'Due', field: 'datepicker' },
          { accessorKey: 'at', header: 'At', field: 'datetimepicker' },
          { accessorKey: 'qty', header: 'Qty' },
          { accessorKey: 'ok', header: 'Ok' },
        ]}
        exportFormats={[
          {
            id: 'json',
            label: 'JSON',
            icon: null,
            extension: 'json',
            mimeType: 'application/json',
            description: 'JSON',
            enabled: true,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByText('JSON'));
    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
    const blob = (mockCreateObjectURL.mock.calls.at(-1) as unknown as [Blob])[0];

    expect(JSON.parse(await blob.text())).toEqual([
      { due: '2026-08-15', at: '2026-08-15T01:00:00.000+14:00', qty: 3, ok: false },
    ]);
  });

  it('prints the same day it exports', async () => {
    const printDoc = document.implementation.createHTMLDocument('print');
    const print = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ document: printDoc, print } as any);

    renderWithProviders(
      <DataTableExport
        data={[{ due: new Date(2026, 7, 15) }]}
        columns={[{ accessorKey: 'due', header: 'Due', field: 'datepicker' }]}
      />,
    );
    fireEvent.click(screen.getByText('Print'));

    await waitFor(() => {
      expect(print).toHaveBeenCalledWith();
    });
    expect(printDoc.querySelector('td')?.textContent).toBe('2026-08-15');
    vi.restoreAllMocks();
  });

  it('blanks an unparseable Date instead of failing the whole export', async () => {
    // toISOString() throws RangeError on an invalid Date, which surfaced as
    // "Export failed" for the entire file rather than one empty cell.
    expect(() => legacyExportValue(new Date('nonsense'))).toThrow(RangeError);

    const cells = await exportRow(
      [{ due: new Date('nonsense'), name: 'Widget' }],
      [
        { accessorKey: 'due', header: 'Due', field: 'datepicker' as const },
        { accessorKey: 'name', header: 'Name' },
      ],
    );
    expect(cells).toEqual(['', 'Widget']);
  });
});

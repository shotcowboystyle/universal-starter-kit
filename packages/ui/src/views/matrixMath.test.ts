import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatAbsoluteDate, formatDayOfMonth, formatMonthYear } from '@repo/theme';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dayDiff, generateTicks, startOfDay } from './ganttMath';
import {
  alignMatrixRange,
  bucketStart,
  computeMatrixRange,
  generateBuckets,
  localDateKey,
  matrixCellIntensity,
  matrixCellKey,
  matrixMaxValue,
  summarizeMatrixCells,
  type MatrixBucketRule,
  type MatrixCell,
  type MatrixCellSummary,
} from './matrixMath';

const here = dirname(fileURLToPath(import.meta.url));
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m, day, h, min);

describe('matrixMath', () => {
  describe('generateBuckets', () => {
    it('generates one bucket per month over a year, each ending where the next starts', () => {
      const buckets = generateBuckets({ start: d(2026, 0, 1), end: d(2027, 0, 1) }, 'month');
      expect(buckets).toHaveLength(12);
      expect(buckets.map((b) => b.key)).toEqual([
        '2026-01-01',
        '2026-02-01',
        '2026-03-01',
        '2026-04-01',
        '2026-05-01',
        '2026-06-01',
        '2026-07-01',
        '2026-08-01',
        '2026-09-01',
        '2026-10-01',
        '2026-11-01',
        '2026-12-01',
      ]);
      for (let i = 0; i < buckets.length - 1; i++) {
        expect(buckets[i].end).toEqual(buckets[i + 1].start);
      }
      expect(buckets[11].end).toEqual(d(2027, 0, 1));
      expect(buckets[2].label).toBe(formatMonthYear(d(2026, 2, 1)));
      expect(buckets[2].name).toBe(formatMonthYear(d(2026, 2, 1)));
    });

    it('snaps an unaligned window down to its first bucket and up past its last day', () => {
      const buckets = generateBuckets({ start: d(2026, 0, 14), end: d(2026, 2, 3) }, 'month');
      expect(buckets.map((b) => b.key)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
      expect(buckets[0].start).toEqual(d(2026, 0, 1));
      expect(buckets[2].end).toEqual(d(2026, 3, 1));
    });

    it('aligns week buckets to the configured first day of week, seven days each', () => {
      const window = { start: d(2026, 0, 1), end: d(2026, 1, 1) };
      const monday = generateBuckets(window, 'week', 1);
      expect(monday[0].start).toEqual(d(2025, 11, 29));
      expect(monday[0].start.getDay()).toBe(1);
      for (const bucket of monday) {
        expect(dayDiff(bucket.start, bucket.end)).toBe(7);
      }
      expect(monday.at(-1)!.end.getTime()).toBeGreaterThanOrEqual(d(2026, 1, 1).getTime());

      const sunday = generateBuckets(window, 'week', 0);
      expect(sunday[0].start).toEqual(d(2025, 11, 28));
      expect(sunday[0].start.getDay()).toBe(0);
      expect(sunday[0].name).toBe(
        `${formatAbsoluteDate(d(2025, 11, 28), { year: 'never' })} – ${formatAbsoluteDate(d(2026, 0, 3))}`,
      );
    });

    it('generates one bucket per day with the tick register as its label', () => {
      const buckets = generateBuckets({ start: d(2026, 2, 30), end: d(2026, 3, 3) }, 'day');
      expect(buckets.map((b) => b.key)).toEqual(['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02']);
      expect(buckets[0].label).toBe(formatAbsoluteDate(d(2026, 2, 30), { year: 'never' }));
      expect(buckets[1].label).toBe(formatDayOfMonth(d(2026, 2, 31)));
      expect(buckets[2].label).toBe(formatAbsoluteDate(d(2026, 3, 1), { year: 'never' }));
      expect(buckets[1].name).toBe(formatAbsoluteDate(d(2026, 2, 31)));
    });

    it('places every boundary exactly where the Gantt axis places a major tick', () => {
      const window = { start: d(2026, 0, 9), end: d(2026, 3, 20) };
      for (const rule of ['day', 'week', 'month'] as MatrixBucketRule[]) {
        const aligned = alignMatrixRange(window, rule, 1);
        const majors = generateTicks(aligned, rule, 1, 1)
          .filter((tick) => tick.major)
          .map((tick) => tick.date.getTime());
        const buckets = generateBuckets(window, rule, 1);
        expect(buckets.map((b) => b.start.getTime())).toEqual(majors);
        expect(buckets.at(-1)!.end).toEqual(aligned.end);
      }
    });

    it('a degenerate window still yields the one bucket containing it', () => {
      const buckets = generateBuckets({ start: d(2026, 5, 10), end: d(2026, 5, 10) }, 'month');
      expect(buckets).toHaveLength(1);
      expect(buckets[0].key).toBe('2026-06-01');
      expect(buckets[0].end).toEqual(d(2026, 6, 1));
    });
  });

  describe('computeMatrixRange', () => {
    it('covers exactly the buckets the data spans, with no padding', () => {
      const dates = [d(2026, 1, 3, 9), d(2026, 3, 27, 17)];
      expect(computeMatrixRange(dates, 'month')).toEqual({
        start: d(2026, 1, 1),
        end: d(2026, 4, 1),
      });
      expect(computeMatrixRange(dates, 'week', 0)).toEqual({
        start: d(2026, 1, 1),
        end: d(2026, 4, 3),
      });
      expect(computeMatrixRange(dates, 'day')).toEqual({
        start: d(2026, 1, 3),
        end: d(2026, 3, 28),
      });
    });

    it('falls back to the bucket containing today when there are no dates', () => {
      const today = d(2026, 6, 14, 11);
      expect(computeMatrixRange([], 'month', 0, today)).toEqual({
        start: d(2026, 6, 1),
        end: d(2026, 7, 1),
      });
      expect(generateBuckets(computeMatrixRange([], 'day', 0, today), 'day')).toHaveLength(1);
    });
  });

  describe('DST (America/New_York, spring-forward 2026-03-08)', () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'America/New_York';
    });
    afterAll(() => {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    });

    it('the pin took: the changeover day has a different offset from the day before', () => {
      expect(d(2026, 2, 8, 12).getTimezoneOffset()).not.toBe(d(2026, 2, 7, 12).getTimezoneOffset());
    });

    it('a week bucket across the change keeps wall-clock midnight edges and seven whole days', () => {
      const [bucket] = generateBuckets({ start: d(2026, 2, 8), end: d(2026, 2, 15) }, 'week', 0);
      expect(bucket.start).toEqual(d(2026, 2, 8));
      expect(bucket.end).toEqual(d(2026, 2, 15));
      expect(bucket.end.getHours()).toBe(0);
      expect(dayDiff(bucket.start, bucket.end)).toBe(7);
      expect(bucket.end.getTime() - bucket.start.getTime()).toBe(7 * 86_400_000 - 3_600_000);
    });

    it('day buckets across the change each end at local midnight, the short day included', () => {
      const buckets = generateBuckets({ start: d(2026, 2, 7), end: d(2026, 2, 10) }, 'day');
      expect(buckets.map((b) => b.key)).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
      for (const bucket of buckets) {
        expect(bucket.end.getHours()).toBe(0);
      }
      expect(buckets[1].end.getTime() - buckets[1].start.getTime()).toBe(23 * 3_600_000);
      expect(buckets[2].end.getTime() - buckets[2].start.getTime()).toBe(24 * 3_600_000);
    });

    it("a point after the skipped hour still lands in the changeover day's bucket", () => {
      const summaries = summarizeMatrixCells([{ rowId: 'a', date: d(2026, 2, 8, 3, 30) }], 'day');
      expect([...summaries.keys()]).toEqual([matrixCellKey('a', '2026-03-08')]);
      expect(localDateKey(bucketStart(d(2026, 2, 8, 23, 59), 'day'))).toBe('2026-03-08');
    });
  });

  describe('summarizeMatrixCells', () => {
    it('folds points into their (row, bucket) under the rule: sums values, counts, keeps the last intent', () => {
      const cells: MatrixCell[] = [
        { rowId: 'a', date: d(2026, 0, 12), value: 4 },
        { rowId: 'a', date: d(2026, 0, 20), value: 6, intent: 'warning' },
        { rowId: 'a', date: d(2026, 1, 3), value: 2 },
        { rowId: 'b', date: d(2026, 0, 5), value: 0 },
        { rowId: 'c', date: d(2026, 0, 30) },
      ];
      const byMonth = summarizeMatrixCells(cells, 'month');
      const aJan = byMonth.get(matrixCellKey('a', '2026-01-01'))!;
      expect(aJan.value).toBe(10);
      expect(aJan.count).toBe(2);
      expect(aJan.intent).toBe('warning');
      expect(aJan.cells).toHaveLength(2);
      expect(byMonth.get(matrixCellKey('a', '2026-02-01'))!.value).toBe(2);
      expect(byMonth.get(matrixCellKey('b', '2026-01-01'))!.value).toBe(0);
      const cJan = byMonth.get(matrixCellKey('c', '2026-01-01'))!;
      expect(cJan.value).toBeUndefined();
      expect(cJan.count).toBe(1);

      const byWeek = summarizeMatrixCells(cells, 'week', 1);
      expect(byWeek.get(matrixCellKey('a', '2026-01-12'))!.value).toBe(4);
      expect(byWeek.get(matrixCellKey('a', '2026-01-19'))!.value).toBe(6);
    });

    it('intensity: explicit wins, presence is full, a zero is the floor, values scale against the max', () => {
      const summary = (patch: Partial<MatrixCellSummary>): MatrixCellSummary => ({
        rowId: 'a',
        bucketKey: '2026-01-01',
        value: undefined,
        count: 1,
        intensity: undefined,
        intent: undefined,
        color: undefined,
        label: undefined,
        cells: [],
        ...patch,
      });
      const summaries = [summary({ value: 10 }), summary({ value: 2 }), summary({ value: 0 })];
      expect(matrixMaxValue(summaries)).toBe(10);
      expect(matrixCellIntensity(summary({ value: 10 }), 10)).toBe(1);
      expect(matrixCellIntensity(summary({ value: 2 }), 10)).toBe(0.2);
      expect(matrixCellIntensity(summary({ value: 0 }), 10)).toBe(0);
      expect(matrixCellIntensity(summary({}), 10)).toBe(1);
      expect(matrixCellIntensity(summary({ value: 5, intensity: 0.3 }), 10)).toBe(0.3);
      expect(matrixCellIntensity(summary({ intensity: 7 }), 10)).toBe(1);
      expect(matrixCellIntensity(summary({ value: -4 }), 10)).toBe(0);
      expect(matrixMaxValue([summary({ value: -4 }), summary({})])).toBe(0);
    });
  });

  describe('reuse', () => {
    it('takes every boundary from ganttMath and carries no day arithmetic of its own', () => {
      const src = readFileSync(join(here, 'matrixMath.ts'), 'utf8');
      expect(src).toMatch(/from ['"]\.\/ganttMath['"]/);
      expect(src).toContain('generateTicks(');
      expect(src).not.toMatch(/getDate\(\)\s*[+-]/);
      expect(src).not.toMatch(/86_?400_?000|MS_PER_DAY|setHours\(/);
      expect(startOfDay(d(2026, 2, 8, 15))).toEqual(d(2026, 2, 8));
    });
  });
});

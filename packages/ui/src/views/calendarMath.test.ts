import { describe, expect, it } from 'vitest';

import {
  MINUTES_PER_DAY,
  computeResizeRange,
  createRangeFromDrag,
  eventAccessibleLabel,
  formatTimeRangeLabel,
  layoutDayBlocks,
  minutesOfDay,
  minutesToY,
  moveFocusDate,
  moveFocusSlot,
  moveRangeToSlot,
  snapMinutes,
  yToMinutes,
} from './calendarMath';

const day = new Date(2026, 2, 10);

describe('calendarMath', () => {
  describe('snapMinutes', () => {
    it('rounds to the increment', () => {
      expect(snapMinutes(44, 30)).toBe(30);
      expect(snapMinutes(46, 30)).toBe(60);
      expect(snapMinutes(52, 15)).toBe(45);
    });

    it('floors and ceils on request', () => {
      expect(snapMinutes(59, 30, 'floor')).toBe(30);
      expect(snapMinutes(1, 30, 'ceil')).toBe(30);
    });

    it('clamps to a single day', () => {
      expect(snapMinutes(-20, 30)).toBe(0);
      expect(snapMinutes(MINUTES_PER_DAY + 45, 30)).toBe(MINUTES_PER_DAY);
    });
  });

  describe('minutesToY / yToMinutes', () => {
    it('round-trips through the hour height', () => {
      expect(minutesToY(90, 60)).toBe(90);
      expect(minutesToY(90, 48)).toBe(72);
      expect(yToMinutes(72, 48)).toBe(90);
    });

    it('clamps pixel positions outside the grid', () => {
      expect(yToMinutes(-10, 60)).toBe(0);
      expect(yToMinutes(10_000, 60)).toBe(MINUTES_PER_DAY);
    });
  });

  describe('layoutDayBlocks', () => {
    it('keeps non-overlapping blocks full width', () => {
      const layout = layoutDayBlocks([
        { id: 'a', startMin: 0, endMin: 60 },
        { id: 'b', startMin: 60, endMin: 120 },
      ]);
      expect(layout.every((b) => b.columns === 1 && b.column === 0)).toBe(true);
    });

    it('splits overlapping blocks into side-by-side columns', () => {
      const layout = layoutDayBlocks([
        { id: 'a', startMin: 540, endMin: 630 },
        { id: 'b', startMin: 570, endMin: 660 },
      ]);
      const a = layout.find((b) => b.id === 'a')!;
      const b = layout.find((b) => b.id === 'b')!;
      expect(a.columns).toBe(2);
      expect(b.columns).toBe(2);
      expect(a.column).not.toBe(b.column);
    });

    it('reuses a freed column within a cluster (transitive overlap)', () => {
      const layout = layoutDayBlocks([
        { id: 'a', startMin: 0, endMin: 60 },
        { id: 'b', startMin: 30, endMin: 90 },
        { id: 'c', startMin: 60, endMin: 120 },
      ]);
      const byId = Object.fromEntries(layout.map((b) => [b.id, b]));
      // a and c share column 0 (a ends when c starts); b takes column 1.
      expect(byId.a.column).toBe(0);
      expect(byId.c.column).toBe(0);
      expect(byId.b.column).toBe(1);
      expect(layout.every((b) => b.columns === 2)).toBe(true);
    });
  });

  describe('moveRangeToSlot', () => {
    it('preserves the event duration at the target slot', () => {
      const range = moveRangeToSlot(
        { start: new Date(2026, 2, 10, 9, 0), end: new Date(2026, 2, 10, 10, 30) },
        new Date(2026, 2, 12),
        14 * 60,
      );
      expect(range.start).toEqual(new Date(2026, 2, 12, 14, 0));
      expect(range.end).toEqual(new Date(2026, 2, 12, 15, 30));
    });

    it('keeps zero-duration events zero-duration', () => {
      const range = moveRangeToSlot({ start: new Date(2026, 2, 10, 9, 0) }, day, 600);
      expect(range.end).toEqual(range.start);
    });
  });

  describe('computeResizeRange', () => {
    const event = { start: new Date(2026, 2, 10, 9, 0), end: new Date(2026, 2, 10, 10, 0) };

    it('snaps the end edge to the grid increment', () => {
      const range = computeResizeRange(event, 'end', 11 * 60 + 13, 30);
      expect(range.start).toEqual(event.start);
      expect(range.end).toEqual(new Date(2026, 2, 10, 11, 0));
    });

    it('enforces a minimum duration of one increment (end edge)', () => {
      const range = computeResizeRange(event, 'end', 8 * 60, 30);
      expect(range.end).toEqual(new Date(2026, 2, 10, 9, 30));
    });

    it('resizes the start edge and clamps against the end', () => {
      const range = computeResizeRange(event, 'start', 9 * 60 + 50, 30);
      expect(range.start).toEqual(new Date(2026, 2, 10, 9, 30));
      expect(range.end).toEqual(new Date(2026, 2, 10, 10, 0));
      const clamped = computeResizeRange(event, 'start', 12 * 60, 30);
      expect(clamped.start).toEqual(new Date(2026, 2, 10, 9, 30));
    });
  });

  describe('createRangeFromDrag', () => {
    it('floors the anchor and ceils the moving edge', () => {
      const range = createRangeFromDrag(day, 9 * 60 + 10, 10 * 60 + 5, 30);
      expect(range.start).toEqual(new Date(2026, 2, 10, 9, 0));
      expect(range.end).toEqual(new Date(2026, 2, 10, 10, 30));
    });

    it('spans at least one increment for a bare press', () => {
      const range = createRangeFromDrag(day, 9 * 60 + 10, 9 * 60 + 10, 30);
      expect(range.start).toEqual(new Date(2026, 2, 10, 9, 0));
      expect(range.end).toEqual(new Date(2026, 2, 10, 9, 30));
    });

    it('normalizes an upward drag', () => {
      const range = createRangeFromDrag(day, 10 * 60, 9 * 60 + 10, 30);
      expect(range.start).toEqual(new Date(2026, 2, 10, 9, 0));
      expect(range.end).toEqual(new Date(2026, 2, 10, 10, 0));
    });
  });

  describe('moveFocusDate / moveFocusSlot', () => {
    it('steps days horizontally and weeks vertically in month view', () => {
      expect(moveFocusDate(day, 'ArrowRight', 'month')).toEqual(new Date(2026, 2, 11));
      expect(moveFocusDate(day, 'ArrowLeft', 'month')).toEqual(new Date(2026, 2, 9));
      expect(moveFocusDate(day, 'ArrowDown', 'month')).toEqual(new Date(2026, 2, 17));
      expect(moveFocusDate(day, 'ArrowUp', 'month')).toEqual(new Date(2026, 2, 3));
    });

    it('keeps vertical arrows off the date in week/day views', () => {
      expect(moveFocusDate(day, 'ArrowDown', 'week')).toEqual(day);
      expect(moveFocusDate(day, 'ArrowRight', 'week')).toEqual(new Date(2026, 2, 11));
    });

    it('clamps slot focus inside the day', () => {
      expect(moveFocusSlot(0, 'ArrowUp', 30)).toBe(0);
      expect(moveFocusSlot(0, 'ArrowDown', 30)).toBe(30);
      expect(moveFocusSlot(MINUTES_PER_DAY - 30, 'ArrowDown', 30)).toBe(MINUTES_PER_DAY - 30);
    });
  });

  describe('labels', () => {
    it('builds a full accessible name with day and time range', () => {
      const label = eventAccessibleLabel({
        title: 'Deploy to staging',
        start: new Date(2026, 2, 10, 14, 0),
        end: new Date(2026, 2, 10, 15, 0),
      });
      expect(label).toContain('Deploy to staging');
      expect(label).toContain('Tuesday');
      expect(label).toMatch(/2:00/);
      expect(label).toMatch(/3:00/);
    });

    it('omits the time range for untimed events', () => {
      const label = eventAccessibleLabel({ title: 'Reminder', start: new Date(2026, 2, 10) });
      expect(label).toContain('Reminder');
      expect(label).not.toContain('–');
    });

    it('formats visible time ranges', () => {
      expect(formatTimeRangeLabel(new Date(2026, 2, 10, 9, 0), new Date(2026, 2, 10, 10, 30))).toMatch(/9:00.*10:30/);
    });

    it('computes minutes of day', () => {
      expect(minutesOfDay(new Date(2026, 2, 10, 9, 30))).toBe(570);
    });
  });
});

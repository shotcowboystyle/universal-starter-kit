import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GanttView, type GanttTask } from './Gantt';
import {
  addDays,
  barGeometry,
  clampResizeDayDelta,
  computeGanttRange,
  dateLineX,
  dateToX,
  dayDiff,
  dxToDayDelta,
  formatSpanLabel,
  ganttTaskAccessibleLabel,
  generateTicks,
  isBoundedSpan,
  isEternalSpan,
  normalizeSpanEdges,
  openBarGeometry,
  openSpanExtent,
  openSpanExtents,
  openSpanLabelParts,
  resizeSpanByDays,
  scrollAnchorX,
  shiftSpanByDays,
  spanInclusiveDays,
  todayLineX,
  type GanttRange,
} from './ganttMath';

afterEach(cleanup);

const mar = (day: number, hours = 0, minutes = 0) => new Date(2026, 2, day, hours, minutes);

// ---------------------------------------------------------------------------
// Pure math: date → position
// ---------------------------------------------------------------------------
describe('ganttMath', () => {
  describe('scroll anchoring', () => {
    const start = mar(1);
    const date = mar(20);
    const options = { labelWidth: 180, chartWidth: 2000, viewportWidth: 178, rtl: false };

    it('keeps a narrow marker inside the canvas while preserving the desktop inset', () => {
      const narrow = scrollAnchorX(date, start, 24, options);
      expect(narrow).toBe(397);
      expect(dateToX(date, start, 24) + 12 - narrow).toBe(71);
      expect(scrollAnchorX(date, start, 24, { ...options, viewportWidth: 820 })).toBe(276);
      expect(scrollAnchorX(date, start, 24, { ...options, viewportWidth: null })).toBe(276);
    });

    it('clamps both edges and short charts to the measured extent', () => {
      expect(scrollAnchorX(start, start, 24, options)).toBe(0);
      expect(scrollAnchorX(mar(90), start, 24, options)).toBe(1822);
      expect(scrollAnchorX(date, start, 24, { ...options, chartWidth: 100 })).toBe(0);
    });

    it('mirrors the narrow anchor inset in RTL', () => {
      const left = scrollAnchorX(date, start, 24, { ...options, rtl: true });
      expect(left).toBe(1425);
      expect(2000 - dateToX(date, start, 24) - 12 - left).toBe(107);
    });
  });

  describe('day arithmetic', () => {
    it('computes whole-day differences and shifts', () => {
      expect(dayDiff(mar(10), mar(13))).toBe(3);
      expect(dayDiff(mar(13), mar(10))).toBe(-3);
      expect(addDays(mar(10, 9, 30), 2)).toEqual(mar(12, 9, 30));
    });
  });

  describe('normalizeSpanEdges', () => {
    it('treats midnight ends as inclusive whole days (Frappe date fields)', () => {
      const { startEdge, endEdge } = normalizeSpanEdges({ start: mar(10), end: mar(12) });
      expect(startEdge).toEqual(mar(10));
      expect(endEdge).toEqual(mar(13));
    });

    it('keeps timed ends as exact edges', () => {
      const { endEdge } = normalizeSpanEdges({ start: mar(10, 9), end: mar(12, 17) });
      expect(endEdge).toEqual(mar(12, 17));
    });

    it('clamps degenerate/inverted spans to at least one day', () => {
      const same = normalizeSpanEdges({ start: mar(10), end: mar(10) });
      expect(same.endEdge).toEqual(mar(11));
      const inverted = normalizeSpanEdges({ start: mar(10, 9), end: mar(8) });
      expect(inverted.endEdge).toEqual(mar(11));
    });
  });

  describe('dateToX / barGeometry', () => {
    const rangeStart = mar(8);

    it('maps dates to px offsets at the day scale', () => {
      expect(dateToX(mar(8), rangeStart, 24)).toBe(0);
      expect(dateToX(mar(10), rangeStart, 24)).toBe(48);
      expect(dateToX(mar(10, 12, 0), rangeStart, 24)).toBe(60);
    });

    it('positions bars with inclusive-day widths', () => {
      // Mar 10 → Mar 12 inclusive = 3 days wide starting 2 days in.
      const geom = barGeometry({ start: mar(10), end: mar(12) }, rangeStart, 24);
      expect(geom.x).toBe(48);
      expect(geom.width).toBe(72);
    });

    it('clamps bar width to the minimum so degenerate spans stay visible', () => {
      const geom = barGeometry({ start: mar(10), end: mar(10) }, rangeStart, 4, 6);
      expect(geom.width).toBe(6);
    });
  });

  describe('zoom-level scale changes', () => {
    const tasks = [{ start: mar(10), end: mar(12) }];

    it('scales bar geometry with px-per-day', () => {
      const range = computeGanttRange(tasks, 'day', mar(11));
      const atDay = barGeometry(tasks[0], range.start, 64);
      const atWeek = barGeometry(tasks[0], range.start, 24);
      expect(atDay.width / atWeek.width).toBeCloseTo(64 / 24);
      expect(atDay.x / atWeek.x).toBeCloseTo(64 / 24);
    });

    it('aligns the range per zoom level', () => {
      const dayRange = computeGanttRange(tasks, 'day', mar(11));
      expect(dayRange.start).toEqual(mar(8));
      expect(dayRange.end).toEqual(mar(15));

      const weekRange = computeGanttRange(tasks, 'week', mar(11));
      // Week-aligned (Sunday) with a week of padding each side.
      expect(weekRange.start.getDay()).toBe(0);
      expect(weekRange.end.getDay()).toBe(0);
      expect(weekRange.start).toEqual(mar(1));

      const monthRange = computeGanttRange(tasks, 'month', mar(11));
      expect(monthRange.start).toEqual(new Date(2026, 1, 1));
      expect(monthRange.end).toEqual(new Date(2026, 4, 1));
    });

    it('expands the range to cover today', () => {
      const range = computeGanttRange(tasks, 'day', mar(25));
      expect(range.end.getTime()).toBeGreaterThan(mar(25).getTime());
    });
  });

  describe('generateTicks', () => {
    it('emits a labeled major tick per day at day zoom', () => {
      const range: GanttRange = { start: mar(8), end: mar(12) };
      const ticks = generateTicks(range, 'day', 64);
      expect(ticks).toHaveLength(4);
      expect(ticks.every((tick) => tick.major && tick.label)).toBe(true);
      expect(ticks.map((tick) => tick.x)).toEqual([0, 64, 128, 192]);
    });

    it('labels only week starts at week zoom', () => {
      const range: GanttRange = { start: mar(1), end: mar(29) };
      const ticks = generateTicks(range, 'week', 24);
      expect(ticks).toHaveLength(28);
      const majors = ticks.filter((tick) => tick.major);
      expect(majors).toHaveLength(4);
      expect(majors.every((tick) => tick.date.getDay() === 0 && tick.label)).toBe(true);
      expect(ticks.filter((tick) => !tick.major).every((tick) => tick.label === undefined)).toBe(true);
    });

    it('labels only month starts at month zoom (weeks as minor grid)', () => {
      const range: GanttRange = { start: new Date(2026, 1, 1), end: new Date(2026, 4, 1) };
      const ticks = generateTicks(range, 'month', 8);
      const majors = ticks.filter((tick) => tick.major);
      expect(majors).toHaveLength(3);
      expect(majors.every((tick) => tick.date.getDate() === 1 && tick.label)).toBe(true);
      expect(ticks.some((tick) => !tick.major)).toBe(true);
    });
  });

  describe('drag math', () => {
    it('snaps drag distances to whole days', () => {
      expect(dxToDayDelta(48, 24)).toBe(2);
      expect(dxToDayDelta(-49, 24)).toBe(-2);
      expect(dxToDayDelta(11, 24)).toBe(0);
      expect(dxToDayDelta(13, 24)).toBe(1);
    });

    it('shifts spans preserving duration and wall-clock times', () => {
      const moved = shiftSpanByDays({ start: mar(10, 9, 30), end: mar(12, 17, 0) }, 3);
      expect(moved.start).toEqual(mar(13, 9, 30));
      expect(moved.end).toEqual(mar(15, 17, 0));
    });
  });

  describe('resize math', () => {
    it('counts inclusive days from normalized edges', () => {
      expect(spanInclusiveDays({ start: mar(10), end: mar(12) })).toBe(3);
      expect(spanInclusiveDays({ start: mar(10), end: mar(10) })).toBe(1);
    });

    it('resizes the end edge only, preserving wall-clock times', () => {
      const resized = resizeSpanByDays({ start: mar(10, 9, 30), end: mar(12, 17, 0) }, 'end', 2);
      expect(resized.start).toEqual(mar(10, 9, 30));
      expect(resized.end).toEqual(mar(14, 17, 0));
    });

    it('resizes the start edge only', () => {
      const resized = resizeSpanByDays({ start: mar(10), end: mar(14) }, 'start', 2);
      expect(resized.start).toEqual(mar(12));
      expect(resized.end).toEqual(mar(14));
    });

    it('clamps shrinking so at least one inclusive day survives', () => {
      // Mar 10 → Mar 12 = 3 inclusive days: the shrink bound is ±2.
      expect(clampResizeDayDelta({ start: mar(10), end: mar(12) }, 'start', 5)).toBe(2);
      expect(clampResizeDayDelta({ start: mar(10), end: mar(12) }, 'end', -5)).toBe(-2);
      // Growing is unbounded (either direction away from the other edge).
      expect(clampResizeDayDelta({ start: mar(10), end: mar(12) }, 'start', -30)).toBe(-30);
      expect(clampResizeDayDelta({ start: mar(10), end: mar(12) }, 'end', 30)).toBe(30);
      const collapsed = resizeSpanByDays({ start: mar(10), end: mar(12) }, 'start', 99);
      expect(collapsed.start).toEqual(mar(12));
      expect(collapsed.end).toEqual(mar(12));
    });
  });

  describe('today line', () => {
    it('positions today at the middle of its column', () => {
      const range: GanttRange = { start: mar(8), end: mar(15) };
      expect(todayLineX(range, 24, mar(10, 14, 30))).toBe(60);
    });

    it('returns null when today is outside the range', () => {
      const range: GanttRange = { start: mar(8), end: mar(15) };
      expect(todayLineX(range, 24, mar(20))).toBeNull();
    });
  });

  describe('open-ended spans', () => {
    const range: GanttRange = { start: mar(8), end: mar(22) };

    it('names an absent bound as open, not as missing', () => {
      expect(isEternalSpan({})).toBe(true);
      expect(isEternalSpan({ start: mar(10) })).toBe(false);
      expect(isBoundedSpan({ start: mar(10), end: mar(12) })).toBe(true);
      expect(isBoundedSpan({ start: mar(10) })).toBe(false);
    });

    it('contributes only the dates a span actually names to the range', () => {
      expect(openSpanExtent({})).toBeUndefined();
      expect(openSpanExtent({ start: mar(10) })).toEqual({ start: mar(10), end: mar(10) });
      expect(openSpanExtent({ end: mar(12) })).toEqual({ start: mar(12), end: mar(12) });
      // An eternal span names nothing, so it must not stretch the axis.
      expect(openSpanExtents([{}, { start: mar(10) }, { start: mar(1), end: mar(3) }])).toEqual([
        { start: mar(10), end: mar(10) },
        { start: mar(1), end: mar(3) },
      ]);
    });

    it('measures a bounded span exactly as barGeometry does', () => {
      const open = openBarGeometry({ start: mar(10), end: mar(12) }, range, 24);
      const closed = barGeometry({ start: mar(10), end: mar(12) }, range.start, 24);
      expect(open.x).toBe(closed.x);
      expect(open.width).toBe(closed.width);
      expect(open.openStart).toBe(false);
      expect(open.openEnd).toBe(false);
      expect(open.eternal).toBe(false);
    });

    it('runs an open end to the chart edge and reports which end is open', () => {
      const chartWidth = 14 * 24;
      const openEnd = openBarGeometry({ start: mar(10) }, range, 24);
      expect(openEnd.x).toBe(48);
      expect(openEnd.x + openEnd.width).toBe(chartWidth);
      expect(openEnd.openEnd).toBe(true);
      expect(openEnd.openStart).toBe(false);

      const openStart = openBarGeometry({ end: mar(12) }, range, 24);
      expect(openStart.x).toBe(0);
      // Inclusive end: the bar paints through the 12th.
      expect(openStart.width).toBe(dateToX(mar(13), range.start, 24));
      expect(openStart.openStart).toBe(true);
      expect(openStart.openEnd).toBe(false);
    });

    it('covers the whole chart for an eternal span, flagged as a rail', () => {
      const rail = openBarGeometry({}, range, 24);
      expect(rail.x).toBe(0);
      expect(rail.width).toBe(14 * 24);
      expect(rail.eternal).toBe(true);
      expect(rail.openStart).toBe(true);
      expect(rail.openEnd).toBe(true);
    });

    it('labels only the bounds a span has', () => {
      const bounded = openSpanLabelParts({ start: mar(10), end: mar(12) });
      expect(bounded.start).toMatch(/10/);
      expect(bounded.end).toMatch(/12/);
      expect(openSpanLabelParts({ start: mar(10) })).toEqual({
        start: bounded.start,
        end: undefined,
      });
      expect(openSpanLabelParts({ end: mar(12) })).toEqual({
        start: undefined,
        end: bounded.end,
      });
      expect(openSpanLabelParts({})).toEqual({});
    });

    it("measures any date's line the same way the today line is measured", () => {
      expect(dateLineX(range, 24, mar(10, 14, 30))).toBe(60);
      expect(dateLineX(range, 24, mar(30))).toBeNull();
      expect(dateLineX(range, 24, mar(10))).toBe(todayLineX(range, 24, mar(10)));
    });
  });

  describe('labels', () => {
    it('builds accessible names with the inclusive day range', () => {
      const label = ganttTaskAccessibleLabel({
        title: 'Design review',
        start: mar(10),
        end: mar(12),
      });
      expect(label).toContain('Design review');
      expect(label).toMatch(/10/);
      expect(label).toMatch(/12/);
    });

    it('collapses single-day spans to one date', () => {
      expect(formatSpanLabel({ start: mar(10), end: mar(10) })).not.toContain('–');
    });
  });
});

// ---------------------------------------------------------------------------
// Component: rendering, states, callbacks
// ---------------------------------------------------------------------------

const tasks: GanttTask[] = [
  { id: 't1', title: 'Design review', start: mar(10), end: mar(12), intent: 'accent' },
  { id: 't2', title: 'Implementation', start: mar(12), end: mar(18), intent: 'success' },
  { id: 't3', title: 'Launch', start: mar(19), end: mar(19), intent: 'error' },
];

describe('GanttView', () => {
  it('renders one labeled row and one bar per task', () => {
    const { container } = renderWithProviders(<GanttView tasks={tasks} />);
    expect(screen.getByText('Design review')).toBeInTheDocument();
    expect(screen.getByText('Implementation')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-gantt-bar]')).toHaveLength(3);
    expect(container.querySelector('[data-gantt-bar="t1"]')).toBeTruthy();
  });

  it('marks the axis with the active zoom level', () => {
    const { container } = renderWithProviders(<GanttView tasks={tasks} zoom="month" />);
    expect(container.querySelector('[data-gantt-axis="month"]')).toBeTruthy();
    expect(container.querySelector('[data-gantt-view="month"]')).toBeTruthy();
  });

  it('renders the today line when today is inside the range', () => {
    const today = new Date();
    const liveTasks: GanttTask[] = [
      { id: 'now', title: 'Current work', start: addDays(today, -2), end: addDays(today, 2) },
    ];
    const { container } = renderWithProviders(<GanttView tasks={liveTasks} />);
    expect(container.querySelector('[data-gantt-today="true"]')).toBeTruthy();
  });

  it('fires onItemPress when a bar is clicked', () => {
    const onItemPress = vi.fn();
    const { container } = renderWithProviders(<GanttView tasks={tasks} onItemPress={onItemPress} />);
    fireEvent.click(container.querySelector('[data-gantt-bar="t1"]') as Element);
    expect(onItemPress).toHaveBeenCalledTimes(1);
    expect(onItemPress.mock.calls[0][0].id).toBe('t1');
  });

  it('fires onItemPress from the keyboard (Enter on a focused bar)', () => {
    const onItemPress = vi.fn();
    const { container } = renderWithProviders(<GanttView tasks={tasks} onItemPress={onItemPress} />);
    fireEvent.keyDown(container.querySelector('[data-gantt-bar="t2"]') as Element, {
      key: 'Enter',
    });
    expect(onItemPress).toHaveBeenCalledTimes(1);
    expect(onItemPress.mock.calls[0][0].id).toBe('t2');
  });

  describe('bar drag (web pointer)', () => {
    it('fires onItemMove with a whole-day-shifted range on drop', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="t1"]') as Element;

      // Default medium size at week zoom = 24 px/day → +48px = +2 days.
      fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 148, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 148, clientY: 100 });

      expect(onItemMove).toHaveBeenCalledTimes(1);
      const [movedTask, span] = onItemMove.mock.calls[0];
      expect(movedTask.id).toBe('t1');
      expect(span.start).toEqual(mar(12));
      expect(span.end).toEqual(mar(14));
    });

    it('does not fire onItemMove when movement stays under the drag threshold', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="t1"]') as Element;

      fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 101, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 101, clientY: 100 });

      expect(onItemMove).not.toHaveBeenCalled();
    });

    it('does not fire onItemMove for a snapped zero-day drop', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="t1"]') as Element;

      // 8px travel activates the drag but rounds to 0 days at 24 px/day.
      fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 108, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 108, clientY: 100 });

      expect(onItemMove).not.toHaveBeenCalled();
    });

    it('still fires onItemPress for a plain click when drag is enabled', () => {
      const onItemMove = vi.fn();
      const onItemPress = vi.fn();
      const { container } = renderWithProviders(
        <GanttView tasks={tasks} onItemMove={onItemMove} onItemPress={onItemPress} />,
      );
      const bar = container.querySelector('[data-gantt-bar="t1"]') as Element;

      fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
      fireEvent.click(bar);

      expect(onItemPress).toHaveBeenCalledTimes(1);
      expect(onItemMove).not.toHaveBeenCalled();
    });

    it('cancels an in-flight drag with Escape', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="t1"]') as Element;

      fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 148, clientY: 100 });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.pointerUp(window, { clientX: 148, clientY: 100 });

      expect(onItemMove).not.toHaveBeenCalled();
    });
  });

  describe('keyboard rescheduling', () => {
    it('ArrowRight moves the focused bar 1 day later and announces the range', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      fireEvent.keyDown(container.querySelector('[data-gantt-bar="t1"]') as Element, {
        key: 'ArrowRight',
      });
      expect(onItemMove).toHaveBeenCalledTimes(1);
      const [task, span] = onItemMove.mock.calls[0];
      expect(task.id).toBe('t1');
      expect(span.start).toEqual(mar(11));
      expect(span.end).toEqual(mar(13));
      // aria-live announcement carries the task title and the new range.
      const live = document.querySelector('[data-gantt-live="true"]');
      expect(live?.getAttribute('aria-live')).toBe('assertive');
      expect(live?.textContent).toContain('Design review');
      expect(live?.textContent).toContain(formatSpanLabel(span));
    });

    it('ArrowLeft moves 1 day earlier; Shift+Arrow moves 7 days', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="t1"]') as Element;

      fireEvent.keyDown(bar, { key: 'ArrowLeft' });
      expect(onItemMove.mock.calls[0][1].start).toEqual(mar(9));
      expect(onItemMove.mock.calls[0][1].end).toEqual(mar(11));

      fireEvent.keyDown(bar, { key: 'ArrowRight', shiftKey: true });
      expect(onItemMove.mock.calls[1][1].start).toEqual(mar(17));
      expect(onItemMove.mock.calls[1][1].end).toEqual(mar(19));

      fireEvent.keyDown(bar, { key: 'ArrowLeft', shiftKey: true });
      expect(onItemMove.mock.calls[2][1].start).toEqual(mar(3));
      expect(onItemMove.mock.calls[2][1].end).toEqual(mar(5));
    });

    it('ignores arrows when rescheduling is disabled', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(
        <GanttView tasks={tasks} onItemMove={onItemMove} enableItemDrag={false} />,
      );
      fireEvent.keyDown(container.querySelector('[data-gantt-bar="t1"]') as Element, {
        key: 'ArrowRight',
      });
      expect(onItemMove).not.toHaveBeenCalled();
    });
  });

  describe('bar resize (web pointer)', () => {
    it('dragging the end handle extends the end only, snapped to whole days', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const handle = container.querySelector('[data-gantt-bar="t1"] [data-gantt-resize-handle="end"]') as Element;
      expect(handle).toBeTruthy();

      // Default medium size at week zoom = 24 px/day → +48px = +2 days.
      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 148, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 148, clientY: 100 });

      expect(onItemMove).toHaveBeenCalledTimes(1);
      const [task, span] = onItemMove.mock.calls[0];
      expect(task.id).toBe('t1');
      expect(span.start).toEqual(mar(10));
      expect(span.end).toEqual(mar(14));
    });

    it('dragging the start handle moves the start only', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const handle = container.querySelector('[data-gantt-bar="t1"] [data-gantt-resize-handle="start"]') as Element;

      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 52, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 52, clientY: 100 });

      const [, span] = onItemMove.mock.calls[0];
      expect(span.start).toEqual(mar(8));
      expect(span.end).toEqual(mar(12));
    });

    it('clamps a start resize so one inclusive day survives', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const handle = container.querySelector('[data-gantt-bar="t1"] [data-gantt-resize-handle="start"]') as Element;

      // +240px would be +10 days, but t1 spans 3 inclusive days → clamp +2.
      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 340, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 340, clientY: 100 });

      const [, span] = onItemMove.mock.calls[0];
      expect(span.start).toEqual(mar(12));
      expect(span.end).toEqual(mar(12));
    });

    it('does not fire for a zero-day snapped resize', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const handle = container.querySelector('[data-gantt-bar="t1"] [data-gantt-resize-handle="end"]') as Element;

      // 8px activates the session but rounds to 0 days at 24 px/day.
      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 108, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 108, clientY: 100 });

      expect(onItemMove).not.toHaveBeenCalled();
    });

    it('cancels an in-flight resize with Escape', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const handle = container.querySelector('[data-gantt-bar="t1"] [data-gantt-resize-handle="end"]') as Element;

      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 148, clientY: 100 });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.pointerUp(window, { clientX: 148, clientY: 100 });

      expect(onItemMove).not.toHaveBeenCalled();
    });
  });

  describe('RTL delta inversion (useDirection)', () => {
    beforeEach(() => {
      document.documentElement.setAttribute('dir', 'rtl');
    });
    afterEach(() => {
      document.documentElement.removeAttribute('dir');
    });

    it('ArrowRight moves the bar EARLIER under RTL', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      fireEvent.keyDown(container.querySelector('[data-gantt-bar="t1"]') as Element, {
        key: 'ArrowRight',
      });
      const [, span] = onItemMove.mock.calls[0];
      expect(span.start).toEqual(mar(9));
      expect(span.end).toEqual(mar(11));
    });

    it('a rightward pointer drag moves the bar EARLIER under RTL', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="t1"]') as Element;

      fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 148, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 148, clientY: 100 });

      const [, span] = onItemMove.mock.calls[0];
      expect(span.start).toEqual(mar(8));
      expect(span.end).toEqual(mar(10));
    });

    it('mirrors the marker scrub: a rightward drag moves it EARLIER', () => {
      const onMarkerDateChange = vi.fn();
      const { container } = renderWithProviders(
        <GanttView tasks={tasks} markerDate={mar(15)} onMarkerDateChange={onMarkerDateChange} />,
      );
      const handle = container.querySelector('[data-gantt-marker-handle="true"]') as Element;

      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 172, clientY: 10 });
      fireEvent.pointerUp(window, { clientX: 172, clientY: 10 });

      expect(onMarkerDateChange.mock.calls.at(-1)?.[0]).toEqual(mar(12));
    });

    it('mirrors the open-end chevron to the side the span is open at', () => {
      const { container } = renderWithProviders(<GanttView tasks={[{ id: 'vat', title: 'VAT', start: mar(10) }]} />);
      const bar = container.querySelector('[data-gantt-bar="vat"]') as HTMLElement;
      // Time flows right-to-left, so the open END is on the physical LEFT and
      // its glyph points that way.
      const chevron = bar.querySelector('[data-gantt-open-end]') as HTMLElement;
      expect(chevron.textContent).toBe('«');
      // Mirrored anchoring: the bar is placed from the right edge, not the left.
      expect(bar.style.right || getComputedStyle(bar).right).not.toBe('');
    });

    it('the physical-left handle is the END edge under RTL and inverts its delta', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="t1"]') as HTMLElement;
      const handles = bar.querySelectorAll('[data-gantt-resize-handle]');
      // Render order: physical-left first — mapped to the logical end edge.
      expect((handles[0] as HTMLElement).getAttribute('data-gantt-resize-handle')).toBe('end');

      // Physical leftward drag (-48px) = +2 logical days in RTL.
      fireEvent.pointerDown(handles[0], { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 52, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 52, clientY: 100 });

      const [, span] = onItemMove.mock.calls[0];
      expect(span.start).toEqual(mar(10));
      expect(span.end).toEqual(mar(14));
    });
  });

  describe('pinned axis header', () => {
    it('keeps the axis outside the vertical scroller; labels and rows share it', () => {
      const { container } = renderWithProviders(<GanttView tasks={tasks} />);
      // Axis lives in the pinned row above the body scroller.
      expect(container.querySelector('[data-gantt-axis-row="true"] [data-gantt-axis="week"]')).toBeTruthy();
      expect(container.querySelector('[data-gantt-scroll-body="true"] [data-gantt-axis]')).toBeNull();
      // The alignment invariant: label column and rows stay in ONE scroller.
      const body = container.querySelector('[data-gantt-scroll-body="true"]') as HTMLElement;
      expect(body.querySelector('[data-gantt-row-label="t1"]')).toBeTruthy();
      expect(body.querySelector('[data-gantt-row="t1"]')).toBeTruthy();
    });
  });

  describe('honest states (Axiom 6 / W9)', () => {
    it('renders the empty state when there are no tasks', () => {
      renderWithProviders(<GanttView tasks={[]} />);
      expect(document.querySelector('[data-async-state="empty"]')).toBeTruthy();
      expect(screen.getByText('No tasks')).toBeInTheDocument();
    });

    it('shows the gantt skeleton while loading with no tasks', () => {
      renderWithProviders(<GanttView tasks={[]} isLoading />);
      expect(document.querySelector('[data-gantt-skeleton="true"]')).toBeTruthy();
      expect(document.querySelector('[data-async-state="empty"]')).toBeNull();
    });

    it('forbids empty chrome when error is set and retries', () => {
      const onRetry = vi.fn();
      renderWithProviders(<GanttView tasks={[]} error="Tasks failed to load" onRetry={onRetry} />);
      expect(document.querySelector('[data-async-state="error"]')).toBeTruthy();
      expect(screen.queryByText('No tasks')).toBeNull();
      expect(screen.getByText('Tasks failed to load')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Retry'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('keeps showing stale bars while refreshing with data present', () => {
      const { container } = renderWithProviders(<GanttView tasks={tasks} isLoading />);
      expect(container.querySelectorAll('[data-gantt-bar]')).toHaveLength(3);
      expect(document.querySelector('[data-gantt-skeleton="true"]')).toBeNull();
    });
  });

  // ── Track view: open bounds, several spans a row, a marker ────

  describe('open-ended spans', () => {
    const openTasks: GanttTask[] = [
      { id: 'from', title: 'Live from Mar 10', start: mar(10) },
      { id: 'until', title: 'Closed Mar 12', end: mar(12) },
      { id: 'always', title: 'No dates at all' },
    ];

    it('draws each open shape differently and says which end is open', () => {
      const { container } = renderWithProviders(<GanttView tasks={openTasks} />);
      expect(container.querySelectorAll('[data-gantt-bar]')).toHaveLength(3);
      expect(container.querySelector('[data-gantt-bar="from"]')?.getAttribute('data-gantt-span-open')).toBe('end');
      expect(container.querySelector('[data-gantt-bar="until"]')?.getAttribute('data-gantt-span-open')).toBe('start');
      // Eternal is a RAIL, not a full-width bar with two chosen-looking caps.
      const rail = container.querySelector('[data-gantt-bar="always"]');
      expect(rail?.getAttribute('data-gantt-rail')).toBe('true');
      expect(rail?.getAttribute('data-gantt-span-open')).toBe('both');
      expect(container.querySelectorAll('[data-gantt-open-start]')).toHaveLength(2);
      expect(container.querySelectorAll('[data-gantt-open-end]')).toHaveLength(2);
    });

    it('speaks the open end instead of reading out an invented date', () => {
      const { container } = renderWithProviders(<GanttView tasks={openTasks} />);
      const name = (id: string) =>
        container.querySelector(`[data-gantt-bar="${id}"]`)?.getAttribute('aria-label') ?? '';
      expect(name('from')).toMatch(/no end/i);
      expect(name('until')).toMatch(/no start/i);
      expect(name('always')).toMatch(/always/i);
      expect(name('always')).not.toMatch(/\d/);
    });

    it('refuses to reschedule a span with only one bound', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={openTasks} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="from"]') as Element;

      fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 148, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 148, clientY: 100 });
      fireEvent.keyDown(bar, { key: 'ArrowRight' });

      expect(onItemMove).not.toHaveBeenCalled();
      // No second edge to hold a duration against, so no handles either.
      expect(bar.querySelector('[data-gantt-resize-handle]')).toBeNull();
    });

    it('keeps an eternal span from stretching the axis', () => {
      // A span that names no date must not widen the chart. Weekend columns
      // are one per Saturday and Sunday in the range, so their count IS the
      // range length.
      const dated = renderWithProviders(<GanttView tasks={[openTasks[1]]} />);
      const weekends = dated.container.querySelectorAll('[data-gantt-weekend]').length;
      expect(weekends).toBeGreaterThan(0);
      cleanup();
      const withRail = renderWithProviders(<GanttView tasks={[openTasks[1], openTasks[2]]} />);
      expect(withRail.container.querySelectorAll('[data-gantt-weekend]')).toHaveLength(weekends);
    });
  });

  describe('several spans on one row', () => {
    const era: GanttTask = {
      id: 'era',
      title: 'Federal true-up',
      spans: [
        { id: '2026', start: mar(1), end: mar(5) },
        { id: '2027', start: mar(8), end: mar(12) },
        { id: '2028', start: mar(15) },
      ],
    };

    it('draws one row carrying every span', () => {
      const { container } = renderWithProviders(<GanttView tasks={[era]} />);
      expect(container.querySelectorAll('[data-gantt-row-label]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-gantt-row]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-gantt-bar]')).toHaveLength(3);
      expect(container.querySelector('[data-gantt-bar="2027"]')).toBeTruthy();
      expect(container.querySelector('[data-gantt-bar="2028"]')?.getAttribute('data-gantt-span-open')).toBe('end');
    });

    it('falls back to an index key when a span carries no id', () => {
      const { container } = renderWithProviders(
        <GanttView tasks={[{ id: 'e', title: 'E', spans: [{ start: mar(10), end: mar(12) }] }]} />,
      );
      expect(container.querySelector('[data-gantt-bar="e#0"]')).toBeTruthy();
    });

    it('moves only the span that was grabbed, and names it', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={[era]} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="2027"]') as Element;

      fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 148, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 148, clientY: 100 });

      expect(onItemMove).toHaveBeenCalledTimes(1);
      const [task, range, ref] = onItemMove.mock.calls[0];
      expect(task.id).toBe('era');
      expect(range.start).toEqual(mar(10));
      expect(range.end).toEqual(mar(14));
      expect(ref.key).toBe('2027');
      expect(ref.index).toBe(1);
      expect(ref.span.id).toBe('2027');
    });

    it('reports a one-bar row as its own span, keyed by the task id', () => {
      const onItemMove = vi.fn();
      const { container } = renderWithProviders(<GanttView tasks={tasks} onItemMove={onItemMove} />);
      const bar = container.querySelector('[data-gantt-bar="t1"]') as Element;

      fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 148, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 148, clientY: 100 });

      const ref = onItemMove.mock.calls[0][2];
      expect(ref.key).toBe('t1');
      expect(ref.index).toBe(0);
      expect(ref.span.id).toBe('t1');
    });
  });

  describe('controlled marker', () => {
    const handleOf = (container: Element) => container.querySelector('[data-gantt-marker-handle="true"]') as Element;

    it('paints the marker at markerDate, with the today line switched off', () => {
      const { container } = renderWithProviders(<GanttView tasks={tasks} markerDate={mar(15)} showToday={false} />);
      expect(container.querySelector('[data-gantt-marker="true"]')).toBeTruthy();
      expect(container.querySelector('[data-gantt-today="true"]')).toBeNull();
      expect(handleOf(container)).toBeTruthy();
    });

    it('renders no marker at all when markerDate is absent', () => {
      const { container } = renderWithProviders(<GanttView tasks={tasks} />);
      expect(container.querySelector('[data-gantt-marker="true"]')).toBeNull();
      expect(container.querySelector('[data-gantt-marker-handle="true"]')).toBeNull();
    });

    it('scrubs by dragging the axis handle, snapped to whole days', () => {
      const onMarkerDateChange = vi.fn();
      const { container } = renderWithProviders(
        <GanttView tasks={tasks} markerDate={mar(15)} onMarkerDateChange={onMarkerDateChange} />,
      );
      const handle = handleOf(container);

      // 24 px/day at week zoom → +72px = +3 days.
      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 172, clientY: 10 });
      fireEvent.pointerUp(window, { clientX: 172, clientY: 10 });

      expect(onMarkerDateChange).toHaveBeenCalled();
      expect(onMarkerDateChange.mock.calls.at(-1)?.[0]).toEqual(mar(18));
    });

    it('emits once per day crossed, from the date the scrub started', () => {
      const onMarkerDateChange = vi.fn();
      const { container } = renderWithProviders(
        <GanttView tasks={tasks} markerDate={mar(15)} onMarkerDateChange={onMarkerDateChange} />,
      );
      const handle = handleOf(container);

      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 124, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 128, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 148, clientY: 10 });
      fireEvent.pointerUp(window, { clientX: 148, clientY: 10 });

      // Two days crossed, not four moves: +1 then +2, never a repeat.
      expect(onMarkerDateChange).toHaveBeenCalledTimes(2);
      expect(onMarkerDateChange.mock.calls[0][0]).toEqual(mar(16));
      expect(onMarkerDateChange.mock.calls[1][0]).toEqual(mar(17));
    });

    it('puts the marker back where the scrub started on Escape', () => {
      const onMarkerDateChange = vi.fn();
      const { container } = renderWithProviders(
        <GanttView tasks={tasks} markerDate={mar(15)} onMarkerDateChange={onMarkerDateChange} />,
      );
      const handle = handleOf(container);

      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 172, clientY: 10 });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.pointerUp(window, { clientX: 172, clientY: 10 });

      expect(onMarkerDateChange.mock.calls.at(-1)?.[0]).toEqual(mar(15));
    });

    it('steps the focused handle with the arrow keys (Shift = 7 days)', () => {
      const onMarkerDateChange = vi.fn();
      const { container } = renderWithProviders(
        <GanttView tasks={tasks} markerDate={mar(15)} onMarkerDateChange={onMarkerDateChange} />,
      );
      const handle = handleOf(container);

      fireEvent.keyDown(handle, { key: 'ArrowRight' });
      expect(onMarkerDateChange.mock.calls.at(-1)?.[0]).toEqual(mar(16));
      fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
      expect(onMarkerDateChange.mock.calls.at(-1)?.[0]).toEqual(mar(8));
    });

    it('is read-only, and says so, with no change handler', () => {
      const { container } = renderWithProviders(<GanttView tasks={tasks} markerDate={mar(15)} />);
      const handle = handleOf(container);
      expect(handle.getAttribute('role')).toBe('slider');
      expect(handle.getAttribute('aria-valuetext')).toMatch(/15/);
      expect(handle.getAttribute('tabindex')).toBe('-1');
    });

    it('leaves the today line alone — the marker is a separate line', () => {
      const today = new Date();
      const { container } = renderWithProviders(
        <GanttView
          tasks={[{ id: 'now', title: 'Now', start: addDays(today, -2), end: addDays(today, 2) }]}
          markerDate={addDays(today, -1)}
        />,
      );
      expect(container.querySelector('[data-gantt-today="true"]')).toBeTruthy();
      expect(container.querySelector('[data-gantt-marker="true"]')).toBeTruthy();
    });
  });

  describe('design-law', () => {
    function atoms(el: Element, prefixes: string[]): string[] {
      return String((el as HTMLElement).className || '')
        .split(' ')
        .filter((c) => prefixes.some((p) => c.startsWith(p)))
        .sort();
    }

    it('task and axis labels ride the fontWeight knob — never 500 or 600', () => {
      const { container } = renderWithProviders(<GanttView tasks={tasks} />);
      const taskName = screen.getByText('Implementation');
      const axis = screen.getByText('Task');
      for (const node of [taskName, axis]) {
        const weight = atoms(node, ['_fow-']);
        expect(weight.length).toBeGreaterThan(0);
        expect(weight.join(' ')).not.toMatch(/500|600|weight-5|weight-6|fow-5|fow-6/);
      }
      const frame = container.querySelector('[data-gantt-view]') as HTMLElement;
      expect(frame.getAttribute('data-size')).toBeTruthy();
      expect(frame.getAttribute('data-density')).toBeTruthy();
    });
  });
});

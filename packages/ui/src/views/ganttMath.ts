/**
 * Pure timeline math for the Gantt view: date→position mapping, zoom scales,
 * axis tick generation, and bar-drag day snapping.
 *
 * Everything here is platform-agnostic and side-effect free (same discipline
 * as `calendarMath.ts` / `kanbanDnd.ts`) so web and native share one source
 * of truth and the logic stays unit-testable without a DOM.
 *
 * All day math is LOCAL wall-clock (date-component construction, deltas
 * rounded) so ranges survive DST boundaries — the Calendar view's
 * `computeEventMoveRange` convention.
 *
 * Visible and spoken labels route through the canonical date registers in
 * `@repo/theme`.
 */

import { formatAbsoluteDate, formatDayOfMonth, formatMonthYear } from '@repo/theme';

export type GanttZoom = 'day' | 'week' | 'month';

export const MS_PER_DAY = 86_400_000;

/** Local start-of-day for a date. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Add whole calendar days, preserving wall-clock time-of-day across DST. */
export function addDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

/** Whole-day difference `to - from` (start-of-day to start-of-day, DST-safe). */
export function dayDiff(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

// ── Span normalization ────────────────────────────────────────

export interface GanttSpan {
  start: Date;
  end: Date;
}

/**
 * Normalized paint edges for a task span.
 *
 * End dates at exact midnight are INCLUSIVE whole days (Frappe date fields
 * parse to local midnight: a task `2026-03-10 → 2026-03-12` covers three
 * days, its bar's trailing edge at the start of the 13th). Ends with a
 * time-of-day are exact edges. Degenerate/inverted spans clamp to at least
 * one full day from the start so every task paints a visible bar.
 */
export function normalizeSpanEdges(span: GanttSpan): { startEdge: Date; endEdge: Date } {
  const startEdge = span.start;
  const midnightEnd =
    span.end.getHours() === 0 &&
    span.end.getMinutes() === 0 &&
    span.end.getSeconds() === 0 &&
    span.end.getMilliseconds() === 0;
  let endEdge = midnightEnd ? addDays(startOfDay(span.end), 1) : span.end;
  if (endEdge.getTime() <= startEdge.getTime()) {
    endEdge = addDays(startOfDay(startEdge), 1);
  }
  return { startEdge, endEdge };
}

/** Shift a span by whole days, preserving duration and wall-clock times. */
export function shiftSpanByDays(span: GanttSpan, dayDelta: number): GanttSpan {
  return { start: addDays(span.start, dayDelta), end: addDays(span.end, dayDelta) };
}

// ── Bar resize (edge drags) ───────────────────────────────────

/** Which edge of a bar a resize drag adjusts. */
export type GanttResizeEdge = 'start' | 'end';

/** Inclusive whole days a span paints (normalized edges, minimum 1). */
export function spanInclusiveDays(span: GanttSpan): number {
  const { startEdge, endEdge } = normalizeSpanEdges(span);
  return Math.max(1, dayDiff(startEdge, endEdge));
}

/**
 * Clamp a whole-day resize delta so the span keeps at least one inclusive
 * day: the start edge may move later at most `inclusiveDays - 1` days, the
 * end edge earlier by the same bound. Growing is unbounded.
 */
export function clampResizeDayDelta(span: GanttSpan, edge: GanttResizeEdge, dayDelta: number): number {
  const maxShrink = spanInclusiveDays(span) - 1;
  return edge === 'start' ? Math.min(dayDelta, maxShrink) : Math.max(dayDelta, -maxShrink);
}

/**
 * Resize one edge of a span by whole days (clamped via
 * `clampResizeDayDelta`), preserving the wall-clock time of both edges —
 * the untouched edge never moves.
 */
export function resizeSpanByDays(span: GanttSpan, edge: GanttResizeEdge, dayDelta: number): GanttSpan {
  const clamped = clampResizeDayDelta(span, edge, dayDelta);
  return edge === 'start'
    ? { start: addDays(span.start, clamped), end: span.end }
    : { start: span.start, end: addDays(span.end, clamped) };
}

// ── Chart range ───────────────────────────────────────────────

/** Day-aligned chart window; `end` is EXCLUSIVE (first day past the chart). */
export interface GanttRange {
  start: Date;
  end: Date;
}

/** Local start of the week containing `date` (`firstDayOfWeek`: 0 = Sunday, 1 = Monday). */
export function startOfWeek(date: Date, firstDayOfWeek: 0 | 1): Date {
  const day = startOfDay(date);
  let offset = day.getDay() - firstDayOfWeek;
  if (offset < 0) {
    offset += 7;
  }
  return addDays(day, -offset);
}

/** Local first of the month containing `date`. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Padded, zoom-aligned chart range covering every task (and today, so the
 * today line always has somewhere to land). Alignment: day zoom pads ±2
 * days; week zoom aligns to week boundaries with a week of padding; month
 * zoom aligns to month boundaries with a month of padding. With no tasks
 * the range centers on `today` (callers normally render an empty state
 * instead).
 */
export function computeGanttRange(
  spans: readonly GanttSpan[],
  zoom: GanttZoom,
  today: Date = new Date(),
  firstDayOfWeek: 0 | 1 = 0,
): GanttRange {
  let min = startOfDay(today);
  let max = addDays(min, 1);
  for (const span of spans) {
    const { startEdge, endEdge } = normalizeSpanEdges(span);
    if (startOfDay(startEdge).getTime() < min.getTime()) {
      min = startOfDay(startEdge);
    }
    if (endEdge.getTime() > max.getTime()) {
      max = addDays(startOfDay(addDays(endEdge, -1)), 1);
    }
  }
  if (zoom === 'day') {
    return { start: addDays(min, -2), end: addDays(max, 2) };
  }
  if (zoom === 'week') {
    return {
      start: addDays(startOfWeek(min, firstDayOfWeek), -7),
      end: addDays(startOfWeek(addDays(max, 6), firstDayOfWeek), 7),
    };
  }
  const monthStart = startOfMonth(min);
  const monthEnd = new Date(max.getFullYear(), max.getMonth() + 1, 1);
  return {
    start: new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1),
    end: new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, 1),
  };
}

/** Total whole days spanned by a range (its chart width in day units). */
export function rangeDays(range: GanttRange): number {
  return Math.max(1, dayDiff(range.start, range.end));
}

// ── Date ↔ pixel mapping ──────────────────────────────────────

/** Horizontal px offset of a date within the range at a px-per-day scale. */
export function dateToX(date: Date, rangeStart: Date, pxPerDay: number): number {
  const dayPart = dayDiff(rangeStart, date);
  const minutePart = (date.getHours() * 60 + date.getMinutes()) / (24 * 60);
  return (dayPart + minutePart) * pxPerDay;
}

/**
 * Anchor near the viewport's logical start. Wide canvases keep the existing
 * label-width inset; narrow canvases reserve room for the date and its marker.
 * A null viewport is provisional and must be re-anchored after layout.
 */
export function scrollAnchorX(
  date: Date,
  rangeStart: Date,
  pxPerDay: number,
  options: { labelWidth: number; chartWidth: number; viewportWidth: number | null; rtl: boolean },
): number {
  const { labelWidth, chartWidth, viewportWidth, rtl } = options;
  const inset = viewportWidth === null ? labelWidth : Math.min(labelWidth, Math.floor(viewportWidth / 3));
  const maxScroll = Math.max(0, chartWidth - (viewportWidth ?? 0));
  const ltrX = Math.min(maxScroll, Math.max(0, dateToX(date, rangeStart, pxPerDay) - inset));
  return rtl ? Math.min(maxScroll, Math.max(0, maxScroll - ltrX)) : ltrX;
}

/** Start-of-day date at a horizontal px offset (fractional days floor). */
export function xToDate(x: number, rangeStart: Date, pxPerDay: number): Date {
  return addDays(startOfDay(rangeStart), Math.floor(x / pxPerDay));
}

/** Snapped whole-day delta for a horizontal drag distance. */
export function dxToDayDelta(dx: number, pxPerDay: number): number {
  return Math.round(dx / pxPerDay);
}

export interface GanttBarGeometry {
  x: number;
  width: number;
}

/**
 * Bar geometry for a task span within the chart range. Widths clamp to
 * `minWidthPx` so degenerate spans stay visible/pressable.
 */
export function barGeometry(span: GanttSpan, rangeStart: Date, pxPerDay: number, minWidthPx = 6): GanttBarGeometry {
  const { startEdge, endEdge } = normalizeSpanEdges(span);
  const x = dateToX(startEdge, rangeStart, pxPerDay);
  const width = Math.max(minWidthPx, dateToX(endEdge, rangeStart, pxPerDay) - x);
  return { x, width };
}

// ── Open-ended spans ──────────────────────────────────────────

/**
 * A span whose bounds are BOTH optional: an absent bound means the span is
 * open at that end, not that the caller forgot it.
 *
 * The distinction is the whole point. A thing live from a date with no end,
 * or live forever with no dates at all, cannot be spelled as a `GanttSpan`
 * without inventing the missing edge — and an invented edge reads to the
 * viewer as a date somebody chose. So absence stays absent all the way to
 * the paint, where `openBarGeometry` reports it as `openStart` / `openEnd`
 * and the renderer draws a shape that says "this end is not an end".
 */
export interface GanttOpenSpan {
  start?: Date;
  end?: Date;
}

/** Neither bound set: the span names no date at all and is live throughout. */
export function isEternalSpan(span: GanttOpenSpan): boolean {
  return span.start === undefined && span.end === undefined;
}

/** Both bounds set — the only shape drag, resize and keyboard moves accept. */
export function isBoundedSpan(span: GanttOpenSpan): span is GanttSpan {
  return span.start !== undefined && span.end !== undefined;
}

/**
 * What an open span contributes to the chart RANGE.
 *
 * An eternal span contributes nothing — it names no date, so it must not
 * stretch the axis. A half-open span contributes the one date it does name,
 * as a degenerate span, so the range always reaches far enough to show where
 * that end opens.
 */
export function openSpanExtent(span: GanttOpenSpan): GanttSpan | undefined {
  const start = span.start ?? span.end;
  const end = span.end ?? span.start;
  if (start === undefined || end === undefined) {
    return undefined;
  }
  return { start, end };
}

/** Every range-contributing extent in a list of open spans, eternals dropped. */
export function openSpanExtents(spans: readonly GanttOpenSpan[]): GanttSpan[] {
  const extents: GanttSpan[] = [];
  for (const span of spans) {
    const extent = openSpanExtent(span);
    if (extent) {
      extents.push(extent);
    }
  }
  return extents;
}

export interface GanttOpenBarGeometry extends GanttBarGeometry {
  /** No start bound: the bar runs off the range's start edge, uncapped. */
  openStart: boolean;
  /** No end bound: the bar runs off the range's end edge, uncapped. */
  openEnd: boolean;
  /** Neither bound: the whole range, drawn as a rail rather than a bar. */
  eternal: boolean;
}

/**
 * Bar geometry for a possibly-open span, clipped to the chart.
 *
 * A bounded span measures exactly as `barGeometry` measures it (same
 * normalized inclusive edges) — the range always covers it, so the clip is a
 * no-op there. An open end runs to the matching edge of the chart, and an
 * eternal span covers the whole of it.
 */
export function openBarGeometry(
  span: GanttOpenSpan,
  range: GanttRange,
  pxPerDay: number,
  minWidthPx = 6,
): GanttOpenBarGeometry {
  const chartWidth = rangeDays(range) * pxPerDay;
  const openStart = span.start === undefined;
  const openEnd = span.end === undefined;
  const extent = openSpanExtent(span);
  if (!extent) {
    return { x: 0, width: chartWidth, openStart: true, openEnd: true, eternal: true };
  }
  const { startEdge, endEdge } = normalizeSpanEdges(extent);
  const rawStart = openStart ? 0 : dateToX(startEdge, range.start, pxPerDay);
  const rawEnd = openEnd ? chartWidth : dateToX(endEdge, range.start, pxPerDay);
  const x = Math.max(0, Math.min(chartWidth, rawStart));
  const right = Math.max(0, Math.min(chartWidth, rawEnd));
  return { x, width: Math.max(minWidthPx, right - x), openStart, openEnd, eternal: false };
}

/**
 * X offset of a date's column CENTRE within the range, or null when the date
 * falls outside it. The today line and the controlled marker are the same
 * measurement taken at different dates.
 */
export function dateLineX(range: GanttRange, pxPerDay: number, date: Date): number | null {
  const day = startOfDay(date);
  if (day.getTime() < range.start.getTime() || day.getTime() >= range.end.getTime()) {
    return null;
  }
  // Line sits at the middle of that date's column.
  return dateToX(day, range.start, pxPerDay) + pxPerDay / 2;
}

/** X offset of the today line, or null when today is outside the range. */
export function todayLineX(range: GanttRange, pxPerDay: number, today: Date = new Date()): number | null {
  return dateLineX(range, pxPerDay, today);
}

// ── Axis ticks ────────────────────────────────────────────────

export interface GanttTick {
  /** Horizontal offset within the chart. */
  x: number;
  /** Tick date (start of its unit). */
  date: Date;
  /** Major ticks carry labels and stronger grid lines. */
  major: boolean;
  /** Axis label (major ticks only). */
  label?: string;
}

// Timeline labels ride the canonical date registers.
// Ticks take `year: "never"` — the header states the year, and a widened
// "Mar 10, 2025" tick would collide with its neighbour.
const dayLabel = (date: Date) => formatDayOfMonth(date);
const monthDayLabel = (date: Date) => formatAbsoluteDate(date, { year: 'never' });
const monthYearLabel = (date: Date) => formatMonthYear(date);

/**
 * Axis ticks for a range at a zoom level.
 *
 * - `day`: a major tick per day — month starts (and the first tick) label
 *   "Mar 10", other days just the day number.
 * - `week`: a minor tick per day, a major labeled tick per week start.
 * - `month`: a minor tick per week start, a major labeled tick per month
 *   start ("Mar 2026").
 */
export function generateTicks(
  range: GanttRange,
  zoom: GanttZoom,
  pxPerDay: number,
  firstDayOfWeek: 0 | 1 = 0,
): GanttTick[] {
  const ticks: GanttTick[] = [];
  const totalDays = rangeDays(range);
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(startOfDay(range.start), i);
    const x = i * pxPerDay;
    if (zoom === 'day') {
      const monthEdge = date.getDate() === 1 || i === 0;
      ticks.push({
        x,
        date,
        major: true,
        label: monthEdge ? monthDayLabel(date) : dayLabel(date),
      });
      continue;
    }
    if (zoom === 'week') {
      const weekStart = dayDiff(startOfWeek(date, firstDayOfWeek), date) === 0;
      ticks.push({
        x,
        date,
        major: weekStart,
        label: weekStart ? monthDayLabel(date) : undefined,
      });
      continue;
    }
    const monthStart = date.getDate() === 1;
    const weekStart = dayDiff(startOfWeek(date, firstDayOfWeek), date) === 0;
    if (!monthStart && !weekStart) {
      continue;
    }
    ticks.push({
      x,
      date,
      major: monthStart,
      label: monthStart ? monthYearLabel(date) : undefined,
    });
  }
  return ticks;
}

/** Visible header label for the chart range: "Mar 2026 – Jun 2026". */
export function formatRangeLabel(range: GanttRange): string {
  const start = monthYearLabel(range.start);
  const end = monthYearLabel(addDays(range.end, -1));
  return start === end ? start : `${start} – ${end}`;
}

/**
 * Full accessible name for a task bar (Axiom 12):
 * "Design review, Mar 10 – Mar 12".
 */
export function ganttTaskAccessibleLabel(task: { title: string; start: Date; end: Date }): string {
  const { startEdge, endEdge } = normalizeSpanEdges(task);
  const lastDay = addDays(endEdge, -1);
  const startLabel = monthDayLabel(startEdge);
  const endLabel = monthDayLabel(lastDay.getTime() >= startEdge.getTime() ? lastDay : startEdge);
  return startLabel === endLabel ? `${task.title}, ${startLabel}` : `${task.title}, ${startLabel} – ${endLabel}`;
}

/** Visible label for a live drag preview: "Mar 10 – Mar 12" (or one day). */
export function formatSpanLabel(span: GanttSpan): string {
  const { startEdge, endEdge } = normalizeSpanEdges(span);
  const lastDay = addDays(endEdge, -1);
  const startLabel = monthDayLabel(startEdge);
  const endLabel = monthDayLabel(lastDay.getTime() >= startEdge.getTime() ? lastDay : startEdge);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

/**
 * The date halves of an open span's label, each absent exactly when its bound
 * is. The WORDS around them belong to the view, which has `t()` — this stays
 * pure and says only what the dates are.
 */
export function openSpanLabelParts(span: GanttOpenSpan): { start?: string; end?: string } {
  const extent = openSpanExtent(span);
  if (!extent) {
    return {};
  }
  const { startEdge, endEdge } = normalizeSpanEdges(extent);
  const lastDay = addDays(endEdge, -1);
  return {
    start: span.start === undefined ? undefined : monthDayLabel(startEdge),
    end:
      span.end === undefined
        ? undefined
        : monthDayLabel(lastDay.getTime() >= startEdge.getTime() ? lastDay : startEdge),
  };
}

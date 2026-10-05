/**
 * Pure time-grid math, drag/resize/create geometry, and accessible-label
 * builders for the Calendar view.
 *
 * Everything here is platform-agnostic and side-effect free (same discipline
 * as `kanbanDnd.ts`) so web and native share one source of truth and the
 * logic stays unit-testable without a DOM.
 *
 * Motion vocabulary (Axiom 4): these helpers only produce *snapped* discrete
 * values — the component layer tweens between them with `knobProps.transition`
 * while raw pointer tracking stays 1:1
 * (A-GESTURE).
 *
 * Every visible/spoken date string here routes through the canonical
 * registers in `@repo/theme` — the
 * calendar speaks the same date voice as tables, feeds and pickers.
 */

import { formatDayLong, formatTimeOfDay } from '@repo/theme';

export const MINUTES_PER_DAY = 1440;

/** Wall-clock minutes since midnight for a date. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Snap minutes to a grid increment, clamped to a single day.
 * `floor`/`ceil` are used by drag-to-create so the sketched block always
 * covers the slots the pointer actually crossed.
 */
export function snapMinutes(minutes: number, increment: number, mode: 'round' | 'floor' | 'ceil' = 'round'): number {
  const step =
    mode === 'floor'
      ? Math.floor(minutes / increment)
      : mode === 'ceil'
        ? Math.ceil(minutes / increment)
        : Math.round(minutes / increment);
  const snapped = step * increment;
  return Math.max(0, Math.min(MINUTES_PER_DAY, snapped));
}

/** Vertical pixel offset inside a day column for a minutes-of-day value. */
export function minutesToY(minutes: number, hourHeight: number): number {
  return (minutes / 60) * hourHeight;
}

/** Minutes-of-day for a vertical pixel offset inside a day column (clamped). */
export function yToMinutes(y: number, hourHeight: number): number {
  const minutes = (y / hourHeight) * 60;
  return Math.max(0, Math.min(MINUTES_PER_DAY, minutes));
}

// ── Overlap layout (week/day columns) ─────────────────────────

export interface TimedBlockInput {
  id: string;
  startMin: number;
  endMin: number;
}

export interface TimedBlockLayout extends TimedBlockInput {
  /** 0-based column within the block's overlap cluster. */
  column: number;
  /** Total columns in the cluster (divide the day column width by this). */
  columns: number;
}

/**
 * Assign side-by-side columns to overlapping timed events (Google Calendar
 * style). Blocks are clustered by transitive overlap; within a cluster each
 * block takes the first free column, and every cluster member reports the
 * cluster's total column count so widths divide evenly.
 */
export function layoutDayBlocks(blocks: readonly TimedBlockInput[]): TimedBlockLayout[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const results: TimedBlockLayout[] = [];
  let cluster: TimedBlockLayout[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];

  const flushCluster = () => {
    for (const item of cluster) {
      item.columns = columnEnds.length;
    }
    results.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const block of sorted) {
    if (cluster.length > 0 && block.startMin >= clusterEnd) {
      flushCluster();
    }
    let column = columnEnds.findIndex((end) => end <= block.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(block.endMin);
    } else {
      columnEnds[column] = block.endMin;
    }
    cluster.push({ ...block, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, block.endMin);
  }
  flushCluster();
  return results;
}

// ── Range math for move / resize / create ─────────────────────

export interface CalendarRange {
  start: Date;
  end: Date;
}

function dateAtMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
}

/**
 * Move an event to a target day + snapped start minutes, preserving its
 * duration (zero-duration events stay zero-duration).
 */
export function moveRangeToSlot(
  event: { start: Date; end?: Date },
  targetDay: Date,
  targetStartMinutes: number,
): CalendarRange {
  const durationMs = event.end ? event.end.getTime() - event.start.getTime() : 0;
  const start = dateAtMinutes(targetDay, targetStartMinutes);
  return { start, end: new Date(start.getTime() + Math.max(0, durationMs)) };
}

/**
 * Resize one edge of an event to a snapped pointer position, keeping the
 * other edge fixed and enforcing a minimum duration of one grid increment.
 * All math is wall-clock within the event's start day.
 */
export function computeResizeRange(
  event: { start: Date; end?: Date },
  edge: 'start' | 'end',
  pointerMinutes: number,
  slotMinutes: number,
): CalendarRange {
  const day = event.start;
  const startMin = minutesOfDay(event.start);
  const endMin = event.end ? startMin + (event.end.getTime() - event.start.getTime()) / 60000 : startMin + slotMinutes;
  const snapped = snapMinutes(pointerMinutes, slotMinutes, 'round');
  if (edge === 'end') {
    const nextEnd = Math.min(MINUTES_PER_DAY, Math.max(startMin + slotMinutes, snapped));
    return { start: dateAtMinutes(day, startMin), end: dateAtMinutes(day, nextEnd) };
  }
  const nextStart = Math.max(0, Math.min(endMin - slotMinutes, snapped));
  return { start: dateAtMinutes(day, nextStart), end: dateAtMinutes(day, endMin) };
}

/**
 * Live range for a drag-to-create sketch: anchor snaps down, the moving edge
 * snaps up (dragging up swaps them), and the block always spans at least one
 * increment so a bare press still sketches a real slot.
 */
export function createRangeFromDrag(
  day: Date,
  anchorMinutes: number,
  currentMinutes: number,
  slotMinutes: number,
): CalendarRange {
  const lo = snapMinutes(Math.min(anchorMinutes, currentMinutes), slotMinutes, 'floor');
  const hiRaw = snapMinutes(Math.max(anchorMinutes, currentMinutes), slotMinutes, 'ceil');
  const hi = Math.min(MINUTES_PER_DAY, Math.max(hiRaw, lo + slotMinutes));
  return { start: dateAtMinutes(day, lo), end: dateAtMinutes(day, Math.max(hi, lo + slotMinutes)) };
}

// ── Keyboard focus stepping ───────────────────────────────────

export type CalendarArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/**
 * Step the focused day for an arrow key. In month view vertical arrows move
 * by a week row; in week/day views vertical movement belongs to the time
 * axis, so only horizontal arrows step days.
 */
export function moveFocusDate(date: Date, key: CalendarArrowKey, view: 'month' | 'week' | 'day'): Date {
  const next = new Date(date);
  if (key === 'ArrowLeft') {
    next.setDate(date.getDate() - 1);
  } else if (key === 'ArrowRight') {
    next.setDate(date.getDate() + 1);
  } else if (view === 'month') {
    next.setDate(date.getDate() + (key === 'ArrowDown' ? 7 : -7));
  }
  return next;
}

/** Step the focused time slot; clamped so slot + increment stays in the day. */
export function moveFocusSlot(minutes: number, key: 'ArrowUp' | 'ArrowDown', slotMinutes: number): number {
  const next = minutes + (key === 'ArrowDown' ? slotMinutes : -slotMinutes);
  return Math.max(0, Math.min(MINUTES_PER_DAY - slotMinutes, next));
}

// ── Formatting / accessible names ─────────────────────────────

/** "2:00 PM" — the house time-of-day register. */
export function formatTimeShort(date: Date): string {
  return formatTimeOfDay(date);
}

/** "2:00 PM – 3:30 PM" visible label used by resize / create sketches. */
export function formatTimeRangeLabel(start: Date, end: Date): string {
  return `${formatTimeShort(start)} – ${formatTimeShort(end)}`;
}

/**
 * Full accessible name for an event element (Axiom 12):
 * "Deploy to staging, Tuesday, March 10, 2:00 PM – 3:00 PM".
 * Untimed events fall back to the day name alone.
 */
export function eventAccessibleLabel(event: { title: string; start: Date; end?: Date }): string {
  const dayLabel = formatDayLong(event.start);
  if (!event.end || event.end.getTime() === event.start.getTime()) {
    return `${event.title}, ${dayLabel}`;
  }
  return `${event.title}, ${dayLabel}, ${formatTimeRangeLabel(event.start, event.end)}`;
}

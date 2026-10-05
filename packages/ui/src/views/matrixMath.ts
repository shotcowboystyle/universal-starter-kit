/**
 * Pure bucket math for the Matrix view: a subject-by-period coverage grid.
 *
 * The column axis is GENERATED from a bucket rule (day / week / month) over a
 * date range, never declared column by column, and every boundary comes out
 * of `ganttMath`: `generateTicks` places the buckets, and the `startOfDay` /
 * `startOfWeek` / `startOfMonth` / `addDays` family aligns the range. The
 * matrix and the Gantt therefore agree on where a week starts and how a day
 * survives a DST change, and there is deliberately no second "add a day"
 * here (`matrixMath.test.ts` reads this file to keep it that way).
 *
 * Same discipline as the sibling math modules: platform-agnostic, side-effect
 * free, DOM-free, unit-testable.
 */

import { formatAbsoluteDate, formatMonthYear } from '@repo/theme';

import {
  addDays,
  generateTicks,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type GanttRange,
  type GanttZoom,
} from './ganttMath';

/** The rule a bucket axis is generated from: the Gantt zoom levels, on purpose. */
export type MatrixBucketRule = GanttZoom;

/** Bucket-aligned window; `end` is EXCLUSIVE (the first day past the grid). */
export type MatrixRange = GanttRange;

export interface MatrixBucket {
  /** Local date key of the bucket start (`YYYY-MM-DD`), stable across renders. */
  key: string;
  /** Inclusive local start. */
  start: Date;
  /** Exclusive local end (the next bucket's start). */
  end: Date;
  /** Column header text: the ganttMath tick register for the rule. */
  label: string;
  /** Spoken name: the full date register ("Mar 10, 2026", "Mar 8 – Mar 14", "Mar 2026"). */
  name: string;
}

export type MatrixIntent = 'accent' | 'error' | 'warning' | 'success';

/**
 * One data point: a subject, a date, and what the cell should say about it.
 *
 * Several points may land in one (row, bucket) intersection; `summarizeMatrixCells`
 * folds them. A point with no `value` and no `intensity` is PRESENCE: the
 * cell paints at full strength. A `value` of 0 is a real zero and paints at
 * the floor of the ramp, which is not the same thing as no point at all.
 */
export interface MatrixCell {
  rowId: string;
  date: Date;
  /** Magnitude. Summed within a bucket; scales the intensity against the grid's max. */
  value?: number;
  /** Explicit paint strength 0–1. Wins over the value-derived intensity. */
  intensity?: number;
  /** Semantic cell intent rendered via the theme ramps. */
  intent?: MatrixIntent;
  /** Explicit fill (hex/rgb/token). Passes through untouched (Axiom 11). Wins over `intent`. */
  color?: string;
  /** Visible cell text, when it should differ from the formatted value. */
  label?: string;
}

/** Everything that landed in one (row, bucket) intersection. */
export interface MatrixCellSummary {
  rowId: string;
  bucketKey: string;
  /** Sum of the defined values, or undefined when no point carried one. */
  value: number | undefined;
  /** Points that landed in the bucket. */
  count: number;
  /** Strongest explicit intensity, or undefined when none was given. */
  intensity: number | undefined;
  /** Last defined intent in point order. */
  intent: MatrixIntent | undefined;
  /** Last defined explicit color in point order. */
  color: string | undefined;
  /** Last defined label in point order. */
  label: string | undefined;
  cells: MatrixCell[];
}

/** Local `YYYY-MM-DD` key for a date (wall-clock, never UTC). */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local start of the bucket containing `date` under `rule`. */
export function bucketStart(date: Date, rule: MatrixBucketRule, firstDayOfWeek: 0 | 1 = 0): Date {
  if (rule === 'day') {
    return startOfDay(date);
  }
  if (rule === 'week') {
    return startOfWeek(date, firstDayOfWeek);
  }
  return startOfMonth(date);
}

/** Start of the bucket after the one starting at `start`. */
export function nextBucketStart(start: Date, rule: MatrixBucketRule): Date {
  if (rule === 'day') {
    return addDays(start, 1);
  }
  if (rule === 'week') {
    return addDays(start, 7);
  }
  return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

/**
 * Snap a window to bucket boundaries: the start rounds DOWN to its bucket,
 * the exclusive end rounds UP to the boundary after the last included day.
 * A degenerate or inverted window still yields one bucket.
 */
export function alignMatrixRange(range: MatrixRange, rule: MatrixBucketRule, firstDayOfWeek: 0 | 1 = 0): MatrixRange {
  const start = bucketStart(range.start, rule, firstDayOfWeek);
  const lastIncluded = addDays(startOfDay(range.end), -1);
  const lastDay = lastIncluded.getTime() < start.getTime() ? start : lastIncluded;
  return { start, end: nextBucketStart(bucketStart(lastDay, rule, firstDayOfWeek), rule) };
}

/**
 * Bucket-aligned window covering every date, with no padding: a matrix wants
 * exactly the buckets its data spans, because a padded month would read as
 * an empty column somebody chose. With no dates the window is the single
 * bucket containing `today`.
 */
export function computeMatrixRange(
  dates: readonly Date[],
  rule: MatrixBucketRule,
  firstDayOfWeek: 0 | 1 = 0,
  today: Date = new Date(),
): MatrixRange {
  let min: Date | null = null;
  let max: Date | null = null;
  for (const date of dates) {
    if (min === null || date.getTime() < min.getTime()) {
      min = date;
    }
    if (max === null || date.getTime() > max.getTime()) {
      max = date;
    }
  }
  const lo = min ?? today;
  const hi = max ?? today;
  return alignMatrixRange({ start: lo, end: addDays(startOfDay(hi), 1) }, rule, firstDayOfWeek);
}

/** Spoken name for a bucket: the full date register, never the tick abbreviation. */
export function bucketName(start: Date, end: Date, rule: MatrixBucketRule): string {
  if (rule === 'day') {
    return formatAbsoluteDate(start);
  }
  if (rule === 'week') {
    const lastDay = addDays(end, -1);
    return `${formatAbsoluteDate(start, { year: 'never' })} – ${formatAbsoluteDate(lastDay)}`;
  }
  return formatMonthYear(start);
}

/**
 * The bucket axis for a window under a rule.
 *
 * Boundaries are the MAJOR ticks `generateTicks` places at a one-px-per-day
 * scale, so a matrix column starts exactly where the Gantt axis would label
 * it. The window is aligned first, which is what makes the first tick major.
 */
export function generateBuckets(range: MatrixRange, rule: MatrixBucketRule, firstDayOfWeek: 0 | 1 = 0): MatrixBucket[] {
  const aligned = alignMatrixRange(range, rule, firstDayOfWeek);
  const majors = generateTicks(aligned, rule, 1, firstDayOfWeek).filter((tick) => tick.major);
  return majors.map((tick, index) => {
    const start = tick.date;
    const end = majors[index + 1]?.date ?? aligned.end;
    const name = bucketName(start, end, rule);
    return { key: localDateKey(start), start, end, label: tick.label ?? name, name };
  });
}

/** Map key for one (row, bucket) intersection. */
export function matrixCellKey(rowId: string, bucketKey: string): string {
  return `${rowId}\u0000${bucketKey}`;
}

/** Fold every point into its (row, bucket) intersection under `rule`. */
export function summarizeMatrixCells(
  cells: readonly MatrixCell[],
  rule: MatrixBucketRule,
  firstDayOfWeek: 0 | 1 = 0,
): Map<string, MatrixCellSummary> {
  const summaries = new Map<string, MatrixCellSummary>();
  for (const cell of cells) {
    const bucketKey = localDateKey(bucketStart(cell.date, rule, firstDayOfWeek));
    const key = matrixCellKey(cell.rowId, bucketKey);
    let summary = summaries.get(key);
    if (!summary) {
      summary = {
        rowId: cell.rowId,
        bucketKey,
        value: undefined,
        count: 0,
        intensity: undefined,
        intent: undefined,
        color: undefined,
        label: undefined,
        cells: [],
      };
      summaries.set(key, summary);
    }
    summary.count += 1;
    summary.cells.push(cell);
    if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
      summary.value = (summary.value ?? 0) + cell.value;
    }
    if (typeof cell.intensity === 'number' && Number.isFinite(cell.intensity)) {
      summary.intensity = Math.max(summary.intensity ?? 0, cell.intensity);
    }
    if (cell.intent !== undefined) {
      summary.intent = cell.intent;
    }
    if (cell.color !== undefined) {
      summary.color = cell.color;
    }
    if (cell.label !== undefined) {
      summary.label = cell.label;
    }
  }
  return summaries;
}

/** Largest positive summed value across the grid (0 when none). */
export function matrixMaxValue(summaries: Iterable<MatrixCellSummary>): number {
  let max = 0;
  for (const summary of summaries) {
    if (summary.value !== undefined && summary.value > max) {
      max = summary.value;
    }
  }
  return max;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Paint strength 0–1 for a cell. An explicit intensity wins; presence with
 * no value is full strength; a zero (or a grid with no positive value) is
 * the floor; otherwise the value scaled against the grid's max.
 */
export function matrixCellIntensity(summary: MatrixCellSummary, maxValue: number): number {
  if (summary.intensity !== undefined) {
    return clamp01(summary.intensity);
  }
  if (summary.value === undefined) {
    return 1;
  }
  if (summary.value <= 0 || maxValue <= 0) {
    return 0;
  }
  return clamp01(summary.value / maxValue);
}

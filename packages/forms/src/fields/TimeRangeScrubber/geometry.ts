import { MIN_PRESS_TARGET, resolveRadiusClass, type BorderRadius, type HitSlopInsets } from '@repo/theme';

import type { DateRange } from '../DatePicker/DateRangePicker';

/** Touch-floor axis band (proposed; named on the D-scrubber board). */
export const AXIS_BAND = 44;

/** Frame ticks are marks, not knob specimens — radius stays 0. */
export const FRAME_TICK = { width: 3, height: 12 } as const;
export const KEY_TICK = { width: 1, height: 7 } as const;
export const BRUSH_HANDLE = { width: 7, height: 28 } as const;
export const BRUSH_BAND_HEIGHT = 28;
export const PLAYHEAD_WIDTH = 1;
export const CHIP_HEIGHT = 28;
/** Board-measured pin (D-scrubber 28/r5). Family vs per-part radius is RULE MISSING. */
export const CHIP_RADIUS = 5;
export const CAP_HEIGHT = 28;
/** Board-measured pin (D-scrubber 28/r9). Family vs per-part radius is RULE MISSING. */
export const CAP_RADIUS = 9;

/** Recognition constant: touch must hold before a lift, so swipe-scroll survives. */
export const TOUCH_HOLD_MS = 200;

export const DEFAULT_TRAILING_WINDOW_MS = 10_000;

export type SnapTo = 'none' | 'frames' | 'grid';
export type ScrubberSession = 'idle' | 'drag' | 'jump';
export type ScrubberSize = 'small' | 'medium' | 'large';

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface ActivitySpan {
  start: Date;
  end: Date;
  label?: string;
}

export interface QuickRange {
  label: string;
  /** Absolute duration in milliseconds. Relative EUI strings are rejected. */
  durationMs: number;
}

export const DEFAULT_QUICK_RANGES: readonly QuickRange[] = [
  { label: '15 m', durationMs: 15 * 60 * 1000 },
  { label: '1 h', durationMs: 60 * 60 * 1000 },
  { label: '8 h', durationMs: 8 * 60 * 60 * 1000 },
  { label: '24 h', durationMs: 24 * 60 * 60 * 1000 },
  { label: '7 d', durationMs: 7 * 24 * 60 * 60 * 1000 },
];

const RELATIVE_DATE = /^(now)([+-].+)?$/i;

/**
 * Grip diameter. Kin of `getSliderThumbRenderSize`; 16 / 20 / 26 is the
 * D-scrubber proposal (AXIS_BAND stays 44 — touch floor, not a size step).
 */
export function getScrubberGripRenderSize(size: ScrubberSize | string | number | undefined): number {
  const token = String(size ?? 'medium');
  if (token === 'small' || token === '$1' || token === '$2' || token === '$3') {
    return 16;
  }
  if (token === 'large' || token === '$5' || token === '$6') {
    return 26;
  }
  return 20;
}

/** BINARY: 0 at `none`, h/2 at every other stop. `heightPx` is the shorter edge. */
export function resolveScrubberRadius(stop: BorderRadius, heightPx: number): number {
  return resolveRadiusClass('BINARY', stop, { heightPx });
}

export function rectHitSlop(width: number, height: number, floor: number = MIN_PRESS_TARGET): HitSlopInsets {
  return {
    top: Math.max(0, Math.ceil((floor - height) / 2)),
    bottom: Math.max(0, Math.ceil((floor - height) / 2)),
    left: Math.max(0, Math.ceil((floor - width) / 2)),
    right: Math.max(0, Math.ceil((floor - width) / 2)),
  };
}

export function isRelativeDateString(value: unknown): boolean {
  return typeof value === 'string' && RELATIVE_DATE.test(value.trim());
}

/**
 * The value is DateRangePicker's `{ start, end }` — Dates or null, never
 * EUI relative strings (`'now-15m'`).
 */
export function assertAbsoluteDateRange(value: unknown): DateRange {
  if (value == null) {
    return { start: null, end: null };
  }
  if (typeof value !== 'object') {
    throw new Error('TimeRangeScrubber value must be { start: Date | null; end: Date | null }');
  }
  const record = value as Record<string, unknown>;
  if (isRelativeDateString(record.start) || isRelativeDateString(record.end)) {
    throw new Error(
      'TimeRangeScrubber rejects relative date strings; emit absolute Date | null so DateRangePicker consumers can hold the value unchanged',
    );
  }
  const start = record.start == null ? null : record.start;
  const end = record.end == null ? null : record.end;
  if (start != null && !(start instanceof Date)) {
    throw new Error('TimeRangeScrubber start must be Date | null');
  }
  if (end != null && !(end instanceof Date)) {
    throw new Error('TimeRangeScrubber end must be Date | null');
  }
  return { start, end };
}

export function applyQuickRange(range: QuickRange | string, now: Date): DateRange {
  if (typeof range === 'string' || isRelativeDateString(range)) {
    throw new Error(
      'TimeRangeScrubber quick ranges write absolute dates { start: now−N, end: now }; relative strings are rejected',
    );
  }
  if (!Number.isFinite(range.durationMs) || range.durationMs <= 0) {
    throw new Error('TimeRangeScrubber quick range durationMs must be a positive number');
  }
  return { start: new Date(now.getTime() - range.durationMs), end: new Date(now.getTime()) };
}

export function dateRangeKeys(value: DateRange): string[] {
  return Object.keys(value).sort();
}

export function timeToFraction(time: Date, window: TimeWindow): number {
  const span = window.end.getTime() - window.start.getTime();
  if (span <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (time.getTime() - window.start.getTime()) / span));
}

/**
 * Pixel left for a playhead cap so it stays inside the rail.
 * Centering with `x="-50%"` at fraction=1 hangs by half the cap (the 39.8px
 * spill on a 79.6px / 28px pill).
 */
export function clampCapLeft(fraction: number, railWidth: number, capWidth: number): number | null {
  if (railWidth <= 0 || capWidth <= 0) {
    return null;
  }
  const center = fraction * railWidth;
  return Math.min(Math.max(center - capWidth / 2, 0), Math.max(0, railWidth - capWidth));
}

export function fractionToTime(fraction: number, window: TimeWindow): Date {
  const span = window.end.getTime() - window.start.getTime();
  const clamped = Math.min(1, Math.max(0, fraction));
  return new Date(window.start.getTime() + clamped * span);
}

export function snapTime(time: Date, snapTo: SnapTo, options: { frames?: Date[]; gridStepMs?: number } = {}): Date {
  if (snapTo === 'none') {
    return time;
  }
  if (snapTo === 'grid') {
    const step = options.gridStepMs && options.gridStepMs > 0 ? options.gridStepMs : 1000;
    return new Date(Math.round(time.getTime() / step) * step);
  }
  const frames = options.frames ?? [];
  if (frames.length === 0) {
    return time;
  }
  let best = frames[0];
  let bestDist = Math.abs(best.getTime() - time.getTime());
  for (let i = 1; i < frames.length; i++) {
    const dist = Math.abs(frames[i].getTime() - time.getTime());
    if (dist < bestDist) {
      best = frames[i];
      bestDist = dist;
    }
  }
  return best;
}

export function stepTime(time: Date, direction: 1 | -1, gridStepMs: number, shift: boolean): Date {
  const step = gridStepMs * (shift ? 10 : 1);
  return new Date(time.getTime() + direction * step);
}

export function nearestFrame(time: Date, frames: Date[], direction: 1 | -1): Date | null {
  const t = time.getTime();
  let best: Date | null = null;
  for (const frame of frames) {
    const delta = frame.getTime() - t;
    if (direction > 0 && delta > 0 && (!best || frame.getTime() < best.getTime())) {
      best = frame;
    }
    if (direction < 0 && delta < 0 && (!best || frame.getTime() > best.getTime())) {
      best = frame;
    }
  }
  return best;
}

export function latestFrameAtOrBefore(frames: Date[], time: Date): Date | null {
  let best: Date | null = null;
  const t = time.getTime();
  for (const frame of frames) {
    const at = frame.getTime();
    if (at <= t && (!best || at > best.getTime())) {
      best = frame;
    }
  }
  return best;
}

export function activityUnder(spans: ActivitySpan[], time: Date): ActivitySpan | null {
  const t = time.getTime();
  return spans.find((span) => span.start.getTime() <= t && t <= span.end.getTime()) ?? null;
}

export function keysInTrailingWindow(keys: Date[], time: Date, trailingWindowMs: number): Date[] {
  const hi = time.getTime();
  const lo = hi - Math.max(0, trailingWindowMs);
  return keys.filter((key) => {
    const at = key.getTime();
    return at >= lo && at <= hi;
  });
}

export function defaultWindow(now: Date, value?: DateRange | null): TimeWindow {
  if (value?.start && value.end) {
    return { start: value.start, end: value.end };
  }
  return { start: new Date(now.getTime() - 30 * 60 * 1000), end: now };
}

export function nudgeWindow(window: TimeWindow, direction: 1 | -1): TimeWindow {
  const span = window.end.getTime() - window.start.getTime();
  const delta = Math.floor(span / 2) * direction;
  return {
    start: new Date(window.start.getTime() + delta),
    end: new Date(window.end.getTime() + delta),
  };
}

export function clampRangeToWindow(range: DateRange, window: TimeWindow): DateRange {
  const start = range.start
    ? new Date(Math.max(window.start.getTime(), Math.min(window.end.getTime(), range.start.getTime())))
    : null;
  const end = range.end
    ? new Date(Math.max(window.start.getTime(), Math.min(window.end.getTime(), range.end.getTime())))
    : null;
  if (start && end && start.getTime() > end.getTime()) {
    return { start: end, end: start };
  }
  return { start, end };
}

/**
 * Drag and mount stay `none`; jumps tween `quick` unless
 * prefers-reduced-motion / animation=none, which drops the jump to timing(0).
 */
export function resolveScrubberTransition(
  session: ScrubberSession,
  jumpToken: string | undefined,
  reducedMotion: boolean,
): 'none' | 'quick' {
  if (session !== 'jump') {
    return 'none';
  }
  if (reducedMotion || !jumpToken || jumpToken === 'none') {
    return 'none';
  }
  return 'quick';
}

/** Native instant jump — `transition="none"` is an unregistered token that springs. */
export const REDUCED_MOTION_JUMP = { type: 'timing', duration: 0 } as const;

export function formatDurationMs(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 1000) {
    return `${Math.round(abs)} ms`;
  }
  if (abs < 60_000) {
    return `${Math.round(abs / 1000)} s`;
  }
  if (abs < 3_600_000) {
    return `${Math.round(abs / 60_000)} m`;
  }
  if (abs < 86_400_000) {
    return `${Math.round(abs / 3_600_000)} h`;
  }
  return `${Math.round(abs / 86_400_000)} d`;
}

export function matchingQuickRange(value: DateRange | null, ranges: readonly QuickRange[]): QuickRange | null {
  if (!value?.start || !value.end) {
    return null;
  }
  const duration = value.end.getTime() - value.start.getTime();
  return ranges.find((range) => Math.abs(range.durationMs - duration) < 1000) ?? null;
}

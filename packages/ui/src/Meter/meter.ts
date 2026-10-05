/**
 * Meter math — zone, radius, value label.
 *
 * Progress is activity toward completion; Meter is position within bounds.
 * Full is an incident, not an achievement. Threshold polarity is declared
 * (`low` / `high` / `optimum`, the HTML <meter> model) and never guessed.
 * The rail is DEFAULT, not BINARY: there is no thumb to square with.
 */
import { formatNumber, formatPercent, resolveRadiusClass, sizeRecipeForToken, type BorderRadius } from '@repo/theme';

export type MeterZone = 'ok' | 'warn' | 'critical';
export type MeterFormat = 'number' | 'percent';
export type MeterLayout = 'adjacent' | 'inline' | 'bare';

/** Doctrine class for the thumbless rail and its segments. */
export const METER_RADIUS_CLASS = 'DEFAULT' as const;

/**
 * Zone paint — theme intent tokens, never raw brand or `$accentBackground`.
 * ok is the LAW pairing (no verdict under threshold). warn/critical
 * are the same step-9 solid / step-11 ink channel Progress uses.
 *
 * ok carries no `value`. Under no verdict the readout is ordinary
 * secondary text, so its ink is `knobProps.textAccentColor` — a static
 * `$color11` here was a second answer to what the resolver already decides,
 * and it pinned the readout dim at `textAccent: high`.
 */
export const METER_ZONE_PAINT = {
  ok: { fill: '$color11' },
  warn: { fill: '$orange9', value: '$orange11' },
  critical: { fill: '$red9', value: '$red11' },
} as const;

export const METER_TRACK = '$color4';
export const METER_TICK = '$color8';
export const UNKNOWN_VALUE = '\u2014';

const SIZE_TOKEN = { small: '$3', medium: '$4', large: '$5' } as const;

export function resolveMeterRailRadius(stop: BorderRadius): number {
  return resolveRadiusClass(METER_RADIUS_CLASS, stop);
}

/** Track height = round(0.25 × $size) — the Progress formula, unchanged. */
export function meterTrackHeightPx(size: 'small' | 'medium' | 'large'): number {
  return Math.round(sizeRecipeForToken(SIZE_TOKEN[size]).height * 0.25);
}

export function meterFillRatio(value: number | null | undefined, min: number, max: number): number | null {
  if (value == null || !Number.isFinite(value) || max === min) {
    return null;
  }
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * HTML <meter> regions. No `low`/`high`/`optimum` → always ok (undeclared
 * never wears a verdict). `optimum` names the good end so battery inverts
 * without new chrome.
 */
export function resolveMeterZone(opts: {
  value: number;
  min: number;
  max: number;
  low?: number;
  high?: number;
  optimum?: number;
}): MeterZone {
  const { value, min, max, low, high, optimum } = opts;
  if (low === undefined && high === undefined && optimum === undefined) {
    return 'ok';
  }
  const lo = low ?? min;
  const hi = high ?? max;
  const opt = optimum ?? (min + max) / 2;
  if (opt < lo) {
    if (value <= lo) {
      return 'ok';
    }
    if (value <= hi) {
      return 'warn';
    }
    return 'critical';
  }
  if (opt > hi) {
    if (value >= hi) {
      return 'ok';
    }
    if (value >= lo) {
      return 'warn';
    }
    return 'critical';
  }
  if (value >= lo && value <= hi) {
    return 'ok';
  }
  return 'warn';
}

export function formatMeterValue(opts: {
  value?: number | null;
  min: number;
  max: number;
  unit?: string;
  format?: MeterFormat;
  valueLabel?: string;
}): string {
  if (opts.valueLabel !== undefined) {
    return opts.valueLabel;
  }
  if (opts.value == null || !Number.isFinite(opts.value)) {
    return UNKNOWN_VALUE;
  }
  if (opts.format === 'percent') {
    const ratio = meterFillRatio(opts.value, opts.min, opts.max);
    return formatPercent(Math.round((ratio ?? 0) * 100));
  }
  const amount = formatNumber(opts.value);
  const cap = formatNumber(opts.max);
  return opts.unit ? `${amount} of ${cap} ${opts.unit}` : `${amount} of ${cap}`;
}

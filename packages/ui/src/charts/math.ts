/**
 * Headless chart math — thin, pure wrappers over d3-scale / d3-shape.
 *
 * Everything here is renderer-agnostic (no React, no SVG): scales map data
 * to pixel space, generators emit SVG path strings, and helpers compute
 * domains/ticks. The SVG primitives and composed charts consume these; unit
 * tests exercise them directly.
 */

import { formatNumber } from '@repo/theme';
import { scaleBand, scaleLinear, scalePoint, scaleTime } from 'd3-scale';
import type { ScaleBand, ScaleLinear, ScalePoint, ScaleTime } from 'd3-scale';
import {
  arc as d3arc,
  area as d3area,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  curveStepAfter,
  line as d3line,
  pie as d3pie,
} from 'd3-shape';
import type { CurveFactory } from 'd3-shape';

import type { ChartCurve, PixelPoint } from './types';

// ── Scales ────────────────────────────────────────────────────

export interface BandScaleInput {
  /** Category labels in draw order. */
  domain: string[];
  /** Pixel range, usually `[plot.x, plot.x + plot.width]`. */
  range: [number, number];
  /** Gap between bands as a fraction of the step (default 0.3). */
  paddingInner?: number;
  /** Outer gutter as a fraction of the step (default half the inner). */
  paddingOuter?: number;
}

/** Categorical x scale for bar charts: label → band start px. */
export function createBandScale(input: BandScaleInput): ScaleBand<string> {
  const paddingInner = input.paddingInner ?? 0.3;
  return scaleBand()
    .domain(input.domain)
    .range(input.range)
    .paddingInner(paddingInner)
    .paddingOuter(input.paddingOuter ?? paddingInner / 2);
}

export interface PointScaleInput {
  domain: string[];
  range: [number, number];
  /** Outer gutter as a fraction of the step (default 0 — full-bleed line). */
  padding?: number;
}

/** Categorical x scale for line/area charts: label → point px. */
export function createPointScale(input: PointScaleInput): ScalePoint<string> {
  return scalePoint()
    .domain(input.domain)
    .range(input.range)
    .padding(input.padding ?? 0);
}

export interface LinearScaleInput {
  domain: [number, number];
  range: [number, number];
  /** Round the domain to nice tick values (default true). */
  nice?: boolean;
  /** Clamp output to the range (default false). */
  clamp?: boolean;
}

/** Continuous value scale: value → px. */
export function createLinearScale(input: LinearScaleInput): ScaleLinear<number, number> {
  const scale = scaleLinear().domain(input.domain).range(input.range);
  if (input.nice !== false) {
    scale.nice();
  }
  if (input.clamp) {
    scale.clamp(true);
  }
  return scale;
}

export interface TimeScaleInput {
  domain: [Date, Date];
  range: [number, number];
  nice?: boolean;
}

/** Time x scale: Date → px. */
export function createTimeScale(input: TimeScaleInput): ScaleTime<number, number> {
  const scale = scaleTime().domain(input.domain).range(input.range);
  if (input.nice !== false) {
    scale.nice();
  }
  return scale;
}

export interface ValueDomainOptions {
  /**
   * Anchor the domain at zero (default true — bars/areas that do not start
   * at zero fabricate differences the data does not carry).
   */
  zeroBased?: boolean;
  /** Head-room fraction above the max (default 0). */
  paddingRatio?: number;
}

/** Compute a [min, max] value domain from raw values. */
export function valueDomain(values: number[], options?: ValueDomainOptions): [number, number] {
  const zeroBased = options?.zeroBased ?? true;
  const paddingRatio = options?.paddingRatio ?? 0;
  if (values.length === 0) {
    return [0, 1];
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (zeroBased) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    // Degenerate domain (single value / all equal): open one unit so marks
    // stay visible instead of collapsing onto the baseline.
    if (max <= 0) {
      min = max - 1;
    } else {
      max = max + (max === min ? Math.abs(max) * paddingRatio || 1 : 0);
    }
    if (min === max) {
      max = min + 1;
    }
  }
  const pad = (max - min) * paddingRatio;
  return [min, max + pad];
}

/** Nice tick values for a continuous scale. */
export function getLinearTicks(scale: ScaleLinear<number, number>, count = 4): number[] {
  return scale.ticks(count);
}

/** Nice tick dates for a time scale. */
export function getTimeTicks(scale: ScaleTime<number, number>, count = 4): Date[] {
  return scale.ticks(count);
}

/**
 * Chart AXIS tick register — the one DECLARED exemption to the house number
 * channel. Tick labels answer to axis density,
 * not to the human-register rules the catalog applies elsewhere: this
 * package owns the right to thin, shorten or re-scale them (k/M suffixes,
 * dropped fraction digits) as ticks crowd, without dragging every number in
 * the catalog along. Keeping the exemption in one named function is what
 * makes it a decision instead of an accident — anything outside this
 * function belongs on the shared channel.
 */
export function formatAxisTick(value: number): string {
  return value.toLocaleString();
}

/**
 * Chart data VALUE labels — NOT exempt. A value printed next to a mark is
 * the same number class as the same figure in a table cell or a KPI tile,
 * so it rides the shared register (`formatNumber`).
 */
export function formatChartValue(value: number): string {
  return formatNumber(value);
}

// ── Shape generators ──────────────────────────────────────────

const curveFactories: Record<ChartCurve, CurveFactory> = {
  linear: curveLinear,
  monotone: curveMonotoneX,
  natural: curveNatural,
  step: curveStepAfter,
};

export interface BarPathInput {
  x: number;
  /** Top edge of the bar box (the value end for a positive bar). */
  y: number;
  width: number;
  height: number;
  /** Corner radius on the value end; the baseline corners stay square. */
  radius: number;
  /** The value end is the top edge (value above the baseline) or the bottom. */
  valueEnd: 'top' | 'bottom';
}

/**
 * SVG path for a bar that rounds only its value-end corners (R-SCALE-DATA):
 * the baseline corners stay square so the mark sits on its axis. The radius
 * is clamped to half the width and to the height, so a short bar never
 * rounds past its own box.
 */
export function barPath(input: BarPathInput): string {
  const { x, y, width: w, height: h, valueEnd } = input;
  const r = Math.max(0, Math.min(input.radius, w / 2, h));
  const right = x + w;
  const bottom = y + h;
  if (r === 0) {
    return `M${x},${y}H${right}V${bottom}H${x}Z`;
  }
  if (valueEnd === 'top') {
    return (
      `M${x},${bottom}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}` +
      `H${right - r}A${r},${r} 0 0 1 ${right},${y + r}V${bottom}Z`
    );
  }
  return (
    `M${x},${y}H${right}V${bottom - r}A${r},${r} 0 0 1 ${right - r},${bottom}` +
    `H${x + r}A${r},${r} 0 0 1 ${x},${bottom - r}Z`
  );
}

export interface LinePathOptions {
  curve?: ChartCurve;
}

/** SVG path for a polyline through pixel-space points. */
export function linePath(points: PixelPoint[], options?: LinePathOptions): string {
  const generator = d3line<PixelPoint>()
    .x((p) => p.x)
    .y((p) => p.y)
    .curve(curveFactories[options?.curve ?? 'linear']);
  return generator(points) ?? '';
}

export interface AreaPathOptions {
  curve?: ChartCurve;
  /** Pixel y of the area baseline (usually the plot bottom). */
  baseline: number;
}

/** SVG path for the filled area under pixel-space points. */
export function areaPath(points: PixelPoint[], options: AreaPathOptions): string {
  const generator = d3area<PixelPoint>()
    .x((p) => p.x)
    .y0(options.baseline)
    .y1((p) => p.y)
    .curve(curveFactories[options?.curve ?? 'linear']);
  return generator(points) ?? '';
}

export interface PieSliceOptions {
  /** Radians between slices (default 0). */
  padAngle?: number;
  /** Start angle in radians (default 0 = 12 o'clock). */
  startAngle?: number;
  /** End angle in radians (default 2π). */
  endAngle?: number;
}

export interface PieSlice<T> {
  datum: T;
  /** Input order index — slice order is data order, never re-sorted. */
  index: number;
  value: number;
  startAngle: number;
  endAngle: number;
  padAngle: number;
}

/** Angular layout for pie/donut slices. Preserves input order (Axiom 11). */
export function pieSlices<T extends { value: number }>(data: T[], options?: PieSliceOptions): PieSlice<T>[] {
  const generator = d3pie<T>()
    .value((d) => d.value)
    .sort(null)
    .padAngle(options?.padAngle ?? 0)
    .startAngle(options?.startAngle ?? 0)
    .endAngle(options?.endAngle ?? Math.PI * 2);
  return generator(data).map((slice) => ({
    datum: slice.data,
    index: slice.index,
    value: slice.value,
    startAngle: slice.startAngle,
    endAngle: slice.endAngle,
    padAngle: slice.padAngle,
  }));
}

/**
 * Sufficient interior witness for a two-unit boundary erosion. The bisector
 * at the annulus midpoint must stay more than one unit from every boundary.
 * Distance to a radial segment uses clamped projection, including its inner
 * endpoint for wedges larger than pi. A small margin covers SVG's three-digit
 * path rounding. One thin positive slice keeps the whole chart unmasked.
 */
export function canMaskPieSlices(
  slices: ReadonlyArray<{ value: number; startAngle: number; endAngle: number }>,
  innerRadius: number,
  outerRadius: number,
): boolean {
  const positive = slices.filter((slice) => slice.value > 0);
  if (
    positive.length < 2 ||
    !Number.isFinite(innerRadius) ||
    !Number.isFinite(outerRadius) ||
    innerRadius < 0 ||
    outerRadius <= innerRadius
  ) {
    return false;
  }
  const radius = (innerRadius + outerRadius) / 2;
  const clearance = 1.002;
  if (outerRadius - radius <= clearance || radius - innerRadius <= clearance) {
    return false;
  }
  return positive.every((slice) => {
    const span = slice.endAngle - slice.startAngle;
    if (!Number.isFinite(span) || span <= 0 || span >= Math.PI * 2) {
      return false;
    }
    const cosine = Math.cos(span / 2);
    const projection = Math.min(outerRadius, Math.max(innerRadius, radius * cosine));
    const radialDistance = Math.sqrt(Math.max(0, radius ** 2 + projection ** 2 - 2 * radius * projection * cosine));
    return radialDistance > clearance;
  });
}

export interface ArcPathInput {
  startAngle: number;
  endAngle: number;
  outerRadius: number;
  /** 0 for a pie; > 0 for a donut (true hole — background shows through). */
  innerRadius?: number;
  padAngle?: number;
  cornerRadius?: number;
}

/** SVG path for one pie/donut slice, centered on (0,0). */
export function arcPath(input: ArcPathInput): string {
  const generator = d3arc()
    .innerRadius(input.innerRadius ?? 0)
    .outerRadius(input.outerRadius)
    .cornerRadius(input.cornerRadius ?? 0);
  return (
    generator({
      startAngle: input.startAngle,
      endAngle: input.endAngle,
      padAngle: input.padAngle ?? 0,
      innerRadius: input.innerRadius ?? 0,
      outerRadius: input.outerRadius,
    }) ?? ''
  );
}

/** Centroid of a slice (label/tooltip anchor), centered on (0,0). */
export function arcCentroid(input: ArcPathInput): PixelPoint {
  const generator = d3arc()
    .innerRadius(input.innerRadius ?? 0)
    .outerRadius(input.outerRadius);
  const [x, y] = generator.centroid({
    startAngle: input.startAngle,
    endAngle: input.endAngle,
    padAngle: input.padAngle ?? 0,
    innerRadius: input.innerRadius ?? 0,
    outerRadius: input.outerRadius,
  });
  return { x, y };
}

// ── Label fitting (no overflow/clipping) ──────────────

/** Approximate glyph advance as a fraction of font size (avg UI sans). */
const APPROX_CHAR_WIDTH_RATIO = 0.6;

/** Approximate rendered width of a label — cross-platform, no DOM measure. */
export function approximateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * APPROX_CHAR_WIDTH_RATIO;
}

/** Truncate a label with an ellipsis so it fits `maxWidth` px. */
export function truncateLabel(text: string, fontSize: number, maxWidth: number): string {
  if (approximateTextWidth(text, fontSize) <= maxWidth) {
    return text;
  }
  const budget = Math.max(1, Math.floor(maxWidth / (fontSize * APPROX_CHAR_WIDTH_RATIO)) - 1);
  return `${text.slice(0, budget)}\u2026`;
}

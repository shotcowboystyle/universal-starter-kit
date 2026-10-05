import { MIN_PRESS_TARGET } from '@repo/theme';
import type { ScaleBand, ScaleLinear } from 'd3-scale';
import { useId } from 'react';

import { areaPath, arcPath, barPath, linePath, pieSlices, canMaskPieSlices } from './math';
import {
  Circle,
  Defs,
  Mask,
  G,
  Path,
  Rect,
  datumTargetProps,
  chartBarProps,
  chartMarkProps,
  chartWebProps,
  luminanceMaskProps,
} from './svg';
import type { ChartCurve, ChartDatum, ChartDatumEvents, ChartSize, PixelPoint, PlotArea } from './types';
import { useChartTheme } from './useChartTheme';

/**
 * Series mark primitives. Marks are pure pixel-space SVG; every series takes
 * pre-resolved fills (the composed charts resolve them from the canonical
 * palette / explicit data colors) and exposes tooltip-ready hit
 * targets: invisible shapes floored at 44px (Axiom 12 / SP-FIXED) wired to
 * `onDatumPress` / hover callbacks with per-datum accessible names.
 */

interface DatumTargetCallbacks extends ChartDatumEvents {
  /** Accessible name per datum (describeDatum output). */
  datumLabel?: (datum: ChartDatum, index: number) => string;
}

function targetPropsFor(callbacks: DatumTargetCallbacks, datum: ChartDatum, index: number) {
  const { onDatumPress, onDatumHoverIn, onDatumHoverOut, datumLabel } = callbacks;
  return datumTargetProps({
    label: datumLabel?.(datum, index),
    onPress: onDatumPress
      ? () => {
          onDatumPress(datum, index);
        }
      : undefined,
    onHoverIn: onDatumHoverIn
      ? () => {
          onDatumHoverIn(datum, index);
        }
      : undefined,
    onHoverOut: onDatumHoverOut
      ? () => {
          onDatumHoverOut(datum, index);
        }
      : undefined,
  });
}

function hasTargets(callbacks: DatumTargetCallbacks): boolean {
  return Boolean(
    callbacks.onDatumPress || callbacks.onDatumHoverIn || callbacks.onDatumHoverOut || callbacks.datumLabel,
  );
}

// ── Bar ───────────────────────────────────────────────────────

export interface BarSeriesProps extends DatumTargetCallbacks {
  data: ChartDatum[];
  xScale: ScaleBand<string>;
  yScale: ScaleLinear<number, number>;
  plot: PlotArea;
  /** Resolved fill per datum index (palette or explicit data color). */
  fills: string[];
}

/**
 * Vertical bars from the zero baseline (negative values hang below it).
 * Only the value end rounds, with the borderRadius knob clamped to bar
 * anatomy; the baseline corners stay square (R-SCALE-DATA).
 * Hit target = the full column, floored at 44px width.
 */
export function BarSeries({ data, xScale, yScale, plot, fills, ...callbacks }: BarSeriesProps) {
  const { barCornerRadius } = useChartTheme();
  const bandwidth = xScale.bandwidth();
  const baseline = yScale(Math.max(0, yScale.domain()[0]));
  const interactive = hasTargets(callbacks);

  return (
    <G>
      {data.map((datum, index) => {
        const x = xScale(datum.label);
        if (x === undefined) {
          return null;
        }
        const valueY = yScale(datum.value);
        const y = Math.min(valueY, baseline);
        const height = Math.abs(valueY - baseline);
        const radius = barCornerRadius(bandwidth, height);
        const targetWidth = Math.max(bandwidth, MIN_PRESS_TARGET);
        return (
          <G key={`${datum.label}-${index}`}>
            <Path
              {...chartMarkProps(datum.label)}
              {...chartBarProps({ x, y, width: bandwidth, height, radius })}
              d={barPath({
                x,
                y,
                width: bandwidth,
                height,
                radius,
                valueEnd: valueY <= baseline ? 'top' : 'bottom',
              })}
              fill={fills[index]}
            />
            {interactive ? (
              <Rect
                x={x + bandwidth / 2 - targetWidth / 2}
                y={plot.y}
                width={targetWidth}
                height={plot.height}
                fill="transparent"
                {...targetPropsFor(callbacks, datum, index)}
              />
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

// ── Line ──────────────────────────────────────────────────────

export interface LineSeriesProps extends DatumTargetCallbacks {
  data: ChartDatum[];
  /** Pixel positions aligned with `data`. */
  points: PixelPoint[];
  color: string;
  strokeWidth?: number;
  curve?: ChartCurve;
  /** Draw a dot on each datum (default true). */
  showPoints?: boolean;
  pointRadius?: number;
  /**
   * Surface bounds — hit-target circles are clamped inside so the 44px floor
   * stays fully tappable at the edges (SVG clips overflowing targets).
   */
  bounds?: ChartSize;
}

function clampTargetCenter(value: number, radius: number, extent?: number): number {
  if (extent === undefined || extent < radius * 2) {
    return value;
  }
  return Math.min(Math.max(value, radius), extent - radius);
}

/**
 * Stroked data line with optional per-datum dots. Hit targets are invisible
 * 44px-diameter circles centered on each datum.
 */
export function LineSeries({
  data,
  points,
  color,
  strokeWidth = 2,
  curve = 'linear',
  showPoints = true,
  pointRadius = 3,
  bounds,
  ...callbacks
}: LineSeriesProps) {
  const interactive = hasTargets(callbacks);
  const targetRadius = MIN_PRESS_TARGET / 2;
  return (
    <G>
      <Path
        {...chartMarkProps('series line')}
        d={linePath(points, { curve })}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      {showPoints
        ? points.map((point, index) => (
            <Circle
              key={`point-${index}`}
              {...chartMarkProps(data[index]?.label ?? `point ${index + 1}`)}
              cx={point.x}
              cy={point.y}
              r={pointRadius}
              fill={color}
            />
          ))
        : null}
      {interactive
        ? points.map((point, index) => (
            <Circle
              key={`target-${index}`}
              cx={clampTargetCenter(point.x, targetRadius, bounds?.width)}
              cy={clampTargetCenter(point.y, targetRadius, bounds?.height)}
              r={targetRadius}
              fill="transparent"
              {...targetPropsFor(callbacks, data[index], index)}
            />
          ))
        : null}
    </G>
  );
}

// ── Area ──────────────────────────────────────────────────────

export interface AreaSeriesProps {
  /** Pixel positions of the series top edge. */
  points: PixelPoint[];
  /** Pixel y of the area baseline (usually the plot bottom). */
  baseline: number;
  color: string;
  /** Fill opacity — the line above carries full identity (default 0.18). */
  opacity?: number;
  curve?: ChartCurve;
}

/**
 * Filled area under a series. Non-interactive by design — pair it with a
 * LineSeries on top, which owns points and hit targets.
 */
export function AreaSeries({ points, baseline, color, opacity = 0.18, curve }: AreaSeriesProps) {
  return (
    <Path {...chartMarkProps('series area')} d={areaPath(points, { baseline, curve })} fill={color} opacity={opacity} />
  );
}

// ── Pie / Donut ───────────────────────────────────────────────

export interface PieSeriesProps extends DatumTargetCallbacks {
  data: ChartDatum[];
  /** Center x/y in surface pixels. */
  cx: number;
  cy: number;
  outerRadius: number;
  /** > 0 renders a donut with a true transparent hole. */
  innerRadius?: number;
  /** Explicit radians between slices. Omit for the default boundary mask. */
  padAngle?: number;
  /** Resolved fill per datum index. */
  fills: string[];
}

/**
 * Pie/donut slices in data order (never re-sorted — order is data). The hit
 * target is the slice path itself; slice geometry cannot be floored to 44px
 * without lying about the data, so thin-slice precision is a documented
 * touch limitation (legend rows remain the accessible alternative).
 */
export function PieSeries({
  data,
  cx,
  cy,
  outerRadius,
  innerRadius = 0,
  padAngle,
  fills,
  ...callbacks
}: PieSeriesProps) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '_');
  const slices = pieSlices(data, { padAngle });
  const maskGaps = padAngle === undefined && canMaskPieSlices(slices, innerRadius, outerRadius);
  const interactive = hasTargets(callbacks);
  return (
    <G transform={`translate(${cx}, ${cy})`}>
      {slices.map((slice) => {
        const path = arcPath({
          startAngle: slice.startAngle,
          endAngle: slice.endAngle,
          padAngle: slice.padAngle,
          innerRadius,
          outerRadius,
        });
        const masked = maskGaps && slice.value > 0;
        const maskId = `mpo-pie-${instanceId}-${slice.index}`;
        return (
          <G key={`${slice.datum.label}-${slice.index}`}>
            {masked ? (
              <Defs>
                <Mask
                  id={maskId}
                  x={-outerRadius - 2}
                  y={-outerRadius - 2}
                  width={(outerRadius + 2) * 2}
                  height={(outerRadius + 2) * 2}
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                  {...luminanceMaskProps()}>
                  <Path
                    d={path}
                    fill="#ffffff"
                    stroke="#000000"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={1}
                    fillOpacity={1}
                    strokeOpacity={1}
                  />
                </Mask>
              </Defs>
            ) : null}
            <Path
              {...chartMarkProps(slice.datum.label)}
              {...(masked
                ? chartWebProps({
                    'data-mpo-chart-mask': 'eroded-arc-v1',
                    'data-mpo-chart-slice': [slice.startAngle, slice.endAngle, innerRadius, outerRadius].join(','),
                  })
                : {})}
              d={path}
              mask={masked ? `url(#${maskId})` : undefined}
              fill={fills[slice.index]}
              {...(interactive ? targetPropsFor(callbacks, slice.datum, slice.index) : {})}
            />
          </G>
        );
      })}
    </G>
  );
}

import type { ScaleBand, ScaleLinear, ScalePoint } from 'd3-scale';

import { formatAxisTick, getLinearTicks, truncateLabel } from './math';
import { G, Line, SvgText, chartChromeProps } from './svg';
import type { PlotArea } from './types';
import { useChartTheme } from './useChartTheme';

export const AXIS_TICK_LENGTH = 4;
export const AXIS_LABEL_GAP = 3;
const TICK_LENGTH = AXIS_TICK_LENGTH;
const LABEL_GAP = AXIS_LABEL_GAP;

export interface XAxisProps {
  /** Plot rectangle the axis borders (line renders at its bottom edge). */
  plot: PlotArea;
  /** Categorical scale (band for bars, point for lines/areas). */
  scale: ScaleBand<string> | ScalePoint<string>;
  /** Labels to draw (default: full scale domain). */
  tickValues?: string[];
  tickFormat?: (value: string, index: number) => string;
  showLine?: boolean;
  showTicks?: boolean;
  showLabels?: boolean;
}

/**
 * Categorical x axis: baseline, tick marks, and labels centered under each
 * band/point. Labels truncate with an ellipsis when wider than their step
 * (nothing overflows the surface). All chrome colors/typography come
 * from `useChartTheme`.
 */
export function XAxis({
  plot,
  scale,
  tickValues,
  tickFormat,
  showLine = true,
  showTicks = true,
  showLabels = true,
}: XAxisProps) {
  const { axisColor, labelColor, labelFontFamily, labelFontSize } = useChartTheme();
  const values = tickValues ?? scale.domain();
  const y = plot.y + plot.height;
  const bandwidth = scale.bandwidth();
  const step = scale.step();

  return (
    <G>
      {showLine ? (
        <Line
          {...chartChromeProps('axis')}
          x1={plot.x}
          y1={y}
          x2={plot.x + plot.width}
          y2={y}
          stroke={axisColor}
          strokeWidth={1}
        />
      ) : null}
      {values.map((value, index) => {
        const position = scale(value);
        if (position === undefined) {
          return null;
        }
        const center = position + bandwidth / 2;
        const text = tickFormat ? tickFormat(value, index) : value;
        return (
          <G key={`${value}-${index}`}>
            {showTicks ? (
              <Line
                {...chartChromeProps('axis')}
                x1={center}
                y1={y}
                x2={center}
                y2={y + TICK_LENGTH}
                stroke={axisColor}
                strokeWidth={1}
              />
            ) : null}
            {showLabels ? (
              <SvgText
                x={center}
                y={y + TICK_LENGTH + LABEL_GAP + labelFontSize * 0.8}
                textAnchor="middle"
                fill={labelColor}
                fontSize={labelFontSize}
                {...(labelFontFamily ? { fontFamily: labelFontFamily } : {})}>
                {truncateLabel(text, labelFontSize, Math.max(step, bandwidth))}
              </SvgText>
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

export interface YAxisProps {
  plot: PlotArea;
  scale: ScaleLinear<number, number>;
  /** Tick count hint for d3 nice ticks (default 4). */
  ticks?: number;
  tickFormat?: (value: number, index: number) => string;
  /** Axis line at the plot's left edge (default false — grid carries it). */
  showLine?: boolean;
  showTicks?: boolean;
  showLabels?: boolean;
  /** Horizontal grid lines across the plot (default true). */
  showGrid?: boolean;
}

/**
 * Continuous y axis: nice d3 ticks with right-aligned labels in the left
 * margin, plus optional horizontal grid lines across the plot. Grid uses the
 * divider role; labels use the muted text role (AA floor).
 */
export function YAxis({
  plot,
  scale,
  ticks = 4,
  tickFormat,
  showLine = false,
  showTicks = false,
  showLabels = true,
  showGrid = true,
}: YAxisProps) {
  const { axisColor, gridColor, labelColor, labelFontFamily, labelFontSize } = useChartTheme();
  const tickNumbers = getLinearTicks(scale, ticks);
  // Axis ticks ride the charts package's own density register — the declared
  // exemption to the house number channel (see `formatAxisTick`).
  const format = tickFormat ?? ((value: number) => formatAxisTick(value));

  return (
    <G>
      {showLine ? (
        <Line
          {...chartChromeProps('axis')}
          x1={plot.x}
          y1={plot.y}
          x2={plot.x}
          y2={plot.y + plot.height}
          stroke={axisColor}
          strokeWidth={1}
        />
      ) : null}
      {tickNumbers.map((value, index) => {
        const y = scale(value);
        return (
          <G key={`${value}-${index}`}>
            {showGrid ? (
              <Line
                {...chartChromeProps('grid')}
                x1={plot.x}
                y1={y}
                x2={plot.x + plot.width}
                y2={y}
                stroke={gridColor}
                strokeWidth={1}
              />
            ) : null}
            {showTicks ? (
              <Line
                {...chartChromeProps('axis')}
                x1={plot.x - TICK_LENGTH}
                y1={y}
                x2={plot.x}
                y2={y}
                stroke={axisColor}
                strokeWidth={1}
              />
            ) : null}
            {showLabels ? (
              <SvgText
                x={plot.x - TICK_LENGTH - LABEL_GAP}
                y={y + labelFontSize * 0.35}
                textAnchor="end"
                fill={labelColor}
                fontSize={labelFontSize}
                {...(labelFontFamily ? { fontFamily: labelFontFamily } : {})}>
                {format(value, index)}
              </SvgText>
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

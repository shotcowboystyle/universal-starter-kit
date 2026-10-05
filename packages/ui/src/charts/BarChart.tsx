import type { YStackProps } from 'tamagui';

import { useTranslation } from '../shared/i18n';

import { chartDatumText, describeChart, describeDatum } from './accessibility';
import { XAxis, YAxis } from './Axis';
import { ChartDataFrame } from './ChartDataView';
import { ChartSurface } from './ChartSurface';
import { computeCartesianPlot, resolveSeriesFills, thinCategories } from './composeChart';
import { createBandScale, createLinearScale, formatChartValue, getLinearTicks, valueDomain } from './math';
import { BarSeries } from './series';
import type { ChartDatum, ChartDatumEvents } from './types';
import { useChartTheme } from './useChartTheme';

export interface BarChartProps extends ChartDatumEvents, Omit<YStackProps, 'children' | 'width' | 'height'> {
  data: ChartDatum[];
  /** Drawing height in px (default 200). */
  height?: number;
  /** Explicit width bypasses responsive measurement. */
  width?: number;
  /**
   * Bars are one series by default and paint the theme identity. Set true
   * when each bar IS a category — bars take the identity-led categorical
   * palette instead.
   */
  categorical?: boolean;
  /** Explicit single-series color (data value — passes through untouched). */
  color?: string;
  /** Explicit per-datum colors (data values — pass through untouched). */
  colors?: string[];
  showXAxis?: boolean;
  showYAxis?: boolean;
  showGrid?: boolean;
  /** y tick count hint (default 4). */
  yTicks?: number;
  valueFormatter?: (value: number) => string;
  /** Chart title used in the generated accessible summary. */
  title?: string;
  /** Override the generated accessible summary. */
  label?: string;
  /**
   * Pin the value axis to this `[min, max]` instead of deriving it from the
   * dataset. Explicit domains are not niced (a 0–255 stat scale stays 0–255,
   * not 0–260) so charts that share a measure stay comparable.
   */
  domain?: [number, number];
}

/**
 * Categorical bar chart: d3 band/linear scales, zero-based value axis,
 * knob-driven chrome, palette-driven marks, 44px column hit targets.
 */
export function BarChart({
  data,
  height = 200,
  width,
  categorical = false,
  color,
  colors,
  showXAxis = true,
  showYAxis = true,
  showGrid = true,
  yTicks = 4,
  valueFormatter,
  title,
  label,
  domain: domainProp,
  onDatumPress,
  onDatumHoverIn,
  onDatumHoverOut,
  ...stackProps
}: BarChartProps) {
  const { t } = useTranslation();
  const { palette, labelFontSize } = useChartTheme();
  const fills = resolveSeriesFills(data, palette, { color, colors, categorical });
  const format = valueFormatter ?? formatChartValue;
  const ariaLabel = label ?? describeChart({ typeLabel: t('Bar chart'), title, data, formatValue: valueFormatter });
  const interactive = Boolean(onDatumPress || onDatumHoverIn || onDatumHoverOut);

  return (
    <ChartDataFrame data={data} title={title} valueFormatter={valueFormatter} width={width}>
      <ChartSurface
        label={ariaLabel}
        proof={{
          kind: 'bar',
          separated: true,
          datumText: false,
          datumValues: chartDatumText(data, valueFormatter),
          datumCount: data.length,
        }}
        height={height}
        width={width}
        {...stackProps}>
        {(size) => {
          const domain = domainProp ?? valueDomain(data.map((datum) => datum.value));
          // Explicit domains stay literal (nice: false) so a shared 0–255
          // scale does not drift to 0–260. Auto domains still nice for ticks.
          const nice = domainProp ? false : undefined;
          // Ticks come from the domain alone, so the margin scale needs no
          // meaningful range yet — the plot rectangle depends on label widths.
          const marginScale = createLinearScale({ domain, range: [0, 1], nice });
          const tickValues = getLinearTicks(marginScale, yTicks);
          const plot = computeCartesianPlot(size, {
            showXAxis,
            showYAxis,
            yTickLabels: tickValues.map((value) => format(value)),
            fontSize: labelFontSize,
          });
          if (plot.width <= 0 || plot.height <= 0 || data.length === 0) {
            return null;
          }
          const xScale = createBandScale({
            domain: data.map((datum) => datum.label),
            range: [plot.x, plot.x + plot.width],
          });
          const yScale = createLinearScale({
            domain,
            range: [plot.y + plot.height, plot.y],
            nice,
          });
          return (
            <>
              {showYAxis || showGrid ? (
                <YAxis
                  plot={plot}
                  scale={yScale}
                  ticks={yTicks}
                  tickFormat={(value) => format(value)}
                  showLabels={showYAxis}
                  showGrid={showGrid}
                />
              ) : null}
              <BarSeries
                data={data}
                xScale={xScale}
                yScale={yScale}
                plot={plot}
                fills={fills}
                onDatumPress={onDatumPress}
                onDatumHoverIn={onDatumHoverIn}
                onDatumHoverOut={onDatumHoverOut}
                datumLabel={interactive ? (datum) => describeDatum({ datum, formatValue: valueFormatter }) : undefined}
              />
              {showXAxis ? (
                <XAxis
                  plot={plot}
                  scale={xScale}
                  tickValues={thinCategories(
                    data.map((datum) => datum.label),
                    plot.width,
                    labelFontSize,
                  )}
                />
              ) : null}
            </>
          );
        }}
      </ChartSurface>
    </ChartDataFrame>
  );
}

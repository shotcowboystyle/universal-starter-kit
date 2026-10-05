import type { YStackProps } from 'tamagui';

import { useTranslation } from '../shared/i18n';

import { chartDatumText, describeChart, describeDatum } from './accessibility';
import { XAxis, YAxis } from './Axis';
import { ChartDataFrame } from './ChartDataView';
import { ChartSurface } from './ChartSurface';
import { computeCartesianPlot, thinCategories } from './composeChart';
import { createLinearScale, createPointScale, formatChartValue, getLinearTicks, valueDomain } from './math';
import { AreaSeries, LineSeries } from './series';
import type { ChartCurve, ChartDatum, ChartDatumEvents } from './types';
import { useChartTheme } from './useChartTheme';

export interface LineChartProps extends ChartDatumEvents, Omit<YStackProps, 'children' | 'width' | 'height'> {
  data: ChartDatum[];
  /** Drawing height in px (default 200). */
  height?: number;
  /** Explicit width bypasses responsive measurement. */
  width?: number;
  /** Explicit series color (data value — passes through untouched). */
  color?: string;
  /** Fill the area under the line (AreaChart preset). */
  showArea?: boolean;
  /** Area fill opacity (default 0.18). */
  areaOpacity?: number;
  curve?: ChartCurve;
  /** Dot on each datum (default true). */
  showPoints?: boolean;
  strokeWidth?: number;
  showXAxis?: boolean;
  showYAxis?: boolean;
  showGrid?: boolean;
  yTicks?: number;
  valueFormatter?: (value: number) => string;
  /** Chart title used in the generated accessible summary. */
  title?: string;
  /** Override the generated accessible summary. */
  label?: string;
  /** Accessible type label override (AreaChart passes its own). */
  typeLabel?: string;
}

/**
 * Single-series line chart over category points: d3 point/linear scales,
 * knob-driven chrome, palette identity stroke, 44px point hit targets.
 */
export function LineChart({
  data,
  height = 200,
  width,
  color,
  showArea = false,
  areaOpacity,
  curve = 'linear',
  showPoints = true,
  strokeWidth = 2,
  showXAxis = true,
  showYAxis = true,
  showGrid = true,
  yTicks = 4,
  valueFormatter,
  title,
  label,
  typeLabel,
  onDatumPress,
  onDatumHoverIn,
  onDatumHoverOut,
  ...stackProps
}: LineChartProps) {
  const { t } = useTranslation();
  const { palette, labelFontSize } = useChartTheme();
  // One line = one series: explicit `color` is a data value and passes
  // through; the default is the theme identity.
  const stroke = color ?? palette.single;
  const format = valueFormatter ?? formatChartValue;
  const ariaLabel =
    label ??
    describeChart({
      typeLabel: typeLabel ?? (showArea ? t('Area chart') : t('Line chart')),
      title,
      data,
      formatValue: valueFormatter,
    });
  const interactive = Boolean(onDatumPress || onDatumHoverIn || onDatumHoverOut);

  return (
    <ChartDataFrame data={data} title={title} valueFormatter={valueFormatter} width={width}>
      <ChartSurface
        label={ariaLabel}
        proof={{
          kind: showArea ? 'area' : 'line',
          separated: false,
          datumText: false,
          datumValues: chartDatumText(data, valueFormatter),
          datumCount: data.length,
        }}
        height={height}
        width={width}
        {...stackProps}>
        {(size) => {
          const domain = valueDomain(data.map((datum) => datum.value));
          const marginScale = createLinearScale({ domain, range: [0, 1] });
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
          const xScale = createPointScale({
            domain: data.map((datum) => datum.label),
            range: [plot.x, plot.x + plot.width],
            padding: 0.5,
          });
          const yScale = createLinearScale({
            domain,
            range: [plot.y + plot.height, plot.y],
          });
          const points = data.map((datum) => ({
            x: xScale(datum.label) ?? plot.x,
            y: yScale(datum.value),
          }));
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
              {showArea ? (
                <AreaSeries
                  points={points}
                  baseline={plot.y + plot.height}
                  color={stroke}
                  opacity={areaOpacity}
                  curve={curve}
                />
              ) : null}
              <LineSeries
                data={data}
                points={points}
                color={stroke}
                strokeWidth={strokeWidth}
                curve={curve}
                showPoints={showPoints}
                bounds={size}
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

export type AreaChartProps = Omit<LineChartProps, 'showArea'>;

/** Area chart — the LineChart family with the area fill on by default. */
export function AreaChart(props: AreaChartProps) {
  return <LineChart showArea {...props} />;
}

import { useResolvedKnobs } from '@repo/theme';
import { Text, XStack, YStack, type YStackProps } from 'tamagui';

import { useTranslation } from '../shared/i18n';

import { chartDatumText, describeChart, describeDatum } from './accessibility';
import { ChartDataFrame } from './ChartDataView';
import { ChartSurface } from './ChartSurface';
import { resolveSeriesFills } from './composeChart';
import { formatChartValue, pieSlices, canMaskPieSlices } from './math';
import { PieSeries } from './series';
import { chartDatumTextProps, chartWebProps } from './svg';
import type { ChartDatum, ChartDatumEvents } from './types';
import { useChartTheme } from './useChartTheme';

export interface PieChartProps extends ChartDatumEvents, Omit<YStackProps, 'children' | 'width' | 'height'> {
  data: ChartDatum[];
  /** Pie diameter in px (default 200). */
  height?: number;
  /**
   * Donut mode: `true` uses the default hole ratio (0.55); a number sets the
   * inner-radius ratio (0–1). The hole is genuinely transparent (d3 arc
   * innerRadius) — the card surface shows through on every platform.
   */
  donut?: boolean | number;
  /** Explicit radians between slices. Omit for the default boundary mask. */
  padAngle?: number;
  /** Explicit slice colors (data values — pass through untouched). */
  colors?: string[];
  /** Legend rows beside the pie (default true). */
  showLegend?: boolean;
  valueFormatter?: (value: number) => string;
  /** Chart title used in the generated accessible summary. */
  title?: string;
  /** Override the generated accessible summary. */
  label?: string;
}

const DEFAULT_DONUT_RATIO = 0.55;

/**
 * Pie/donut chart. Slices are categorical data, so defaults come from the
 * identity-led categorical palette; per-datum and prop colors pass
 * through untouched. Legend rows carry the accessible per-slice values and
 * remain the reliable interaction surface for thin slices.
 *
 * Containment: the root shrinks with its frame instead of holding
 * its intrinsic width, so in narrow cards the legend wraps below the pie —
 * it never paints past the frame. Inside a legend row the label truncates
 * first (ellipsis); the value is data and never truncates (Axiom 11).
 */
export function PieChart({
  data,
  height = 200,
  donut = false,
  padAngle,
  colors,
  showLegend = true,
  valueFormatter,
  title,
  label,
  onDatumPress,
  onDatumHoverIn,
  onDatumHoverOut,
  ...stackProps
}: PieChartProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const { palette } = useChartTheme();
  const fills = resolveSeriesFills(data, palette, { colors, categorical: true });
  const format = valueFormatter ?? formatChartValue;
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  const ariaLabel =
    label ??
    describeChart({
      typeLabel: donut ? t('Donut chart') : t('Pie chart'),
      title,
      data,
      formatValue: valueFormatter,
      includeShare: true,
    });
  const interactive = Boolean(onDatumPress || onDatumHoverIn || onDatumHoverOut);
  const innerRatio = donut === false ? 0 : donut === true ? DEFAULT_DONUT_RATIO : Math.min(Math.max(donut, 0), 0.9);

  const chart = (
    // `flexShrink` + `minWidth 0` let a row parent (e.g. Card.Footer)
    // constrain the chart below its intrinsic width — the wrap then stacks
    // the legend under the pie instead of painting past the frame.
    <XStack
      flexWrap="wrap"
      alignItems="center"
      flexShrink={1}
      minWidth={0}
      {...knobProps.gap}
      {...chartWebProps({ 'data-mpo-chart-owner': 'true' })}
      {...stackProps}>
      <YStack width={height} height={height}>
        <ChartSurface
          label={ariaLabel}
          proof={{
            kind: innerRatio > 0 ? 'donut' : 'pie',
            separated:
              padAngle === undefined
                ? canMaskPieSlices(pieSlices(data), (height / 2) * innerRatio, height / 2)
                : padAngle > 0,
            datumText: showLegend,
            datumValues: chartDatumText(data, valueFormatter),
            datumCount: data.length,
          }}
          height={height}
          width={height}>
          {(size) => {
            const outerRadius = Math.min(size.width, size.height) / 2;
            return (
              <PieSeries
                data={data}
                cx={size.width / 2}
                cy={size.height / 2}
                outerRadius={outerRadius}
                innerRadius={outerRadius * innerRatio}
                padAngle={padAngle}
                fills={fills}
                onDatumPress={onDatumPress}
                onDatumHoverIn={onDatumHoverIn}
                onDatumHoverOut={onDatumHoverOut}
                datumLabel={
                  interactive ? (datum) => describeDatum({ datum, total, formatValue: valueFormatter }) : undefined
                }
              />
            );
          }}
        </ChartSurface>
      </YStack>

      {showLegend ? (
        <YStack flex={1} minWidth={140} justifyContent="center" gap="$2" {...{ 'data-pie-legend': 'true' }}>
          {data.map((datum, index) => (
            <XStack
              key={`${datum.label}-${index}`}
              {...chartDatumTextProps(index)}
              gap="$2"
              alignItems="center"
              minWidth={0}>
              {/* Legend keys are chart CHROME, not marks: the swatch follows
                  the radius knob and goes square in the `none` world (Axiom 3
                  NULL). The pinned $2 arc was knob-dead. */}
              <YStack
                width={12}
                height={12}
                borderRadius={knobProps.borderRadius.borderRadius}
                flexShrink={0}
                backgroundColor={fills[index] as never}
              />
              {/* The label yields (truncates) before the value — values are
                  data and never truncate (Axiom 11). */}
              <Text
                {...chartWebProps({ 'data-mpo-chart-datum-label': 'true' })}
                {...knobProps.body}
                fontSize="$2"
                color={knobProps.textAccentColor}
                flex={1}
                numberOfLines={1}>
                {datum.label}
              </Text>
              <Text
                {...chartWebProps({ 'data-mpo-chart-datum-value': 'true' })}
                {...knobProps.body}
                fontSize="$2"
                flexShrink={0}>
                {format(datum.value)}
              </Text>
            </XStack>
          ))}
        </YStack>
      ) : null}
    </XStack>
  );
  return showLegend ? (
    chart
  ) : (
    <ChartDataFrame data={data} title={title} valueFormatter={valueFormatter}>
      {chart}
    </ChartDataFrame>
  );
}

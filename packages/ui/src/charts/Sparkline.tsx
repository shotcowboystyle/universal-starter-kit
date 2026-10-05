import type { YStackProps } from 'tamagui';

import { useTranslation } from '../shared/i18n';

import { chartDatumText, describeChart } from './accessibility';
import { ChartSurface } from './ChartSurface';
import { createLinearScale, createPointScale, valueDomain } from './math';
import { AreaSeries, LineSeries } from './series';
import type { ChartCurve, ChartDatum } from './types';
import { useChartTheme } from './useChartTheme';

export interface SparklineProps extends Omit<YStackProps, 'children' | 'width' | 'height'> {
  /** Series values — bare numbers or full data points. */
  data: Array<number | ChartDatum>;
  /** Drawing height in px (default 36 — inline metric scale). */
  height?: number;
  /** Fixed width; omit to track the parent responsively. */
  width?: number;
  /** Explicit color (data value — passes through untouched). */
  color?: string;
  /** Soft area fill under the line (default true). */
  showArea?: boolean;
  curve?: ChartCurve;
  strokeWidth?: number;
  /** Title used in the generated accessible summary. */
  title?: string;
  /** Override the generated accessible summary. */
  label?: string;
  /** Format spoken and complete data-view values consistently. */
  valueFormatter?: (value: number) => string;
}

/**
 * Inline trend miniature (KPI-card scale): no axes, no grid, no targets —
 * one identity-colored line with an optional soft area. The generated
 * accessible summary carries the data shape a glance conveys visually.
 */
export function Sparkline({
  data,
  height = 36,
  width,
  color,
  showArea = true,
  curve = 'monotone',
  strokeWidth = 1.5,
  title,
  label,
  valueFormatter,
  ...stackProps
}: SparklineProps) {
  const { t } = useTranslation();
  const { palette } = useChartTheme();
  const stroke = color ?? palette.single;
  const normalized: ChartDatum[] = data.map((entry, index) =>
    typeof entry === 'number' ? { label: String(index + 1), value: entry } : entry,
  );
  const ariaLabel =
    label ??
    describeChart({
      typeLabel: t('Sparkline'),
      title,
      data: normalized,
      formatValue: valueFormatter,
    });

  return (
    <ChartSurface
      label={ariaLabel}
      proof={{
        kind: showArea ? 'area' : 'line',
        separated: false,
        datumText: false,
        datumValues: chartDatumText(normalized, valueFormatter),
        datumCount: normalized.length,
      }}
      height={height}
      width={width}
      {...stackProps}>
      {(size) => {
        if (normalized.length === 0) {
          return null;
        }
        const inset = strokeWidth + 1;
        const xScale = createPointScale({
          domain: normalized.map((datum) => datum.label),
          range: [inset, size.width - inset],
        });
        const yScale = createLinearScale({
          domain: valueDomain(
            normalized.map((datum) => datum.value),
            { zeroBased: false },
          ),
          range: [size.height - inset, inset],
          nice: false,
        });
        const points = normalized.map((datum) => ({
          x: xScale(datum.label) ?? inset,
          y: yScale(datum.value),
        }));
        return (
          <>
            {showArea ? (
              <AreaSeries points={points} baseline={size.height - inset} color={stroke} curve={curve} />
            ) : null}
            <LineSeries
              data={normalized}
              points={points}
              color={stroke}
              strokeWidth={strokeWidth}
              curve={curve}
              showPoints={false}
            />
          </>
        );
      }}
    </ChartSurface>
  );
}

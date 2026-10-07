/**
 * Sanitizing ChartCard bridge. Lives in its own module so t4
 * `FrappeChartCard` does not import the t5 `FrappeDashboard` experience
 * file (component-tiers catalog defect). Values are coerced to numbers
 * and rows without a finite value (missing, NaN, non-numeric, Infinity)
 * are dropped, so malformed series can't flood the SVG layer with
 * invalid-length (`NaN`) attribute errors. Bar and pie renderers can't
 * draw negative magnitudes (negative rect heights / arc angles are
 * invalid SVG), so negatives clamp to the baseline there.
 */
import { ChartCard as BaseChartCard } from '@repo/ui';
import type { ChartCardProps, ChartDataPoint } from '@repo/ui';
import React, { useMemo } from 'react';

export function ChartCard({ config, ...chartCardProps }: ChartCardProps) {
  const clampNegatives = config.type === 'bar' || config.type === 'pie';
  const data = useMemo(
    () =>
      (config.data ?? []).flatMap((point) => {
        const value = Number((point as Partial<ChartDataPoint> | undefined)?.value);
        if (!Number.isFinite(value)) {
          return [];
        }
        return [{ ...point, value: clampNegatives && value < 0 ? 0 : value }];
      }),
    [config.data, clampNegatives],
  );
  const sanitizedConfig = useMemo(() => ({ ...config, data }), [config.data, data]);
  return (
    <BaseChartCard
      {...chartCardProps}
      config={sanitizedConfig}
    />
  );
}

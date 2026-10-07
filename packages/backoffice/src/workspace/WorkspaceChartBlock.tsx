/**
 * Workspace chart block — renders a Dashboard Chart by name using the desk
 * chart RPC for real series data, drawn with the catalog ChartCard.
 *
 * Mappings (frappe → catalog): Line→line, Bar→bar, Pie/Donut/Percentage→pie.
 * Heatmap has no catalog equivalent and falls back to bar (documented gap).
 * Only the first dataset is drawn — the catalog chart is single-series
 * (documented gap). In fixture mode (stories) the RPC is unavailable, so
 * the block renders an informational card instead.
 */
import { AsyncBoundary, Card, Skeleton, Text, YStack } from '@repo/ui';
import { ChartCard } from '@repo/frappe-ui';
import type { ChartConfig, ChartType } from '@repo/frappe-ui';
import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import type { WorkspaceChartRow } from './types';
import { useDashboardChartData } from './useDashboardChart';
import type { DashboardChartDoc } from './useDashboardChart';
import { useFrappeDoc } from './useWorkspaceDoc';

const chartHeight = sizeRecipeEscape(220, 'chart block: one plot height the chart and its loading bone share');

function toChartType(frappeType: string | undefined): ChartType {
  switch (frappeType) {
    case 'Line': {
      return 'line';
    }
    case 'Pie':
    case 'Donut':
    case 'Percentage': {
      return 'pie';
    }
    default: {
      // "Bar", "Heatmap" (no catalog heatmap yet), unknown → bar.
      return 'bar';
    }
  }
}

export interface WorkspaceChartBlockProps {
  row: WorkspaceChartRow;
}

export function WorkspaceChartBlock({ row }: WorkspaceChartBlockProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const title = row.label ?? row.chart_name;

  const {
    doc: chartDoc,
    isLoading: docLoading,
    error: docError,
  } = useFrappeDoc<DashboardChartDoc>('Dashboard Chart', row.chart_name);
  const { series, isLoading: dataLoading, error: dataError, unsupported } = useDashboardChartData(row.chart_name);

  const config = useMemo<ChartConfig | undefined>(() => {
    if (!series) {
      return;
    }
    const dataset = series.datasets?.[0];
    if (!dataset) {
      return;
    }
    return {
      id: `workspace-chart-${row.name}`,
      title,
      type: toChartType(chartDoc?.type),
      data: series.labels.map((label, index) => ({
        label,
        value: dataset.values[index] ?? 0,
      })),
      height: chartHeight,
    };
  }, [series, chartDoc?.type, row.name, title]);

  if (unsupported) {
    return (
      <Card flexGrow={1}>
        <YStack
          {...knobProps.panelPadding}
          {...knobProps.gap}>
          <Text
            {...knobProps.heading}
            fontWeight="400">
            {title}
          </Text>
          <Text
            {...knobProps.label}
            fontWeight="400"
            color="$color10">
            {t('workspaceChartFixture', 'Chart data is only available on a live bench')}
          </Text>
        </YStack>
      </Card>
    );
  }

  if (docLoading || dataLoading) {
    return (
      <Card
        flexGrow={1}
        aria-busy
        aria-label={t('loading', 'Loading')}>
        <YStack
          {...knobProps.panelPadding}
          {...knobProps.gap}>
          <Skeleton
            width="40%"
            height={sizeRecipeEscape(16, 'title bone: the height of the card title it stands in for')}
          />
          <Skeleton
            variant="rounded"
            width="100%"
            height={chartHeight}
          />
        </YStack>
      </Card>
    );
  }

  const error = docError ?? dataError;
  if (error || !config) {
    return (
      <AsyncBoundary
        compact
        error={error ?? true}
        errorTitle={t('workspaceChartError', "Couldn't load chart {{title}}", {
          title,
        })}
      />
    );
  }

  return (
    <ChartCard
      config={config}
      flexGrow={1}
    />
  );
}

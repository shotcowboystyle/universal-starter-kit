/**
 * FrappeChartCard — a chart card whose series is a LIVE grouped aggregate.
 *
 * Static mode (no `dataSource`) renders the sanitizing `ChartCard` bridge
 * untouched. Live mode groups the doctype server-side (`get_list` with an
 * aggregate field + `group_by`), subscribes to the doctype's realtime room
 * (shared, refcounted via the SyncModule), and refetches with a debounced
 * coalescing window on every `list_update` / `doc_update` / `doc_deleted`
 * — see `useFrappeAggregate` for the recompute contract.
 *
 * Chart colors are untouched: no palette is passed unless the caller sets
 * one, so the canonical `useChartPalette()` defaults (LC-27) apply.
 *
 * Honest states: catalog skeleton on first load, catalog error surface
 * (permission failures called out), catalog empty state when the aggregate
 * returns no groups, and a subtle stale dim while a post-event refetch is
 * in flight.
 *
 * A `dataSource` with no data source in scope — no `baseURL` from the prop
 * or a FrappeProvider, and no fixture corpus either — is a misconfiguration,
 * not static mode: the caller asked for a computed series and there is
 * nowhere to compute it. The card renders the not-configured surface and
 * warns in dev. It never falls back to `config.data`, which would present
 * an uncomputed shape as the series. A fixture corpus answers every read
 * locally, so it stands in for a baseURL (MPO-228).
 */
import { AsyncBoundary, Card, Skeleton } from '@repo/ui';
import type { ChartCardProps, ChartConfig } from '@repo/ui';
import { useResolvedKnobs } from '@repo/theme';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { ChartCard } from './ChartCard';
import { useFrappeConfig } from './FrappeProvider';
import { frappeDevWarn } from './shared/devWarn';
import { useFrappeAggregate } from './useFrappeAggregate';
import type { FrappeAggregateConnection, FrappeAggregateOperation } from './useFrappeAggregate';

/** Live data source for a chart series: one data point per group. */
export interface FrappeChartDataSource {
  doctype: string;
  /** Field whose distinct values become the chart labels. */
  groupBy: string;
  /** Aggregate operation per group (default `"count"`). */
  aggregate?: FrappeAggregateOperation;
  /** Field for sum/avg/min/max. */
  field?: string;
  filters?: Record<string, unknown> | [string, string, unknown][];
  /** Coalescing window for event-driven refetches in ms (default 300). */
  debounceMs?: number;
  /** Optional label mapper (e.g. prettify raw field values). */
  formatLabel?: (label: string) => string;
}

export interface FrappeChartCardProps extends Omit<ChartCardProps, 'config'> {
  /**
   * Chart chrome (title, type, height…). In live mode `data` is overridden.
   * With a `dataSource` and no data source in scope, `data` is not rendered
   * at all.
   */
  config: Omit<ChartConfig, 'data'> & { data?: ChartConfig['data'] };
  /** When set, the chart series goes live against this doctype. */
  dataSource?: FrappeChartDataSource;
  /**
   * Falls back to the FrappeProvider's. Required whenever `dataSource` is
   * set, unless the provider carries a fixture corpus.
   */
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: unknown;
}

/**
 * Card-shaped skeleton mirroring the chart card layout (DG-ST-02): title
 * skeleton on the page line above the card (LC-38 — ChartCard renders its
 * heading outside the painted surface), chart skeleton inside.
 */
function ChartCardSkeleton({ height = 200, ...stackProps }: Omit<YStackProps, 'height'> & { height?: number }) {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  return (
    <YStack
      {...knobProps.gap}
      aria-busy
      aria-label={t('Loading')}
      {...stackProps}>
      <Skeleton width="40%" />
      <Card>
        <Skeleton
          variant="rounded"
          width="100%"
          height={height}
        />
      </Card>
    </YStack>
  );
}

export function FrappeChartCard({
  config,
  dataSource,
  baseURL,
  auth,
  syncOptions,
  ...chartCardProps
}: FrappeChartCardProps) {
  const providerConfig = useFrappeConfig();
  const { t } = useTranslation();

  const finalBaseURL = baseURL ?? providerConfig?.baseURL;
  const fixtures = providerConfig?.fixtures;
  const connection: FrappeAggregateConnection | undefined =
    dataSource && (finalBaseURL || fixtures)
      ? {
          baseURL: finalBaseURL,
          socketPort: providerConfig?.socketPort,
          siteName: providerConfig?.siteName,
          socketBaseURL: providerConfig?.socketBaseURL,
          auth: auth ?? providerConfig?.auth,
          syncOptions: syncOptions ?? providerConfig?.syncOptions,
          realtime: providerConfig?.realtime,
          fixtures,
        }
      : undefined;

  const missingConnection = !!dataSource && !connection;
  const doctype = dataSource?.doctype;
  useEffect(() => {
    if (!missingConnection) {
      return;
    }
    frappeDevWarn('chart-datasource-without-baseurl', {
      component: 'FrappeChartCard',
      id: config.id,
      doctype,
      suggest: 'set baseURL on FrappeChartCard or on the FrappeProvider above it',
    });
  }, [missingConnection, config.id, doctype]);

  const { groups, isLoading, isStale, error, isPermissionError } = useFrappeAggregate(connection, {
    doctype: dataSource?.doctype ?? '',
    aggregate: dataSource?.aggregate,
    field: dataSource?.field,
    filters: dataSource?.filters,
    groupBy: dataSource?.groupBy,
    debounceMs: dataSource?.debounceMs,
    enabled: !!dataSource,
  });

  const liveConfig = useMemo<ChartConfig>(() => {
    const data = dataSource
      ? (groups ?? []).map((group) => ({
          label: dataSource.formatLabel ? dataSource.formatLabel(group.label) : group.label,
          value: group.value,
        }))
      : (config.data ?? []);
    return { ...config, data } as ChartConfig;
  }, [config, dataSource, groups]);

  // Static passthrough — sanitizing bridge, palette untouched. The caller
  // supplied the series and asked for no computation.
  if (!dataSource) {
    return (
      <ChartCard
        config={liveConfig}
        {...chartCardProps}
      />
    );
  }

  // A requested series with nowhere to compute it. `config.data` is the
  // caller's placeholder, so drawing it here would publish a shape nothing
  // downstream could tell was never computed.
  if (!connection) {
    return (
      <AsyncBoundary
        compact
        error
        errorTitle={t('{{title}} is not configured', { title: config.title })}
        errorDescription={t(
          'This chart reads {{doctype}} live, but no Frappe baseURL is in scope, so the series was never computed.',
          { doctype: dataSource.doctype },
        )}
        {...(chartCardProps as YStackProps)}
      />
    );
  }

  if (isLoading) {
    return (
      <ChartCardSkeleton
        height={config.height ?? 200}
        {...(chartCardProps as Omit<YStackProps, 'height'>)}
      />
    );
  }

  if (error) {
    return (
      <AsyncBoundary
        compact
        error={error}
        errorTitle={
          isPermissionError
            ? t('No permission to read {{doctype}}', { doctype: dataSource.doctype })
            : t("Couldn't load {{title}}", { title: config.title })
        }
        {...(chartCardProps as YStackProps)}
      />
    );
  }

  if (liveConfig.data.length === 0) {
    return (
      <AsyncBoundary
        compact
        empty
        emptyTitle={t('No data yet')}
        emptyDescription={t('{{doctype}} has no rows matching this chart', {
          doctype: dataSource.doctype,
        })}
        {...(chartCardProps as YStackProps)}
      />
    );
  }

  return (
    <ChartCard
      config={liveConfig}
      // Subtle stale affordance: dim while a post-event refetch is in flight.
      opacity={isStale ? 0.6 : 1}
      aria-busy={isStale || undefined}
      {...chartCardProps}
    />
  );
}

export type { ChartConfig, ChartDataPoint } from '@repo/ui';

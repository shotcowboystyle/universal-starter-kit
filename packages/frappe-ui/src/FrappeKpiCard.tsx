/**
 * FrappeKPICard — a KPI card whose number is a LIVE server-side aggregate.
 *
 * Static mode (no `dataSource`) renders the catalog `KPICard` untouched.
 * Live mode subscribes to the doctype's realtime room (shared, refcounted
 * via the SyncModule) and refetches the aggregate through the client with a
 * debounced coalescing window on every `list_update` / `doc_update` /
 * `doc_deleted` — see `useFrappeAggregate` for the recompute contract.
 *
 * Honest states: catalog skeleton on first load, catalog error surface
 * (permission failures called out explicitly), a subtle stale affordance
 * (the card dims while a post-event refetch is in flight), and "—" when the
 * aggregate has no result (e.g. avg over an empty set).
 *
 * A `dataSource` with no data source in scope — no `baseURL` from the prop
 * or a FrappeProvider, and no fixture corpus either — is a misconfiguration,
 * not static mode: the caller asked for a computed figure and there is
 * nowhere to compute it. The card renders the not-configured surface and
 * warns in dev. It never falls back to `config.value`, which would present
 * an uncomputed number as the KPI. A fixture corpus answers every read
 * locally, so it stands in for a baseURL (MPO-228).
 */
import { AsyncBoundary, Card, KPICard, Skeleton } from '@repo/ui';
import type { KPICardConfig } from '@repo/ui';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { YStackProps } from 'tamagui';

import { useFrappeConfig } from './FrappeProvider';
import { frappeDevWarn } from './shared/dev-warn';
import { useFrappeAggregate } from './use-frappe-aggregate';
import type { FrappeAggregateConnection, FrappeAggregateOperation } from './use-frappe-aggregate';

/** Live data source for a KPI value. */
export interface FrappeKPIDataSource {
  doctype: string;
  /** Aggregate operation (default `"count"`). */
  aggregate?: FrappeAggregateOperation;
  /** Field for sum/avg/min/max. */
  field?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Frappe filter values are any scalar or list the server accepts; passed through untouched
  filters?: Record<string, unknown> | [string, string, unknown][];
  /** Coalescing window for event-driven refetches in ms (default 300). */
  debounceMs?: number;
}

export interface FrappeKPICardProps extends Omit<YStackProps, 'children'> {
  /**
   * KPI chrome (title, format, trend, icon…). In live mode `value` is
   * overridden by the aggregate; in static mode it renders as-is. With a
   * `dataSource` and no `baseURL`, `value` is not rendered at all.
   */
  config: KPICardConfig;
  /** When set, the card's value goes live against this doctype. */
  dataSource?: FrappeKPIDataSource;
  /**
   * Falls back to the FrappeProvider's. Required whenever `dataSource` is
   * set, unless the provider carries a fixture corpus.
   */
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: unknown;
}

/** Card-shaped skeleton so the live KPI's first load doesn't jump layout. */
const KPICardSkeleton = (stackProps: YStackProps) => {
  const { t } = useTranslation();
  return (
    <Card
      aria-busy
      aria-label={t('Loading')}
      {...stackProps}>
      <Skeleton width="50%" />
      <Skeleton width="70%" />
      <Skeleton width="40%" />
    </Card>
  );
};

/** The aggregate connection, or undefined when no baseURL or fixture corpus is in scope. */
const resolveConnection = (
  providerConfig: ReturnType<typeof useFrappeConfig>,
  { baseURL, auth, syncOptions }: Pick<FrappeKPICardProps, 'baseURL' | 'auth' | 'syncOptions'>,
): FrappeAggregateConnection | undefined => {
  const finalBaseURL = baseURL ?? providerConfig?.baseURL;
  const fixtures = providerConfig?.fixtures;
  const hasBaseURL = finalBaseURL !== undefined && finalBaseURL !== '';
  if (!hasBaseURL && !fixtures) {
    return undefined;
  }
  return {
    baseURL: finalBaseURL,
    socketPort: providerConfig?.socketPort,
    siteName: providerConfig?.siteName,
    socketBaseURL: providerConfig?.socketBaseURL,
    auth: auth ?? providerConfig?.auth,
    syncOptions: syncOptions ?? providerConfig?.syncOptions,
    realtime: providerConfig?.realtime,
    fixtures,
  };
};

export const FrappeKPICard = ({
  config,
  dataSource,
  baseURL,
  auth,
  syncOptions,
  ...stackProps
}: FrappeKPICardProps) => {
  const providerConfig = useFrappeConfig();
  const { t } = useTranslation();

  const connection = dataSource ? resolveConnection(providerConfig, { baseURL, auth, syncOptions }) : undefined;

  const missingConnection = !!dataSource && !connection;
  const doctype = dataSource?.doctype;
  useEffect(() => {
    if (!missingConnection) {
      return;
    }
    frappeDevWarn('kpi-datasource-without-baseurl', {
      component: 'FrappeKPICard',
      id: config.id,
      doctype,
      suggest: 'set baseURL on FrappeKPICard or on the FrappeProvider above it',
    });
  }, [missingConnection, config.id, doctype]);

  const { value, isLoading, isStale, error, isPermissionError } = useFrappeAggregate(connection, {
    doctype: dataSource?.doctype ?? '',
    aggregate: dataSource?.aggregate,
    field: dataSource?.field,
    filters: dataSource?.filters,
    debounceMs: dataSource?.debounceMs,
    enabled: !!dataSource,
  });

  const liveConfig = useMemo<KPICardConfig>(() => {
    if (!dataSource) {
      return config;
    }
    return { ...config, value: value ?? '—' };
  }, [config, dataSource, value]);

  // Static passthrough. The caller supplied the figure and asked for no
  // computation.
  if (!dataSource) {
    return (
      <KPICard
        config={config}
        {...stackProps}
      />
    );
  }

  // A requested figure with nowhere to compute it. `config.value` is the
  // caller's placeholder, so painting it here would publish a number nothing
  // downstream could tell was never computed.
  if (!connection) {
    return (
      <AsyncBoundary
        compact
        error
        errorTitle={t('{{title}} is not configured', { title: config.title })}
        errorDescription={t(
          'This card reads {{doctype}} live, but no Frappe baseURL is in scope, so the figure was never computed.',
          { doctype: dataSource.doctype },
        )}
        {...stackProps}
      />
    );
  }

  if (isLoading) {
    return <KPICardSkeleton {...stackProps} />;
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
        {...stackProps}
      />
    );
  }

  return (
    <KPICard
      config={liveConfig}
      // Subtle stale affordance: dim while a post-event refetch is in flight.
      opacity={isStale ? 0.6 : 1}
      aria-busy={isStale || undefined}
      {...stackProps}
    />
  );
};

export type { KPICardConfig } from '@repo/ui';

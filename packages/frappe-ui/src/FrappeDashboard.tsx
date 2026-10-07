import { Dashboard } from '@repo/ui';
import type { DashboardWidget } from '@repo/ui';
import { Button, Spinner, formCommonColors } from '@repo/forms';
import { useFrappeDoctypeEvents } from '@repo/frappe';
import { formatTimeOfDay, useResolvedKnobs } from '@repo/theme';
import { ArrowsClockwiseIcon } from '@phosphor-icons/react';
import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack, H3 } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { useFrappeConfig } from './FrappeProvider';
import { useFrappeRows } from './useFrappeRows';

/**
 * Data source configuration for live data.
 */
export interface DashboardDataSource<TDoc> {
  doctype: string;
  fields?: readonly (keyof TDoc & string)[];
  filters?: Partial<TDoc> | [keyof TDoc & string, string, any][];
  aggregations?: {
    field: keyof TDoc & string;
    operation: 'count' | 'sum' | 'avg' | 'min' | 'max';
    groupBy?: keyof TDoc & string;
  }[];
}

export interface FrappeDashboardProps<TDoc extends { name: string; doctype: string }> extends Omit<
  YStackProps,
  'children'
> {
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string | (() => string | Promise<string>); type?: string };
  syncOptions?: any;
  title?: string;
  description?: string;
  widgets: DashboardWidget[];
  dataSource?: DashboardDataSource<TDoc>;
  transformData?: (data: Partial<TDoc>[]) => DashboardWidget[];
  columns?: number;
  gap?: number;
  padding?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  loading?: React.ReactNode;
  error?: (error: Error) => React.ReactNode;
}

interface ConnectionConfig {
  baseURL: string;
  /** False keeps HTTP reads without realtime subscriptions. */
  realtime?: boolean;
  socketPort?: number;
  /** Same-origin socket override (see FrappeConfig.socketBaseURL). */
  socketBaseURL?: string;
  /** Frappe site name — the realtime Socket.IO namespace. */
  siteName?: string;
  auth?: FrappeDashboardProps<{ name: string; doctype: string }>['auth'];
  syncOptions?: unknown;
  fixtures?: unknown;
}

/**
 * Owns the live query. Remounted via `key={refreshKey}` so Refresh /
 * autoRefresh re-subscribe instead of faking a spinner (SB-M-806).
 */
function LiveDashboardContent<TDoc extends { name: string; doctype: string }>({
  connectionConfig,
  dataSource,
  transformData,
  staticWidgets,
  title,
  description,
  columns,
  gap,
  padding,
  showRefresh,
  lastRefresh,
  isRefreshing,
  onRefresh,
  loading,
  error,
  stackProps,
}: {
  connectionConfig: ConnectionConfig;
  dataSource: DashboardDataSource<TDoc>;
  transformData?: (data: Partial<TDoc>[]) => DashboardWidget[];
  staticWidgets: DashboardWidget[];
  title?: string;
  description?: string;
  columns: number;
  gap: number;
  padding: number;
  showRefresh: boolean;
  lastRefresh: Date;
  isRefreshing: boolean;
  onRefresh: () => void;
  loading?: React.ReactNode;
  error?: (error: Error) => React.ReactNode;
  stackProps: YStackProps;
}) {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();

  const {
    rows: liveData,
    isQueryLoading: isLiveLoading,
    isError,
  } = useFrappeRows<TDoc>(connectionConfig as any, dataSource.doctype, {
    fields: dataSource.fields,
    filters: dataSource.filters,
    limit: null,
  });

  // Live staleness: a realtime change on the source doctype marks the view
  // stale until the collection reconciles (data identity changes) or a
  // settle window passes (the event may not intersect this dashboard's
  // filters/window — never leave the indicator stuck).
  const [isLiveStale, setIsLiveStale] = useState(false);
  const [dataUpdatedAt, setDataUpdatedAt] = useState<Date | undefined>();
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const clearStaleTimer = useCallback(() => {
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = undefined;
    }
  }, []);
  useFrappeDoctypeEvents(connectionConfig as any, dataSource.doctype, (event) => {
    if (
      event.type !== 'doc_update' &&
      event.type !== 'list_update' &&
      event.type !== 'doc_deleted' &&
      event.type !== 'doc_changed'
    ) {
      return;
    }
    setIsLiveStale(true);
    clearStaleTimer();
    staleTimerRef.current = setTimeout(() => {
      setIsLiveStale(false);
    }, 2500);
  });
  const isFirstData = useRef(true);
  useEffect(() => {
    if (isFirstData.current) {
      isFirstData.current = false;
      return;
    }
    setDataUpdatedAt(new Date());
    setIsLiveStale(false);
    clearStaleTimer();
  }, [liveData, clearStaleTimer]);
  useEffect(() => clearStaleTimer, [clearStaleTimer]);

  const widgets = useMemo(() => {
    if (transformData && liveData.length > 0) {
      return transformData(liveData);
    }
    return staticWidgets;
  }, [transformData, liveData, staticWidgets]);

  if (isLiveLoading && liveData.length === 0) {
    if (loading) {
      return <>{loading}</>;
    }
    return (
      <YStack
        {...knobProps.panelPadding}
        alignItems="center"
        gap="$2"
        {...stackProps}>
        <Spinner size="large" />
        <Text
          color={knobProps.textAccentColor}
          {...knobProps.body}>
          {t('Loading dashboard...')}
        </Text>
      </YStack>
    );
  }

  if (isError) {
    const err = new Error(t('Failed to load dashboard data'));
    if (error) {
      return <>{error(err)}</>;
    }
    return (
      <YStack
        {...knobProps.panelPadding}
        alignItems="center"
        {...stackProps}
        {...knobProps.gap}>
        <Text color={formCommonColors.error}>{t('Failed to load dashboard')}</Text>
        <Text
          color={knobProps.textAccentColor}
          {...knobProps.body}>
          {err.message}
        </Text>
      </YStack>
    );
  }

  return (
    <YStack
      {...knobProps.containerRadius}
      flex={1}
      {...stackProps}>
      {(title || showRefresh) && (
        <XStack
          {...knobProps.panelPadding}
          justifyContent="space-between"
          alignItems="center"
          paddingBottom={0}>
          {title ? <H3 {...knobProps.heading}>{title}</H3> : <YStack flex={1} />}
          {showRefresh && (
            <XStack
              {...knobProps.gap}
              alignItems="center">
              {isLiveStale && (
                <Spinner
                  size="small"
                  aria-label={t('Updating')}
                />
              )}
              <Text
                color={knobProps.textAccentColor}
                {...knobProps.label}>
                {t('Last updated: {{time}}', {
                  time: formatTimeOfDay(dataUpdatedAt ?? lastRefresh),
                })}
              </Text>
              {/* LC-54 (amendment 2026-08-13): house Button, own-box floor —
                  the raw tamagui Button + grown transparent target painted
                  its hover fill across the escaped 44px floor. `circular`
                  makes the painted box ITSELF the 44×44 control (box-is-
                  control mechanism), so feedback stays inside its own slot.
                  `loading` (not bare `disabled`) is the derived busy state. */}
              <Button
                size="$2"
                circular
                icon={ArrowsClockwiseIcon}
                onPress={onRefresh}
                loading={isRefreshing || isLiveLoading}
                chromeless
                aria-label={t('Refresh')}
              />
            </XStack>
          )}
        </XStack>
      )}

      <Dashboard
        widgets={widgets}
        description={description}
        columns={columns}
        gap={typeof knobProps.gap?.gap === 'number' ? knobProps.gap.gap : gap}
        padding={typeof knobProps.panelPadding?.padding === 'number' ? knobProps.panelPadding.padding : padding}
      />
    </YStack>
  );
}

/**
 * Thin Frappe wrapper around the generic Dashboard component.
 *
 * Fetches live data via `useFrappeRows` if a `dataSource` is configured,
 * transforms it into widget data, and passes everything to the generic
 * `Dashboard` from `@repo/ui`.
 */
export function FrappeDashboard<TDoc extends { name: string; doctype: string }>({
  baseURL,
  auth,
  syncOptions,
  title,
  description,
  widgets: staticWidgets,
  dataSource,
  transformData,
  columns = 4,
  gap = 16,
  padding = 16,
  autoRefresh = false,
  refreshInterval = 60,
  loading,
  error,
  ...stackProps
}: FrappeDashboardProps<TDoc>) {
  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const connectionConfig: ConnectionConfig | undefined =
    finalBaseURL && dataSource?.doctype
      ? {
          baseURL: finalBaseURL,
          socketPort: config?.socketPort,
          siteName: config?.siteName,
          socketBaseURL: config?.socketBaseURL,
          auth: finalAuth,
          syncOptions: finalSyncOptions,
          realtime: config?.realtime,
          fixtures: config?.fixtures,
        }
      : undefined;

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const clearRefreshTimer = useCallback(() => {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = undefined;
  }, []);
  useEffect(() => clearRefreshTimer, [clearRefreshTimer]);

  const bumpRefresh = useCallback(() => {
    setIsRefreshing(true);
    setLastRefresh(new Date());
    setRefreshKey((k) => k + 1);
    clearRefreshTimer();
    refreshTimerRef.current = setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  }, [clearRefreshTimer]);

  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0 || !dataSource) {
      return;
    }
    const interval = setInterval(() => {
      bumpRefresh();
    }, refreshInterval * 1000);
    return () => {
      clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval, dataSource, bumpRefresh]);

  // Static widgets path (no live dataSource)
  if (!dataSource || !connectionConfig) {
    return (
      <YStack
        {...knobProps.containerRadius}
        flex={1}
        {...stackProps}>
        {(title || autoRefresh) && (
          <XStack
            {...knobProps.panelPadding}
            justifyContent="space-between"
            alignItems="center"
            paddingBottom={0}>
            {title ? <H3 {...knobProps.heading}>{title}</H3> : <YStack flex={1} />}
            <XStack
              {...knobProps.gap}
              alignItems="center">
              {autoRefresh && (
                <Text
                  color={knobProps.textAccentColor}
                  {...knobProps.label}>
                  {t('Last updated: {{time}}', { time: formatTimeOfDay(lastRefresh) })}
                </Text>
              )}
              {/* LC-54: house Button, own-box floor (see the live-path refresh). */}
              <Button
                size="$2"
                circular
                icon={ArrowsClockwiseIcon}
                onPress={bumpRefresh}
                loading={isRefreshing}
                chromeless
                aria-label={t('Refresh')}
              />
            </XStack>
          </XStack>
        )}

        <Dashboard
          widgets={staticWidgets}
          description={description}
          columns={columns}
          gap={typeof knobProps.gap?.gap === 'number' ? knobProps.gap.gap : gap}
          padding={typeof knobProps.panelPadding?.padding === 'number' ? knobProps.panelPadding.padding : padding}
        />
      </YStack>
    );
  }

  // Generic JSX (`<LiveDashboardContent<TDoc> …/>`) breaks one-dev's source
  // annotation transform; instantiate the type argument outside JSX instead.
  const Content = LiveDashboardContent<TDoc>;
  return (
    <Content
      key={refreshKey}
      connectionConfig={connectionConfig}
      dataSource={dataSource}
      transformData={transformData}
      staticWidgets={staticWidgets}
      title={title}
      description={description}
      columns={columns}
      gap={gap}
      padding={padding}
      showRefresh
      lastRefresh={lastRefresh}
      isRefreshing={isRefreshing}
      onRefresh={bumpRefresh}
      loading={loading}
      error={error}
      stackProps={stackProps}
    />
  );
}

export { ChartCard } from './ChartCard';

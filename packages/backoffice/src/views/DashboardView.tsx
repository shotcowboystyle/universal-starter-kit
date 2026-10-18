// Desk "dashboard" view (/app/<doctype>/view/dashboard parity): a compact
// per-doctype dashboard —
//   - live KPI row (total, created last 30d, modified last 7d) via
//     FrappeKPICard's server-side aggregates (realtime-refetched)
//   - per-status KPI cards when the doctype has a status Select (one card
//     per option; clicking opens the list pre-filtered via `?f=`)
//   - "created per week" bar chart over the last 12 weeks (per-day server
//     aggregate bucketed into weeks — see dashboard-data.tsx)
//   - status distribution donut (FrappeChartCard + useFrappeAggregate
//     groupBy) when a status field exists
// Every card carries honest loading / error / empty states.

import { ChartCard, FrappeChartCard, FrappeKPICard } from '@repo/frappe-ui';
import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { AsyncBoundary, Card, ScrollView, Skeleton, XStack, YStack } from '@repo/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { useDeskScope } from '../desk/scope';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { useViewConnection } from './connection';
import {
  MAX_STATUS_KPI_CARDS,
  WEEKS_WINDOW,
  daysAgoIso,
  detectStatusField,
  filteredListHref,
  useWeeklyCreated,
} from './dashboard-data';
import type { WeeklyCreatedState } from './dashboard-data';
import { selectFieldOptions, useViewMeta } from './view-meta';
import { ViewError, ViewLoading } from './ViewStates';

const CHART_HEIGHT = 220;
const GRID_ESCAPE_REASON = 'dashboard grid: cards share a row until a column drops below its floor, then wrap';
const kpiColumnWidth = sizeRecipeEscape(220, GRID_ESCAPE_REASON);
const statusColumnWidth = sizeRecipeEscape(180, GRID_ESCAPE_REASON);
const chartColumnBasis = sizeRecipeEscape(360, GRID_ESCAPE_REASON);
const chartColumnMinWidth = sizeRecipeEscape(300, GRID_ESCAPE_REASON);

/** Card-shaped chart skeleton so the first load doesn't jump layout. */
const ChartSkeletonCard = ({ height }: { height: number }) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  return (
    <Card
      aria-busy
      aria-label={t('views.loading', 'Loading')}>
      <Skeleton
        width="40%"
        height={sizeRecipeEscape(16, 'title bone: the height of the card title it stands in for')}
      />
      <Skeleton
        variant="rounded"
        width="100%"
        height={height}
      />
    </Card>
  );
};

/** "Created per week" bar chart with its loading / error / empty states. */
const WeeklyCreatedChart = ({ weekly }: { weekly: WeeklyCreatedState }) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const handleRetry = weekly.refresh;
  if (weekly.isLoading) {
    return <ChartSkeletonCard height={CHART_HEIGHT} />;
  }
  if (weekly.error) {
    return (
      <AsyncBoundary
        compact
        error={weekly.error}
        errorTitle={t('views.weeklyChartFailed', "Couldn't load weekly activity")}
        onRetry={handleRetry}
      />
    );
  }
  if (weekly.isEmpty) {
    return (
      <AsyncBoundary
        compact
        empty
        emptyTitle={t('views.weeklyChartEmpty', 'No recent activity')}
        emptyDescription={t('views.weeklyChartEmptyDetail', 'Nothing was created in the last {{weeks}} weeks', {
          weeks: WEEKS_WINDOW,
        })}
      />
    );
  }
  return (
    <ChartCard
      // Subtle stale affordance: dim while a post-event refetch runs.
      opacity={weekly.isStale ? 0.6 : 1}
      aria-busy={weekly.isStale || undefined}
      config={{
        id: 'created-per-week',
        title: t('views.createdPerWeek', 'Created per week'),
        type: 'bar',
        data: weekly.data ?? [],
        height: CHART_HEIGHT,
      }}
    />
  );
};

export interface DashboardViewProps {
  /** Proper-cased doctype name (e.g. "Note", "Sales Order") */
  doctype: string;
}

export const DashboardView = ({ doctype }: DashboardViewProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const deskScope = useDeskScope();
  const { knobProps } = useResolvedKnobs();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const connection = useViewConnection();
  const { meta, isLoading: isMetaLoading, error: metaError } = useViewMeta(doctype);
  const weekly = useWeeklyCreated(connection, doctype, WEEKS_WINDOW, deskScope);
  // Rolling-window anchors resolve once per mount so the aggregate query
  // identities stay stable across re-renders (no refetch churn).
  // oxlint-disable-next-line react/hook-use-state -- anchors are a first-render snapshot and never update
  const [anchors] = useState(() => ({
    createdSince: daysAgoIso(30),
    modifiedSince: daysAgoIso(7),
  }));

  if (isMetaLoading) {
    return <ViewLoading />;
  }
  if (metaError && !meta) {
    return (
      <ViewError
        doctype={doctype}
        error={metaError}
      />
    );
  }

  const statusField = meta ? detectStatusField(meta) : undefined;
  const statusOptions = statusField ? selectFieldOptions(statusField).slice(0, MAX_STATUS_KPI_CARDS) : [];

  return (
    <ScrollView flex={1}>
      <YStack
        {...knobProps.panelPadding}
        {...knobProps.gap}>
        <XStack
          {...knobProps.gap}
          flexWrap="wrap">
          <YStack
            flexGrow={1}
            flexBasis={kpiColumnWidth}
            minWidth={kpiColumnWidth}>
            <FrappeKPICard
              config={{
                id: 'total',
                title: t('views.kpiTotal', 'Total {{doctype}}', { doctype }),
                value: 0,
                format: 'number',
              }}
              dataSource={{ doctype, ...(deskScope.length > 0 && { filters: deskScope }) }}
            />
          </YStack>
          <YStack
            flexGrow={1}
            flexBasis={kpiColumnWidth}
            minWidth={kpiColumnWidth}>
            <FrappeKPICard
              config={{
                id: 'created-30d',
                title: t('views.kpiCreated30d', 'Created (last 30 days)'),
                value: 0,
                format: 'number',
              }}
              dataSource={{
                doctype,
                filters: [...deskScope, ['creation', '>=', anchors.createdSince]],
              }}
            />
          </YStack>
          <YStack
            flexGrow={1}
            flexBasis={kpiColumnWidth}
            minWidth={kpiColumnWidth}>
            <FrappeKPICard
              config={{
                id: 'modified-7d',
                title: t('views.kpiModified7d', 'Modified (last 7 days)'),
                value: 0,
                format: 'number',
              }}
              dataSource={{
                doctype,
                filters: [...deskScope, ['modified', '>=', anchors.modifiedSince]],
              }}
            />
          </YStack>
        </XStack>

        {statusField && statusOptions.length > 0 && (
          <XStack
            {...knobProps.gap}
            flexWrap="wrap">
            {statusOptions.map((option) => (
              <YStack
                key={option}
                flexGrow={1}
                flexBasis={statusColumnWidth}
                minWidth={statusColumnWidth}>
                <FrappeKPICard
                  config={{
                    id: `status-${option}`,
                    title: option,
                    value: 0,
                    format: 'number',
                    onClick: () => {
                      navigator.navigate(filteredListHref(doctype, statusField.fieldname, option, paths));
                    },
                  }}
                  dataSource={{
                    doctype,
                    filters: [...deskScope, [statusField.fieldname, '=', option]],
                  }}
                />
              </YStack>
            ))}
          </XStack>
        )}

        <XStack
          {...knobProps.gap}
          flexWrap="wrap">
          <YStack
            flexGrow={1}
            flexBasis={chartColumnBasis}
            minWidth={chartColumnMinWidth}>
            <WeeklyCreatedChart weekly={weekly} />
          </YStack>
          {statusField && (
            <YStack
              flexGrow={1}
              flexBasis={chartColumnBasis}
              minWidth={chartColumnMinWidth}>
              <FrappeChartCard
                config={{
                  id: `by-${statusField.fieldname}`,
                  title: t('views.bySelectField', 'By {{field}}', {
                    field: statusField.label ?? statusField.fieldname,
                  }),
                  type: 'pie',
                  height: CHART_HEIGHT,
                }}
                dataSource={{
                  doctype,
                  groupBy: statusField.fieldname,
                  ...(deskScope.length > 0 && { filters: deskScope }),
                }}
              />
            </YStack>
          )}
        </XStack>
      </YStack>
    </ScrollView>
  );
};

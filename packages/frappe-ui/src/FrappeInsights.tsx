import {
  AsyncSkeleton,
  Breadcrumbs,
  Button,
  EmptyState,
  PageHeader,
  PageSection,
  Screen,
  XStack,
  YStack,
  useTheme,
} from '@repo/ui';
import type { ChartConfig } from '@repo/ui';
import { useDocTypeMeta } from '@repo/frappe';
import type { Order } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
import { ArrowLeftIcon, SparkleIcon } from '@phosphor-icons/react';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocRights } from './formEngine/useDocRights';
import { connectionsFromMeta } from './frappeConnections';
import type { FrappeConnection } from './frappeConnections';
import { frappeRouteHref, useFrappeRouter } from './frappeNavigation';
import { FrappeNotConfigured } from './FrappeNotConfigured';
import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import {
  average,
  facetDistribution,
  foldDistribution,
  histogram,
  multiValued,
  orderRows,
  topBy,
} from './insights/insightsData';
import { InsightsFacetTags } from './insights/InsightsFacetTags';
import { InsightsKpiBand } from './insights/InsightsKpiBand';
import type { InsightsTile } from './insights/InsightsKpiBand';
import { InsightsLeaders } from './insights/InsightsLeaders';
import { formatMetric } from './insights/insightsRecord';
import type { FrappeInsightsMetric, InsightsRecordView } from './insights/insightsRecord';
import { InsightsRecords } from './insights/InsightsRecords';
import { InsightsTable } from './insights/InsightsTable';
import { facetRead, readFacet } from './list/facetReading';
import { favoritesKey, useFavorites } from './list/favorites';
import type { FrappeListFacet } from './list/listState';
import { recordTitle } from './list/recordLook';
import type { FrappeRecordLook } from './list/recordLook';
import { useFrappeConnection, useFrappeRows } from './useFrappeRows';

export type { FrappeInsightsMetric };

/** Slices of the facet pie before the tail folds into "Other". */
const pieSlices = 7;

const noMetrics: readonly FrappeInsightsMetric[] = [];

export interface FrappeInsightsProps<TDoc extends { name: string; doctype: string }> {
  doctype: string;
  /** The doctype's list route: the breadcrumb, Back, record pages and facet links hang off it. */
  route: string;
  /** The list's title; defaults to the doctype. */
  listTitle?: string;
  /** Defaults to "Insights". */
  title?: string;
  subtitle?: (count: number) => string;
  /** The list's fields and ceiling, so both pages share one read. */
  fields?: readonly (keyof TDoc & string)[];
  limit?: number;
  orderBy?: { field: keyof TDoc & string; order: Order }[];
  /** Declared connections; defaults to the meta's (a Guest cannot read meta). */
  connections?: readonly FrappeConnection[];
  /** Its values chart as a pie, count distinct, tag the table and link to the narrowed list. */
  facet?: FrappeListFacet;
  /** The collective name of the facet's values ("Types"); defaults to its label. */
  facetPlural?: string;
  /** Numeric fields: the first charts and averages, each ranks and columns, `record` ones crown a holder. */
  metrics?: readonly FrappeInsightsMetric[];
  /** Count the list's favorites: true keys them by doctype, a string names the key. */
  favorites?: boolean | string;
  look?: FrappeRecordLook<TDoc>;
  titleField?: string;
  /** Rows per page of the full table. */
  pageSize?: number;
  /** Prefix of the sections' test ids. */
  testID?: string;
}

/**
 * A doctype's analytics page over the rows its list reads: the count, the
 * favorites, the facet's spread and the first metric's average, a facet pie
 * and a metric histogram, record holders, leaders per metric, every record
 * in a table, and the facet's values linking back to the narrowed list.
 * Not configured, error, loading and empty are four honest states under
 * the same wayfinding header.
 */
export function FrappeInsights<TDoc extends { name: string; doctype: string }>({
  doctype,
  route,
  listTitle,
  title,
  subtitle,
  fields,
  limit,
  orderBy,
  connections,
  facet: facetProp,
  facetPlural,
  metrics: metricsProp = noMetrics,
  favorites,
  look,
  titleField,
  pageSize = 5,
  testID,
}: FrappeInsightsProps<TDoc>) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme() as unknown as Record<string, { val?: string } | undefined>;
  const config = useFrappeConfig();
  const connection = useFrappeConnection();
  const navigate = useFrappeRouter()?.navigate;
  const { meta } = useDocTypeMeta(connection, doctype);
  const { rights } = useDocRights(connection, meta);
  const listName = listTitle ?? doctype;
  const pageTitle = title ?? t('Insights');

  // Declarations arrive as fresh objects every render. The sections' tables
  // keep their page only while their data keeps its identity, so the facet
  // and metrics settle on what they declare and the functions ride refs.
  const latest = useRef({ facet: facetProp, metrics: metricsProp, look, navigate });
  latest.current = { facet: facetProp, metrics: metricsProp, look, navigate };
  const facetKey = JSON.stringify(facetProp ?? null);
  const metricsKey = JSON.stringify(metricsProp);
  const facet = useMemo(() => latest.current.facet, [facetKey]);
  const metrics = useMemo(() => latest.current.metrics, [metricsKey]);

  const { rows: readRows, isLoading, error } = useFrappeRows<TDoc>(connection, doctype, { fields, limit, orderBy });
  const orderKey = JSON.stringify(orderBy ?? null);
  const rows = useMemo(() => orderRows(readRows as never[], JSON.parse(orderKey)) as TDoc[], [readRows, orderKey]);
  const read = facet ? facetRead(facet, doctype, connections ?? connectionsFromMeta(meta), limit) : undefined;
  const readKey = JSON.stringify(read ?? null);
  const facetQuery = useMemo(() => JSON.parse(readKey) as typeof read | null, [readKey]);
  const facetOptions = useMemo(() => ({ ...facetQuery?.options, enabled: Boolean(facetQuery?.ready) }), [facetQuery]);
  const { rows: facetRows } = useFrappeRows<TDoc>(connection, facetQuery?.doctype ?? '', facetOptions as never);
  const values = useMemo(
    () =>
      facet && facetQuery
        ? readFacet(facet, facetQuery.linkField, facetRows as never).values
        : new Map<string, string[]>(),
    [facet, facetQuery, facetRows],
  );
  const { count: favoritesCount } = useFavorites(
    favorites ? (typeof favorites === 'string' ? favorites : favoritesKey(doctype)) : undefined,
  );

  const nameField = titleField ?? meta?.title_field;
  const baseURL = config?.baseURL;
  const record = useMemo<InsightsRecordView<TDoc>>(
    () => ({
      title: (doc) => recordTitle(doc, latest.current.look, nameField),
      code: (doc) => latest.current.look?.code?.(doc) ?? undefined,
      images: (doc) => latest.current.look?.images?.(doc, baseURL) ?? [],
      values: (doc) => values.get(doc.name) ?? [],
      tints: (doc) => (values.get(doc.name) ?? []).map((value) => facet?.tint?.(value)),
      valueLabel: (value) => facet?.optionLabel?.(value) ?? value,
      valueTint: (value) => facet?.tint?.(value),
      open: (doc) => latest.current.navigate?.(frappeRouteHref(route, { mode: 'view', name: doc.name })),
    }),
    [nameField, baseURL, values, facet, route],
  );

  const distribution = useMemo(() => facetDistribution(values, rows), [values, rows]);
  const lead = metrics[0];
  const plural = facetPlural ?? facet?.label ?? '';

  const tiles: InsightsTile[] = [];
  if (favorites) {
    tiles.push({
      id: 'favorites',
      title: t('Favorites'),
      value: favoritesCount,
      hint: t('{{count}} of {{total}}', { count: favoritesCount, total: rows.length }),
    });
  }
  if (facet) {
    const several = multiValued(values, rows);
    tiles.push({
      id: 'facet',
      title: t('Distinct {{facets}}', { facets: plural }),
      value: distribution.length,
      hint:
        several > 0
          ? t('{{count}} with 2+', { count: several })
          : distribution[0]
            ? record.valueLabel(distribution[0].value)
            : undefined,
    });
  }
  const buckets = lead ? histogram(rows as never[], lead.field, lead.bucket) : [];
  if (lead) {
    tiles.push({
      id: 'average',
      title: t('Average {{metric}}', { metric: lead.label }),
      value: formatMetric(lead, Math.round(average(rows as never[], lead.field))),
      spark: buckets.map((bucket) => bucket.value),
    });
  }
  const charts: ChartConfig[] = [];
  if (facet) {
    charts.push({
      id: 'facet-distribution',
      title: t('{{facet}} distribution', { facet: facet.label }),
      type: 'pie',
      data: foldDistribution(distribution, pieSlices).map((entry) => ({
        label: entry.other ? t('Other') : record.valueLabel(entry.value),
        value: entry.count,
        color: theme[`${(!entry.other && facet.tint?.(entry.value)) || 'gray'}9`]?.val,
      })),
    });
  }
  if (lead) {
    charts.push({
      id: 'metric-histogram',
      title: t('{{metric}} distribution', { metric: lead.label }),
      type: 'bar',
      data: buckets,
    });
  }
  const holders = metrics
    .filter((metric) => metric.record)
    .flatMap((metric) => {
      const doc = topBy(rows as never[], metric.field, 1)[0] as TDoc | undefined;
      return doc
        ? [
            {
              id: metric.field,
              label: metric.record!,
              doc,
              value: formatMetric(metric, Number(doc[metric.field as keyof TDoc]) || 0),
            },
          ]
        : [];
    });

  const onAdd =
    rights.create && navigate
      ? () => {
          navigate(frappeRouteHref(route, { mode: 'create' }));
        }
      : undefined;
  const sectionId = (name: string) => (testID ? `${testID}-${name}` : undefined);

  if (!config?.baseURL && !config?.fixtures) {
    return (
      <FrappeNotConfigured
        doctype={doctype}
        page
      />
    );
  }

  const header = (
    <YStack {...knobProps.gap}>
      <Breadcrumbs
        items={[{ label: listName, href: route }, { label: pageTitle }]}
        onNavigate={(href) => navigate?.(href)}
      />
      <PageHeader
        title={pageTitle}
        subtitle={subtitle && !isLoading && !error && rows.length > 0 ? subtitle(rows.length) : undefined}
        actions={
          <Button
            variant="outlined"
            minHeight={knobProps.sizeToken}
            onPress={() => navigate?.(route)}
            icon={<ArrowLeftIcon size={16} />}
            testID={sectionId('back')}>
            {t('Back to {{title}}', { title: listName })}
          </Button>
        }
      />
    </YStack>
  );

  if (error) {
    return (
      <Screen scroll={false}>
        {header}
        <EmptyState
          intent="error"
          title={t("Couldn't load {{title}}", { title: listName })}
          description={t('Check the connection and try again.')}
        />
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen>
        {header}
        <YStack testID={sectionId('skeleton')}>
          <AsyncSkeleton layout="dashboard" />
        </YStack>
      </Screen>
    );
  }

  if (rows.length === 0) {
    return (
      <Screen scroll={false}>
        {header}
        <EmptyState
          icon={<SparkleIcon size={28} />}
          title={t('No {{title}} to analyze', { title: listName })}
          description={t('Add a record and the analytics will light up.')}
          action={
            onAdd ? (
              <Button
                theme="accent"
                onPress={onAdd}>
                {t('Add your first {{doctype}}', { doctype })}
              </Button>
            ) : undefined
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FrappeReconnectIndicator config={connection} />
      {header}

      <InsightsKpiBand
        hero={{ id: 'total', title: t('Total {{title}}', { title: listName }), value: rows.length }}
        tiles={tiles}
        charts={charts}
        testID={sectionId('dashboard')}
      />

      {holders.length > 0 || metrics.length > 0 ? (
        <XStack
          flexWrap="wrap"
          alignItems="flex-start"
          {...knobProps.gapLg}>
          {holders.length > 0 ? (
            <PageSection
              title={t('Record holders')}
              divider={false}
              flexGrow={1}
              flexShrink={1}
              flexBasis={280}
              minWidth={0}>
              <InsightsRecords
                tiles={holders}
                record={record}
                testID={sectionId('records')}
              />
            </PageSection>
          ) : null}
          {metrics.length > 0 ? (
            <PageSection
              title={t('Leaders')}
              description={t('The top five by the field you pick; open any row.')}
              divider={false}
              flexGrow={2}
              flexShrink={1}
              flexBasis={420}
              minWidth={0}>
              <InsightsLeaders
                rows={rows}
                metrics={metrics}
                record={record}
                testID={sectionId('leaderboard')}
              />
            </PageSection>
          ) : null}
        </XStack>
      ) : null}

      <PageSection
        title={t('All {{title}}', { title: listName })}
        description={t('Every record, {{count}} per page; sort any column.', { count: pageSize })}
        divider={false}>
        <InsightsTable
          rows={rows}
          metrics={metrics}
          record={record}
          facetLabel={facet ? plural : undefined}
          pageSize={pageSize}
          label={t('All {{title}}', { title: listName })}
          testID={sectionId('roster')}
        />
      </PageSection>

      {facet ? (
        <PageSection
          title={t('Browse by {{facet}}', { facet: facet.label })}
          description={t('Open the list narrowed to one value.')}
          divider={false}
          paddingBottom="$6">
          <InsightsFacetTags
            distribution={distribution}
            label={record.valueLabel}
            tint={facet.tint}
            onSelect={(value) => navigate?.(`${route}?${facet.param}=${encodeURIComponent(value)}`)}
            testID={sectionId('tag')}
          />
        </PageSection>
      ) : null}
    </Screen>
  );
}

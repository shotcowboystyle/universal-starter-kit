import { ArrowLeftIcon, SparkleIcon } from '@phosphor-icons/react';
import { useDocTypeMeta } from '@repo/frappe';
import type { Order } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
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
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocRights } from './formEngine/use-doc-rights';
import { connectionsFromMeta } from './frappe-connections';
import type { FrappeConnection } from './frappe-connections';
import { frappeRouteHref, useFrappeRouter } from './frappe-navigation';
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
} from './insights/insights-data';
import { formatMetric } from './insights/insights-record';
import type { FrappeInsightsMetric, InsightsRecordView } from './insights/insights-record';
import { InsightsFacetTags } from './insights/InsightsFacetTags';
import { InsightsKpiBand } from './insights/InsightsKpiBand';
import type { InsightsTile } from './insights/InsightsKpiBand';
import { InsightsLeaders } from './insights/InsightsLeaders';
import { InsightsRecords } from './insights/InsightsRecords';
import { InsightsTable } from './insights/InsightsTable';
import { facetRead, readFacet } from './list/facet-reading';
import { favoritesKey, useFavorites } from './list/favorites';
import type { FrappeListFacet } from './list/list-state';
import { recordTitle } from './list/record-look';
import type { FrappeRecordLook } from './list/record-look';
import { useFrappeConnection, useFrappeRows } from './use-frappe-rows';

export type { FrappeInsightsMetric } from './insights/insights-record';

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

type Translate = ReturnType<typeof useTranslation>['t'];
type OrderSpec = { field: string; order: string }[];
type ThemeColors = Record<string, { val?: string } | undefined>;

/**
 * The value last declared under `key`: a fresh-but-equal declaration keeps
 * the settled one's identity, so the sections' memoised data holds.
 */
const useSettled = <T,>(value: T, key: string): T => {
  const [settled, setSettled] = useState({ key, value });
  if (settled.key !== key) {
    setSettled({ key, value });
    return value;
  }
  return settled.value;
};

/** The favorites storage key: true keys by doctype, a string names it, anything else counts none. */
const favoritesKeyFor = (favorites: boolean | string | undefined, doctype: string): string | undefined => {
  if (favorites === undefined || favorites === false || favorites === '') {
    return undefined;
  }
  return favorites === true ? favoritesKey(doctype) : favorites;
};

/** The record holders: the top row of each `record` metric. */
const recordHolders = <TDoc extends { name: string; doctype: string }>(
  metrics: readonly FrappeInsightsMetric[],
  rows: readonly TDoc[],
) =>
  metrics.flatMap((metric) => {
    const { record: label } = metric;
    if (label === undefined || label === '') {
      return [];
    }
    // SAFETY: topBy returns rows from `rows`, which are TDocs; never[] only bridges TDoc to the helpers' open Row
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const doc = topBy(rows as never[], metric.field, 1)[0] as TDoc | undefined;
    if (doc === undefined) {
      return [];
    }
    // SAFETY: metric fields are fieldnames of the doctype, so they key the row
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const raw = doc[metric.field as keyof TDoc];
    return [{ id: metric.field, label, doc, value: formatMetric(metric, Number(raw) || 0) }];
  });

/** The facet pie: the folded distribution, each slice in its value's tint. */
const facetPie = (
  facet: FrappeListFacet,
  distribution: Parameters<typeof foldDistribution>[0],
  theme: ThemeColors,
  t: Translate,
  valueLabel: (value: string) => string,
): ChartConfig => ({
  id: 'facet-distribution',
  title: t('{{facet}} distribution', { facet: facet.label }),
  type: 'pie',
  data: foldDistribution(distribution, pieSlices).map((entry) => {
    const tint = entry.other === true ? undefined : facet.tint?.(entry.value);
    return {
      label: entry.other === true ? t('Other') : valueLabel(entry.value),
      value: entry.count,
      color: theme[`${tint === undefined || tint === '' ? 'gray' : tint}9`]?.val,
    };
  }),
});

interface InsightBandInput<TDoc> {
  t: Translate;
  theme: ThemeColors;
  rows: readonly TDoc[];
  metrics: readonly FrappeInsightsMetric[];
  facet: FrappeListFacet | undefined;
  values: ReadonlyMap<string, readonly string[]>;
  distribution: Parameters<typeof foldDistribution>[0];
  plural: string;
  valueLabel: (value: string) => string;
  favoritesStorageKey: string | undefined;
  favoritesCount: number;
}

/** The KPI band's tiles and charts: favorites, the facet's spread, the lead metric's average and histogram. */
const insightBand = <TDoc extends { name: string; doctype: string }>({
  t,
  theme,
  rows,
  metrics,
  facet,
  values,
  distribution,
  plural,
  valueLabel,
  favoritesStorageKey,
  favoritesCount,
}: InsightBandInput<TDoc>) => {
  const [lead] = metrics;
  const hasLead = metrics.length > 0;
  const tiles: InsightsTile[] = [];
  if (favoritesStorageKey !== undefined) {
    tiles.push({
      id: 'favorites',
      title: t('Favorites'),
      value: favoritesCount,
      hint: t('{{count}} of {{total}}', { count: favoritesCount, total: rows.length }),
    });
  }
  if (facet) {
    const several = multiValued(values, rows);
    let hint: string | undefined;
    if (several > 0) {
      hint = t('{{count}} with 2+', { count: several });
    } else if (distribution.length > 0) {
      hint = valueLabel(distribution[0].value);
    }
    tiles.push({
      id: 'facet',
      title: t('Distinct {{facets}}', { facets: plural }),
      value: distribution.length,
      hint,
    });
  }
  const buckets = hasLead ? histogram(rows, lead.field, lead.bucket) : [];
  if (hasLead) {
    tiles.push({
      id: 'average',
      title: t('Average {{metric}}', { metric: lead.label }),
      value: formatMetric(lead, Math.round(average(rows, lead.field))),
      spark: buckets.map((bucket) => bucket.value),
    });
  }
  const charts: ChartConfig[] = [];
  if (facet) {
    charts.push(facetPie(facet, distribution, theme, t, valueLabel));
  }
  if (hasLead) {
    charts.push({
      id: 'metric-histogram',
      title: t('{{metric}} distribution', { metric: lead.label }),
      type: 'bar',
      data: buckets,
    });
  }
  return { tiles, charts };
};

/**
 * A doctype's analytics page over the rows its list reads: the count, the
 * favorites, the facet's spread and the first metric's average, a facet pie
 * and a metric histogram, record holders, leaders per metric, every record
 * in a table, and the facet's values linking back to the narrowed list.
 * Not configured, error, loading and empty are four honest states under
 * the same wayfinding header.
 */
// oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one page with four honest states and optional sections; each branch is a flat prop check
export const FrappeInsights = <TDoc extends { name: string; doctype: string }>(props: FrappeInsightsProps<TDoc>) => {
  const {
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
  } = props;
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  // SAFETY: Tamagui's theme is a map of token name -> variable carrying `val`; tokens it lacks read as undefined
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- see SAFETY above; the theme type has no string index
  const theme = useTheme() as unknown as ThemeColors;
  const config = useFrappeConfig();
  const connection = useFrappeConnection();
  const navigate = useFrappeRouter()?.navigate;
  const { meta } = useDocTypeMeta(connection, doctype);
  const { rights } = useDocRights(connection, meta);
  const listName = listTitle ?? doctype;
  const pageTitle = title ?? t('Insights');

  // Declarations arrive as fresh objects every render. The sections' tables
  // keep their page only while their data keeps its identity, so the facet
  // and metrics settle on what they declare and the functions ride a ref.
  const latest = useRef({ look, navigate });
  // oxlint-disable-next-line react/refs -- latest-value ref: the record view's callbacks read the current look/navigate without changing identity
  latest.current = { look, navigate };
  const facet = useSettled(facetProp, JSON.stringify(facetProp ?? null));
  const metrics = useSettled(metricsProp, JSON.stringify(metricsProp));

  const { rows: readRows, isLoading, error } = useFrappeRows<TDoc>(connection, doctype, { fields, limit, orderBy });
  const orderKey = JSON.stringify(orderBy ?? null);
  const rows = useMemo(
    () =>
      // SAFETY: orderRows returns the given rows reordered, so they stay TDocs; orderKey is orderBy serialised above
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      orderRows(readRows as never[], (JSON.parse(orderKey) as OrderSpec | null) ?? undefined) as TDoc[],
    [readRows, orderKey],
  );
  const read = facet ? facetRead(facet, doctype, connections ?? connectionsFromMeta(meta), limit) : undefined;
  const readKey = JSON.stringify(read ?? null);
  // SAFETY: readKey is `read` serialised above; the facet read is plain data
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const facetQuery = useMemo(() => JSON.parse(readKey) as typeof read | null, [readKey]);
  const facetOptions = useMemo(() => ({ ...facetQuery?.options, enabled: Boolean(facetQuery?.ready) }), [facetQuery]);
  // SAFETY: the facet read's options are useFrappeRows options for the facet's doctype, built by facetRead
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const { rows: facetRows } = useFrappeRows<TDoc>(connection, facetQuery?.doctype ?? '', facetOptions as never);
  const values = useMemo(() => {
    if (!facet || !facetQuery) {
      return new Map<string, string[]>();
    }
    // SAFETY: facet rows are plain field->value docs; never[] only bridges TDoc to readFacet's open Row
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return readFacet(facet, facetQuery.linkField, facetRows as never).values;
  }, [facet, facetQuery, facetRows]);
  const favoritesStorageKey = favoritesKeyFor(favorites, doctype);
  const { count: favoritesCount } = useFavorites(favoritesStorageKey);

  const nameField = titleField ?? meta?.title_field;
  const baseURL = config?.baseURL;
  const valueLabel = useCallback((value: string) => facet?.optionLabel?.(value) ?? value, [facet]);
  const record = useMemo<InsightsRecordView<TDoc>>(
    () => ({
      title: (doc) => recordTitle(doc, latest.current.look, nameField),
      code: (doc) => latest.current.look?.code?.(doc) ?? undefined,
      images: (doc) => latest.current.look?.images?.(doc, baseURL) ?? [],
      values: (doc) => values.get(doc.name) ?? [],
      tints: (doc) => (values.get(doc.name) ?? []).map((value) => facet?.tint?.(value)),
      valueLabel,
      valueTint: (value) => facet?.tint?.(value),
      open: (doc) => latest.current.navigate?.(frappeRouteHref(route, { mode: 'view', name: doc.name })),
    }),
    [nameField, baseURL, values, facet, valueLabel, route],
  );

  const distribution = useMemo(() => facetDistribution(values, rows), [values, rows]);
  const plural = facetPlural ?? facet?.label ?? '';
  const { tiles, charts } = insightBand({
    t,
    theme,
    rows,
    metrics,
    facet,
    values,
    distribution,
    plural,
    valueLabel,
    favoritesStorageKey,
    favoritesCount,
  });
  const holders = recordHolders(metrics, rows);

  const onAdd =
    rights.create && navigate
      ? () => {
          navigate(frappeRouteHref(route, { mode: 'create' }));
        }
      : undefined;
  const sectionId = (name: string) => (testID !== undefined && testID !== '' ? `${testID}-${name}` : undefined);
  const hasRows = !isLoading && !error && rows.length > 0;

  if ((config?.baseURL === undefined || config.baseURL === '') && !config?.fixtures) {
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
        subtitle={subtitle && hasRows ? subtitle(rows.length) : undefined}
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
            label={valueLabel}
            tint={facet.tint}
            onSelect={(value) => navigate?.(`${route}?${facet.param}=${encodeURIComponent(value)}`)}
            testID={sectionId('tag')}
          />
        </PageSection>
      ) : null}
    </Screen>
  );
};

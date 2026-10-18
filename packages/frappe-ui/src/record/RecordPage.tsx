import { ArrowLeftIcon, HeartIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import {
  Breadcrumbs,
  Chip,
  H1,
  PageHeader,
  PageSection,
  Quote,
  Screen,
  ScreenToolbar,
  Tabs,
  Text,
  Timeline,
  Tooltip,
  XStack,
  YStack,
} from '@repo/ui';
import type { TimelineEntry } from '@repo/ui';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import { frappeRouteHref } from '../frappeNavigation';
import { metricValue } from '../insights/insightsRecord';
import type { FrappeInsightsMetric } from '../insights/insightsRecord';
import { FacetBadge } from '../list/FacetBadge';
import { favoritesKey, useFavorites } from '../list/favorites';
import type { FrappeListFacet } from '../list/listState';
import { recordTitle } from '../list/recordLook';
import type { FrappeRecordLook } from '../list/recordLook';

import { RecordBars } from './RecordBars';
import { adjacentRecords, recordFacetValues, recordHistory } from './recordData';
import { RecordGallery } from './RecordGallery';
import {
  RecordHeroArtColumn,
  RecordHeroFrame,
  RecordHeroIdentityColumn,
  RecordHeroRow,
  RecordVitals,
} from './RecordHero';
import { RecordPager } from './RecordPager';
import type { RecordPagerEntry } from './RecordPager';
import { RecordRows } from './RecordRows';
import type { FrappeRecordSection, FrappeRecordTab } from './recordSections';

/** A hop from the record to another page of it (the backoffice form). */
export interface FrappeRecordAction<TDoc> {
  label: string;
  icon: ComponentType<{ size?: number }>;
  href: (doc: Partial<TDoc>) => string;
  testID?: string;
}

type Row = Record<string, unknown>;

export interface RecordPageProps<TDoc extends { name: string; doctype: string }> {
  doc: Partial<TDoc>;
  linked: Record<string, Row[]>;
  doctype: string;
  route: string;
  listName: string;
  listRows: Partial<TDoc>[];
  look?: FrappeRecordLook<TDoc>;
  titleField?: string;
  facet?: FrappeListFacet;
  metrics: readonly FrappeInsightsMetric[];
  summary?: (doc: Partial<TDoc>) => { text: string; cite?: string } | undefined;
  tabs: readonly FrappeRecordTab[];
  favorites?: boolean | string;
  actions: readonly FrappeRecordAction<TDoc>[];
  history: boolean;
  slug: string;
  baseURL?: string;
  navigate: (href: string) => void;
  /** The session may write this record: Edit shows. */
  canEdit: boolean;
}

/**
 * A record page drawn from a record already read: the header with Back,
 * the heart, hops and Edit; the hero; the tabs; the neighbors. The data
 * wrapper (FrappeRecordView) reads the record, its rows and the rights.
 */
export function RecordPage<TDoc extends { name: string; doctype: string }>({
  doc,
  linked,
  doctype,
  route,
  listName,
  listRows,
  look,
  titleField,
  facet,
  metrics,
  summary,
  tabs,
  favorites,
  actions,
  history,
  slug,
  baseURL,
  navigate,
  canEdit,
}: RecordPageProps<TDoc>) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const { knobProps: nested } = useResolvedKnobs({ compact: true });
  const row = doc as Row;
  const name = String(row.name ?? '');
  const { isFavorite, toggle } = useFavorites(
    favorites ? (typeof favorites === 'string' ? favorites : favoritesKey(doctype)) : undefined,
  );

  const title = recordTitle(doc, look, titleField);
  const code = look?.code?.(doc);
  const values = facet ? recordFacetValues(facet, row, linked) : [];
  const tints = values.slice(0, 2).map((value) => facet?.tint?.(value));
  const images = look?.images?.(doc, baseURL) ?? [];
  const slides = (look?.gallery?.(doc, baseURL) ?? []).filter((slide) => slide.src && slide.src !== images[0]);
  const favorite = favorites ? isFavorite(name) : false;
  const favoriteLabel = favorite
    ? t('Remove {{name}} from favorites', { name: title })
    : t('Add {{name}} to favorites', { name: title });

  const { prev, next } = adjacentRecords(listRows, name);
  const pagerEntry = (neighbor: Partial<TDoc> | null): RecordPagerEntry | null =>
    neighbor?.name
      ? {
          title: recordTitle(neighbor, look, titleField),
          code: look?.code?.(neighbor),
          image: look?.images?.(neighbor, baseURL)[0],
          onPress: () => {
            navigate(frappeRouteHref(route, { mode: 'view', name: neighbor.name as string }));
          },
        }
      : null;

  const entries: TimelineEntry[] = history
    ? recordHistory(row).map((entry) =>
        entry.kind === 'modified'
          ? {
              id: `${name}-modified`,
              type: 'version',
              author: entry.author,
              timestamp: entry.timestamp,
            }
          : {
              id: `${name}-created`,
              type: 'info',
              author: entry.author,
              content: t('Created this {{doctype}}', { doctype }),
              timestamp: entry.timestamp,
            },
      )
    : [];

  const drawSection = (section: FrappeRecordSection, index: number) => {
    if (section.kind === 'bars') {
      const tableRows = Array.isArray(row[section.table]) ? (row[section.table] as Row[]) : [];
      return (
        <RecordBars
          key={`bars-${section.id}`}
          rows={tableRows}
          section={section}
          testID={`${slug}-${section.id}-chart`}
        />
      );
    }
    const rows = (
      <RecordRows
        rows={linked[section.doctype] ?? []}
        section={section}
      />
    );
    if (!section.title) {
      return (
        <YStack
          key={`rows-${index}`}
          {...knobProps.gap}>
          {section.description ? (
            <Text
              {...nested.label}
              color="$color10">
              {section.description}
            </Text>
          ) : null}
          {rows}
        </YStack>
      );
    }
    return (
      <PageSection
        key={`rows-${index}`}
        title={section.title}
        description={section.description}
        divider={false}>
        {rows}
      </PageSection>
    );
  };

  const quote = summary?.(doc);
  const tabItems = tabs.map((tab, index) => {
    const count = tab.count ? (linked[tab.count] ?? []).length : 0;
    const Icon = tab.icon;
    return {
      value: tab.value,
      label: tab.label,
      icon: Icon ? <Icon size={16} /> : undefined,
      badge: count > 0 ? <Chip size="$2">{count}</Chip> : undefined,
      content: (
        <YStack {...knobProps.gapLg}>
          {index === 0 && quote ? (
            <Quote
              marginVertical={0}
              cite={quote.cite}>
              {quote.text}
            </Quote>
          ) : null}
          {tab.sections.map(drawSection)}
          {index === 0 && entries.length > 0 ? (
            <PageSection
              title={t('Record history')}
              surface>
              <Timeline
                entries={entries}
                labels={{ madeChanges: t('last updated this record') }}
              />
            </PageSection>
          ) : null}
        </YStack>
      ),
    };
  });

  const toolbar = (
    <ScreenToolbar
      leading={
        <Button
          outlined
          minHeight={knobProps.sizeToken}
          onPress={() => {
            navigate(route);
          }}
          icon={<ArrowLeftIcon size={16} />}
          testID={`${slug}-detail-back`}>
          {t('Back')}
        </Button>
      }
      trailing={
        <XStack
          {...knobProps.gap}
          alignItems="center">
          {favorites || actions.length > 0 ? (
            <XStack
              {...knobProps.borderRadius}
              backgroundColor="$color2"
              alignItems="center">
              {favorites ? (
                <Tooltip content={favoriteLabel}>
                  <Button
                    circular
                    chromeless
                    minWidth={knobProps.sizeToken}
                    minHeight={knobProps.sizeToken}
                    onPress={() => {
                      toggle(name);
                    }}
                    col={(favorite ? '$red9' : '$color10') as never}
                    icon={
                      <HeartIcon
                        size={22}
                        weight={favorite ? 'fill' : 'regular'}
                      />
                    }
                    aria-label={favoriteLabel}
                    aria-pressed={favorite}
                    render="button"
                    type="button"
                    testID={`${slug}-detail-favorite`}
                  />
                </Tooltip>
              ) : null}
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Tooltip
                    key={action.label}
                    content={action.label}>
                    <Button
                      circular
                      chromeless
                      minWidth={knobProps.sizeToken}
                      minHeight={knobProps.sizeToken}
                      onPress={() => {
                        navigate(action.href(doc));
                      }}
                      col={'$color10' as never}
                      icon={<Icon size={20} />}
                      aria-label={action.label}
                      testID={action.testID}
                    />
                  </Tooltip>
                );
              })}
            </XStack>
          ) : null}
          {canEdit ? (
            <Button
              theme="accent"
              minHeight={knobProps.sizeToken}
              onPress={() => {
                navigate(frappeRouteHref(route, { mode: 'edit', name }));
              }}
              testID={`${slug}-detail-edit`}>
              {t('Edit')}
            </Button>
          ) : null}
        </XStack>
      }
    />
  );

  return (
    <Screen>
      <YStack gap="$2">
        <Breadcrumbs
          items={[{ label: listName, href: route }, { label: code ? `${code} ${title}` : title }]}
          onNavigate={(href) => {
            navigate(href);
          }}
        />
        {toolbar}
      </YStack>

      <RecordHeroFrame
        tint={tints[0]}
        testID={`${slug}-detail-stage`}>
        <RecordHeroRow>
          <RecordHeroArtColumn testID={`${slug}-hero-art`}>
            <RecordGallery
              images={images}
              slides={slides}
              alt={title}
              tints={tints}
            />
          </RecordHeroArtColumn>
          <RecordHeroIdentityColumn testID={`${slug}-hero-identity`}>
            {code ? (
              <Text
                {...nested.label}
                fontWeight="700"
                color={(tints[0] ? `$${tints[0]}11` : '$color11') as never}
                letterSpacing={1}>
                {code}
              </Text>
            ) : null}
            <PageHeader
              heading={
                <H1
                  margin={0}
                  size="$10"
                  $max-sm={{ size: '$9' }}>
                  {title}
                </H1>
              }
              subtitle={look?.subtitle?.(doc) ?? undefined}
              divider={false}
            />
            {values.length > 0 ? (
              <XStack
                gap="$2"
                flexWrap="wrap">
                {values.map((value) => (
                  <FacetBadge
                    key={value}
                    label={facet?.optionLabel?.(value) ?? value}
                    tint={facet?.tint?.(value)}
                  />
                ))}
              </XStack>
            ) : null}
            <RecordVitals
              tiles={metrics.map((metric) => {
                const value = metricValue(doc, metric.field);
                return {
                  id: metric.field,
                  label: metric.label,
                  value: metric.format ? metric.format(value) : String(value),
                  percent: metric.max ? Math.min((value / metric.max) * 100, 100) : undefined,
                };
              })}
            />
          </RecordHeroIdentityColumn>
        </RecordHeroRow>
      </RecordHeroFrame>

      <YStack
        {...knobProps.gapLg}
        paddingBottom="$6">
        {tabItems.length > 0 ? (
          <Tabs
            defaultValue={tabItems[0]?.value}
            lazyMount
            items={tabItems}
          />
        ) : null}
        <RecordPager
          prev={pagerEntry(prev)}
          next={pagerEntry(next)}
          testID={slug}
        />
      </YStack>
    </Screen>
  );
}

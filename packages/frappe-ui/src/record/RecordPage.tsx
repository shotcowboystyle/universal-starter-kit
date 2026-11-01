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

import { frappeRouteHref } from '../frappe-navigation';
import { metricValue } from '../insights/insights-record';
import type { FrappeInsightsMetric } from '../insights/insights-record';
import { FacetBadge } from '../list/FacetBadge';
import { favoritesKey, useFavorites } from '../list/favorites';
import type { FrappeListFacet } from '../list/list-state';
import { recordTitle } from '../list/record-look';
import type { FrappeRecordLook } from '../list/record-look';

import { adjacentRecords, recordFacetValues, recordHistory } from './record-data';
import type { FrappeRecordSection, FrappeRecordTab } from './record-sections';
import { RecordBars } from './RecordBars';
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

/** A hop from the record to another page of it (the backoffice form). */
export interface FrappeRecordAction<TDoc> {
  label: string;
  icon: ComponentType<{ size?: number }>;
  href: (doc: Partial<TDoc>) => string;
  testID?: string;
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- record and linked rows are DocType-defined; fields are only known from the page config
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

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

/** The favorites store key: a custom key, the doctype's default, or none. */
const favoritesStorageKey = (favorites: boolean | string | undefined, doctype: string): string | undefined => {
  if (favorites === undefined || favorites === false || favorites === '') {
    return undefined;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates the declared `boolean | string` favorites prop
  return typeof favorites === 'string' ? favorites : favoritesKey(doctype);
};

/** What the record look draws for this doc: code, images, slides, subtitle. */
const resolveLook = <TDoc,>(
  look: FrappeRecordLook<TDoc> | undefined,
  doc: Partial<TDoc>,
  baseURL: string | undefined,
) => {
  const images = look?.images?.(doc, baseURL) ?? [];
  return {
    code: look?.code?.(doc),
    images,
    slides: (look?.gallery?.(doc, baseURL) ?? []).filter((slide) => slide.src !== '' && slide.src !== images[0]),
    subtitle: look?.subtitle?.(doc) ?? undefined,
  };
};

/** The record's created / modified stamps as timeline entries. */
const historyEntries = (row: Row, name: string, createdLabel: string): TimelineEntry[] =>
  recordHistory(row).map((entry) =>
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
          content: createdLabel,
          timestamp: entry.timestamp,
        },
  );

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

interface RecordSectionViewProps {
  section: FrappeRecordSection;
  row: Row;
  linked: Record<string, Row[]>;
  slug: string;
}

const RecordSectionView = ({ section, row, linked, slug }: RecordSectionViewProps) => {
  const { knobProps } = useResolvedKnobs();
  const { knobProps: nested } = useResolvedKnobs({ compact: true });
  if (section.kind === 'bars') {
    const tableValue = row[section.table];
    // SAFETY: a child table field holds an array of row objects
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const tableRows = Array.isArray(tableValue) ? (tableValue as Row[]) : [];
    return (
      <RecordBars
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
  if (!hasText(section.title)) {
    return (
      <YStack {...knobProps.gap}>
        {hasText(section.description) ? (
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
      title={section.title}
      description={section.description}
      divider={false}>
      {rows}
    </PageSection>
  );
};

const sectionKey = (section: FrappeRecordSection, index: number): string =>
  section.kind === 'bars' ? `bars-${section.id}` : `rows-${index}`;

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

interface RecordToolbarProps<TDoc> {
  doc: Partial<TDoc>;
  name: string;
  route: string;
  slug: string;
  navigate: (href: string) => void;
  actions: readonly FrappeRecordAction<TDoc>[];
  canEdit: boolean;
  /** The heart shows. */
  showFavorite: boolean;
  favorite: boolean;
  favoriteLabel: string;
  onToggleFavorite: () => void;
}

const RecordToolbar = <TDoc,>({
  doc,
  name,
  route,
  slug,
  navigate,
  actions,
  canEdit,
  showFavorite,
  favorite,
  favoriteLabel,
  onToggleFavorite,
}: RecordToolbarProps<TDoc>) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  return (
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
          {showFavorite || actions.length > 0 ? (
            <XStack
              {...knobProps.borderRadius}
              backgroundColor="$color2"
              alignItems="center">
              {showFavorite ? (
                <Tooltip content={favoriteLabel}>
                  <Button
                    circular
                    chromeless
                    minWidth={knobProps.sizeToken}
                    minHeight={knobProps.sizeToken}
                    onPress={onToggleFavorite}
                    // SAFETY: both are theme color tokens; Button's `col` type does not list theme tokens
                    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
                      // SAFETY: a theme color token; Button's `col` type does not list theme tokens
                      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
};

// ---------------------------------------------------------------------------
// Hero identity
// ---------------------------------------------------------------------------

interface RecordIdentityProps<TDoc> {
  doc: Partial<TDoc>;
  title: string;
  code: string | undefined;
  subtitle: string | undefined;
  tint: string | undefined;
  values: readonly string[];
  facet: FrappeListFacet | undefined;
  metrics: readonly FrappeInsightsMetric[];
}

const RecordIdentity = <TDoc,>({
  doc,
  title,
  code,
  subtitle,
  tint,
  values,
  facet,
  metrics,
}: RecordIdentityProps<TDoc>) => {
  const { knobProps: nested } = useResolvedKnobs({ compact: true });
  return (
    <>
      {hasText(code) ? (
        <Text
          {...nested.label}
          fontWeight="700"
          // SAFETY: both are theme color tokens; Text's `color` type does not list the tint scale
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          color={(hasText(tint) ? `$${tint}11` : '$color11') as never}
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
        subtitle={subtitle}
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
            percent:
              metric.max !== undefined && metric.max !== 0 ? Math.min((value / metric.max) * 100, 100) : undefined,
          };
        })}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * A record page drawn from a record already read: the header with Back,
 * the heart, hops and Edit; the hero; the tabs; the neighbors. The data
 * wrapper (FrappeRecordView) reads the record, its rows and the rights.
 */
export const RecordPage = <TDoc extends { name: string; doctype: string }>({
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
}: RecordPageProps<TDoc>) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  // SAFETY: TDoc is a plain doc object; reading it as an open row only loosens its property types
  const row = doc as Row;
  const name: string = doc.name ?? '';
  const favoritesKeyValue = favoritesStorageKey(favorites, doctype);
  const showFavorite = favoritesKeyValue !== undefined;
  const { isFavorite, toggle } = useFavorites(favoritesKeyValue);

  const title = recordTitle(doc, look, titleField);
  const { code, images, slides, subtitle } = resolveLook(look, doc, baseURL);
  const values = facet ? recordFacetValues(facet, row, linked) : [];
  const tints = values.slice(0, 2).map((value) => facet?.tint?.(value));
  const favorite = showFavorite ? isFavorite(name) : false;
  const favoriteLabel = favorite
    ? t('Remove {{name}} from favorites', { name: title })
    : t('Add {{name}} to favorites', { name: title });

  const { prev, next } = adjacentRecords(listRows, name);
  const pagerEntry = (neighbor: Partial<TDoc> | null): RecordPagerEntry | null => {
    const neighborName = neighbor?.name;
    if (neighbor === null || neighborName === undefined || neighborName === '') {
      return null;
    }
    return {
      title: recordTitle(neighbor, look, titleField),
      code: look?.code?.(neighbor),
      image: look?.images?.(neighbor, baseURL)[0],
      onPress: () => {
        navigate(frappeRouteHref(route, { mode: 'view', name: neighborName }));
      },
    };
  };

  const entries = history ? historyEntries(row, name, t('Created this {{doctype}}', { doctype })) : [];

  const quote = summary?.(doc);
  const tabItems = tabs.map((tab, index) => {
    const count = hasText(tab.count) ? (linked[tab.count] ?? []).length : 0;
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
          {tab.sections.map((section, sectionIndex) => (
            <RecordSectionView
              // Bars key by id; rows sections are a static per-tab config list that never reorders.
              key={sectionKey(section, sectionIndex)}
              section={section}
              row={row}
              linked={linked}
              slug={slug}
            />
          ))}
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

  return (
    <Screen>
      <YStack gap="$2">
        <Breadcrumbs
          items={[{ label: listName, href: route }, { label: hasText(code) ? `${code} ${title}` : title }]}
          onNavigate={(href) => {
            navigate(href);
          }}
        />
        <RecordToolbar
          doc={doc}
          name={name}
          route={route}
          slug={slug}
          navigate={navigate}
          actions={actions}
          canEdit={canEdit}
          showFavorite={showFavorite}
          favorite={favorite}
          favoriteLabel={favoriteLabel}
          onToggleFavorite={() => {
            toggle(name);
          }}
        />
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
            <RecordIdentity
              doc={doc}
              title={title}
              code={code}
              subtitle={subtitle}
              tint={tints[0]}
              values={values}
              facet={facet}
              metrics={metrics}
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
};

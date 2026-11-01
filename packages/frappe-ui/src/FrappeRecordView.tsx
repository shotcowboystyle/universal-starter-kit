import { ArrowLeftIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import type { Order } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
import { EmptyState, Screen, ScreenToolbar, YStack } from '@repo/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocRights } from './formEngine/use-doc-rights';
import type { FrappeConnection } from './frappe-connections';
import { frappeRouteTarget, useFrappeRouter, useRouteLoaderData } from './frappe-navigation';
import { FrappeForm } from './FrappeForm';
import { FrappeNotConfigured } from './FrappeNotConfigured';
import { useFrappeConfig } from './FrappeProvider';
import { orderRows } from './insights/insights-data';
import type { FrappeInsightsMetric } from './insights/insights-record';
import type { FrappeListFacet } from './list/list-state';
import type { FrappeRecordLook } from './list/record-look';
import type { FrappeRecordTab } from './record/record-sections';
import { RecordBreadcrumbBone, RecordSkeleton } from './record/RecordHero';
import { RecordPage } from './record/RecordPage';
import type { FrappeRecordAction, RecordPageProps } from './record/RecordPage';
import { useFrappeConnection, useFrappeRows } from './use-frappe-rows';

export type {
  FrappeRecordBarsSection,
  FrappeRecordRowsSection,
  FrappeRecordSection,
  FrappeRecordTab,
} from './record/record-sections';

export type { FrappeRecordAction } from './record/RecordPage';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- linked rows and docs are read by fieldname; their columns vary per doctype
type Row = Record<string, unknown>;

export interface FrappeRecordViewProps<TDoc extends { name: string; doctype: string }> {
  doctype: string;
  /** The doctype's list route: breadcrumb, Back, Edit and the neighbors hang off it. */
  route: string;
  /** Defaults to the record the route names. */
  name?: string;
  /** The list's title; defaults to the doctype. */
  listTitle?: string;
  /** The record a route loader rendered on the server. */
  initialDoc?: Partial<TDoc>;
  /** The route's loader (`frappeDocLoader`), read through the host's navigation. */
  loader?: (...args: never[]) => Promise<{ doc: Partial<TDoc> | null }>;
  /** The list's read, so the neighbors follow the list's order. */
  fields?: readonly (keyof TDoc & string)[];
  limit?: number;
  orderBy?: { field: keyof TDoc & string; order: Order }[];
  /** Declared connections; defaults to the meta's (a Guest cannot read meta). */
  connections?: readonly FrappeConnection[];
  look?: FrappeRecordLook<TDoc>;
  titleField?: string;
  /** Its values badge the hero and tint it. */
  facet?: FrappeListFacet;
  /** Numeric fields as fact tiles in the hero; `max` adds a bar. */
  metrics?: readonly FrappeInsightsMetric[];
  /** A quote opening the first tab. */
  summary?: (doc: Partial<TDoc>) => { text: string; cite?: string } | undefined;
  tabs?: readonly FrappeRecordTab[];
  /** Star the record: true keys the stars by doctype, a string names the key. */
  favorites?: boolean | string;
  actions?: readonly FrappeRecordAction<TDoc>[];
  /** False leaves the audit trail off the first tab. */
  history?: boolean;
  /** Prefix of the page's test ids; defaults to the doctype's slug. */
  testID?: string;
}

const noTabs: readonly FrappeRecordTab[] = [];
const noMetrics: readonly FrappeInsightsMetric[] = [];
/** Typed `never` so it stands in for any doc type's action list. */
const noActions: readonly never[] = [];

/** The order-by back from its memo key, `JSON.stringify(orderBy ?? null)`. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the caller names the doc type whose fields the order-by keys into
const parseOrderBy = <TDoc,>(key: string): FrappeRecordViewProps<TDoc & { name: string; doctype: string }>['orderBy'] =>
  // SAFETY: the key is the JSON of an `orderBy` prop or null
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  (JSON.parse(key) as FrappeRecordViewProps<TDoc & { name: string; doctype: string }>['orderBy'] | null) ?? undefined;

const RecordWithRights = <TDoc extends { name: string; doctype: string }>({
  doc,
  meta,
  page,
}: {
  doc: Partial<TDoc>;
  meta: Parameters<typeof useDocRights>[1];
  page: Omit<RecordPageProps<TDoc>, 'doc' | 'canEdit'>;
}) => {
  const connection = useFrappeConnection();
  // SAFETY: a Frappe doc is a plain record keyed by fieldname
  const { owner } = doc as Row;
  const { rights } = useDocRights(connection, meta, {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `owner` is the server's user id when present; anything else means unknown
    owner: typeof owner === 'string' ? owner : undefined,
  });
  return (
    <RecordPage<TDoc>
      {...page}
      doc={doc}
      canEdit={rights.write}
    />
  );
};

/**
 * A doctype's record page, read first: the list's breadcrumb and Back, the
 * favorite heart, the record's hops and Edit under the write right; a hero
 * with the record's images, code, title, subtitle, facet badges and metric
 * tiles, tinted by the facet; tabs of linked rows and child-table bars with
 * the audit trail; and the records either side of it in the list's order.
 * FrappeForm reads the record and its connections live; loading, not found
 * and error keep the page's wayfinding.
 */
export const FrappeRecordView = <TDoc extends { name: string; doctype: string }>({
  doctype,
  route,
  name: nameProp,
  listTitle,
  initialDoc,
  loader,
  fields,
  limit,
  orderBy,
  connections,
  look,
  titleField,
  facet,
  metrics = noMetrics,
  summary,
  tabs = noTabs,
  favorites,
  actions = noActions,
  history = true,
  testID,
}: FrappeRecordViewProps<TDoc>) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const config = useFrappeConfig();
  const connection = useFrappeConnection();
  const router = useFrappeRouter();
  const target = router ? frappeRouteTarget(route, router.pathname) : undefined;
  const name = nameProp ?? (target?.mode === 'view' ? target.name : '');
  const slug = testID ?? doctype.toLowerCase().replaceAll(/\s+/gu, '-');
  // SAFETY: useRouteLoaderData returns what `loader` resolved, typed by the prop as { doc }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const loaded = useRouteLoaderData(loader) as { doc?: Partial<TDoc> | null } | undefined;
  const listName = listTitle ?? doctype;
  const navigate = (href: string) => router?.navigate(href);

  const orderKey = JSON.stringify(orderBy ?? null);
  const readOptions = useMemo(
    () => ({ fields, limit, orderBy: parseOrderBy<TDoc>(orderKey) }),
    [fields, limit, orderKey],
  );
  const { rows: readRows } = useFrappeRows<TDoc>(connection, doctype, readOptions);
  const listRows = useMemo(() => {
    // SAFETY: Frappe docs are plain records; orderRows reorders the same objects without reshaping them
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const rows = readRows as never[];
    // SAFETY: as above, the ordered rows are the read docs
    return orderRows(rows, parseOrderBy(orderKey)) as Partial<TDoc>[];
  }, [readRows, orderKey]);

  const hasBaseURL = config?.baseURL !== undefined && config.baseURL !== '';
  if (!hasBaseURL && !config?.fixtures) {
    return (
      <FrappeNotConfigured
        doctype={doctype}
        page
      />
    );
  }

  const backButton = (
    <ScreenToolbar
      leading={
        <Button
          outlined
          minHeight={knobProps.sizeToken}
          onPress={() => navigate(route)}
          icon={<ArrowLeftIcon size={16} />}
          testID={`${slug}-detail-back`}>
          {t('Back')}
        </Button>
      }
    />
  );

  return (
    <FrappeForm<TDoc>
      doctype={doctype}
      name={name}
      initialDoc={initialDoc ?? loaded?.doc ?? undefined}
      connections={connections}
      showToolbar={false}
      showSidebar={false}
      showTimeline={false}
      loadingFallback={
        <Screen>
          <YStack gap="$2">
            <RecordBreadcrumbBone />
            {backButton}
          </YStack>
          <RecordSkeleton testID={`${slug}-detail-skeleton`} />
        </Screen>
      }
      notFoundFallback={
        <Screen scroll={false}>
          {backButton}
          <EmptyState
            title={t('{{doctype}} not found', { doctype })}
            description={t('No {{doctype}} is named {{name}}.', { doctype, name })}
            action={
              <Button
                theme="accent"
                onPress={() => navigate(route)}>
                {t('Back to {{title}}', { title: listName })}
              </Button>
            }
          />
        </Screen>
      }
      errorFallback={
        <Screen scroll={false}>
          {backButton}
          <EmptyState
            intent="error"
            title={t("Couldn't load this {{doctype}}", { doctype })}
            description={t('Check the connection and try again.')}
          />
        </Screen>
      }>
      {({ doc, connections: linked, meta }) => (
        <RecordWithRights
          doc={doc}
          meta={meta}
          page={{
            // SAFETY: FrappeForm hands each declared connection's rows over keyed by doctype
            linked: linked as Record<string, Row[]>,
            doctype,
            route,
            listName,
            listRows,
            look,
            titleField: titleField ?? meta?.title_field,
            facet,
            metrics,
            summary,
            tabs,
            favorites,
            actions,
            history,
            slug,
            baseURL: config?.baseURL,
            navigate,
          }}
        />
      )}
    </FrappeForm>
  );
};

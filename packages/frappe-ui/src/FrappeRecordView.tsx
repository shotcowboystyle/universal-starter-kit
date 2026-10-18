import { ArrowLeftIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import type { Order } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
import { EmptyState, Screen, ScreenToolbar, YStack } from '@repo/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocRights } from './formEngine/useDocRights';
import type { FrappeConnection } from './frappeConnections';
import { FrappeForm } from './FrappeForm';
import { frappeRouteTarget, useFrappeRouter, useRouteLoaderData } from './frappeNavigation';
import { FrappeNotConfigured } from './FrappeNotConfigured';
import { useFrappeConfig } from './FrappeProvider';
import { orderRows } from './insights/insightsData';
import type { FrappeInsightsMetric } from './insights/insightsRecord';
import type { FrappeListFacet } from './list/listState';
import type { FrappeRecordLook } from './list/recordLook';
import { RecordBreadcrumbBone, RecordSkeleton } from './record/RecordHero';
import { RecordPage } from './record/RecordPage';
import type { FrappeRecordAction, RecordPageProps } from './record/RecordPage';
import type { FrappeRecordTab } from './record/recordSections';
import { useFrappeConnection, useFrappeRows } from './useFrappeRows';

export type {
  FrappeRecordBarsSection,
  FrappeRecordRowsSection,
  FrappeRecordSection,
  FrappeRecordTab,
} from './record/recordSections';

export type { FrappeRecordAction } from './record/RecordPage';

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

/**
 * A doctype's record page, read first: the list's breadcrumb and Back, the
 * favorite heart, the record's hops and Edit under the write right; a hero
 * with the record's images, code, title, subtitle, facet badges and metric
 * tiles, tinted by the facet; tabs of linked rows and child-table bars with
 * the audit trail; and the records either side of it in the list's order.
 * FrappeForm reads the record and its connections live; loading, not found
 * and error keep the page's wayfinding.
 */
export function FrappeRecordView<TDoc extends { name: string; doctype: string }>({
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
  metrics = [],
  summary,
  tabs = noTabs,
  favorites,
  actions = [],
  history = true,
  testID,
}: FrappeRecordViewProps<TDoc>) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const config = useFrappeConfig();
  const connection = useFrappeConnection();
  const router = useFrappeRouter();
  const target = router ? frappeRouteTarget(route, router.pathname) : undefined;
  const name = nameProp ?? (target?.mode === 'view' ? target.name : '');
  const slug = testID ?? doctype.toLowerCase().replaceAll(/\s+/g, '-');
  const loaded = useRouteLoaderData(loader) as { doc?: Partial<TDoc> | null } | undefined;
  const listName = listTitle ?? doctype;
  const navigate = (href: string) => router?.navigate(href);

  const orderKey = JSON.stringify(orderBy ?? null);
  const readOptions = useMemo(() => ({ fields, limit, orderBy: JSON.parse(orderKey) }), [fields, limit, orderKey]);
  const { rows: readRows } = useFrappeRows<TDoc>(connection, doctype, readOptions);
  const listRows = useMemo(
    () => orderRows(readRows as never[], JSON.parse(orderKey)) as Partial<TDoc>[],
    [readRows, orderKey],
  );

  if (!config?.baseURL && !config?.fixtures) {
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
}

function RecordWithRights<TDoc extends { name: string; doctype: string }>({
  doc,
  meta,
  page,
}: {
  doc: Partial<TDoc>;
  meta: Parameters<typeof useDocRights>[1];
  page: Omit<RecordPageProps<TDoc>, 'doc' | 'canEdit'>;
}) {
  const connection = useFrappeConnection();
  const { owner } = doc as Row;
  const { rights } = useDocRights(connection, meta, {
    owner: typeof owner === 'string' ? owner : undefined,
  });
  return (
    <RecordPage<TDoc>
      {...page}
      doc={doc}
      canEdit={Boolean(rights.write)}
    />
  );
}

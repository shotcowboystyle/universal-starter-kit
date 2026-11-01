import { useResolvedKnobs } from '@repo/theme';
import { AsyncBoundary, ImageGrid, List } from '@repo/ui';
import type { ImageGridProps, ListProps } from '@repo/ui';
import type React from 'react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { YStack } from 'tamagui';

import { useFrappeConfig } from './FrappeProvider';
import type { FrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { isPermissionError } from './live-errors';
import { useFrappePagination } from './use-frappe-pagination';
import type { UseFrappePaginationOptions } from './use-frappe-pagination';

export interface FrappeListProps<TDoc extends { name: string; doctype: string }> extends Omit<
  ListProps<Partial<TDoc>>,
  // oxlint-disable-next-line sonarjs/max-union-size -- the list of List props this wrapper supplies itself
  'items' | 'onLoadMore' | 'hasMore' | 'renderItem'
> {
  /** Custom render function for each item. */
  renderItem: (item: Partial<TDoc>, index: number) => React.ReactNode;
  baseURL?: string;
  auth?: FrappeConfig['auth'];
  syncOptions?: FrappeConfig['syncOptions'];
  doctype: string;
  fields?: readonly (keyof TDoc & string)[];
  filters?: UseFrappePaginationOptions<TDoc>['filters'];
  /** Rows the subscription reads; omitted, the bench's page length (20) applies. */
  limit?: number;
  orderBy?: UseFrappePaginationOptions<TDoc>['orderBy'];
  /** Server-rendered rows for this same query, shown until the first sync lands. */
  initialRows?: readonly Partial<TDoc>[];
  /** Page size for progressive loading (default 20). */
  pageSize?: number;
  /**
   * `grid` lays the rows out as cards through the catalog ImageGrid;
   * `renderItem` then draws one card. Loading, error and empty stay the
   * same states in both layouts.
   */
  layout?: 'list' | 'grid';
  /** Grid layout: column count, tile rung and media aspect of the cards. */
  gridProps?: Pick<ImageGridProps<Partial<TDoc>>, 'columns' | 'tileSize' | 'mediaAspect'>;
  /** Replaces the default empty message when the doctype has no rows to show. */
  emptyState?: React.ReactNode;
  /** Error-state retry, e.g. a remount that starts one fresh sync. */
  onRetry?: () => void;
}

/** Merges the per-list connection props over the FrappeProvider config. */
const useListConnectionConfig = (
  baseURL: string | undefined,
  auth: FrappeConfig['auth'],
  syncOptions: FrappeConfig['syncOptions'],
) => {
  const config = useFrappeConfig();
  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  // Fixtures answer every read locally, so they stand in for a baseURL.
  if ((finalBaseURL === undefined || finalBaseURL === '') && !config?.fixtures) {
    throw new Error('FrappeList requires baseURL prop or FrappeProvider with baseURL or fixtures');
  }

  return useMemo(
    () => ({
      baseURL: finalBaseURL,
      socketPort: config?.socketPort,
      siteName: config?.siteName,
      socketBaseURL: config?.socketBaseURL,
      auth: finalAuth,
      syncOptions: finalSyncOptions,
      realtime: config?.realtime,
      fixtures: config?.fixtures,
    }),
    [
      finalBaseURL,
      config?.socketPort,
      config?.siteName,
      config?.socketBaseURL,
      config?.realtime,
      finalAuth,
      finalSyncOptions,
      config?.fixtures,
    ],
  );
};

/**
 * Thin Frappe wrapper around the generic List component.
 *
 * Internally bridges VirtualPageManager's cursor-based pagination
 * to the generic `onLoadMore` / `hasMore` interface via
 * `useFrappePagination`, so consumers never deal with cursors.
 */
export const FrappeList = <TDoc extends { name: string; doctype: string }>({
  baseURL,
  auth,
  syncOptions,
  doctype,
  fields,
  filters,
  limit,
  orderBy,
  initialRows,
  pageSize,
  renderItem,
  layout = 'list',
  gridProps,
  emptyState,
  onRetry,
  ...listProps
}: FrappeListProps<TDoc>) => {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const connectionConfig = useListConnectionConfig(baseURL, auth, syncOptions);

  // Bridge VirtualPageManager pagination to generic onLoadMore/hasMore.
  // Live updates flow through the same collection: doc_update patches the
  // item in place, doc_deleted evicts it, creates insert per sort order.
  const { items, isLoading, onLoadMore, hasMore, error } = useFrappePagination<TDoc>(connectionConfig, doctype, {
    fields,
    filters,
    pageSize,
    limit,
    orderBy,
    // SAFETY: seed rows are the same query's server-rendered docs; the collection treats them as partial rows until sync lands
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    initialRows: initialRows as readonly TDoc[],
  });

  const itemIndex = useMemo(() => new Map<Partial<TDoc>, number>(items.map((item, index) => [item, index])), [items]);
  const renderCard = useCallback(
    // oxlint-disable-next-line typescript/promise-function-async -- returns a ReactNode, whose React 19 union merely includes Promise
    (item: Partial<TDoc>) => renderItem(item, itemIndex.get(item) ?? 0),
    [renderItem, itemIndex],
  );

  // Honest error state: a permission/network failure must not masquerade
  // as an empty list (DG-ST-01).
  if (error) {
    return (
      <AsyncBoundary
        layout={layout === 'grid' ? 'generic' : 'list'}
        error={error}
        onRetry={onRetry}
        errorTitle={
          isPermissionError(error)
            ? t('You do not have permission to view {{doctype}}', { doctype })
            : t('Error loading {{doctype}}', { doctype })
        }
      />
    );
  }

  const showEmptyState = !isLoading && items.length === 0 && Boolean(emptyState);
  let content: React.ReactNode;
  if (showEmptyState) {
    content = emptyState;
  } else if (layout === 'grid') {
    content = (
      <ImageGrid
        items={items}
        isLoading={isLoading}
        renderItem={renderCard}
        // oxlint-disable-next-line react/jsx-handler-names -- forwards the consumer's own onItemClick prop unchanged
        onItemClick={listProps.onItemClick}
        onLoadMore={onLoadMore}
        hasMore={hasMore}
        emptyMessage={listProps.emptyMessage ?? t('No {{doctype}} records found', { doctype })}
        testID={listProps.testID}
        {...gridProps}
      />
    );
  } else {
    content = (
      <List
        items={items}
        isLoading={isLoading}
        renderItem={renderItem}
        onLoadMore={onLoadMore}
        hasMore={hasMore}
        emptyMessage={t('No {{doctype}} records found', { doctype })}
        {...listProps}
      />
    );
  }

  return (
    <YStack
      {...knobProps.gap}
      flex={layout === 'grid' ? undefined : 1}>
      <FrappeReconnectIndicator config={connectionConfig} />
      {/*
        No chrome fragment rides this passthrough (LC-55 FRAGMENT-LICENSE):
        List forwards its stack props straight to AsyncBoundary, a state-switch
        wrapper that declares no surface class and paints no fill, border, or
        clip. Rows and the error/empty panels own their own chrome; the error
        branch above renders a bare AsyncBoundary, so both paths now match.
      */}
      {content}
    </YStack>
  );
};

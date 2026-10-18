import { Button, isWeb, Text, XStack, YStack } from 'tamagui';

import { toDoFixtureData, useStoryConfig } from '../tests/storyFixtures';
import type { ToDo } from '../tests/storyFixtures';

import { useFrappeInfiniteList } from './frappe-react';
import type { UseFrappeCollectionConfig } from './frappe-react';
import { Order } from './sync/types';

export default {
  title: 'Frappe/useFrappeInfiniteList',
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Cursor-paged list over a progressive SyncModule subscription: items, hasMore, isLoading / isLoadingMore, loadMore(), refresh(), and a sentinelRef that loads the next page when its element scrolls into view (IntersectionObserver, web only). The probe pages 57 fixture ToDos ten at a time. Network-hermetic (G-15/D-05): config.fixtures is an InMemoryFixtureProvider and the cursor path runs through FixtureDbModule.getListWithCursor, so nothing is fetched.',
      },
    },
  },
};

interface ProbeProps {
  config: UseFrappeCollectionConfig | undefined;
  pageSize: number;
  /** Attach sentinelRef to a trailing element so pages load as you scroll (web only). */
  sentinel?: boolean;
}

const InfiniteProbe = ({ config, pageSize, sentinel = false }: ProbeProps) => {
  const { items, hasMore, isLoading, isLoadingMore, error, totalLoaded, loadMore, refresh, sentinelRef } =
    useFrappeInfiniteList<ToDo>({
      config,
      doctype: 'ToDo',
      pageSize,
      orderBy: { field: 'name', order: Order.Asc },
    });
  return (
    <YStack
      gap="$3"
      data-testid="infinite-probe">
      <Text fontWeight="600">useFrappeInfiniteList({`{ doctype: "ToDo", pageSize: ${pageSize} }`})</Text>
      <Text
        fontSize="$2"
        data-testid="infinite-status">
        loaded {totalLoaded} · hasMore {String(hasMore)} · isLoading {String(isLoading)} · isLoadingMore{' '}
        {String(isLoadingMore)}
        {error ? ` · error: ${error.message}` : ''}
        {config ? '' : ' · no config, so nothing subscribes'}
      </Text>
      <XStack
        gap="$2"
        flexWrap="wrap">
        <Button
          size="$2"
          onPress={() => {
            void loadMore();
          }}
          disabled={!hasMore || isLoadingMore || !config}>
          Load more
        </Button>
        <Button
          size="$2"
          onPress={() => {
            void refresh();
          }}
          disabled={!config}>
          Refresh
        </Button>
      </XStack>
      <YStack gap="$1">
        {items.map((row) => (
          <XStack
            key={row.name}
            gap="$3"
            alignItems="center"
            data-testid={`row-${row.name}`}>
            <Text
              fontSize="$2"
              width={120}>
              {row.name}
            </Text>
            <Text
              fontSize="$2"
              flex={1}>
              {row.description}
            </Text>
            <Text
              fontSize="$2"
              width={90}>
              {row.status}
            </Text>
          </XStack>
        ))}
        {sentinel && isWeb ? (
          <div
            ref={sentinelRef}
            data-testid="infinite-sentinel"
            style={{ height: 1 }}
          />
        ) : null}
        {!hasMore && items.length > 0 ? (
          <Text
            fontSize="$2"
            color="$color10">
            End of list.
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
};

/** 57 rows, ten per page; Load more walks the cursor until hasMore is false. */
export const Main = () => {
  const config = useStoryConfig(toDoFixtureData(57, { scripted: false }));
  return (
    <InfiniteProbe
      config={config}
      pageSize={10}
    />
  );
};
Main.storyName = 'Main';

/** Same list with sentinelRef attached: scroll to the bottom and the next page loads by itself (web). */
export const SentinelAutoLoad = () => {
  const config = useStoryConfig(toDoFixtureData(57, { scripted: false }));
  return (
    <InfiniteProbe
      config={config}
      pageSize={10}
      sentinel
    />
  );
};

/** Fewer rows than one page: hasMore is false after the first load. */
export const SinglePage = () => {
  const config = useStoryConfig(toDoFixtureData(8, { scripted: false }));
  return (
    <InfiniteProbe
      config={config}
      pageSize={20}
    />
  );
};

/** No config: the hook stays in its initial loading state and never subscribes. */
export const WithoutConfig = () => (
  <InfiniteProbe
    config={undefined}
    pageSize={10}
  />
);

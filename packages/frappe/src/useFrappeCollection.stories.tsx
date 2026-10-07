import { useState } from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';

import { toDoFixtureData, useStoryConfig } from '../tests/storyFixtures';
import type { ToDo, ToDoStatus } from '../tests/storyFixtures';

import type { FrappeCollectionOptionsConfig } from './collection';
import { useFrappeCollection } from './frappeReact';
import type { UseFrappeCollectionConfig } from './frappeReact';
import { Order } from './sync/types';
import { useLiveQuery } from './useLiveQuery';

export default {
  title: 'Frappe/useFrappeCollection',
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "The SDK's main React entry point: useFrappeCollection(config, doctype, options) returns a TanStack DB collection kept in sync by the SyncModule, and useLiveQuery reads it. Writes go through collection.insert / update / delete, apply optimistically, and are journaled by the engine. The probe prints the collection status, the live-query state and the rows, with buttons that write through the collection. Network-hermetic (G-15/D-05): config.fixtures is an InMemoryFixtureProvider, so the same SyncModule pipeline runs over in-memory documents and nothing is fetched.",
      },
    },
  },
};

type ProbeOptions = Omit<FrappeCollectionOptionsConfig<ToDo>, 'sync'>;

interface ProbeProps {
  config: UseFrappeCollectionConfig | undefined;
  doctype?: string;
  options?: ProbeOptions;
}

const nextStatus: Record<ToDoStatus, ToDoStatus> = {
  Open: 'Working',
  Working: 'Completed',
  Completed: 'Open',
  Cancelled: 'Open',
};

function swallow(tx: { isPersisted: { promise: Promise<unknown> } }) {
  tx.isPersisted.promise.catch(() => {});
}

function CollectionProbe({ config, doctype = 'ToDo', options }: ProbeProps) {
  const collection = useFrappeCollection<ToDo>(config, doctype, options);
  const { data, isReady, isLoading } = useLiveQuery(
    (q) => (collection ? q.from({ todo: collection }) : null),
    [collection],
  );
  const [inserted, setInserted] = useState(0);
  const rows = (data as ToDo[] | undefined) ?? [];

  const insert = () => {
    if (!collection) {
      return;
    }
    const n = inserted + 1;
    setInserted(n);
    swallow(
      collection.insert({
        name: `TODO-NEW-${String(n).padStart(3, '0')}`,
        doctype,
        description: `Added from the story (#${n})`,
        status: 'Open',
        priority: 'Medium',
        date: '2026-09-05',
        modified: '2026-09-05 12:00:00',
      }),
    );
  };
  const advanceFirst = () => {
    const first = rows[0];
    if (!collection || !first) {
      return;
    }
    swallow(
      collection.update(first.name, (draft) => {
        draft.status = nextStatus[first.status];
      }),
    );
  };
  const removeLast = () => {
    const last = rows.at(-1);
    if (!collection || !last) {
      return;
    }
    swallow(collection.delete(last.name));
  };

  return (
    <YStack
      gap="$3"
      data-testid="collection-probe">
      <Text fontWeight="600">
        useFrappeCollection(config, "{doctype}"{options ? ', options' : ''}) + useLiveQuery
      </Text>
      <Text
        fontSize="$2"
        data-testid="collection-status">
        collection: {collection ? collection.status : '(undefined, no config)'} · live query:{' '}
        {isLoading ? 'loading' : isReady ? 'ready' : 'idle'} · rows: {rows.length}
      </Text>
      <XStack
        gap="$2"
        flexWrap="wrap">
        <Button
          size="$2"
          onPress={insert}
          disabled={!collection}>
          Insert
        </Button>
        <Button
          size="$2"
          onPress={advanceFirst}
          disabled={!rows.length}>
          Advance first row's status
        </Button>
        <Button
          size="$2"
          onPress={removeLast}
          disabled={!rows.length}>
          Delete last row
        </Button>
      </XStack>
      <YStack gap="$1">
        {rows.map((row) => (
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
            <Text
              fontSize="$2"
              width={70}>
              {row.priority}
            </Text>
            <Text
              fontSize="$2"
              width={90}>
              {row.date}
            </Text>
          </XStack>
        ))}
        {collection && isReady && rows.length === 0 ? (
          <Text
            fontSize="$2"
            color="$color10">
            No documents match.
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}

/** Eight ToDos from fixtures; insert, update and delete through the collection. */
export const Main = () => {
  const config = useStoryConfig(toDoFixtureData(8, { scripted: false }));
  return <CollectionProbe config={config} />;
};
Main.storyName = 'Main';

/** filters, orderBy and limit are passed to the subscription: only Open rows, by date, at most four. */
export const Filtered = () => {
  const config = useStoryConfig(toDoFixtureData(12, { scripted: false }));
  return (
    <CollectionProbe
      config={config}
      options={{
        filters: [['status', '=', 'Open']],
        orderBy: { field: 'date', order: Order.Asc },
        limit: 4,
      }}
    />
  );
};

/** A doctype with no fixture rows: the collection still reaches ready, with zero rows. */
export const EmptyDoctype = () => {
  const config = useStoryConfig(toDoFixtureData(8, { scripted: false }));
  return (
    <CollectionProbe
      config={config}
      doctype="Note"
    />
  );
};

/** No config (no provider above the consumer): the hook returns undefined and nothing syncs. */
export const WithoutConfig = () => <CollectionProbe config={undefined} />;

import { useEffect, useState } from 'react';
import { Button, isWeb, Text, XStack, YStack } from 'tamagui';

import {
  HANGING_TODO,
  REJECTED_TODO,
  toDoFixtureData,
  useSeededJournal,
  useStoryConfig,
} from '../../tests/story-fixtures';
import type { ToDo, ToDoStatus } from '../../tests/story-fixtures';
import { useFrappeCollection } from '../frappe-react';
import type { SyncModule } from '../sync';
import type { FrappeDebugState } from '../sync/types';
import { useLiveQuery } from '../use-live-query';

import { FrappeDevtoolsPanel } from './FrappeDevtoolsPanel';

export default {
  title: 'Frappe/FrappeDevtoolsPanel',
  component: FrappeDevtoolsPanel,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "The Frappe tab of the TanStack Devtools shell: subscriptions in the sidebar, Pages / Cache / Mutations tabs and a stats bar, all read from SyncModule.__debug() and refreshed on every store emit. Plain DOM with its own light and dark palette (devtools/theme.ts), so it follows the shell's theme prop, never the app knobs. Stories are network-hermetic (G-15/D-05): the SyncModule runs over an InMemoryFixtureProvider, one ToDo subscription is opened through useFrappeCollection, and two scripted documents put a Pending and a Failed entry in the journal next to a Confirmed one. Nothing is fetched. On native the panel has no DOM to render into, so the story prints the same debug counts as text.",
      },
    },
  },
  argTypes: {
    devtoolsTheme: { control: 'radio', options: ['light', 'dark'] },
  },
};

type DevtoolsTheme = 'light' | 'dark';

const useDebugState = (syncModule: SyncModule | undefined): FrappeDebugState | undefined => {
  const [state, setState] = useState<FrappeDebugState | undefined>();
  useEffect(() => {
    if (!syncModule) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on the other path; a bare return trips consistent-return
      return undefined;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- re-snapshot when syncModule changes; __debug() returns a fresh object per call, so useSyncExternalStore would loop
    setState(syncModule.__debug());
    return syncModule.subscribeStore(() => {
      setState(syncModule.__debug());
    });
  }, [syncModule]);
  return state;
};

/** What the panel would show, as text, for platforms without a DOM. */
const DebugSummary = ({ syncModule }: { syncModule: SyncModule }) => {
  const state = useDebugState(syncModule);
  if (!state) {
    return null;
  }
  const { subscriptions, normalizedCache, mutationJournal } = state;
  return (
    <YStack
      gap="$1"
      data-testid="devtools-summary">
      <Text fontSize="$2">
        subscriptions {subscriptions.length}
        {subscriptions.map((sub) => ` · ${sub.query.doctype} (${sub.docCount} docs)`).join('')}
      </Text>
      <Text fontSize="$2">
        cache {normalizedCache.size} docs
        {normalizedCache.doctypes.map((d) => ` · ${d.doctype} ${d.count}`).join('')}
      </Text>
      <Text fontSize="$2">
        mutations pending {mutationJournal.pending.length} · confirmed {mutationJournal.confirmed.length} · failed{' '}
        {mutationJournal.failed.length}
      </Text>
    </YStack>
  );
};

const PanelFrame = ({
  syncModule,
  devtoolsTheme,
  height = 440,
}: {
  syncModule: SyncModule;
  devtoolsTheme: DevtoolsTheme;
  height?: number;
}) => {
  if (!isWeb) {
    return (
      <YStack gap="$2">
        <Text
          fontSize="$2"
          color="$color10">
          FrappeDevtoolsPanel is plain DOM inside the TanStack Devtools shell, which only exists on web. The SyncModule
          behind it is live here too:
        </Text>
        <DebugSummary syncModule={syncModule} />
      </YStack>
    );
  }
  return (
    <div
      data-testid="devtools-panel-host"
      style={{
        height,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid rgba(128, 128, 128, 0.35)',
      }}>
      <FrappeDevtoolsPanel
        syncModule={syncModule}
        devtoolsTheme={devtoolsTheme}
      />
    </div>
  );
};

interface HostProps {
  devtoolsTheme: DevtoolsTheme;
  // oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype, not a task marker
  /** Open the ToDo subscription (a sidebar row and cached documents). */
  subscribe?: boolean;
  /** Seed one Confirmed, one Pending and one Failed journal entry once the subscription is ready. */
  seed?: boolean;
}

const PanelHost = ({ devtoolsTheme, subscribe = true, seed = true }: HostProps) => {
  const config = useStoryConfig(toDoFixtureData());
  const collection = useFrappeCollection<ToDo>(subscribe ? config : undefined, 'ToDo');
  const { isReady } = useLiveQuery((q) => (collection ? q.from({ todo: collection }) : null), [collection]);
  const syncModule: SyncModule | undefined = useSeededJournal(config, isReady, seed);
  if (!syncModule) {
    return <Text fontSize="$2">No SyncModule: getFrappeSyncModule() returns undefined during server rendering.</Text>;
  }
  return (
    <PanelFrame
      syncModule={syncModule}
      devtoolsTheme={devtoolsTheme}
    />
  );
};

const nextStatus: Record<ToDoStatus, ToDoStatus> = {
  Open: 'Working',
  Working: 'Completed',
  Completed: 'Open',
  Cancelled: 'Open',
};

const swallow = async (tx: { isPersisted: { promise: Promise<unknown> } }): Promise<void> => {
  try {
    await tx.isPersisted.promise;
  } catch {
    // Safe to ignore: a rejected write is reported by the journal, not by an unhandled rejection.
  }
};

/** Drives the collection from buttons so the panel's tabs move while you watch. */
const InteractiveHost = () => {
  const config = useStoryConfig(toDoFixtureData(5));
  const collection = useFrappeCollection<ToDo>(config, 'ToDo');
  const { data, isReady } = useLiveQuery((q) => (collection ? q.from({ todo: collection }) : null), [collection]);
  const syncModule: SyncModule | undefined = useSeededJournal(config, isReady, false);
  const [devtoolsTheme, setDevtoolsTheme] = useState<DevtoolsTheme>('light');
  const [inserted, setInserted] = useState(0);
  const rows = (data as ToDo[] | undefined) ?? [];

  const update = (name: string) => {
    const row = rows.find((r) => r.name === name);
    if (!collection || row === undefined) {
      return;
    }
    void swallow(
      collection.update(name, (draft) => {
        draft.status = nextStatus[row.status];
      }),
    );
  };
  const insert = () => {
    if (!collection) {
      return;
    }
    const n = inserted + 1;
    setInserted(n);
    void swallow(
      collection.insert({
        name: `TODO-NEW-${String(n).padStart(3, '0')}`,
        doctype: 'ToDo',
        description: `Added from the story (#${n})`,
        status: 'Open',
        priority: 'Medium',
        date: '2026-09-05',
        modified: '2026-09-05 12:00:00',
      }),
    );
  };
  const removeLast = () => {
    const last = rows.at(-1);
    if (!collection || last === undefined) {
      return;
    }
    void swallow(collection.delete(last.name));
  };

  if (!syncModule) {
    return null;
  }
  return (
    <YStack gap="$3">
      <XStack
        gap="$2"
        flexWrap="wrap">
        <Button
          size="$2"
          onPress={() => {
            update('TODO-0002');
          }}
          disabled={!isReady}>
          Update TODO-0002 (confirms)
        </Button>
        <Button
          size="$2"
          onPress={() => {
            update(HANGING_TODO);
          }}
          disabled={!isReady}>
          Update {HANGING_TODO} (stays pending)
        </Button>
        <Button
          size="$2"
          onPress={() => {
            update(REJECTED_TODO);
          }}
          disabled={!isReady}>
          Update {REJECTED_TODO} (fails)
        </Button>
        <Button
          size="$2"
          onPress={insert}
          disabled={!isReady}>
          Insert
        </Button>
        <Button
          size="$2"
          onPress={removeLast}
          disabled={!rows.length}>
          Delete last
        </Button>
        <Button
          size="$2"
          onPress={() => {
            setDevtoolsTheme((t) => (t === 'light' ? 'dark' : 'light'));
          }}>
          Theme: {devtoolsTheme}
        </Button>
      </XStack>
      <Text
        fontSize="$2"
        color="$color10"
        data-testid="interactive-rows">
        {rows.map((r) => `${r.name}=${r.status}`).join(' · ') || 'no rows yet'}
      </Text>
      <PanelFrame
        syncModule={syncModule}
        devtoolsTheme={devtoolsTheme}
        height={400}
      />
    </YStack>
  );
};

/** One subscription, cached documents, and Confirmed + Pending + Failed journal entries, light palette. */
export const Main = () => <PanelHost devtoolsTheme="light" />;
Main.storyName = 'Main';

/** Same state under the shell's dark theme prop. */
export const Dark = () => <PanelHost devtoolsTheme="dark" />;

/** A SyncModule nobody has subscribed through yet: empty sidebar, empty cache, empty journal. */
export const Empty = () => (
  <PanelHost
    devtoolsTheme="light"
    subscribe={false}
    seed={false}
  />
);

/** Buttons drive inserts, updates and deletes through the collection; watch the tabs move. */
export const Interactive = () => <InteractiveHost />;

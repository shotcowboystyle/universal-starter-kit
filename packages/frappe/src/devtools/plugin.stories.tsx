import { useState } from 'react';
import { isWeb, Text, YStack } from 'tamagui';

import { toDoFixtureData, useSeededJournal, useStoryConfig } from '../../tests/story-fixtures';
import type { ToDo } from '../../tests/story-fixtures';
import { useFrappeCollection } from '../frappe-react';
import type { SyncModule } from '../sync';
import { useLiveQuery } from '../use-live-query';

import { frappeDevtoolsPlugin } from './plugin';

export default {
  title: 'Frappe/frappeDevtoolsPlugin',
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "The plugin factory core hands to the TanStack Devtools shell (MPO-8): frappeDevtoolsPlugin(syncModule) returns { id: 'frappe', name: 'Frappe', render }. The shell lists id/name in its tab strip and calls render(hostElement, { theme }) when the tab opens; render returns the FrappeDevtoolsPanel element bound to that SyncModule. The story calls render the same way, with a real host element and the shell's theme prop. Network-hermetic (G-15/D-05): the SyncModule runs over an InMemoryFixtureProvider with one ToDo subscription and a seeded journal; nothing is fetched. On native there is no shell, so the story shows what the shell would list.",
      },
    },
  },
};

const PluginHost = ({ theme }: { theme: 'light' | 'dark' }) => {
  const config = useStoryConfig(toDoFixtureData());
  const collection = useFrappeCollection<ToDo>(config, 'ToDo');
  const { isReady } = useLiveQuery((q) => (collection ? q.from({ todo: collection }) : null), [collection]);
  const syncModule: SyncModule | undefined = useSeededJournal(config, isReady);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  if (!syncModule) {
    return <Text fontSize="$2">No SyncModule: getFrappeSyncModule() returns undefined during server rendering.</Text>;
  }
  const plugin = frappeDevtoolsPlugin(syncModule);
  return (
    <YStack gap="$2">
      <Text
        fontSize="$2"
        data-testid="plugin-identity">
        plugin.id = {plugin.id} · plugin.name = {plugin.name} · theme = {theme}
      </Text>
      {isWeb ? (
        <div
          ref={setHost}
          data-testid="devtools-plugin-host"
          style={{
            height: 440,
            borderRadius: 6,
            overflow: 'hidden',
            border: '1px solid rgba(128, 128, 128, 0.35)',
          }}>
          {host ? plugin.render(host, { theme }) : null}
        </div>
      ) : (
        <Text
          fontSize="$2"
          color="$color10">
          render() returns the DOM panel for the TanStack Devtools shell, which only exists on web. The id and name
          above are what the shell lists.
        </Text>
      )}
    </YStack>
  );
};

/** render(host, { theme: "light" }), the way the shell opens the tab. */
export const Main = () => <PluginHost theme="light" />;
Main.storyName = 'Main';

/** The same plugin rendered with the shell's dark theme prop. */
export const Dark = () => <PluginHost theme="dark" />;

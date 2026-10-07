import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import { useResolvedKnobs } from '@repo/theme';
import { useState } from 'react';
import { XStack, YStack } from 'tamagui';

import { createRosterFixtures, rosterPokemonFields, rosterPokemonMeta } from '../tests/fixtures/pokemonRoster';
import type { RosterPokemon } from '../tests/fixtures/pokemonRoster';

import type { FrappeConnection } from './frappeConnections';
import { FrappeListView } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';

export default {
  title: 'FrappeUI/FrappeListView Connections',
  component: FrappeListView,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'A four-part filter on a connection, `[doctype, field, operator, value]`, narrows the list to the records whose linked rows match: Pokemon by `Pokemon Poke Type.poke_type`. The junction is a standalone doctype with a `pokemon` Link, so FrappeListView reads its matching rows and filters on their names; the story holds no collection of its own. Rows come from the pokemon fixtures.',
      },
    },
  },
};

const host = 'https://listview-connections.mock.test';

(() => {
  const w = window as unknown as Record<string, unknown>;
  if (w.__frappeListViewConnectionsMockFetch) {
    return;
  }
  w.__frappeListViewConnectionsMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(host)) {
      const body = url.includes('/api/resource/DocType/') ? { data: rosterPokemonMeta } : { data: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const pokemonConnections: FrappeConnection[] = [{ doctype: 'Pokemon Poke Type', fieldname: 'pokemon' }];
const types = ['', 'grass', 'poison', 'fire', 'water', 'electric', 'ghost', 'normal'];

function TypeFilteredRoster({ declared }: { declared: boolean }) {
  const { knobProps } = useResolvedKnobs();
  const [type, setType] = useState('poison');
  return (
    <YStack
      {...knobProps.gap}
      flex={1}>
      <XStack
        {...knobProps.gap}
        flexWrap="wrap">
        {types.map((value) => (
          <Button
            key={value || 'all'}
            size="$3"
            accent={value === type}
            outlined={value !== type}
            aria-pressed={value === type}
            onPress={() => {
              setType(value);
            }}>
            {value || 'all'}
          </Button>
        ))}
      </XStack>
      <FrappeListView<RosterPokemon>
        doctype="Pokemon"
        fields={rosterPokemonFields}
        connections={declared ? pokemonConnections : undefined}
        filters={type ? [['Pokemon Poke Type', 'poke_type', '=', type]] : undefined}
        displayFields={[{ key: 'pokemon_name' }, { key: 'species' }]}
        onItemClick={action('onItemClick')}
      />
    </YStack>
  );
}

export const ByJunctionValue = () => (
  <FrappeProvider
    baseURL={host}
    fixtures={createRosterFixtures()}>
    <TypeFilteredRoster declared />
  </FrappeProvider>
);

export const ConnectionsFromMetaLinks = () => (
  <FrappeProvider
    baseURL={host}
    fixtures={createRosterFixtures()}>
    <TypeFilteredRoster declared={false} />
  </FrappeProvider>
);

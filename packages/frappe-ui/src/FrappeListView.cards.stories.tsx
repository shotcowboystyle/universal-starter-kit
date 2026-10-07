import { Card, Image } from '@repo/ui';
import { action } from '@repo/storybook';
import { useResolvedKnobs } from '@repo/theme';
import { Text, YStack } from 'tamagui';

import { createRosterFixtures, rosterPokemonFields, rosterPokemonMeta } from '../tests/fixtures/pokemonRoster';
import type { RosterPokemon } from '../tests/fixtures/pokemonRoster';

import { FrappeListView } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';

export default {
  title: 'FrappeUI/FrappeListView Cards',
  component: FrappeListView,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "FrappeListView's card grid: `renderCard` draws each row of the doctype into the catalog ImageGrid, while loading, empty and error stay the view's own states. Rows come from the pokemon fixtures (InMemoryFixtureProvider); DocType meta from an in-story fetch mock.",
      },
    },
  },
};

const host = 'https://listview-cards.mock.test';
const errorHost = 'https://error.listview-cards.mock.test';

(() => {
  const w = window as unknown as Record<string, unknown>;
  if (w.__frappeListViewCardsMockFetch) {
    return;
  }
  w.__frappeListViewCardsMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(host) || url.startsWith(errorHost)) {
      const body = url.includes('/api/resource/DocType/') ? { data: rosterPokemonMeta } : { data: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

function PokemonTile({ pokemon }: { pokemon: Partial<RosterPokemon> }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <Card>
      <YStack
        {...knobProps.panelPadding}
        {...knobProps.gap}
        alignItems="center">
        <Image
          src={pokemon.sprite_front}
          size="large"
          alt={pokemon.pokemon_name ?? ''}
        />
        <Text
          {...knobProps.body}
          fontWeight="700"
          textTransform="capitalize">
          {pokemon.pokemon_name}
        </Text>
        <Text
          {...knobProps.label}
          color="$color10">
          {`#${String(pokemon.poke_id ?? 0).padStart(3, '0')} · ${pokemon.species}`}
        </Text>
      </YStack>
    </Card>
  );
}

const renderCard = (pokemon: Partial<RosterPokemon>) => <PokemonTile pokemon={pokemon} />;

export const CardGrid = () => (
  <FrappeProvider
    baseURL={host}
    fixtures={createRosterFixtures()}>
    <FrappeListView<RosterPokemon>
      doctype="Pokemon"
      fields={rosterPokemonFields}
      defaultViewMode="grid"
      renderCard={renderCard}
      onItemClick={action('onItemClick')}
      onAdd={action('onAdd')}
    />
  </FrappeProvider>
);

export const CardGridInPage = () => (
  <FrappeProvider
    baseURL={host}
    fixtures={createRosterFixtures()}>
    <FrappeListView<RosterPokemon>
      doctype="Pokemon"
      fields={rosterPokemonFields}
      viewMode="grid"
      renderCard={renderCard}
      showToolbar={false}
      showSearch={false}
      surface={false}
      pageSize={4}
      onItemClick={action('onItemClick')}
    />
  </FrappeProvider>
);

export const EmptyRoster = () => (
  <FrappeProvider
    baseURL={host}
    fixtures={createRosterFixtures({ Pokemon: [] })}>
    <FrappeListView<RosterPokemon>
      doctype="Pokemon"
      fields={rosterPokemonFields}
      viewMode="grid"
      renderCard={renderCard}
    />
  </FrappeProvider>
);

function failingFixtures() {
  const fixtures = createRosterFixtures();
  fixtures.getList = async () => {
    throw Object.assign(new Error('Not permitted'), { status: 403 });
  };
  return fixtures;
}

export const PermissionDenied = () => (
  <FrappeProvider
    baseURL={errorHost}
    fixtures={failingFixtures()}>
    <FrappeListView<RosterPokemon>
      doctype="Pokemon"
      fields={rosterPokemonFields}
      viewMode="grid"
      renderCard={renderCard}
    />
  </FrappeProvider>
);

import { InMemoryFixtureProvider } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
import { Chip } from '@repo/ui';
import { Text, XStack, YStack } from 'tamagui';

import { rosterFixtureData, rosterPokemonMeta } from '../tests/fixtures/pokemonRoster';
import type { RosterPokemon } from '../tests/fixtures/pokemonRoster';

import type { FrappeConnection } from './frappeConnections';
import { FrappeForm } from './FrappeForm';
import type { FrappeConnectionRows } from './FrappeForm';
import { FrappeProvider } from './FrappeProvider';

export default {
  title: 'FrappeUI/FrappeForm Connections',
  component: FrappeForm,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "A record's connections: the doctypes linking back to it through a Link field (meta.links, or declared with `connections`). Schema mode lists them on a Connections tab; render-prop mode hands the rows to `children`, which is how a detail page renders them its own way. Pokemon's types, abilities and moves are standalone junction doctypes on the pokemon fixtures.",
      },
    },
  },
};

const host = 'https://form-connections.mock.test';

const fixtures = () =>
  new InMemoryFixtureProvider({
    DocType: [{ ...rosterPokemonMeta, doctype: 'DocType' }],
    ...rosterFixtureData(),
  });

const pokemonConnections: FrappeConnection[] = [
  { doctype: 'Pokemon Poke Type', fieldname: 'pokemon', fields: ['poke_type', 'slot'] },
  { doctype: 'Pokemon Poke Ability', fieldname: 'pokemon', fields: ['poke_ability', 'is_hidden'] },
  {
    doctype: 'Pokemon Poke Move',
    fieldname: 'pokemon',
    fields: ['poke_move', 'level_learned_at', 'move_learn_method'],
  },
];

export const ConnectionsTab = () => (
  <FrappeProvider
    baseURL={host}
    fixtures={fixtures()}>
    <FrappeForm<RosterPokemon>
      doctype="Pokemon"
      name="bulbasaur"
      showSidebar={false}
    />
  </FrappeProvider>
);

function PokemonDetail({ doc, connections }: { doc: Partial<RosterPokemon>; connections: FrappeConnectionRows }) {
  const { knobProps } = useResolvedKnobs();
  const types = connections['Pokemon Poke Type'] ?? [];
  const moves = connections['Pokemon Poke Move'] ?? [];
  return (
    <YStack {...knobProps.gap}>
      <Text
        {...knobProps.body}
        fontWeight="700"
        textTransform="capitalize">
        {doc.pokemon_name}
      </Text>
      <XStack {...knobProps.gap}>
        {types.map((row) => (
          <Chip key={String(row.name)}>{String(row.poke_type)}</Chip>
        ))}
      </XStack>
      <Text
        {...knobProps.label}
        color="$color10">
        {moves.map((row) => String(row.poke_move)).join(' · ')}
      </Text>
    </YStack>
  );
}

export const DetailPage = () => (
  <FrappeProvider
    baseURL={host}
    fixtures={fixtures()}>
    <FrappeForm<RosterPokemon>
      doctype="Pokemon"
      name="pikachu"
      connections={pokemonConnections}
      showToolbar={false}
      showSidebar={false}
      showTimeline={false}>
      {({ doc, connections }) => (
        <PokemonDetail
          doc={doc}
          connections={connections}
        />
      )}
    </FrappeForm>
  </FrappeProvider>
);

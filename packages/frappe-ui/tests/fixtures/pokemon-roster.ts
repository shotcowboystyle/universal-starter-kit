/**
 * The pokemon roster: six Pokemon and the three standalone junction doctypes
 * (types, abilities, moves) that link back to them through a `pokemon` Link
 * field. Shared by the FrappeForm connection, FrappeListView, FrappeInsights
 * and FrappeRecordView specs and stories.
 *
 * Counts the specs lean on: two Pokemon carry two types (bulbasaur, gengar),
 * seven types in all, poison twice; gengar holds the highest base XP; eevee
 * has no ability rows; pikachu has three moves over two learn methods.
 */
import { InMemoryFixtureProvider } from '@repo/frappe';
import type { FixtureData } from '@repo/frappe';

export interface RosterPokemon {
  name: string;
  doctype: string;
  pokemon_name: string;
  poke_id: number;
  species: string;
  base_experience: number;
  sprite_front?: string;
}

export const rosterPokemonFields = [
  'name',
  'pokemon_name',
  'poke_id',
  'species',
  'base_experience',
  'sprite_front',
] as const satisfies readonly (keyof RosterPokemon)[];

export const rosterPokemonMeta = {
  name: 'Pokemon',
  doctype: 'DocType',
  module: 'Pokedex',
  title_field: 'pokemon_name',
  fields: [
    { fieldname: 'pokemon_name', fieldtype: 'Data', label: 'Pokemon Name', in_list_view: 1 },
    { fieldname: 'poke_id', fieldtype: 'Int', label: 'Number', in_list_view: 1 },
    { fieldname: 'species', fieldtype: 'Data', label: 'Species' },
    { fieldname: 'base_experience', fieldtype: 'Int', label: 'Base Experience' },
    { fieldname: 'sprite_front', fieldtype: 'Data', label: 'Sprite' },
  ],
  links: [
    { link_doctype: 'Pokemon Poke Type', link_fieldname: 'pokemon' },
    { link_doctype: 'Pokemon Poke Ability', link_fieldname: 'pokemon' },
    { link_doctype: 'Pokemon Poke Move', link_fieldname: 'pokemon' },
  ],
  permissions: [{ role: 'System Manager', permlevel: 0, read: 1, write: 1, create: 1, delete: 1 }],
};

const pokemon = (pokeId: number, name: string, species: string, baseExperience: number): RosterPokemon => ({
  name,
  doctype: 'Pokemon',
  pokemon_name: name,
  poke_id: pokeId,
  species,
  base_experience: baseExperience,
  sprite_front: `https://sprites.fixture.test/${pokeId}.png`,
});

/** In poke_id order, which is also the corpus's insertion order. */
export const rosterPokemon: readonly RosterPokemon[] = [
  pokemon(1, 'bulbasaur', 'Seed Pokémon', 64),
  pokemon(4, 'charmander', 'Lizard Pokémon', 62),
  pokemon(7, 'squirtle', 'Tiny Turtle Pokémon', 63),
  pokemon(25, 'pikachu', 'Mouse Pokémon', 112),
  pokemon(94, 'gengar', 'Shadow Pokémon', 250),
  pokemon(133, 'eevee', 'Evolution Pokémon', 65),
];

const types: [pokemon: string, type: string, slot: number][] = [
  ['bulbasaur', 'grass', 1],
  ['bulbasaur', 'poison', 2],
  ['charmander', 'fire', 1],
  ['squirtle', 'water', 1],
  ['pikachu', 'electric', 1],
  ['gengar', 'ghost', 1],
  ['gengar', 'poison', 2],
  ['eevee', 'normal', 1],
];

const abilities: [pokemon: string, ability: string, slot: number, isHidden: number][] = [
  ['bulbasaur', 'overgrow', 1, 0],
  ['bulbasaur', 'chlorophyll', 3, 1],
  ['charmander', 'blaze', 1, 0],
  ['squirtle', 'torrent', 1, 0],
  ['pikachu', 'static', 1, 0],
  ['pikachu', 'lightning rod', 3, 1],
  ['gengar', 'cursed body', 1, 0],
];

const moves: [pokemon: string, move: string, level: number, method: string][] = [
  ['bulbasaur', 'tackle', 1, 'level-up'],
  ['bulbasaur', 'vine-whip', 3, 'level-up'],
  ['charmander', 'ember', 4, 'level-up'],
  ['squirtle', 'bubble', 7, 'level-up'],
  ['pikachu', 'quick-attack', 16, 'level-up'],
  ['pikachu', 'thunder-shock', 1, 'level-up'],
  ['pikachu', 'thunderbolt', 0, 'machine'],
  ['gengar', 'shadow-ball', 0, 'machine'],
  ['eevee', 'tackle', 1, 'level-up'],
];

/** Every roster doctype's rows, without the DocType meta. */
export const rosterFixtureData = () =>
  ({
    Pokemon: rosterPokemon.map((row) => ({ ...row })),
    'Pokemon Poke Type': types.map(([owner, type, slot]) => ({
      name: `${owner}-type-${slot}`,
      doctype: 'Pokemon Poke Type',
      pokemon: owner,
      poke_type: type,
      slot,
    })),
    'Pokemon Poke Ability': abilities.map(([owner, ability, slot, isHidden]) => ({
      name: `${owner}-ability-${slot}`,
      doctype: 'Pokemon Poke Ability',
      pokemon: owner,
      poke_ability: ability,
      slot,
      is_hidden: isHidden,
    })),
    'Pokemon Poke Move': moves.map(([owner, move, level, method]) => ({
      name: `${owner}-${move}`,
      doctype: 'Pokemon Poke Move',
      pokemon: owner,
      poke_move: move,
      level_learned_at: level,
      move_learn_method: method,
    })),
  }) satisfies FixtureData;

/** A fresh roster corpus with its DocType meta; `overrides` replaces whole doctypes. */
export const createRosterFixtures = (overrides: FixtureData = {}): InMemoryFixtureProvider =>
  new InMemoryFixtureProvider({
    DocType: [rosterPokemonMeta],
    ...rosterFixtureData(),
    ...overrides,
  });

// FrappeListView's list controls (MPO-411): sorts, a facet on a connection
// doctype, a range, favorites, a search mapping and the URL state that a
// list page (pokemon's roster) used to hand-wire around the view.
import { Order } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createRosterFixtures, rosterPokemonFields, rosterPokemonMeta } from '../tests/fixtures/pokemonRoster';
import type { RosterPokemon } from '../tests/fixtures/pokemonRoster';

import { FrappeListView } from './FrappeListView';
import type { FrappeListCard, FrappeListViewProps } from './FrappeListView';
import type { FrappeNavigation } from './frappeNavigation';
import { FrappeProvider } from './FrappeProvider';
import { favoritesStore } from './list/favorites';

const host = 'https://listview-controls.spec.test';
const realFetch = globalThis.fetch;

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(host)) {
      const body = url.includes('/api/resource/DocType/') ? { data: rosterPokemonMeta } : { data: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return await realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const cards = new Map<string, FrappeListCard | undefined>();

const card = (pokemon: Partial<RosterPokemon>, _index: number, context?: FrappeListCard) => {
  cards.set(pokemon.name ?? '', context);
  return <Text testID={`card-${pokemon.name}`}>{pokemon.pokemon_name}</Text>;
};

const controls: Partial<FrappeListViewProps<RosterPokemon>> = {
  sorts: [
    { value: 'number', label: 'Number', orderBy: [{ field: 'poke_id', order: Order.Asc }] },
    { value: 'xp', label: 'XP', orderBy: [{ field: 'base_experience', order: Order.Desc }] },
  ],
  searchFilter: (query) =>
    /^\d+$/.test(query) ? [['poke_id', '=', Number(query)]] : [['pokemon_name', 'like', `%${query}%`]],
  facets: [
    {
      param: 'type',
      doctype: 'Pokemon Poke Type',
      field: 'poke_type',
      orderBy: 'slot',
      label: 'Type',
      allLabel: 'All types',
      options: ['grass', 'poison', 'fire', 'water', 'electric', 'ghost', 'normal'],
    },
  ],
  ranges: [{ param: 'xp', field: 'base_experience', label: 'Min XP' }],
  favorites: 'controls-spec-favorites',
  urlState: true,
};

function navigationAt(
  params: Record<string, string | undefined>,
  setParams = vi.fn(),
  navigate = vi.fn(),
): FrappeNavigation {
  return {
    usePathname: () => '/pokemon',
    useNavigate: () => navigate,
    useSearchParams: () => params,
    useSetSearchParams: () => setParams,
  };
}

function renderList(
  params: Record<string, string | undefined> = {},
  props: Partial<FrappeListViewProps<RosterPokemon>> = {},
  navigation = navigationAt(params),
) {
  cards.clear();
  return renderWithProviders(
    <FrappeProvider
      baseURL={host}
      fixtures={createRosterFixtures()}
      navigation={navigation}>
      <FrappeListView<RosterPokemon>
        doctype="Pokemon"
        fields={rosterPokemonFields}
        defaultViewMode="grid"
        renderCard={card}
        {...controls}
        {...props}
      />
    </FrappeProvider>,
  );
}

function shownCards(): string[] {
  return screen.queryAllByTestId(/^card-/).map((node) => node.textContent ?? '');
}

async function expectCards(names: string[]): Promise<void> {
  await waitFor(
    () => {
      expect(shownCards()).toEqual(names);
    },
    { timeout: 5000 },
  );
}

describe('FrappeListView controls read their state from the URL', () => {
  it('orders by the sort the URL names', async () => {
    renderList({ sort: 'xp' });
    await expectCards(['gengar', 'pikachu', 'eevee', 'bulbasaur', 'squirtle', 'charmander']);
  });

  it('narrows to a facet value through its connection doctype', async () => {
    renderList({ type: 'poison' });
    await expectCards(['bulbasaur', 'gengar']);
  });

  it('narrows by a range minimum and by the search mapping', async () => {
    renderList({ xp: '100' });
    await expectCards(['pikachu', 'gengar']);
    cleanup();
    renderList({ q: '25' });
    await expectCards(['pikachu']);
  });

  it('narrows to the favorites', async () => {
    favoritesStore('controls-spec-favorites').setState(() => ({ names: ['eevee', 'squirtle'] }));
    renderList({ fav: '1' });
    await expectCards(['squirtle', 'eevee']);
    favoritesStore('controls-spec-favorites').setState(() => ({ names: [] }));
  });
});

describe('FrappeListView controls write their state back', () => {
  it('a facet chip narrows the rows and lands in the URL after the commit', async () => {
    const setParams = vi.fn();
    renderList({}, {}, navigationAt({}, setParams));
    await waitFor(
      () => {
        expect(shownCards()).toHaveLength(6);
      },
      { timeout: 5000 },
    );
    fireEvent.click(await screen.findByTestId('pokemon-type-fire'));
    await expectCards(['charmander']);
    expect(setParams).toHaveBeenCalledWith({ type: 'fire' });
  });

  it('Clear filters drops every narrowing control from the list and the URL', async () => {
    const setParams = vi.fn();
    renderList({ type: 'fire', xp: '10' }, {}, navigationAt({ type: 'fire', xp: '10' }, setParams));
    await expectCards(['charmander']);
    fireEvent.click(screen.getByTestId('pokemon-clear'));
    await waitFor(
      () => {
        expect(shownCards()).toHaveLength(6);
      },
      { timeout: 5000 },
    );
    expect(setParams).toHaveBeenLastCalledWith({
      q: undefined,
      fav: undefined,
      type: undefined,
      xp: undefined,
    });
  });
});

describe('FrappeListView controls hand each card its context', () => {
  it('gives a card its facet values in slot order, its href and its favorite', async () => {
    favoritesStore('controls-spec-favorites').setState(() => ({ names: [] }));
    renderList({}, { route: '/pokemon' });
    await waitFor(() => {
      expect(cards.get('bulbasaur')?.facets.type).toEqual(['grass', 'poison']);
    });
    const bulbasaur = cards.get('bulbasaur')!;
    expect(bulbasaur.href).toBe('/pokemon/bulbasaur');
    expect(bulbasaur.favorite?.active).toBe(false);
    act(() => bulbasaur.favorite?.toggle());
    await waitFor(() => {
      expect(cards.get('bulbasaur')?.favorite?.active).toBe(true);
    });
    expect(favoritesStore('controls-spec-favorites').state.names).toEqual(['bulbasaur']);
    favoritesStore('controls-spec-favorites').setState(() => ({ names: [] }));
  });

  it("counts each facet value's records on its chip", async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByTestId('pokemon-type-poison').textContent).toContain('2');
    });
    expect(screen.getByTestId('pokemon-type-all').textContent).toContain('6');
  });
});

describe('FrappeListView routed page with its toolbar off', () => {
  it('titles the page, counts the records and puts the actions in the header', async () => {
    const navigate = vi.fn();
    renderList(
      {},
      {
        route: '/pokemon',
        showToolbar: false,
        title: 'Roster',
        subtitle: (count) => `${count} in the roster`,
        actions: [{ label: 'Insights', href: '/pokemon/insights', testID: 'insights' }],
      },
      navigationAt({}, vi.fn(), navigate),
    );
    await expect(screen.findByText('Roster')).resolves.toBeTruthy();
    await expect(screen.findByText('6 in the roster')).resolves.toBeTruthy();
    fireEvent.click(screen.getByTestId('insights'));
    expect(navigate).toHaveBeenCalledWith('/pokemon/insights');
    expect(screen.getByText('Skip to results')).toBeTruthy();
    fireEvent.click(await screen.findByText('Add Pokemon'));
    expect(navigate).toHaveBeenCalledWith('/pokemon/new');
  });
});

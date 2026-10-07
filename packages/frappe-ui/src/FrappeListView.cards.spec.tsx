// FrappeListView's card slot (MPO-331): a doctype with a picture keeps its
// card without leaving the component. `renderCard` draws each row into the
// catalog ImageGrid; loading, empty and error stay the view's own states.
import type { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createRosterFixtures,
  rosterPokemon,
  rosterPokemonFields,
  rosterPokemonMeta,
} from '../tests/fixtures/pokemonRoster';
import type { RosterPokemon } from '../tests/fixtures/pokemonRoster';

import { FrappeListView } from './FrappeListView';
import type { FrappeListViewProps } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';

const host = 'https://listview-cards.spec.test';
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

const card = (pokemon: Partial<RosterPokemon>, index: number) => (
  <Text testID={`card-${pokemon.name}`}>{`${index}:${pokemon.pokemon_name}`}</Text>
);

function renderCards(fixtures: InMemoryFixtureProvider, props: Partial<FrappeListViewProps<RosterPokemon>> = {}) {
  return renderWithProviders(
    <FrappeProvider
      baseURL={host}
      fixtures={fixtures}>
      <FrappeListView<RosterPokemon>
        doctype="Pokemon"
        fields={rosterPokemonFields}
        viewMode="grid"
        renderCard={card}
        {...props}
      />
    </FrappeProvider>,
  );
}

describe('FrappeListView card slot', () => {
  it('draws every row through renderCard in the grid', async () => {
    renderCards(createRosterFixtures());
    for (const pokemon of rosterPokemon) {
      await waitFor(() => {
        expect(screen.getByTestId(`card-${pokemon.name}`)).toBeTruthy();
      });
    }
    expect(screen.getByTestId('card-bulbasaur').textContent).toMatch(/^\d+:bulbasaur$/);
  });

  it("hands the slot each row's position in the page", async () => {
    renderCards(createRosterFixtures());
    await waitFor(() => {
      expect(screen.getByTestId('card-eevee')).toBeTruthy();
    });
    const positions = rosterPokemon.map((pokemon) =>
      Number(screen.getByTestId(`card-${pokemon.name}`).textContent?.split(':')[0]),
    );
    expect([...positions].sort((a, b) => a - b)).toEqual(rosterPokemon.map((_, i) => i));
  });

  it('offers the card grid in the view switcher only when a slot is given', async () => {
    const { unmount } = renderCards(createRosterFixtures(), { viewMode: undefined });
    await waitFor(() => {
      expect(screen.getByText('Cards')).toBeTruthy();
    });
    unmount();
    renderWithProviders(
      <FrappeProvider
        baseURL={host}
        fixtures={createRosterFixtures()}>
        <FrappeListView<RosterPokemon>
          doctype="Pokemon"
          fields={rosterPokemonFields}
        />
      </FrappeProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Table')).toBeTruthy();
    });
    expect(screen.queryByText('Cards')).toBeNull();
  });

  it('a grid asked for without a slot falls back to the list', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL={host}
        fixtures={createRosterFixtures()}>
        <FrappeListView<RosterPokemon>
          doctype="Pokemon"
          fields={rosterPokemonFields}
          viewMode="grid"
          displayFields={[{ key: 'pokemon_name' }]}
        />
      </FrappeProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('pikachu')).toBeTruthy();
    });
    expect(screen.queryByTestId('card-pikachu')).toBeNull();
  });

  it('switching views reports the mode and leaves a controlled view where it is', async () => {
    const onViewModeChange = vi.fn();
    renderCards(createRosterFixtures(), { onViewModeChange });
    await waitFor(() => {
      expect(screen.getByTestId('card-pikachu')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Table'));
    expect(onViewModeChange).toHaveBeenCalledWith('table');
    expect(screen.getByTestId('card-pikachu')).toBeTruthy();
  });
});

describe('FrappeListView card grid states', () => {
  it("renders the grid's skeleton while the first page loads", async () => {
    const fixtures = createRosterFixtures();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getList = fixtures.getList.bind(fixtures);
    vi.spyOn(fixtures, 'getList').mockImplementation(async (...args) => {
      await gate;
      return getList(...args);
    });
    renderCards(fixtures);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="image-grid-skeleton"], [aria-busy="true"]')).toBeTruthy();
    });
    expect(screen.queryByTestId('card-pikachu')).toBeNull();
    release();
    await waitFor(() => {
      expect(screen.getByTestId('card-pikachu')).toBeTruthy();
    });
  });

  it('an empty doctype shows the empty message, not a blank grid', async () => {
    renderCards(createRosterFixtures({ Pokemon: [] }));
    await waitFor(() => {
      expect(screen.getByText('No Pokemon records found')).toBeTruthy();
    });
  });

  it("an empty doctype shows the screen's own empty state when one is given", async () => {
    renderCards(createRosterFixtures({ Pokemon: [] }), {
      emptyState: <Text testID="roster-empty">Catch your first Pokemon</Text>,
    });
    await waitFor(() => {
      expect(screen.getByTestId('roster-empty')).toBeTruthy();
    });
    expect(screen.queryByText('No Pokemon records found')).toBeNull();
  });

  it('a failed read is an error with a retry, never an empty grid', async () => {
    const fixtures = createRosterFixtures();
    vi.spyOn(fixtures, 'getList').mockRejectedValue(new Error('Failed to fetch'));
    renderCards(fixtures, { emptyState: <Text testID="roster-empty">empty</Text> });
    await waitFor(() => {
      expect(screen.getByText('Error loading Pokemon')).toBeTruthy();
    });
    expect(screen.queryByTestId('roster-empty')).toBeNull();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });
});

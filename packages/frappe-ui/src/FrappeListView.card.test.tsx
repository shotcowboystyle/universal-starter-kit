// FrappeListView's record card (MPO-411): a list whose doctype declares a
// look draws each record as a card without a card slot of its own, the way
// pokemon's roster drew its Pokedex card by hand.
import fs from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createRosterFixtures, rosterPokemonFields, rosterPokemonMeta } from '../tests/fixtures/pokemonRoster';
import type { RosterPokemon } from '../tests/fixtures/pokemonRoster';

import type { FrappeNavigation } from './frappe-navigation';
import { FrappeListView } from './FrappeListView';
import type { FrappeListViewProps } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';
import { favoritesStore } from './list/favorites';

const requestUrl = (input: RequestInfo | URL): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- picks the string member of fetch's RequestInfo | URL input union
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
};

const host = 'https://listview-card.spec.test';
const realFetch = globalThis.fetch;
const favoritesKey = 'card-spec-favorites';

const look: FrappeListViewProps<RosterPokemon>['look'] = {
  title: (doc) => (doc.pokemon_name ?? '').toUpperCase(),
  code: (doc) => `#${String(doc.poke_id ?? 0).padStart(3, '0')}`,
  subtitle: (doc) => doc.species,
  images: (doc) => [`https://art.spec.test/${doc.poke_id}.png`, doc.sprite_front ?? ''],
};

const renderList = (navigate = vi.fn<ReturnType<FrappeNavigation['useNavigate']>>()) => {
  const navigation: FrappeNavigation = {
    usePathname: () => '/pokemon',
    useNavigate: () => navigate,
  };
  return renderWithProviders(
    <FrappeProvider
      baseURL={host}
      fixtures={createRosterFixtures()}
      navigation={navigation}>
      <FrappeListView<RosterPokemon>
        doctype="Pokemon"
        route="/pokemon"
        fields={rosterPokemonFields}
        defaultViewMode="grid"
        look={look}
        favorites={favoritesKey}
        facets={[
          {
            param: 'type',
            doctype: 'Pokemon Poke Type',
            field: 'poke_type',
            orderBy: 'slot',
            label: 'Type',
            options: ['grass', 'poison', 'fire', 'water', 'electric', 'ghost', 'normal'],
            optionLabel: (value) => `type:${value}`,
            tint: (value) => (value === 'grass' ? 'grass' : 'purple'),
          },
        ]}
      />
    </FrappeProvider>,
  );
};

describe('FrappeListView.card', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- chained setup on the default instance is i18next's documented API
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.startsWith(host)) {
        const body = url.includes('/api/resource/DocType/') ? { data: rosterPokemonMeta } : { data: [] };
        return Response.json(body);
      }
      return await realFetch(input as RequestInfo, init);
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    favoritesStore(favoritesKey).setState(() => ({ names: [] }));
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  describe("FrappeListView draws a record card from the doctype's look", () => {
    it('offers the card grid and names each card by the doctype and the record', async () => {
      renderList();
      const card = await screen.findByTestId('pokemon-card-bulbasaur', {}, { timeout: 5000 });
      expect(card.textContent).toContain('BULBASAUR');
      expect(card.textContent).toContain('#001');
      expect(card.textContent).toContain('Seed Pokémon');
      expect(screen.getAllByTestId(/^pokemon-card-/u)).toHaveLength(6);
    });

    it("draws the look's first image and the facet's values as badges in slot order", async () => {
      renderList();
      const card = await screen.findByTestId('pokemon-card-bulbasaur', {}, { timeout: 5000 });
      expect(card.querySelector('img')?.getAttribute('src')).toBe('https://art.spec.test/1.png');
      await waitFor(() => {
        const text = card.textContent ?? '';
        expect(text).toContain('type:grass');
        expect(text.indexOf('type:grass')).toBeLessThan(text.indexOf('type:poison'));
      });
    });

    it("links the card to the record under the list's route", async () => {
      renderList();
      const card = await screen.findByTestId('pokemon-card-bulbasaur', {}, { timeout: 5000 });
      expect(card.querySelector('a')?.getAttribute('href')).toBe('/pokemon/bulbasaur');
    });

    it('keeps the heart a button beside the link that toggles the favorite and opens nothing', async () => {
      const navigate = vi.fn<ReturnType<FrappeNavigation['useNavigate']>>();
      renderList(navigate);
      const heart = await screen.findByTestId('pokemon-favorite-bulbasaur', {}, { timeout: 5000 });
      expect(heart.tagName).toBe('BUTTON');
      expect(heart.getAttribute('type')).toBe('button');
      expect(heart.closest('a')).toBeNull();
      expect(heart.getAttribute('aria-pressed')).toBe('false');
      expect(heart.getAttribute('aria-label')).toBe('Add BULBASAUR to favorites');
      fireEvent.click(heart);
      await waitFor(() => {
        expect(favoritesStore(favoritesKey).state.names).toStrictEqual(['bulbasaur']);
      });
      await waitFor(() => {
        expect(screen.getByTestId('pokemon-favorite-bulbasaur').getAttribute('aria-pressed')).toBe('true');
      });
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe("RecordCard's native twin", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, 'list/RecordCard.native.tsx'), 'utf-8');

    it('presses the card itself, since a native Anchor loses the tap to the Card', () => {
      expect(source).not.toContain('<Anchor');
      expect(source).toMatch(/onPress=\{\(\) => onPress\?\.\(\)\}/u);
    });

    it("stops the heart's press from reaching the card", () => {
      const handler = source.slice(source.indexOf('const handleToggleFavorite'), source.indexOf('return ('));
      expect(handler).toContain('stopPropagation');
    });
  });
});

// FrappeInsights (MPO-411): a doctype's analytics page over the rows its list
// reads, declared from the list's facet and numeric fields instead of a page
// of hand-rolled sections (pokemon's insights).
import { Order } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createRosterFixtures, rosterPokemonFields, rosterPokemonMeta } from '../tests/fixtures/pokemon-roster';
import type { RosterPokemon } from '../tests/fixtures/pokemon-roster';

import type { FrappeNavigation } from './frappe-navigation';
import { FrappeInsights } from './FrappeInsights';
import type { FrappeInsightsProps } from './FrappeInsights';
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

const host = 'https://insights.spec.test';
const realFetch = globalThis.fetch;
const favoritesKey = 'insights-spec-favorites';

const insights: FrappeInsightsProps<RosterPokemon> = {
  doctype: 'Pokemon',
  route: '/pokemon',
  listTitle: 'Roster',
  subtitle: (count) => `${count} analyzed`,
  fields: rosterPokemonFields,
  orderBy: [{ field: 'poke_id', order: Order.Asc }],
  facet: {
    param: 'type',
    doctype: 'Pokemon Poke Type',
    field: 'poke_type',
    orderBy: 'slot',
    label: 'Type',
    options: ['grass', 'poison', 'fire', 'water', 'electric', 'ghost', 'normal'],
    tint: (type) => (type === 'fire' ? 'tomato' : undefined),
  },
  facetPlural: 'Types',
  metrics: [
    {
      field: 'base_experience',
      label: 'Base XP',
      record: 'Highest base XP',
      format: (v) => `${v} xp`,
    },
    { field: 'poke_id', label: 'Number' },
  ],
  favorites: favoritesKey,
  look: { code: (doc) => `#${String(doc.poke_id).padStart(3, '0')}` },
  testID: 'insights',
};

const renderInsights = (
  props: Partial<FrappeInsightsProps<RosterPokemon>> = {},
  navigate = vi.fn<ReturnType<FrappeNavigation['useNavigate']>>(),
  fixtures = createRosterFixtures(),
) => {
  const navigation: FrappeNavigation = {
    usePathname: () => '/pokemon/insights',
    useNavigate: () => navigate,
  };
  return renderWithProviders(
    <FrappeProvider
      baseURL={host}
      fixtures={fixtures}
      navigation={navigation}>
      <FrappeInsights<RosterPokemon>
        {...insights}
        {...props}
      />
    </FrappeProvider>,
  );
};

const tile = async (id: string): Promise<HTMLElement> =>
  await screen.findByTestId(`insights-dashboard-kpi-${id}`, {}, { timeout: 5000 });

describe('FrappeInsights page', () => {
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
    favoritesStore(favoritesKey).setState(() => ({ names: [] }));
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  describe('FrappeInsights header and counts', () => {
    it("titles the page under the list's breadcrumb and counts the records", async () => {
      renderInsights();
      await expect(screen.findByText('6 analyzed', {}, { timeout: 5000 })).resolves.toBeTruthy();
      expect(screen.getAllByText('Insights').length).toBeGreaterThan(0);
      expect(screen.getByText('Total Roster')).toBeTruthy();
      expect(screen.getByText('Roster')).toBeTruthy();
    });

    it("counts the favorites, the facet's distinct values and averages the first metric", async () => {
      favoritesStore(favoritesKey).setState(() => ({ names: ['pikachu', 'gengar'] }));
      renderInsights();
      await waitFor(
        async () => {
          const facetTile = await tile('facet');
          expect(facetTile.textContent).toContain('7');
        },
        {
          timeout: 5000,
        },
      );
      const facetTile = await tile('facet');
      expect(facetTile.textContent).toContain('Distinct Types');
      expect(facetTile.textContent).toContain('2 with 2+');
      const favoritesTile = await tile('favorites');
      expect(favoritesTile.textContent).toContain('2 of 6');
      const averageTile = await tile('average');
      expect(averageTile.textContent).toContain(`${Math.round((64 + 62 + 63 + 112 + 250 + 65) / 6)} xp`);
    });
  });

  describe('FrappeInsights records and leaders', () => {
    it('crowns the holder of a metric that names its record', async () => {
      renderInsights();
      const records = await screen.findByTestId('insights-records', {}, { timeout: 5000 });
      expect(records.textContent).toContain('Highest base XP');
      expect(records.textContent).toContain('gengar');
      expect(records.textContent).toContain('#094');
      expect(records.textContent).toContain('250 xp');
    });

    it("ranks the leaders by the picked metric and opens a row's record", async () => {
      const navigate = vi.fn<ReturnType<FrappeNavigation['useNavigate']>>();
      renderInsights({}, navigate);
      const leaders = await screen.findByTestId('insights-leaderboard', {}, { timeout: 5000 });
      await waitFor(() => {
        expect(within(leaders).getAllByText(/^#\d$/u)).toHaveLength(5);
      });
      fireEvent.click(within(leaders).getByText('gengar'));
      expect(navigate).toHaveBeenCalledWith('/pokemon/gengar');
    });
  });

  describe('FrappeInsights table and facet links', () => {
    it('tags each record with its facet values and links a value to the narrowed list', async () => {
      const navigate = vi.fn<ReturnType<FrappeNavigation['useNavigate']>>();
      renderInsights({}, navigate);
      const poison = await screen.findByTestId('insights-tag-poison', {}, { timeout: 5000 });
      expect(poison.textContent).toContain('2');
      fireEvent.click(poison);
      expect(navigate).toHaveBeenCalledWith('/pokemon?type=poison');
      const table = screen.getByTestId('insights-roster');
      expect(table.textContent).toContain('Types');
    });
  });

  describe('FrappeInsights honest states', () => {
    it('offers the first record when there is nothing to analyze', async () => {
      const navigate = vi.fn<ReturnType<FrappeNavigation['useNavigate']>>();
      renderInsights({}, navigate, createRosterFixtures({ Pokemon: [] }));
      await expect(screen.findByText('No Roster to analyze', {}, { timeout: 5000 })).resolves.toBeTruthy();
      fireEvent.click(await screen.findByText('Add your first Pokemon'));
      expect(navigate).toHaveBeenCalledWith('/pokemon/new');
    });
  });
});

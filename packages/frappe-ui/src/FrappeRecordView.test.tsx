import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { Order } from '@repo/frappe';
// FrappeRecordView (MPO-411): a doctype's record page declared from its look,
// facet, metrics and tabs, the way pokemon's detail page drew itself by hand.
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createRosterFixtures,
  rosterPokemon,
  rosterPokemonFields,
  rosterPokemonMeta,
} from '../tests/fixtures/pokemon-roster';
import type { RosterPokemon } from '../tests/fixtures/pokemon-roster';

import type { FrappeNavigation } from './frappe-navigation';
import { FrappeProvider } from './FrappeProvider';
import { FrappeRecordView } from './FrappeRecordView';
import type { FrappeRecordViewProps } from './FrappeRecordView';
import { favoritesStore } from './list/favorites';

const host = 'https://record-view.spec.test';
const realFetch = globalThis.fetch;
const favoritesKey = 'record-spec-favorites';

const requestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof URL) {
    return input.href;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates fetch's declared `string | Request` input union
  return typeof input === 'string' ? input : input.url;
};

// oxlint-disable-next-line vitest/require-top-level-describe -- shared setup/teardown for every describe block in this file
beforeAll(async () => {
  // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.startsWith(host)) {
      const body = url.includes('/api/resource/DocType/') ? { data: rosterPokemonMeta } : { data: [] };
      return Response.json(body, { status: 200 });
    }
    return await realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

// oxlint-disable-next-line vitest/require-top-level-describe -- shared setup/teardown for every describe block in this file
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  favoritesStore(favoritesKey).setState(() => ({ names: [] }));
});

// oxlint-disable-next-line vitest/require-top-level-describe -- shared setup/teardown for every describe block in this file
afterAll(() => {
  globalThis.fetch = realFetch;
});

const pokemon = rosterPokemon.map((doc) =>
  doc.name === 'pikachu'
    ? {
        ...doc,
        owner: 'ash@example.com',
        creation: '2026-08-01 10:00:00',
        modified_by: 'misty@example.com',
        stats: [
          { stat_name: 'speed', base_stat: 90 },
          { stat_name: 'hp', base_stat: 35 },
        ],
      }
    : { ...doc },
);

const declaration: Partial<FrappeRecordViewProps<RosterPokemon>> = {
  listTitle: 'Roster',
  fields: rosterPokemonFields,
  orderBy: [{ field: 'poke_id', order: Order.Asc }],
  connections: [
    { doctype: 'Pokemon Poke Type', fieldname: 'pokemon', fields: ['poke_type', 'slot'] },
    {
      doctype: 'Pokemon Poke Ability',
      fieldname: 'pokemon',
      fields: ['poke_ability', 'is_hidden', 'slot'],
    },
    {
      doctype: 'Pokemon Poke Move',
      fieldname: 'pokemon',
      fields: ['poke_move', 'level_learned_at', 'move_learn_method'],
    },
  ],
  look: {
    title: (doc) => (doc.pokemon_name ?? '').toUpperCase(),
    code: (doc) => `#${String(doc.poke_id ?? 0).padStart(3, '0')}`,
    subtitle: (doc) => doc.species,
    images: (doc) => [`https://art.spec.test/${doc.poke_id}.png`],
  },
  facet: {
    param: 'type',
    doctype: 'Pokemon Poke Type',
    field: 'poke_type',
    orderBy: 'slot',
    options: [],
    label: 'Type',
    optionLabel: (value) => `type:${value}`,
    tint: (value) => (value === 'grass' ? 'grass' : 'purple'),
  },
  metrics: [{ field: 'base_experience', label: 'Base XP', max: 608 }],
  summary: (doc) => ({ text: `${doc.pokemon_name}, the ${doc.species}.`, cite: 'The dex' }),
  favorites: favoritesKey,
  actions: [
    {
      label: 'Open in backoffice',
      icon: ArrowSquareOutIcon,
      href: (doc) => `/backoffice/pokemon/${doc.name}`,
      testID: 'hop',
    },
  ],
  tabs: [
    {
      value: 'overview',
      label: 'Overview',
      sections: [
        {
          kind: 'rows',
          doctype: 'Pokemon Poke Ability',
          field: 'poke_ability',
          title: 'Abilities',
          orderBy: ['slot'],
          flag: { field: 'is_hidden', label: 'Hidden' },
        },
        {
          kind: 'bars',
          id: 'stats',
          table: 'stats',
          label: 'stat_name',
          value: 'base_stat',
          max: 255,
          order: ['hp', 'speed'],
          title: 'Stats',
          totalLabel: 'Stat total',
        },
      ],
    },
    {
      value: 'moves',
      label: 'Moves',
      count: 'Pokemon Poke Move',
      sections: [
        {
          kind: 'rows',
          doctype: 'Pokemon Poke Move',
          field: 'poke_move',
          orderBy: ['move_learn_method', 'level_learned_at', 'poke_move'],
          detail: { field: 'level_learned_at', label: (level) => `Lv ${level}` },
          groupBy: { field: 'move_learn_method', label: (method) => method.toUpperCase() },
        },
      ],
    },
  ],
};

const renderRecord = (name: string, navigate = vi.fn<(href: string) => void>()) => {
  const navigation: FrappeNavigation = {
    usePathname: () => `/pokemon/${name}`,
    useNavigate: () => navigate,
  };
  return renderWithProviders(
    <FrappeProvider
      baseURL={host}
      fixtures={createRosterFixtures({ Pokemon: pokemon })}
      navigation={navigation}>
      <FrappeRecordView<RosterPokemon>
        doctype="Pokemon"
        route="/pokemon"
        {...declaration}
      />
    </FrappeProvider>,
  );
};

const identity = async (): Promise<HTMLElement> =>
  await screen.findByTestId('pokemon-hero-identity', {}, { timeout: 5000 });

describe('FrappeRecordView heads the record from its look and facet', () => {
  it("names the record by code, title and subtitle under the list's breadcrumb", async () => {
    renderRecord('bulbasaur');
    const hero = await identity();
    expect(hero.textContent).toContain('#001');
    expect(hero.textContent).toContain('BULBASAUR');
    expect(hero.textContent).toContain('Seed Pokémon');
    expect(screen.getByText('Roster')).toBeTruthy();
    expect(screen.getByText('#001 BULBASAUR')).toBeTruthy();
  });

  it("badges the facet's values in slot order and draws the first image", async () => {
    renderRecord('bulbasaur');
    const hero = await identity();
    await waitFor(() => {
      expect(hero.textContent).toContain('type:poison');
    });
    const text = hero.textContent ?? '';
    expect(text.indexOf('type:grass')).toBeLessThan(text.indexOf('type:poison'));
    const art = screen.getByTestId('pokemon-hero-art');
    expect(art.querySelector('img')?.getAttribute('src')).toBe('https://art.spec.test/1.png');
  });

  it('tiles each metric, a max adding a bar', async () => {
    renderRecord('bulbasaur');
    const hero = await identity();
    expect(hero.textContent).toContain('Base XP');
    expect(hero.textContent).toContain('64');
    expect(within(hero).getByLabelText('Base XP')).toBeTruthy();
  });
});

describe("FrappeRecordView tabs the record's rows", () => {
  it('opens with the summary, the linked rows in order with their flags, and the audit trail', async () => {
    renderRecord('pikachu');
    await identity();
    await expect(screen.findByText('pikachu, the Mouse Pokémon.')).resolves.toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('lightning rod')).toBeTruthy();
    });
    expect(screen.getAllByText('Hidden')).toHaveLength(1);
    expect(screen.getByText('Record history')).toBeTruthy();
  });

  it('draws a child table as bars on a fixed scale with their total', async () => {
    renderRecord('pikachu');
    await identity();
    await expect(screen.findByTestId('pokemon-stats-chart')).resolves.toBeTruthy();
    expect(screen.getByText('Stat total')).toBeTruthy();
    expect(screen.getByText('125')).toBeTruthy();
  });

  it("badges a tab with its rows' count and groups them, detailed", async () => {
    renderRecord('pikachu');
    await identity();
    const movesTab = await waitFor(() => {
      const tab = screen.getAllByRole('tab').find((node) => node.textContent?.includes('Moves'));
      expect(tab?.textContent).toContain('3');
      return tab!;
    });
    fireEvent.click(movesTab);
    await expect(screen.findByText('LEVEL-UP')).resolves.toBeTruthy();
    expect(screen.getByText('MACHINE')).toBeTruthy();
    expect(screen.getByText('Lv 16')).toBeTruthy();
  });
});

describe("FrappeRecordView's controls", () => {
  it("opens the neighbors in the list's order and the edit form", async () => {
    const navigate = vi.fn<(href: string) => void>();
    renderRecord('pikachu', navigate);
    await identity();
    fireEvent.click(await screen.findByTestId('pokemon-next', {}, { timeout: 5000 }));
    expect(navigate).toHaveBeenCalledWith('/pokemon/gengar');
    fireEvent.click(screen.getByTestId('pokemon-prev'));
    expect(navigate).toHaveBeenCalledWith('/pokemon/squirtle');
    fireEvent.click(screen.getByTestId('pokemon-detail-edit'));
    expect(navigate).toHaveBeenCalledWith('/pokemon/pikachu/edit');
  });

  it('toggles the favorite from a real button and hops through a declared action', async () => {
    const navigate = vi.fn<(href: string) => void>();
    renderRecord('pikachu', navigate);
    const heart = await screen.findByTestId('pokemon-detail-favorite', {}, { timeout: 5000 });
    expect(heart.tagName).toBe('BUTTON');
    expect(heart.getAttribute('type')).toBe('button');
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(heart);
    await waitFor(() => {
      expect(favoritesStore(favoritesKey).state.names).toStrictEqual(['pikachu']);
    });
    fireEvent.click(screen.getByTestId('hop'));
    expect(navigate).toHaveBeenCalledWith('/backoffice/pokemon/pikachu');
  });

  it('names a missing record and offers the way back', async () => {
    const navigate = vi.fn<(href: string) => void>();
    renderRecord('missingno', navigate);
    await expect(screen.findByText('Pokemon not found', {}, { timeout: 5000 })).resolves.toBeTruthy();
    fireEvent.click(screen.getByText('Back to Roster'));
    expect(navigate).toHaveBeenCalledWith('/pokemon');
  });
});

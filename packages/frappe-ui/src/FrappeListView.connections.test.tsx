// FrappeListView filters a doctype by a value held in a linked junction
// doctype (MPO-331): Pokemon by `Pokemon Poke Type.poke_type`. Types live in
// a standalone doctype with a `pokemon` Link, not a child table, so the view
// reads the matching junction rows itself and the app keeps no collection.
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createRosterFixtures, rosterPokemonFields, rosterPokemonMeta } from '../tests/fixtures/pokemonRoster';
import type { RosterPokemon } from '../tests/fixtures/pokemonRoster';

import type { FrappeConnection } from './frappe-connections';
import { connectionsFromMeta } from './frappe-connections';
import { FrappeListView } from './FrappeListView';
import type { FrappeListViewProps } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';

const host = 'https://listview-connections.spec.test';
const realFetch = globalThis.fetch;
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- served verbatim as the DocType meta payload; each test swaps in its own
let servedMeta: Record<string, unknown> = rosterPokemonMeta;

const requestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof URL) {
    return input.href;
  }
  if (input instanceof Request) {
    return input.url;
  }
  return input;
};

const typeConnection: FrappeConnection = { doctype: 'Pokemon Poke Type', fieldname: 'pokemon' };

const renderRoster = (props: Partial<FrappeListViewProps<RosterPokemon>>, fixtures = createRosterFixtures()) => {
  const view = renderWithProviders(
    <FrappeProvider
      baseURL={host}
      fixtures={fixtures}>
      <FrappeListView<RosterPokemon>
        doctype="Pokemon"
        fields={rosterPokemonFields}
        defaultViewMode="list"
        showToolbar={false}
        displayFields={[{ key: 'pokemon_name' }]}
        {...props}
      />
    </FrappeProvider>,
  );
  return { ...view, fixtures };
};

const listed = () =>
  ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'gengar', 'eevee'].filter(
    (name) => screen.queryByText(name) !== null,
  );

describe('FrappeListView connections', () => {
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
        const body = url.includes('/api/resource/DocType/') ? { data: servedMeta } : { data: [] };
        return Response.json(body, { status: 200 });
      }
      return await realFetch(input as RequestInfo, init);
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    servedMeta = rosterPokemonMeta;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  describe('FrappeListView connection filters', () => {
    it('lists only the records a matching junction row names', async () => {
      renderRoster({
        connections: [typeConnection],
        filters: [['Pokemon Poke Type', 'poke_type', '=', 'poison']],
      });
      await waitFor(() => {
        expect(listed()).toStrictEqual(['bulbasaur', 'gengar']);
      });
    });

    it("reads the junction and the doctype itself, with no collection of the app's", async () => {
      const fixtures = createRosterFixtures();
      const getList = vi.spyOn(fixtures, 'getList');
      renderRoster(
        {
          connections: [typeConnection],
          filters: [['Pokemon Poke Type', 'poke_type', '=', 'fire']],
        },
        fixtures,
      );
      await waitFor(() => {
        expect(listed()).toStrictEqual(['charmander']);
      });
      const calls = getList.mock.calls.map(([doctype, options]) => [doctype, options?.filters]);
      expect(calls).toContainEqual(['Pokemon Poke Type', [['poke_type', '=', 'fire']]]);
      expect(calls).toContainEqual(['Pokemon', [['name', 'in', ['charmander']]]]);
    });

    it('takes the connection from meta.links when none is declared', async () => {
      renderRoster({ filters: [['Pokemon Poke Type', 'poke_type', '=', 'water']] });
      await waitFor(() => {
        expect(listed()).toStrictEqual(['squirtle']);
      });
    });

    it("combines with the doctype's own filters", async () => {
      renderRoster({
        connections: [typeConnection],
        filters: [
          ['base_experience', '>', 100],
          ['Pokemon Poke Type', 'poke_type', '=', 'poison'],
        ],
      });
      await waitFor(() => {
        expect(listed()).toStrictEqual(['gengar']);
      });
    });

    it('follows a new filter value', async () => {
      const fixtures = createRosterFixtures();
      const { rerender } = renderRoster(
        { connections: [typeConnection], filters: [['Pokemon Poke Type', 'poke_type', '=', 'fire']] },
        fixtures,
      );
      await waitFor(() => {
        expect(listed()).toStrictEqual(['charmander']);
      });
      rerender(
        <FrappeProvider
          baseURL={host}
          fixtures={fixtures}>
          <FrappeListView<RosterPokemon>
            doctype="Pokemon"
            fields={rosterPokemonFields}
            defaultViewMode="list"
            showToolbar={false}
            displayFields={[{ key: 'pokemon_name' }]}
            connections={[typeConnection]}
            filters={[['Pokemon Poke Type', 'poke_type', '=', 'electric']]}
          />
        </FrappeProvider>,
      );
      await waitFor(() => {
        expect(listed()).toStrictEqual(['pikachu']);
      });
    });

    it('a value no junction row holds is an honest no-match, not the whole roster', async () => {
      renderRoster({
        connections: [typeConnection],
        filters: [['Pokemon Poke Type', 'poke_type', '=', 'dragon']],
      });
      await waitFor(() => {
        expect(screen.getByText('No Pokemon records match the active filters')).toBeTruthy();
      });
      expect(listed()).toStrictEqual([]);
    });

    it('a junction the reader may not read is an error, not an empty list', async () => {
      const fixtures = createRosterFixtures();
      const getList = fixtures.getList.bind(fixtures);
      vi.spyOn(fixtures, 'getList').mockImplementation(async (doctype, options) => {
        if (doctype === 'Pokemon Poke Type') {
          throw Object.assign(new Error('PermissionError'), { status: 403 });
        }
        return getList(doctype, options);
      });
      renderRoster(
        { connections: [typeConnection], filters: [['Pokemon Poke Type', 'poke_type', '=', 'fire']] },
        fixtures,
      );
      await waitFor(() => {
        expect(screen.getByText('You do not have permission to view Pokemon')).toBeTruthy();
      });
      expect(listed()).toStrictEqual([]);
    });

    it('a four-part filter on the doctype itself is its own field', async () => {
      renderRoster({ filters: [['Pokemon', 'poke_id', '>', 90]] });
      await waitFor(() => {
        expect(listed()).toStrictEqual(['gengar', 'eevee']);
      });
    });
  });

  describe(connectionsFromMeta, () => {
    it('reads DocType Link rows, leaving out hidden and child-table links', () => {
      expect(
        connectionsFromMeta({
          links: [
            { link_doctype: 'Pokemon Poke Type', link_fieldname: 'pokemon', group: 'Battle' },
            { link_doctype: 'Hidden', link_fieldname: 'pokemon', hidden: 1 },
            { link_doctype: 'Via Child', link_fieldname: 'pokemon', is_child_table: 1 },
          ],
        }),
      ).toStrictEqual([{ doctype: 'Pokemon Poke Type', fieldname: 'pokemon', group: 'Battle' }]);
    });
  });
});

// FrappeForm renders a doctype's connections (MPO-331): the doctypes that
// link back to the record through a Link field, read from meta.links or
// declared. A Pokemon shows its type, ability and move rows, which live in
// three standalone junction doctypes, not child tables. The same form hosts
// a detail page: render-prop mode hands those rows to `children`, and a
// server-rendered document stands in until the live read answers.
import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders, TestProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { renderToString } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { rosterFixtureData, rosterPokemonMeta } from '../tests/fixtures/pokemon-roster';
import type { RosterPokemon } from '../tests/fixtures/pokemon-roster';

import type { FrappeConnection } from './frappe-connections';
import { FrappeForm } from './FrappeForm';
import type { FrappeConnectionRows, FrappeFormProps } from './FrappeForm';
import { FrappeProvider } from './FrappeProvider';

const host = 'https://form-connections.spec.test';

const pokemonConnections: FrappeConnection[] = [
  { doctype: 'Pokemon Poke Type', fieldname: 'pokemon', fields: ['poke_type', 'slot'] },
  { doctype: 'Pokemon Poke Ability', fieldname: 'pokemon', fields: ['poke_ability', 'is_hidden'] },
  {
    doctype: 'Pokemon Poke Move',
    fieldname: 'pokemon',
    fields: ['poke_move', 'level_learned_at', 'move_learn_method'],
  },
];

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a raw DocType fixture document; the provider stores it as unparsed server JSON
const corpus = (meta: Record<string, unknown> = rosterPokemonMeta) =>
  new InMemoryFixtureProvider({
    DocType: [{ name: 'Pokemon', ...meta, doctype: 'DocType' }],
    ...rosterFixtureData(),
  });

const renderForm = (props: Partial<FrappeFormProps<RosterPokemon>>, fixtures: InMemoryFixtureProvider = corpus()) =>
  renderWithProviders(
    <FrappeProvider
      baseURL={host}
      fixtures={fixtures}>
      <FrappeForm<RosterPokemon>
        doctype="Pokemon"
        showSidebar={false}
        showTimeline={false}
        {...props}
      />
    </FrappeProvider>,
  );

const RowsProbe = ({ connections }: { connections: FrappeConnectionRows }) => (
  <>
    {Object.entries(connections).map(([doctype, rows]) => (
      <Text
        key={doctype}
        testID={`rows-${doctype}`}>
        {rows
          .map((row) => String(row.poke_type ?? row.poke_ability ?? row.poke_move))
          .toSorted()
          .join(',')}
      </Text>
    ))}
  </>
);

const detail = ({ doc }: { doc: Partial<RosterPokemon> }) => <Text testID="detail-name">{doc.pokemon_name}</Text>;

describe('FrappeForm connections', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('FrappeForm connections, schema mode', () => {
    it("shows the record's type, ability and move rows from meta.links on a Connections tab", async () => {
      renderForm({ name: 'bulbasaur' });
      await waitFor(() => {
        expect(screen.getByText('Connections')).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Connections'));
      await waitFor(() => {
        expect(screen.getByText('grass')).toBeTruthy();
      });
      expect(screen.getByText('poison')).toBeTruthy();
      expect(screen.getByText('overgrow')).toBeTruthy();
      expect(screen.getByText('chlorophyll')).toBeTruthy();
      expect(screen.getByText('tackle')).toBeTruthy();
      expect(screen.getByText('vine-whip')).toBeTruthy();
      expect(screen.queryByText('thunderbolt')).toBeNull();
    });

    it('uses declared connections where meta carries no links', async () => {
      // oxlint-disable-next-line sonarjs/no-unused-vars -- rest-destructuring drops links so the meta carries none
      const { links: _links, ...metaWithoutLinks } = rosterPokemonMeta;
      renderForm({ name: 'pikachu', connections: pokemonConnections.slice(2) }, corpus(metaWithoutLinks));
      await waitFor(() => {
        expect(screen.getByText('Connections')).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Connections'));
      await waitFor(() => {
        expect(screen.getByText('thunderbolt')).toBeTruthy();
      });
      expect(screen.getByText('quick-attack')).toBeTruthy();
      expect(screen.queryByText('static')).toBeNull();
    });

    it('names each connection with its row count', async () => {
      renderForm({ name: 'pikachu', connections: pokemonConnections });
      await waitFor(() => {
        expect(screen.getByText('Connections')).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Connections'));
      await waitFor(() => {
        expect(screen.getByText('Pokemon Poke Move (3)')).toBeTruthy();
      });
      expect(screen.getByText('Pokemon Poke Type (1)')).toBeTruthy();
    });

    it('an unlinked record says so instead of showing an empty table', async () => {
      renderForm({ name: 'eevee', connections: pokemonConnections.slice(1, 2) });
      await waitFor(() => {
        expect(screen.getByText('Connections')).toBeTruthy();
      });
      fireEvent.click(screen.getByText('Connections'));
      await waitFor(() => {
        expect(screen.getByText('No Pokemon Poke Ability rows')).toBeTruthy();
      });
    });

    it('a new record has no connections yet', async () => {
      renderForm({});
      await waitFor(() => {
        expect(screen.getByText('Save')).toBeTruthy();
      });
      expect(screen.queryByText('Connections')).toBeNull();
    });

    it('showConnections={false} leaves the tab out', async () => {
      renderForm({ name: 'bulbasaur', showConnections: false });
      await waitFor(() => {
        expect(screen.getByText('Save')).toBeTruthy();
      });
      expect(screen.queryByText('Connections')).toBeNull();
    });
  });

  describe('FrappeForm connections, render-prop mode', () => {
    it("hands children the record's linked rows per doctype", async () => {
      renderForm({
        name: 'bulbasaur',
        connections: pokemonConnections,
        showToolbar: false,
        children: ({ connections }) => <RowsProbe connections={connections} />,
      });
      await waitFor(() => {
        expect(screen.getByTestId('rows-Pokemon Poke Type').textContent).toBe('grass,poison');
      });
      expect(screen.getByTestId('rows-Pokemon Poke Ability').textContent).toBe('chlorophyll,overgrow');
      expect(screen.getByTestId('rows-Pokemon Poke Move').textContent).toBe('tackle,vine-whip');
    });

    it('reads connections from meta.links when none are declared', async () => {
      renderForm({
        name: 'pikachu',
        showToolbar: false,
        children: ({ connections }) => <RowsProbe connections={connections} />,
      });
      await waitFor(() => {
        expect(screen.getByTestId('rows-Pokemon Poke Type').textContent).toBe('electric');
      });
    });
  });

  describe('FrappeForm hosting a detail page', () => {
    const seed = {
      name: 'bulbasaur',
      doctype: 'Pokemon',
      pokemon_name: 'bulbasaur (server)',
    } as Partial<RosterPokemon>;

    it('renders the server-rendered document on the server', () => {
      const html = renderToString(
        <TestProviders>
          <FrappeProvider
            baseURL={host}
            fixtures={corpus()}>
            <FrappeForm<RosterPokemon>
              doctype="Pokemon"
              name="bulbasaur"
              initialDoc={seed}
              showToolbar={false}
              showSidebar={false}
              showTimeline={false}
              notFoundFallback={<Text>missing</Text>}>
              {detail}
            </FrappeForm>
          </FrappeProvider>
        </TestProviders>,
      );
      expect(html).toContain('bulbasaur (server)');
      expect(html).not.toContain('missing');
      expect(html).not.toContain('frappe-form-skeleton');
    });

    it('shows the server document until the live read lands, then the live one', async () => {
      const fixtures = corpus();
      const { promise: gate, resolve: release } = Promise.withResolvers<null>();
      const getDoc = fixtures.getDoc.bind(fixtures);
      vi.spyOn(fixtures, 'getDoc').mockImplementation(async (...args) => {
        await gate;
        return await getDoc(...args);
      });
      renderForm({ name: 'bulbasaur', initialDoc: seed, showToolbar: false, children: detail }, fixtures);
      expect(screen.getByTestId('detail-name').textContent).toBe('bulbasaur (server)');
      release(null);
      await waitFor(() => {
        expect(screen.getByTestId('detail-name').textContent).toBe('bulbasaur');
      });
    });

    it('ignores a server document for another name', async () => {
      renderForm({
        name: 'pikachu',
        initialDoc: seed,
        showToolbar: false,
        children: detail,
      });
      await waitFor(() => {
        expect(screen.getByTestId('detail-name').textContent).toBe('pikachu');
      });
    });

    it("takes the page's own loading, not-found and error states", async () => {
      const fixtures = corpus();
      const { promise: gate, resolve: release } = Promise.withResolvers<null>();
      const getDoc = fixtures.getDoc.bind(fixtures);
      vi.spyOn(fixtures, 'getDoc').mockImplementation(async (...args) => {
        await gate;
        return await getDoc(...args);
      });
      renderForm(
        {
          name: 'missingno',
          showToolbar: false,
          children: detail,
          loadingFallback: <Text>page skeleton</Text>,
          notFoundFallback: <Text>no such pokemon</Text>,
        },
        fixtures,
      );
      expect(screen.getByText('page skeleton')).toBeTruthy();
      release(null);
      await waitFor(() => {
        expect(screen.getByText('no such pokemon')).toBeTruthy();
      });
    });

    it('a failed read is the error state, not not-found', async () => {
      const fixtures = corpus();
      vi.spyOn(fixtures, 'getDoc').mockImplementation(async (doctype, ...rest) => {
        if (doctype === 'Pokemon') {
          throw Object.assign(new Error('PermissionError'), { status: 403 });
        }
        return await InMemoryFixtureProvider.prototype.getDoc.call(fixtures, doctype, ...rest);
      });
      renderForm(
        {
          name: 'bulbasaur',
          showToolbar: false,
          children: detail,
          notFoundFallback: <Text>no such pokemon</Text>,
          errorFallback: <Text>could not load</Text>,
        },
        fixtures,
      );
      await waitFor(() => {
        expect(screen.getByText('could not load')).toBeTruthy();
      });
      expect(screen.queryByText('no such pokemon')).toBeNull();
    });
  });
});

// A signed-out visitor reads Guest-readable rows, but getdoctype and the
// DocType document are closed to Guest (MPO-322): pokemon's list and detail
// each logged a 403 for meta they render without. The bench below answers
// meta only to the signed-in bearer token, like the live tenant.
import { setTimeout as sleep } from 'node:timers/promises';

import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeForm } from './FrappeForm';
import { FrappeListView } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';

interface Pokemon {
  name: string;
  doctype: string;
  pokemon_name: string;
  poke_id: number;
}

const fields = ['name', 'pokemon_name', 'poke_id'] as const;
const roster = [
  { name: 'bulbasaur', pokemon_name: 'Bulbasaur', poke_id: 1 },
  { name: 'ivysaur', pokemon_name: 'Ivysaur', poke_id: 2 },
];
const pokemonMeta = {
  name: 'Pokemon',
  title_field: 'pokemon_name',
  fields: [{ fieldname: 'pokemon_name', fieldtype: 'Data', label: 'Pokemon Name' }],
  permissions: [{ role: 'Guest', read: 1 }],
};

const signedOut = { useToken: true, type: 'Bearer', token: async () => '' };
const signedIn = { useToken: true, type: 'Bearer', token: async () => 'jwt' };

let run = 0;
let bench = '';
let metaReads: string[] = [];

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the stubbed fetch answers with arbitrary JSON payloads
const json = (body: unknown, status = 200) => Response.json(body, { status });

const stubBench = () => {
  metaReads = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
    if (
      url.pathname === '/api/method/frappe.desk.form.load.getdoctype' ||
      url.pathname.startsWith('/api/resource/DocType/')
    ) {
      metaReads.push(url.pathname);
      return headers.get('authorization') === 'Bearer jwt'
        ? json({ docs: [pokemonMeta] })
        : json({ exc_type: 'PermissionError' }, 403);
    }
    if (url.pathname === '/api/resource/Pokemon') {
      return json({ data: roster });
    }
    if (url.pathname === '/api/resource/Pokemon/bulbasaur') {
      return json({ data: { ...roster[0], doctype: 'Pokemon' } });
    }
    return json({ data: [] });
  });
};

const settle = async () => {
  await sleep(50);
};

const cardGrid = (auth: typeof signedOut) => (
  <FrappeProvider
    baseURL={bench}
    realtime={false}
    auth={auth}>
    <FrappeListView<Pokemon>
      doctype="Pokemon"
      fields={fields}
      viewMode="grid"
      renderCard={(pokemon) => <Text>{pokemon.pokemon_name}</Text>}
      showToolbar={false}
      showSearch={false}
    />
  </FrappeProvider>
);

describe('DocType meta for a signed-out visitor', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- chained setup on the default instance is i18next's documented API
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });
  beforeEach(() => {
    run += 1;
    bench = `http://guest-meta-${run}.spec.test`;
    stubBench();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('the card grid renders its rows without asking for meta', async () => {
    renderWithProviders(cardGrid(signedOut));
    await waitFor(() => {
      expect(screen.getByText('Ivysaur')).toBeTruthy();
    });
    await settle();
    expect(metaReads).toStrictEqual([]);
  });

  it('a render-prop form renders its doc without asking for meta', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL={bench}
        realtime={false}
        auth={signedOut}>
        <FrappeForm<Pokemon>
          doctype="Pokemon"
          name="bulbasaur"
          connections={[]}
          showToolbar={false}
          showSidebar={false}
          showTimeline={false}>
          {({ doc }) => <Text>{`read ${doc.pokemon_name ?? ''}`}</Text>}
        </FrappeForm>
      </FrappeProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('read Bulbasaur')).toBeTruthy();
    });
    await settle();
    expect(metaReads).toStrictEqual([]);
  });

  it('a signed-in reader still loads meta', async () => {
    renderWithProviders(cardGrid(signedIn));
    await waitFor(() => {
      expect(screen.getByText('Ivysaur')).toBeTruthy();
    });
    await waitFor(() => {
      expect(metaReads).toContain('/api/method/frappe.desk.form.load.getdoctype');
    });
  });
});

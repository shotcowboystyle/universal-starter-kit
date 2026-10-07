// FrappeListView takes the rows a route loader rendered on the server and
// hands over to the live collection without a refetch that shrinks the page
// (MPO-331, after MPO-322's 21-to-20 shrink on pokemon). The bench below
// pages at 20 rows unless a request names `limit_page_length`, like a stock
// Frappe site, and holds 21 Pokemon. The card grid is the layout that
// server-renders its rows (the list layout virtualizes, so it paints after
// layout on the client).
import { loadDocList, Order } from '@repo/frappe';
import { renderWithProviders, TestProviders } from '@repo/test-utils';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { renderToString } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeListView } from './FrappeListView';
import type { FrappeListViewProps } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';

interface Pokemon {
  name: string;
  doctype: string;
  pokemon_name: string;
  poke_id: number;
}

// A bench per test: the collection layer shares one collection per query
// and origin, so a reused origin would hand a test the last test's rows.
let run = 0;
let bench = '';
const rosterSize = 21;
const fields = ['name', 'pokemon_name', 'poke_id'] as const;
const orderBy = [{ field: 'poke_id' as const, order: Order.Asc }];
const pageQuery = { fields, orderBy, limit: 100 };

const roster = Array.from({ length: rosterSize }, (_, index) => ({
  name: `pokemon-${String(index + 1).padStart(2, '0')}`,
  pokemon_name: `mon-${String(index + 1).padStart(2, '0')}`,
  poke_id: index + 1,
}));

const pokemonMeta = {
  name: 'Pokemon',
  title_field: 'pokemon_name',
  fields: [
    { fieldname: 'pokemon_name', fieldtype: 'Data', label: 'Pokemon Name', in_list_view: 1 },
    { fieldname: 'poke_id', fieldtype: 'Int', label: 'Poke ID', in_list_view: 1 },
  ],
  permissions: [{ role: 'Guest', read: 1 }],
};

let listReads: URL[] = [];
let releaseReads: (() => void) | null = null;

function stubBench(options: { hold?: boolean; reversedNames?: boolean } = {}) {
  listReads = [];
  const held = options.hold
    ? new Promise<void>((resolve) => {
        releaseReads = resolve;
      })
    : null;
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.pathname.startsWith('/api/resource/DocType/')) {
      return new Response(JSON.stringify({ data: pokemonMeta }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/api/resource/Pokemon') {
      listReads.push(url);
      if (held) {
        await held;
      }
      const pageLength = Number(url.searchParams.get('limit_page_length') ?? 20);
      const page = pageLength === 0 ? roster : roster.slice(0, pageLength);
      // Names that sort against the Pokedex order, so a list that fell back
      // to name order would show it.
      const rows = options.reversedNames
        ? page.map((row) => ({
            ...row,
            name: `pokemon-${String(rosterSize + 1 - row.poke_id).padStart(2, '0')}`,
          }))
        : page;
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  });
}

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

beforeEach(() => {
  run += 1;
  bench = `http://seed-${run}.spec.test`;
});

afterEach(() => {
  cleanup();
  releaseReads?.();
  releaseReads = null;
  vi.unstubAllGlobals();
});

const renderedNames = () => roster.filter((row) => screen.queryByText(row.pokemon_name) !== null);

function listView(props: Partial<FrappeListViewProps<Pokemon>>) {
  return (
    <FrappeProvider
      baseURL={bench}
      realtime={false}>
      <FrappeListView<Pokemon>
        doctype="Pokemon"
        fields={fields}
        orderBy={orderBy}
        viewMode="grid"
        renderCard={(pokemon) => <Text>{pokemon.pokemon_name}</Text>}
        showToolbar={false}
        showSearch={false}
        pageSize={50}
        {...props}
      />
    </FrappeProvider>
  );
}

async function serverPage() {
  const request = new Request(`${bench}/pokemon`, { headers: { cookie: 'sid=guest' } });
  return await loadDocList<Pokemon>({ baseURL: bench, doctype: 'Pokemon', request, ...pageQuery });
}

describe(loadDocList, () => {
  it('reads the page it is given and stamps the doctype', async () => {
    stubBench();
    const rows = await serverPage();
    expect(rows).toHaveLength(rosterSize);
    expect(rows.every((row) => row.doctype === 'Pokemon')).toBe(true);
    expect(listReads[0].searchParams.get('limit_page_length')).toBe('100');
    expect(listReads[0].searchParams.get('order_by')).toBe('poke_id asc');
  });

  it('reads nothing without a request (a loader run in the browser)', async () => {
    stubBench();
    await expect(loadDocList({ baseURL: bench, doctype: 'Pokemon', ...pageQuery })).resolves.toEqual([]);
    expect(listReads).toHaveLength(0);
  });
});

describe('FrappeListView SSR seed', () => {
  it("renders the loader's rows on the server", async () => {
    stubBench();
    const initialRows = await serverPage();
    const html = renderToString(<TestProviders>{listView({ initialRows, limit: 100 })}</TestProviders>);
    for (const row of roster) {
      expect(html).toContain(row.pokemon_name);
    }
  });

  it("shows the loader's rows before the live collection answers", async () => {
    stubBench();
    const initialRows = await serverPage();
    stubBench({ hold: true });
    renderWithProviders(listView({ initialRows, limit: 100 }));
    expect(renderedNames()).toHaveLength(rosterSize);
    await waitFor(() => {
      expect(listReads.length).toBeGreaterThan(0);
    });
    expect(renderedNames()).toHaveLength(rosterSize);
  });

  it('hands over to the live collection reading the same page, never fewer rows', async () => {
    stubBench();
    const initialRows = await serverPage();
    stubBench({ hold: true });
    const counts: number[] = [];
    const observer = new MutationObserver(() => counts.push(renderedNames().length));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    renderWithProviders(listView({ initialRows, limit: 100 }));
    await waitFor(() => {
      expect(listReads.length).toBeGreaterThan(0);
    });
    await act(async () => {
      releaseReads?.();
    });
    await waitFor(() => {
      expect(listReads.every((url) => url.searchParams.get('limit_page_length') === '100')).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    observer.disconnect();
    expect(renderedNames()).toHaveLength(rosterSize);
    expect(Math.min(...counts.filter((count) => count > 0))).toBe(rosterSize);
    expect(listReads[0].searchParams.get('order_by')).toBe('poke_id asc');
  });

  it("seeds from the route's loader, read through the host's navigation", async () => {
    stubBench();
    const rows = await serverPage();
    stubBench({ hold: true });
    const loader = async () => ({ rows });
    const useLoader = vi.fn((given: unknown) => (given === loader ? { rows } : undefined));
    renderWithProviders(
      <FrappeProvider
        baseURL={bench}
        realtime={false}
        navigation={{ usePathname: () => '/pokemon', useNavigate: () => () => {}, useLoader }}>
        <FrappeListView<Pokemon>
          doctype="Pokemon"
          fields={fields}
          orderBy={orderBy}
          viewMode="grid"
          renderCard={(pokemon) => <Text>{pokemon.pokemon_name}</Text>}
          showToolbar={false}
          showSearch={false}
          pageSize={50}
          limit={100}
          loader={loader}
        />
      </FrappeProvider>,
    );
    expect(renderedNames()).toHaveLength(rosterSize);
    expect(useLoader).toHaveBeenCalledWith(loader);
  });

  it('lists the live rows in the order it read them, not by name', async () => {
    stubBench({ reversedNames: true });
    renderWithProviders(listView({ limit: 100 }));
    await waitFor(() => {
      expect(renderedNames()).toHaveLength(rosterSize);
    });
    const shown = [...document.body.querySelectorAll('span, div')]
      .map((node) => node.textContent ?? '')
      .filter((text) => /^mon-\d\d$/.test(text));
    expect([...new Set(shown)]).toEqual(roster.map((row) => row.pokemon_name));
  });

  it("without the loader's limit the live page is the bench's 20 (the shrink this guards)", async () => {
    stubBench();
    const initialRows = await serverPage();
    stubBench();
    renderWithProviders(listView({ initialRows }));
    await waitFor(() => {
      expect(renderedNames()).toHaveLength(20);
    });
  });

  it('keeps the server rows when the live read fails', async () => {
    stubBench();
    const initialRows = await serverPage();
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === '/api/resource/Pokemon') {
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify({ data: pokemonMeta }), { status: 200 });
    });
    renderWithProviders(listView({ initialRows, limit: 100 }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(renderedNames()).toHaveLength(rosterSize);
    expect(screen.queryByText('Error loading Pokemon')).toBeNull();
  });
});

// The desk Awesomebar keeps its document-search client in a ref. When the
// provider's connection starts sending its token, or sends it under another
// scheme, the next search must carry the new credentials instead of going out
// on a client built for the old ones (MPO-410).
import { renderWithProviders } from '@repo/test-utils';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from '../FrappeProvider';

import { Awesomebar } from './awesomebar';

const combobox = vi.hoisted(() => ({
  search: undefined as ((query: string) => void) | undefined,
}));
vi.mock(import('@repo/forms'), () => ({
  formCommonColors: { muted: '$color10' },
  Combobox: ({ onSearch }: { onSearch?: (query: string) => void }) => {
    combobox.search = onSearch;
    return null;
  },
}));

interface Auth {
  useToken: boolean;
  token: string;
  type: string;
}

const auth = (useToken: boolean, type = 'token'): Auth => ({ useToken, token: 'key:secret', type });

const changes: [string, Auth, Auth, (string | null)[]][] = [
  ['starts sending its token', auth(false), auth(true), [null, 'token key:secret']],
  ['switches its token scheme', auth(true, 'token'), auth(true, 'Bearer'), ['token key:secret', 'Bearer key:secret']],
];

const searchPath = '/api/method/frappe.utils.global_search.search';
let run = 0;
let searches: (string | null)[] = [];

beforeEach(() => {
  run += 1;
  searches = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === searchPath) {
      searches.push(new Headers(init?.headers).get('Authorization'));
    }
    return Response.json({ message: [], data: [] });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('Awesomebar document search', () => {
  it.each(changes)('searches with the new credentials when the connection %s', async (_, before, after, expected) => {
    const baseURL = `http://awesomebar-${run}.test`;
    const ui = (connectionAuth: Auth) => (
      <FrappeProvider
        baseURL={baseURL}
        realtime={false}
        auth={connectionAuth}>
        <Awesomebar />
      </FrappeProvider>
    );
    const { rerender } = renderWithProviders(ui(before));
    act(() => {
      combobox.search?.('pikachu');
    });
    await waitFor(() => {
      expect(searches).toHaveLength(1);
    });
    rerender(ui(after));
    act(() => {
      combobox.search?.('raichu');
    });
    await waitFor(() => {
      expect(searches).toHaveLength(2);
    });
    expect(searches).toEqual(expected);
  });
});

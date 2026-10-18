import type { FrappeConfig } from '@repo/frappe-ui';
// The awesomebar's document search holds one client per connection. When the
// provider's connection starts sending its token, or sends it under another
// scheme, the next search must carry the new credentials instead of going out
// on a client built for the old ones (MPO-410).
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGlobalSearch } from './awesomebar-data';

const provider = vi.hoisted(() => ({ config: undefined as FrappeConfig | undefined }));
vi.mock(import('@repo/frappe-ui'), () => ({ useFrappeConfig: () => provider.config }));

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

let run = 0;
let sent: (string | null)[] = [];

describe(useGlobalSearch, () => {
  beforeEach(() => {
    run += 1;
    sent = [];
    vi.stubGlobal('fetch', async (_input: string | URL | Request, init?: RequestInit) => {
      sent.push(new Headers(init?.headers).get('Authorization'));
      return Response.json({ message: [] });
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(changes)('searches with the new credentials when the connection %s', async (_, before, after, expected) => {
    const baseURL = `http://global-search-${run}.test`;
    provider.config = { baseURL, realtime: false, auth: before };
    const { rerender } = renderHook(({ query }: { query: string }) => useGlobalSearch(query), {
      initialProps: { query: 'pikachu' },
    });
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    provider.config = { baseURL, realtime: false, auth: after };
    rerender({ query: 'raichu' });
    await waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent).toStrictEqual(expected);
  });
});

// Each client here outlives a render: a hook's ref or the shared SyncModule
// cache. When the connection starts sending its token, or sends it under
// another scheme, the next request must go out with the new credentials
// instead of on a client built for the old ones (MPO-410).
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLinkSearch } from './doctype';
import { getFrappeSyncModule } from './frappeReact';
import type { UseFrappeCollectionConfig } from './frappeReact';
import { useDebouncedSearch } from './pacer';
import type { SyncModule } from './sync';
import { Operation } from './sync/types';

type Auth = NonNullable<UseFrappeCollectionConfig['auth']>;

const auth = (useToken: boolean, type = 'token'): Auth => ({
  useToken,
  token: 'key:secret',
  type,
});

const changes: [string, Auth, Auth, (string | null)[]][] = [
  ['starts sending its token', auth(false), auth(true), [null, 'token key:secret']],
  ['switches its token scheme', auth(true, 'token'), auth(true, 'Bearer'), ['token key:secret', 'Bearer key:secret']],
];

let run = 0;
let sent: { path: string; authorization: string | null }[] = [];
const modules = new Set<SyncModule>();

function authorizationFor(path: string): (string | null)[] {
  return sent.filter((call) => call.path === path).map((call) => call.authorization);
}

beforeEach(() => {
  run += 1;
  sent = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push({
      path: url.pathname,
      authorization: new Headers(init?.headers).get('Authorization'),
    });
    const doc = { doctype: 'ToDo', name: 'todo-1', description: 'Catch them all' };
    if (url.pathname.startsWith('/api/resource/')) {
      return Response.json({ data: [doc] });
    }
    if (url.pathname.endsWith('search_link')) {
      return Response.json({ message: [] });
    }
    return Response.json({ message: doc });
  });
});

afterEach(async () => {
  for (const sync of modules) {
    await sync.dispose();
  }
  modules.clear();
  vi.unstubAllGlobals();
});

describe("clients rebuilt with the connection's credentials", () => {
  it.each(changes)('useLinkSearch, when the connection %s', async (_, before, after, expected) => {
    const baseURL = `http://link-search-${run}.test`;
    const { rerender } = renderHook(
      ({ auth, query }: { auth: Auth; query: string }) =>
        useLinkSearch({ baseURL, auth }, 'ToDo', { query, debounceMs: 0 }),
      { initialProps: { auth: before, query: 'catch' } },
    );
    const path = '/api/method/frappe.desk.search.search_link';
    await waitFor(() => {
      expect(authorizationFor(path)).toHaveLength(1);
    });
    rerender({ auth: after, query: 'catch them' });
    await waitFor(() => {
      expect(authorizationFor(path)).toHaveLength(2);
    });
    expect(authorizationFor(path)).toEqual(expected);
  });

  it.each(changes)('useDebouncedSearch, when the connection %s', async (_, before, after, expected) => {
    const baseURL = `http://debounced-search-${run}.test`;
    const { result, rerender } = renderHook(
      ({ auth }: { auth: Auth }) => useDebouncedSearch({ baseURL, auth }, 'ToDo', { wait: 0 }),
      { initialProps: { auth: before } },
    );
    const path = '/api/resource/ToDo';
    act(() => {
      result.current.setQuery('catch');
    });
    await waitFor(() => {
      expect(authorizationFor(path)).toHaveLength(1);
    });
    rerender({ auth: after });
    act(() => {
      result.current.setQuery('catch them');
    });
    await waitFor(() => {
      expect(authorizationFor(path)).toHaveLength(2);
    });
    expect(authorizationFor(path)).toEqual(expected);
  });

  it.each(changes)('the shared SyncModule, when the connection %s', async (_, before, after, expected) => {
    const baseURL = `http://sync-module-${run}.test`;
    for (const [index, connectionAuth] of [before, after].entries()) {
      const sync = getFrappeSyncModule({ baseURL, realtime: false, auth: connectionAuth });
      expect(sync).toBeDefined();
      modules.add(sync!);
      await sync!.mutate({
        mutationId: `create-${run}-${index}`,
        operation: Operation.Create,
        doc: { doctype: 'ToDo', name: `tmp-${index}`, description: 'Catch them all' },
      });
    }
    expect(authorizationFor('/api/method/live.live.api.create_doc')).toEqual(expected);
  });
});

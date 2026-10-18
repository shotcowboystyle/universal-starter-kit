/**
 * MPO-411. A doctype's SSR route loaders are the framework's: a list page's
 * loader reads the list's own query, a record page's reads the record its
 * route param names, both from the bench the server dials.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { frappeDocLoader, frappeListLoader, serverFrappeBaseURL } from './server-loaders';
import { Order } from './sync/types';

const restoreStubs = () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- fixture JSON bodies are arbitrary
const stubBench = (body: unknown): string[] => {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    urls.push(String(input instanceof Request ? input.url : input));
    return Response.json(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return urls;
};

const listLoader = frappeListLoader('Poke Move', {
  fields: ['name', 'move_name'],
  limit: 50,
  orderBy: [{ field: 'poke_id', order: Order.Asc }],
});
const docLoader = frappeDocLoader('Poke Move');

describe(serverFrappeBaseURL, () => {
  afterEach(restoreStubs);

  it('prefers FRAPPE_BASE_URL over the dev port', () => {
    expect(serverFrappeBaseURL({ FRAPPE_BASE_URL: 'http://nginx:8080', FRAPPE_PORT: '8000' })).toBe(
      'http://nginx:8080',
    );
  });

  it('falls back to the IPv4 dev bench on FRAPPE_PORT, then 8000', () => {
    expect(serverFrappeBaseURL({ FRAPPE_PORT: '8123' })).toBe('http://127.0.0.1:8123');
    expect(serverFrappeBaseURL({})).toBe('http://127.0.0.1:8000');
  });

  it('reads process.env when called, not when the module loaded', () => {
    vi.stubEnv('FRAPPE_BASE_URL', 'http://nginx:8080');
    expect(serverFrappeBaseURL()).toBe('http://nginx:8080');
    // oxlint-disable-next-line unicorn/no-useless-undefined -- undefined is how vi.stubEnv deletes the key
    vi.stubEnv('FRAPPE_BASE_URL', undefined);
    vi.stubEnv('FRAPPE_PORT', '8124');
    expect(serverFrappeBaseURL()).toBe('http://127.0.0.1:8124');
  });
});

describe('frappeListLoader and frappeDocLoader', () => {
  afterEach(restoreStubs);

  it('read nothing without a server request', async () => {
    await expect(listLoader({})).resolves.toStrictEqual({ rows: [] });
    await expect(docLoader({ params: { id: 'agility' } })).resolves.toStrictEqual({ doc: null });
  });

  it("read the list's query and the named record from the bench", async () => {
    vi.stubEnv('FRAPPE_BASE_URL', 'http://nginx:8080');
    const request = new Request('https://pokemon.example/moves');

    const listUrls = stubBench({ data: [{ name: 'agility' }] });
    await expect(listLoader({ request })).resolves.toStrictEqual({
      rows: [{ name: 'agility', doctype: 'Poke Move' }],
    });
    const listUrl = new URL(listUrls[0] ?? '');
    expect(listUrl.origin + listUrl.pathname).toBe('http://nginx:8080/api/resource/Poke%20Move');
    expect(listUrl.searchParams.get('limit_page_length')).toBe('50');

    const docUrls = stubBench({ data: { name: 'agility' } });
    await expect(docLoader({ request, params: { id: 'agility' } })).resolves.toStrictEqual({
      doc: { name: 'agility', doctype: 'Poke Move' },
    });
    expect(docUrls[0]).toBe('http://nginx:8080/api/resource/Poke%20Move/agility');
  });

  it('name the record by the param a route declares', async () => {
    vi.stubEnv('FRAPPE_BASE_URL', 'http://nginx:8080');
    const urls = stubBench({ data: { name: 'ember' } });
    await frappeDocLoader(
      'Poke Move',
      'move',
    )({
      request: new Request('https://pokemon.example/moves/ember'),
      params: { move: 'ember' },
    });
    expect(urls[0]).toBe('http://nginx:8080/api/resource/Poke%20Move/ember');
  });
});

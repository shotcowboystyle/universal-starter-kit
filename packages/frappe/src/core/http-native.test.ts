/**
 * React Native cookie-auth CSRF bootstrap (native-audit B6).
 *
 * On RN the OS cookie jar authenticates requests (fetch sends it), but JS
 * cannot READ those cookies — the platform getCookie shim is an in-memory
 * map that never sees the sid/CSRF cookies — so mutating cookie-auth
 * requests would 400 once the session holds a CSRF token. HttpClient must
 * bootstrap the token from the server (sessions RPC, falling back to the
 * /app boot HTML), cache it, and re-bootstrap after auth changes or 400s.
 * Token auth must be completely unaffected.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpClient } from './http';
import { AuthType, FrappeError, HttpMethod } from './types';

const cookieStore = vi.hoisted(() => new Map<string, string>());

vi.mock(import('@repo/platform'), () => ({
  isNative: true,
  isWindowDefined: false,
  getCookie: (name: string) => cookieStore.get(name) ?? null,
  setCookie: (name: string, value: string) => {
    cookieStore.set(name, value);
  },
  deleteCookie: (name: string) => {
    cookieStore.delete(name);
  },
}));

const baseURL = 'https://frappe.example.com';
const RPC_URL = `${baseURL}/api/method/frappe.sessions.get_csrf_token`;
const APP_URL = `${baseURL}/app`;

const jsonResponse = (payload: Record<string, string | boolean>, status = 200): Partial<Response> => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

const htmlResponse = (html: string, status = 200): Partial<Response> => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'OK',
  headers: new Headers({ 'Content-Type': 'text/html' }),
  json: async () => {
    throw new Error('not json');
  },
  text: async () => html,
});

const getMockFetch = () => vi.mocked(fetch);

const urlOf = (input: RequestInfo | URL | undefined): string => (input instanceof Request ? input.url : String(input));

/** Routes fetch by URL: rpc/app handlers for bootstrap, default for API calls. */
const routeFetch = (handlers: {
  rpc?: () => Partial<Response>;
  app?: () => Partial<Response>;
  request?: () => Partial<Response>;
}) => {
  getMockFetch().mockImplementation(async (url) => {
    const target = urlOf(url);
    if (target === RPC_URL) {
      return (handlers.rpc?.() ?? jsonResponse({ message: '' }, 403)) as Response;
    }
    if (target === APP_URL) {
      return (handlers.app?.() ?? htmlResponse('<html></html>', 403)) as Response;
    }
    return (handlers.request?.() ?? jsonResponse({ success: true })) as Response;
  });
};

const requestHeaders = (callIndex: number): Headers | undefined =>
  getMockFetch().mock.calls[callIndex]?.[1]?.headers as Headers | undefined;

describe('HttpClient CSRF bootstrap on React Native (cookie auth)', () => {
  beforeEach(() => {
    cookieStore.clear();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('bootstraps the CSRF token via the sessions RPC before the first mutation', async () => {
    const client = new HttpClient(baseURL);
    routeFetch({ rpc: () => jsonResponse({ message: 'tok-rpc' }) });

    await client.request(HttpMethod.Post, '/api/resource/ToDo', { body: { description: 'x' } });

    const { calls } = getMockFetch().mock;
    expect(calls).toHaveLength(2);
    // 1st request: the CSRF bootstrap GET, with cookies (OS jar) attached.
    expect(urlOf(calls[0][0])).toBe(RPC_URL);
    expect(calls[0][1]).toMatchObject({ method: 'GET', credentials: 'include' });
    // 2nd request: the actual mutation, carrying the bootstrapped token.
    expect(urlOf(calls[1][0])).toBe(`${baseURL}/api/resource/ToDo`);
    expect(requestHeaders(1)?.get('X-Frappe-CSRF-Token')).toBe('tok-rpc');
  });

  it('falls back to parsing the /app boot HTML when the RPC is not whitelisted', async () => {
    // This repo's bench does NOT whitelist frappe.sessions.get_csrf_token —
    // the /app page injects `frappe.csrf_token = "…"` for desk sessions.
    const client = new HttpClient(baseURL);
    routeFetch({
      rpc: () => jsonResponse({ exc_type: 'PermissionError' }, 403),
      app: () => htmlResponse('<script>frappe.csrf_token = "tok-html";</script>'),
    });

    await client.request(HttpMethod.Post, '/api/resource/ToDo', { body: { description: 'x' } });

    const { calls } = getMockFetch().mock;
    expect(calls.map((c) => urlOf(c[0]))).toStrictEqual([RPC_URL, APP_URL, `${baseURL}/api/resource/ToDo`]);
    expect(requestHeaders(2)?.get('X-Frappe-CSRF-Token')).toBe('tok-html');
  });

  it('caches the bootstrapped token across mutations', async () => {
    const client = new HttpClient(baseURL);
    routeFetch({ rpc: () => jsonResponse({ message: 'tok-rpc' }) });

    await client.post('/api/resource/ToDo', { description: 'a' });
    await client.post('/api/resource/ToDo', { description: 'b' });

    const bootstrapCalls = getMockFetch().mock.calls.filter((c) => urlOf(c[0]) === RPC_URL);
    expect(bootstrapCalls).toHaveLength(1);
    expect(requestHeaders(2)?.get('X-Frappe-CSRF-Token')).toBe('tok-rpc');
  });

  it('proceeds without the header when no token source is available', async () => {
    // Sessions without a CSRF token (pure API sessions) pass frappe's
    // validation without the header — the request must not be blocked.
    const client = new HttpClient(baseURL);
    routeFetch({});

    const result = await client.post('/api/resource/ToDo', { description: 'x' });

    expect(result.status).toBe(200);
    const apiCall = getMockFetch().mock.calls.findIndex((c) => urlOf(c[0]) === `${baseURL}/api/resource/ToDo`);
    expect(requestHeaders(apiCall)?.get('X-Frappe-CSRF-Token')).toBeNull();
  });

  it('does not bootstrap for GET requests', async () => {
    const client = new HttpClient(baseURL);
    routeFetch({});

    await client.get('/api/resource/ToDo');

    expect(getMockFetch()).toHaveBeenCalledOnce();
    expect(urlOf(getMockFetch().mock.calls[0][0])).toBe(`${baseURL}/api/resource/ToDo`);
  });

  it('never bootstraps under token auth (unchanged path)', async () => {
    const client = new HttpClient(baseURL, {
      useToken: true,
      token: 'api-key:api-secret',
      type: AuthType.Token,
    });
    routeFetch({});

    await client.post('/api/resource/ToDo', { description: 'x' });

    const { calls } = getMockFetch().mock;
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ credentials: 'omit' });
    const headers = requestHeaders(0);
    expect(headers?.get('Authorization')).toBe('token api-key:api-secret');
    expect(headers?.get('X-Frappe-CSRF-Token')).toBeNull();
  });

  it('prefers a token already present in the platform cookie shim', async () => {
    cookieStore.set('frappe-csrf-token', 'tok-shim');
    const client = new HttpClient(baseURL);
    routeFetch({});

    await client.post('/api/resource/ToDo', { description: 'x' });

    expect(getMockFetch()).toHaveBeenCalledOnce();
    expect(requestHeaders(0)?.get('X-Frappe-CSRF-Token')).toBe('tok-shim');
  });

  it('drops the cached token on a 400 so the next mutation re-bootstraps', async () => {
    const client = new HttpClient(baseURL);
    let rpcCalls = 0;
    let failNext = true;
    routeFetch({
      rpc: () => {
        rpcCalls += 1;
        return jsonResponse({ message: `tok-${rpcCalls}` });
      },
      request: () => {
        if (failNext) {
          failNext = false;
          return jsonResponse({ message: 'Invalid Request' }, 400);
        }
        return jsonResponse({ success: true });
      },
    });

    // First mutation: bootstraps tok-1, server rejects with 400 (rotated
    // session / stale CSRF) — the cached token must be invalidated.
    await expect(client.post('/api/resource/ToDo', { description: 'x' })).rejects.toThrow(FrappeError);
    // Second mutation: re-bootstraps and succeeds with the fresh token.
    await client.post('/api/resource/ToDo', { description: 'x' });

    expect(rpcCalls).toBe(2);
    const lastApiCall = getMockFetch().mock.calls.length - 1;
    expect(requestHeaders(lastApiCall)?.get('X-Frappe-CSRF-Token')).toBe('tok-2');
  });

  it('clears the cached token when auth changes', async () => {
    const client = new HttpClient(baseURL);
    let rpcCalls = 0;
    routeFetch({
      rpc: () => {
        rpcCalls += 1;
        return jsonResponse({ message: `tok-${rpcCalls}` });
      },
    });

    await client.post('/api/resource/ToDo', { description: 'x' });
    client.updateAuth({});
    await client.post('/api/resource/ToDo', { description: 'y' });

    expect(rpcCalls).toBe(2);
  });
});

import { getCookie, isNative } from '@repo/platform';

import { hasField, isBrowser, isObject, isString } from '../util';

import { readServerMessages } from './server-messages';
import { AuthType, FrappeError, HttpMethod } from './types';
import type { AuthConfig, RetryConfig } from './types';

export { getCookie, setCookie, deleteCookie } from '@repo/platform';

const CONTENT_TYPE = 'Content-Type';
const MULTIPART = 'multipart/form-data';
const URL_ENCODED = 'application/x-www-form-urlencoded';
const JSON_TYPE = 'application/json';

const defaultRetryConfig: RetryConfig = {
  baseDelayMs: 250,
  exponentialBackoff: true,
  maxDelayMs: 5000,
  maxRetries: 3,
  retryOnNetworkError: true,
  retryStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * An aborted request is a deliberate caller cancellation, not a transient
 * network failure — it must bypass the retry loop entirely (retrying would
 * re-issue a request the caller explicitly gave up on).
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a caught value; it is only ever probed with instanceof
const isAbortError = (err: unknown, signal?: AbortSignal): boolean => {
  if (signal?.aborted === true) {
    return true;
  }
  return err instanceof Error && err.name === 'AbortError';
};

const isTokenProvider = (token: AuthConfig['token']): token is () => string | Promise<string> =>
  typeof token === 'function';

const sleep = async (ms: number): Promise<void> => {
  // oxlint-disable-next-line promise/avoid-new -- setTimeout has no promise form on every runtime this ships to
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

/** The fields of a Frappe error body that can carry a user-facing message. */
interface ErrorBody {
  _server_messages?: unknown;
  exc?: unknown;
  exception?: unknown;
  message?: unknown;
}

const nonBlankText = (value: ErrorBody[keyof ErrorBody]): string | undefined =>
  isString(value) && value.trim() !== '' ? value : undefined;

/**
 * The user-facing sentence for a failed response.
 *
 * With `developer_mode` on, Frappe puts a full python traceback in `exc`, and
 * reading that first meant every permission failure surfaced a traceback as its
 * error message — which components then rendered verbatim into the UI. The
 * readable sentence is in `_server_messages`, and it is preferred here; `exc`
 * is a last resort and contributes only its final line (the actual raise),
 * never the whole stack.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw response body; this function is its parser
export const errorMessageFromPayload = (payload: unknown, statusText: string): string => {
  // A non-JSON body is usually an HTML error page — frappe's dev server emits a
  // full werkzeug debug page for a dropped connection. The status line is the
  // only part of that safe to show a user.
  if (isString(payload)) {
    return statusText || payload;
  }
  if (!isObject(payload)) {
    return statusText;
  }
  const body: ErrorBody = payload;

  const message = nonBlankText(body.message);
  if (message !== undefined) {
    return message;
  }

  const serverMessages = readServerMessages(body._server_messages);
  if (serverMessages.length > 0) {
    return serverMessages.join('\n');
  }

  const exception = nonBlankText(body.exception);
  if (exception !== undefined) {
    return exception;
  }

  const exc = nonBlankText(body.exc);
  if (exc !== undefined) {
    const lines = exc
      .split('\\n')
      .flatMap((line) => line.split('\n'))
      .map((line) => line.trim())
      .filter((line) => line !== '' && line !== '"]' && line !== '["');
    const lastFrame = lines.at(-1);
    if (lastFrame !== undefined) {
      return lastFrame.replace(/^\[?"?/u, '').replace(/"?\]?$/u, '');
    }
  }

  if (body.message !== undefined && body.message !== null) {
    // oxlint-disable-next-line typescript/no-base-to-string -- a non-string message is a scalar in practice; String() is the display coercion
    return String(body.message);
  }
  return statusText;
};
/** A JSON-style object with caller-defined fields: a request body or query params. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- callers send arbitrary Frappe fields; values are encoded, never read
type WireRecord = Record<string, unknown>;

/**
 * `any` values rather than `WireRecord`: callers pass interface-typed bodies, and interfaces
 * only satisfy a `Record<string, any>` index signature. Values are encoded, never read.
 */
// oxlint-disable-next-line typescript/no-explicit-any, anti-slop/no-unsafe-dictionary-type -- see above
export type RequestBody = BodyInit | Record<string, any> | unknown[] | ArrayBufferView;

export interface HttpResponse<T> {
  _res: Response;
  headers: Headers;
  payload: T;
  status: number;
}

/** SSR cookie storage for non-browser environments */
let ssrCookies: Map<string, string> | null = null;

const normalizeParams = (params: WireRecord) =>
  Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]): [string, string] => [key, isString(value) ? value : JSON.stringify(value)]),
  );

const queryString = (params: WireRecord | undefined): string =>
  params ? `?${new URLSearchParams(normalizeParams(params)).toString()}` : '';

const isBufferOrForm = (body: RequestBody): boolean =>
  body instanceof ArrayBuffer || body instanceof Blob || body instanceof FormData;

/** Bodies fetch sends as they are. */
const isNativeBody = (body: RequestBody): body is BodyInit | ArrayBufferView =>
  isBufferOrForm(body) || body instanceof ReadableStream || body instanceof URLSearchParams || ArrayBuffer.isView(body);

/** The content type a request is encoded as: a form body or form header wins over the declared header. */
const resolveContentType = (headers: Headers, body: RequestBody | undefined): string | null => {
  const declared = headers.get(CONTENT_TYPE);
  if (declared?.includes(MULTIPART) === true || (typeof FormData !== 'undefined' && body instanceof FormData)) {
    return MULTIPART;
  }
  if (
    declared?.includes(URL_ENCODED) === true ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
  ) {
    return URL_ENCODED;
  }
  return declared;
};

/** Encodes a request body for fetch, setting the matching Content-Type on `headers`. */
const encodeBody = (body: RequestBody | null | undefined, headers: Headers): BodyInit | undefined => {
  if (body === undefined || body === null || body === '') {
    return undefined;
  }
  if (isNativeBody(body)) {
    // SAFETY: fetch accepts every ArrayBufferView as a BufferSource; lib.dom's
    // BodyInit only spells it with an ArrayBuffer-backed buffer.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return body as BodyInit;
  }
  const contentType = resolveContentType(headers, body);
  if (contentType === MULTIPART) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (isString(value) || value instanceof Blob) {
        formData.append(key, value);
      }
    }
    headers.set(CONTENT_TYPE, MULTIPART);
    return formData;
  }
  if (contentType === URL_ENCODED) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (isString(value)) {
        searchParams.append(key, value);
      }
    }
    headers.set(CONTENT_TYPE, URL_ENCODED);
    return searchParams.toString();
  }
  if (isString(body)) {
    return body;
  }
  headers.set(CONTENT_TYPE, JSON_TYPE);
  return JSON.stringify(body);
};

/** A response body: parsed JSON when the server says so, text otherwise. */
// oxlint-disable-next-line anti-slop/no-unknown-returns -- the body is unparsed by design: callers name it with T or hand it to errorMessageFromPayload
const readPayload = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get(CONTENT_TYPE);
  return contentType?.includes(JSON_TYPE) === true ? await res.json() : await res.text();
};

export class HttpClient {
  private readonly retryConfig: RetryConfig;
  // Language preference for Accept-Language header (used in SSR / React Native)
  private _language?: string;
  /** Server-bootstrapped CSRF token for React Native cookie auth (see ensureNativeCsrfToken); null until a bootstrap completes (even one that yielded no token). */
  private nativeCsrf: { token: string | undefined } | null = null;
  /** In-flight CSRF bootstrap, deduped across concurrent mutating requests. */
  private csrfBootstrap: Promise<void> | null = null;
  private readonly baseURL: string;
  private auth?: AuthConfig;

  constructor(baseURL: string, auth?: AuthConfig, retryConfig?: RetryConfig) {
    this.baseURL = baseURL;
    this.auth = auth;
    this.retryConfig = { ...defaultRetryConfig, ...retryConfig };
  }

  /** Set language preference for Accept-Language header on all requests. */
  setLanguage(lang: string) {
    this._language = lang;
  }

  /** Get resolved language: explicit > cookie > undefined. */
  getLanguage(): string | undefined {
    if (this._language !== undefined && this._language !== '') {
      return this._language;
    }
    if (isBrowser()) {
      return getCookie('preferred_language') ?? undefined;
    }
    return undefined;
  }

  /** Sync language preference to Frappe user profile (authenticated users). */
  async syncUserLanguage(lang: string, user?: string): Promise<void> {
    this._language = lang;
    await this.post('/api/method/frappe.client.set_value', {
      doctype: 'User',
      name: user ?? 'currentuser',
      fieldname: 'language',
      value: lang,
    });
  }

  /**
   * React Native cookie-auth CSRF bootstrap.
   *
   * RN's fetch sends the OS cookie jar (so cookie-auth sessions work), but
   * JS cannot READ those cookies — the platform `getCookie` shim is an
   * in-memory map that never sees the `sid`/CSRF cookies — so mutating
   * requests would 400 once the session has a CSRF token. Fetch the token
   * from the server instead and cache it per client:
   *
   *   1. `GET /api/method/frappe.sessions.get_csrf_token` — whitelisted on
   *      newer frappe versions; cheap JSON round-trip.
   *   2. Fallback: `GET /app` and parse the `frappe.csrf_token = "…"` boot
   *      script — works on every frappe (this repo's bench does NOT
   *      whitelist the RPC above) and also generates the token server-side
   *      when the session lacks one.
   *
   * Resolves undefined when neither source works (e.g. website-only session
   * without desk access); requests then proceed without the header, which
   * frappe accepts for sessions that have no CSRF token yet. The cache is
   * dropped on auth change and on a 400 from a mutating request so a
   * rotated session re-bootstraps.
   */
  private async ensureNativeCsrfToken(): Promise<string | undefined> {
    const cached = this.nativeCsrf;
    if (cached) {
      return cached.token;
    }
    this.csrfBootstrap ??= this.bootstrapNativeCsrfToken();
    await this.csrfBootstrap;
    return this.nativeCsrf?.token;
  }

  private async bootstrapNativeCsrfToken(): Promise<void> {
    try {
      this.nativeCsrf = { token: await this.fetchNativeCsrfToken() };
    } finally {
      this.csrfBootstrap = null;
    }
  }

  private async fetchNativeCsrfToken(): Promise<string | undefined> {
    try {
      const rpcUrl = new URL('/api/method/frappe.sessions.get_csrf_token', this.baseURL).toString();
      const res = await fetch(rpcUrl, { method: 'GET', credentials: 'include' });
      if (res.ok) {
        const payload: unknown = await res.json();
        if (hasField(payload, 'message') && isString(payload.message) && payload.message !== '') {
          return payload.message;
        }
      }
    } catch {
      // Fall through to the HTML fallback.
    }
    try {
      const appUrl = new URL('/app', this.baseURL).toString();
      const res = await fetch(appUrl, { method: 'GET', credentials: 'include' });
      if (res.ok) {
        const html = await res.text();
        const token = /frappe\.csrf_token\s*=\s*"(?<token>[^"]+)"/u.exec(html)?.groups?.token;
        if (token !== undefined) {
          return token;
        }
      }
    } catch {
      // No token available — proceed without the header.
    }
    return undefined;
  }

  private invalidateNativeCsrfToken(): void {
    this.nativeCsrf = null;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.auth?.useToken !== true) {
      return {};
    }
    const { token } = this.auth;
    const raw = isTokenProvider(token) ? await token() : token;
    if (raw === undefined || raw === '') {
      return {};
    }
    const scheme = this.auth.type === AuthType.Token ? 'token' : 'Bearer';
    return { Authorization: `${scheme} ${raw}` };
  }

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a caught value; RetryConfig.shouldRetry receives it as-is
  private shouldRetryError(err: unknown, attempt: number): boolean {
    if (this.retryConfig.shouldRetry) {
      return this.retryConfig.shouldRetry(err, attempt);
    }
    if (attempt >= Number(this.retryConfig.maxRetries)) {
      return false;
    }
    if (!(err instanceof Error && 'status' in err)) {
      return Boolean(this.retryConfig.retryOnNetworkError);
    }
    const { status } = err;
    return this.retryConfig.retryStatusCodes?.some((code) => code === status) === true;
  }

  private getRetryDelay(attempt: number) {
    const baseDelayMs = this.retryConfig.baseDelayMs ?? 0;
    if (this.retryConfig.exponentialBackoff !== true) {
      return baseDelayMs;
    }
    return Math.min(baseDelayMs * 2 ** attempt, this.retryConfig.maxDelayMs ?? 0);
  }

  /** SSR / Node.js: forward cookies explicitly (browser cookie jar is unavailable on the server). */
  private applyServerCookies(headers: Headers): void {
    // Use explicit auth cookie if provided, otherwise use SSR cookies
    const authCookie = this.auth?.cookie;
    if (authCookie !== undefined && authCookie !== '') {
      headers.set('Cookie', authCookie);
    } else if (ssrCookies && ssrCookies.size > 0) {
      // Build cookie string from SSR cookie storage
      const cookieStr = [...ssrCookies.entries()]
        .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
        .join('; ');
      if (cookieStr) {
        headers.set('Cookie', cookieStr);
      }
    }
  }

  private async applyCsrfHeader(headers: Headers): Promise<void> {
    // Desk pages also boot the token into `window.frappe.csrf_token`.
    const page: unknown = globalThis.frappe;
    const pageToken = hasField(page, 'csrf_token') && isString(page.csrf_token) ? page.csrf_token : undefined;
    let csrf = getCookie('frappe-csrf-token') ?? getCookie('csrf_token') ?? pageToken;
    // React Native cannot read the OS cookie jar — bootstrap the token
    // from the server before the first mutating request (native only;
    // web keeps the cookie-read path above unchanged).
    if ((csrf === undefined || csrf === '') && isNative) {
      csrf = await this.ensureNativeCsrfToken();
    }
    if (csrf !== undefined && csrf !== '') {
      headers.set('X-Frappe-CSRF-Token', csrf);
    }
  }

  /** Runs `send`, re-running it with backoff while `shouldRetryError` allows. */
  private async withRetry<T>(
    send: () => Promise<HttpResponse<T>>,
    signal: AbortSignal | undefined,
    attempt = 0,
  ): Promise<HttpResponse<T>> {
    try {
      return await send();
    } catch (error) {
      // An error response (FrappeError) is retried without the abort probe; only a
      // rejected fetch can be the caller's cancellation.
      if (!(error instanceof FrappeError) && isAbortError(error, signal)) {
        throw error;
      }
      if (!this.shouldRetryError(error, attempt) || attempt >= (this.retryConfig.maxRetries ?? 0)) {
        throw error;
      }
      await sleep(this.getRetryDelay(attempt));
      return await this.withRetry(send, signal, attempt + 1);
    }
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    request: {
      body?: RequestBody | null;
      headers?: Record<string, string>;
      /** Cancels the request (and any pending retry) when aborted. */
      signal?: AbortSignal;
    },
  ): Promise<HttpResponse<T>> {
    const url = new URL(path, this.baseURL).toString();
    const headers = new Headers(request?.headers);
    const body = encodeBody(request?.body, headers);
    const authHeaders = await this.getAuthHeaders();
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }
    if (!isBrowser()) {
      this.applyServerCookies(headers);
    }
    // Inject Accept-Language header from language preference or cookie
    const lang = this.getLanguage();
    if (lang !== undefined && lang !== '' && !headers.has('Accept-Language')) {
      headers.set('Accept-Language', lang);
    }
    if (this.auth?.useToken !== true && isBrowser() && method !== HttpMethod.Get) {
      await this.applyCsrfHeader(headers);
    }
    const send = async (): Promise<HttpResponse<T>> => {
      const res = await fetch(url, {
        method,
        headers,
        credentials: this.auth?.useToken === true ? 'omit' : 'include',
        body,
        signal: request?.signal,
      });
      if (!res.ok) {
        const payload = await readPayload(res);
        // Native cookie-auth: a 400 on a mutating request may be frappe's
        // CSRFTokenError from a rotated session — drop the cached token so
        // the next mutation re-bootstraps.
        if (isNative && res.status === 400 && this.auth?.useToken !== true && method !== HttpMethod.Get) {
          this.invalidateNativeCsrfToken();
        }
        throw new FrappeError(errorMessageFromPayload(payload, res.statusText), res.status, payload);
      }
      // SAFETY: the payload is the server's JSON (or text) for this endpoint; callers name its type with T.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      const payload = (await readPayload(res)) as T;
      return { headers: res.headers, payload, status: res.status, _res: res };
    };
    return await this.withRetry(send, request?.signal);
  }

  async get<T>(path: string, params?: WireRecord, headers?: Record<string, string>, signal?: AbortSignal) {
    return await this.request<T>(HttpMethod.Get, `${path}${queryString(params)}`, { headers, signal });
  }

  async post<T>(path: string, body?: RequestBody | null, headers?: Record<string, string>) {
    return await this.request<T>(HttpMethod.Post, path, { headers, body });
  }

  async put<T>(path: string, body?: RequestBody | null, headers?: Record<string, string>) {
    return await this.request<T>(HttpMethod.Put, path, { headers, body });
  }

  async delete<T>(path: string, body?: RequestBody | null, headers?: Record<string, string>) {
    return await this.request<T>(HttpMethod.Delete, path, { headers, body });
  }

  async head(path: string, params?: WireRecord, headers?: Record<string, string>) {
    return await this.request<undefined>(HttpMethod.Head, `${path}${queryString(params)}`, { headers });
  }

  getAuthConfig(): AuthConfig {
    return this.auth ?? {};
  }

  updateAuth(auth: AuthConfig) {
    this.auth = auth;
    // Auth change usually means session change — the cached native CSRF
    // token belongs to the old session.
    this.invalidateNativeCsrfToken();
  }
}

/**
 * Set cookies for SSR/Node environments where document.cookie is unavailable.
 * Pass a cookie header string (e.g., from incoming request).
 */
export const setSSRCookies = (cookieHeader: string | undefined): void => {
  if (isBrowser()) {
    return;
  }

  const cookies = new Map<string, string>();
  ssrCookies = cookies;
  if (cookieHeader === undefined || cookieHeader === '') {
    return;
  }

  for (const cookie of cookieHeader.split('; ')) {
    const eqIndex = cookie.indexOf('=');
    const name = cookie.slice(0, eqIndex).trim();
    if (eqIndex !== -1 && name !== '') {
      const value = cookie.slice(eqIndex + 1);
      try {
        cookies.set(name, decodeURIComponent(value));
      } catch {
        // Malformed percent-encoding: keep the raw value rather than drop the cookie.
        cookies.set(name, value);
      }
    }
  }
};

/**
 * Clear SSR cookies (call at end of request lifecycle).
 */
export const clearSSRCookies = (): void => {
  ssrCookies = null;
};

/**
 * Invalidate the cookie cache. No-op — retained for backwards compatibility.
 * Cookie reads now delegate directly to the platform abstraction.
 */
export const invalidateCookieCache = (): void => {
  // Intentionally empty: there is no cookie cache left to invalidate.
};

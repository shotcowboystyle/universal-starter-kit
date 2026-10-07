import { getCookie, setCookie, deleteCookie, isNative } from '@repo/platform';

import { isBrowser } from '../util';

import { readServerMessages } from './serverMessages';
import { FrappeError, HttpMethod } from './types';
import type { AuthConfig, RetryConfig } from './types';

export { getCookie, setCookie, deleteCookie };

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
function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  return err instanceof Error && err.name === 'AbortError';
}

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
export function errorMessageFromPayload(payload: unknown, statusText: string): string {
  // A non-JSON body is usually an HTML error page — frappe's dev server emits a
  // full werkzeug debug page for a dropped connection. The status line is the
  // only part of that safe to show a user.
  if (typeof payload === 'string') {
    return statusText || payload;
  }
  if (!payload || typeof payload !== 'object') {
    return statusText;
  }
  const body = payload as Record<string, unknown>;

  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }

  const serverMessages = readServerMessages(body._server_messages);
  if (serverMessages.length > 0) {
    return serverMessages.join('\n');
  }

  if (typeof body.exception === 'string' && body.exception.trim()) {
    return body.exception;
  }

  if (typeof body.exc === 'string' && body.exc.trim()) {
    const lines = body.exc
      .split('\\n')
      .flatMap((line) => line.split('\n'))
      .map((line) => line.trim())
      .filter((line) => line && line !== '"]' && line !== '["');
    const lastFrame = lines.at(-1);
    if (lastFrame) {
      return lastFrame.replace(/^\[?"?/, '').replace(/"?\]?$/, '');
    }
  }

  if (body.message !== undefined && body.message !== null) {
    return String(body.message);
  }
  return statusText;
}
export type RequestBody = BodyInit | Record<string, unknown> | unknown[] | ArrayBufferView;

export interface HttpResponse<T> {
  _res: Response;
  headers: Headers;
  payload: T;
  status: number;
}

export class HttpClient {
  private readonly retryConfig: RetryConfig;
  // Language preference for Accept-Language header (used in SSR / React Native)
  private _language?: string;
  /** Server-bootstrapped CSRF token for React Native cookie auth (see ensureNativeCsrfToken). */
  private csrfToken?: string;
  /** True once a native CSRF bootstrap attempt completed (even if it yielded no token). */
  private csrfBootstrapDone = false;
  /** In-flight CSRF bootstrap, deduped across concurrent mutating requests. */
  private csrfBootstrap?: Promise<void>;
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
    if (this._language) {
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
    if (this.csrfBootstrapDone) {
      return this.csrfToken;
    }
    this.csrfBootstrap ??= this.fetchNativeCsrfToken()
      .then((token) => {
        this.csrfToken = token;
        this.csrfBootstrapDone = true;
      })
      .finally(() => {
        this.csrfBootstrap = undefined;
      });
    await this.csrfBootstrap;
    return this.csrfToken;
  }

  private async fetchNativeCsrfToken(): Promise<string | undefined> {
    try {
      const rpcUrl = new URL('/api/method/frappe.sessions.get_csrf_token', this.baseURL).toString();
      const res = await fetch(rpcUrl, { method: 'GET', credentials: 'include' });
      if (res.ok) {
        const payload = (await res.json()) as { message?: unknown };
        if (typeof payload?.message === 'string' && payload.message) {
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
        const match = /frappe\.csrf_token\s*=\s*"([^"]+)"/.exec(html);
        if (match?.[1]) {
          return match[1];
        }
      }
    } catch {
      // No token available — proceed without the header.
    }
    return undefined;
  }

  private invalidateNativeCsrfToken(): void {
    this.csrfToken = undefined;
    this.csrfBootstrapDone = false;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.auth?.useToken) {
      return {};
    }
    const raw = typeof this.auth.token === 'function' ? await this.auth.token() : this.auth?.token;
    if (!raw) {
      return {};
    }
    const scheme = this.auth?.type === 'token' ? 'token' : 'Bearer';
    return { Authorization: `${scheme} ${raw}` };
  }

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
    if (err && typeof err === 'object' && 'status' in err) {
      const statusCode = (err as { status: unknown }).status;
      if (typeof statusCode === 'number') {
        return Boolean(this.retryConfig.retryStatusCodes?.includes(statusCode));
      }
    }
    return false;
  }

  private getRetryDelay(attempt: number) {
    if (!this.retryConfig.exponentialBackoff) {
      return Number(this.retryConfig.baseDelayMs ?? 0);
    }
    const delay = Number(this.retryConfig.baseDelayMs ?? 0) * 2 ** attempt;
    return Math.min(delay, Number(this.retryConfig.maxDelayMs ?? 0));
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    request: {
      body?: RequestBody;
      headers?: Record<string, string>;
      /** Cancels the request (and any pending retry) when aborted. */
      signal?: AbortSignal;
    },
  ): Promise<HttpResponse<T>> {
    const url = new URL(path, this.baseURL).toString();
    let body: BodyInit;
    const headers = new Headers(request?.headers);
    let contentType = headers.get('Content-Type');
    if (
      headers.get('Content-Type')?.includes('multipart/form-data') ||
      (typeof FormData !== 'undefined' && request?.body instanceof FormData)
    ) {
      contentType = 'multipart/form-data';
    } else if (
      headers.get('Content-Type')?.includes('application/x-www-form-urlencoded') ||
      (typeof URLSearchParams !== 'undefined' && request?.body instanceof URLSearchParams)
    ) {
      contentType = 'application/x-www-form-urlencoded';
    }
    if (request?.body) {
      if (
        request?.body instanceof ArrayBuffer ||
        request?.body instanceof Blob ||
        request?.body instanceof FormData ||
        request?.body instanceof ReadableStream ||
        request?.body instanceof URLSearchParams ||
        ArrayBuffer.isView(request.body)
      ) {
        body = request.body as unknown as BodyInit;
      } else {
        if (contentType === 'multipart/form-data') {
          const formData = new FormData();
          for (const [key, value] of Object.entries(request.body)) {
            if (typeof value === 'string' || value instanceof Blob) {
              formData.append(key, value);
            }
          }
          body = formData;
          headers.set('Content-Type', 'multipart/form-data');
        } else if (contentType === 'application/x-www-form-urlencoded') {
          const searchParams = new URLSearchParams();
          for (const [key, value] of Object.entries(request.body)) {
            if (typeof value === 'string') {
              searchParams.append(key, value);
            }
          }
          body = searchParams.toString();
          headers.set('Content-Type', 'application/x-www-form-urlencoded');
        } else if (typeof request.body === 'object') {
          body = JSON.stringify(request.body);
          headers.set('Content-Type', 'application/json');
        } else {
          body = request.body as unknown as BodyInit;
        }
      }
    }
    const authHeaders = await this.getAuthHeaders();
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }
    // SSR / Node.js: forward cookies explicitly (browser cookie jar is
    // unavailable on the server).
    if (!isBrowser()) {
      // Use explicit auth cookie if provided, otherwise use SSR cookies
      if (this.auth?.cookie) {
        headers.set('Cookie', this.auth.cookie);
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
    // Inject Accept-Language header from language preference or cookie
    const lang = this.getLanguage();
    if (lang && !headers.has('Accept-Language')) {
      headers.set('Accept-Language', lang);
    }
    if (!this.auth?.useToken && isBrowser() && method !== HttpMethod.Get) {
      let csrf = getCookie('frappe-csrf-token') ?? getCookie('csrf_token') ?? globalThis.frappe?.csrf_token;
      // React Native cannot read the OS cookie jar — bootstrap the token
      // from the server before the first mutating request (native only;
      // web keeps the cookie-read path above unchanged).
      if (!csrf && isNative) {
        csrf = await this.ensureNativeCsrfToken();
      }
      if (csrf) {
        headers.set('X-Frappe-CSRF-Token', csrf);
      }
    }
    const makeRequest = async (): Promise<Response> =>
      await fetch(url, {
        method,
        headers,
        credentials: this.auth?.useToken ? 'omit' : 'include',
        body,
        signal: request?.signal,
      });
    let lastError: unknown;
    let attempt = 0;
    while (attempt <= Number(this.retryConfig.maxRetries ?? 0)) {
      try {
        const res = await makeRequest();
        if (!res.ok) {
          const contentType = res.headers.get('content-type');
          const payload = contentType?.includes('application/json') ? await res.json() : await res.text();
          const message = errorMessageFromPayload(payload, res.statusText);
          const err = new FrappeError(message, res.status, payload);
          // Native cookie-auth: a 400 on a mutating request may be frappe's
          // CSRFTokenError from a rotated session — drop the cached token so
          // the next mutation re-bootstraps.
          if (isNative && res.status === 400 && !this.auth?.useToken && method !== HttpMethod.Get) {
            this.invalidateNativeCsrfToken();
          }
          if (this.shouldRetryError(err, attempt)) {
            lastError = err;
            attempt++;
            if (attempt <= Number(this.retryConfig.maxRetries ?? 0)) {
              await new Promise((resolve) => setTimeout(resolve, this.getRetryDelay(attempt - 1)));
              continue;
            }
          }
          throw err;
        }
        const contentType = res.headers.get('Content-Type');
        const payload = contentType?.includes('application/json') ? await res.json() : await res.text();
        return {
          headers: res.headers,
          payload,
          status: res.status,
          _res: res,
        };
      } catch (error) {
        if (isAbortError(error, request?.signal)) {
          throw error;
        }
        if (this.shouldRetryError(error, attempt)) {
          lastError = error;
          attempt++;
          if (attempt <= Number(this.retryConfig.maxRetries ?? 0)) {
            await new Promise((resolve) => setTimeout(resolve, this.getRetryDelay(attempt - 1)));
            continue;
          }
        }
        throw error;
      }
    }
    throw lastError;
  }

  async get<T>(path: string, params?: Record<string, unknown>, headers?: Record<string, string>, signal?: AbortSignal) {
    const qs = params ? `?${new URLSearchParams(normalizeParams(params)).toString()}` : '';
    return await this.request<T>(HttpMethod.Get, `${path}${qs}`, { headers, signal });
  }

  async post<T>(path: string, body?: RequestBody, headers?: Record<string, string>) {
    return await this.request<T>(HttpMethod.Post, path, { headers, body });
  }

  async put<T>(path: string, body?: RequestBody, headers?: Record<string, string>) {
    return await this.request<T>(HttpMethod.Put, path, { headers, body });
  }

  async delete<T>(path: string, body?: RequestBody, headers?: Record<string, string>) {
    return await this.request<T>(HttpMethod.Delete, path, { headers, body });
  }

  async head(path: string, params?: Record<string, unknown>, headers?: Record<string, string>) {
    const qs = params ? `?${new URLSearchParams(normalizeParams(params)).toString()}` : '';
    return await this.request<void>(HttpMethod.Head, `${path}${qs}`, { headers });
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

function normalizeParams(params: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      normalized[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }
  return normalized;
}

/** SSR cookie storage for non-browser environments */
let ssrCookies: Map<string, string> | null = null;

/**
 * Set cookies for SSR/Node environments where document.cookie is unavailable.
 * Pass a cookie header string (e.g., from incoming request).
 */
export function setSSRCookies(cookieHeader: string | undefined): void {
  if (isBrowser()) {
    return;
  }

  ssrCookies = new Map();
  if (!cookieHeader) {
    return;
  }

  const cookies = cookieHeader.split('; ');
  for (const cookie of cookies) {
    const eqIndex = cookie.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const name = cookie.slice(0, eqIndex).trim();
    const value = cookie.slice(eqIndex + 1);

    if (!name) {
      continue;
    }

    try {
      ssrCookies.set(name, decodeURIComponent(value));
    } catch {
      ssrCookies.set(name, value);
    }
  }
}

/**
 * Clear SSR cookies (call at end of request lifecycle).
 */
export function clearSSRCookies(): void {
  ssrCookies = null;
}

/**
 * Invalidate the cookie cache. No-op — retained for backwards compatibility.
 * Cookie reads now delegate directly to the platform abstraction.
 */
export function invalidateCookieCache(): void {}

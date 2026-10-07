import { isNative } from '@repo/platform';
import type { ManagerOptions, Socket, SocketOptions } from 'socket.io-client';
import { io } from 'socket.io-client';

import type { AuthConfig } from './core/types';
import { isBrowser, isGjs } from './util';

export type Handler = (payload: unknown) => void;

export enum RealtimePlatform {
  Node = 'node',
  Web = 'web',
  ReactNative = 'react-native',
}

export type RealtimeTransport = 'socketio' | 'sse';

/** One SSE frame as received off the wire (before any mapping). */
export interface SSEFrame {
  /** SSE event type — the `event:` classification line, or `"message"` for unnamed frames. */
  type: string;
  /** Raw `data:` payload (SSE data is always a string). */
  data: string;
  /** The stream's last `id:` line as of this frame (empty when the server sent none). */
  lastEventId: string;
}

/** One handler-map delivery produced by `RealtimeSSEConfig.mapFrame`. */
export interface SSEMappedEvent {
  event: string;
  payload: unknown;
}

/** Minimal structural slice of a WHATWG `MessageEvent` the SSE transport reads. */
export interface SSEMessageEventLike {
  type?: string;
  data?: unknown;
  lastEventId?: string;
}

/**
 * Minimal structural slice of the WHATWG EventSource interface used by the
 * SSE transport. The global browser/Node implementation satisfies it, and so
 * do the common polyfills (`eventsource` on npm, `react-native-sse`).
 */
export interface SSEEventSourceLike {
  addEventListener(type: string, listener: (event: SSEMessageEventLike) => void): void;
  removeEventListener(type: string, listener: (event: SSEMessageEventLike) => void): void;
  close(): void;
}

export type SSEEventSourceConstructor = new (url: string, init?: { withCredentials?: boolean }) => SSEEventSourceLike;

export interface RealtimeSSEConfig {
  /** Absolute stream URL. Wins over `path` when both are set. */
  url?: string;
  /**
   * Stream path resolved against `baseURL` (e.g.
   * `"/api/method/shc.events.stream"` for the SHC daemon). One of `url` or
   * `path` is REQUIRED: SSE endpoints are server-specific — a real Frappe
   * bench has none at all — so a framework default would only ever 404, and
   * `connect()` throws a descriptive error instead of guessing.
   */
  path?: string;
  /**
   * Browser EventSource credential mode: send cookies on the stream request.
   * This is the primary browser auth path — EventSource cannot set request
   * headers, so header-based token auth is impossible there (see
   * `queryParams` for the token alternative).
   */
  withCredentials?: boolean;
  /**
   * Injectable EventSource constructor for runtimes without a global one
   * (React Native, Node < 22, GJS) — e.g. the `eventsource` npm package or
   * `react-native-sse`. When omitted the global `EventSource` is used, and
   * `connect()` throws an error naming this option when neither exists.
   */
  EventSource?: SSEEventSourceConstructor;
  /**
   * Named SSE event types (`event:` classification lines) to listen for, in
   * addition to unnamed `"message"` frames and handler-registered names.
   * EventSource only dispatches a NAMED event when a listener for that exact
   * type is attached, so `mapFrame`-driven apps — whose handler names differ
   * from the wire's frame types — must list the server's classifications
   * here (e.g. `["docker", "audit", "error", "event"]` for the SHC daemon).
   */
  events?: string[];
  /**
   * Translate one SSE frame into zero or more handler deliveries. Return
   * `null`/`undefined` to drop the frame. When omitted, the default mapping
   * delivers under the frame's `event:` type name with `JSON.parse(data)` as
   * the payload (falling back to the raw string when the data isn't JSON).
   */
  mapFrame?: (frame: SSEFrame) => SSEMappedEvent[] | null | undefined;
  /**
   * Extra query parameters appended to the stream URL — the token-auth path
   * for SSE (headers are off-limits in browsers, see `withCredentials`).
   * Values may be getters; they are re-resolved every time the EventSource
   * is (re)created, so a rotated token is picked up by `updateAuth()`'s
   * reconnect.
   */
  queryParams?: Record<string, string | (() => string | Promise<string>)>;
}

export interface RealtimeConfig {
  auth?: AuthConfig;
  baseURL: string;
  /**
   * Override the port used for the Socket.IO connection.
   *
   * In development the Frappe SocketIO server often runs on a separate port
   * (e.g. `FRAPPE_SOCKETIO_PORT=9000`) while the main Frappe HTTP server is
   * on port 8000.  Set this to the SocketIO port so the client connects to
   * the right place without needing a reverse proxy.
   *
   * When omitted the port from `baseURL` is used as-is, which is the correct
   * behaviour behind a production reverse proxy (e.g. nginx) that maps
   * `/socket.io` to the SocketIO backend.
   */
  socketPort?: number;
  /**
   * Dial the Socket.IO connection at this origin instead of deriving host and
   * port from `baseURL` + `socketPort`.
   *
   * Built for dev servers that proxy `/socket.io` on their own origin (e.g.
   * apps/one's `frappeSocketioDevProxy`): pointing the socket at the PAGE
   * origin makes the handshake same-origin, so the browser stops blocking the
   * cross-origin polling response (the reflected allow-origin is the proxy's
   * injected bench origin, not the page's). Only the connection target
   * changes — the namespace still comes from `siteName` (falling back to the
   * `baseURL` hostname), because Frappe resolves the site server-side from
   * the proxy-injected headers, not from where the client dialed.
   *
   * Wins over `socketPort` when both are set. Omit in production, where the
   * reverse proxy already serves `/socket.io` on the `baseURL` origin.
   */
  socketBaseURL?: string;
  /**
   * Frappe site name, used as the Socket.IO namespace.
   *
   * Frappe's realtime server is multi-tenant: every site lives on its own
   * Socket.IO namespace (`/<sitename>`) guarded by the auth middleware, and
   * server events are only emitted to that namespace.  Connecting to the
   * root namespace `/` silently succeeds but never receives any events.
   *
   * Defaults to the hostname of `baseURL`, which matches Frappe's own
   * site-name resolution for host-served sites (and the `default_site` of a
   * standard dev bench on localhost).
   */
  siteName?: string;
  platform?: RealtimePlatform;
  socketOptions?: Partial<ManagerOptions & SocketOptions>;
  /**
   * Wire transport for realtime events.
   *
   * - `"socketio"` (default): Frappe's real realtime server — Socket.IO with
   *   doc/doctype rooms and two-way subscribe emits. Omitting `transport`
   *   keeps this exact behavior.
   * - `"sse"`: a one-way `text/event-stream` endpoint consumed via
   *   EventSource. Built for Frappe-wire-compatible servers that serve
   *   realtime as SSE instead of Socket.IO (e.g. the SHC daemon's
   *   `GET /api/method/shc.events.stream`). Requires `sse.url` or `sse.path`.
   *   Room subscriptions become client-side bookkeeping (nothing can be
   *   emitted upstream) and `sse.mapFrame` decides how server frames fan out
   *   to handler events. Missed-event resume via the `Last-Event-ID` header
   *   is native EventSource behavior and is not reimplemented here.
   */
  transport?: RealtimeTransport;
  /** SSE transport options — only read when `transport` is `"sse"`. */
  sse?: RealtimeSSEConfig;
}

export interface DocRoom {
  doctype: string;
  name: string;
}
export interface ListRoom {
  doctype: string;
  filters?: Record<string, unknown>;
}

function docRoomKey(doctype: string, name: string) {
  return `${doctype}\0${name}`;
}

export class RealtimeModule {
  private socket: Socket | undefined;
  /** Live EventSource when the `"sse"` transport is active. */
  private eventSource: SSEEventSourceLike | undefined;
  private readonly handlerMap = new Map<string, Set<Handler>>();
  /** Tracks events with socket listeners attached to prevent duplicates. */
  private readonly attachedSocketEvents = new Set<string>();
  /** Stored socket event handler references for proper cleanup. */
  private readonly socketEventHandlers = new Map<string, (payload: unknown) => void>();
  /** Tracks SSE event types with listeners attached to prevent duplicates. */
  private readonly attachedSseEvents = new Set<string>();
  /** Stored SSE listener references for proper cleanup. */
  private readonly sseListeners = new Map<string, (event: SSEMessageEventLike) => void>();
  /** One-shot debug notices for SSE's one-way limitations. */
  private sseRoomNoticeLogged = false;
  private sseEmitNoticeLogged = false;
  /** Active doc rooms — re-emitted on every (re)connect. */
  private readonly docRooms = new Map<string, DocRoom>();
  /** Active list rooms — re-emitted on every (re)connect. */
  private readonly listRooms = new Map<string, ListRoom>();
  private socketHealthy = false;
  private isConnecting = false;
  private readonly healthyWaiters = new Set<(ok: boolean) => void>();
  private readonly config: RealtimeConfig;
  /** In-flight credential re-resolution (deduped across triggers). */
  private authRefreshInflight?: Promise<void>;

  constructor(config: RealtimeConfig) {
    this.config = {
      ...config,
      platform: config.platform ?? this.detectPlatform(),
    };
  }

  private detectPlatform() {
    // GJS (GNOME desktop) FIRST: isBrowser() is true there (the sync engine
    // runs), but the Web classification would be wrong — GJS has no XHR for
    // a polling-first handshake, and its WebSocket comes from an
    // entry-installed libsoup polyfill that DOES accept custom handshake
    // headers (RN-style `{ headers }` third argument). Classify like Node:
    // websocket-first transports + the extraHeaders auth path.
    if (isGjs()) {
      return RealtimePlatform.Node;
    }
    // React Native next: RN sets navigator.product === "ReactNative" but no
    // userAgent, so a UA-only sniff misclassifies RN as Web — skipping the
    // extraHeaders auth path (sid cookie / Origin) and connecting cookie-auth
    // sockets as guest. The platform package's static isNative flag is the
    // canonical signal; the navigator checks are runtime fallbacks (kept for
    // environments that fake a RN UA, e.g. tests).
    if (
      isNative ||
      (typeof navigator !== 'undefined' &&
        (navigator.product === 'ReactNative' || navigator.userAgent?.includes('ReactNative')))
    ) {
      return RealtimePlatform.ReactNative;
    }
    if (!isBrowser()) {
      return RealtimePlatform.Node;
    }
    return RealtimePlatform.Web;
  }

  private getSocketURL(): string {
    const base = this.config.baseURL.replace(/\/$/, '');
    // Same-origin override: dial socketBaseURL directly (e.g. the page
    // origin, whose dev server proxies /socket.io to the bench's socketio).
    // The namespace is still siteName — falling back to the baseURL hostname
    // exactly like the derived path below, NOT the socketBaseURL hostname,
    // which would be the dev-server host and never a Frappe site.
    if (this.config.socketBaseURL) {
      const socketBase = this.config.socketBaseURL.replace(/\/$/, '');
      let { siteName } = this.config;
      if (!siteName) {
        try {
          siteName = new URL(base).hostname;
        } catch {
          siteName = base.replace(/^https?:\/\//, '').split(/[/:]/)[0];
        }
      }
      return `${socketBase}/${siteName}`;
    }
    try {
      const url = new URL(base);
      // Assemble origin from parts instead of mutating url.port and reading
      // url.origin: minimal URL polyfills (e.g. the GJS/react-gnome shim)
      // parse host at construction and never recompute origin from a port
      // assignment — which silently dropped socketPort and pointed the
      // socket at the web server.
      const port = this.config.socketPort ? String(this.config.socketPort) : url.port;
      const host = port ? `${url.hostname}:${port}` : url.hostname;
      // The path portion of the URL passed to io() is the Socket.IO
      // namespace — frappe requires it to be the site name (see siteName).
      const siteName = this.config.siteName ?? url.hostname;
      return `${url.protocol}//${host}/${siteName}`;
    } catch {
      // Fallback: string manipulation when URL constructor isn't available
      let result = base;
      if (this.config.socketPort) {
        result = result.replace(/(:\d+)/, `:${this.config.socketPort}`);
      }
      const siteName = this.config.siteName ?? result.replace(/^https?:\/\//, '').split(/[/:]/)[0];
      return `${result}/${siteName}`;
    }
  }

  private async getAuthOptions(): Promise<Partial<ManagerOptions & SocketOptions>> {
    const authOptions: Partial<ManagerOptions & SocketOptions> = {};
    if (this.config.platform !== RealtimePlatform.Web) {
      // Non-browser clients must send an Origin header themselves: frappe's
      // socketio middleware rejects mismatched Origin/Host hostnames AND uses
      // the Origin as the base URL for its can_subscribe_* permission
      // callbacks to the web server — so it must point at the WEB base URL
      // (baseURL), not the socketio port. The Web platform must NEVER set it:
      // Origin is a forbidden header in browsers (they always send the page
      // origin themselves), and attempting it makes engine.io's XHR transport
      // log "Attempt to set a forbidden header was denied: Origin" on every
      // polling request. Browser-like TEST runtimes (happy-dom/jsdom over
      // node transports) that need a bench-pointing Origin opt in via
      // `platform: RealtimePlatform.Node` or `socketOptions.extraHeaders`.
      try {
        authOptions.extraHeaders = { Origin: new URL(this.config.baseURL).origin };
      } catch {
        authOptions.extraHeaders = { Origin: this.config.baseURL.replace(/\/$/, '') };
      }
    }
    if (this.config.platform !== RealtimePlatform.Web && this.config.auth?.sessionId) {
      const sessionId =
        typeof this.config.auth.sessionId === 'function'
          ? await this.config.auth.sessionId()
          : this.config.auth.sessionId;
      const Cookie = `sid=${sessionId}`;
      authOptions.extraHeaders = {
        ...authOptions.extraHeaders,
        Cookie,
      };
    }
    if (this.config.auth?.useToken && this.config.auth.token) {
      const token =
        typeof this.config.auth.token === 'function' ? await this.config.auth.token() : this.config.auth.token;
      // Skip when the getter resolves empty (signed out): a bare
      // "Bearer " header would fail frappe's auth instead of falling
      // back to guest.
      if (token) {
        const authType = this.config.auth.type ?? 'Bearer';
        authOptions.extraHeaders ??= {};
        authOptions.extraHeaders.Authorization = authType === 'Bearer' ? `Bearer ${token}` : `token ${token}`;
      }
    }
    if (authOptions.extraHeaders) {
      // Mirror headers into per-transport options: node websocket reads
      // transportOptions.websocket.extraHeaders, browser polling reads the
      // top-level extraHeaders — covering both keeps every handshake
      // (initial, upgrade, reconnect) authenticated.
      authOptions.transportOptions = {
        websocket: { extraHeaders: { ...authOptions.extraHeaders } },
        polling: { extraHeaders: { ...authOptions.extraHeaders } },
      };
    }
    return authOptions;
  }

  /**
   * Re-resolve credentials (token function / session id) and swap them into
   * the LIVE manager options in place. Socket.IO constructs a fresh engine
   * from `manager.opts` on every (re)connect attempt, so mutating the opts
   * makes the next handshake carry the refreshed token — without tearing
   * down handlers or room subscriptions. Called on disconnect and before
   * reconnect attempts so a token that rotated mid-session (e.g. Keycloak
   * refresh) never strands the socket in an auth-rejected retry loop.
   */
  private async refreshSocketAuth(): Promise<void> {
    const { socket } = this;
    if (!socket) {
      return;
    }
    if (this.authRefreshInflight) {
      return await this.authRefreshInflight;
    }
    this.authRefreshInflight = (async () => {
      try {
        const authOptions = await this.getAuthOptions();
        const manager = (socket as { io?: { opts?: Record<string, unknown> } }).io;
        if (manager?.opts) {
          Object.assign(manager.opts, authOptions);
        }
      } catch {
        // Keep the previous credentials; the next disconnect/reconnect
        // cycle retries the refresh.
      } finally {
        this.authRefreshInflight = undefined;
      }
    })();
    return await this.authRefreshInflight;
  }

  private resolveHealthyWaiters(ok: boolean) {
    for (const resolve of this.healthyWaiters) {
      resolve(ok);
    }
    this.healthyWaiters.clear();
  }

  private isSSE(): boolean {
    return this.config.transport === 'sse';
  }

  private async waitUntilHealthy(timeoutMs = 20_000): Promise<boolean> {
    if (this.isHealthy()) {
      return true;
    }
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.healthyWaiters.delete(onReady);
        resolve(false);
      }, timeoutMs);
      const onReady = (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      };
      this.healthyWaiters.add(onReady);
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.isHealthy()) {
      return;
    }
    if (!this.socket && !this.eventSource && !this.isConnecting) {
      await this.connect();
    }
    await this.waitUntilHealthy();
  }

  private resubscribeRooms(): void {
    if (!this.socket || !this.socketHealthy) {
      return;
    }
    // Frappe's socketio handlers take POSITIONAL args (doctype, docname) —
    // not an object payload — and list-level subscription is doctype_subscribe.
    for (const room of this.docRooms.values()) {
      this.socket.emit('doc_subscribe', room.doctype, room.name);
    }
    for (const room of this.listRooms.values()) {
      this.socket.emit('doctype_subscribe', room.doctype);
    }
  }

  /**
   * Open the realtime transport now. Room-driven auto-connect
   * (subscribeDoc/subscribeList) remains the primary lifecycle in both
   * transports — this is public for SSE consumers that use no doc/list room
   * bookkeeping: a one-way stream has nothing to emit on join, so nothing
   * else would ever open it. Idempotent while a transport exists or a
   * connect is in flight.
   */
  async connect(): Promise<void> {
    if (this.isSSE()) {
      await this.connectSSE();
      return;
    }
    if (this.socket || this.isConnecting) {
      return;
    }
    this.isConnecting = true;
    try {
      const authOptions = await this.getAuthOptions();
      const socketURL = this.getSocketURL();
      // Browsers always handshake over polling first (Socket.IO's default
      // ordering): custom headers only attach to the XHR handshake (token
      // auth), session-cookie auth and reverse-proxy-injected Authorization
      // only apply to HTTP requests, and ws-upgrade-hostile dev proxies
      // (e.g. Vite in middleware mode — the Storybook dev server) hang raw
      // websocket upgrades forever, so a websocket-first browser client
      // stalls ~20s per attempt and never connects. Socket.IO upgrades the
      // established session to websocket when the path supports it.
      // Everywhere else (Node, React Native) websocket-first is fine.
      const transports =
        this.config.platform === RealtimePlatform.Web ? ['polling', 'websocket'] : ['websocket', 'polling'];
      this.socket = io(socketURL, {
        autoConnect: false,
        path: '/socket.io',
        randomizationFactor: 0.5,
        reconnection: true,
        reconnectionAttempts: Number.POSITIVE_INFINITY,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20_000,
        transports,
        withCredentials: true,
        ...authOptions,
        ...this.config.socketOptions,
      });
      this.initHandlers();
      this.socket.connect();
    } catch (error) {
      this.isConnecting = false;
      this.resolveHealthyWaiters(false);
      throw error;
    }
  }

  /**
   * SSE branch of connect(): construct an EventSource against the configured
   * stream URL. EventSource connects at construction, auto-reconnects on
   * failure, and resumes missed frames itself by sending the stream's last
   * `id:` as the `Last-Event-ID` request header — none of that is
   * reimplemented here.
   */
  private async connectSSE(): Promise<void> {
    if (this.eventSource || this.isConnecting) {
      return;
    }
    this.isConnecting = true;
    try {
      const { sse } = this.config;
      const EventSourceCtor =
        sse?.EventSource ?? (globalThis as { EventSource?: SSEEventSourceConstructor }).EventSource;
      if (!EventSourceCtor) {
        throw new Error(
          '[RealtimeModule] transport "sse" needs an EventSource implementation, and this ' +
            'runtime has no global EventSource (React Native and Node < 22 ship none). Pass a ' +
            'constructor via config.sse.EventSource — e.g. the "eventsource" npm package on ' +
            'Node or "react-native-sse" on React Native.',
        );
      }
      const url = await this.buildSSEURL();
      this.eventSource = new EventSourceCtor(url, {
        withCredentials: sse?.withCredentials,
      });
      this.initSSEHandlers();
    } catch (error) {
      this.isConnecting = false;
      this.resolveHealthyWaiters(false);
      throw error;
    }
  }

  private async buildSSEURL(): Promise<string> {
    const { sse } = this.config;
    let url: string;
    if (sse?.url) {
      url = sse.url;
    } else if (sse?.path) {
      const base = this.config.baseURL.replace(/\/$/, '');
      url = `${base}${sse.path.startsWith('/') ? '' : '/'}${sse.path}`;
    } else {
      throw new Error(
        '[RealtimeModule] transport "sse" requires config.sse.url or config.sse.path. There ' +
          'is no default stream path: SSE endpoints are server-specific (the SHC daemon ' +
          'serves "/api/method/shc.events.stream"; a real Frappe bench has no SSE endpoint ' +
          'at all), so a framework default would only ever 404.',
      );
    }
    const params = Object.entries(this.config.sse?.queryParams ?? {});
    if (params.length === 0) {
      return url;
    }
    // Built by string concatenation (not the URL constructor) so minimal URL
    // polyfills (GJS) work; getters are re-resolved on every (re)creation so
    // rotated tokens ride the next stream request.
    const parts: string[] = [];
    for (const [key, value] of params) {
      const resolved = typeof value === 'function' ? await value() : value;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(resolved)}`);
    }
    return `${url}${url.includes('?') ? '&' : '?'}${parts.join('&')}`;
  }

  private initSSEHandlers(): void {
    // New EventSource instance: reset tracking so listeners re-register fresh.
    this.attachedSseEvents.clear();
    this.sseListeners.clear();
    // Lifecycle events + unnamed (`event:`-less) frames.
    this.attachSSEListener('open');
    this.attachSSEListener('error');
    this.attachSSEListener('message');
    // Named frame types the server classifies with `event:` lines —
    // EventSource only dispatches a named event when a listener for that
    // exact type is attached, so mapFrame-driven apps declare them up front.
    for (const type of this.config.sse?.events ?? []) {
      this.attachSSEListener(type);
    }
    // Handler-map keys mirror socket.io's attach-on-register semantics: with
    // the default mapping, the frame type IS the handler event name.
    for (const event of this.handlerMap.keys()) {
      this.attachSSEListener(event);
    }
  }

  private attachSSEListener(type: string): void {
    if (!this.eventSource || this.attachedSseEvents.has(type)) {
      return;
    }
    const listener = (event: SSEMessageEventLike) => {
      this.handleSSEEvent(type, event);
    };
    this.sseListeners.set(type, listener);
    this.attachedSseEvents.add(type);
    this.eventSource.addEventListener(type, listener);
  }

  private detachSSEListener(type: string): void {
    // Lifecycle types and declared server frame types stay attached even
    // when a same-named app handler is removed — they feed health tracking
    // and mapFrame routing, not just that one handler.
    if (this.isCoreSSEType(type)) {
      return;
    }
    if (!this.eventSource || !this.attachedSseEvents.has(type)) {
      return;
    }
    const listener = this.sseListeners.get(type);
    if (listener) {
      this.eventSource.removeEventListener(type, listener);
      this.sseListeners.delete(type);
    }
    this.attachedSseEvents.delete(type);
  }

  private isCoreSSEType(type: string): boolean {
    return type === 'open' || type === 'error' || type === 'message' || (this.config.sse?.events ?? []).includes(type);
  }

  /**
   * Single entry point for everything the EventSource dispatches. Dataless
   * events are transport lifecycle (`open`/`error` as plain Events); anything
   * carrying `data` is a server frame — including frames the server
   * classified `event: error`, which arrive as MessageEvents WITH data and
   * must not be mistaken for connection errors.
   */
  private handleSSEEvent(type: string, event: SSEMessageEventLike): void {
    if (event?.data === undefined) {
      if (type === 'open') {
        this.isConnecting = false;
        this.socketHealthy = true;
        this.emitToHandlers('connected', { transport: 'sse' });
        this.resolveHealthyWaiters(true);
      } else if (type === 'error') {
        // EventSource surfaces initial-connect failures and mid-stream drops
        // through the same `error` event and keeps reconnecting on its own —
        // report unhealthy and deliver a `disconnect` (never `connect_error`)
        // so lifecycle consumers see one consistent signal, then stay out of
        // the retry loop's way. The next `open` flips healthy again.
        this.isConnecting = false;
        this.socketHealthy = false;
        this.emitToHandlers('disconnect', { reason: 'sse-error' });
        this.resolveHealthyWaiters(false);
      }
      return;
    }
    const frame: SSEFrame = {
      type,
      data: String(event.data),
      lastEventId: event.lastEventId ?? '',
    };
    const mapFrame = this.config.sse?.mapFrame;
    if (mapFrame) {
      let mapped: SSEMappedEvent[] | null | undefined;
      try {
        mapped = mapFrame(frame);
      } catch (error) {
        // A throwing mapper must not kill the stream — drop the frame.
        console.warn('[RealtimeModule] sse.mapFrame threw; frame dropped:', error);
        return;
      }
      if (!mapped) {
        return;
      }
      for (const { event: mappedEvent, payload } of mapped) {
        this.emitToHandlers(mappedEvent, payload);
      }
      return;
    }
    // Default mapping: deliver under the SSE `event:` type name with the
    // JSON-parsed data as payload, raw string when it isn't JSON.
    let payload: unknown = frame.data;
    try {
      payload = JSON.parse(frame.data);
    } catch {
      // Not JSON — deliver the raw string.
    }
    this.emitToHandlers(frame.type, payload);
  }

  /**
   * Logged once: SSE is one-way, so doc/list room membership can't be sent
   * upstream — rooms are recorded client-side (see getDocRooms/getListRooms)
   * for mapFrame-driven filtering and for a future two-way transport.
   */
  private logSSERoomNoticeOnce(): void {
    if (this.sseRoomNoticeLogged) {
      return;
    }
    this.sseRoomNoticeLogged = true;
    console.debug(
      '[RealtimeModule] SSE transport is one-way: doc/list room subscriptions are recorded ' +
        'client-side only (getDocRooms()/getListRooms()) and nothing is sent to the server — ' +
        'filter server-side via sse.queryParams or route frames with sse.mapFrame.',
    );
  }

  /**
   * Tear down the socket without clearing app handlers or room subscriptions.
   * Used by auth refresh so listeners/rooms survive credential rotation.
   */
  private softDisconnect(): void {
    if (this.socket) {
      // Prefer removeAllListeners when available (real socket.io); mocks may omit it.
      if (typeof this.socket.removeAllListeners === 'function') {
        this.socket.removeAllListeners();
      }
      this.socket.disconnect();
      this.socket = undefined;
    }
    if (this.eventSource) {
      for (const [type, listener] of this.sseListeners) {
        this.eventSource.removeEventListener(type, listener);
      }
      this.eventSource.close();
      this.eventSource = undefined;
    }
    this.attachedSocketEvents.clear();
    this.socketEventHandlers.clear();
    this.attachedSseEvents.clear();
    this.sseListeners.clear();
    this.socketHealthy = false;
    this.isConnecting = false;
    this.resolveHealthyWaiters(false);
  }

  private initHandlers(): void {
    if (!this.socket) {
      return;
    }
    // New socket instance: reset attached event tracking so listeners are re-registered fresh
    this.attachedSocketEvents.clear();
    this.socketEventHandlers.clear();
    this.socket.on('connect', () => {
      this.isConnecting = false;
      this.socketHealthy = true;
      this.resubscribeRooms();
      this.emitToHandlers('connected', { sid: this.socket?.id });
      this.resolveHealthyWaiters(true);
    });
    this.socket.on('disconnect', (reason) => {
      this.socketHealthy = false;
      // Refresh credentials right away so the first reconnect attempt
      // (>=1s later) already handshakes with a fresh token.
      void this.refreshSocketAuth();
      this.emitToHandlers('disconnect', { reason });
    });
    this.socket.on('connect_error', (error) => {
      this.isConnecting = false;
      // Auth-rejected handshakes (e.g. expired token) land here rather than
      // in "disconnect" — refresh before the manager's next retry.
      void this.refreshSocketAuth();
      this.emitToHandlers('connect_error', error);
      this.resolveHealthyWaiters(false);
    });
    // Manager-level safety net: re-resolve before every scheduled reconnect
    // attempt (covers timeouts and transport errors that skip the socket
    // level events above). Mock sockets in tests may not expose `.io`.
    const manager = (this.socket as { io?: { on?: (ev: string, fn: () => void) => void } }).io;
    manager?.on?.('reconnect_attempt', () => {
      void this.refreshSocketAuth();
    });
    // Attach listeners for existing handler events, avoiding duplicates
    for (const event of this.handlerMap.keys()) {
      this.attachSocketListener(event);
    }
  }

  /**
   * Attaches a socket listener for an event, storing the reference to prevent duplicates.
   */
  private attachSocketListener(event: string): void {
    if (!this.socket || this.attachedSocketEvents.has(event)) {
      return;
    }

    const handler = (payload: unknown) => {
      this.emitToHandlers(event, payload);
    };
    this.socketEventHandlers.set(event, handler);
    this.attachedSocketEvents.add(event);
    this.socket.on(event, handler);
  }

  /**
   * Removes a socket listener for an event.
   */
  private detachSocketListener(event: string): void {
    if (!this.socket || !this.attachedSocketEvents.has(event)) {
      return;
    }

    const handler = this.socketEventHandlers.get(event);
    if (handler) {
      this.socket.off(event, handler);
      this.socketEventHandlers.delete(event);
    }
    this.attachedSocketEvents.delete(event);
  }

  private emitToHandlers(event: string, payload: unknown) {
    const handlerSet = this.handlerMap.get(event);
    if (!handlerSet) {
      return;
    }
    for (const handler of handlerSet) {
      handler(payload);
    }
  }

  async on(event: string, handler: Handler): Promise<void> {
    let handlerSet = this.handlerMap.get(event);
    if (!handlerSet) {
      handlerSet = new Set();
      this.handlerMap.set(event, handlerSet);
    }
    handlerSet.add(handler);
    // Registering a handler does NOT open the socket. The socket lifecycle
    // is driven by room membership (subscribeDoc/subscribeList →
    // ensureConnected): handlers registered before the first room join are
    // attached by initHandlers() when that join connects. Connecting here
    // meant merely CONSTRUCTING the sync engine (which registers its event
    // handlers up front) booted a socket that nothing would ever close —
    // against an unreachable host that is an infinite reconnect-poll loop
    // surviving unmount (the fixture/mock-story socket leak).
    if (this.isSSE()) {
      this.attachSSEListener(event);
    } else {
      this.attachSocketListener(event);
    }
  }

  off(event: string, handler: Handler): void {
    const handlerSet = this.handlerMap.get(event);
    if (!handlerSet) {
      return;
    }
    handlerSet.delete(handler);
    if (handlerSet.size === 0) {
      this.handlerMap.delete(event);
      if (this.isSSE()) {
        this.detachSSEListener(event);
      } else {
        this.detachSocketListener(event);
      }
    }
  }

  async subscribeDoc(doctype: string, name: string): Promise<void> {
    this.docRooms.set(docRoomKey(doctype, name), { doctype, name });
    // SSE: room membership is recorded client-side only — subscriptions
    // cannot be emitted over a one-way stream. The room still drives the
    // transport lifecycle (connect here, idle teardown on last unsubscribe)
    // exactly like socket.io mode.
    if (this.isSSE()) {
      this.logSSERoomNoticeOnce();
    }
    await this.ensureConnected();
    if (!this.isSSE() && this.socket && this.socketHealthy) {
      // Positional args — frappe's handler signature is (doctype, docname).
      this.socket.emit('doc_subscribe', doctype, name);
    }
  }

  unsubscribeDoc(doctype: string, name: string): void {
    this.docRooms.delete(docRoomKey(doctype, name));
    if (!this.isSSE() && this.socket && this.socketHealthy) {
      this.socket.emit('doc_unsubscribe', doctype, name);
    }
    this.teardownWhenIdle();
  }

  /**
   * Subscribe to list-level updates for a doctype (`list_update` events).
   *
   * `filters` are tracked client-side only: frappe's realtime server has a
   * single room per doctype (`doctype_subscribe`) and does not support
   * filtered list rooms.
   */
  async subscribeList(doctype: string, filters?: Record<string, unknown>): Promise<void> {
    this.listRooms.set(doctype, { doctype, filters });
    if (this.isSSE()) {
      this.logSSERoomNoticeOnce();
    }
    await this.ensureConnected();
    if (!this.isSSE() && this.socket && this.socketHealthy) {
      this.socket.emit('doctype_subscribe', doctype);
    }
  }

  unsubscribeList(doctype: string): void {
    this.listRooms.delete(doctype);
    if (!this.isSSE() && this.socket && this.socketHealthy) {
      this.socket.emit('doctype_unsubscribe', doctype);
    }
    this.teardownWhenIdle();
  }

  /**
   * Tears the socket down when the last room is released. Room membership is
   * the socket's reason to exist: while any subscription holds a room, the
   * infinite Socket.IO reconnection loop is the reconnect catch-up protocol
   * working as designed — but once nothing is subscribed, that same loop is
   * a leak (unmounted consumers leaving a dead-host socket reconnect-polling
   * forever). Handlers and any re-added rooms survive: the next
   * subscribeDoc/subscribeList reconnects and re-attaches everything.
   */
  private teardownWhenIdle(): void {
    if (this.docRooms.size > 0 || this.listRooms.size > 0) {
      return;
    }
    if (!this.socket && !this.eventSource && !this.isConnecting) {
      return;
    }
    // Surface the teardown to lifecycle listeners (connection indicators)
    // before the listeners are detached from the socket.
    this.emitToHandlers('disconnect', { reason: 'idle-teardown' });
    this.softDisconnect();
  }

  isHealthy() {
    // SSE has no `connected` flag to consult — health is tracked by the
    // open/error lifecycle events on the live EventSource.
    if (this.isSSE()) {
      return this.socketHealthy && this.eventSource !== undefined;
    }
    return this.socketHealthy && this.socket?.connected === true;
  }

  disconnect(): void {
    this.softDisconnect();
    this.handlerMap.clear();
    this.docRooms.clear();
    this.listRooms.clear();
  }

  async updateAuth(auth: AuthConfig) {
    this.config.auth = auth;
    // Reconnect only when room subscriptions exist — rooms are what the
    // socket serves. Handlers alone (registered eagerly by the sync engine)
    // don't warrant a socket: an idle module stays idle across credential
    // rotation, and the next room join connects with the fresh auth.
    //
    // SSE limitation: browsers give EventSource no way to set request
    // headers, so `config.auth` (Authorization/Cookie headers) cannot ride
    // the stream request the way it rides the socket.io handshake. SSE auth
    // is cookies via `sse.withCredentials` and/or tokens via
    // `sse.queryParams` getters — both take effect by RECREATING the
    // EventSource, which is what this does. An explicitly opened stream
    // (public connect(), no rooms) is recreated too: unlike socket.io mode,
    // nothing else in the room lifecycle would ever reopen it.
    const shouldReconnect =
      this.docRooms.size > 0 || this.listRooms.size > 0 || (this.isSSE() && this.eventSource !== undefined);
    // Soft disconnect preserves handlers + rooms; hard disconnect() would wipe them
    // and make the post-check always false (previous production bug).
    this.softDisconnect();
    if (shouldReconnect) {
      await this.connect();
    }
  }

  emit(event: string, data: unknown) {
    if (this.isSSE()) {
      // SSE is one-way (server → client): there is no upstream channel to
      // carry app emits. Dropped, with a one-shot debug notice.
      if (!this.sseEmitNoticeLogged) {
        this.sseEmitNoticeLogged = true;
        console.debug(
          '[RealtimeModule] emit() is a no-op under the SSE transport — SSE is one-way ' +
            '(server → client). Use HTTP calls for client → server communication.',
        );
      }
      return;
    }
    if (this.socket && this.socketHealthy) {
      this.socket.emit(event, data);
    }
  }

  getSocket() {
    return this.socket;
  }

  /** Live EventSource when the SSE transport is connected (undefined otherwise). */
  getEventSource(): SSEEventSourceLike | undefined {
    return this.eventSource;
  }

  /**
   * Doc rooms recorded by subscribeDoc. Under SSE these are client-side
   * bookkeeping only (nothing is emitted upstream) — mapFrame-driven apps
   * consult them to filter or route frames.
   */
  getDocRooms(): DocRoom[] {
    return [...this.docRooms.values()];
  }

  /** List rooms recorded by subscribeList — same client-side semantics as getDocRooms. */
  getListRooms(): ListRoom[] {
    return [...this.listRooms.values()];
  }
}

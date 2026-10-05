// Stack-navigation seam — One router semantics over a host-native
// navigation stack.
//
// Some delivery targets can't (or shouldn't) mount One's real router
// runtime: GNOME/GJS (createApp.native → react-navigation →
// react-native-screens fabric internals), VS Code webviews and web
// extension pages (no address bar, no One server runtime). This module is
// the replacement seam those targets share: a tiny route manifest + an
// external nav store that MIRRORS a host navigation stack. A one-shim
// (`./oneAdapter` on DOM, `gnome/shims/one.ts` on GTK) backs
// useRouter/Link/useParams/useLocalSearchParams/usePathname with this
// store, so REAL feature screens navigate unmodified.
//
// Design (proven on GNOME first):
//   - Every route in the manifest is one host page, addressed by its
//     `tag`. Push/replace/back map onto the host adapter's
//     push_by_tag / replace_with_tags / pop. Page SHELLS are permanent;
//     page CONTENT mounts on first visit (visitedTags — lazy mounting).
//   - Routes may declare a `loader`; push/replace resolve it BEFORE the
//     host action (the loader bridge), so a page's first paint has its
//     loader data — the same ordering One guarantees on web.
//   - The HOST is the source of truth for the STACK: every mutation lands
//     as a host signal and the handler re-reads the host stack
//     (syncFromHost). Host-initiated pops — GTK header back button, Esc,
//     back swipe — flow through the exact same path, so the JS mirror
//     can't drift.
//   - Params are per-tag external-store snapshots (stable object identity
//     until written), read via useSyncExternalStore under the page's
//     RouteTagContext. A backgrounded page keeps its last params — same
//     behavior as One keeping a stack screen's route params alive.
//   - Navigations that arrive while NO host is attached are QUEUED and
//     flushed on attach() (react-navigation queues pre-ready actions the
//     same way). The no-host window is real even on mounted trees: child
//     effects run before the navigation host's attach effect, and StrictMode
//     remounts open a detach→attach gap — deep links must survive both, not
//     no-op based on arrival timing.
//   - REPLACE swaps the top NAVIGATION ENTRY. The manifest root is a
//     permanent shell, not a navigation entry: with nothing above the root
//     there is nothing to discard, so replace lands the target ABOVE the
//     root (like push). Cold deep links / initialHref restores therefore
//     always leave a live back affordance — the same shape react-navigation/
//     expo-router synthesize for deep links via the anchor/initial route,
//     and Adw.NavigationView's replace on an empty view (which is a push).
//     A tag appears at most once in the stack (Adw hard-errors on
//     duplicates): replacing to a page already in the back stack pops to it.
//
// No host imports here: the adapter arrives duck-typed via attach(),
// keeping this module loadable in any entry (single-screen entries pull
// the one-shim → this module without ever attaching a stack host).

import { createContext, useContext, useSyncExternalStore } from 'react';

/** Navigation trace for development; silent in production builds. */
function devLog(message: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log(message);
  }
}

export type NavParams = Record<string, string | string[] | undefined>;

export interface RouteLoaderProps {
  /** Resolved pathname, e.g. "/users/ada". */
  path: string;
  /** Route params (dynamic segments + query). */
  params: NavParams;
}

/** One-style route loader. On web, One resolves a route's loader before the
 *  client navigation completes; the seam mirrors that contract — see
 *  StackNavigator.navigate(). */
export type RouteLoader = (props: RouteLoaderProps) => unknown | Promise<unknown>;

export interface RouteDef {
  /** One-style pattern: "/", "/users", "/users/[id]". */
  pattern: string;
  /** Host page tag AND stable route id. */
  tag: string;
  /** Page title (host chrome, e.g. the GTK header bar). */
  title: string;
  /** Optional data loader — resolved BEFORE the page mounts/shows (the
   *  loader bridge). Its result is what `useLoader` returns on this
   *  route's page. */
  loader?: RouteLoader;
}

export type Href = string | { pathname: string; params?: Record<string, string | number> };

interface CompiledRoute extends RouteDef {
  segments: { literal?: string; param?: string }[];
}

export interface NavSnapshot {
  pathname: string;
  tag: string;
  depth: number;
  canGoBack: boolean;
  generation: number;
}

/** Structural view of the host navigation stack — everything the seam
 *  calls. The method names deliberately mirror Adw.NavigationView so the
 *  GTK target passes its widget straight through; DOM hosts implement the
 *  same protocol over an array (see DomNavigationHost). */
export interface NavStackAdapter {
  push_by_tag(tag: string): void;
  pop(): boolean;
  pop_to_tag(tag: string): boolean;
  replace_with_tags(tags: string[]): void;
  get_navigation_stack(): {
    get_n_items(): number;
    get_item(index: number): { get_tag(): string | null } | null;
  };
}

function compileRoute(def: RouteDef): CompiledRoute {
  const segments = def.pattern
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(/^\[(\.{3})?(.+)\]$/);
      return m ? { param: m[2] } : { literal: seg };
    });
  return { ...def, segments };
}

/** Minimal query parser — deliberately not URLSearchParams so this module
 *  has zero polyfill-order dependency (GJS entries load it before
 *  polyfills). Repeated keys become arrays. */
function parseQuery(query: string | undefined): NavParams {
  const params: NavParams = {};
  if (!query) {
    return params;
  }
  for (const pair of query.split('&')) {
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
    const value = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1));
    const prev = params[key];
    if (prev === undefined) {
      params[key] = value;
    } else if (Array.isArray(prev)) {
      prev.push(value);
    } else {
      params[key] = [prev, value];
    }
  }
  return params;
}

export function hrefToString(href: Href): string {
  if (typeof href === 'string') {
    return href;
  }
  let path = href.pathname;
  const leftover: string[] = [];
  for (const [key, raw] of Object.entries(href.params ?? {})) {
    const value = String(raw);
    const token = `[${key}]`;
    if (path.includes(token)) {
      path = path.replace(token, encodeURIComponent(value));
    } else {
      leftover.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return leftover.length ? `${path}?${leftover.join('&')}` : path;
}

const EMPTY_PARAMS: NavParams = Object.freeze({});

export class StackNavigator {
  private routes: CompiledRoute[] = [];
  private host: NavStackAdapter | null = null;
  private listeners = new Set<() => void>();
  /** Stack mirror rebuilt from the host on every pushed/popped/replaced
   *  signal. */
  private stackTags: string[] = [];
  private paramsByTag = new Map<string, NavParams>();
  private pathnameByTag = new Map<string, string>();
  /** Tags whose page content has been navigated to at least once. The host
   *  gates each page's React content on this (lazy mounting) — a tag enters
   *  the set right before its first host push and never leaves (backgrounded
   *  pages stay alive, same as One keeping stack screens mounted). */
  private visitedTags = new Set<string>();
  /** Route-loader results, per tag (the loader bridge's store). */
  private loaderDataByTag = new Map<string, unknown>();
  /** Monotonic navigation sequence — a loader that resolves after a NEWER
   *  navigation started must not perform its (stale) host action. */
  private navSeq = 0;
  /** Navigations that arrived while no host was attached — flushed FIFO on
   *  attach() so deep links survive mount ordering and remount cycles. */
  private pendingNavigations: Array<{ href: Href; mode: 'push' | 'replace' }> = [];
  private generation = 0;
  private snapshot: NavSnapshot = {
    pathname: '/',
    tag: '',
    depth: 0,
    canGoBack: false,
    generation: 0,
  };

  get isConfigured(): boolean {
    return this.routes.length > 0;
  }

  /** Register the route manifest. The FIRST route is the root page. */
  configure(defs: RouteDef[]): void {
    this.routes = defs.map(compileRoute);
    this.visitedTags = new Set();
    this.loaderDataByTag = new Map();
    this.pendingNavigations = [];
    const root = defs[0];
    if (root) {
      this.stackTags = [root.tag];
      this.visitedTags.add(root.tag);
      this.pathnameByTag.set(root.tag, root.pattern);
      this.rebuildSnapshot();
    }
  }

  /** Has this route's page been navigated to (⇒ its content may mount)? */
  isVisited(tag: string | null): boolean {
    return tag !== null && this.visitedTags.has(tag);
  }

  /** The route's last loader result (stable identity until the loader runs
   *  again). undefined when the route has no loader / hasn't resolved. */
  loaderSnapshot(tag: string | null): unknown {
    if (!tag) {
      return undefined;
    }
    return this.loaderDataByTag.get(tag);
  }

  /** Seed a restored route's params/pathname BEFORE the first React render
   *  (no host action, no stack mutation). The navigation host applies
   *  `initialHref` from its attach EFFECT, which runs after the root page's
   *  content already rendered once — a restored route's query params would
   *  miss any mount-time state seeding (e.g. a list initializing filters
   *  from useLocalSearchParams). Hosts call this while lazily initializing,
   *  when no subscribers exist yet, so the rebuild notifies nobody. */
  seedInitialRoute(href: Href): void {
    const hit = this.match(href);
    if (!hit) {
      return;
    }
    this.setRouteState(hit.route.tag, hit.pathname, hit.params);
  }

  /** Resolve a route's loader WITHOUT navigating. For the initial page:
   *  entries can `await stackNavigator.preload("/")` during top-level await
   *  (where GJS reliably drains promise jobs) so even the root page's first
   *  paint has loader data. */
  async preload(href: Href): Promise<void> {
    const hit = this.match(href);
    if (!hit?.route.loader) {
      return;
    }
    try {
      const data = await hit.route.loader({ path: hit.pathname, params: hit.params });
      this.loaderDataByTag.set(hit.route.tag, data);
      this.rebuildSnapshot();
    } catch (err) {
      console.error(`[stack nav] preload loader for ${hit.route.tag} failed: ${String(err)}`);
    }
  }

  /** Bind the live host stack (an Adw.NavigationView widget on GTK, a
   *  DomStackAdapter on DOM targets). `initialHref` (state restore) applies
   *  as a replace BEFORE queued navigations flush: a deep link that arrived
   *  while unattached is fresher intent than a persisted route, so it lands
   *  on top. */
  attach(host: NavStackAdapter, options?: { initialHref?: Href }): void {
    this.host = host;
    this.syncFromHost();
    const initialHref = options?.initialHref;
    if (initialHref !== undefined) {
      this.replace(initialHref);
    }
    for (const { href, mode } of this.pendingNavigations.splice(0)) {
      void this.navigate(href, mode);
    }
  }

  detach(): void {
    this.host = null;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): NavSnapshot => this.snapshot;

  paramsSnapshot(tag: string | null): NavParams {
    if (!tag) {
      return EMPTY_PARAMS;
    }
    return this.paramsByTag.get(tag) ?? EMPTY_PARAMS;
  }

  match(href: Href): { route: CompiledRoute; pathname: string; params: NavParams } | null {
    const str = hrefToString(href);
    const [path = '', query] = str.split('?');
    const parts = path.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.segments.length !== parts.length) {
        continue;
      }
      const params = parseQuery(query);
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i];
        const part = decodeURIComponent(parts[i]);
        if (seg.literal !== undefined) {
          if (seg.literal !== part) {
            ok = false;
            break;
          }
        } else if (seg.param !== undefined) {
          params[seg.param] = part;
        }
      }
      if (ok) {
        return { route, pathname: path === '' ? '/' : `/${parts.join('/')}`, params };
      }
    }
    return null;
  }

  push = (href: Href): void => {
    void this.navigate(href, 'push');
  };

  replace = (href: Href): void => {
    void this.navigate(href, 'replace');
  };

  /** Shared push/replace flow, incl. the loader bridge. When the target
   *  route has no loader the whole body runs SYNCHRONOUSLY (an async
   *  function only yields at its first await), preserving the original
   *  timing. With a loader, the host action waits for the loader to resolve
   *  — same contract as One on web, where client navigation completes only
   *  after the route's loader data arrived — so the page's first paint has
   *  its data (and the lazily-mounted content mounts with it). */
  private async navigate(href: Href, mode: 'push' | 'replace'): Promise<void> {
    const hit = this.match(href);
    if (!hit) {
      devLog(`[stack nav] ${mode} ${hrefToString(href)} — no page in the route manifest, ignored`);
      return;
    }
    if (!this.host) {
      // No host YET — mount ordering (child effects run before the
      // navigation host attaches) and remount cycles (StrictMode) both open
      // this window. Queue and let attach() flush; loaders run at apply
      // time so their data is fresh when the page actually shows.
      this.pendingNavigations.push({ href, mode });
      devLog(`[stack nav] ${mode} ${hrefToString(href)} — queued until a stack host attaches`);
      return;
    }
    const { route, pathname, params } = hit;
    const seq = ++this.navSeq;
    if (route.loader) {
      try {
        const data = await route.loader({ path: pathname, params });
        if (seq !== this.navSeq) {
          return;
        } // superseded by a newer navigation
        this.loaderDataByTag.set(route.tag, data);
      } catch (err) {
        if (seq !== this.navSeq) {
          return;
        }
        console.error(`[stack nav] loader for ${route.tag} failed: ${String(err)}`);
      }
    }
    // Params/pathname/visited land BEFORE the host action so the target page
    // (content mounts on first visit) renders with them by the time the host
    // shows it.
    this.visitedTags.add(route.tag);
    this.setRouteState(route.tag, pathname, params);
    if (mode === 'replace') {
      // Replace swaps the top NAVIGATION ENTRY (the layer above the
      // permanent manifest root) — see the module design notes for the
      // documented semantics + precedent.
      const top = this.stackTags[this.stackTags.length - 1];
      if (top === route.tag) {
        return;
      } // param-only refresh of the showing page
      if (this.stackTags.length <= 1) {
        // Fresh/empty stack: no navigation entry to discard — land above
        // the root like a push so back affordances survive. replace (not
        // push_by_tag) also materializes the root on a host whose real
        // stack is still empty (GTK cold start).
        this.host.replace_with_tags([...this.stackTags, route.tag]);
        return;
      }
      // A tag may appear only once (Adw hard-errors on duplicates): drop an
      // existing occurrence of the target from the back stack.
      const below = this.stackTags.slice(0, -1).filter((tag) => tag !== route.tag);
      this.host.replace_with_tags([...below, route.tag]);
      return;
    }
    const idx = this.stackTags.indexOf(route.tag);
    if (idx === -1) {
      this.host.push_by_tag(route.tag);
    } else if (idx < this.stackTags.length - 1) {
      // Tag already in the nav stack — Adw treats re-push as a programming
      // error. Interpret as "navigate back to it" (params above still apply).
      this.host.pop_to_tag(route.tag);
    }
    // Already on top: param-only navigation, nothing to do on the host side.
  }

  back = (): void => {
    if (!this.host) {
      devLog('[stack nav] back — no stack host attached, ignored');
      return;
    }
    // Supersede any in-flight loader navigation — its host action must not
    // land after this pop (navigate() re-checks navSeq after its await).
    this.navSeq++;
    // The popped signal (same path as the GTK header back button / Esc /
    // back swipe) syncs the mirror.
    this.host.pop();
  };

  setParams = (params: Record<string, string>): void => {
    const top = this.stackTags[this.stackTags.length - 1];
    if (!top) {
      return;
    }
    const prev = this.paramsByTag.get(top) ?? {};
    this.paramsByTag.set(top, { ...prev, ...params });
    this.rebuildSnapshot();
  };

  /** Re-read the host navigation stack (called from pushed/popped/replaced
   *  signal handlers and attach). The host is the source of truth. */
  syncFromHost = (): void => {
    if (!this.host) {
      return;
    }
    // Any landed stack mutation — seam- or host-initiated (GTK header back
    // button / Esc / swipe) — supersedes in-flight loader navigations.
    // Safe for the navigation that CAUSED this signal: its navSeq check
    // sits before its host action, never after.
    this.navSeq++;
    const model = this.host.get_navigation_stack();
    const tags: string[] = [];
    const count = model.get_n_items();
    for (let i = 0; i < count; i++) {
      const tag = model.get_item(i)?.get_tag();
      if (tag) {
        tags.push(tag);
      }
    }
    if (tags.length > 0) {
      this.stackTags = tags;
    }
    // Anything in the host stack is by definition visited — covers pushes
    // that originate on the host side rather than through the seam.
    for (const tag of this.stackTags) {
      this.visitedTags.add(tag);
    }
    this.rebuildSnapshot();
  };

  private setRouteState(tag: string, pathname: string, params: NavParams): void {
    this.paramsByTag.set(tag, params);
    this.pathnameByTag.set(tag, pathname);
    this.rebuildSnapshot();
  }

  private rebuildSnapshot(): void {
    const tag = this.stackTags[this.stackTags.length - 1] ?? '';
    const route = this.routes.find((r) => r.tag === tag);
    this.generation++;
    this.snapshot = {
      pathname: this.pathnameByTag.get(tag) ?? route?.pattern ?? '/',
      tag,
      depth: this.stackTags.length,
      canGoBack: this.stackTags.length > 1,
      generation: this.generation,
    };
    for (const fn of this.listeners) {
      fn();
    }
  }
}

/** The per-bundle navigator singleton. Every target build (GNOME entry,
 *  VS Code webview, webext view) is its own bundle, so module state is
 *  naturally per-target. */
export const stackNavigator = new StackNavigator();

/** Set per page by the navigation host — useParams/useLocalSearchParams
 *  read the params of the page they render INSIDE, not the top of the
 *  stack. */
export const RouteTagContext = createContext<string | null>(null);

export function useNavState(): NavSnapshot {
  return useSyncExternalStore(stackNavigator.subscribe, stackNavigator.getSnapshot);
}

export function useRouteParams(): NavParams {
  const tag = useContext(RouteTagContext);
  return useSyncExternalStore(stackNavigator.subscribe, () => stackNavigator.paramsSnapshot(tag));
}

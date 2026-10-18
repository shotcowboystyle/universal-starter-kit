/**
 * Backoffice navigation seam.
 *
 * The backoffice never imports a router. Every surface navigates through a
 * host-supplied {@link BackofficeNavigator} — a deliberately minimal contract
 * (push/replace/back + a subscribable location) that any routing runtime can
 * satisfy in a few lines:
 *
 *   - One router      → `useOneNavigator()` from
 *                       `@repo/backoffice/one-adapter`
 *   - tests/storybook → {@link createMemoryNavigator}
 *   - custom hosts    → {@link ControlledNavigator} (bridge callbacks in,
 *                       mirror location back with `setLocation`)
 *
 * This is intentionally lighter than the stack-navigation seam in
 * `@repo/router/seam`: that module OWNS a navigation stack
 * (route manifest + host stack adapter) for targets with no router at all,
 * while this contract EMBEDS into whatever router the host app already runs.
 * A seam-backed host can still implement this interface over its
 * StackNavigator (push/replace/back map 1:1, location from `useNavState`).
 */

// oxlint-disable max-classes-per-file -- the abstract base and its two navigators share protected state; splitting them would export internals

import { BACKOFFICE_BASE } from './paths';

export type BackofficeParams = Record<string, string | string[] | undefined>;

export interface BackofficeLocation {
  /** Current pathname (no query string), e.g. `"/backoffice/todo"`. */
  path: string;
  /** Dynamic route segments merged with query params (One router semantics). */
  params: BackofficeParams;
}

export interface BackofficeNavigator {
  /** Push a new history entry. */
  navigate: (path: string) => void;
  /** Replace the current history entry. */
  replace: (path: string) => void;
  /** Go back one entry. */
  back: () => void;
  /**
   * Merge query params into the CURRENT location without a new history
   * entry (desk's `update_url_with_filters` → history.replaceState channel;
   * one-router `router.setParams`). `undefined` values remove their keys.
   * Optional — hosts without a param-merge primitive omit it and surfaces
   * skip URL sync (state still applies locally).
   */
  setParams?: (params: Record<string, string | undefined>) => void;
  /** Snapshot of the current location (stable identity until it changes). */
  getLocation: () => BackofficeLocation;
  /** Subscribe to location changes. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
}

/**
 * Minimal query parser (repeated keys become arrays). Deliberately not
 * URLSearchParams so this module has zero polyfill-order dependency — same
 * trade the router seam makes for GJS entries.
 */
const parseQuery = (query: string | undefined): BackofficeParams => {
  const params = new Map<string, string | string[]>();
  if (query === undefined || query === '') {
    return {};
  }
  for (const pair of query.split('&')) {
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    let key = rawKey;
    let value = rawValue;
    try {
      key = decodeURIComponent(rawKey);
      value = decodeURIComponent(rawValue);
    } catch {
      // malformed escape — keep the raw pair
    }
    const prev = params.get(key);
    if (prev === undefined) {
      params.set(key, value);
    } else if (Array.isArray(prev)) {
      prev.push(value);
    } else {
      params.set(key, [prev, value]);
    }
  }
  return Object.fromEntries(params);
};

/** Split an href into a {@link BackofficeLocation} (query → params). */
export const parseBackofficeHref = (href: string): BackofficeLocation => {
  const queryIndex = href.indexOf('?');
  const path = queryIndex === -1 ? href : href.slice(0, queryIndex);
  const query = queryIndex === -1 ? undefined : href.slice(queryIndex + 1);
  return { path: path || '/', params: parseQuery(query) };
};

type Listener = () => void;

abstract class SubscribableNavigator implements BackofficeNavigator {
  protected listeners = new Set<Listener>();
  protected location: BackofficeLocation;

  constructor(initialLocation: BackofficeLocation) {
    this.location = initialLocation;
  }

  abstract navigate(path: string): void;
  abstract replace(path: string): void;
  abstract back(): void;

  getLocation = (): BackofficeLocation => this.location;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  protected setLocationInternal(next: BackofficeLocation): void {
    if (next.path === this.location.path && next.params === this.location.params) {
      return;
    }
    this.location = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/**
 * In-memory navigator — a self-contained history stack for tests, stories,
 * and hosts with no routing runtime (e.g. a modal embedding of a single
 * backoffice surface).
 */
export class MemoryNavigator extends SubscribableNavigator {
  private stack: BackofficeLocation[];

  constructor(initialPath = BACKOFFICE_BASE) {
    const initial = parseBackofficeHref(initialPath);
    super(initial);
    this.stack = [initial];
  }

  /** History entries, oldest first (test introspection). */
  get entries(): readonly BackofficeLocation[] {
    return this.stack;
  }

  navigate = (path: string): void => {
    const next = parseBackofficeHref(path);
    this.stack.push(next);
    this.setLocationInternal(next);
  };

  replace = (path: string): void => {
    const next = parseBackofficeHref(path);
    this.stack[this.stack.length - 1] = next;
    this.setLocationInternal(next);
  };

  back = (): void => {
    if (this.stack.length <= 1) {
      return;
    }
    this.stack.pop();
    const top = this.stack.at(-1);
    if (top) {
      this.setLocationInternal(top);
    }
  };

  setParams = (params: Record<string, string | undefined>): void => {
    const current = this.stack.at(-1) ?? this.location;
    const merged = new Map(Object.entries(current.params));
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        merged.delete(key);
      } else {
        merged.set(key, value);
      }
    }
    const next: BackofficeLocation = { path: current.path, params: Object.fromEntries(merged) };
    this.stack[this.stack.length - 1] = next;
    this.setLocationInternal(next);
  };
}

export const createMemoryNavigator = (initialPath = BACKOFFICE_BASE): MemoryNavigator =>
  new MemoryNavigator(initialPath);

/** Host handlers may be async (one's router.push/replace); a pre-mount rejection is only observable on the returned promise. */
type NavigationHandlerResult = PromiseLike<void> | void;

export interface ControlledNavigatorHandlers {
  navigate: (path: string) => NavigationHandlerResult;
  replace: (path: string) => NavigationHandlerResult;
  back: () => NavigationHandlerResult;
  /** Optional param-merge primitive (see {@link BackofficeNavigator.setParams}). */
  setParams?: (params: Record<string, string | undefined>) => void;
}

/** Retry cadence for actions the host router rejected (not mounted yet). */
const CONTROLLED_RETRY_MS = 250;
/** Give up re-dispatching a rejected action after this many attempts. */
const CONTROLLED_RETRY_LIMIT = 40;

/**
 * Bridge navigator for adapters over an external router: navigation calls
 * forward to the host handlers, and the host mirrors its location back via
 * {@link ControlledNavigator.setLocation}. The one-adapter is ~20 lines over
 * this class; a react-router or seam adapter looks the same.
 *
 * Handler calls are dispatched through a not-ready guard: a host router can
 * reject an action issued before its navigation container mounts — one's
 * router throws "Attempted to navigate before mounting the Root Layout
 * component", and because its `linkTo` is async the throw surfaces as an
 * UNHANDLED PROMISE REJECTION that no caller-side try/catch can see (the
 * boot-time redirect race from the console sweep, 4×/session). The guard
 * traps sync throws and async rejections, then re-dispatches the action on
 * an interval until the host accepts it — unless the location moved in the
 * meantime (a competing navigation landed; the stale action is dropped).
 */
export class ControlledNavigator extends SubscribableNavigator {
  private handlers: ControlledNavigatorHandlers;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Monotonic dispatch id — a rejection only re-arms its action while that
   * action is still the newest one (stale rejections arrive on microtasks
   * and could otherwise resurrect a superseded navigation). */
  private dispatchSeq = 0;

  constructor(handlers: ControlledNavigatorHandlers, initialLocation?: BackofficeLocation) {
    super(initialLocation ?? { path: '/', params: {} });
    this.handlers = handlers;
  }

  /** Swap the forwarding callbacks (adapters keep them fresh per render). */
  setHandlers(handlers: ControlledNavigatorHandlers): void {
    this.handlers = handlers;
  }

  /** Mirror the host router's current location into the navigator. */
  setLocation(next: BackofficeLocation): void {
    this.setLocationInternal(next);
  }

  navigate = (path: string): void => {
    this.dispatch(() => this.handlers.navigate(path), `navigate(${path})`);
  };

  replace = (path: string): void => {
    this.dispatch(() => this.handlers.replace(path), `replace(${path})`);
  };

  back = (): void => {
    this.dispatch(() => this.handlers.back(), 'back()');
  };

  // Best-effort, NOT routed through the retry dispatcher: URL sync is a
  // cosmetic mirror of state that already applied locally — a write the
  // router rejects (pre-mount) has nothing to sync yet, and a retried stale
  // write could clobber a newer one. Pokemon-list precedent (try/catch
  // around router.setParams).
  setParams = (params: Record<string, string | undefined>): void => {
    try {
      this.handlers.setParams?.(params);
    } catch {
      // host router not ready / no params support — state stays local
    }
  };

  private dispatch(action: () => NavigationHandlerResult, label: string, attempt = 0): void {
    // The newest intent supersedes any action still waiting on a retry.
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.dispatchSeq += 1;
    const seq = this.dispatchSeq;
    const issuedAt = this.location;
    const superseded = () => seq !== this.dispatchSeq || this.location !== issuedAt;
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives whatever the host router threw or rejected with; only logged
    const scheduleRetry = (error: unknown) => {
      // A newer action or navigation landed.
      if (superseded()) {
        return;
      }
      if (attempt + 1 >= CONTROLLED_RETRY_LIMIT) {
        console.warn(`[backoffice] navigation ${label} never accepted by the host router:`, error);
        return;
      }
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (superseded()) {
          return;
        }
        this.dispatch(action, label, attempt + 1);
      }, CONTROLLED_RETRY_MS);
    };
    let result: NavigationHandlerResult;
    try {
      result = action();
    } catch (error) {
      scheduleRetry(error);
      return;
    }
    // Host handlers may return a promise (one's router.push/replace are
    // async); a pre-mount rejection is only observable here. A sync result
    // resolves immediately and never rejects.
    // oxlint-disable-next-line promise/prefer-await-to-then, github/no-then -- dispatch stays sync for callers; the rejection handler attaches without awaiting
    Promise.resolve(result).catch(scheduleRetry);
  }
}

/**
 * Inert navigator — the default-context fallback so package surfaces render
 * (and stories mount) without a BackofficeProvider. Navigation is a no-op.
 */
const noop = (): void => {
  // Intentionally inert: the fallback navigator ignores navigation.
};

export const createNoopNavigator = (initialPath = BACKOFFICE_BASE): BackofficeNavigator => {
  const location = parseBackofficeHref(initialPath);
  return {
    navigate: noop,
    replace: noop,
    back: noop,
    getLocation: () => location,
    subscribe: () => noop,
  };
};

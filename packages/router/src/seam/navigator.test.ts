import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomStackAdapter } from './DomNavigationHost';
import { hrefToString, stackNavigator } from './navigator';

const ROUTES = [
  { pattern: '/', tag: 'home', title: 'Home' },
  { pattern: '/todos', tag: 'todos', title: 'Todos' },
  { pattern: '/pokemon/[id]', tag: 'pokemon-detail', title: 'Pokemon detail' },
];

function attachDomHost(): DomStackAdapter {
  const adapter = new DomStackAdapter('home', () => {
    stackNavigator.syncFromHost();
  });
  stackNavigator.attach(adapter);
  return adapter;
}

async function flush(): Promise<void> {
  // Loader navigations resolve over microtasks; two ticks cover
  // loader → navSeq check → host action.
  await Promise.resolve();
  await Promise.resolve();
}

describe('hrefToString', () => {
  it('substitutes [param] tokens and appends leftovers as query', () => {
    expect(hrefToString({ pathname: '/pokemon/[id]', params: { id: 'mew' } })).toBe('/pokemon/mew');
    expect(hrefToString({ pathname: '/todos', params: { filter: 'open' } })).toBe('/todos?filter=open');
    expect(hrefToString('/plain')).toBe('/plain');
  });
});

describe('StackNavigator', () => {
  beforeEach(() => {
    stackNavigator.detach();
    stackNavigator.configure(ROUTES);
  });

  it('matches literal, param and query segments', () => {
    expect(stackNavigator.match('/')?.route.tag).toBe('home');
    expect(stackNavigator.match('/todos')?.route.tag).toBe('todos');
    const detail = stackNavigator.match('/pokemon/bulbasaur?shiny=1');
    expect(detail?.route.tag).toBe('pokemon-detail');
    expect(detail?.params).toEqual({ shiny: '1', id: 'bulbasaur' });
    expect(stackNavigator.match('/nope')).toBeNull();
  });

  it('starts on the first manifest route', () => {
    const snapshot = stackNavigator.getSnapshot();
    expect(snapshot.pathname).toBe('/');
    expect(snapshot.tag).toBe('home');
    expect(snapshot.depth).toBe(1);
    expect(snapshot.canGoBack).toBe(false);
    expect(stackNavigator.isVisited('home')).toBe(true);
    expect(stackNavigator.isVisited('todos')).toBe(false);
  });

  it('pushes, pops and re-push pops back to an existing tag', () => {
    attachDomHost();
    stackNavigator.push('/todos');
    expect(stackNavigator.getSnapshot()).toMatchObject({
      tag: 'todos',
      pathname: '/todos',
      depth: 2,
      canGoBack: true,
    });
    expect(stackNavigator.isVisited('todos')).toBe(true);

    stackNavigator.push('/pokemon/mew');
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'pokemon-detail', depth: 3 });
    expect(stackNavigator.paramsSnapshot('pokemon-detail')).toEqual({ id: 'mew' });

    // Tag already in the stack → interpreted as "navigate back to it".
    stackNavigator.push('/todos');
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'todos', depth: 2 });

    stackNavigator.back();
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'home', depth: 1 });
  });

  // Replace semantics (documented in navigator.ts): with no navigation entry
  // above the manifest root there is nothing to discard, so replace lands the
  // target ABOVE the root like a push — cold deep links / initialHref restores
  // keep a working back affordance (react-navigation/expo-router synthesize
  // the anchor route for deep links the same way; Adw.NavigationView's
  // replace on an empty view is a push).
  it('replace on a fresh stack layers above the root so back still works', () => {
    attachDomHost();
    stackNavigator.replace('/pokemon/mew');
    expect(stackNavigator.getSnapshot()).toMatchObject({
      tag: 'pokemon-detail',
      pathname: '/pokemon/mew',
      depth: 2,
      canGoBack: true,
    });
    stackNavigator.back();
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'home', depth: 1 });
  });

  it('replace lays the root down even when the host stack is empty (GTK cold start)', () => {
    // An Adw.NavigationView is empty until the first push; the mirror still
    // carries the configure()-seeded root. Replace must materialize BOTH the
    // root and the target on the host, not strand the target alone.
    const adapter = new DomStackAdapter('', () => {
      stackNavigator.syncFromHost();
    });
    stackNavigator.attach(adapter);
    expect(adapter.get_navigation_stack().get_n_items()).toBe(0);
    stackNavigator.replace('/pokemon/mew');
    const model = adapter.get_navigation_stack();
    expect(model.get_n_items()).toBe(2);
    expect(model.get_item(0)?.get_tag()).toBe('home');
    expect(model.get_item(1)?.get_tag()).toBe('pokemon-detail');
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'pokemon-detail', canGoBack: true });
  });

  it('replace swaps the top once navigation has landed', () => {
    attachDomHost();
    stackNavigator.push('/todos');
    stackNavigator.replace('/pokemon/mew');
    expect(stackNavigator.getSnapshot()).toMatchObject({
      tag: 'pokemon-detail',
      depth: 2,
      canGoBack: true,
    });
    // The replaced entry (todos) is gone: back lands on home.
    stackNavigator.back();
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'home', depth: 1 });
  });

  it('replace to the showing route is a param-only refresh', () => {
    attachDomHost();
    stackNavigator.push('/pokemon/mew');
    stackNavigator.replace('/pokemon/ditto');
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'pokemon-detail', depth: 2 });
    expect(stackNavigator.paramsSnapshot('pokemon-detail')).toEqual({ id: 'ditto' });
  });

  it('replace dedupes a target that already sits in the back stack', () => {
    // Every tag appears at most once in the host stack (Adw treats a
    // duplicate page as a programming error) — replacing to a page that's
    // already beneath pops the stack to a single occurrence of it.
    const adapter = attachDomHost();
    stackNavigator.push('/todos');
    stackNavigator.push('/pokemon/mew');
    stackNavigator.replace('/todos');
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'todos', depth: 2 });
    const model = adapter.get_navigation_stack();
    expect(model.get_n_items()).toBe(2);
    expect(model.get_item(0)?.get_tag()).toBe('home');
    expect(model.get_item(1)?.get_tag()).toBe('todos');
  });

  it('ignores navigation to routes outside the manifest', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    attachDomHost();
    stackNavigator.push('/not-in-manifest');
    expect(stackNavigator.getSnapshot().tag).toBe('home');
    log.mockRestore();
  });

  // Warm/early deep links: navigation requests are QUEUED while no host is
  // attached (mount ordering, StrictMode's detach→re-attach cycle, host
  // remounts) and applied on attach — the same contract as react-navigation
  // queueing actions dispatched before the navigator is ready. Dropping them
  // is what made deep links no-op depending on arrival timing.
  it('queues a deep link that arrives before a host attaches and applies it on attach', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    stackNavigator.push('/pokemon/mew');
    // Nothing landed yet — no host.
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'home', depth: 1 });
    attachDomHost();
    expect(stackNavigator.getSnapshot()).toMatchObject({
      tag: 'pokemon-detail',
      pathname: '/pokemon/mew',
      depth: 2,
      canGoBack: true,
    });
    expect(stackNavigator.paramsSnapshot('pokemon-detail')).toEqual({ id: 'mew' });
    log.mockRestore();
  });

  it('applies a deep link that arrives while the host is detached (remount cycle)', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = attachDomHost();
    stackNavigator.push('/todos');
    stackNavigator.detach();
    // Warm deep link lands in the detach window (e.g. StrictMode remount).
    stackNavigator.push('/pokemon/mew');
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'todos', depth: 2 });
    stackNavigator.attach(adapter);
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'pokemon-detail', depth: 3 });
    log.mockRestore();
  });

  it("resolves a queued navigation's loader at apply time, not enqueue time", async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loader = vi.fn(() => Promise.resolve('fresh'));
    stackNavigator.configure([ROUTES[0], { pattern: '/todos', tag: 'todos', title: 'Todos', loader }]);
    stackNavigator.push('/todos');
    // Queued — the loader must not run until a host can apply the result.
    expect(loader).not.toHaveBeenCalled();
    attachDomHost();
    expect(loader).toHaveBeenCalledTimes(1);
    await flush();
    expect(stackNavigator.getSnapshot().tag).toBe('todos');
    expect(stackNavigator.loaderSnapshot('todos')).toBe('fresh');
    log.mockRestore();
  });

  it('applies the initial href before flushing queued deep links (freshest wins)', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    stackNavigator.push('/pokemon/mew');
    const adapter = new DomStackAdapter('home', () => {
      stackNavigator.syncFromHost();
    });
    stackNavigator.attach(adapter, { initialHref: '/todos' });
    // Restore landed first ([home, todos]), then the queued deep link on top.
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'pokemon-detail', depth: 3 });
    stackNavigator.back();
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'todos', depth: 2 });
    log.mockRestore();
  });

  it('clears queued navigations on configure', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    stackNavigator.push('/todos');
    stackNavigator.configure(ROUTES);
    attachDomHost();
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'home', depth: 1 });
    log.mockRestore();
  });

  it('resolves loaders before the host action (loader bridge)', async () => {
    let resolveLoader: (value: string) => void = () => {};
    const loader = vi.fn(() => new Promise<string>((resolvePromise) => (resolveLoader = resolvePromise)));
    stackNavigator.configure([ROUTES[0], { pattern: '/todos', tag: 'todos', title: 'Todos', loader }]);
    attachDomHost();

    stackNavigator.push('/todos');
    expect(loader).toHaveBeenCalledWith({ path: '/todos', params: {} });
    // Loader still pending — navigation must not have landed.
    expect(stackNavigator.getSnapshot().tag).toBe('home');
    expect(stackNavigator.loaderSnapshot('todos')).toBeUndefined();

    resolveLoader('loaded');
    await flush();
    expect(stackNavigator.getSnapshot().tag).toBe('todos');
    expect(stackNavigator.loaderSnapshot('todos')).toBe('loaded');
  });

  it('drops a loader navigation superseded by back()', async () => {
    let resolveLoader: (value: string) => void = () => {};
    const loader = () => new Promise<string>((resolvePromise) => (resolveLoader = resolvePromise));
    stackNavigator.configure([ROUTES[0], { pattern: '/todos', tag: 'todos', title: 'Todos', loader }]);
    attachDomHost();

    stackNavigator.push('/todos');
    stackNavigator.back(); // supersedes the in-flight loader navigation
    resolveLoader('late');
    await flush();
    expect(stackNavigator.getSnapshot().tag).toBe('home');
    expect(stackNavigator.loaderSnapshot('todos')).toBeUndefined();
  });

  it('re-runs the loader on param-only navigation to the top route', async () => {
    const loader = vi.fn(({ params }: { params: Record<string, unknown> }) => Promise.resolve(`doc:${params.id}`));
    stackNavigator.configure([ROUTES[0], { pattern: '/pokemon/[id]', tag: 'pokemon-detail', title: 'Detail', loader }]);
    const adapter = attachDomHost();

    stackNavigator.push('/pokemon/mew');
    await flush();
    expect(stackNavigator.loaderSnapshot('pokemon-detail')).toBe('doc:mew');
    expect(adapter.get_navigation_stack().get_n_items()).toBe(2);

    stackNavigator.push('/pokemon/ditto');
    await flush();
    // Host stack unchanged (param-only), loader data + params updated.
    expect(adapter.get_navigation_stack().get_n_items()).toBe(2);
    expect(stackNavigator.loaderSnapshot('pokemon-detail')).toBe('doc:ditto');
    expect(stackNavigator.paramsSnapshot('pokemon-detail')).toEqual({ id: 'ditto' });
  });

  it('preload resolves the loader without navigating', async () => {
    const loader = vi.fn(() => Promise.resolve('preloaded'));
    stackNavigator.configure([{ pattern: '/', tag: 'home', title: 'Home', loader }, ROUTES[1]]);
    await stackNavigator.preload('/');
    expect(stackNavigator.loaderSnapshot('home')).toBe('preloaded');
    expect(stackNavigator.getSnapshot().tag).toBe('home');
  });

  it('mirrors host-initiated stack changes through syncFromHost', () => {
    const adapter = attachDomHost();
    // Host-side push (e.g. GTK header interaction) — not through the seam.
    adapter.push_by_tag('todos');
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'todos', depth: 2 });
    expect(stackNavigator.isVisited('todos')).toBe(true);
    adapter.pop();
    expect(stackNavigator.getSnapshot()).toMatchObject({ tag: 'home', depth: 1 });
  });

  it("setParams merges into the top route's params", () => {
    attachDomHost();
    stackNavigator.push('/pokemon/mew');
    stackNavigator.setParams({ tab: 'stats' });
    expect(stackNavigator.paramsSnapshot('pokemon-detail')).toEqual({ id: 'mew', tab: 'stats' });
  });
});

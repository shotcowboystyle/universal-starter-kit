import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlledNavigator, createMemoryNavigator, parseBackofficeHref } from './navigator';

describe(parseBackofficeHref, () => {
  it('splits path and query params', () => {
    const location = parseBackofficeHref('/backoffice/todo?f=abc&x=1');
    expect(location.path).toBe('/backoffice/todo');
    expect(location.params).toEqual({ f: 'abc', x: '1' });
  });

  it('collects repeated keys into arrays', () => {
    const location = parseBackofficeHref('/backoffice?tag=a&tag=b');
    expect(location.params).toEqual({ tag: ['a', 'b'] });
  });

  it('decodes percent-encoded params', () => {
    const location = parseBackofficeHref('/backoffice/sales-order?d=%7B%22status%22%3A%22Open%22%7D');
    expect(location.params.d).toBe('{"status":"Open"}');
  });
});

describe('MemoryNavigator (navigator contract)', () => {
  it('starts on the initial path', () => {
    const navigator = createMemoryNavigator('/backoffice');
    expect(navigator.getLocation()).toEqual({ path: '/backoffice', params: {} });
  });

  it('navigate pushes entries and notifies subscribers', () => {
    const navigator = createMemoryNavigator('/backoffice');
    const listener = vi.fn();
    navigator.subscribe(listener);

    navigator.navigate('/backoffice/todo?f=x');

    expect(listener).toHaveBeenCalledOnce();
    expect(navigator.getLocation()).toEqual({ path: '/backoffice/todo', params: { f: 'x' } });
    expect(navigator.entries).toHaveLength(2);
  });

  it('replace swaps the top entry without growing the stack', () => {
    const navigator = createMemoryNavigator('/backoffice');
    navigator.navigate('/backoffice/todo');
    navigator.replace('/backoffice/note');

    expect(navigator.entries).toHaveLength(2);
    expect(navigator.getLocation().path).toBe('/backoffice/note');
  });

  it('back pops to the previous entry and is a no-op at the root', () => {
    const navigator = createMemoryNavigator('/backoffice');
    navigator.navigate('/backoffice/todo');
    navigator.back();
    expect(navigator.getLocation().path).toBe('/backoffice');

    navigator.back();
    expect(navigator.getLocation().path).toBe('/backoffice');
  });

  it('getLocation identity is stable until the location changes', () => {
    const navigator = createMemoryNavigator('/backoffice');
    const first = navigator.getLocation();
    expect(navigator.getLocation()).toBe(first);
    navigator.navigate('/backoffice/todo');
    expect(navigator.getLocation()).not.toBe(first);
  });

  it('unsubscribe stops notifications', () => {
    const navigator = createMemoryNavigator('/backoffice');
    const listener = vi.fn();
    const unsubscribe = navigator.subscribe(listener);
    unsubscribe();
    navigator.navigate('/backoffice/todo');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('ControlledNavigator (bridge contract)', () => {
  it('forwards navigation to the host handlers', () => {
    const handlers = { navigate: vi.fn(), replace: vi.fn(), back: vi.fn() };
    const navigator = new ControlledNavigator(handlers, { path: '/backoffice', params: {} });

    navigator.navigate('/backoffice/todo');
    navigator.replace('/backoffice/note');
    navigator.back();

    expect(handlers.navigate).toHaveBeenCalledWith('/backoffice/todo');
    expect(handlers.replace).toHaveBeenCalledWith('/backoffice/note');
    expect(handlers.back).toHaveBeenCalledOnce();
  });

  it('mirrors host location through setLocation and notifies', () => {
    const navigator = new ControlledNavigator(
      { navigate: () => {}, replace: () => {}, back: () => {} },
      { path: '/backoffice', params: {} },
    );
    const listener = vi.fn();
    navigator.subscribe(listener);

    navigator.setLocation({ path: '/backoffice/todo', params: { f: 'x' } });

    expect(listener).toHaveBeenCalledOnce();
    expect(navigator.getLocation().path).toBe('/backoffice/todo');
  });
});

describe('ControlledNavigator (navigate-before-mount guard)', () => {
  // The console-sweep race: one's router throws "Attempted to navigate
  // before mounting the Root Layout component" for actions issued before
  // its navigation container mounts — synchronously from back(), and as a
  // REJECTED PROMISE from push/replace (linkTo is async), which no
  // caller-side try/catch can see. The navigator must absorb both and
  // re-dispatch until the host accepts.
  const NOT_MOUNTED = new Error('Attempted to navigate before mounting the Root Layout component.');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Flush the promise-rejection microtasks between timer advances. */
  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  }

  it('retries an async-rejected replace until the host accepts it (no unhandled rejection)', async () => {
    let mounted = false;
    const accepted: string[] = [];
    const replace = vi.fn(async (path: string) => {
      if (!mounted) {
        throw NOT_MOUNTED;
      }
      accepted.push(path);
      return;
    });
    const navigator = new ControlledNavigator(
      { navigate: () => {}, replace, back: () => {} },
      { path: '/backoffice', params: {} },
    );

    navigator.replace('/backoffice/users');
    await flush();
    expect(replace).toHaveBeenCalledOnce();
    expect(accepted).toEqual([]);

    // Router mounts a moment later; the pending action re-dispatches.
    mounted = true;
    await vi.advanceTimersByTimeAsync(300);
    expect(accepted).toEqual(['/backoffice/users']);
    expect(replace).toHaveBeenCalledTimes(2);

    // No further re-dispatches once accepted.
    await vi.advanceTimersByTimeAsync(2000);
    expect(replace).toHaveBeenCalledTimes(2);
  });

  it('retries a synchronously-thrown back()', async () => {
    let mounted = false;
    const back = vi.fn(() => {
      if (!mounted) {
        throw NOT_MOUNTED;
      }
    });
    const navigator = new ControlledNavigator(
      { navigate: () => {}, replace: () => {}, back },
      { path: '/backoffice', params: {} },
    );

    navigator.back();
    expect(back).toHaveBeenCalledOnce();

    mounted = true;
    await vi.advanceTimersByTimeAsync(300);
    expect(back).toHaveBeenCalledTimes(2);
  });

  it('drops a pending action when the location moves in the meantime', async () => {
    const replace = vi.fn(async () => {
      throw NOT_MOUNTED;
    });
    const navigator = new ControlledNavigator(
      { navigate: () => {}, replace, back: () => {} },
      { path: '/backoffice', params: {} },
    );

    navigator.replace('/backoffice/users');
    await flush();
    expect(replace).toHaveBeenCalledOnce();

    // A competing navigation landed (host mirrored a new location) — the
    // stale action must not re-dispatch and yank the user.
    navigator.setLocation({ path: '/backoffice/todo', params: {} });
    await vi.advanceTimersByTimeAsync(2000);
    expect(replace).toHaveBeenCalledOnce();
  });

  it('a newer action supersedes an older pending one', async () => {
    let mounted = false;
    const accepted: string[] = [];
    const impl = async (path: string) => {
      if (!mounted) {
        throw NOT_MOUNTED;
      }
      accepted.push(path);
      return;
    };
    const navigator = new ControlledNavigator(
      { navigate: vi.fn(impl), replace: vi.fn(impl), back: () => {} },
      { path: '/backoffice', params: {} },
    );

    navigator.replace('/backoffice/users');
    await flush();
    navigator.navigate('/backoffice/todo');
    await flush();

    mounted = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(accepted).toEqual(['/backoffice/todo']);
  });

  it('gives up with a single console.warn after the retry budget', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const replace = vi.fn(async () => {
      throw NOT_MOUNTED;
    });
    const navigator = new ControlledNavigator(
      { navigate: () => {}, replace, back: () => {} },
      { path: '/backoffice', params: {} },
    );

    navigator.replace('/backoffice/users');
    for (let i = 0; i < 60; i++) {
      await vi.advanceTimersByTimeAsync(250);
      await flush();
    }
    expect(replace.mock.calls.length).toBeLessThanOrEqual(40);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

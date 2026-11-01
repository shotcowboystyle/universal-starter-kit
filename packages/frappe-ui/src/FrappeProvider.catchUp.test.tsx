import {
  getFrappeSyncModule,
  useFrappeCatchUp,
  useFrappeCollection,
  useFrappeInfiniteList,
  useLiveQuery,
} from '@repo/frappe';
import type { SyncModule, UseFrappeCollectionConfig } from '@repo/frappe';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackfillScope } from '../../frappe/src/sync/types';

import { FrappeProvider, useFrappeConfig } from './FrappeProvider';

const { sockets } = vi.hoisted(() => ({
  sockets: [] as {
    connected: boolean;
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the mock socket relays arbitrary event payloads
    deliver: (event: string, payload?: unknown) => void;
  }[],
}));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the stand-in socket implements only what FrappeProvider uses, which the typed import() form rejects (TS2769)
vi.mock('socket.io-client', () => ({
  io: () => {
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the mock socket relays arbitrary event payloads
    const listeners = new Map<string, Set<(payload?: unknown) => void>>();
    const socket = {
      id: 'synthetic',
      connected: false,
      auth: {},
      io: { on: vi.fn<() => void>(), opts: {} },
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the mock socket relays arbitrary event payloads
      on(event: string, handler: (payload?: unknown) => void) {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(handler);
        return socket;
      },
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the mock socket relays arbitrary event payloads
      off(event: string, handler: (payload?: unknown) => void) {
        listeners.get(event)?.delete(handler);
        return socket;
      },
      emit: vi.fn<() => void>(),
      connect() {
        socket.connected = true;
        socket.deliver('connect');
        return socket;
      },
      disconnect() {
        socket.connected = false;
        return socket;
      },
      removeAllListeners() {
        listeners.clear();
        return socket;
      },
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the mock socket relays arbitrary event payloads
      deliver(event: string, payload?: unknown) {
        if (event === 'connect') {
          socket.connected = true;
        }
        if (event === 'disconnect') {
          socket.connected = false;
        }
        for (const listener of listeners.get(event) ?? []) {
          listener(payload);
        }
      },
    };
    sockets.push(socket);
    return socket;
  },
}));

interface Task {
  name: string;
  doctype: string;
  title: string;
  modified: string;
}
const row = (name: string, title = name): Task => ({
  name,
  title,
  doctype: 'Task',
  modified: '2026-09-09T00:00:00Z',
});
const modules = new Set<SyncModule>();
const observed = new Map<string, { sync: SyncModule; collection: unknown }>();
let sequence = 0;
const connection = (): UseFrappeCollectionConfig => {
  sequence += 1;
  return { baseURL: `https://public-catch-up-${sequence}.test`, realtime: false };
};
const requestUrl = (input: RequestInfo | URL): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- picks the string member of fetch's RequestInfo | URL input union
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
};
const Probe = ({ label = 'main' }: { label?: string }) => {
  const config = useFrappeConfig();
  const sync = getFrappeSyncModule(config)!;
  modules.add(sync);
  const collection = useFrappeCollection<Task>(config, 'Task', { filters: [['title', '!=', '']] });
  const query = useLiveQuery((q) => (collection ? q.from({ task: collection }) : null), [collection]);
  const state = useFrappeCatchUp(config);
  useEffect(() => {
    observed.set(label, { sync, collection });
  }, [label, sync, collection]);
  return (
    <section>
      <output data-testid={`${label}-rows`}>
        {query.data
          ?.map((task) => `${task.name}:${task.title}`)
          .toSorted()
          .join(',')}
      </output>
      <output data-testid={`${label}-state`}>
        {state.refreshing ? 'refreshing' : 'idle'}/{state.stale ? 'stale' : 'current'}
      </output>
      {state.error !== null && state.error !== undefined ? (
        // oxlint-disable-next-line typescript/no-base-to-string -- a non-Error failure is shown best-effort
        <p role="alert">{state.error instanceof Error ? state.error.message : String(state.error)}</p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          void state.retry();
        }}>
        Retry {label}
      </button>
    </section>
  );
};
const InfiniteProbe = () => {
  const config = useFrappeConfig();
  const sync = getFrappeSyncModule(config)!;
  modules.add(sync);
  const list = useFrappeInfiniteList<Task>({ config, doctype: 'Task' });
  return <output data-testid="infinite">{list.error?.message ?? list.items.map((item) => item.name).join(',')}</output>;
};
const server = () => {
  let rows = [row('a'), row('b')];
  let status = 200;
  let cdc = {
    rows: [] as Task[],
    deleted: [] as { name: string }[],
    checkpoint: 'next',
    has_more: false,
  };
  const urls: URL[] = [];
  let gate: Promise<Response> | null = null;
  const fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
    const url = new URL(requestUrl(input));
    urls.push(url);
    if (gate) {
      const pending = gate;
      gate = null;
      return await pending;
    }
    if (status !== 200) {
      return Response.json({ message: 'Service unavailable' }, { status });
    }
    if (url.pathname === '/api/resource/Task') {
      return Response.json({ data: rows });
    }
    if (url.pathname.startsWith('/api/resource/Task/')) {
      const doc = rows.find((item) => item.name === url.pathname.split('/').at(-1));
      return Response.json({ data: doc }, { status: doc ? 200 : 404 });
    }
    if (url.pathname === '/api/method/live.live.api.backfill') {
      return Response.json({ message: cdc });
    }
    return Response.json({ message: 'Unsupported method' }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    urls,
    setRows: (value: Task[]) => {
      rows = value;
    },
    setStatus: (value: number) => {
      status = value;
    },
    setCdc: (value: typeof cdc) => {
      cdc = value;
    },
    hold: () => {
      const { promise, resolve } = Promise.withResolvers<Response>();
      gate = promise;
      return resolve;
    },
    resources: () => urls.filter((url) => url.pathname === '/api/resource/Task'),
    methods: () => urls.filter((url) => url.pathname.startsWith('/api/method/')),
  };
};
const expectRows = async (value: string, label = 'main') => {
  await waitFor(() => {
    expect(screen.getByTestId(`${label}-rows`).textContent).toBe(value);
  });
};
const expectIdle = async (label = 'main') => {
  await waitFor(() => {
    expect(screen.getByTestId(`${label}-state`).textContent).toBe('idle/current');
  });
};

describe('FrappeProvider public catch-up', () => {
  beforeEach(() => {
    sockets.length = 0;
    observed.clear();
  });

  afterEach(async () => {
    cleanup();
    for (const sync of modules) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- modules dispose one at a time so teardowns never overlap
      await sync.dispose();
    }
    modules.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('refreshes resource-only mounted collections for focus and online without CDC/cursor requests', async () => {
    const api = server();
    const config = {
      ...connection(),
      syncOptions: { catchUpStrategy: 'snapshot' as const, cdcInterval: 60_000 },
    };
    render(
      <FrappeProvider {...config}>
        <Probe />
      </FrappeProvider>,
    );
    await expectRows('a:a,b:b');
    const initial = observed.get('main')!;
    api.setRows([row('a', 'edited'), row('c')]);
    fireEvent(window, new Event('focus'));
    await expectRows('a:edited,c:c');
    await expectIdle();
    api.setRows([]);
    fireEvent(window, new Event('online'));
    await expectRows('');
    await expectIdle();
    expect(observed.get('main')!.collection).toBe(initial.collection);
    expect(api.methods()).toStrictEqual([]);
    expect(api.resources()).toHaveLength(3);
  });

  it('dispatches the enabled interval through the public snapshot provider', async () => {
    vi.useFakeTimers();
    const api = server();
    render(
      <FrappeProvider
        {...connection()}
        syncOptions={{ catchUpStrategy: 'snapshot', cdcInterval: 1000 }}>
        <Probe />
      </FrappeProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByTestId('main-rows').textContent).toBe('a:a,b:b');
    api.setRows([row('timer')]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByTestId('main-rows').textContent).toBe('timer:timer');
    expect(api.resources()).toHaveLength(2);
    expect(api.methods()).toStrictEqual([]);
  });

  it('retains rows through a real HTTP 503, renders qualification, and retries without remounting', async () => {
    const api = server();
    const config = { ...connection(), syncOptions: { catchUpStrategy: 'snapshot' as const } };
    const view = render(
      <FrappeProvider {...config}>
        <Probe />
      </FrappeProvider>,
    );
    await expectRows('a:a,b:b');
    const initial = observed.get('main')!.collection;
    const release = api.hold();
    api.setStatus(503);
    fireEvent(window, new Event('focus'));
    await waitFor(() => {
      expect(api.resources()).toHaveLength(2);
    });
    expect(screen.getByTestId('main-state').textContent).toBe('refreshing/current');
    expect(screen.getByTestId('main-rows').textContent).toBe('a:a,b:b');
    release(Response.json({ message: 'Service unavailable' }, { status: 503 }));
    await waitFor(
      () => {
        expect(screen.getByTestId('main-state').textContent).toBe('idle/stale');
      },
      {
        timeout: 4000,
      },
    );
    expect(screen.getByRole('alert').textContent).toContain('Showing previous data');
    expect(api.resources()).toHaveLength(5);
    view.rerender(
      <FrappeProvider {...config}>
        <Probe />
      </FrappeProvider>,
    );
    expect(api.resources()).toHaveLength(5);
    api.setStatus(200);
    api.setRows([row('recovered')]);
    const retryRelease = api.hold();
    fireEvent.click(screen.getByRole('button', { name: 'Retry main' }));
    await waitFor(() => {
      expect(api.resources()).toHaveLength(6);
    });
    expect(screen.getByTestId('main-state').textContent).toBe('refreshing/stale');
    retryRelease(Response.json({ data: [row('recovered')] }));
    await expectRows('recovered:recovered');
    await expectIdle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(observed.get('main')!.collection).toBe(initial);
    expect(api.methods()).toStrictEqual([]);
  });

  it.each(['snapshot', 'cdc'] as const)(
    'routes real socket reconnect with %s strategy and preserves realtime delivery',
    async (strategy) => {
      const api = server();
      render(
        <FrappeProvider
          {...connection()}
          realtime
          syncOptions={{ catchUpStrategy: strategy }}>
          <Probe />
        </FrappeProvider>,
      );
      await expectRows('a:a,b:b');
      await waitFor(() => {
        expect(sockets).toHaveLength(1);
      });
      await expectIdle();
      const initialCount = api.urls.length;
      api.setRows([row('socket')]);
      api.setCdc({
        rows: [row('socket')],
        deleted: [{ name: 'a' }, { name: 'b' }],
        checkpoint: 'socket-checkpoint',
        has_more: false,
      });
      act(() => {
        sockets[0].deliver('disconnect', 'transport close');
        sockets[0].deliver('connect');
      });
      await expectRows('socket:socket');
      await expectIdle();
      const catchup = api.urls.slice(initialCount);
      expect(
        catchup.some(
          (url) =>
            url.pathname === (strategy === 'snapshot' ? '/api/resource/Task' : '/api/method/live.live.api.backfill'),
        ),
      ).toBe(true);
      if (strategy === 'snapshot') {
        // oxlint-disable-next-line vitest/no-conditional-expect -- the parameterized catch-up strategy picks which path to assert
        expect(api.methods()).toStrictEqual([]);
      } else {
        // oxlint-disable-next-line vitest/no-conditional-expect -- the parameterized catch-up strategy picks which path to assert
        expect(observed.get('main')!.sync.__debug().subscriptions[0].checkpoint).toBe('socket-checkpoint');
        fireEvent(window, new Event('online'));
        await waitFor(() => {
          // oxlint-disable-next-line vitest/no-conditional-expect -- the parameterized catch-up strategy picks which path to assert
          expect(api.methods().at(-1)?.searchParams.get('modified_after')).toBe('socket-checkpoint');
        });
        await expectIdle();
      }
      api.setRows([row('socket', 'realtime edit')]);
      act(() => {
        sockets[0].deliver('doc_update', { doctype: 'Task', name: 'socket' });
      });
      await expectRows('socket:realtime edit');
    },
  );

  it('uses CDC when omitted, observes background rejection, and keeps explicit backfill rejecting', async () => {
    const api = server();
    render(
      <FrappeProvider {...connection()}>
        <Probe />
      </FrappeProvider>,
    );
    await expectRows('a:a,b:b');
    api.setStatus(404);
    fireEvent(window, new Event('focus'));
    await waitFor(() => {
      expect(screen.getByTestId('main-state').textContent).toBe('idle/stale');
    });
    const { sync } = observed.get('main')!;
    await expect(sync.backfill({ scope: BackfillScope.All })).rejects.toMatchObject({ status: 404 });
    expect(api.methods()[0].searchParams.get('modified_after')).toBe(row('a').modified);
    api.setStatus(200);
    api.setCdc({
      rows: [row('c')],
      deleted: [{ name: 'a' }],
      checkpoint: 'recovered-checkpoint',
      has_more: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry main' }));
    await expectRows('b:b,c:c');
    await expectIdle();
  });

  it('isolates same-origin strategy providers and switches collection and state together', async () => {
    const api = server();
    const config = connection();
    const draw = (strategy: 'snapshot' | 'cdc') => (
      <>
        <FrappeProvider
          {...config}
          syncOptions={{ catchUpStrategy: strategy }}>
          <Probe label="left" />
        </FrappeProvider>
        <FrappeProvider {...config}>
          <Probe label="right" />
        </FrappeProvider>
      </>
    );
    const view = render(draw('snapshot'));
    await expectRows('a:a,b:b', 'left');
    await expectRows('a:a,b:b', 'right');
    expect(observed.get('left')!.sync).not.toBe(observed.get('right')!.sync);
    expect(observed.get('left')!.collection).not.toBe(observed.get('right')!.collection);
    const left = observed.get('left')!.collection;
    view.rerender(draw('snapshot'));
    expect(observed.get('left')!.collection).toBe(left);
    api.setRows([row('snapshot')]);
    api.setCdc({
      rows: [row('cdc')],
      deleted: [{ name: 'a' }, { name: 'b' }],
      checkpoint: 'separate',
      has_more: false,
    });
    fireEvent(window, new Event('focus'));
    await expectRows('snapshot:snapshot', 'left');
    await expectRows('cdc:cdc', 'right');
    view.rerender(draw('cdc'));
    await expectRows('cdc:cdc', 'left');
    expect(observed.get('left')!.collection).toBe(observed.get('right')!.collection);
    expect(observed.get('left')!.sync).toBe(observed.get('right')!.sync);
  });

  it('refuses progressive snapshot subscriptions through the public hook, with CDC control', async () => {
    const api = server();
    const config = connection();
    const view = render(
      <FrappeProvider
        {...config}
        syncOptions={{ catchUpStrategy: 'snapshot' }}>
        <InfiniteProbe />
      </FrappeProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('infinite').textContent).toContain('does not support progressive');
    });
    expect(api.urls).toStrictEqual([]);
    view.rerender(
      <FrappeProvider {...config}>
        <InfiniteProbe />
      </FrappeProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('infinite').textContent).toBe('a,b');
    });
    expect(api.resources()).toHaveLength(1);
  });

  it('keeps explicit CDC backfill rejecting even on a snapshot provider', async () => {
    const api = server();
    render(
      <FrappeProvider
        {...connection()}
        syncOptions={{ catchUpStrategy: 'snapshot' }}>
        <Probe />
      </FrappeProvider>,
    );
    await expectRows('a:a,b:b');
    expect(api.methods()).toStrictEqual([]);
    api.setStatus(404);
    await expect(observed.get('main')!.sync.backfill({ scope: BackfillScope.All })).rejects.toMatchObject({
      status: 404,
    });
    expect(api.methods()).toHaveLength(1);
    expect(api.methods()[0].pathname).toBe('/api/method/live.live.api.backfill');
  });

  it('coalesces mounted lifecycle overlap into one trailing read', async () => {
    const api = server();
    render(
      <FrappeProvider
        {...connection()}
        syncOptions={{ catchUpStrategy: 'snapshot' }}>
        <Probe />
      </FrappeProvider>,
    );
    await expectRows('a:a,b:b');
    const first = api.hold();
    fireEvent(window, new Event('focus'));
    await waitFor(() => {
      expect(api.resources()).toHaveLength(2);
    });
    const trailing = api.hold();
    fireEvent(window, new Event('online'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry main' }));
    first(Response.json({ data: [row('earlier')] }));
    await waitFor(() => {
      expect(api.resources()).toHaveLength(3);
    });
    for (let i = 0; i < 10; i += 1) {
      fireEvent(window, new Event('focus'));
    }
    trailing(Response.json({ data: [row('latest')] }));
    await expectRows('latest:latest');
    await expectIdle();
    expect(api.resources()).toHaveLength(3);
    expect(api.methods()).toStrictEqual([]);
  });

  it('does not publish an obsolete failure after the mounted provider is reset and unmounted', async () => {
    const api = server();
    const view = render(
      <FrappeProvider
        {...connection()}
        syncOptions={{ catchUpStrategy: 'snapshot' }}>
        <Probe />
      </FrappeProvider>,
    );
    await expectRows('a:a,b:b');
    const { sync } = observed.get('main')!;
    const release = api.hold();
    let pending!: ReturnType<SyncModule['catchUp']>;
    act(() => {
      pending = sync.catchUp();
    });
    await waitFor(() => {
      expect(api.resources()).toHaveLength(2);
    });
    view.unmount();
    sync.resetCache();
    const idle = sync.getCatchUpState();
    const listener = vi.fn<Parameters<SyncModule['subscribeStore']>[0]>();
    const unsubscribe = sync.subscribeStore(listener);
    release(Response.json({ message: 'obsolete' }, { status: 404 }));
    await pending;
    expect(sync.getCatchUpState()).toBe(idle);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

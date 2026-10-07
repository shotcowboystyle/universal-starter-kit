import { act, Suspense } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi, test } from 'vitest';

const runtime = vi.hoisted(() => ({ client: false }));
const { mockSubscribe, mockUnsubscribe, mockGetDocsForSubscription, storeListeners, docStore } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const docs = new Map<string, { name: string; doctype: string; title: string }[]>();
  let subscriptionCounter = 0;
  return {
    storeListeners: listeners,
    docStore: docs,
    mockSubscribe: vi.fn(async (query: { doctype: string }) => {
      const subscriptionId = `sub-${++subscriptionCounter}`;
      docs.set(subscriptionId, [
        { name: 'ws-1', doctype: query.doctype, title: 'Workspace One' },
        { name: 'ws-2', doctype: query.doctype, title: 'Workspace Two' },
      ]);
      return { subscriptionId, rows: docs.get(subscriptionId), checkpoint: 't0' };
    }),
    mockUnsubscribe: vi.fn((subscriptionId: string) => {
      docs.delete(subscriptionId);
    }),
    mockGetDocsForSubscription: vi.fn((subscriptionId: string) => docs.get(subscriptionId) ?? []),
  };
});

vi.mock(import('./sync'), () => ({
  SyncModule: class {
    subscribe = mockSubscribe;
    unsubscribe = mockUnsubscribe;
    getDocsForSubscription = mockGetDocsForSubscription;
    subscribeStore = (listener: () => void) => {
      storeListeners.add(listener);
      return () => storeListeners.delete(listener);
    };
    mutate = vi.fn();
  },
}));
vi.mock(import('./realtime'), () => ({ RealtimeModule: class {} }));
vi.mock(import('./core/http'), () => ({ HttpClient: class {} }));
vi.mock(import('./db'), () => ({ DbModule: class {} }));
vi.mock(import('./util'), () => ({ isBrowser: () => runtime.client }));
vi.mock(import('./fixtureDb'), () => ({ FixtureDbModule: class {} }));

import { useFrappeCollection } from './frappeReact';
import { useLiveQuery } from './useLiveQuery';

interface Doc {
  name: string;
  doctype: string;
  title: string;
}

test.each([false, true])('hydrates a cached collection after an earlier reader (delayed=%s)', async (delayed) => {
  const config = { baseURL: `https://neutral-${delayed}.invalid`, realtime: false };
  const collections = new Set<NonNullable<ReturnType<typeof useFrappeCollection<Doc>>>>();
  let release: () => void = () => {};
  let wait = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  function Reader({ late = false, enabled = true }: { late?: boolean; enabled?: boolean }) {
    if (late && wait) {
      throw pending;
    }
    const collection = useFrappeCollection<Doc>(enabled ? config : undefined, 'Workspace');
    if (collection) {
      collections.add(collection);
    }
    const result = useLiveQuery((q) => (collection ? q.from({ item: collection }) : null), [collection]);
    return (
      <div data-result={late ? 'late' : 'early'}>
        {enabled
          ? !collection || result.isLoading
            ? 'Loading'
            : result.data?.map((row) => row.title).join(',')
          : 'Disabled'}
      </div>
    );
  }
  const view = (
    <Suspense fallback={<span>Boundary pending</span>}>
      <Reader late />
    </Suspense>
  );
  runtime.client = false;
  const host = document.createElement('div');
  host.innerHTML = renderToString(view);
  expect(host.textContent).toBe('Loading');
  const serverNode = host.querySelector('[data-result]');
  document.body.append(host);
  const earlyHost = document.createElement('div');
  document.body.append(earlyHost);
  runtime.client = true;
  const errors = vi.fn();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  let early: Root | undefined;
  let late: Root | undefined;
  try {
    await act(async () => {
      early = createRoot(earlyHost);
      early.render(<Reader />);
    });
    await vi.waitFor(() => {
      expect(earlyHost.textContent).toContain('Workspace One');
    });
    const warm = [...collections][0];
    expect(warm.status).toBe('ready');
    wait = delayed;
    await act(async () => {
      late = hydrateRoot(host, view, { onRecoverableError: errors });
    });
    if (delayed) {
      expect(host.querySelector('[data-result]')).toBe(serverNode);
      expect(host.textContent).toBe('Loading');
      await act(async () => {
        wait = false;
        release();
      });
    }
    await vi.waitFor(() => {
      expect(host.textContent).toContain('Workspace One');
    });
    expect(errors.mock.calls.map(([e]) => String(e))).toEqual([]);
    expect(consoleError.mock.calls.filter((args) => /hydration|did not match/i.test(args.join(' ')))).toEqual([]);
    expect(host.querySelector('[data-result]')).toBe(serverNode);
    expect(collections.size).toBe(1);
    await act(async () => {
      for (const docs of docStore.values()) {
        docs.push({ name: 'ws-3', doctype: 'Workspace', title: 'Workspace Three' });
      }
      for (const listener of storeListeners) {
        listener();
      }
    });
    await vi.waitFor(() => {
      expect(host.textContent).toContain('Workspace Three');
    });
    await act(async () => {
      late!.render(<Reader enabled={false} />);
    });
    expect(host.textContent).toBe('Disabled');
    // A fresh boundary must use its own SSR snapshot after the shared cache
    // and an earlier boundary have both committed updates.
    await act(async () => {
      late!.unmount();
    });
    runtime.client = false;
    host.innerHTML = renderToString(view);
    expect(host.textContent).toBe('Loading');
    const freshServerNode = host.querySelector('[data-result]');
    runtime.client = true;
    await act(async () => {
      late = hydrateRoot(host, view, { onRecoverableError: errors });
    });
    await vi.waitFor(() => {
      expect(host.textContent).toContain('Workspace Three');
    });
    expect(host.querySelector('[data-result]')).toBe(freshServerNode);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      early?.unmount();
      late?.unmount();
    });
    host.remove();
    earlyHost.remove();
    consoleError.mockRestore();
  }
  await vi.waitFor(
    () => {
      expect([...collections].every((c) => c.subscriberCount === 0)).toBe(true);
    },
    { timeout: 10_000 },
  );
});

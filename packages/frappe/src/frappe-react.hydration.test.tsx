import { act, Suspense } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { HydrationOptions, Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { useFrappeCollection } from './frappe-react';
import { useLiveQuery } from './use-live-query';

type AnyFn = (...args: any[]) => any;
interface SubscribeStub {
  subscriptionId: string;
  rows: { name: string; doctype: string; title: string }[] | undefined;
  checkpoint: string;
}

const runtime = vi.hoisted(() => ({ client: false }));
const { mockSubscribe, mockUnsubscribe, mockGetDocsForSubscription, mockSubscribeStore, storeListeners, docStore } =
  vi.hoisted(() => {
    const listeners = new Set<() => void>();
    const docs = new Map<string, { name: string; doctype: string; title: string }[]>();
    let subscriptionCounter = 0;
    return {
      docStore: docs,
      mockSubscribe: vi.fn<(query: { doctype: string }) => Promise<SubscribeStub>>(async (query) => {
        subscriptionCounter += 1;
        const subscriptionId = `sub-${subscriptionCounter}`;
        docs.set(subscriptionId, [
          { name: 'ws-1', doctype: query.doctype, title: 'Workspace One' },
          { name: 'ws-2', doctype: query.doctype, title: 'Workspace Two' },
        ]);
        return { subscriptionId, rows: docs.get(subscriptionId), checkpoint: 't0' };
      }),
      mockUnsubscribe: vi.fn<(subscriptionId: string) => void>((subscriptionId) => {
        docs.delete(subscriptionId);
      }),
      mockGetDocsForSubscription: vi.fn<(subscriptionId: string) => unknown[]>(
        (subscriptionId) => docs.get(subscriptionId) ?? [],
      ),
      mockSubscribeStore: vi.fn<(listener: () => void) => () => boolean>((listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      storeListeners: listeners,
    };
  });

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the SyncModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./sync', () => ({
  SyncModule: class {
    subscribe = mockSubscribe;
    unsubscribe = mockUnsubscribe;
    getDocsForSubscription = mockGetDocsForSubscription;
    subscribeStore = mockSubscribeStore;
    mutate = vi.fn<AnyFn>();
  },
}));
// A bare vi.fn() is constructible, so it stands in for the classes below.
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the RealtimeModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./realtime', () => ({ RealtimeModule: vi.fn<() => void>() }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the HttpClient stub is partial; the real module type rejects it in a typed factory
vi.mock('./core/http', () => ({ HttpClient: vi.fn<() => void>() }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the DbModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./db', () => ({ DbModule: vi.fn<() => void>() }));
vi.mock(import('./util'), () => ({ isBrowser: () => runtime.client }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the FixtureDbModule stub is partial; the real module type rejects it in a typed factory
vi.mock('./fixture-db', () => ({ FixtureDbModule: vi.fn<() => void>() }));

interface Doc {
  name: string;
  doctype: string;
  title: string;
}

interface ReaderProps {
  late?: boolean;
  enabled?: boolean;
}

const readerLabel = (enabled: boolean, ready: boolean, titles: string | undefined): string | undefined => {
  if (!enabled) {
    return 'Disabled';
  }
  return ready ? titles : 'Loading';
};

describe('useFrappeCollection hydration', () => {
  it.each([false, true])('hydrates a cached collection after an earlier reader (delayed=%s)', async (delayed) => {
    const config = { baseURL: `https://neutral-${delayed}.invalid`, realtime: false };
    const collections = new Set<NonNullable<ReturnType<typeof useFrappeCollection<Doc>>>>();
    let wait = false;
    // A suspending boundary needs a promise the test settles by hand.
    const { promise: pending, resolve: release } = Promise.withResolvers<null>();
    const Reader = ({ late = false, enabled = true }: ReaderProps) => {
      if (late && wait) {
        // oxlint-disable-next-line typescript/only-throw-error -- Suspense protocol: throwing a promise suspends the boundary
        throw pending;
      }
      const collection = useFrappeCollection<Doc>(enabled ? config : undefined, 'Workspace');
      if (collection) {
        collections.add(collection);
      }
      const result = useLiveQuery((q) => (collection ? q.from({ item: collection }) : null), [collection]);
      const ready = collection !== undefined && !result.isLoading;
      return (
        <div data-result={late ? 'late' : 'early'}>
          {readerLabel(enabled, ready, result.data?.map((row) => row.title).join(','))}
        </div>
      );
    };
    const view = (
      <Suspense fallback={<span>Boundary pending</span>}>
        <Reader late />
      </Suspense>
    );
    runtime.client = false;
    const host = document.createElement('div');
    // oxlint-disable-next-line github/no-inner-html -- the test hydrates React's own server markup
    host.innerHTML = renderToString(view);
    expect(host.textContent).toBe('Loading');
    const serverNode = host.querySelector('[data-result]');
    document.body.append(host);
    const earlyHost = document.createElement('div');
    document.body.append(earlyHost);
    runtime.client = true;
    const errors = vi.fn<NonNullable<HydrationOptions['onRecoverableError']>>();
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
      const [warm] = collections;
      expect(warm.status).toBe('ready');
      wait = delayed;
      await act(async () => {
        late = hydrateRoot(host, view, { onRecoverableError: errors });
      });
      if (delayed) {
        // oxlint-disable-next-line vitest/no-conditional-expect -- only the delayed variant has a suspended window to observe
        expect(host.querySelector('[data-result]')).toBe(serverNode);
        // oxlint-disable-next-line vitest/no-conditional-expect -- see above
        expect(host.textContent).toBe('Loading');
        await act(async () => {
          wait = false;
          release(null);
        });
      }
      await vi.waitFor(() => {
        expect(host.textContent).toContain('Workspace One');
      });
      expect(errors.mock.calls.map(([e]) => String(e))).toStrictEqual([]);
      expect(consoleError.mock.calls.filter((args) => /hydration|did not match/iu.test(args.join(' ')))).toStrictEqual(
        [],
      );
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
      // oxlint-disable-next-line github/no-inner-html -- the test hydrates React's own server markup
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
});

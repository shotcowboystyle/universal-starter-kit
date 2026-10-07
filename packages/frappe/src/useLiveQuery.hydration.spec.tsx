import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi, test } from 'vitest';

const platform = vi.hoisted(() => ({ server: true }));
vi.mock(import('@repo/platform'), () => ({
  get isServer() {
    return platform.server;
  },
}));

test.each([
  { warm: false, enabled: true },
  { warm: true, enabled: true },
  { warm: true, enabled: false },
])('hydrates real queries and preserves updates/cleanup (%j)', async ({ warm, enabled }) => {
  platform.server = true;
  vi.resetModules();
  const serverDb = await import('@tanstack/db');
  const serverCollection = serverDb.createCollection(
    serverDb.localOnlyCollectionOptions({
      getKey: (row: { id: string; label: string }) => row.id,
      initialData: [{ id: 'alpha', label: 'Alpha' }],
    }),
  );
  const { useLiveQuery: serverQuery } = await import('./useLiveQuery');
  function ServerView() {
    const result = serverQuery((q) => (enabled ? q.from({ item: serverCollection }) : undefined));
    return (
      <div data-testid="result">
        {result.isEnabled ? (result.data?.map((row) => row.label).join(',') ?? 'Loading') : 'Disabled'}
      </div>
    );
  }
  const container = document.createElement('div');
  container.innerHTML = renderToString(<ServerView />);
  document.body.append(container);
  const serverNode = container.firstChild;
  platform.server = false;
  vi.resetModules();
  const clientDb = await import('@tanstack/db');
  const collection = clientDb.createCollection(
    clientDb.localOnlyCollectionOptions({
      getKey: (row: { id: string; label: string }) => row.id,
      initialData: [{ id: 'alpha', label: 'Alpha' }],
    }),
  );
  if (warm) {
    await collection.preload();
  }
  const { useLiveQuery: clientQuery } = await import('./useLiveQuery');
  let observedQuery: { subscriberCount: number; status: string } | undefined;
  function ClientView({ active = enabled, selected }: { active?: boolean; selected?: string }) {
    const result = clientQuery(
      (q) => {
        if (!active) {
          return;
        }
        const query = q.from({ item: collection });
        return selected ? query.where(({ item }) => clientDb.eq(item.id, selected)) : query;
      },
      [active, selected],
    );
    observedQuery = result.collection;
    return (
      <div data-testid="result">
        {result.isEnabled ? (result.data?.map((row) => row.label).join(',') ?? 'Loading') : 'Disabled'}
      </div>
    );
  }
  const onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, <ClientView />, { onRecoverableError });
    });
    expect(onRecoverableError.mock.calls.map(([error]) => error.cause?.message ?? error.message)).toEqual([]);
    expect(container.firstChild).toBe(serverNode);
    await vi.waitFor(() => {
      expect(container.textContent).toBe(enabled ? 'Alpha' : 'Disabled');
    });
    if (!enabled) {
      expect(collection.subscriberCount).toBe(0);
      await act(async () => {
        root!.render(<ClientView active />);
      });
    }
    await act(async () => {
      const transaction = collection.insert({ id: 'beta', label: 'Beta' });
      await transaction.isPersisted.promise;
    });
    await vi.waitFor(() => {
      expect(container.textContent).toBe('Alpha,Beta');
    });
    await act(async () => {
      root!.render(
        <ClientView
          active
          selected="beta"
        />,
      );
    });
    await vi.waitFor(() => {
      expect(container.textContent).toBe('Beta');
    });
    const { createOptimisticAction } = await import('./optimistic');
    let rejectWrite: (reason: Error) => void = () => {};
    const write = new Promise<void>((_resolve, reject) => {
      rejectWrite = reject;
    });
    const rename = createOptimisticAction({
      onMutate: () =>
        collection.update('beta', (row) => {
          row.label = 'Pending';
        }),
      mutationFn: async () => await write,
    });
    let transaction: ReturnType<typeof rename>;
    await act(async () => {
      transaction = rename();
    });
    await vi.waitFor(() => {
      expect(container.textContent).toBe('Pending');
    });
    await act(async () => {
      const refused = expect(transaction!.isPersisted.promise).rejects.toThrow('Write refused');
      rejectWrite(new Error('Write refused'));
      await refused;
    });
    await vi.waitFor(() => {
      expect(container.textContent).toBe('Beta');
    });
    const lastQuery = observedQuery;
    expect(lastQuery?.subscriberCount).toBeGreaterThan(0);
    await act(async () => {
      root!.unmount();
    });
    root = undefined;
    await vi.waitFor(() => {
      expect(lastQuery?.subscriberCount).toBe(0);
    });
    await vi.waitFor(() => {
      expect(lastQuery?.status).toBe('cleaned-up');
    });
  } finally {
    await act(async () => root?.unmount());
    container.remove();
    await collection.cleanup();
    await serverCollection.cleanup();
  }
});

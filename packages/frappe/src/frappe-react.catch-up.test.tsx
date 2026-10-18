import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryFixtureProvider } from './fixtures';
import { getFrappeSyncModule, useFrappeCatchUp, useFrappePendingMutations } from './frappe-react';
import type { UseFrappeCollectionConfig } from './frappe-react';
import type { SyncModule } from './sync';
import { Operation, Status } from './sync/types';

const modules = new Set<SyncModule>();
const moduleFor = (config: UseFrappeCollectionConfig) => {
  const sync = getFrappeSyncModule(config)!;
  expect(sync).toBeDefined();
  modules.add(sync);
  return sync;
};

describe('useFrappeCatchUp and module selection', () => {
  afterEach(async () => {
    await Promise.all(
      [...modules].map(async (sync) => {
        await sync.dispose();
      }),
    );
    modules.clear();
    vi.unstubAllGlobals();
  });

  it.each([false, true])('separates effective options in the shared cache, fixtures=%s', (fixture) => {
    const config = fixture
      ? { fixtures: new InMemoryFixtureProvider({}) }
      : { baseURL: 'https://cache-options.test', realtime: false };
    const defaultSync = moduleFor(config);
    expect(moduleFor({ ...config, syncOptions: { catchUpStrategy: 'cdc', cdcInterval: 0 } })).toBe(defaultSync);
    const snapshot = moduleFor({ ...config, syncOptions: { catchUpStrategy: 'snapshot' } });
    expect(snapshot).not.toBe(defaultSync);
    expect(moduleFor({ ...config, syncOptions: { catchUpStrategy: 'snapshot' } })).toBe(snapshot);
    expect(moduleFor({ ...config, syncOptions: { cdcInterval: 1000 } })).not.toBe(defaultSync);
  });

  it('follows the selected module, retains failure state during retry and does not retry on render', async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ data: [{ name: 'a', doctype: 'Task' }] }));
    vi.stubGlobal('fetch', transport);
    const cdc = { baseURL: 'https://hook-options.test', realtime: false };
    const snapshot = { ...cdc, syncOptions: { catchUpStrategy: 'snapshot' as const } };
    const first = moduleFor(cdc);
    const second = moduleFor(snapshot);
    await first.subscribe({ doctype: 'Task' });
    await second.subscribe({ doctype: 'Task' });
    const view = renderHook(({ config }) => useFrappeCatchUp(config), {
      initialProps: { config: cdc as UseFrappeCollectionConfig | undefined },
    });
    transport.mockImplementation(async () => Response.json({ message: 'unavailable' }, { status: 404 }));
    await act(async () => {
      await view.result.current.retry();
    });
    expect(view.result.current).toMatchObject({
      refreshing: false,
      stale: true,
      error: { status: 404 },
    });
    const calls = transport.mock.calls.length;
    view.rerender({ config: { ...cdc } });
    expect(transport).toHaveBeenCalledTimes(calls);
    view.rerender({ config: snapshot });
    await waitFor(() => {
      expect(view.result.current.stale).toBe(false);
    });
    transport.mockImplementation(async () => Response.json({ data: [] }));
    await act(async () => {
      await view.result.current.retry();
    });
    expect(view.result.current.error).toBeNull();
    expect(second.__debug().subscriptions[0].docCount).toBe(0);
    expect(first.__debug().subscriptions[0].docCount).toBe(1);
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an absent connection config is `undefined` by the hook's contract
    view.rerender({ config: undefined });
    await expect(view.result.current.retry()).resolves.toStrictEqual({
      refreshing: false,
      stale: false,
      error: null,
    });
    view.unmount();
  });

  it("drops the previous module's mutation notice when changed options select an empty ledger", () => {
    const config = { fixtures: new InMemoryFixtureProvider({}) };
    const next = { ...config, syncOptions: { catchUpStrategy: 'snapshot' as const } };
    vi.spyOn(moduleFor(config), 'getMutationEntries').mockReturnValue([
      {
        id: 'old',
        operation: Operation.Update,
        doctype: 'Task',
        status: Status.Failed,
        createdAt: 1,
        retryCount: 0,
        error: 'old module failure',
      },
    ]);
    moduleFor(next);
    const view = renderHook(({ connection }) => useFrappePendingMutations(connection), {
      initialProps: { connection: config as UseFrappeCollectionConfig },
    });
    expect(view.result.current.failed.map((entry) => entry.id)).toStrictEqual(['old']);
    view.rerender({ connection: next });
    expect(view.result.current.entries).toStrictEqual([]);
    view.unmount();
  });
});

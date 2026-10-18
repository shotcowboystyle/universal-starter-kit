import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpClient } from '../core/http';
import { DbModule } from '../db';

import { BackfillScope } from './types';
import type { SyncOptions } from './types';

import { SyncModule } from './index';

const modules: SyncModule[] = [];
const row = (name: string) => ({ name, doctype: 'Task', modified: '2026-09-09T00:00:00Z' });
const setup = (options: SyncOptions = {}) => {
  const transport = vi.fn<(url: string) => Promise<Response>>(async () => Response.json({ data: [row('a')] }));
  vi.stubGlobal('fetch', transport);
  const sync = new SyncModule(
    new DbModule(new HttpClient('https://catch-up.test', undefined, { maxRetries: 0 }), {
      appName: 'live.live',
    }),
    undefined,
    options,
  );
  modules.push(sync);
  return { sync, transport };
};
const deferred = <T>() => Promise.withResolvers<T>();
describe('sync catch-up', () => {
  afterEach(async () => {
    await Promise.all(
      modules.splice(0).map(async (sync) => {
        await sync.dispose();
      }),
    );
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('refreshes resource snapshots through focus, online and the optional interval', async () => {
    vi.useFakeTimers();
    const { sync, transport } = setup({ catchUpStrategy: 'snapshot', cdcInterval: 1000 });
    const { subscriptionId } = await sync.subscribe({ doctype: 'Task' });
    expect(sync.getCatchUpState()).toStrictEqual({ refreshing: false, stale: false, error: null });
    for (const trigger of ['focus', 'online', 'interval']) {
      transport.mockResolvedValue(Response.json({ data: [row(trigger)] }));
      if (trigger === 'interval') {
        // oxlint-disable-next-line eslint/no-await-in-loop -- triggers must fire one after another
        await vi.advanceTimersByTimeAsync(1000);
      } else {
        window.dispatchEvent(new Event(trigger));
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- triggers must fire one after another
      await vi.waitFor(() => {
        expect(sync.getDocsForSubscription(subscriptionId)[0]?.name).toBe(trigger);
      });
      // oxlint-disable-next-line eslint/no-await-in-loop -- triggers must fire one after another
      await vi.waitFor(() => {
        expect(sync.getCatchUpState().refreshing).toBe(false);
      });
    }
    expect(transport.mock.calls.every(([url]) => new URL(url).pathname === '/api/resource/Task')).toBe(true);
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it('retains rows and stale/error qualification through a deferred retry', async () => {
    const { sync, transport } = setup({ catchUpStrategy: 'snapshot' });
    const { subscriptionId } = await sync.subscribe({ doctype: 'Task' });
    transport.mockResolvedValue(Response.json({ message: 'unavailable' }, { status: 503 }));
    const failed = await sync.catchUp();
    expect(failed).toMatchObject({ refreshing: false, stale: true });
    expect(failed.error).toBeInstanceOf(AggregateError);
    expect(sync.getDocsForSubscription(subscriptionId)).toStrictEqual([row('a')]);
    const read = deferred<Response>();
    transport.mockReturnValue(read.promise);
    const retry = sync.catchUp();
    expect(sync.getCatchUpState()).toMatchObject({
      refreshing: true,
      stale: true,
      error: failed.error,
    });
    read.resolve(Response.json({ data: [] }));
    await expect(retry).resolves.toStrictEqual({ refreshing: false, stale: false, error: null });
    expect(sync.getDocsForSubscription(subscriptionId)).toStrictEqual([]);
  });

  it('keeps CDC as default, observes its error and preserves explicit backfill rejection', async () => {
    const { sync, transport } = setup();
    const { subscriptionId } = await sync.subscribe({ doctype: 'Task' });
    transport.mockImplementation(async () => Response.json({ message: 'no CDC' }, { status: 404 }));
    const result = await sync.catchUp();
    expect(result).toMatchObject({ stale: true, error: { status: 404 } });
    expect(new URL(transport.mock.calls[1][0]).pathname).toBe('/api/method/live.live.api.backfill');
    await expect(sync.backfill({ scope: BackfillScope.All })).rejects.toMatchObject({ status: 404 });
    transport.mockImplementation(async () =>
      Response.json({
        message: {
          rows: [row('b')],
          deleted: [{ name: 'a' }],
          checkpoint: 'next',
          has_more: false,
        },
      }),
    );
    await expect(sync.catchUp()).resolves.toStrictEqual({ refreshing: false, stale: false, error: null });
    expect(sync.getDocsForSubscription(subscriptionId).map((doc) => doc.name)).toStrictEqual(['b']);
    expect(sync.getSubscription(subscriptionId)?.checkpoint).toBe('next');
  });

  it('rejects progressive snapshot subscriptions before any fetch', async () => {
    const { sync, transport } = setup({ catchUpStrategy: 'snapshot' });
    await expect(sync.subscribe({ doctype: 'Task', progressive: true })).rejects.toThrow(/progressive/u);
    expect(transport).not.toHaveBeenCalled();
  });

  it('coalesces overlap into at most one trailing request and settles despite more events', async () => {
    const { sync, transport } = setup({ catchUpStrategy: 'snapshot' });
    await sync.subscribe({ doctype: 'Task' });
    const first = deferred<Response>();
    const last = deferred<Response>();
    transport.mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    const one = sync.catchUp();
    await vi.waitFor(() => {
      expect(transport).toHaveBeenCalledTimes(2);
    });
    expect(sync.catchUp()).toBe(one);
    expect(sync.catchUp()).toBe(one);
    first.resolve(Response.json({ data: [row('first')] }));
    await vi.waitFor(() => {
      expect(transport).toHaveBeenCalledTimes(3);
    });
    for (let i = 0; i < 20; i += 1) {
      expect(sync.catchUp()).toBe(one);
    }
    last.resolve(Response.json({ data: [row('last')] }));
    await expect(one).resolves.toStrictEqual({ refreshing: false, stale: false, error: null });
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it.each(['reset', 'dispose'])('does not publish a late failed catch-up after %s', async (end) => {
    const { sync, transport } = setup({ catchUpStrategy: 'snapshot' });
    await sync.subscribe({ doctype: 'Task' });
    const read = deferred<Response>();
    transport.mockReturnValue(read.promise);
    const pending = sync.catchUp();
    await vi.waitFor(() => {
      expect(transport).toHaveBeenCalledTimes(2);
    });
    if (end === 'reset') {
      sync.resetCache();
    } else {
      await sync.dispose();
    }
    const afterReset = sync.getCatchUpState();
    const listener = vi.fn<() => void>();
    const unsubscribe = sync.subscribeStore(listener);
    read.resolve(Response.json({ message: 'obsolete' }, { status: 503 }));
    await pending;
    expect(sync.getCatchUpState()).toBe(afterReset);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

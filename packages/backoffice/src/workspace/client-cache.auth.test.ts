// The workspace hooks cache their REST client per connection. Two
// connections to one bench that differ only in useToken must not share a
// client, or the first one built decides whether the other sends its token
// (MPO-406). The bench answers a tokenless call as Guest.
import type { FrappeConfig } from '@repo/frappe-ui';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDashboardChartData } from './use-dashboard-chart';
import { useWorkspaceDoc } from './use-workspace-doc';

const provider = vi.hoisted(() => ({ config: undefined as FrappeConfig | undefined }));
vi.mock(import('@repo/frappe-ui'), () => ({ useFrappeConfig: () => provider.config }));

const token = 'token key:secret';
let sent: (string | null)[] = [];

const auth = (useToken: boolean) => ({ useToken, token: 'key:secret', type: 'token' });

const authorizationPerConnection = async (
  baseURL: string,
  mount: () => () => boolean,
): Promise<{ off: (string | null)[]; on: (string | null)[] }> => {
  provider.config = { baseURL, realtime: false, auth: auth(false) };
  const offSettled = mount();
  await waitFor(() => {
    expect(offSettled()).toBe(true);
  });
  const off = sent.splice(0);
  provider.config = { baseURL, realtime: false, auth: auth(true) };
  const onSettled = mount();
  await waitFor(() => {
    expect(onSettled()).toBe(true);
  });
  return { off, on: sent.splice(0) };
};

describe("workspace REST clients never drop a connection's token", () => {
  beforeEach(() => {
    sent = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      sent.push(new Headers(init?.headers).get('Authorization'));
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const body = url.pathname.startsWith('/api/resource/')
        ? { data: { name: 'Home', doctype: 'Workspace' } }
        : { message: { labels: [], datasets: [] } };
      return Response.json(body);
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('useDashboardChartData', async () => {
    const { off, on } = await authorizationPerConnection('http://chart-auth.test', () => {
      const { result } = renderHook(() => useDashboardChartData('Sales'));
      return () => !result.current.isLoading && !!result.current.series;
    });
    expect(off).toStrictEqual([null]);
    expect(on).toStrictEqual([token]);
  });

  it('useWorkspaceDoc', async () => {
    const { off, on } = await authorizationPerConnection('http://workspace-auth.test', () => {
      const { result } = renderHook(() => useWorkspaceDoc('Home'));
      return () => !result.current.isLoading && !!result.current.doc;
    });
    expect(off).toStrictEqual([null]);
    expect(on).toStrictEqual([token]);
  });
});

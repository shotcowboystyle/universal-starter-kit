// Each hook here caches its REST client per connection. Two connections to
// one bench that differ only in useToken must not share a client, or the
// first one built decides whether the other sends its token (MPO-399,
// MPO-406). The bench answers a tokenless call as Guest.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFrappeReport } from './FrappeReportView';
import { useFrappeAggregate } from './useFrappeAggregate';
import { useFrappeFacets } from './useFrappeFacets';

const token = 'token key:secret';
let sent: (string | null)[] = [];

function reply(url: URL): unknown {
  const method = url.pathname.replace(/^\/api\/method\//, '');
  if (method === 'frappe.client.get_count') {
    return { message: 3 };
  }
  if (method === 'frappe.desk.reportview.get_sidebar_stats') {
    return { message: { stats: {} } };
  }
  if (method === 'frappe.desk.query_report.run') {
    return { message: { columns: [], result: [] } };
  }
  return { message: [] };
}

beforeEach(() => {
  sent = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    sent.push(new Headers(init?.headers).get('Authorization'));
    return new Response(JSON.stringify(reply(new URL(String(input)))), {
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

function connection(baseURL: string, useToken: boolean) {
  return { baseURL, realtime: false, auth: { useToken, token: 'key:secret', type: 'token' } };
}

async function authorizationPerConnection(
  mount: (useToken: boolean) => () => boolean,
): Promise<{ off: (string | null)[]; on: (string | null)[] }> {
  const offSettled = mount(false);
  await waitFor(() => {
    expect(offSettled()).toBe(true);
  });
  const off = sent.splice(0);
  const onSettled = mount(true);
  await waitFor(() => {
    expect(onSettled()).toBe(true);
  });
  return { off, on: sent.splice(0) };
}

describe("cached REST clients never drop a connection's token", () => {
  it('useFrappeAggregate', async () => {
    const { off, on } = await authorizationPerConnection((useToken) => {
      const { result } = renderHook(() =>
        useFrappeAggregate(connection('http://aggregate-auth.test', useToken), {
          doctype: 'ToDo',
        }),
      );
      return () => !result.current.isLoading;
    });
    expect(off).toEqual([null]);
    expect(on).toEqual([token]);
  });

  it('useFrappeFacets', async () => {
    const { off, on } = await authorizationPerConnection((useToken) => {
      const { result } = renderHook(() =>
        useFrappeFacets('ToDo', [], {
          connection: connection('http://facets-auth.test', useToken),
        }),
      );
      return () =>
        !result.current.assigned.isLoading && !result.current.owner.isLoading && !result.current.tags.isLoading;
    });
    expect(off.length).toBeGreaterThan(0);
    expect(new Set(off)).toEqual(new Set([null]));
    expect(on).toHaveLength(off.length);
    expect(new Set(on)).toEqual(new Set([token]));
  });

  it('useFrappeReport (FrappeReportView)', async () => {
    const { off, on } = await authorizationPerConnection((useToken) => {
      const { result } = renderHook(() =>
        useFrappeReport(connection('http://report-auth.test', useToken), {
          reportName: 'ToDo Summary',
          debounceMs: 0,
        }),
      );
      return () => !result.current.isLoading;
    });
    expect(off).toEqual([null]);
    expect(on).toEqual([token]);
  });
});

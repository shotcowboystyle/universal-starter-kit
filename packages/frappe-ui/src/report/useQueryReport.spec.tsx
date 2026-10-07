/**
 * useQueryReport's live path (MPO-15, GL-28): the desk hook reads the Report
 * doc and script, then runs the report through useFrappeReport, the
 * transport FrappeReportView uses, and hands back the one model's columns and
 * rows. A refused run keeps its HTTP status on the humanized error.
 */
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from '../FrappeProvider';

import { useQueryReport } from './useQueryReport';

interface Recorded {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let calls: Recorded[] = [];
let runResponse: () => Response;

beforeEach(() => {
  calls = [];
  runResponse = () =>
    json({
      message: {
        columns: ['ID:Link/ToDo:120', { label: 'Assigned To/Owner', fieldtype: 'Data' }],
        result: [['TD-1', 'jane@example.com'], { id: 'TD-2', 'assigned_to/owner': 'joe@example.com' }],
        execution_time: 0.25,
        message: 'Two open',
      },
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
      calls.push({ method, url, body });
      if (url.includes('frappe.client.get')) {
        return json({
          message: {
            name: 'Open Work',
            report_name: 'Open Work',
            filters: [{ fieldname: 'owner', label: 'Owner', fieldtype: 'Data', default: 'jane' }],
          },
        });
      }
      if (url.includes('frappe.desk.query_report.get_script')) {
        return json({ message: {} });
      }
      if (url.includes('frappe.desk.query_report.run')) {
        return runResponse();
      }
      return json({ message: null });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let run = 0;
function wrapper() {
  run += 1;
  const baseURL = `https://query-report-${run}.spec.test`;
  return ({ children }: { children: ReactNode }) => (
    <FrappeProvider
      baseURL={baseURL}
      realtime={false}>
      {children}
    </FrappeProvider>
  );
}

describe('useQueryReport over the shared transport', () => {
  it("seeds the doc's defaults, runs once, and reads the model's rows", async () => {
    const { result } = renderHook(() => useQueryReport('Open Work'), { wrapper: wrapper() });
    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 5000 },
    );
    expect(result.current.error).toBeUndefined();
    expect(result.current.columns.map((column) => column.fieldname)).toEqual(['id', 'assigned_to/owner']);
    expect(result.current.rows).toEqual([
      { id: 'TD-1', 'assigned_to/owner': 'jane@example.com' },
      { id: 'TD-2', 'assigned_to/owner': 'joe@example.com' },
    ]);
    expect(result.current.executionTime).toBe(0.25);
    expect(result.current.serverMessage).toBe('Two open');

    const runs = calls.filter((call) => call.url.includes('frappe.desk.query_report.run'));
    expect(runs).toHaveLength(1);
    expect(runs[0].method).toBe('POST');
    expect(runs[0].body).toMatchObject({
      report_name: 'Open Work',
      filters: { owner: 'jane' },
      ignore_prepared_report: 1,
      are_default_filters: 0,
    });
  });

  it("keeps the refused run's status on the humanized error", async () => {
    runResponse = () =>
      json(
        {
          exc_type: 'PermissionError',
          _server_messages: JSON.stringify([JSON.stringify({ message: 'You are not permitted to run Open Work' })]),
        },
        403,
      );
    const { result } = renderHook(() => useQueryReport('Open Work'), { wrapper: wrapper() });
    await waitFor(
      () => {
        expect(result.current.error).toBeDefined();
      },
      { timeout: 5000 },
    );
    const error = result.current.error as Error & { status?: number; exc_type?: string };
    expect(error.message).toBe('You are not permitted to run Open Work');
    expect(error.status).toBe(403);
    expect(error.exc_type).toBe('PermissionError');
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

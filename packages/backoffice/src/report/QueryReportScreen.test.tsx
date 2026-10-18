/**
 * QueryReportScreen filter URL round-trip (fixture — no bench RPC).
 * Apply commits the draft into navigator.setParams(`?filters=`).
 */
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { parseQueryReportFiltersParam } from './query-report-url-state';
import { QueryReportScreen } from './QueryReportScreen';
import type { QueryReportFixture } from './reportShapes';

const MOCK_HOST = 'https://backoffice-query-report-filters.mock.test';

const gatedFixture: QueryReportFixture = {
  meta: {
    report_name: 'Team Workload',
    ref_doctype: 'ToDo',
    filters: [{ fieldname: 'owner', label: 'Owner', fieldtype: 'Data', mandatory: 1 }],
  },
  columns: [
    { label: 'ID', fieldname: 'id', fieldtype: 'Link', options: 'ToDo', width: '120' },
    { label: 'Description', fieldname: 'description', fieldtype: 'Data', width: '260' },
  ],
  rows: [{ id: 'TD-0001', description: 'Confirm launch checklist' }],
};

describe('QueryReportScreen filter URL round-trip', () => {
  it('writes applied filters into ?filters= and renders rows', async () => {
    const navigation = createMemoryNavigator('/backoffice/query-report/Team%20Workload');
    renderWithProviders(
      <BackofficeProvider
        frappe={{ baseURL: MOCK_HOST }}
        navigation={navigation}>
        <QueryReportScreen
          reportName="Team Workload"
          fixture={gatedFixture}
        />
      </BackofficeProvider>,
    );

    await screen.findByText('Filters required');
    const owner = await screen.findByRole('textbox', { name: /owner/iu });
    fireEvent.change(owner, { target: { value: 'jane@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(screen.queryByText('Filters required')).toBeNull();
      expect(screen.getByText('TD-0001')).toBeTruthy();
    });

    const raw = navigation.getLocation().params.filters;
    const parsed = parseQueryReportFiltersParam(Array.isArray(raw) ? raw[0] : raw);
    expect(parsed).toMatchObject({ owner: 'jane@example.com' });
  });

  it('hides the table Search chrome and offers CSV export (Desk query-report)', async () => {
    const navigation = createMemoryNavigator('/backoffice/query-report/Team%20Workload');
    renderWithProviders(
      <BackofficeProvider
        frappe={{ baseURL: MOCK_HOST }}
        navigation={navigation}>
        <QueryReportScreen
          reportName="Team Workload"
          fixture={gatedFixture}
        />
      </BackofficeProvider>,
    );

    const owner = await screen.findByRole('textbox', { name: /owner/iu });
    fireEvent.change(owner, { target: { value: 'jane@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(screen.getByText('TD-0001')).toBeTruthy();
    });

    expect(screen.queryByPlaceholderText(/search/iu)).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('button', { name: /export csv/iu })).toBeTruthy();
  });
});

// LC-96: a report the session may not run is a permission state, not an error
// whose retry cannot succeed. The bench refuses the Report doc, its script and
// the run the way Frappe refuses a user without the report's role.
const stubRefusingBench = (message = "You don't have access to Report: Team Workload") => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      {
        exc_type: 'PermissionError',
        _server_messages: JSON.stringify([JSON.stringify({ message })]),
      },
      { status: 403, headers: { 'content-type': 'application/json' } },
    ),
  );
};

describe('QueryReportScreen refused run', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  let run = 0;
  const renderRefused = () => {
    run += 1;
    const navigation = createMemoryNavigator('/backoffice/query-report/Team%20Workload');
    return renderWithProviders(
      <BackofficeProvider
        frappe={{ baseURL: `https://backoffice-query-report-refused-${run}.mock.test` }}
        navigation={navigation}>
        <QueryReportScreen reportName="Team Workload" />
      </BackofficeProvider>,
    );
  };

  it("says the reader can't run the report, with the server's reason and no retry", async () => {
    stubRefusingBench();
    renderRefused();

    const state = await screen.findByTestId('frappe-report-not-permitted', {}, { timeout: 8000 });
    expect(state.textContent).toContain(`You can't run "Team Workload"`);
    expect(state.textContent).toContain("You don't have access to Report: Team Workload");
    expect(screen.queryByRole('button', { name: /retry|refresh/iu })).toBeNull();
  });

  // MPO-473: a refused run has nothing to export, and never will.
  it('offers no Export CSV', async () => {
    stubRefusingBench();
    renderRefused();

    await screen.findByTestId('frappe-report-not-permitted', {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: /export csv/iu })).toBeNull();
    expect(screen.queryByText('Export CSV')).toBeNull();
  });

  // Verbatim from pokemon's bench signed out: is_whitelisted refuses Guest with
  // one message, a <details> summary and body, which rendered glued as
  // "Login to accessFunction frappe.desk.query_report.run …".
  it("renders each line of the server's reason on its own", async () => {
    stubRefusingBench(
      '<details><summary>You are not permitted to access this resource. Login to access</summary>Function <strong>frappe.desk.query_report.run</strong> is not whitelisted.</details>',
    );
    renderRefused();

    const state = await screen.findByTestId('frappe-report-not-permitted', {}, { timeout: 8000 });
    const lines = [...state.querySelectorAll('p')].map((node) => node.textContent);
    expect(lines).toStrictEqual([
      'You are not permitted to access this resource. Login to access',
      'Function frappe.desk.query_report.run is not whitelisted.',
    ]);
  });
});

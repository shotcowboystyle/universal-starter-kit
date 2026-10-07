import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
// The compatibility report view (MPO-414), still exported beside
// DoctypeReportView. Since MPO-15 (GL-28) it is that view under its old name,
// FrappeReportBuilder under the desk's navigation: it totals the filtered
// result, opens a record from the grid, applies and clears the ?f= base
// filters, and ANDs the desk scope into its queries (GL-5).
import React from 'react';
import { describe, expect, it } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { DeskScopeProvider } from '../desk/scope';
import { createMemoryNavigator } from '../navigation/navigator';
import type { MemoryNavigator } from '../navigation/navigator';
import type { FrappeFilters } from '../shared/types';

import { ReportView } from './ReportView';

const orderMeta = {
  name: 'QaLegacyOrder',
  doctype: 'DocType',
  module: 'QA',
  title_field: 'customer',
  fields: [
    { fieldname: 'customer', fieldtype: 'Data', label: 'Customer', in_list_view: 1 },
    { fieldname: 'amount', fieldtype: 'Int', label: 'Amount', in_list_view: 1 },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Draft\nPaid',
      in_list_view: 1,
    },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

const orders = [
  ['QLO-0001', 'ACME Corp', 'Paid', 100],
  ['QLO-0002', 'Globex', 'Draft', 20],
  ['QLO-0003', 'Initech', 'Draft', 3],
].map(([name, customer, status, amount]) => ({
  name: String(name),
  doctype: 'QaLegacyOrder',
  customer,
  status,
  amount,
  modified: '2026-08-01 09:00:00',
}));

let run = 0;

function renderReport(filtersParam?: string, scope?: FrappeFilters): MemoryNavigator {
  run += 1;
  const navigation = createMemoryNavigator('/backoffice/qalegacyorder/view/report');
  renderWithProviders(
    <BackofficeProvider
      frappe={{
        baseURL: `https://legacy-report-${run}.spec.test`,
        fixtures: new InMemoryFixtureProvider({ DocType: [orderMeta], QaLegacyOrder: orders }),
      }}
      navigation={navigation}>
      <DeskScopeProvider scope={scope}>
        <ReportView
          doctype="QaLegacyOrder"
          filtersParam={filtersParam}
        />
      </DeskScopeProvider>
    </BackofficeProvider>,
  );
  return navigation;
}

function rowNames(): string[] {
  return Array.from(
    document.querySelectorAll('[data-report-row="true"]'),
    (row) => row.getAttribute('aria-label') ?? '',
  );
}

async function rowsAre(names: string[]) {
  await waitFor(
    () => {
      expect(rowNames().sort()).toEqual([...names].sort());
    },
    { timeout: 5000 },
  );
}

describe('<ReportView />', () => {
  it('is the desk report view, totals row included', async () => {
    renderReport();
    await rowsAre(['QLO-0001', 'QLO-0002', 'QLO-0003']);
    const totals = screen.getByText('Totals').closest('[role=row]') ?? screen.getByText('Totals');
    expect(totals.parentElement?.textContent ?? totals.textContent).toContain('123');
  });

  it('opens a record from the grid', async () => {
    const navigation = renderReport();
    await rowsAre(['QLO-0001', 'QLO-0002', 'QLO-0003']);
    fireEvent.click(screen.getByText('Globex'));
    await waitFor(() => {
      expect(navigation.getLocation().path).toBe('/backoffice/qalegacyorder/QLO-0002');
    });
  });

  it('applies the ?f= base filters and drops them from the address on clear', async () => {
    const navigation = renderReport(encodeURIComponent(JSON.stringify([['status', '=', 'Draft']])));
    await rowsAre(['QLO-0002', 'QLO-0003']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await rowsAre(['QLO-0001', 'QLO-0002', 'QLO-0003']);
    expect(navigation.getLocation().path).toBe('/backoffice/qalegacyorder/view/report');
  });

  it('ANDs the desk scope into the grid, with nothing to clear', async () => {
    renderReport(undefined, [['status', '=', 'Paid']]);
    await rowsAre(['QLO-0001']);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    expect(screen.queryByText('Globex')).toBeNull();
    expect(screen.getAllByText('ACME Corp').length).toBeGreaterThan(0);
  });
});

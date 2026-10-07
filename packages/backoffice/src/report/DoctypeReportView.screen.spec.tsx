import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
// The desk report view (MPO-414): rows from the live collection, a row press
// opens the form, the per-column filter row and the ?f= base filters narrow
// the result, the desk scope is ANDed in, and Save As round-trips ?report=.
import React from 'react';
import { describe, expect, it } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { DeskScopeProvider } from '../desk/scope';
import { createMemoryNavigator } from '../navigation/navigator';
import type { MemoryNavigator } from '../navigation/navigator';
import type { FrappeFilters } from '../shared/types';

import { DoctypeReportView } from './DoctypeReportView';

const orderMeta = {
  name: 'QaReportOrder',
  doctype: 'DocType',
  module: 'QA',
  title_field: 'customer',
  sort_field: 'modified',
  sort_order: 'DESC',
  fields: [
    { fieldname: 'customer', fieldtype: 'Data', label: 'Customer', in_list_view: 1 },
    { fieldname: 'amount', fieldtype: 'Currency', label: 'Amount', in_list_view: 1 },
    {
      fieldname: 'region',
      fieldtype: 'Select',
      label: 'Region',
      options: 'North\nSouth',
      in_standard_filter: 1,
    },
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
  ['QA-ORD-0001', 'ACME Corp', 'North', 'Paid', 1],
  ['QA-ORD-0002', 'Globex', 'South', 'Draft', 2],
  ['QA-ORD-0003', 'Initech', 'North', 'Draft', 3],
].map(([name, customer, region, status, day]) => ({
  name: String(name),
  doctype: 'QaReportOrder',
  customer,
  amount: 1000,
  region,
  status,
  modified: `2026-08-0${day} 09:00:00`,
}));

let run = 0;

function renderReport(props: { filtersParam?: string; scope?: FrappeFilters; doctype?: string } = {}): MemoryNavigator {
  run += 1;
  const navigation = createMemoryNavigator('/backoffice/qareportorder/view/report');
  renderWithProviders(
    <BackofficeProvider
      frappe={{
        baseURL: `https://doctype-report-${run}.spec.test`,
        fixtures: new InMemoryFixtureProvider({
          DocType: [orderMeta, { ...orderMeta, name: 'QaReportEmpty' }],
          QaReportOrder: orders,
          QaReportEmpty: [],
        }),
      }}
      navigation={navigation}>
      <DeskScopeProvider scope={props.scope}>
        <DoctypeReportView
          doctype={props.doctype ?? 'QaReportOrder'}
          filtersParam={props.filtersParam}
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

describe('<DoctypeReportView />', () => {
  it('draws a row per record and opens the form on press', async () => {
    const navigation = renderReport();
    await rowsAre(['QA-ORD-0001', 'QA-ORD-0002', 'QA-ORD-0003']);
    fireEvent.click(screen.getByText('Globex'));
    expect(navigation.getLocation().path).toBe('/backoffice/qareportorder/QA-ORD-0002');
  });

  it('narrows the rows from the column filter row and clears it again', async () => {
    renderReport();
    await rowsAre(['QA-ORD-0001', 'QA-ORD-0002', 'QA-ORD-0003']);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Filter Region' }), {
      target: { value: 'North' },
    });
    await rowsAre(['QA-ORD-0001', 'QA-ORD-0003']);
    fireEvent.click(screen.getByRole('button', { name: /Clear column filters \(1\)/ }));
    await rowsAre(['QA-ORD-0001', 'QA-ORD-0002', 'QA-ORD-0003']);
  });

  it('applies the ?f= base filters and drops them from the address on clear', async () => {
    const navigation = renderReport({
      filtersParam: encodeURIComponent(JSON.stringify([['status', '=', 'Draft']])),
    });
    await rowsAre(['QA-ORD-0002', 'QA-ORD-0003']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await rowsAre(['QA-ORD-0001', 'QA-ORD-0002', 'QA-ORD-0003']);
    expect(navigation.getLocation().path).toBe('/backoffice/qareportorder/view/report');
  });

  it('ANDs the desk scope in, with nothing to clear', async () => {
    renderReport({ scope: [['region', '=', 'South']] });
    await rowsAre(['QA-ORD-0002']);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('says so when the doctype has no records', async () => {
    renderReport({ doctype: 'QaReportEmpty' });
    await expect(screen.findByText('No results', {}, { timeout: 5000 })).resolves.toBeTruthy();
    expect(screen.getByText('There are no QaReportEmpty records yet')).toBeTruthy();
  });

  it('saves the current report under a name and selects it', async () => {
    const navigation = renderReport();
    await rowsAre(['QA-ORD-0001', 'QA-ORD-0002', 'QA-ORD-0003']);
    fireEvent.click(screen.getByRole('button', { name: 'Save As…' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'New report name' }), {
      target: { value: 'Weekly Northern' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(
      () => {
        expect(navigation.getLocation().params.report).toBe('Weekly Northern');
      },
      {
        timeout: 5000,
      },
    );
    await expect(
      screen.findByRole('button', { name: 'Report: Weekly Northern' }, { timeout: 5000 }),
    ).resolves.toBeTruthy();
  });
});

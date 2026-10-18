// The per-doctype dashboard (MPO-414): KPI counts over the rolling windows,
// a card per status option that opens the pre-filtered list, the weekly
// chart's empty state, and the desk scope ANDed into every query (GL-5).

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { DeskScopeProvider } from '../desk/scope';
import { createMemoryNavigator } from '../navigation/navigator';
import type { MemoryNavigator } from '../navigation/navigator';
import type { FrappeFilters } from '../shared/types';

import { DashboardView } from './DashboardView';

const dashboardMeta = (name: string, withStatus = true) => ({
  name,
  doctype: 'DocType',
  module: 'QA',
  title_field: 'subject',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
    ...(withStatus
      ? [
          {
            fieldname: 'status',
            fieldtype: 'Select',
            label: 'Status',
            options: 'Open\nWorking\nDone',
            in_list_view: 1,
          },
        ]
      : []),
    { fieldname: 'owner_name', fieldtype: 'Data', label: 'Owner', in_list_view: 1 },
  ],
  permissions: [{ role: 'All', read: 1 }],
});

const pad = (n: number) => String(n).padStart(2, '0');

const daysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 10:00:00`;
};

// bo's records are recent; ana's were created and last touched long ago.
const docs = [
  ['QAD-001', 'Open', 'bo', 2, 1],
  ['QAD-002', 'Working', 'bo', 10, 3],
  ['QAD-003', 'Working', 'bo', 40, 20],
  ['QAD-004', 'Done', 'ana', 200, 150],
  ['QAD-005', 'Done', 'ana', 300, 250],
].map(([name, status, owner, created, modified]) => ({
  name: String(name),
  doctype: 'QaDash',
  subject: `Doc ${name}`,
  status,
  owner_name: owner,
  creation: daysAgo(Number(created)),
  modified: daysAgo(Number(modified)),
}));

let run = 0;

const renderDashboard = (doctype: string, scope?: FrappeFilters): MemoryNavigator => {
  run += 1;
  const navigation = createMemoryNavigator('/backoffice');
  renderWithProviders(
    <BackofficeProvider
      frappe={{
        baseURL: `https://dashboard-view-${run}.spec.test`,
        fixtures: new InMemoryFixtureProvider({
          DocType: [dashboardMeta('QaDash'), dashboardMeta('QaDashPlain', false)],
          QaDash: docs,
          QaDashPlain: docs.map((doc) => ({ ...doc, doctype: 'QaDashPlain' })),
        }),
      }}
      navigation={navigation}>
      <DeskScopeProvider scope={scope}>
        <DashboardView doctype={doctype} />
      </DeskScopeProvider>
    </BackofficeProvider>,
  );
  return navigation;
};

const kpi = async (title: string, value: string) => {
  await waitFor(
    () => {
      let node: HTMLElement | null = screen.getAllByText(title)[0] ?? null;
      for (let depth = 0; node && depth < 6; depth += 1) {
        const text = node.textContent ?? '';
        if (text !== title && /\d/u.test(text.replace(title, ''))) {
          expect(text.replace(title, '').trim()).toBe(value);
          return;
        }
        node = node.parentElement;
      }
      throw new Error(`no value drawn next to ${title}`);
    },
    { timeout: 5000 },
  );
};

describe('<DashboardView />', () => {
  // oxlint-disable-next-line vitest/expect-expect -- the assertions live in the kpi helper
  it('counts the records in each rolling window', async () => {
    renderDashboard('QaDash');
    await kpi('Total QaDash', '5');
    await kpi('Created (last 30 days)', '2');
    await kpi('Modified (last 7 days)', '2');
  });

  it('draws a card per status option that opens the list filtered to it', async () => {
    const navigation = renderDashboard('QaDash');
    await kpi('Open', '1');
    await kpi('Working', '2');
    await kpi('Done', '2');
    fireEvent.click(screen.getAllByText('Working')[0]);
    expect(navigation.getLocation().path).toBe('/backoffice/qadash');
    expect(JSON.parse(String(navigation.getLocation().params.f))).toStrictEqual([['status', '=', 'Working']]);
  });

  it('leaves the status cards and chart out for a doctype with no Select field', async () => {
    renderDashboard('QaDashPlain');
    await kpi('Total QaDashPlain', '5');
    expect(screen.queryByText('Working')).toBeNull();
    expect(screen.queryByText('By Status')).toBeNull();
  });

  it('ANDs the desk scope into the counts and both charts', async () => {
    renderDashboard('QaDash', [['owner_name', '=', 'ana']]);
    await kpi('Total QaDash', '2');
    await kpi('Created (last 30 days)', '0');
    await kpi('Done', '2');
    await kpi('Working', '0');
    await expect(screen.findByText('No recent activity', {}, { timeout: 5000 })).resolves.toBeTruthy();
    await waitFor(
      () => {
        expect(screen.getAllByText('Done')).toHaveLength(2);
      },
      { timeout: 5000 },
    );
    expect(screen.getAllByText('Working')).toHaveLength(1);
  });
});

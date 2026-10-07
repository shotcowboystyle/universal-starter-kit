import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * DoctypeViewScreen specs (MPO-189) — the alternate-view dispatcher, over
 * the same fixture shape its stories use.
 *
 * What is pinned here is DISPATCH, not any individual view's chrome: the
 * shared header rides above every view, view="list" bounces to the list
 * route by REPLACE, and the search-param overrides are read here rather
 * than in the leaf views.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';
import type { MemoryNavigator } from '../navigation/navigator';
import type { BackofficeView } from '../navigation/paths';

import { DoctypeViewScreen } from './DoctypeViewScreen';

const MOCK_HOST = 'https://backoffice-doctype-view-spec.mock.test';
const TASK_DOCTYPE = 'QaViewTask';

const taskMeta = {
  name: TASK_DOCTYPE,
  doctype: 'DocType',
  module: 'QA',
  title_field: 'subject',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nWorking\nDone',
      in_list_view: 1,
    },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    DocType: [taskMeta],
    'Notification Log': [],
    [TASK_DOCTYPE]: [{ name: 'QVT-0001', doctype: TASK_DOCTYPE, subject: 'First', status: 'Open' }],
  });

function renderView(view: BackofficeView, path = '/backoffice') {
  const navigation: MemoryNavigator = createMemoryNavigator(path);
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
      navigation={navigation}>
      <DoctypeViewScreen
        doctype={TASK_DOCTYPE}
        view={view}
      />
    </BackofficeProvider>,
  );
  return navigation;
}

describe('<DoctypeViewScreen />', () => {
  it('renders the shared header above every dispatched view', async () => {
    for (const view of ['report', 'kanban', 'dashboard'] as const) {
      const { unmount } = renderWithProviders(
        <BackofficeProvider
          frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
          navigation={createMemoryNavigator('/backoffice')}>
          <DoctypeViewScreen
            doctype={TASK_DOCTYPE}
            view={view}
          />
        </BackofficeProvider>,
      );
      // The doctype name is the page title on every view — that is the
      // header, and it is what makes the switcher reachable from each one.
      await waitFor(() => {
        expect(screen.getAllByText(TASK_DOCTYPE).length).toBeGreaterThan(0);
      });
      unmount();
    }
  });

  it('view="list" REPLACES the location with the list route, keeping Back working', async () => {
    const navigation = renderView('list');
    await waitFor(() => {
      expect(navigation.getLocation().path).toBe('/backoffice/qaviewtask');
    });
    // replace, not push: the /view/list address never enters history.
    navigation.back();
    expect(navigation.getLocation().path).toBe('/backoffice/qaviewtask');
  });

  it('reads ?board= from the location so the leaf view stays param-free', async () => {
    const navigation = renderView('kanban', '/backoffice/qaviewtask/view/kanban?board=QA%20View%20Board');
    expect(navigation.getLocation().params.board).toBe('QA View Board');
    await waitFor(() => {
      expect(screen.getAllByText(TASK_DOCTYPE).length).toBeGreaterThan(0);
    });
  });

  it("renders a view the doctype's meta does not support rather than blanking", async () => {
    // Tree on a flat doctype: the body owns the unsupported state, and the
    // screen still paints its header instead of rendering nothing.
    renderView('tree');
    await waitFor(() => {
      expect(screen.getAllByText(TASK_DOCTYPE).length).toBeGreaterThan(0);
    });
  });
});

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { WorkspaceSidebar } from './WorkspaceSidebar';

const MOCK_HOST = 'https://backoffice-shell-nav.mock.test';

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    Workspace: [
      {
        name: 'Alpha',
        doctype: 'Workspace',
        title: 'Alpha',
        icon: 'tool',
        parent_page: '',
        public: 1,
        for_user: '',
        sequence_id: 1,
        module: 'Core',
        is_hidden: 0,
      },
      {
        name: 'Beta',
        doctype: 'Workspace',
        title: 'Beta',
        icon: 'users',
        parent_page: '',
        public: 1,
        for_user: '',
        sequence_id: 2,
        module: 'Core',
        is_hidden: 0,
      },
      {
        name: 'Gamma',
        doctype: 'Workspace',
        title: 'Gamma',
        icon: 'website',
        parent_page: '',
        public: 1,
        for_user: '',
        sequence_id: 3,
        module: 'Core',
        is_hidden: 0,
      },
    ],
  });

afterEach(cleanup);

describe('WorkspaceSidebar LC-72 stacked nav', () => {
  it('marks first / middle / last and paints selected as fill', async () => {
    renderWithProviders(
      <BackofficeProvider
        frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
        navigation={createMemoryNavigator('/backoffice/beta')}>
        <WorkspaceSidebar activePath="/backoffice/beta" />
      </BackofficeProvider>,
    );

    const rows = await waitFor(() => {
      const found = screen.getAllByTestId('backoffice-workspace-row');
      expect(found).toHaveLength(3);
      return found;
    });

    expect(rows[0].dataset.groupPosition).toBe('first');
    expect(rows[1].dataset.groupPosition).toBe('middle');
    expect(rows[2].dataset.groupPosition).toBe('last');

    expect(rows[1].dataset.active).toBe('true');
    expect(rows[1].getAttribute('aria-current')).toBe('page');
    expect(rows[0].dataset.active).toBe('false');
    expect(rows[2].getAttribute('aria-current')).toBeNull();
  });
});

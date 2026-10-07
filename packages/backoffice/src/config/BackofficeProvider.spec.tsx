import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createMemoryNavigator } from '../navigation/navigator';
import { BackofficeShell } from '../shell/BackofficeShell';

import { actionsForDoctype, BackofficeProvider } from './BackofficeProvider';
import type { BackofficeProviderProps } from './BackofficeProvider';

const MOCK_HOST = 'https://backoffice-package.mock.test';

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    Workspace: [
      {
        name: 'Tools',
        doctype: 'Workspace',
        title: 'Tools',
        icon: 'tool',
        parent_page: '',
        public: 1,
        for_user: '',
        sequence_id: 1,
        module: 'Automation',
        is_hidden: 0,
      },
    ],
    DocType: [{ name: 'ToDo', doctype: 'DocType' }],
    'Notification Log': [],
  });

function renderShell(props: Partial<BackofficeProviderProps> = {}) {
  const navigation = props.navigation ?? createMemoryNavigator('/backoffice');
  return {
    navigation,
    ...renderWithProviders(
      <BackofficeProvider
        frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
        navigation={navigation}
        {...props}>
        <BackofficeShell>
          <div>page body</div>
        </BackofficeShell>
      </BackofficeProvider>,
    ),
  };
}

describe('BackofficeProvider capability flags', () => {
  it('renders the full chrome by default', () => {
    const { container } = renderShell();

    expect(screen.getByTestId('backoffice-shell')).toBeTruthy();
    expect(screen.getByTestId('backoffice-awesomebar')).toBeTruthy();
    expect(screen.getByTestId('backoffice-notifications-button')).toBeTruthy();
    expect(screen.getByTestId('backoffice-help-trigger')).toBeTruthy();
    expect(container.querySelector('[aria-label="User menu"]')).toBeTruthy();
    expect(screen.getByTestId('backoffice-sidebar-rail')).toBeTruthy();
    expect(screen.getByText('page body')).toBeTruthy();
  });

  it('boolean flags gate each piece of chrome', () => {
    const { container } = renderShell({
      capabilities: {
        awesomebar: false,
        notifications: false,
        userMenu: false,
        help: false,
        sidebar: false,
      },
    });

    expect(screen.queryByTestId('backoffice-awesomebar')).toBeNull();
    expect(screen.queryByTestId('backoffice-notifications-button')).toBeNull();
    expect(screen.queryByTestId('backoffice-help-trigger')).toBeNull();
    expect(container.querySelector('[aria-label="User menu"]')).toBeNull();
    expect(screen.queryByTestId('backoffice-sidebar-rail')).toBeNull();
    // Content always renders — flags remove chrome, not the page.
    expect(screen.getByText('page body')).toBeTruthy();
  });

  it('object flags resolve enabled + per-feature config', () => {
    renderShell({
      capabilities: { notifications: { enabled: false }, awesomebar: { enabled: true } },
    });

    expect(screen.queryByTestId('backoffice-notifications-button')).toBeNull();
    expect(screen.getByTestId('backoffice-awesomebar')).toBeTruthy();
  });

  it('renders host slots (sidebar footer)', () => {
    renderShell({
      slots: { renderSidebarFooter: () => <div data-testid="host-sidebar-footer">custom</div> },
    });

    expect(screen.getByTestId('host-sidebar-footer')).toBeTruthy();
  });
});

describe('BackofficeProvider navigation', () => {
  it('shell home button navigates through the adapter and emits an event', () => {
    const onEvent = vi.fn();
    const { navigation } = renderShell({ onEvent });

    fireEvent.click(screen.getByTestId('backoffice-home'));

    expect(navigation.getLocation().path).toBe('/backoffice');
    expect(onEvent).toHaveBeenCalledWith({
      type: 'navigate',
      path: '/backoffice',
      mode: 'push',
    });
  });

  it('basePath rebinds every path the chrome navigates to', () => {
    const onEvent = vi.fn();
    const navigation = createMemoryNavigator('/admin');
    renderShell({ navigation, basePath: '/admin', onEvent });

    fireEvent.click(screen.getByTestId('backoffice-home'));

    expect(onEvent).toHaveBeenCalledWith({ type: 'navigate', path: '/admin', mode: 'push' });
    expect(navigation.getLocation().path).toBe('/admin');
  });
});

describe('action registry', () => {
  it('actionsForDoctype keeps unscoped actions and filters doctype-scoped ones', () => {
    const all = { id: 'audit', label: 'Audit', onPress: () => {} };
    const userOnly = {
      id: 'reset-password',
      label: 'Reset Password',
      doctypes: ['User'],
      onPress: () => {},
    };

    expect(actionsForDoctype([all, userOnly], 'User')).toEqual([all, userOnly]);
    expect(actionsForDoctype([all, userOnly], 'ToDo')).toEqual([all]);
    expect(actionsForDoctype(undefined, 'ToDo')).toEqual([]);
  });
});

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { BackofficeShell } from './BackofficeShell';

const MOCK_HOST = 'https://backoffice-shell-chrome.mock.test';

afterEach(cleanup);

function renderShell() {
  return renderWithProviders(
    <BackofficeProvider
      frappe={{
        baseURL: MOCK_HOST,
        fixtures: new InMemoryFixtureProvider({ Workspace: [], DocType: [] }),
      }}
      navigation={createMemoryNavigator('/backoffice')}
      slots={{
        renderSidebarFooter: () => <div data-testid="host-sidebar-footer">footer</div>,
      }}>
      <BackofficeShell>
        <div>page body</div>
      </BackofficeShell>
    </BackofficeProvider>,
  );
}

describe('BackofficeShell pane hairlines', () => {
  it('paints full-width banner and full-height column rules plus a footer rule', () => {
    renderShell();

    expect(screen.getByTestId('backoffice-shell-banner-rule')).toBeTruthy();
    expect(screen.getByTestId('backoffice-shell-column-rule')).toBeTruthy();
    expect(screen.getByTestId('backoffice-shell-footer-rule')).toBeTruthy();
    expect(screen.getByTestId('host-sidebar-footer')).toBeTruthy();
    expect(screen.getByRole('main').id).toBe('backoffice-main');
  });
});

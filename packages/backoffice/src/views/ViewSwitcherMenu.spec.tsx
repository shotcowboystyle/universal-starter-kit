import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewSwitcherMenu } from './ViewSwitcherMenu';

describe(ViewSwitcherMenu, () => {
  it('renders nothing when there is nothing to switch to', () => {
    const { queryByTestId } = renderWithProviders(
      <ViewSwitcherMenu
        views={['list']}
        current="list"
        onViewChange={vi.fn()}
      />,
    );
    expect(queryByTestId('list-view-switcher')).toBeNull();
  });

  it('renders a single dropdown trigger, not a segment per view', () => {
    const { getByTestId, queryByText } = renderWithProviders(
      <ViewSwitcherMenu
        views={['list', 'report', 'kanban', 'dashboard']}
        current="list"
        onViewChange={vi.fn()}
      />,
    );
    expect(getByTestId('list-view-switcher')).toBeTruthy();
    // Segments would paint every label in the toolbar. The menu keeps them
    // inside the dropdown — only the current view is visible at rest.
    expect(queryByText('Report')).toBeNull();
    expect(queryByText('Kanban')).toBeNull();
    expect(queryByText('Dashboard')).toBeNull();
  });

  it('opens a menu of the other views instead of painting them as buttons', async () => {
    const { getByTestId, getByRole } = renderWithProviders(
      <ViewSwitcherMenu
        views={['list', 'report', 'kanban', 'dashboard']}
        current="list"
        onViewChange={vi.fn()}
      />,
    );
    fireEvent.click(getByTestId('list-view-switcher'));
    const menu = await waitFor(() => getByRole('menu'));
    expect(menu).toBeTruthy();
    expect(document.querySelectorAll('[role="menuitemcheckbox"]')).toHaveLength(4);
    expect(document.querySelectorAll('[data-testid="list-view-switcher"]')).toHaveLength(1);
  });
});

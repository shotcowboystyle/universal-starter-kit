import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { HelpMenu } from './HelpMenu';

describe(HelpMenu, () => {
  it('renders the help trigger', () => {
    renderWithProviders(<HelpMenu />);
    expect(screen.getByTestId('backoffice-help-trigger')).toBeTruthy();
    expect(screen.getByLabelText('Help')).toBeTruthy();
  });

  it('opens the desk help items from the trigger', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HelpMenu />);
    await user.click(screen.getByTestId('backoffice-help-trigger'));
    await expect(screen.findByTestId('backoffice-help-documentation')).resolves.toBeTruthy();
    expect(screen.getByTestId('backoffice-help-forum')).toBeTruthy();
    expect(screen.getByTestId('backoffice-help-report-issue')).toBeTruthy();
  });
});

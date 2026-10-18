import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { HelpAboutDialog } from './help-about-dialog';

describe(HelpAboutDialog, () => {
  it('renders the About surface without a bench', () => {
    renderWithProviders(
      <HelpAboutDialog
        open
        onOpenChange={vi.fn<(open: boolean) => void>()}
      />,
    );
    expect(screen.getByTestId('backoffice-help-about-dialog')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText('Version information is unavailable.')).toBeTruthy();
  });
});

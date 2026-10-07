import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { HelpShortcutsDialog } from './help-shortcuts-dialog';

describe(HelpShortcutsDialog, () => {
  it('lists the shortcuts the backoffice actually implements', () => {
    renderWithProviders(
      <HelpShortcutsDialog
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('backoffice-help-shortcuts-dialog')).toBeTruthy();
    expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
    expect(screen.getByText('Open the command palette')).toBeTruthy();
    expect(screen.getByText('Save the open document')).toBeTruthy();
    expect(screen.getByText('Close dialogs and menus')).toBeTruthy();
  });
});

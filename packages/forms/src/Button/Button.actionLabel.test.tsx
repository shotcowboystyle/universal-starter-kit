/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './index';

describe('Button verb/noun + actionRole', () => {
  it('renders formatActionLabel from verb/noun when children omitted', () => {
    renderWithProviders(<Button verb="Archive" noun="invoice" />);
    expect(screen.getByText('Archive invoice')).toBeInTheDocument();
  });

  it('lets children override verb/noun', () => {
    renderWithProviders(
      <Button verb="Delete" noun="row">
        Custom
      </Button>,
    );
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('marks accent buttons as primary for ActionBar scans', () => {
    const { container } = renderWithProviders(<Button accent>Save</Button>);
    expect(container.querySelector('[data-mp-action-role="primary"]')).toBeTruthy();
  });
});

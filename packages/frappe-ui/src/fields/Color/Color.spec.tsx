import { renderWithProviders } from '@repo/test-utils';
// Design-law: Color is a thin ColorPicker adapter. Do not fork picker chrome.
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Color } from './index';

afterEach(cleanup);

describe('Color design-law — compose forms ColorPicker', () => {
  it('renders the house color field (hex input, no forked chrome)', () => {
    const result = renderWithProviders(
      <Color
        label="Brand"
        value="#10B981"
        onChange={vi.fn()}
      />,
    );
    const input = result.container.querySelector('input') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(screen.getByText('Brand')).toBeTruthy();
  });

  it('forwards skeleton and hides the input', () => {
    const result = renderWithProviders(
      <Color
        label="Brand"
        skeleton
      />,
    );
    expect(result.container.querySelector('input')).toBeNull();
  });
});

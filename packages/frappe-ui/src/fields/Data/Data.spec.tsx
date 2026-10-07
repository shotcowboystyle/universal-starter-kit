import { renderWithProviders } from '@repo/test-utils';
// Design-law: Data is a thin Input adapter. Do not fork Input chrome.
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Data } from './index';

afterEach(cleanup);

describe('Data design-law — compose forms Input', () => {
  it('renders the house Input box (data-ring-target=box)', () => {
    const result = renderWithProviders(<Data label="Name" />);
    expect(result.container.querySelector('input')).toBeTruthy();
    expect(result.container.querySelector("[data-ring-target='box']")).toBeTruthy();
  });

  it('forwards skeleton and hides the input', () => {
    const result = renderWithProviders(
      <Data
        label="Name"
        skeleton
      />,
    );
    expect(result.container.querySelector('input')).toBeNull();
  });

  it('forwards readOnly onto the input', () => {
    const result = renderWithProviders(
      <Data
        label="Name"
        readOnly
        value="locked"
      />,
    );
    const input = result.container.querySelector('input') as HTMLInputElement | null;
    expect(input?.readOnly ?? input?.getAttribute('aria-readonly')).toBeTruthy();
  });
});

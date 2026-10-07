import { renderWithProviders } from '@repo/test-utils';
// Design-law: Check is a thin Checkbox adapter. Never circular at any radius.
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Check } from './index';

afterEach(cleanup);

describe('Check design-law — compose forms Checkbox', () => {
  it('renders the house checkbox glyph box', () => {
    const result = renderWithProviders(<Check label="Accept" />);
    expect(result.container.querySelector("[data-checkbox-box='true']")).toBeTruthy();
  });

  it('stays non-circular at radius=full (checkbox override)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Check
          label="Accept"
          value
        />
      </Preset>,
    );
    const box = result.container.querySelector("[data-checkbox-box='true']") as HTMLElement | null;
    expect(box).toBeTruthy();
    const radius = box?.style.borderRadius ?? getComputedStyle(box as Element).borderRadius;
    expect(radius).not.toMatch(/50%|9999|999px/);
  });
});

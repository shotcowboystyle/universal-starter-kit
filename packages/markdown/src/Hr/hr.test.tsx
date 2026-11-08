import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import { HR as Hr } from './index';

describe('HR', () => {
  it('renders a painted separator rule', () => {
    const { container } = renderWithProviders(<Hr />);
    const rule = container.querySelector('[role="separator"]');
    expect(rule).toBeTruthy();
  });

  it('hides the rule when borderWidth is none', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderWidth: 'none' }}>
        <Hr />
      </Preset>,
    );
    expect(container.querySelector('[role="separator"]')).toBeNull();
  });
});

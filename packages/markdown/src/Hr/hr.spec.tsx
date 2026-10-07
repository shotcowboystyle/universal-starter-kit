import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { expect, it, test } from 'vitest';

import { HR } from './index';

test('renders a painted separator rule', () => {
  const { container } = renderWithProviders(<HR />);
  const rule = container.querySelector('[role="separator"]');
  expect(rule).toBeTruthy();
});

test('hides the rule when borderWidth is none', () => {
  const { container } = renderWithProviders(
    <Preset overrides={{ borderWidth: 'none' }}>
      <HR />
    </Preset>,
  );
  expect(container.querySelector('[role="separator"]')).toBeNull();
});

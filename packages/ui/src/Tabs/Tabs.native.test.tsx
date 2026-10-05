import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { Tabs } from './index';

// Exercise the native accessibility branch while retaining the test host renderer.
// Geometry still requires a native runtime; this test asserts role/name/state only.
vi.mock('tamagui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tamagui')>()),
  isWeb: false,
}));

describe('native Tabs accessibility contract', () => {
  it('names each button and exposes selected and disabled states', () => {
    const result = renderWithProviders(
      <Tabs
        variant="band"
        value="one"
        items={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two', disabled: true },
          { value: 'three', label: 'Three', accessibilityLabel: 'Third destination' },
        ]}
      />,
    );
    const selected = result.getByRole('button', { name: 'One' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    const disabled = result.getByRole('button', { name: 'Two' });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    const third = result.getByRole('button', { name: 'Three' });
    expect(third).toHaveAttribute('accessibilitylabel', 'Third destination');
    expect(third).toHaveAttribute('aria-selected', 'false');
    expect(selected).toHaveAttribute('accessibilityrole', 'button');
    expect(selected).toHaveAttribute('accessibilitylabel', 'One');
  });
});

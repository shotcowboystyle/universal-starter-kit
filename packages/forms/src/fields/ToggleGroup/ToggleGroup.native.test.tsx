import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ToggleGroup } from './index';

// Before this the whole segmented control was absent from the iOS
// tree. See RadioGroup.native.test.tsx for why the state object is pinned in
// shared/nativeA11y.test.ts rather than here.
vi.mock('tamagui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tamagui')>()),
  isWeb: false,
}));

const severity = [
  { label: 'error', value: 'error' },
  { label: 'warning', value: 'warning' },
  { label: 'info', value: 'info', disabled: true },
];

const names = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[accessibilityrole]')).map((el) => [
    el.getAttribute('accessibilityrole'),
    el.getAttribute('accessibilitylabel'),
  ]);

describe('native ToggleGroup accessibility contract', () => {
  it('puts every segment in the tree as a named control', () => {
    const { container } = renderWithProviders(<ToggleGroup label="Severity" options={severity} value="warning" />);
    expect(names(container)).toEqual([
      ['button', 'error'],
      ['button', 'warning'],
      ['button', 'info'],
    ]);
  });

  // The platform role is `button` for both kinds, measured: a radio/checkbox
  // accessibilityRole takes the element out of the iOS tree entirely.
  it('keeps every segment in the tree when the group takes several values', () => {
    const { container } = renderWithProviders(<ToggleGroup type="multiple" options={severity} value={['error']} />);
    expect(names(container)).toEqual([
      ['button', 'error'],
      ['button', 'warning'],
      ['button', 'info'],
    ]);
  });

  it('prefixes a group accessibilityLabel onto each segment, because iOS never reads a container', () => {
    const { container } = renderWithProviders(
      <ToggleGroup accessibilityLabel="Severity" options={severity} value="warning" />,
    );
    expect(names(container)).toContainEqual(['button', 'Severity, warning']);
  });

  it('takes aria-label as an alias, since tamagui never maps it onto native', () => {
    const { container } = renderWithProviders(<ToggleGroup aria-label="Severity" options={severity} value="warning" />);
    expect(names(container)).toContainEqual(['button', 'Severity, warning']);
  });

  it('lets a segment override its own name', () => {
    const { container } = renderWithProviders(
      <ToggleGroup options={[{ label: '●', value: 'on', accessibilityLabel: 'Filled' }]} value="on" />,
    );
    expect(names(container)).toEqual([['button', 'Filled']]);
  });
});

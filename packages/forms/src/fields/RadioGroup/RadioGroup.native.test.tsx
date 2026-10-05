import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { RadioGroup } from './index';

// Mock tamagui's isWeb so the native branch runs on the test host
// renderer, then read the React Native prop names back off the DOM. The state
// object itself is pinned in shared/nativeA11y.test.ts — the host stringifies
// it — so what this file proves is that the component reaches the helper with
// the right role and the right name.
vi.mock('tamagui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tamagui')>()),
  isWeb: false,
}));

const phase = [
  { label: 'CREDITS', value: 'CREDITS' },
  { label: 'DEBITS', value: 'DEBITS' },
  { label: 'DISCRETIONARY', value: 'DISCRETIONARY', disabled: true },
];

const names = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[accessibilityrole]')).map((el) => [
    el.getAttribute('accessibilityrole'),
    el.getAttribute('accessibilitylabel'),
  ]);

describe('native RadioGroup accessibility contract', () => {
  it('makes every option a named control instead of bare StaticText', () => {
    const { container } = renderWithProviders(<RadioGroup label="Phase" options={phase} value="DEBITS" />);
    expect(names(container)).toEqual([
      ['button', 'CREDITS'],
      ['button', 'DEBITS'],
      ['button', 'DISCRETIONARY'],
    ]);
  });

  it('prefixes a group accessibilityLabel onto each option, because iOS never reads a container', () => {
    const { container } = renderWithProviders(<RadioGroup accessibilityLabel="Phase" options={phase} value="DEBITS" />);
    expect(names(container)).toContainEqual(['button', 'Phase, DEBITS']);
  });

  it('takes aria-label as an alias, since tamagui never maps it onto native', () => {
    const { container } = renderWithProviders(<RadioGroup aria-label="Phase" options={phase} value="DEBITS" />);
    expect(names(container)).toContainEqual(['button', 'Phase, DEBITS']);
  });

  it('lets an option override its own name', () => {
    const { container } = renderWithProviders(
      <RadioGroup options={[{ label: '▲', value: 'up', accessibilityLabel: 'Increasing' }]} value="up" />,
    );
    expect(names(container)).toEqual([['button', 'Increasing']]);
  });

  // The sibling Label is also told to stay out of the native tree so an option
  // is not read twice. It cannot be asserted here — the web renderer drops the
  // React Native accessibility props off Label entirely — so that one is
  // measured on device instead.
});

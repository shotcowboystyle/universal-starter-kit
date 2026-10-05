import { renderWithProviders } from '@repo/test-utils';
/**
 * A native sheet is an RN Modal, so the Screen's ScrollView is a
 * React ancestor of every row in it. At RN's default keyboardShouldPersistTaps
 * ("never") that ScrollView claims the first tap in the sheet while the
 * keyboard is up and spends it on dismissing the keyboard. The house
 * ScrollView carries "handled" on native (ScrollView.native.spec.tsx), so
 * Screen must scroll through it.
 */
import { cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { Screen } from './Page';

const houseScrollViews = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('../ScrollView', async (importOriginal) => {
  const { forwardRef, createElement } = await import('react');
  const { ScrollView } = await importOriginal<typeof import('../ScrollView')>();
  return {
    ScrollView: forwardRef<unknown, Record<string, unknown>>(function HouseScrollProbe(props, ref) {
      houseScrollViews.push(props);
      return createElement(ScrollView as never, { ...props, ref });
    }),
  };
});

afterEach(() => {
  cleanup();
  houseScrollViews.length = 0;
});

it('scrolls through the house ScrollView, which defaults keyboard taps to handled on native', () => {
  renderWithProviders(
    <Screen>
      <span>Page body</span>
    </Screen>,
  );
  expect(houseScrollViews.length).toBeGreaterThan(0);
});

it('still hands scrollViewProps to that ScrollView, so a screen can opt back out', () => {
  renderWithProviders(
    <Screen scrollViewProps={{ keyboardShouldPersistTaps: 'never' }}>
      <span>Page body</span>
    </Screen>,
  );
  expect(houseScrollViews.at(-1)?.keyboardShouldPersistTaps).toBe('never');
});

it('renders no ScrollView when scroll is off', () => {
  renderWithProviders(
    <Screen scroll={false}>
      <span>Page body</span>
    </Screen>,
  );
  expect(houseScrollViews).toEqual([]);
});

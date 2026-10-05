import { renderWithProviders } from '@repo/test-utils';
import { createRef } from 'react';
import { Text, type TamaguiElement } from 'tamagui';
import { expect, it, vi } from 'vitest';

import { AnimateHeight } from './index';

vi.mock('@repo/platform', async (original) => ({
  ...(await original<typeof import('@repo/platform')>()),
  isWeb: false,
}));

it('opens native content intrinsically without waiting for layout or animation frames', () => {
  const view = renderWithProviders(
    <AnimateHeight open={false} testID="height">
      <Text>Body</Text>
    </AnimateHeight>,
  );
  expect(view.queryByText('Body')).toBeNull();
  view.rerender(
    <AnimateHeight open testID="height">
      <Text>Body</Text>
    </AnimateHeight>,
  );
  expect(view.getByText('Body')).toBeTruthy();
  expect(getComputedStyle(view.getByTestId('height')).height).not.toBe('0px');
  view.rerender(
    <AnimateHeight open={false} testID="height">
      <Text>Body</Text>
    </AnimateHeight>,
  );
  expect(view.queryByText('Body')).toBeNull();
});

it('keeps native follower updates intrinsic and preserves the outer ref and props', () => {
  const ref = createRef<TamaguiElement>();
  const view = renderWithProviders(
    <AnimateHeight ref={ref} testID="height" padding={7}>
      <Text>First</Text>
    </AnimateHeight>,
  );
  expect(ref.current).toBe(view.getByTestId('height'));
  expect(getComputedStyle(view.getByTestId('height')).padding).toBe('7px');
  view.rerender(
    <AnimateHeight ref={ref} testID="height" padding={7}>
      <Text>Longer updated body</Text>
    </AnimateHeight>,
  );
  expect(view.getByText('Longer updated body')).toBeTruthy();
  expect(getComputedStyle(view.getByTestId('height')).height).not.toBe('0px');
  expect(ref.current).toBe(view.getByTestId('height'));
});

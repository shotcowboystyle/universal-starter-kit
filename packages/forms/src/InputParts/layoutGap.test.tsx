import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, expect, it } from 'vitest';

import { Input } from './index';

afterEach(cleanup);

function measure(size: 'small' | 'medium', space: 'small' | 'large', gap?: number) {
  const ref = createRef<HTMLElement>();
  const { getByTestId } = renderWithProviders(
    <Preset overrides={{ size, space }}>
      <Input testID="root" ref={ref as never} {...(gap === undefined ? {} : { gap })}>
        <Input.Label>Location</Input.Label>
        <Input.Box>
          <Input.Area placeholder="Location" />
        </Input.Box>
      </Input>
    </Preset>,
  );
  const root = getByTestId('root');
  expect(ref.current).toBe(root);
  // Happy DOM leaves token-backed CSS gaps unresolved; browser coverage reads
  // the actual pixels. Keep this test checking the rendered gap owner.
  const value = getComputedStyle(root).gap || [...root.classList].find((name) => name.startsWith('_gap-'));
  expect(value).toBeTruthy();
  cleanup();
  return value;
}

it('lets space change the multi-slot layout gap at a fixed control size', () => {
  expect(measure('medium', 'small')).not.toBe(measure('medium', 'large'));
});

it('keeps the layout gap stable when only control size changes', () => {
  expect(measure('small', 'small')).toBe(measure('medium', 'small'));
});

it('preserves the consumer gap eject and forwarded root ref', () => {
  expect(measure('medium', 'large', 11)).toBe('11px');
});

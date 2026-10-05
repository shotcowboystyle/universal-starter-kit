import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Combobox } from './Combobox';
import { Select } from './Select';

const recipe = vi.hoisted(() => ({ height: 37 }));
vi.mock('@repo/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/theme')>();
  return {
    ...actual,
    useResolvedKnobs: (...args: Parameters<typeof actual.useResolvedKnobs>) => {
      const result = actual.useResolvedKnobs(...args);
      return {
        ...result,
        knobProps: {
          ...result.knobProps,
          control: { ...result.knobProps.control, height: recipe.height },
        },
      };
    },
  };
});
vi.mock('../FloatingPanel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../FloatingPanel')>()),
  useViewportGtSm: () => false,
  FloatingPanel: ({ trigger, children }: { trigger?: ReactNode; children?: ReactNode }) => (
    <>
      {trigger}
      {children}
    </>
  ),
}));

describe('picker sheet rows consume resolved control height', () => {
  for (const [name, Picker] of [
    ['Select', Select],
    ['Combobox', Combobox],
  ] as const) {
    for (const height of [37, 48]) {
      it(`${name} retains labels and selection at resolved height ${height}`, () => {
        recipe.height = height;
        const onValueChange = vi.fn();
        const result = renderWithProviders(
          <Picker
            value="one"
            onValueChange={onValueChange}
            options={[
              { value: 'one', label: 'First choice' },
              { value: 'two', label: 'Second choice' },
            ]}
          />,
        );
        const row =
          name === 'Select'
            ? result.getByText('Second choice').parentElement!
            : result.getByRole('option', { name: 'Second choice' });
        expect(row.className).toContain(`_h-${height}px`);
        fireEvent.click(row);
        expect(onValueChange).toHaveBeenCalledWith('two');
        expect(onValueChange).toHaveBeenCalledTimes(1);
      });
    }
  }
});

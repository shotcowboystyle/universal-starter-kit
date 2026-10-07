import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Combobox } from './Combobox';
import { Select } from './Select';

const recipe = vi.hoisted(() => ({ height: 37 }));
vi.mock(import('@repo/theme'), async (importOriginal) => {
  const actual = await importOriginal();
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
vi.mock(import('../FloatingPanel'), async (importOriginal) => ({
  ...(await importOriginal()),
  useViewportGtSm: () => false,
  FloatingPanel: ({ trigger, children }: { trigger?: ReactNode; children?: ReactNode }) => (
    <>
      {trigger}
      {children}
    </>
  ),
}));

const PICKERS = [
  ['Select', Select],
  ['Combobox', Combobox],
] as const;

const CASES = PICKERS.flatMap(([name, Picker]) => [37, 48].map((height) => ({ name, Picker, height })));

describe('picker sheet rows consume resolved control height', () => {
  it.each(CASES)('$name retains labels and selection at resolved height $height', ({ name, Picker, height }) => {
    recipe.height = height;
    const onChange = vi.fn<(value: string | string[]) => void>();
    const result = renderWithProviders(
      <Picker
        value="one"
        onChange={onChange}
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
    expect(onChange).toHaveBeenCalledExactlyOnceWith('two');
  });
});

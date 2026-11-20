import { renderWithProviders } from '@repo/test-utils';
import { sizeRecipeForToken } from '@repo/theme';
import { describe, expect, it, vi } from 'vitest';

import { Combobox } from './Combobox';
import { Select } from './Select';

const mode = vi.hoisted(() => ({ height: 37, fontSize: 14, table: false }));
vi.mock(import('../shared/table-cell-context'), async (importOriginal) => ({
  ...(await importOriginal()),
  useIsInTableCell: () => mode.table,
}));

vi.mock(import('@repo/theme'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useResolvedKnobs: (...args: Parameters<typeof actual.useResolvedKnobs>) => {
      const resolved = actual.useResolvedKnobs(...args);
      return {
        ...resolved,
        knobProps: {
          ...resolved.knobProps,
          control: { ...resolved.knobProps.control, height: mode.height },
          controlType: { ...resolved.knobProps.controlType, fontSize: mode.fontSize },
        },
      };
    },
  };
});

const PICKERS = [
  ['Select', Select],
  ['Combobox', Combobox],
] as const;

const CASES = PICKERS.flatMap(([name, Picker]) => [false, true].map((table) => ({ name, Picker, table })));

describe('picker desktop recipe sizing', () => {
  it.each(CASES)(
    '$name table=$table honors the resolved height and label font without a desktop floor',
    ({ Picker, table }) => {
      mode.table = table;
      mode.height = 37;
      mode.fontSize = 14;
      const result = renderWithProviders(
        <Picker
          options={[
            { value: 'one', label: 'First choice' },
            { value: 'two', label: 'Second choice' },
          ]}
          value="one"
        />,
      );
      const trigger = result.container.querySelector<HTMLElement>('[data-testid$="-trigger"]')!;
      expect(trigger).toBeTruthy();
      expect(trigger.className).not.toContain('_mih-44px');
      expect(trigger.className).toContain('_h-37px');
      expect(trigger.dataset.visualHeight).toBe('37');
      expect(trigger.dataset.mpPressSlop).toBe('4');
      expect(trigger.dataset.mpPressAxis).toBe('vertical');
      expect(trigger.className).toContain('_miw-44px');
      expect(trigger.className).toContain('_oy-visible');
      const targetCss = document.querySelector('#mp-button-press-slop')?.textContent;
      expect(targetCss).toContain('isolation:isolate');
      expect(targetCss).toContain('z-index:-1');
      const label = result.getByText('First choice');
      expect(label.className).toContain('_fos-14px');
    },
  );

  it.each(CASES)('$name table=$table retains the shared touch recipe floor', ({ Picker, table }) => {
    const recipe = sizeRecipeForToken('$3', { touch: true });
    mode.height = recipe.height;
    mode.fontSize = recipe.fontSize;
    mode.table = table;
    expect(recipe.height).toBeGreaterThanOrEqual(44);
    const result = renderWithProviders(
      <Picker
        options={[
          { value: 'one', label: 'First choice' },
          { value: 'two', label: 'Second choice' },
        ]}
        value="one"
      />,
    );
    const trigger = result.container.querySelector<HTMLElement>('[data-testid$="-trigger"]')!;
    expect(trigger.className).toContain(`_h-${recipe.height}px`);
    expect(trigger.dataset.pressFloor).toBe('box');
  });
});

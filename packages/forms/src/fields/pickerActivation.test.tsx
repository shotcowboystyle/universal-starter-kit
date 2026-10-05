import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Combobox } from './Combobox';
import { Select } from './Select';

vi.mock('@repo/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/theme')>();
  return {
    ...actual,
    useResolvedKnobs: (...args: Parameters<typeof actual.useResolvedKnobs>) => {
      const resolved = actual.useResolvedKnobs(...args);
      return {
        ...resolved,
        knobProps: {
          ...resolved.knobProps,
          control: { ...resolved.knobProps.control, height: 37 },
        },
      };
    },
  };
});

const options = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
];
const originalWidth = window.innerWidth;
beforeEach(() => Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 }));
afterEach(() => Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth }));

function ClearHarness() {
  const [value, setValue] = useState('alpha');
  return (
    <>
      <Combobox
        aria-label="Choice"
        options={options}
        value={value}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            setValue(next);
          }
        }}
        clearable
      />
      <span>Selected:{value || 'none'}</span>
    </>
  );
}

describe('sheet picker pointer activation', () => {
  for (const [name, Picker] of [
    ['Select', Select],
    ['Combobox', Combobox],
  ] as const) {
    it(`${name} opens once when the real trigger is clicked`, async () => {
      const result = renderWithProviders(<Picker aria-label="Choice" options={options} />);
      const trigger = result.getByRole('combobox', { name: 'Choice' });
      fireEvent.click(trigger, { detail: 1 });
      await waitFor(() => {
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
      });
    });
    it(`${name} keeps keyboard opening and ignores disabled clicks`, () => {
      const result = renderWithProviders(<Picker aria-label="Choice" options={options} />);
      fireEvent.keyDown(result.getByRole('combobox'), { key: ' ' });
      expect(result.getByRole('combobox').getAttribute('aria-expanded')).toBe('true');
      result.unmount();
      const disabled = renderWithProviders(<Picker aria-label="Choice" options={options} disabled />);
      fireEvent.click(disabled.getByRole('combobox'), { detail: 1 });
      expect(disabled.getByRole('combobox').getAttribute('aria-expanded')).toBe('false');
    });
  }
  it('clear changes the value without opening the sheet', async () => {
    const result = renderWithProviders(<ClearHarness />);
    const clear = result.getByRole('button', { name: 'Clear' });
    expect(clear.className).toContain('_miw-44px');
    expect(clear.className).toContain('_mih-44px');
    fireEvent.click(clear, { detail: 1 });
    await waitFor(() => {
      expect(result.getByText('Selected:none')).toBeTruthy();
    });
    expect(result.getByRole('combobox', { name: 'Choice' }).getAttribute('aria-expanded')).toBe('false');
  });
});

it('desktop clear retains compact geometry and never opens on pointer down or click', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
  const result = renderWithProviders(<ClearHarness />);
  const trigger = result.getByRole('combobox', { name: 'Choice' });
  const clear = result.getByRole('button', { name: 'Clear' });
  expect(trigger.className).toContain('_h-37px');
  expect(clear.className).toContain('_h-37px');
  expect(clear.className).toContain('_miw-44px');
  expect(clear.getAttribute('data-mp-press-slop')).toBe('4');
  expect(clear.getAttribute('data-mp-press-axis')).toBe('vertical');
  fireEvent.mouseDown(clear, { detail: 1 });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.mouseUp(clear, { detail: 1 });
  fireEvent.click(clear, { detail: 1 });
  await waitFor(() => {
    expect(result.getByText('Selected:none')).toBeTruthy();
  });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

import { TestProviders } from '@repo/test-utils';
// @vitest-environment jsdom
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Combobox } from '../fields/Combobox';
import { Input } from '../fields/Input';
import { SearchInput } from '../fields/SearchInput';
import { Select } from '../fields/Select';
import { TextArea } from '../fields/TextArea';
import { Input as InputParts } from '../InputParts';
const modality = vi.hoisted(() => ({ touch: true }));
vi.mock('@repo/platform', async (original) => ({
  ...(await original<object>()),
  get isWebTouchable() {
    return modality.touch && typeof window !== 'undefined';
  },
}));
const options = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((label) => ({ label, value: label }));
function Fixture() {
  return (
    <TestProviders>
      <Input aria-label="Input" />
      <TextArea aria-label="Area" />
      <InputParts>
        <InputParts.Box>
          <InputParts.Area aria-label="Compound" />
          <InputParts.Icon>
            <span>Icon</span>
          </InputParts.Icon>
          <InputParts.Button aria-label="End">End</InputParts.Button>
        </InputParts.Box>
      </InputParts>
      <SearchInput aria-label="Search" />
      <Select aria-label="Select" options={options} defaultValue="Alpha" />
      <Combobox aria-label="Combobox" options={options} defaultValue="Alpha" />
    </TestProviders>
  );
}
describe('touch recipe hydration', () => {
  it.each([true, false, true])('hydrates actual controls on repeated coarse mount %s', async (touch) => {
    modality.touch = touch;
    const browserWindow = window;
    let html: string;
    vi.stubGlobal('window', undefined);
    try {
      html = renderToString(<Fixture />);
    } finally {
      vi.stubGlobal('window', browserWindow);
    }
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Fixture />, {
          onRecoverableError: (error) => errors.push(error),
        });
      });
      expect(errors.filter((error) => /hydration|hydrated|didn't match/i.test(String(error)))).toEqual([]);
      const heights = [...container.querySelectorAll('[data-visual-height]')].map((el) =>
        Number(el.getAttribute('data-visual-height')),
      );
      expect(container.querySelector('[touch]')).toBeNull();
      expect(heights.length).toBeGreaterThanOrEqual(2);
      expect(heights.every((height) => height >= 44)).toBe(true);
    } finally {
      await act(async () => root?.unmount());
      spy.mockRestore();
      container.remove();
    }
  });
});

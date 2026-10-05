import { TestProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
// @vitest-environment jsdom
import { act, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Combobox } from '../fields/Combobox';
import { Select } from '../fields/Select';

import { FloatingPanel, useViewportGtSm } from './index';

const options = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((label) => ({ label, value: label }));
function Fixture({ kind }: { kind: string }) {
  const [open, setOpen] = useState(false);
  const wide = useViewportGtSm();
  const [value, setValue] = useState('Alpha');
  return (
    <TestProviders>
      <span data-wide={String(wide)} />
      <output>{value}</output>
      {kind === 'Select' ? (
        <Select
          aria-label="Choice"
          options={options}
          value={value}
          onValueChange={(next) => {
            setValue(String(next));
          }}
        />
      ) : kind === 'Combobox' ? (
        <Combobox
          aria-label="Choice"
          options={options}
          value={value}
          onValueChange={(next) => {
            setValue(String(next));
          }}
        />
      ) : (
        <FloatingPanel open={open} onOpenChange={setOpen} trigger={<button type="button">Open</button>}>
          <span>Panel contents</span>
        </FloatingPanel>
      )}
    </TestProviders>
  );
}

describe('viewport hydration', () => {
  it.each(
    ['Select', 'Combobox', 'FloatingPanel'].flatMap((kind) => [390, 640, 641, 1200].map((width) => ({ kind, width }))),
  )('hydrates $kind at $width pixels before adapting', async ({ kind, width }) => {
    const browserWindow = window;
    const scrollTo = vi.spyOn(browserWindow, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(browserWindow, 'innerWidth', {
      configurable: true,
      value: width,
      writable: true,
    });
    let html: string;
    vi.stubGlobal('window', undefined);
    try {
      html = renderToString(<Fixture kind={kind} />);
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
        root = hydrateRoot(container, <Fixture kind={kind} />, {
          onRecoverableError: (error) => errors.push(error),
        });
      });
      expect(errors.filter((error) => /hydration|hydrated|didn't match/i.test(String(error)))).toEqual([]);
      expect(container.querySelector('[data-wide]')?.getAttribute('data-wide')).toBe(String(width > 640));
      if (width === 1200 && kind !== 'FloatingPanel') {
        const trigger = container.querySelector('[role="combobox"]')!;
        await act(async () => {
          fireEvent.mouseDown(trigger, { detail: 1 });
          fireEvent.mouseUp(trigger, { detail: 1 });
          fireEvent.click(trigger, { detail: 1 });
        });
        await waitFor(() => {
          expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
        });
        const beta = [...document.querySelectorAll('[role="option"]')].find((option) =>
          option.textContent?.includes('Beta'),
        )!;
        await act(async () => {
          fireEvent.mouseDown(beta, { detail: 1 });
          fireEvent.mouseUp(beta, { detail: 1 });
          fireEvent.click(beta, { detail: 1 });
        });
        await waitFor(() => {
          expect(container.querySelector('output')?.textContent).toBe('Beta');
        });
      }
      await act(async () => {
        window.innerWidth = 390;
        fireEvent(window, new Event('resize'));
      });
      expect(container.querySelector('[data-wide]')?.getAttribute('data-wide')).toBe('false');
    } finally {
      await act(async () => root?.unmount());
      spy.mockRestore();
      scrollTo.mockRestore();
      container.remove();
    }
  });
});

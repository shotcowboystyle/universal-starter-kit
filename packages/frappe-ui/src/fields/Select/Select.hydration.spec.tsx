// @vitest-environment jsdom
/**
 * MPO-279: the Frappe `Select` field (the registry's SelectField) server-renders
 * the sheet trigger at every width, because the server has no viewport. These
 * hydrate that markup at a phone width and a desktop width, then drive the
 * hydrated control by pointer and by keyboard and read its combobox ARIA.
 */
import { TestProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { act, useLayoutEffect, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Select } from '.';

const options = ['Alpha', 'Beta', 'Gamma', 'Delta'];
let onChange = vi.fn();
let hydrationTrigger: Element | null = null;

function CommitProbe() {
  useLayoutEffect(() => {
    hydrationTrigger ??= document.querySelector('[role="combobox"]');
  }, []);
  return null;
}

function Fixture() {
  const [value, setValue] = useState('Beta');
  return (
    <TestProviders>
      <output>{value}</output>
      <Select
        label="Choice"
        options={options}
        value={value}
        onChange={(next: unknown) => {
          onChange(next);
          setValue(String(next));
        }}
      />
      <CommitProbe />
    </TestProviders>
  );
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let errors: unknown[] = [];

async function hydrateAt(width: number) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true });
  const browserWindow = window;
  let html: string;
  vi.stubGlobal('window');
  try {
    html = renderToString(<Fixture />);
  } finally {
    vi.stubGlobal('window', browserWindow);
  }
  container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const serverTrigger = container.querySelector('[role="combobox"]');
  errors = [];
  hydrationTrigger = null;
  onChange = vi.fn();
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
  await act(async () => {
    root = hydrateRoot(container!, <Fixture />, {
      onRecoverableError: (error) => errors.push(error),
    });
  });
  return { serverTrigger, view: container };
}

const hydrationErrors = () => errors.filter((error) => /hydration|hydrated|didn't match/i.test(String(error)));
const trigger = () => document.querySelector('[role="combobox"]')!;
const listOptions = () => [...document.querySelectorAll('[role="option"]')] as HTMLElement[];
const option = (label: string) => listOptions().find((node) => node.textContent?.includes(label))!;

/** One act per event: a browser flushes React between discrete events. */
async function press(node: Element) {
  await act(async () => fireEvent.pointerDown(node, { button: 0, pointerId: 1 }));
  await act(async () => fireEvent.mouseDown(node, { detail: 1 }));
  await act(async () => fireEvent.mouseUp(node, { detail: 1 }));
  await act(async () => fireEvent.click(node, { detail: 1 }));
}

const focused = () => document.activeElement as HTMLElement;

async function key(node: Element, name: string) {
  await act(async () => {
    fireEvent.keyDown(node, { key: name, code: name === ' ' ? 'Space' : name });
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SelectField SSR to hydration (MPO-279)', () => {
  it.each([390, 1200])('hydrates the server trigger at %i pixels with no recoverable error', async (width) => {
    const { serverTrigger } = await hydrateAt(width);
    expect(serverTrigger).toBeTruthy();
    expect(hydrationTrigger).toBe(serverTrigger);
    expect(hydrationErrors()).toEqual([]);
    await waitFor(() => {
      expect(trigger().textContent).toContain('Beta');
    });
    expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    if (width === 390) {
      expect(trigger()).toBe(serverTrigger);
    }
  });

  it('desktop: keyboard opens on the selected option, navigates, selects and closes', async () => {
    await hydrateAt(1200);
    await key(trigger(), 'Enter');
    await waitFor(() => {
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
    });
    expect(listOptions().map((node) => node.textContent?.trim())).toEqual(options);
    expect(option('Beta').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[role="listbox"]')).toBeTruthy();

    await waitFor(() => {
      expect(focused()).toBe(option('Beta'));
    });
    await key(focused(), 'ArrowDown');
    await waitFor(() => {
      expect(focused()).toBe(option('Gamma'));
    });
    await key(focused(), 'Enter');
    await waitFor(() => {
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Gamma');
    expect(container?.querySelector('output')?.textContent).toBe('Gamma');
    expect(trigger().textContent).toContain('Gamma');
  });

  it('desktop: Escape closes without changing the value', async () => {
    await hydrateAt(1200);
    await key(trigger(), 'ArrowDown');
    await waitFor(() => {
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
    });
    await key(document.activeElement ?? document.body, 'Escape');
    await waitFor(() => {
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger().textContent).toContain('Beta');
  });

  it('desktop: pointer opens, selects, and an outside press dismisses', async () => {
    await hydrateAt(1200);
    await press(trigger());
    await waitFor(() => {
      expect(listOptions()).toHaveLength(options.length);
    });
    await press(option('Delta'));
    await waitFor(() => {
      expect(container?.querySelector('output')?.textContent).toBe('Delta');
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Delta');

    await press(trigger());
    await waitFor(() => {
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
    });
    await press(document.body);
    await waitFor(() => {
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('phone: the sheet opens by pointer and selects, and wires aria-controls while open', async () => {
    await hydrateAt(390);
    await press(trigger());
    await waitFor(() => {
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
    });
    const controls = trigger().getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)?.getAttribute('role')).toBe('listbox');
    await press(option('Alpha'));
    await waitFor(() => {
      expect(container?.querySelector('output')?.textContent).toBe('Alpha');
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Alpha');
  });
});

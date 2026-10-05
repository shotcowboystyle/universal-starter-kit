// @vitest-environment jsdom
/**
 * PaneScaffold on an SSR route. The server has no viewport and
 * renders the `medium` class, a stacked pair of panes. Hydration has to
 * reproduce that markup at any width, then adopt the viewport's class: a
 * phone stays stacked as `compact`, a 1280px desktop splits as `xl`.
 */
import { TestProviders } from '@repo/test-utils';
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Paragraph } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PaneScaffold } from './PaneScaffold';

vi.mock('@repo/theme', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/theme')>()),
  ensureKeyboardModalityTracking: () => {},
  wasKeyboardFocus: () => false,
}));

function Fixture() {
  return (
    <TestProviders>
      <PaneScaffold primary={<Paragraph>List</Paragraph>} secondary={<Paragraph>Detail</Paragraph>} />
    </TestProviders>
  );
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let errors: unknown[] = [];
let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  window.matchMedia = ((media: string) => ({
    media,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function serverRender(): string {
  const browserWindow = window;
  vi.stubGlobal('window', undefined);
  try {
    return renderToString(<Fixture />);
  } finally {
    vi.stubGlobal('window', browserWindow);
  }
}

async function hydrateAt(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const html = serverRender();
  container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
  await act(async () => {
    root = hydrateRoot(container!, <Fixture />, {
      onRecoverableError: (error) => errors.push(error),
    });
  });
  return html;
}

const hydrationErrors = () => errors.filter((error) => /hydration|hydrated|didn't match/i.test(String(error)));
const scaffold = () => container!.querySelector('[data-testid="pane-scaffold"]')!;

describe('PaneScaffold SSR to hydration', () => {
  it.each([
    [390, 'compact', 'stack'],
    [1280, 'xl', 'split'],
  ] as const)("hydrates the server's medium stack at %ipx, then adopts %s (%s)", async (width, sizeClass, layout) => {
    const html = await hydrateAt(width);
    expect(html).toContain('data-size-class="medium"');
    expect(html).toContain('data-pane-layout="stack"');

    expect(hydrationErrors()).toEqual([]);
    expect(scaffold().getAttribute('data-size-class')).toBe(sizeClass);
    expect(scaffold().getAttribute('data-pane-layout')).toBe(layout);
    expect(scaffold().textContent).toContain('List');
    expect(scaffold().textContent).toContain('Detail');
  });
});

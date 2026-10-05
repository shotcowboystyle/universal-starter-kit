/**
 * The server has no viewport, so it renders the `medium` size class.
 * A component that branches on `useLayoutSizeClass() === "compact"` (the
 * scaffold Navbar's desktop list vs phone menu) must hydrate that markup at a
 * phone width, then adopt `compact`. Reading the viewport on the first client
 * render is a mismatch React answers by throwing the server tree away.
 * Native has no server HTML, so its first render reads the window directly.
 */
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ web: true, nativeWidth: 390 }));

vi.mock(import('tamagui'), async (importOriginal) => ({
  ...(await importOriginal()),
  get isWeb() {
    return host.web;
  },
  useWindowDimensions: () => ({ width: host.nativeWidth, height: 800, scale: 2, fontScale: 1 }),
}));

import { useLayoutSizeClass } from './layoutTokens';

function NavFixture() {
  const sizeClass = useLayoutSizeClass();
  return (
    <nav data-size-class={sizeClass}>
      {sizeClass === 'compact' ? (
        <button type="button">Menu</button>
      ) : (
        <ul>
          <li>Home</li>
          <li>Pokemon</li>
        </ul>
      )}
    </nav>
  );
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let errors: unknown[] = [];

function serverRender(): string {
  const browserWindow = window;
  vi.stubGlobal('window', undefined);
  try {
    return renderToString(<NavFixture />);
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
  const serverNav = container.querySelector('nav');
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
  await act(async () => {
    root = hydrateRoot(container!, <NavFixture />, {
      onRecoverableError: (error) => errors.push(error),
    });
  });
  return { html, serverNav };
}

const hydrationErrors = () => errors.filter((error) => /hydration|hydrated|didn't match/i.test(String(error)));

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
  host.web = true;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useLayoutSizeClass through SSR hydration', () => {
  it("hydrates the server's medium markup at 390px, then adopts compact", async () => {
    const { html, serverNav } = await hydrateAt(390);
    expect(html).toContain('data-size-class="medium"');
    expect(html).toContain('<ul>');

    expect(hydrationErrors()).toEqual([]);
    expect(container!.querySelector('nav')).toBe(serverNav);
    expect(serverNav!.getAttribute('data-size-class')).toBe('compact');
    expect(serverNav!.querySelector('ul')).toBeNull();
    expect(serverNav!.querySelector('button')?.textContent).toBe('Menu');
  });

  it('hydrates at 1280px with no mismatch and adopts xl', async () => {
    const { serverNav } = await hydrateAt(1280);
    expect(hydrationErrors()).toEqual([]);
    expect(container!.querySelector('nav')).toBe(serverNav);
    expect(serverNav!.getAttribute('data-size-class')).toBe('xl');
    expect(serverNav!.querySelector('ul')).not.toBeNull();
  });

  it('sizes a native first render from the window, with no medium frame first', () => {
    host.web = false;
    host.nativeWidth = 390;
    expect(renderToString(<NavFixture />)).toContain('data-size-class="compact"');
    host.nativeWidth = 1280;
    expect(renderToString(<NavFixture />)).toContain('data-size-class="xl"');
  });
});

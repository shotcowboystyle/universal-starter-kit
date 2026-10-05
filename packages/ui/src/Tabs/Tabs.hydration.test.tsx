// @vitest-environment jsdom
/**
 * On touch mobile web the server cannot know the device, so it renders
 * pointer-sized tabs. Hydration has to reproduce that markup, then adopt the
 * touch floor; a first client render at touch size is an attribute mismatch
 * React never patches.
 */
import { TestProviders } from '@repo/test-utils';
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Tabs } from './index';

const host = vi.hoisted(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  return { web: true, touch: false };
});
vi.mock('@repo/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/platform')>()),
  get isWeb() {
    return host.web;
  },
  get isTouchable() {
    return !host.web && host.touch;
  },
  get isWebTouchable() {
    return host.web && host.touch;
  },
}));

const items = [
  { value: 'address', label: 'Address & Contact', content: <>address panel</> },
  { value: 'settings', label: 'Settings', content: <>settings panel</> },
];

function Fixture() {
  return (
    <TestProviders>
      <Tabs items={items} defaultValue="address" />
    </TestProviders>
  );
}

/** Every `_h-` height atom painted inside each tab, in document order. */
function tabHeights(root: ParentNode): string[][] {
  return [...root.querySelectorAll('[role="tab"]')].map((tab) =>
    [tab, ...tab.querySelectorAll('*')].flatMap((node) => [...node.classList].filter((name) => /^_h-\d/.test(name))),
  );
}

let container: HTMLDivElement;
let root: Root | undefined;
let errors: unknown[];

beforeEach(() => {
  host.web = true;
  host.touch = false;
  errors = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
});

async function hydrate() {
  await act(async () => {
    root = hydrateRoot(container, <Fixture />, {
      onRecoverableError: (error) => errors.push(error),
    });
  });
}

const hydrationErrors = () => errors.filter((error) => /hydration|hydrated|didn't match/i.test(String(error)));

describe('Tabs sizing through hydration', () => {
  it("keeps the server's pointer-sized tabs through hydration, then adopts the touch floor", async () => {
    container.innerHTML = renderToString(<Fixture />);
    const serverTabs = [...container.querySelectorAll('[role="tab"]')];
    const serverHeights = tabHeights(container);
    expect(serverHeights.flat()).not.toHaveLength(0);

    host.touch = true;
    await hydrate();

    expect(hydrationErrors()).toEqual([]);
    expect([...container.querySelectorAll('[role="tab"]')]).toEqual(serverTabs);
    const clientHeights = tabHeights(container);
    expect(clientHeights).not.toEqual(serverHeights);
    for (const heights of clientHeights) {
      expect(heights).toContain('_h-48px');
    }
  });

  it('leaves pointer sizing alone on a pointer device', async () => {
    container.innerHTML = renderToString(<Fixture />);
    const serverHeights = tabHeights(container);
    await hydrate();
    expect(hydrationErrors()).toEqual([]);
    expect(tabHeights(container)).toEqual(serverHeights);
  });

  it('sizes native tabs to the touch floor on the first render', () => {
    host.web = false;
    host.touch = true;
    container.innerHTML = renderToString(<Fixture />);
    for (const heights of tabHeights(container)) {
      expect(heights).toContain('_h-48px');
    }
  });
});

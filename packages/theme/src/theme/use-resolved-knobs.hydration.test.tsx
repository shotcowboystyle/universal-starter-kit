import { TestProviders } from '@repo/test-utils';
// @vitest-environment jsdom
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { KnobProps } from './recipes';
import { useResolvedKnobs } from './use-resolved-knobs';

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
vi.mock(import('@repo/platform'), async (importOriginal) => ({
  ...(await importOriginal()),
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

let reducedMotion = false;
const motionListeners = new Set<() => void>();
let root: Root | null = null;
let container: HTMLDivElement;
let errors: unknown[];
let observed: { height: unknown; transition: KnobProps['transition'] }[];

const describeMotion = (transition: KnobProps['transition']) =>
  transition === undefined ? 'undefined' : JSON.stringify(transition);

const Probe = () => {
  const { knobProps } = useResolvedKnobs();
  const { height } = knobProps.control;
  const { transition } = knobProps;
  observed.push({ height, transition });
  return (
    <button
      type="button"
      data-height={String(height)}
      data-motion={describeMotion(transition)}>
      Control
    </button>
  );
};

const Fixture = () => (
  <TestProviders>
    <Probe />
  </TestProviders>
);

const hydrate = async () => {
  await act(async () => {
    root = hydrateRoot(container, <Fixture />, {
      onRecoverableError: (error) => errors.push(error),
    });
  });
};

describe('responsive knob hydration', () => {
  beforeEach(() => {
    host.web = true;
    host.touch = false;
    reducedMotion = false;
    motionListeners.clear();
    observed = [];
    errors = [];
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const query = {
      get matches() {
        return reducedMotion;
      },
      addEventListener: (_event: string, listener: () => void) => motionListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => motionListeners.delete(listener),
    };
    vi.stubGlobal('matchMedia', () => query);
    vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps server control markup before adopting the browser touch floor', async () => {
    container.insertAdjacentHTML('afterbegin', renderToString(<Fixture />));
    const serverControl = container.querySelector('button');
    const serverHeight = observed[0].height;
    observed = [];
    host.touch = true;
    await hydrate();
    expect(observed[0].height).toBe(serverHeight);
    expect(container.querySelector('button')).toBe(serverControl);
    expect(container.querySelector('button')?.dataset.height).toBe('48');
    expect(errors).toStrictEqual([]);
  });

  it('hydrates before adopting reduced motion and keeps observing preference changes', async () => {
    container.insertAdjacentHTML('afterbegin', renderToString(<Fixture />));
    const serverControl = container.querySelector('button');
    const serverTransition = observed[0].transition;
    observed = [];
    reducedMotion = true;
    await hydrate();
    expect(observed[0].transition).toBe(serverTransition);
    expect(container.querySelector('button')).toBe(serverControl);
    expect(container.querySelector('button')?.dataset.motion).toBe('undefined');
    expect(motionListeners.size).toBe(1);
    await act(async () => {
      reducedMotion = false;
      for (const listener of motionListeners) {
        listener();
      }
    });
    expect(container.querySelector('button')?.dataset.motion).toBe(describeMotion(serverTransition));
    expect(errors).toStrictEqual([]);
    await act(async () => root?.unmount());
    root = null;
    expect(motionListeners.size).toBe(0);
  });

  it('keeps native touch sizing on its initial render', () => {
    host.web = false;
    host.touch = true;
    container.insertAdjacentHTML('afterbegin', renderToString(<Fixture />));
    expect(observed[0].height).toBe(48);
    expect(errors).toStrictEqual([]);
  });
});

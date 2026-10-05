import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Text } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimateHeight } from './index';

/**
 * The shared test setup ships a ResizeObserver mock that never fires, so by
 * default AnimateHeight has no measurement and takes its instant paths (the
 * semantics the Accordion specs rely on). Tests that need the animated paths
 * install this controllable observer plus a fixed getBoundingClientRect.
 */
class FiringResizeObserver {
  static instances: FiringResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FiringResizeObserver.instances.push(this);
  }
  observe() {
    // real observers fire an initial measurement on observe
    this.callback([], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

function Harness({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button
        data-testid="toggle"
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}>
        toggle
      </button>
      <AnimateHeight open={open} testID="animate-height-outer">
        <Text>Collapsible body</Text>
      </AnimateHeight>
    </>
  );
}

const originalResizeObserver = window.ResizeObserver;

function installFiringObserver(height: number) {
  FiringResizeObserver.instances = [];
  window.ResizeObserver = FiringResizeObserver as unknown as typeof ResizeObserver;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    height,
    width: 260,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 260,
    bottom: height,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('AnimateHeight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.ResizeObserver = originalResizeObserver;
  });

  it('follower mode always renders children', () => {
    const result = renderWithProviders(
      <AnimateHeight>
        <Text>Follower body</Text>
      </AnimateHeight>,
    );
    expect(result.container.textContent).toContain('Follower body');
  });

  it('collapsible closed at rest renders no children', () => {
    const result = renderWithProviders(<Harness initialOpen={false} />);
    expect(result.container.textContent).not.toContain('Collapsible body');
  });

  it('mounts children in the same commit open flips true', () => {
    const result = renderWithProviders(<Harness initialOpen={false} />);
    fireEvent.click(result.getByTestId('toggle'));
    expect(result.container.textContent).toContain('Collapsible body');
  });

  it('closing without a measurement unmounts synchronously', () => {
    // default never-firing observer mock: nothing can tween
    const result = renderWithProviders(<Harness initialOpen={true} />);
    expect(result.container.textContent).toContain('Collapsible body');
    fireEvent.click(result.getByTestId('toggle'));
    expect(result.container.textContent).not.toContain('Collapsible body');
  });

  it('closing with a real measurement keeps children through the exit tween, then unmounts', () => {
    installFiringObserver(120);
    const result = renderWithProviders(<Harness initialOpen={true} />);
    expect(result.container.textContent).toContain('Collapsible body');

    fireEvent.click(result.getByTestId('toggle'));
    // exit tween in flight — children must stay mounted
    expect(result.container.textContent).toContain('Collapsible body');

    // knob default transition is "quick" — settle table 450ms + buffer
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.container.textContent).not.toContain('Collapsible body');
  });

  it('expanding from closed tweens 0 → measured height', () => {
    installFiringObserver(120);
    const result = renderWithProviders(<Harness initialOpen={false} />);
    fireEvent.click(result.getByTestId('toggle'));
    // double rAF lands the measured target (fake timers tick rAF at 16ms)
    act(() => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const region = result.container.querySelector('[data-testid="animate-height-outer"]');
    // outer carries the measured numeric height once the target lands —
    // tamagui emits it as an atomic height class in this environment
    expect((region as HTMLElement | null)?.className).toContain('_h-120px');
  });

  it('reduced motion unmounts immediately on close even with a measurement', () => {
    installFiringObserver(120);
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    const result = renderWithProviders(<Harness initialOpen={true} />);
    fireEvent.click(result.getByTestId('toggle'));
    expect(result.container.textContent).not.toContain('Collapsible body');
  });
});

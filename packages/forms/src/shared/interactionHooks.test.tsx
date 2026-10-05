/**
 * Shared interaction-hook contracts:
 * - useSheetEscapeDismiss: Escape dismisses sheet-mode popups from the
 *   keyboard, but only while enabled, and inner popups that own Escape
 *   (preventDefault) keep the sheet open; the listener detaches on unmount.
 * - useWheelIncrement: wheel-up increments / wheel-down decrements once the
 *   accumulated delta crosses the threshold, page scroll is prevented, and
 *   disabled/readOnly inputs ignore the wheel.
 */

import { render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSheetEscapeDismiss } from './useSheetEscapeDismiss';
import { useWheelIncrement } from './useWheelIncrement';

function pressEscape(defaultPrevented = false) {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  if (defaultPrevented) {
    event.preventDefault();
  }
  window.dispatchEvent(event);
  return event;
}

describe('useSheetEscapeDismiss', () => {
  it('dismisses on Escape while enabled', () => {
    const onDismiss = vi.fn();
    renderHook(() => {
      useSheetEscapeDismiss(true, onDismiss);
    });
    pressEscape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const onDismiss = vi.fn();
    renderHook(() => {
      useSheetEscapeDismiss(true, onDismiss);
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const onDismiss = vi.fn();
    renderHook(() => {
      useSheetEscapeDismiss(false, onDismiss);
    });
    pressEscape();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('respects inner popups that already handled Escape (defaultPrevented)', () => {
    const onDismiss = vi.fn();
    renderHook(() => {
      useSheetEscapeDismiss(true, onDismiss);
    });
    pressEscape(true);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('always calls the latest onDismiss callback (no stale closure)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => {
        useSheetEscapeDismiss(true, cb);
      },
      {
        initialProps: { cb: first },
      },
    );
    rerender({ cb: second });
    pressEscape();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('detaches the listener on unmount', () => {
    const onDismiss = vi.fn();
    const { unmount } = renderHook(() => {
      useSheetEscapeDismiss(true, onDismiss);
    });
    unmount();
    pressEscape();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

interface WheelHarnessProps {
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  threshold?: number;
}

function WheelHarness(props: WheelHarnessProps) {
  const { wheelProps } = useWheelIncrement(props);
  return <div data-testid="wheel-target" ref={wheelProps.ref} />;
}

function dispatchWheel(target: Element, deltaY: number) {
  const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
  target.dispatchEvent(event);
  return event;
}

describe('useWheelIncrement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('increments on wheel-up and decrements on wheel-down past the threshold', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    const { getByTestId } = render(<WheelHarness onIncrement={onIncrement} onDecrement={onDecrement} />);
    const target = getByTestId('wheel-target');
    dispatchWheel(target, -30);
    expect(onIncrement).toHaveBeenCalledTimes(1);
    dispatchWheel(target, 30);
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it('accumulates small trackpad deltas until the threshold is crossed', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    const { getByTestId } = render(<WheelHarness onIncrement={onIncrement} onDecrement={onDecrement} />);
    const target = getByTestId('wheel-target');
    dispatchWheel(target, -10);
    dispatchWheel(target, -10);
    expect(onIncrement).not.toHaveBeenCalled();
    dispatchWheel(target, -10);
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it('resets the accumulated delta after a pause', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    const { getByTestId } = render(<WheelHarness onIncrement={onIncrement} onDecrement={onDecrement} />);
    const target = getByTestId('wheel-target');
    dispatchWheel(target, -20);
    // Pause longer than the 150ms accumulation window.
    vi.setSystemTime(1000);
    dispatchWheel(target, -20);
    // 20 + (reset) 20 never crosses 30 in one window → no increment.
    expect(onIncrement).not.toHaveBeenCalled();
  });

  it('prevents the page scroll (preventDefault on the wheel event)', () => {
    const { getByTestId } = render(<WheelHarness onIncrement={vi.fn()} onDecrement={vi.fn()} />);
    const event = dispatchWheel(getByTestId('wheel-target'), -30);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores the wheel when disabled or read-only', () => {
    const onIncrement = vi.fn();
    for (const props of [{ disabled: true }, { readOnly: true }]) {
      const { getByTestId, unmount } = render(
        <WheelHarness onIncrement={onIncrement} onDecrement={vi.fn()} {...props} />,
      );
      const event = dispatchWheel(getByTestId('wheel-target'), -60);
      expect(onIncrement).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      unmount();
    }
  });

  it('scales the trigger point with a custom threshold', () => {
    const onIncrement = vi.fn();
    const { getByTestId } = render(<WheelHarness onIncrement={onIncrement} onDecrement={vi.fn()} threshold={2} />);
    const target = getByTestId('wheel-target');
    dispatchWheel(target, -30);
    expect(onIncrement).not.toHaveBeenCalled();
    dispatchWheel(target, -30);
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });
});

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

import { useSheetEscapeDismiss } from './use-sheet-escape-dismiss';
import { useWheelIncrement } from './use-wheel-increment';

const pressEscape = (defaultPrevented = false) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  if (defaultPrevented) {
    event.preventDefault();
  }
  window.dispatchEvent(event);
  return event;
};

describe(useSheetEscapeDismiss, () => {
  it('dismisses on Escape while enabled', () => {
    const onDismiss = vi.fn<() => void>();
    renderHook(() => {
      useSheetEscapeDismiss(true, onDismiss);
    });
    pressEscape();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('ignores other keys', () => {
    const onDismiss = vi.fn<() => void>();
    renderHook(() => {
      useSheetEscapeDismiss(true, onDismiss);
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const onDismiss = vi.fn<() => void>();
    renderHook(() => {
      useSheetEscapeDismiss(false, onDismiss);
    });
    pressEscape();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('respects inner popups that already handled Escape (defaultPrevented)', () => {
    const onDismiss = vi.fn<() => void>();
    renderHook(() => {
      useSheetEscapeDismiss(true, onDismiss);
    });
    pressEscape(true);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('always calls the latest onDismiss callback (no stale closure)', () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
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
    expect(second).toHaveBeenCalledOnce();
  });

  it('detaches the listener on unmount', () => {
    const onDismiss = vi.fn<() => void>();
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

const WheelHarness = (props: WheelHarnessProps) => {
  const { wheelProps } = useWheelIncrement(props);
  return (
    <div
      data-testid="wheel-target"
      // oxlint-disable-next-line react/refs -- the ref object comes from the hook under test and is only attached, never read, during render
      ref={wheelProps.ref}
    />
  );
};

const dispatchWheel = (target: Element, deltaY: number) => {
  const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
  target.dispatchEvent(event);
  return event;
};

describe(useWheelIncrement, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('increments on wheel-up and decrements on wheel-down past the threshold', () => {
    const onIncrement = vi.fn<() => void>();
    const onDecrement = vi.fn<() => void>();
    const { getByTestId } = render(
      <WheelHarness
        onIncrement={onIncrement}
        onDecrement={onDecrement}
      />,
    );
    const target = getByTestId('wheel-target');
    dispatchWheel(target, -30);
    expect(onIncrement).toHaveBeenCalledOnce();
    dispatchWheel(target, 30);
    expect(onDecrement).toHaveBeenCalledOnce();
  });

  it('accumulates small trackpad deltas until the threshold is crossed', () => {
    const onIncrement = vi.fn<() => void>();
    const onDecrement = vi.fn<() => void>();
    const { getByTestId } = render(
      <WheelHarness
        onIncrement={onIncrement}
        onDecrement={onDecrement}
      />,
    );
    const target = getByTestId('wheel-target');
    dispatchWheel(target, -10);
    dispatchWheel(target, -10);
    expect(onIncrement).not.toHaveBeenCalled();
    dispatchWheel(target, -10);
    expect(onIncrement).toHaveBeenCalledOnce();
  });

  it('resets the accumulated delta after a pause', () => {
    const onIncrement = vi.fn<() => void>();
    const onDecrement = vi.fn<() => void>();
    const { getByTestId } = render(
      <WheelHarness
        onIncrement={onIncrement}
        onDecrement={onDecrement}
      />,
    );
    const target = getByTestId('wheel-target');
    dispatchWheel(target, -20);
    // Pause longer than the 150ms accumulation window.
    vi.setSystemTime(1000);
    dispatchWheel(target, -20);
    // 20 + (reset) 20 never crosses 30 in one window → no increment.
    expect(onIncrement).not.toHaveBeenCalled();
  });

  it('prevents the page scroll (preventDefault on the wheel event)', () => {
    const { getByTestId } = render(
      <WheelHarness
        onIncrement={vi.fn<() => void>()}
        onDecrement={vi.fn<() => void>()}
      />,
    );
    const event = dispatchWheel(getByTestId('wheel-target'), -30);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores the wheel when disabled or read-only', () => {
    const onIncrement = vi.fn<() => void>();
    for (const props of [{ disabled: true }, { readOnly: true }]) {
      const { getByTestId, unmount } = render(
        <WheelHarness
          onIncrement={onIncrement}
          onDecrement={vi.fn<() => void>()}
          {...props}
        />,
      );
      const event = dispatchWheel(getByTestId('wheel-target'), -60);
      expect(onIncrement).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      unmount();
    }
  });

  it('scales the trigger point with a custom threshold', () => {
    const onIncrement = vi.fn<() => void>();
    const { getByTestId } = render(
      <WheelHarness
        onIncrement={onIncrement}
        onDecrement={vi.fn<() => void>()}
        threshold={2}
      />,
    );
    const target = getByTestId('wheel-target');
    dispatchWheel(target, -30);
    expect(onIncrement).not.toHaveBeenCalled();
    dispatchWheel(target, -30);
    expect(onIncrement).toHaveBeenCalledOnce();
  });
});

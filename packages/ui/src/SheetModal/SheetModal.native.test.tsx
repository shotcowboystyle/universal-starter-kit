import { renderWithProviders } from '@repo/test-utils';
import { act } from '@testing-library/react';
import { Animated, PanResponder } from 'react-native';
import { Text } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SheetModal } from './index.native';

const modal = vi.hoisted(() => ({ onShow: undefined as undefined | (() => void) }));
vi.mock('react-native-web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  ActionSheetIOS: undefined,
  Modal: ({ children, onShow }: { children: import('react').ReactNode; onShow?: () => void }) => {
    modal.onShow = onShow;
    return children;
  },
}));

const onOpenChange = vi.fn();
let dismissCompletion: (result: { finished: boolean }) => void;
let release: () => void;
let completions: Array<(result: { finished: boolean }) => void>;
beforeEach(() => {
  vi.useFakeTimers();
  completions = [];
  modal.onShow = undefined;
  onOpenChange.mockReset();
  vi.spyOn(PanResponder, 'create').mockImplementation((config) => {
    release = () => config.onPanResponderRelease?.({} as never, { dy: 1000, vy: 2 } as never);
    return { panHandlers: {} };
  });
  vi.spyOn(Animated, 'spring').mockImplementation(() => ({
    start: (callback) => {
      if (callback) {
        dismissCompletion = callback;
      }
    },
    stop: vi.fn(),
    reset: vi.fn(),
  }));
  vi.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: (callback) => {
      if (callback) {
        completions.push(callback);
      }
    },
    stop: vi.fn(),
    reset: vi.fn(),
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function panel(open: boolean) {
  return (
    <SheetModal open={open} onOpenChange={onOpenChange}>
      <Text>row</Text>
    </SheetModal>
  );
}

describe('SheetModal native presentation lifecycle', () => {
  it('enters without onShow and ignores onShow for the same presentation', () => {
    renderWithProviders(panel(true));
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    expect(modal.onShow).toBeTypeOf('function');
    act(() => modal.onShow?.());
    expect(Animated.timing).toHaveBeenCalledTimes(1);
  });
  it('ignores onShow after the presentation closes', () => {
    const { rerender } = renderWithProviders(panel(true));
    const lateShow = modal.onShow;
    rerender(panel(false));
    const count = vi.mocked(Animated.timing).mock.calls.length;
    act(() => lateShow?.());
    expect(Animated.timing).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('ignores a completed entrance from an earlier presentation', () => {
    const { rerender } = renderWithProviders(panel(true));
    const oldCompletion = completions[0];
    rerender(panel(false));
    rerender(panel(true));
    const writes = vi.spyOn(Animated.Value.prototype, 'setValue');
    act(() => {
      oldCompletion({ finished: true });
    });
    expect(writes).not.toHaveBeenCalled();
    act(() => {
      completions[1]({ finished: true });
    });
    expect(writes).toHaveBeenCalledWith(0);
  });
  it('ignores callbacks after unmount and clears its timer', () => {
    const { unmount } = renderWithProviders(panel(true));
    const lateShow = modal.onShow;
    const completion = completions[0];
    const stop = vi.spyOn(Animated.Value.prototype, 'stopAnimation');
    unmount();
    expect(stop).toHaveBeenCalled();
    const writes = vi.spyOn(Animated.Value.prototype, 'setValue');
    const count = vi.mocked(Animated.timing).mock.calls.length;
    act(() => {
      lateShow?.();
      completion({ finished: true });
    });
    expect(writes).not.toHaveBeenCalled();
    expect(Animated.timing).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not let an earlier dismiss close a reopened presentation', () => {
    const { rerender } = renderWithProviders(panel(true));
    act(() => {
      release();
    });
    const oldDismiss = dismissCompletion;
    rerender(panel(false));
    rerender(panel(true));
    act(() => {
      oldDismiss({ finished: true });
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
  it('closes only after a successful current dismiss', () => {
    renderWithProviders(panel(true));
    act(() => {
      release();
    });
    act(() => {
      dismissCompletion({ finished: false });
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => {
      release();
    });
    act(() => {
      dismissCompletion({ finished: true });
    });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
  it('owns only the current StrictMode effect presentation', () => {
    renderWithProviders(panel(true), { reactStrictMode: true });
    expect(completions.length).toBeGreaterThanOrEqual(2);
    const writes = vi.spyOn(Animated.Value.prototype, 'setValue');
    act(() => {
      completions[0]({ finished: true });
    });
    expect(writes).not.toHaveBeenCalled();
    act(() => {
      completions[completions.length - 1]({ finished: true });
    });
    expect(writes).toHaveBeenCalledWith(0);
  });
  it('keeps the measured JS-driver workaround', () => {
    renderWithProviders(panel(true));
    expect(Animated.timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ useNativeDriver: false }),
    );
  });
});

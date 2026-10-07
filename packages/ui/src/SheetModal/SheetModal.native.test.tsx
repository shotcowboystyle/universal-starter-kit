import { renderWithProviders } from '@repo/test-utils';
import { act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Animated, PanResponder } from 'react-native';
import { Text } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SheetModal } from './index.native';

const modal = vi.hoisted<{ onShow: (() => void) | null }>(() => ({ onShow: null }));
vi.mock(import('react-native-web'), async (importOriginal) => ({
  ...(await importOriginal()),
  // oxlint-disable-next-line sonarjs/no-undefined-assignment -- the module must report no ActionSheetIOS; null would still be a present export
  ActionSheetIOS: undefined,
  Modal: ({ children, onShow }: { children: ReactElement; onShow?: () => void }) => {
    modal.onShow = onShow ?? null;
    return children;
  },
}));

describe('SheetModal native presentation lifecycle', () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  let dismissCompletion: (result: { finished: boolean }) => void;
  let release: () => void;
  let completions: ((result: { finished: boolean }) => void)[];
  beforeEach(() => {
    vi.useFakeTimers();
    completions = [];
    modal.onShow = null;
    onOpenChange.mockReset();
    vi.spyOn(PanResponder, 'create').mockImplementation((config) => {
      release = () => config.onPanResponderRelease?.({} as never, { dy: 1000, vy: 2 } as never);
      return { panHandlers: {} };
    });
    vi.spyOn(Animated, 'spring').mockImplementation(() => ({
      start: (onFinish) => {
        if (onFinish) {
          dismissCompletion = onFinish;
        }
      },
      stop: vi.fn<() => void>(),
      reset: vi.fn<() => void>(),
    }));
    vi.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (onFinish) => {
        if (onFinish) {
          completions.push(onFinish);
        }
      },
      stop: vi.fn<() => void>(),
      reset: vi.fn<() => void>(),
    }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const panel = (open: boolean) => (
    <SheetModal
      open={open}
      onOpenChange={onOpenChange}>
      <Text>row</Text>
    </SheetModal>
  );

  it('enters without onShow and ignores onShow for the same presentation', () => {
    renderWithProviders(panel(true));
    expect(Animated.timing).toHaveBeenCalledOnce();
    expect(modal.onShow).toBeTypeOf('function');
    act(() => modal.onShow?.());
    expect(Animated.timing).toHaveBeenCalledOnce();
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
    const [oldCompletion] = completions;
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
    const [completion] = completions;
    const stop = vi.spyOn(Animated.Value.prototype, 'stopAnimation');
    unmount();
    expect(stop).toHaveBeenCalledWith();
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
      completions.at(-1)?.({ finished: true });
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

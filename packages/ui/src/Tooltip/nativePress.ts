/**
 * Native Tooltip press session — long-press (~500ms) / press-in after delay
 * opens; press-out or tap-outside closes. Extracted so jsdom can cover the
 * open path without a React Native runtime.
 */

export const TOOLTIP_NATIVE_LONG_PRESS_MS = 500;

export interface NativeTooltipPressHandlers {
  pressIn: () => void;
  pressOut: () => void;
  longPress: () => void;
  tapOutside: () => void;
  dispose: () => void;
}

export function createNativeTooltipPressHandlers(
  setOpen: (open: boolean) => void,
  delayMs: number = TOOLTIP_NATIVE_LONG_PRESS_MS,
): NativeTooltipPressHandlers {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer == null) {
      return;
    }
    clearTimeout(timer);
    timer = null;
  };

  return {
    pressIn() {
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        setOpen(true);
      }, delayMs);
    },
    pressOut() {
      clearTimer();
      setOpen(false);
    },
    longPress() {
      clearTimer();
      setOpen(true);
    },
    tapOutside() {
      clearTimer();
      setOpen(false);
    },
    dispose() {
      clearTimer();
    },
  };
}

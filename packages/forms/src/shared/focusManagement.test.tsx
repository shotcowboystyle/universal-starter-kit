import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReturnFocusOnClose, useSheetModalFocus } from './focusManagement';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.replaceChildren();
});

for (const mode of ['floating', 'sheet'] as const) {
  describe(`${mode} close focus`, () => {
    function setup() {
      vi.useFakeTimers();
      const trigger = document.createElement('button');
      const frame = document.createElement('div');
      const item = document.createElement('button');
      const outside = document.createElement('input');
      frame.append(item);
      document.body.append(trigger, frame, outside);
      trigger.focus();
      const skipReturnFocusRef = { current: false };
      const frameRef = { current: frame };
      const hook = renderHook(
        ({ open }) => {
          if (mode === 'sheet') {
            useSheetModalFocus(open, frameRef, skipReturnFocusRef);
          } else {
            useReturnFocusOnClose(open, skipReturnFocusRef);
          }
        },
        { initialProps: { open: true } },
      );
      return { ...hook, trigger, item, outside, skipReturnFocusRef };
    }

    it('restores dropped focus after the close animation', async () => {
      const h = setup();
      h.trigger.blur();
      h.rerender({ open: false });
      await act(() => vi.advanceTimersByTimeAsync(400));
      expect(document.activeElement).toBe(h.trigger);
    });

    it('honors suppression set after close, before the delayed restore', async () => {
      const h = setup();
      h.trigger.blur();
      h.rerender({ open: false });
      h.skipReturnFocusRef.current = true;
      await act(() => vi.advanceTimersByTimeAsync(400));
      expect(document.activeElement).toBe(document.body);
    });

    it('keeps focus deliberately moved outside', async () => {
      const h = setup();
      h.outside.focus();
      h.rerender({ open: false });
      await act(() => vi.advanceTimersByTimeAsync(400));
      expect(document.activeElement).toBe(h.outside);
    });

    it('does not restore a previous close after reopening', async () => {
      const h = setup();
      h.trigger.blur();
      h.rerender({ open: false });
      h.rerender({ open: true });
      await act(() => vi.advanceTimersByTimeAsync(400));
      expect(document.activeElement).not.toBe(h.trigger);
    });
  });
}

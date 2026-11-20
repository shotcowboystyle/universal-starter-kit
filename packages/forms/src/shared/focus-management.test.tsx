import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReturnFocusOnClose, useSheetModalFocus } from './focus-management';

const dropFocus = (el: HTMLElement) => {
  // oxlint-disable-next-line github/no-blur -- blur() is the only way to simulate focus dropping to <body>, which is the case under test
  el.blur();
};

describe.each(['floating', 'sheet'] as const)('%s close focus', (mode) => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  const setup = () => {
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
  };

  it('restores dropped focus after the close animation', async () => {
    const h = setup();
    dropFocus(h.trigger);
    h.rerender({ open: false });
    await act(async () => await vi.advanceTimersByTimeAsync(400));
    expect(document.activeElement).toBe(h.trigger);
  });

  it('honors suppression set after close, before the delayed restore', async () => {
    const h = setup();
    dropFocus(h.trigger);
    h.rerender({ open: false });
    h.skipReturnFocusRef.current = true;
    await act(async () => await vi.advanceTimersByTimeAsync(400));
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps focus deliberately moved outside', async () => {
    const h = setup();
    h.outside.focus();
    h.rerender({ open: false });
    await act(async () => await vi.advanceTimersByTimeAsync(400));
    expect(document.activeElement).toBe(h.outside);
  });

  it('does not restore a previous close after reopening', async () => {
    const h = setup();
    dropFocus(h.trigger);
    h.rerender({ open: false });
    h.rerender({ open: true });
    await act(async () => await vi.advanceTimersByTimeAsync(400));
    expect(document.activeElement).not.toBe(h.trigger);
  });
});

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReturnFocusOnClose } from './useReturnFocusOnClose';

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('useReturnFocusOnClose', () => {
  function setup() {
    vi.useFakeTimers();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const hook = renderHook(
      ({ open }) => {
        useReturnFocusOnClose(open);
      },
      {
        initialProps: { open: true },
      },
    );
    return { ...hook, trigger };
  }

  it('restores dropped focus after the close animation', async () => {
    const h = setup();
    h.trigger.blur();
    h.rerender({ open: false });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(document.activeElement).toBe(h.trigger);
  });

  it('leaves the delayed restore inert once the document is gone', () => {
    const h = setup();
    h.trigger.blur();
    h.rerender({ open: false });
    vi.stubGlobal('document', undefined);
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
  });
});

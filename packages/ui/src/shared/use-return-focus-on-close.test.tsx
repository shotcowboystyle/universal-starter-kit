import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReturnFocusOnClose } from './use-return-focus-on-close';

const setup = () => {
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
};

const dropFocus = (el: HTMLElement) => {
  // oxlint-disable-next-line github/no-blur -- the test needs focus dropped onto <body>, with no other element to move it to
  el.blur();
};

describe(useReturnFocusOnClose, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('restores dropped focus after the close animation', async () => {
    const h = setup();
    dropFocus(h.trigger);
    h.rerender({ open: false });
    await act(async () => await vi.advanceTimersByTimeAsync(400));
    expect(document.activeElement).toBe(h.trigger);
  });

  it('leaves the delayed restore inert once the document is gone', () => {
    const h = setup();
    dropFocus(h.trigger);
    h.rerender({ open: false });
    // oxlint-disable-next-line unicorn/no-useless-undefined -- canUseDom() checks typeof document, so null would not model a missing document
    vi.stubGlobal('document', undefined);
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
  });
});

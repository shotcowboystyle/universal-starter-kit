/**
 * Axiom 7 AGENCY — restore focus to the element that had it
 * when a programmatically-opened overlay (`open` prop, no Dialog.Trigger)
 * closes. Tamagui's focus scope only restores to a Dialog.Trigger mounted
 * inside the Dialog; without one, close drops focus on <body>.
 *
 * Capture happens during RENDER, not in an effect: the Dialog focus scope
 * (a child) runs its effects before this parent's, so an effect-time capture
 * would read an element already inside the overlay. Reading
 * document.activeElement in render is a side-effect-free read
 * (StrictMode-safe — the double render sees the same value).
 *
 * Only restores when focus was actually dropped — a deliberate focus move
 * (outside click onto another control) is preserved. Web-only, no-op on
 * native. Mirror of the forms-package hook (packages stay independent).
 */

import { wasKeyboardFocus } from '@repo/theme';
import { useEffect, useRef } from 'react';
import { isWeb } from 'tamagui';

const canUseDom = () => isWeb && typeof document !== 'undefined';

function focusIsDropped(): boolean {
  const ae = document.activeElement;
  return !ae || ae === document.body || ae === document.documentElement;
}

export function useReturnFocusOnClose(open: boolean) {
  const prevRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (canUseDom()) {
    if (open && !wasOpenRef.current) {
      prevRef.current = document.activeElement as HTMLElement | null;
    }
    wasOpenRef.current = open;
  }
  useEffect(() => {
    if (!canUseDom() || !open) {
      return;
    }
    return () => {
      const restore = () => {
        // Nothing cancels this after unmount, so the document can be gone by
        // now (a test environment torn down inside the retry window), and
        // `isConnected` stays true on the detached node.
        if (!canUseDom()) {
          return;
        }
        const target = prevRef.current;
        if (!target || !target.isConnected) {
          return;
        }
        if (focusIsDropped()) {
          target.focus({
            preventScroll: true,
            focusVisible: wasKeyboardFocus(),
          } as FocusOptions);
        }
      };
      // Exit animations unmount the overlay a few frames later; retry after
      // the typical exit window. Both calls are idempotent.
      requestAnimationFrame(() => requestAnimationFrame(restore));
      setTimeout(restore, 320);
    };
  }, [open]);
}

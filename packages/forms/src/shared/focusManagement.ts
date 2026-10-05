/**
 * Overlay focus management.
 *
 * Programmatically-opened overlays (ConfirmDialog-style `open` props, sheets,
 * floating panels) get no focus restore from the Tamagui focus scope — it
 * only remembers a `Dialog.Trigger` mounted inside the Dialog. These hooks
 * close that gap:
 *
 * - `useReturnFocusOnClose(open)` — capture the focused element when `open`
 *   flips true; when it flips false, return focus to it IF focus was dropped
 *   (on body, or stranded inside a hidden/removed overlay). Never steals
 *   focus the user deliberately moved elsewhere (outside-click onto another
 *   control).
 * - `useSheetModalFocus(open, frameRef)` — sheet-mode complement: also moves
 *   focus INTO the sheet frame on open, keeps Tab cycling within it while
 *   open (Tamagui Sheet has no focus scope), and treats focus left inside
 *   the closed (offscreen-parked, still-mounted) frame as dropped.
 * - `useDialogShowFocus(onOpenAutoFocus)` — runs a dialog's open focus when
 *   the browser's `<dialog>.show()` left focus on an element that is not a
 *   tab stop.
 *
 * Capture happens during RENDER, not in an effect: child effects (the Dialog
 * focus scope) run before parent effects, so an effect-time capture would
 * read an element already inside the overlay. Reading document.activeElement
 * in render is a side-effect-free read (StrictMode-safe: the double render
 * sees the same value).
 *
 * NOT a duplicate of `hooks/useFocusManagement` (ErrorSummary's invalid-field
 * focuser): that hook captures on MOUNT and restores on UNMOUNT via a
 * containerRef. Overlay components here stay mounted while `open` flips (and
 * tamagui Sheet parks its frame offscreen instead of unmounting), so the
 * open-prop TRANSITION is the only usable boundary.
 *
 * Web-only; both are no-ops on native.
 */

import { wasKeyboardFocus } from '@repo/theme';
import { useEffect, useRef, type RefObject } from 'react';
import { isWeb, useDialogContext } from 'tamagui';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const canUseDom = () => isWeb && typeof document !== 'undefined';

function focusIsDropped(insideEl?: HTMLElement | null): boolean {
  const ae = document.activeElement;
  if (!ae || ae === document.body || ae === document.documentElement) {
    return true;
  }
  // Focus stranded inside a closed-but-mounted overlay (tamagui Sheet parks
  // its frame offscreen instead of unmounting) counts as dropped.
  if (insideEl?.contains(ae)) {
    return true;
  }
  return false;
}

/** Render-phase capture of the element focused just before `open` flipped true. */
function useCaptureOnOpen(open: boolean) {
  const prevRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const generationRef = useRef(0);
  if (canUseDom()) {
    if (open !== wasOpenRef.current) {
      generationRef.current += 1;
    }
    if (open && !wasOpenRef.current) {
      prevRef.current = document.activeElement as HTMLElement | null;
    }
    wasOpenRef.current = open;
  }
  return { prevRef, generationRef };
}

function restoreLater(
  prevRef: RefObject<HTMLElement | null>,
  generationRef: RefObject<number>,
  insideRef?: RefObject<HTMLElement | null>,
  skipReturnFocusRef?: RefObject<boolean>,
) {
  const generation = generationRef.current;
  const restore = () => {
    // Fires from the unmount path, so the document can be gone by now (a test
    // environment torn down inside the retry window). `isConnected` stays
    // stale-true on a detached node, so it does not cover this.
    if (!canUseDom()) {
      return;
    }
    if (skipReturnFocusRef?.current || generationRef.current !== generation) {
      return;
    }
    const target = prevRef.current;
    if (!target || !target.isConnected) {
      return;
    }
    if (focusIsDropped(insideRef?.current ?? null)) {
      target.focus({
        preventScroll: true,
        focusVisible: wasKeyboardFocus(),
      } as FocusOptions);
    }
  };
  // Exit animations unmount / park the overlay a few frames later; retry
  // after the typical exit window. All calls are idempotent.
  requestAnimationFrame(() => requestAnimationFrame(restore));
  setTimeout(restore, 320);
}

/** Restore focus to the element focused at open time, on close (web only). */
export function useReturnFocusOnClose(open: boolean, skipReturnFocusRef?: RefObject<boolean>) {
  const { prevRef, generationRef } = useCaptureOnOpen(open);
  useEffect(() => {
    if (!canUseDom() || !open) {
      return;
    }
    return () => {
      restoreLater(prevRef, generationRef, undefined, skipReturnFocusRef);
    };
  }, [open, prevRef, generationRef, skipReturnFocusRef]);
}

/**
 * Sheet-mode modal focus: on open, move focus into the frame (frame itself is
 * the target — it must carry `tabIndex={-1}`); while open, trap Tab inside;
 * on close, return focus (focus left inside the parked frame counts as
 * dropped).
 */
export function useSheetModalFocus(
  open: boolean,
  frameRef: RefObject<HTMLElement | null>,
  skipReturnFocusRef?: RefObject<boolean>,
) {
  const { prevRef, generationRef } = useCaptureOnOpen(open);
  useEffect(() => {
    if (!canUseDom() || !open) {
      return;
    }
    const frame = frameRef.current;
    if (!frame || typeof frame.addEventListener !== 'function') {
      return () => {
        restoreLater(prevRef, generationRef, frameRef, skipReturnFocusRef);
      };
    }

    // Focus moves in once the sheet has mounted its frame (spring start).
    const focusIn = () => {
      if (!canUseDom()) {
        return;
      }
      if (frame.contains(document.activeElement)) {
        return;
      }
      const first = frame.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? frame).focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    };
    // Both frames are tracked: cancelling only the outer one leaves the inner
    // callback live once the outer has already run.
    let innerRaf = 0;
    const raf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(focusIn);
    });

    // Light Tab trap: cycle within the frame (modal sheet owns focus).
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') {
        return;
      }
      const focusables = Array.from(frame.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      );
      if (!focusables.length) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === frame)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    frame.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(innerRaf);
      frame.removeEventListener('keydown', onKeyDown);
      restoreLater(prevRef, generationRef, frameRef, skipReturnFocusRef);
    };
  }, [open, frameRef, prevRef, generationRef, skipReturnFocusRef]);
}

const DIALOG_SHOW_FOCUS_EVENT = 'mp.dialogShowFocus';

/**
 * Chromium and WebKit's `<dialog>.show()` focuses the first focusable
 * descendant, so a tabIndex -1 surface or field frame takes focus; Firefox and
 * the HTML spec take the first tab stop. Focus is then inside before tamagui's
 * FocusScope checks, and its open auto-focus never fires. When focus sits on
 * something that is not a tab stop, run `onOpenAutoFocus` against the content
 * the way FocusScope would. Call it inside the Dialog. The content is found by
 * its id because FocusScope clones it with its own ref, so a ref passed to
 * `Dialog.Content` never attaches on web. Passive effects run after the
 * portal's layout-effect `show()`, which is why this is not a layout effect.
 */
export function useDialogShowFocus(onOpenAutoFocus: (event: Event) => void) {
  const { open, contentId } = useDialogContext();
  useEffect(() => {
    if (!open || !contentId || !canUseDom()) {
      return;
    }
    const content = document.getElementById(contentId);
    const focused = document.activeElement;
    if (!content || !(focused instanceof HTMLElement)) {
      return;
    }
    if (!content.contains(focused) || focused.tabIndex >= 0) {
      return;
    }
    content.addEventListener(DIALOG_SHOW_FOCUS_EVENT, onOpenAutoFocus, { once: true });
    content.dispatchEvent(new CustomEvent(DIALOG_SHOW_FOCUS_EVENT, { cancelable: true }));
  }, [open, contentId]);
}

/** `useDialogShowFocus` for a caller that renders the Dialog itself. */
export function DialogShowFocus({ onOpenAutoFocus }: { onOpenAutoFocus: (event: Event) => void }): null {
  useDialogShowFocus(onOpenAutoFocus);
  return null;
}

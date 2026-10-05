/**
 * Keyboard-modality tracker for manual focus-ring painting (web only).
 *
 * Group widgets built on roving/redirected focus (tamagui Tabs, ToggleGroup,
 * Group-wrapped button strips) move focus from the container to the current
 * item inside a focusin handler. Chromium drops keyboard modality on that
 * script-initiated focus, so neither CSS :focus-visible nor tamagui's
 * focusVisibleStyle fire for the redirected item — keyboard users get no
 * ring. Components track modality with these helpers and paint
 * the ring themselves on keyboard-origin focus.
 */

let lastInputWasKeyboard = false;
let hooked = false;

/**
 * Install the global modality listeners. Call during render of any component
 * that uses `wasKeyboardFocus`, so the tracker is live before the first
 * keystroke reaches the widget. Idempotent; no-op on native/SSR.
 */
export function ensureKeyboardModalityTracking() {
  if (hooked || typeof document === 'undefined') {
    return;
  }
  hooked = true;
  document.addEventListener('keydown', () => (lastInputWasKeyboard = true), true);
  document.addEventListener('pointerdown', () => (lastInputWasKeyboard = false), true);
}

/**
 * True when the most recent user input was a key press. Call from onFocus to
 * decide whether the focused element should paint a keyboard focus ring.
 * Installs the global listeners on first use; safe to call on native (always
 * false) and during SSR.
 */
export function wasKeyboardFocus(): boolean {
  ensureKeyboardModalityTracking();
  return lastInputWasKeyboard;
}

import { FOCUS_VISIBLE_RING_INSET } from './theme/focusState';

/**
 * Standard manual ring props — the INSET ring geometry
 * (`FOCUS_VISIBLE_RING_INSET`: 2px solid `$outlineColor`, offset −2), spread
 * here so manually-painted rings can never drift from the theme contract.
 * Manual painting exists for roving-focus / activedescendant composites
 * (ToggleGroup segments inside a clipped Group, menu/listbox rows under a
 * clipped overlay, table rows and cells) — items inside clipping ancestors,
 * which is exactly the inset carve-out; an offset-0 band there
 * would be severed by the clip. Standalone controls take the offset-0
 * `FOCUS_VISIBLE_RING` via `focusVisibleStyle` / `ensureFocusVisibleRing()`.
 */
export const keyboardFocusRingProps = {
  ...FOCUS_VISIBLE_RING_INSET,
} as const;

/**
 * RING-ANATOMY — CSS-synchronous ring on a composite's outer boundary.
 *
 * `:has(:focus-visible)` paints the same frame the keyboard heuristic would,
 * with zero React latency (the prior `focused` JS path lagged one frame and
 * spawned the inner-Area ring cascade). Inner targets suppress their own
 * outline so the box carries exactly one ring. Class: `mp-composite-ring`.
 */
export const compositeFocusRingCss = `/* LC-71: ring on the composite outer box; never on the inner field.
   Inset (−2px): these frames use overflow:hidden to clip children to radius,
   which severs an outer ring. Do NOT use :has(:focus-visible) on every
   descendant — that would ring the whole SearchInput when the clear ✕ is
   focused (two focusables → two rings, chip-dismiss rule). */
.mp-composite-ring:focus-visible,
.mp-composite-ring:has(input:focus),
.mp-composite-ring:has(textarea:focus),
.mp-composite-ring:has(.mp-input-area:focus) {
  outline: 2px solid var(--outlineColor, var(--c-outlineColor, CanvasText));
  outline-offset: -2px;
}
.mp-composite-ring-deep:has(:focus-visible) {
  outline: 2px solid var(--outlineColor, var(--c-outlineColor, CanvasText));
  outline-offset: -2px;
}
.mp-composite-ring input,
.mp-composite-ring textarea,
.mp-composite-ring [contenteditable],
.mp-input-area,
.mp-input-area:focus,
.mp-input-area:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}
.mp-chip-dismiss:focus-visible {
  outline: none !important;
}
.mp-chip-dismiss:focus-visible .mp-chip-dismiss-ring {
  outline: 2px solid var(--outlineColor, var(--c-outlineColor, CanvasText));
  outline-offset: 0;
}`;

const COMPOSITE_RING_STYLE_ID = 'mp-composite-focus-ring';

/** Idempotently mount the composite-boundary focus-ring stylesheet. */
export function ensureCompositeFocusRing(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(COMPOSITE_RING_STYLE_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = COMPOSITE_RING_STYLE_ID;
  tag.textContent = compositeFocusRingCss;
  document.head.appendChild(tag);
}

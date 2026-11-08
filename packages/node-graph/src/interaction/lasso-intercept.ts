/**
 * The long-press interceptor (design §7.3, task 3.7).
 *
 * One capture-phase `touchmove` listener on an ancestor, calling
 * `stopPropagation()`. That is the whole mechanism, and it is small because
 * the reasoning that led to it is where the work was:
 *
 *  - d3-zoom binds `touchmove.zoom` (`d3-zoom/src/zoom.js:80`) as a legacy
 *    `TouchEvent`, in the BUBBLE phase, on the element `zoom()` was called
 *    with — `.react-flow__renderer`, which is an ANCESTOR of the pane.
 *  - `setPointerCapture` retargets `PointerEvent`s only, so it cannot take
 *    that away.
 *  - d3 consults its `filter` in `touchstarted` (`:316`) and never again in
 *    `touchmoved` (`:340`), so flipping `panOnDrag` 350 ms into a hold cannot
 *    stop the gesture already running.
 *
 * A capture listener above the renderer runs BEFORE any of that, and
 * `stopPropagation()` in the capture phase ends the event's journey there:
 * it never descends to the target and never bubbles back up. The listener that
 * would have panned the canvas is not removed, disabled or raced — it is
 * simply never reached.
 *
 * Three properties this deliberately has, each with a spec:
 *
 *  - `touchmove` ONLY. `touchcancel` has to get through, because arming
 *    dispatches one at the pane so d3 ends its gesture cleanly instead of
 *    sitting on a live `g.touch0`. An interceptor that swallowed everything
 *    would eat its own escape hatch.
 *  - never `preventDefault()`. Suppressing the pan is a propagation decision,
 *    not a default-action one, and the pane already carries
 *    `touch-action: none` (design §7.5).
 *  - `passive: false` is passed explicitly. Chrome makes a `touchmove`
 *    listener on `document` or `window` passive by DEFAULT, and a passive
 *    listener that later needed `preventDefault` would fail silently. Stating
 *    it means the listener behaves as written wherever it is installed.
 *
 * No React and no `@xyflow` here on purpose: this is the piece design §7.3
 * calls the one mechanism no spike has run, so it is testable at its own level
 * rather than only through a canvas.
 */

export interface LassoInterceptOptions {
  /**
   * Any ancestor of the element d3 is bound to. `.react-flow__renderer` is
   * itself an ancestor of the pane, so an interceptor on the PANE would be
   * below the listener it is trying to stop — the hook passes the pane's
   * `ownerDocument`, which cannot be chosen wrongly.
   */
  readonly ancestor: EventTarget;
  /** Each swallowed event, so the marquee can be drawn from the same stream. */
  readonly onIntercept?: (event: TouchEvent) => void;
}

export interface LassoIntercept {
  /** Removes the listener. Idempotent, and it never removes anyone else's. */
  readonly release: () => void;
  readonly active: boolean;
}

export const installLassoIntercept = (options: LassoInterceptOptions): LassoIntercept => {
  const { ancestor, onIntercept } = options;
  let active = true;

  const handler = (event: Event) => {
    event.stopPropagation();
    // SAFETY: this handler is only ever registered for `touchmove`, which the
    // platform dispatches as a `TouchEvent`; `ancestor` is a bare EventTarget,
    // so its listener signature cannot say so, and `instanceof TouchEvent`
    // throws where the constructor is undeclared (desktop Firefox).
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    onIntercept?.(event as TouchEvent);
  };

  // oxlint-disable-next-line github/require-passive-events -- `passive: false` is stated on purpose; see the module comment
  ancestor.addEventListener('touchmove', handler, { capture: true, passive: false });

  return {
    release() {
      if (!active) {
        return;
      }
      active = false;
      ancestor.removeEventListener('touchmove', handler, { capture: true });
    },
    get active() {
      return active;
    },
  };
};

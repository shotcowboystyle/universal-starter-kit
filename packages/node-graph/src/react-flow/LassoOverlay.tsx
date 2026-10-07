/**
 * The long-press marquee (design §7.3 L4, task 3.7).
 *
 * One absolutely-positioned div, painted from `--xy-selection-background-color`
 * and `--xy-selection-border` — the SAME two variables React Flow's own
 * `.react-flow__selection` reads (`style.css`), which `graphVars.ts` already
 * writes from the mpo token layer. So the long-press marquee and the toolbar-
 * mode marquee are the same rectangle to look at, in both schemes, without this
 * file knowing a colour. `checkGraphVarsCoverage()` would fail the build for a
 * `.react-flow__` selector outside `css/graph.css`; reading the variables from
 * an inline style is the way to match upstream's paint without restating its
 * selector.
 *
 * WHERE IT MOUNTS IS LOAD-BEARING, and this is measured rather than assumed.
 * Rendered as a SIBLING of the canvas it painted nothing: computed
 * `background-color: rgba(0, 0, 0, 0)` and `border-style: none`, a correctly
 * sized rectangle that is entirely invisible. `GraphVars` writes the `--xy-*`
 * layer onto the `.mp-graph` root, and a variable that is not in scope resolves
 * to the empty string in silence. So it goes INSIDE the canvas, as a
 * `NodeGraph` child: React Flow renders children in the `.react-flow`
 * container, which is screen space, is `position: relative`, and is under the
 * root the variables are written to.
 *
 * Screen space, not the viewport transform. The marquee is drawn under a finger
 * and it must not scale, shear or move when the viewport is restored on arm.
 * The rect arrives pane-relative, and the pane fills that same container
 * exactly, so the two coordinate systems are one.
 *
 * `pointer-events: none` is not decoration. The overlay sits on top of the pane
 * during the one gesture whose events the pane must keep receiving, and a div
 * that swallowed them would break the lasso by painting it.
 */

import type { Rect } from '../model/index';

export interface LassoOverlayProps {
  /** Pane-relative screen px. `null` paints nothing. */
  readonly rect: Rect | null;
}

export function LassoOverlay({ rect }: LassoOverlayProps) {
  if (!rect) {
    return null;
  }
  return (
    <div
      className="mp-graph-lasso"
      data-testid="mp-graph-lasso"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        background: 'var(--xy-selection-background-color)',
        border: 'var(--xy-selection-border)',
        pointerEvents: 'none',
      }}
    />
  );
}

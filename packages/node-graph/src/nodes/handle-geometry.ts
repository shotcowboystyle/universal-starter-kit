/**
 * Port geometry — pure. The painted dot and the region you can actually hit
 * are two different numbers, and design §7.1 is emphatic that conflating them
 * is the commonest false FAIL in a knob sweep.
 *
 * The laws, verbatim from §7.1:
 *
 *  H1. The painted dot is 8 / 10 / 12 by the size knob and NEVER grows to 44.
 *      A 44 px painted dot is a different component.
 *  H2. The hit region is a pseudo-element, never element growth, because
 *      `getEdgePosition` reads the handle box's outer edge (`center` defaults
 *      to false) — growing 8 to 44 would move every rendered edge endpoint 18
 *      flow units outward on exactly the sides an LR graph uses.
 *  H3. 44 on coarse pointers, `max(painted, 24)` on fine. A 44 px invisible
 *      disc around every handle on a dense mouse canvas steals clicks from the
 *      node body.
 *  H4. Two ports closer than the hit diameter would have overlapping discs and
 *      the wrong one would win, so the hit caps at `min(44, portSpacing)`.
 *  H7. The region is 44 SCREEN px at every zoom, not 44 px of flow space.
 *      Added in milestone 6, and it is the only law here that was measured on a
 *      phone before it was written down. Every element a node owns lives inside
 *      `.react-flow__viewport`, whose transform carries the zoom, so a region
 *      declared 44 px renders 44 x zoom. On the iPhone 16e at zoom 0.377 that
 *      is 16.6 pt wide — a half-width of 8.3 pt — and a tap 18 pt off the
 *      painted centre panned the canvas instead of grabbing the port. Same miss
 *      on emulator-5592 at zoom 0.397. So the inset carries a 1/zoom term and
 *      the sheet reads the live zoom from `--mpo-graph-zoom`.
 *
 * H2 and H7 are the CSS in `css/graph.css`, not numbers; the rest are here.
 */

import { MIN_PRESS_TARGET } from '@repo/theme';

import { portSpacing } from './node-measure';
import type { GraphNodeSizeKnob, GraphPortSide } from './node-measure';

/** H1. Painted diameter per size stop. Never 44 at any stop, by construction. */
export const paintedPortSizePx: Record<GraphNodeSizeKnob, number> = {
  small: 8,
  medium: 10,
  large: 12,
};

/**
 * H3's fine-pointer floor. Below this a mouse target is a coin toss; above 44
 * it would start eating the node body, which is why fine and coarse differ at
 * all.
 */
export const FINE_PORT_HIT_MIN = 24;

export const paintedPortSize = (size: GraphNodeSizeKnob): number => paintedPortSizePx[size];

/**
 * H3 with H4's cap applied.
 *
 * The floor at the painted size is geometric, not a taste call: the hit region
 * is a pseudo-element inset OUTWARD from the dot, so a hit smaller than the
 * dot would inset inward and shrink the target below what the user can see.
 */
export const portHitSize = (opts: {
  readonly size: GraphNodeSizeKnob;
  readonly coarsePointer: boolean;
  /** The node's port pitch. Defaults to the pitch for this pointer kind. */
  readonly portSpacingPx?: number;
}): number => {
  const painted = paintedPortSize(opts.size);
  const wanted = opts.coarsePointer ? MIN_PRESS_TARGET : Math.max(painted, FINE_PORT_HIT_MIN);
  const spacing = opts.portSpacingPx ?? portSpacing({ coarsePointer: opts.coarsePointer });
  return Math.max(painted, Math.min(wanted, spacing));
};

/**
 * H7. The same inset with the viewport zoom divided back out.
 *
 * The region has to be `hit` SCREEN px, and it is painted inside a box the
 * viewport transform scales by `zoom`. Local width is therefore `hit / zoom`,
 * and the inset that produces it is `(painted - hit / zoom) / 2`, plus the ring
 * term H2 already carries. At zoom 1 this IS `portRegionInset`, which is what
 * `handle-geometry.test.ts` asserts, so the new term cannot silently change the
 * number the desktop canvas has always used.
 *
 * The floor on `zoom` is not defensive tidiness: dividing by zero in CSS is
 * silent and yields an infinite region that swallows the whole canvas. React
 * Flow never emits a zoom of 0, so the guard costs nothing and removes the one
 * way this arithmetic can produce something catastrophic.
 *
 * `css/graph.css` computes the identical expression from
 * `--mpo-graph-handle-size`, `--mpo-graph-handle-hit`,
 * `--mpo-graph-handle-border` and `--mpo-graph-zoom`. `GraphPort.test.tsx`
 * reads the rule text and checks the two agree, because jsdom cannot resolve a
 * pseudo-element and a spec written against `getComputedStyle(el, "::after")`
 * would assert nothing at all.
 */
export const portRegionInsetAtZoom = (opts: {
  readonly size: GraphNodeSizeKnob;
  readonly coarsePointer: boolean;
  readonly portSpacingPx?: number;
  readonly borderWidthPx?: number;
  /** The live viewport zoom. 1 outside a canvas. */
  readonly zoom: number;
}): number => {
  const zoom = opts.zoom > 0 ? opts.zoom : 1;
  return (paintedPortSize(opts.size) - portHitSize(opts) / zoom) / 2 - (opts.borderWidthPx ?? 0);
};

/**
 * The `inset` the `::after` region carries, in px.
 *
 * NEGATIVE when the hit is larger than the dot, which is the whole point: the
 * pseudo-element grows outward from the painted disc without touching the
 * handle's own box, so `handleBounds` — which reads `getBoundingClientRect()`
 * and `getDimensions()` — sees nothing change and every edge endpoint stays
 * where the 8 px dot put it.
 *
 * `borderWidthPx` is not decoration. An absolutely positioned pseudo-element
 * insets from its parent's PADDING box, and the dot is `box-sizing:
 * border-box` with a knob-driven ring, so the padding box is `size - 2 ×
 * border`. Measured in Chrome before this term existed: a 44 asked for
 * rendered as 42. A press floor that lands two pixels under the floor is not
 * a floor, so the ring is added back here rather than rounded away.
 */
export const portRegionInset = (opts: {
  readonly size: GraphNodeSizeKnob;
  readonly coarsePointer: boolean;
  readonly portSpacingPx?: number;
  /** The dot's ring, from `knobProps.surface.borderWidth`. */
  readonly borderWidthPx?: number;
}): number => portRegionInsetAtZoom({ ...opts, zoom: 1 });

/**
 * What the region ACTUALLY measures on screen, in px, at a given zoom.
 *
 * The number MPO-212's 3.4 criterion is about, and the one nothing computed
 * before milestone 6. With the 1/zoom term this is `portHitSize(opts)` at every
 * zoom, which is the whole claim — so a spec asserting it at 0.4 and at 2 is
 * asserting the fix rather than the arithmetic that implements it.
 */
export const portRegionScreenSize = (opts: {
  readonly size: GraphNodeSizeKnob;
  readonly coarsePointer: boolean;
  readonly portSpacingPx?: number;
  readonly borderWidthPx?: number;
  readonly zoom: number;
}): number => {
  const zoom = opts.zoom > 0 ? opts.zoom : 1;
  const painted = paintedPortSize(opts.size);
  const inset = portRegionInsetAtZoom(opts);
  // The local box, then back to screen px. `borderWidthPx` enters the inset and
  // must therefore leave again here, or the ring would be counted twice.
  const local = painted - 2 * inset - 2 * (opts.borderWidthPx ?? 0);
  return local * zoom;
};

/**
 * H5. `connectionRadius` matches the hit diameter, so the magnetic drop radius
 * is the visible affordance rather than React Flow's 20 px default. Wired into
 * the canvas in task 1.11; the number lives here with its siblings.
 */
export const portConnectionRadius = (opts: {
  readonly size: GraphNodeSizeKnob;
  readonly coarsePointer: boolean;
  readonly portSpacingPx?: number;
}): number => portHitSize(opts);

/** A rectangle in the node's own coordinate space, top-left anchored. */
export interface PortRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The two rectangles a port occupies, which are NOT the same rectangle.
 *
 * `box` is what React Flow measures. `handleBounds` is built from
 * `getBoundingClientRect()` and `getDimensions()` (`dom.ts:82-91`), so `box` is
 * the handle ELEMENT — and `getHandlePosition` turns it into the point every
 * edge is drawn to.
 *
 * `region` is what a finger lands on: the `::after` pseudo-element. A
 * pseudo-element is not in the box tree its parent reports, so it moves
 * `region` without moving `box`.
 *
 * Keeping them apart in the TYPE is the mechanism H2 describes. Element growth
 * would collapse them into one rectangle, and every edge endpoint on an LR
 * graph would slide outward by half the difference — 18 units at 8 → 44.
 */
export interface PortGeometry {
  /** What `handleBounds` measures. Painted size only; `hit` never enters. */
  readonly box: PortRect;
  /** What the pointer hits — the `::after` region. Grows with `hit`. */
  readonly region: PortRect;
}

const centredOn = (cx: number, cy: number, side: number): PortRect => ({
  x: cx - side / 2,
  y: cy - side / 2,
  width: side,
  height: side,
});

/** The port's centre: pinned to its own edge, and clamped along it. */
const portCentre = (side: GraphPortSide, nodeWidth: number, nodeHeight: number, offset: number) => {
  const alongX = Math.min(Math.max(offset, 0), nodeWidth);
  const alongY = Math.min(Math.max(offset, 0), nodeHeight);
  if (side === 'left') {
    return { cx: 0, cy: alongY };
  }
  if (side === 'right') {
    return { cx: nodeWidth, cy: alongY };
  }
  if (side === 'top') {
    return { cx: alongX, cy: 0 };
  }
  return { cx: alongX, cy: nodeHeight };
};

/**
 * Where a port sits on its node, and how big each of its two rectangles is.
 *
 * `painted` and `hit` are separate parameters ON PURPOSE, so the endpoint law
 * is falsifiable: a caller can ask for a 44 px hit and read back a box that did
 * not move. A single-size signature could not express the broken mechanism, and
 * a test that cannot express the bug cannot catch it.
 *
 * React Flow's own sheet centres a handle on the node edge — `left: 0` /
 * `right: 0` with `translate(∓50%)` and `top: 50%` with `translateY(-50%)`
 * (style.css `.react-flow__handle-left` and friends) — so both rectangles are
 * concentric on that edge point rather than tangent to it.
 */
export const portGeometry = (opts: {
  readonly painted: number;
  readonly hit: number;
  readonly side: GraphPortSide;
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  /** Distance along the port's edge, from the node's top-left corner. */
  readonly offset: number;
}): PortGeometry => {
  const { painted, hit, side, nodeWidth, nodeHeight, offset } = opts;
  const { cx, cy } = portCentre(side, nodeWidth, nodeHeight, offset);
  return { box: centredOn(cx, cy, painted), region: centredOn(cx, cy, hit) };
};

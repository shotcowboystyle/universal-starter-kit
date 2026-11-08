/**
 * Level of detail, and the one invariant that makes it safe (design §5).
 *
 * Pure. No React, no DOM, no `@xyflow` — the whole decision is one comparison,
 * and putting it here rather than inline in `GraphNodeHost` is what lets the
 * crossing be swept over a grid in vitest instead of eyeballed in a browser.
 *
 * The invariant this module exists to protect is NOT about paint. React Flow 12
 * installs a per-node `ResizeObserver`, so a height-changing LOD would
 * re-measure every node on every zoom tick and move every attached edge
 * endpoint with it. That is why `renderMode` fades children and never unmounts
 * them, and why `overview-node.tsx` is measured from the same recipe the detail
 * body uses rather than being "a small box".
 */

/**
 * On `GraphNodeRenderProps` from v1 (design §5). Naming it here rather than
 * inline in the schema is what lets a consumer's own node body take the union
 * without importing the whole model.
 */
export type GraphRenderMode = 'detail' | 'overview';

/**
 * The default crossing. 0.35 is design §5's number, and it lives here so
 * `graphCanvasDefaults`, `GraphHostValue` and every spec read ONE constant
 * instead of three copies that can drift apart by a decimal.
 */
export const defaultOverviewZoom = 0.35;

/**
 * Which mode a node draws in at this zoom.
 *
 * The comparison is `zoom < overviewZoom`, so the threshold itself is DETAIL.
 * That is a real choice and not an off-by-one: `overviewZoom` is the zoom at
 * which detail is still legible, and a canvas parked exactly on its own
 * default should show the graph, not the summary.
 *
 * Monotone by construction, which is the whole of "crosses at `overviewZoom`
 * and nowhere else": one comparison cannot produce two transitions.
 *
 * A non-finite zoom resolves to `detail`. It only reaches here from a store
 * mid-initialization or a consumer's own transform, and a graph that renders
 * its full body is a graph a user can still work with — where an overview of
 * unknown zoom is a screen of grey rectangles with no way back.
 */
export const lodForZoom = (zoom: number, overviewZoom: number = defaultOverviewZoom): GraphRenderMode => {
  if (!Number.isFinite(zoom)) {
    return 'detail';
  }
  return zoom < overviewZoom ? 'overview' : 'detail';
};

/** True when children should be faded out. Spelled once so no caller re-derives it. */
export const isOverview = (mode: GraphRenderMode): boolean => mode === 'overview';

/**
 * The opacity a node's non-essential children carry in each mode.
 *
 * A NUMBER, not a boolean the caller turns into a number, because zero is the
 * load-bearing value: children at `opacity: 0` are still laid out, still
 * measured, and still hold the box open. `display: none` or an unmount would
 * collapse the box and hand React Flow's observer a new height to chase.
 */
export const detailOpacity = (mode: GraphRenderMode): number => (isOverview(mode) ? 0 : 1);

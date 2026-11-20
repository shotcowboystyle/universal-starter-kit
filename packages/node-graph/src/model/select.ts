/**
 * Marquee selection and union bounds, design §12.2.
 *
 * Rects come in, ids come out. No document, no schema, no sizes guessed —
 * `nodeRects` is the one place that turns a document into rects, and it takes
 * the measurer as an argument, because a node's height is knob-driven and only
 * the renderer knows it.
 */

import type { EdgeKindDefs, GraphDocument, NodeId, NodeKindDefs, Rect, Size } from './document';

/**
 * "partial" selects anything the marquee overlaps; "full" only what it fully
 * contains. React Flow calls these `SelectionMode.Partial` / `.Full`.
 */
export type MarqueeMode = 'partial' | 'full';

export interface NodeRect {
  readonly id: NodeId;
  readonly rect: Rect;
}

/**
 * Touching edges do not overlap. A marquee whose left edge sits exactly on a
 * node's right edge has covered zero of it, and a brush that swept it up would
 * select a node the user can see it never touched.
 */
export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Inclusive: a rect contains itself. */
export const rectContains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** Input order is preserved, so a selection is stable between two identical drags. */
export const selectInMarquee = (nodes: readonly NodeRect[], marquee: Rect, mode: MarqueeMode): readonly NodeId[] => {
  const hit = mode === 'full' ? rectContains : rectsOverlap;
  const ids: NodeId[] = [];
  for (const { id, rect } of nodes) {
    if (hit(marquee, rect)) {
      ids.push(id);
    }
  }
  return ids;
};

/**
 * `undefined` for an empty selection, not a zero rect at the origin — 0,0 is a
 * real position, and a toolbar centering on it would jump the viewport every
 * time the selection emptied.
 */
export const unionBounds = (rects: readonly Rect[]): Rect | undefined => {
  if (rects.length === 0) {
    return undefined;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    if (rect.x < minX) {
      minX = rect.x;
    }
    if (rect.y < minY) {
      minY = rect.y;
    }
    if (rect.x + rect.width > maxX) {
      maxX = rect.x + rect.width;
    }
    if (rect.y + rect.height > maxY) {
      maxY = rect.y + rect.height;
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/**
 * A node's `size` is seeded from `NodeKindSpec.measure` plus resolved knobs
 * before first paint (design §5), but a document loaded from JSON may carry no
 * size at all, so `measure` is the fallback rather than a guess baked in here.
 */
export const nodeRects = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  doc: GraphDocument<N, E>,
  measure: (kind: string) => Size,
): readonly NodeRect[] =>
  doc.nodes.map((node) => {
    const size = node.size ?? measure(node.kind);
    return {
      id: node.id,
      rect: { x: node.position.x, y: node.position.y, width: size.width, height: size.height },
    };
  });

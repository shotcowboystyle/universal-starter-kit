/**
 * Alignment snapping, design §7.2. Pure: no DOM, no React, no `@xyflow`, so it
 * runs in vitest under Node and could run in a worklet or a worker later.
 *
 * This is a PORT of the native-first spike's snapper, not a fresh design. Two
 * things changed on the way in, and both are the whole reason the port was
 * worth doing rather than copying:
 *
 *  - the spike snapped ONE node by its index in a flat position array. This
 *    takes the dragged selection's **union rect** and its **id set**, so a
 *    multi-select drag snaps the box and one delta moves every member (S6);
 *  - the spike compared origins only. This compares the nine line pairs
 *    (S4), so a node aligns to a neighbour's centre or far edge, which is what
 *    makes the guides mean anything.
 *
 * The threshold arrives in FLOW units and is a screen distance divided by the
 * zoom (S2). `alignmentThreshold` does that division; the caller owns the zoom.
 */

import type { NodeId, Rect, XY } from '../model/document';

import type { SpatialHash } from './spatial-hash';

/** Design §7.2: 8 on a mouse, 12 under a finger, both in SCREEN px. */
export const defaultSnapThresholdPx = { fine: 8, coarse: 12 } as const;

/** Design §7.2 S3. How far from the dragged box a neighbour may be and count. */
export const defaultCandidateRadius = 400;

export interface PositionedNode {
  readonly id: NodeId;
  readonly rect: Rect;
}

export type SnapAxis = 'x' | 'y';

/** The three lines a rect offers per axis: `{left, centerX, right}` in §7.2's words. */
export type SnapLine = 'start' | 'center' | 'end';

export interface SnapGuide {
  readonly axis: SnapAxis;
  /** The flow coordinate of the line: an x for a vertical guide, a y for a horizontal one. */
  readonly position: number;
  /** Where the line starts on the OTHER axis. Spans the moved rect and the neighbour. */
  readonly start: number;
  readonly end: number;
  /** The neighbour it aligned to, so a story can name it and a test can assert it. */
  readonly nodeId: NodeId;
  readonly movingLine: SnapLine;
  readonly candidateLine: SnapLine;
}

export interface SnapResult {
  /** The snapped top-left of the dragged selection's union rect. */
  readonly position: XY;
  /** At most two: one per axis. Design §7.2 S10. */
  readonly guides: readonly SnapGuide[];
  /** True the frame a guide appears — what haptics fire on, once. */
  readonly acquired: boolean;
}

export interface SnapToAlignmentInput {
  /** The WHOLE dragged selection. Every member is excluded from candidates (S7). */
  readonly ids: readonly NodeId[];
  /** Union bounds of that selection, unsnapped. */
  readonly rect: Rect;
  /**
   * Live geometry. The index is the drag-start snapshot and only picks WHICH
   * neighbours to consider; this map is what the arithmetic reads, so a node
   * that moved under a programmatic change is aligned to where it is now.
   */
  readonly nodes: ReadonlyMap<NodeId, PositionedNode>;
  /** Built once at drag start, from every node (S3). */
  readonly index: SpatialHash;
  readonly thresholdFlowUnits: number;
  readonly radius: number;
}

/**
 * Screen px → flow units. A fixed flow-unit threshold is 4 screen px at 0.5×,
 * which is the "snapping feels dead when I pinch out" bug, so this division is
 * not a detail (S2).
 *
 * A zoom of zero or less returns 0 rather than Infinity: React Flow clamps zoom
 * well above zero, but a threshold of Infinity would snap the node to the first
 * neighbour in the index and there would be no way to see why.
 */
export const alignmentThreshold = (options: { readonly thresholdScreenPx: number; readonly zoom: number }): number => {
  const { thresholdScreenPx, zoom } = options;
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return 0;
  }
  return thresholdScreenPx / zoom;
};

const lineOrder: readonly SnapLine[] = ['start', 'center', 'end'];

type AxisLines = Record<SnapLine, number>;

const axisLines = (rect: Rect, axis: SnapAxis): AxisLines => {
  const origin = axis === 'x' ? rect.x : rect.y;
  const extent = axis === 'x' ? rect.width : rect.height;
  return { start: origin, center: origin + extent / 2, end: origin + extent };
};

interface AxisMatch {
  readonly delta: number;
  readonly distance: number;
  readonly line: number;
  readonly node: PositionedNode;
  readonly movingLine: SnapLine;
  readonly candidateLine: SnapLine;
}

/**
 * Nearest wins, per axis, independently (S4). An exact tie goes to the lower
 * node id (S9) — compared as a STRING, because ids are opaque strings (design
 * §4.1) and `n10` therefore sorts under `n2`. Deterministic is the property
 * that matters; which of the two orderings it is, is pinned by the spec.
 */
const bestMatch = (
  rect: Rect,
  axis: SnapAxis,
  candidates: readonly PositionedNode[],
  threshold: number,
): AxisMatch | null => {
  const moving = axisLines(rect, axis);
  let best: AxisMatch | null = null;
  for (const node of candidates) {
    const lines = axisLines(node.rect, axis);
    for (const movingLine of lineOrder) {
      for (const candidateLine of lineOrder) {
        const line = lines[candidateLine];
        const delta = line - moving[movingLine];
        const distance = Math.abs(delta);
        if (distance > threshold) {
          continue;
        }
        const better =
          best === null || distance < best.distance || (distance === best.distance && node.id < best.node.id);
        if (better) {
          best = { delta, distance, line, node, movingLine, candidateLine };
        }
      }
    }
  }
  return best;
};

const inflate = (rect: Rect, radius: number): Rect => ({
  x: rect.x - radius,
  y: rect.y - radius,
  width: rect.width + radius * 2,
  height: rect.height + radius * 2,
});

/**
 * The guide spans both rects on the other axis, so it visibly connects the two
 * things it claims are aligned instead of floating beside one of them.
 */
const guideFor = (match: AxisMatch, axis: SnapAxis, moved: Rect): SnapGuide => {
  const movedStart = axis === 'x' ? moved.y : moved.x;
  const movedEnd = movedStart + (axis === 'x' ? moved.height : moved.width);
  const otherStart = axis === 'x' ? match.node.rect.y : match.node.rect.x;
  const otherEnd = otherStart + (axis === 'x' ? match.node.rect.height : match.node.rect.width);
  return {
    axis,
    position: match.line,
    start: Math.min(movedStart, otherStart),
    end: Math.max(movedEnd, otherEnd),
    nodeId: match.node.id,
    movingLine: match.movingLine,
    candidateLine: match.candidateLine,
  };
};

export const snapToAlignment = (input: SnapToAlignmentInput): SnapResult => {
  const { ids, rect, nodes, index, thresholdFlowUnits, radius } = input;

  const excluded = new Set<NodeId>(ids);
  const candidates: PositionedNode[] = [];
  for (const hit of index.query(inflate(rect, radius))) {
    // Not in the map means removed since drag start. Aligning to a node that
    // no longer exists is worse than not aligning.
    const live = excluded.has(hit.id) ? undefined : nodes.get(hit.id);
    if (live) {
      candidates.push(live);
    }
  }

  if (candidates.length === 0) {
    return { position: { x: rect.x, y: rect.y }, guides: [], acquired: false };
  }

  const x = bestMatch(rect, 'x', candidates, thresholdFlowUnits);
  const y = bestMatch(rect, 'y', candidates, thresholdFlowUnits);
  const position = { x: rect.x + (x?.delta ?? 0), y: rect.y + (y?.delta ?? 0) };
  if (!x && !y) {
    return { position, guides: [], acquired: false };
  }

  const moved: Rect = { ...rect, x: position.x, y: position.y };
  const guides: SnapGuide[] = [];
  // x first, so the order a consumer renders and a spec reads is the axis
  // order and not whichever matched.
  if (x) {
    guides.push(guideFor(x, 'x', moved));
  }
  if (y) {
    guides.push(guideFor(y, 'y', moved));
  }
  return { position, guides, acquired: true };
};

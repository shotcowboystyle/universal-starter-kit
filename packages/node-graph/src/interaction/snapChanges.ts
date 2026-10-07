/**
 * Snapping wired into `onNodesChange`, design §7.2 rules S1, S3, S5, S6 and S11.
 *
 * Pure, and deliberately structural about its inputs: it names no `@xyflow`
 * type, so it runs under Node and the boundary in `react-flow/xy.ts` stays the
 * only import site. `SnapChange` and `SnapChangeNode` are the shape React Flow
 * happens to hand us, written down rather than imported.
 *
 * The three decisions worth reading before changing anything here:
 *
 *  - **A live drag only (S1).** A programmatic move — layout, undo, paste — is
 *    never snapped, or a relayout fights itself.
 *
 *    S1's wording says `dragging === true` and nothing else. Taken literally
 *    that undoes every snap at the moment of release, and it was MEASURED
 *    doing so in Chrome on `NodeGraph/Snapping → ZoomThreshold`: mid-drag the
 *    node sat at the aligned 370 with a guide painted, and on mouseup it
 *    jumped back off the line. The mechanism is `XYDrag`'s `end` handler
 *    (`@xyflow/system/dist/esm/index.js:2311-2316`) calling
 *    `updateNodePositions(dragItems, false)`, which re-emits the position
 *    XYDrag derived from the raw pointer (`:2154`, `x - dragItem.distance.x`).
 *    Those drag items never saw our rewrite, so the closing frame is the
 *    unsnapped one and it is also the frame the document commits.
 *
 *    So the rule as built is: a position change is snapped when it belongs to
 *    a LIVE drag — `dragging: true`, or the `dragging: false` frame that
 *    closes a drag this session was already snapping. A change with `dragging`
 *    undefined is still never snapped, and neither is a `dragging: false`
 *    change with no live session, which is what a stray programmatic set looks
 *    like. That keeps S1's intent and makes the snap survive the mouse button
 *    coming up.
 *  - **The index is a drag, not a frame (S3).** It is built once, on the first
 *    dragging change, from every node NOT in the dragged set, and lives in a
 *    `SnapSession` the caller owns. Rebuilding it per frame is the difference
 *    between a query and a re-scan of the whole graph 120 times a second.
 *  - **Grid first, alignment per axis (S5).** The grid runs on the union rect,
 *    then alignment runs from THERE, and an axis keeps its grid value unless a
 *    guide fired on it. Running alignment from the raw pointer instead would
 *    make a node the grid carried into range fail to align, which reads as the
 *    snap being flaky rather than as two rules composing.
 */

import type { NodeId, Rect, XY } from '../model/document';
import { unionBounds } from '../model/select';

import { alignmentThreshold, defaultCandidateRadius, defaultSnapThresholdPx, snapToAlignment } from './snapAlignment';
import type { PositionedNode, SnapGuide } from './snapAlignment';
import { buildSpatialHash } from './spatialHash';
import type { SpatialHash, SpatialItem } from './spatialHash';

/** Alignment on, grid off — React Flow's own `snapToGrid` defaults off too. */
export const graphSnappingDefaults = {
  alignment: true,
  grid: null,
} as const;

export interface GraphSnappingOptions {
  /**
   * Design §7.2. Off per node via `node.locked`, which React Flow enforces
   * upstream by refusing to drag a locked node at all.
   */
  readonly alignment?: boolean;
  /** Flow units, or `null` for no grid. */
  readonly grid?: number | null;
  /** SCREEN px. Divided by the zoom before use (S2). */
  readonly thresholdScreenPx?: number;
}

/** The subset of a React Flow node change this reads. */
export interface SnapChange {
  readonly type: string;
  readonly id?: NodeId;
  readonly position?: XY;
  readonly dragging?: boolean;
}

/** The subset of a React Flow node this reads, seeded or measured. */
export interface SnapChangeNode {
  readonly id: NodeId;
  readonly position: XY;
  readonly measured?: { readonly width?: number | null; readonly height?: number | null };
  readonly width?: number | null;
  readonly height?: number | null;
  readonly initialWidth?: number | null;
  readonly initialHeight?: number | null;
}

/**
 * The drag's memory. The caller holds one (a ref) and hands it back every
 * frame; nothing here is global, so two canvases on one page cannot share an
 * index built from the other's nodes.
 */
export interface SnapSession {
  index: SpatialHash | null;
  nodes: ReadonlyMap<NodeId, PositionedNode> | null;
  /** The dragged id set this index was built against. */
  key: string | null;
  /** Diagnostic: how many times the index was built. One per drag. */
  builds: number;
}

export interface SnapContext {
  readonly nodes: readonly SnapChangeNode[];
  readonly zoom: number;
  readonly session: SnapSession;
  readonly alignment?: boolean;
  readonly grid?: number | null;
  readonly thresholdScreenPx?: number;
  readonly radius?: number;
  /** Test seam. The spy that proves S3, and nothing else uses it. */
  readonly buildIndex?: (items: readonly SpatialItem[]) => SpatialHash;
}

export interface SnapChangesResult<C> {
  /** The input array itself when nothing moved, so React sees no new work. */
  readonly changes: readonly C[];
  readonly guides: readonly SnapGuide[];
}

export function createSnapSession(): SnapSession {
  return { index: null, nodes: null, key: null, builds: 0 };
}

export function resetSnapSession(session: SnapSession): void {
  session.index = null;
  session.nodes = null;
  session.key = null;
}

/**
 * S11, stated as code: motion settings reach `animateGuides` and nothing else.
 *
 * Snapping is not motion. `animation: "none"` and OS reduced-motion turn off
 * the guide's fade; a canvas where the node stops aligning because someone
 * turned animations off is a different, worse editor.
 */
export function snapContextOptions(input: {
  readonly snapping?: GraphSnappingOptions;
  readonly animation?: string | null;
  readonly reducedMotion?: boolean;
  readonly coarsePointer?: boolean;
}): {
  readonly alignment: boolean;
  readonly grid: number | null;
  readonly thresholdScreenPx: number;
  readonly animateGuides: boolean;
} {
  const { snapping, animation, reducedMotion, coarsePointer } = input;
  return {
    alignment: snapping?.alignment ?? graphSnappingDefaults.alignment,
    grid: snapping?.grid ?? graphSnappingDefaults.grid,
    thresholdScreenPx:
      snapping?.thresholdScreenPx ?? (coarsePointer ? defaultSnapThresholdPx.coarse : defaultSnapThresholdPx.fine),
    animateGuides: animation !== 'none' && !reducedMotion,
  };
}

/** Measured wins, then a document-set size, then the pre-paint seed (design §5). */
export function snapNodeRect(node: SnapChangeNode): Rect {
  const width = node.measured?.width ?? node.width ?? node.initialWidth ?? 0;
  const height = node.measured?.height ?? node.height ?? node.initialHeight ?? 0;
  return { x: node.position.x, y: node.position.y, width, height };
}

function isDragFrame(change: SnapChange): boolean {
  return change.type === 'position' && change.dragging === true && change.position !== undefined;
}

/** The closing frame of a drag we were already snapping. See the note above. */
function isDragEnd(change: SnapChange): boolean {
  return change.type === 'position' && change.dragging === false && change.position !== undefined;
}

function snapToGrid(value: number, grid: number | null): number {
  if (grid === null || !Number.isFinite(grid) || grid <= 0) {
    return value;
  }
  return Math.round(value / grid) * grid;
}

export function applySnapToChanges<C extends SnapChange>(
  changes: readonly C[],
  context: SnapContext,
): SnapChangesResult<C> {
  const alignment = context.alignment ?? graphSnappingDefaults.alignment;
  const grid = context.grid ?? graphSnappingDefaults.grid;
  const { session } = context;

  // A drag that ended takes its index with it: by the next one the world has
  // moved, and a stale index aligns to where a node used to be. The reset is
  // at the BOTTOM, because the closing frame is snapped with that same index.
  const ending = changes.some(isDragEnd);
  // `key !== null` is the whole test for "we were snapping this drag". A
  // `dragging: false` change arriving without one is not a release, it is
  // someone else's position write.
  const closable = ending && session.key !== null;
  const isSnappable = (change: SnapChange) => isDragFrame(change) || (closable && isDragEnd(change));

  const dragging = changes.filter(isSnappable);
  if (dragging.length === 0) {
    if (ending) {
      resetSnapSession(session);
    }
    return { changes, guides: [] };
  }
  if (!alignment && grid === null) {
    if (ending) {
      resetSnapSession(session);
    }
    return { changes, guides: [] };
  }

  const sizes = new Map(context.nodes.map((node) => [node.id, node]));
  const draggedIds: NodeId[] = [];
  const rects: Rect[] = [];
  for (const change of dragging) {
    const { id } = change;
    if (id === undefined) {
      continue;
    }
    draggedIds.push(id);
    const known = sizes.get(id);
    const size = known ? snapNodeRect(known) : { width: 0, height: 0 };
    // The proposed position, not the node's last committed one: the union has
    // to be where the pointer is putting the selection this frame.
    const proposed = change.position!;
    rects.push({ x: proposed.x, y: proposed.y, width: size.width, height: size.height });
  }
  const union = unionBounds(rects);
  if (!union) {
    if (ending) {
      resetSnapSession(session);
    }
    return { changes, guides: [] };
  }

  const gridded: Rect = { ...union, x: snapToGrid(union.x, grid), y: snapToGrid(union.y, grid) };

  let position: XY = { x: gridded.x, y: gridded.y };
  let guides: readonly SnapGuide[] = [];

  if (alignment) {
    const key = [...draggedIds].sort().join(' ');
    if (session.index === null || session.nodes === null || session.key !== key) {
      const dragged = new Set(draggedIds);
      const items: SpatialItem[] = [];
      const live = new Map<NodeId, PositionedNode>();
      for (const node of context.nodes) {
        if (dragged.has(node.id)) {
          continue;
        }
        const item = { id: node.id, rect: snapNodeRect(node) };
        items.push(item);
        live.set(node.id, item);
      }
      session.index = (context.buildIndex ?? buildSpatialHash)(items);
      session.nodes = live;
      session.key = key;
      session.builds += 1;
    }
    const result = snapToAlignment({
      ids: draggedIds,
      rect: gridded,
      nodes: session.nodes,
      index: session.index,
      thresholdFlowUnits: alignmentThreshold({
        thresholdScreenPx: context.thresholdScreenPx ?? defaultSnapThresholdPx.fine,
        zoom: context.zoom,
      }),
      radius: context.radius ?? defaultCandidateRadius,
    });
    guides = result.guides;
    // Per axis, and only where a guide fired (S5).
    if (guides.some((guide) => guide.axis === 'x')) {
      position = { ...position, x: result.position.x };
    }
    if (guides.some((guide) => guide.axis === 'y')) {
      position = { ...position, y: result.position.y };
    }
  }

  // The guides go the moment the drag does (S10). The POSITION still moves, or
  // the node would jump off the line the guide just promised it.
  const visible = ending ? [] : guides;
  const dx = position.x - union.x;
  const dy = position.y - union.y;
  if (dx === 0 && dy === 0) {
    if (ending) {
      resetSnapSession(session);
    }
    return { changes, guides: visible };
  }

  // ONE delta, applied to every member, so the selection cannot deform (S6).
  const next = changes.map((change) => {
    if (!isSnappable(change)) {
      return change;
    }
    const from = change.position!;
    return { ...change, position: { x: from.x + dx, y: from.y + dy } };
  });
  if (ending) {
    resetSnapSession(session);
  }
  return { changes: next, guides: visible };
}

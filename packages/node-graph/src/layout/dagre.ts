/**
 * The dagre adapter: pure, headless, and the only engine in the package.
 *
 * Pure so it can run in three realms that share nothing — the main thread, a
 * classic Worker built from `worker.generated.ts`, and the Hermes JS thread on
 * native. Headless is not a claim, it is asserted: `layout.spec.ts` stubs
 * `document` and `window` to `undefined` for every case, because a stray DOM
 * reach here would surface as a runtime error inside a Worker, which is the
 * least debuggable place in this package.
 *
 * Three things this file is responsible for that dagre is not:
 *
 *  - **Centres to top-left.** dagre reports a node's CENTRE. Documents and
 *    React Flow both hold top-left. Converting at the boundary is why nothing
 *    downstream has to know dagre's convention.
 *  - **Determinism.** dagre's own result depends on insertion order, so nodes
 *    and edges are sorted by id before they go in. Without that, two
 *    structurally equal documents that were BUILT differently lay out
 *    differently, and the "same input twice" assertion would pass while the
 *    real property failed.
 *  - **The anchor.** A tidy that teleports the graph to the origin looks like
 *    a crash. The laid-out bounding box's top-left is translated back onto the
 *    top-left the moved set already occupied, so the arrangement changes and
 *    the location does not.
 *
 * Design §8. Licence: dagre is MIT, compatible with this repo's Apache-2.0 —
 * unlike elkjs, whose `EPL-2.0 OR GPL-3.0-or-later` is decision D2 and is
 * still unruled, which is why there is no second engine here.
 */

import { Graph, layout as runDagre } from '@dagrejs/dagre';

import type { NodeId, XY } from '../model/document';

import { ensureStructuredClone } from './structuredCloneShim';
import type { LayoutNodeInput, LayoutRequest, LayoutResult } from './types';

/** dagre's own defaults are 50 / 50; these are tuned for the node measures. */
export const defaultLayoutSpacing = {
  direction: 'TB',
  nodeSpacing: 60,
  rankSpacing: 90,
  edgeSpacing: 20,
} as const;

/**
 * `performance` where it exists, `Date` otherwise.
 *
 * Both are present in a Worker and on Hermes, but neither is guaranteed by the
 * type system in a file that must not assume a realm, and a timing helper is
 * the last place worth throwing from.
 */
function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

/** 2 dp, matching `serializeDocument`, so a laid-out document diffs clean. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function byId<T extends { readonly id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function minPoint(points: readonly XY[]): XY {
  let x = Number.POSITIVE_INFINITY;
  let y = Number.POSITIVE_INFINITY;
  for (const point of points) {
    if (point.x < x) {
      x = point.x;
    }
    if (point.y < y) {
      y = point.y;
    }
  }
  return { x, y };
}

export function layoutWithDagre(request: LayoutRequest): LayoutResult {
  // dagre 3.1.1 calls `structuredClone` on the positioning hot path, and
  // neither Hermes nor a pre-15.4 WKWebView has one. See the shim's header:
  // this was found by running the bundled worker, not by reading a changelog.
  ensureStructuredClone();
  const started = now();
  const options = request.options ?? {};
  const nodes = [...request.nodes].sort(byId);

  // A subset id that names no node is dropped rather than refused: the caller
  // is usually a live selection, and a node deleted between the click and the
  // request is not an error worth failing a tidy over.
  const wanted = options.subset ? new Set(options.subset) : undefined;
  const moving: LayoutNodeInput[] = wanted ? nodes.filter((node) => wanted.has(node.id)) : nodes;
  const movingIds = new Set(moving.map((node) => node.id));

  const positions: Record<NodeId, XY> = {};
  for (const node of nodes) {
    positions[node.id] = node.position;
  }

  if (moving.length === 0) {
    return { positions, moved: [], engine: 'dagre', ms: now() - started };
  }

  const graph = new Graph({ multigraph: true, compound: false, directed: true });
  graph.setGraph({
    rankdir: options.direction ?? defaultLayoutSpacing.direction,
    nodesep: options.nodeSpacing ?? defaultLayoutSpacing.nodeSpacing,
    ranksep: options.rankSpacing ?? defaultLayoutSpacing.rankSpacing,
    edgesep: options.edgeSpacing ?? defaultLayoutSpacing.edgeSpacing,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of moving) {
    graph.setNode(node.id, { width: node.width, height: node.height });
  }
  // Only edges with BOTH ends in the moving set. An edge to a fixed node would
  // otherwise reintroduce that node as a rank participant, which is the exact
  // thing `subset` promises not to do.
  for (const edge of [...request.edges].sort(byId)) {
    if (!movingIds.has(edge.source) || !movingIds.has(edge.target)) {
      continue;
    }
    graph.setEdge(edge.source, edge.target, {}, edge.id);
  }

  runDagre(graph);

  const laid: Record<NodeId, XY> = {};
  for (const node of moving) {
    const out = graph.node(node.id) as { x?: number; y?: number } | undefined;
    laid[node.id] =
      out && Number.isFinite(out.x) && Number.isFinite(out.y)
        ? // Centre → top-left.
          { x: out.x! - node.width / 2, y: out.y! - node.height / 2 }
        : node.position;
  }

  const before = minPoint(moving.map((node) => node.position));
  const after = minPoint(moving.map((node) => laid[node.id]));
  const shiftX = before.x - after.x;
  const shiftY = before.y - after.y;

  for (const node of moving) {
    positions[node.id] = {
      x: round2(laid[node.id].x + shiftX),
      y: round2(laid[node.id].y + shiftY),
    };
  }

  return {
    positions,
    moved: moving.map((node) => node.id),
    engine: 'dagre',
    ms: now() - started,
  };
}

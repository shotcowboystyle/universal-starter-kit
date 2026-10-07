/**
 * `layout()` — a document in, positions out, off the main thread where the
 * platform allows one. Design §8.
 *
 * Three things live here rather than in `runner.ts`, because they are about
 * the DOCUMENT and the runner deliberately knows nothing about one:
 *
 *  - `buildLayoutRequest` turns a document plus a schema into boxes. The
 *    width and height it uses are the SEEDED measure (design §5) — the same
 *    numbers `toFlowNodes` gives React Flow before first paint. dagre runs on
 *    another thread and could not read the DOM even if it wanted to, so the
 *    seed is not an approximation here, it is the only measurement available,
 *    and using the same function is what stops the tidy and the paint
 *    disagreeing about how big a node is.
 *  - `reconcilePositions` is the generation guard. A result that arrives after
 *    the user has dragged something applies to every node EXCEPT the ones
 *    touched since the request went out. Dropping the whole result instead
 *    would make a relayout feel like it silently failed, which design §8 calls
 *    out by name.
 *  - `layout()` itself, which is a Promise on every runner.
 */

import type { NodeId, Size, XY } from '../model/document';
import type { EdgeKindDefs, GraphDocument, GraphSchema, NodeKindDefs } from '../model/index';
import { nodeKindSpec, resolvePorts } from '../model/index';
import type { GraphNodeSizeKnob } from '../nodes/nodeMeasure';
import { FINE_PORT_PITCH, graphNodeMeasure, portSpacing } from '../nodes/nodeMeasure';

import { getLayoutRunner } from './runner';
import type { LayoutRunnerOptions } from './runner';
import type { LayoutOptions, LayoutRequest, LayoutResult } from './types';

export interface GraphLayoutOptions extends LayoutOptions {
  /** The resolved `size` knob, so the boxes match the painted nodes. */
  readonly size?: GraphNodeSizeKnob;
  /** Touch surface: a wider port pitch, and so a taller height floor. */
  readonly coarsePointer?: boolean;
  /**
   * Live boxes React Flow's ResizeObserver has already reported.
   *
   * They BEAT the seed, and the difference is visible rather than academic.
   * Measured in Chrome on `NodeGraph/AutoLayout → Main`: the demo kinds seed a
   * 72 px `minHeight` and paint 144-192 px, so a tidy on the seed put ranks
   * 18 flow units apart where `rankSpacing` asked for 90 — a correct layout of
   * boxes that are not the boxes on screen. Design §5 says the observer
   * CORRECTS the seed; this is the layout half of taking that correction.
   *
   * Absent for a node React Flow has not measured yet, which is why the seed
   * stays the fallback rather than being replaced.
   */
  readonly measured?: Readonly<Record<NodeId, Size>>;
  readonly runner?: LayoutRunnerOptions;
}

export function buildLayoutRequest<N extends NodeKindDefs, E extends EdgeKindDefs>(
  document: GraphDocument<N, E>,
  schema: GraphSchema<N, E>,
  options: GraphLayoutOptions = {},
): LayoutRequest {
  const { size = 'medium', coarsePointer = false, measured } = options;
  const portSpacingPx = coarsePointer ? portSpacing({ coarsePointer }) : FINE_PORT_PITCH;
  return {
    nodes: document.nodes.map((node) => {
      const measure = graphNodeMeasure({
        size,
        ports: resolvePorts(schema, node),
        portSpacingPx,
        measure: nodeKindSpec(schema, node.kind)?.measure,
      });
      // Three sources, most trustworthy first: what the DOCUMENT says (a user
      // resized it), what the browser MEASURED, then the seed.
      const painted = measured?.[node.id];
      return {
        id: node.id,
        width: node.size?.width ?? painted?.width ?? measure.width,
        height: node.size?.height ?? painted?.height ?? measure.minHeight,
        position: node.position,
      };
    }),
    edges: document.edges.map((edge) => ({
      id: edge.id,
      source: edge.source.node,
      target: edge.target.node,
    })),
    options: {
      direction: options.direction,
      nodeSpacing: options.nodeSpacing,
      rankSpacing: options.rankSpacing,
      edgeSpacing: options.edgeSpacing,
      subset: options.subset,
    },
  };
}

/**
 * The result minus everything the user has touched since it was requested.
 *
 * Not "discard the result if anything moved". A 200-node tidy that silently
 * does nothing because one node was nudged mid-flight is indistinguishable
 * from a broken button.
 */
export function reconcilePositions(result: LayoutResult, touched: ReadonlySet<NodeId>): Readonly<Record<NodeId, XY>> {
  if (touched.size === 0) {
    return result.positions;
  }
  const positions: Record<NodeId, XY> = {};
  for (const [id, point] of Object.entries(result.positions)) {
    if (touched.has(id)) {
      continue;
    }
    positions[id] = point;
  }
  return positions;
}

export async function layout<N extends NodeKindDefs, E extends EdgeKindDefs>(
  document: GraphDocument<N, E>,
  schema: GraphSchema<N, E>,
  options: GraphLayoutOptions = {},
): Promise<LayoutResult> {
  const runner = await getLayoutRunner(options.runner);
  return await runner.run(buildLayoutRequest(document, schema, options));
}

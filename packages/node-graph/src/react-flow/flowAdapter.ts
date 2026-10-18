/**
 * Document → React Flow arrays. Pure, so the mapping can be asserted without
 * mounting anything.
 *
 * Two things happen here that cannot happen later:
 *
 *  - **Size seeding (design §5).** Every node carries `width` / `height` from
 *    `graphNodeMeasure` BEFORE first paint, so React Flow's per-node
 *    `ResizeObserver` CORRECTS a measurement rather than discovering one. On a
 *    200-node knob flip that is the difference between 200 observer callbacks
 *    resizing the world and 200 confirming it.
 *  - **The edge marker.** `markerEnd` on the edge OBJECT, because React Flow
 *    builds its `<marker>` defs from the edges array. Choosing it inside the
 *    edge component is too late — measured in task 1.10, where the arrowheads
 *    painted and the lines did not.
 */

import { edgeMarkerEnd } from '../edges/edgeStyle';
import { graphEdgeType } from '../edges/GraphEdge';
import type {
  EdgeKindDefs,
  GraphDocument,
  GraphEdgeOf,
  GraphNodeOf,
  GraphSchema,
  NodeKindDefs,
  PortSpec,
} from '../model/index';
import { nodeKindSpec, resolvePorts } from '../model/index';
import type { GraphNodeSizeKnob } from '../nodes/nodeMeasure';
import { graphNodeMeasure } from '../nodes/nodeMeasure';

import type { Edge, Node } from './xy';

/**
 * What the registered node component receives as `props.data`.
 *
 * A type ALIAS, not an interface. React Flow constrains node data to
 * `Record<string, unknown>`, and TypeScript gives an alias an implicit index
 * signature while an interface has none — so `interface GraphFlowNodeData`
 * does not satisfy `Node<T>` and every call site needs a cast. Same rule that
 * governs the kind maps in `edges/edgeKinds.ts`, and it bites the same way.
 */
export type GraphFlowNodeData = {
  readonly kind: string;
  /** The consumer's own node payload. */
  readonly data: unknown;
  readonly ports: readonly PortSpec[];
  /** `NodeKindSpec.intent`, so a kind can carry a semantic colour. */
  readonly intent?: string;
  readonly locked?: boolean;
};

export interface FlowMappingOptions {
  /** The resolved `size` knob; picks the per-kind measure row. */
  readonly size: GraphNodeSizeKnob;
  /** `portSpacing({ coarsePointer })`, so the height floor matches the paint. */
  readonly portSpacingPx: number;
  /** One React Flow node type name, registered by `NodeGraphWeb`. */
  readonly nodeType: string;
}

export function toFlowNodes<N extends NodeKindDefs, E extends EdgeKindDefs>(
  document: GraphDocument<N, E>,
  schema: GraphSchema<N, E>,
  options: FlowMappingOptions,
): Node<GraphFlowNodeData>[] {
  return document.nodes.map((node) => flowNode(node, schema, options));
}

function flowNode<N extends NodeKindDefs, E extends EdgeKindDefs>(
  node: GraphNodeOf<N>,
  schema: GraphSchema<N, E>,
  options: FlowMappingOptions,
): Node<GraphFlowNodeData> {
  const spec = nodeKindSpec(schema, node.kind);
  const ports = resolvePorts(schema, node);
  const measured = graphNodeMeasure({
    size: options.size,
    // `PortSpec` is structurally the `GraphNodePort` the measure table reads:
    // it adds `index`, `dataType` and `arity`, none of which move a number.
    ports,
    portSpacingPx: options.portSpacingPx,
    measure: spec?.measure,
  });
  return {
    id: node.id,
    type: options.nodeType,
    position: node.position,
    // `initialWidth` / `initialHeight`, NOT `width` / `height`.
    //
    // Measured in Chrome on `NodeGraph/NodeGraph → Main`: React Flow treats
    // `width` / `height` as USER-SET dimensions and writes them as a hard CSS
    // size, so a 72 px seed CLAMPED every node to 72 px and the Tamagui body —
    // which is `overflow: visible` by §7.1 H6 — painted right through the
    // bottom of its own frame and out of the pane. `initialWidth` is the
    // dimension React Flow uses only until its ResizeObserver reports a real
    // one, which is exactly design §5's "the observer corrects rather than
    // discovers". A node the DOCUMENT sizes is a different thing: that is a
    // user-set dimension and it stays `width` / `height`.
    initialWidth: measured.width,
    initialHeight: measured.minHeight,
    width: node.size?.width,
    height: node.size?.height,
    parentId: node.parent,
    draggable: node.locked ? false : undefined,
    data: {
      kind: node.kind,
      data: node.data,
      ports,
      intent: spec?.intent,
      locked: node.locked,
    },
  };
}

export function toFlowEdges<N extends NodeKindDefs, E extends EdgeKindDefs>(
  document: GraphDocument<N, E>,
  schema: GraphSchema<N, E>,
): Edge[] {
  return document.edges.map((edge) => flowEdge(edge, schema));
}

function flowEdge<N extends NodeKindDefs, E extends EdgeKindDefs>(
  edge: GraphEdgeOf<E>,
  schema: GraphSchema<N, E>,
): Edge {
  const spec = (schema.edges as Record<string, { appearance?: string } | undefined>)[edge.kind];
  const appearance = spec?.appearance;
  return {
    id: edge.id,
    // ONE registered type, switching on the model kind internally (design §4.4).
    type: graphEdgeType,
    source: edge.source.node,
    sourceHandle: edge.source.port,
    target: edge.target.node,
    targetHandle: edge.target.port,
    markerEnd: edgeMarkerEnd({ kind: edge.kind, appearance }),
    data: { kind: edge.kind, appearance, label: edge.label },
  };
}

/**
 * Carry React Flow's own transient node flags across a re-derive.
 *
 * `selected` and `dragging` live in React Flow's array, not in the document —
 * selecting a node is not an edit. Re-deriving from the document would drop
 * them, so a click would deselect itself the moment anything committed.
 */
export function preserveFlowState(
  next: Node<GraphFlowNodeData>[],
  previous: readonly Node<GraphFlowNodeData>[],
): Node<GraphFlowNodeData>[] {
  if (previous.length === 0) {
    return next;
  }
  const before = new Map(previous.map((node) => [node.id, node]));
  return next.map((node) => {
    const prior = before.get(node.id);
    if (!prior) {
      return node;
    }
    return {
      ...node,
      selected: prior.selected,
      dragging: prior.dragging,
      // A measured node keeps its measurement. The seed is a starting guess,
      // and handing the guess back on every commit makes the observer
      // re-measure the whole canvas each time anything is edited.
      measured: prior.measured,
      initialWidth: prior.measured?.width ?? node.initialWidth,
      initialHeight: prior.measured?.height ?? node.initialHeight,
    };
  });
}

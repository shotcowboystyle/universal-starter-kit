/**
 * Commands and their inverses, design §4.5.
 *
 * An inverse-command journal, not snapshots. At 200 nodes a snapshot is ~70 KB
 * and a hundred of them is 7 MB of retained JSON for nothing.
 *
 * Two shapes carry the interesting properties. `moveNodes` carries DELTAS, so
 * coalescing two consecutive moves on the same ids is exact addition.
 * `setPositions` carries ABSOLUTES and is what auto-layout emits; its inverse
 * holds the prior absolutes, so one undo restores the whole pre-layout
 * arrangement — the property Clay reaches for the first time a tidy scrambles a
 * graph he liked.
 */

import type {
  EdgeId,
  EdgeKindDefs,
  GraphDocument,
  GraphEdgeOf,
  GraphNodeOf,
  NodeId,
  NodeKindDefs,
  XY,
} from './document';

export type GraphCommand<N extends NodeKindDefs, E extends EdgeKindDefs> =
  | { readonly t: 'addNodes'; readonly nodes: readonly GraphNodeOf<N>[]; readonly at?: number }
  | { readonly t: 'removeNodes'; readonly ids: readonly NodeId[] }
  | { readonly t: 'moveNodes'; readonly deltas: Readonly<Record<NodeId, XY>> }
  | { readonly t: 'setPositions'; readonly positions: Readonly<Record<NodeId, XY>> }
  | { readonly t: 'setNodeData'; readonly id: NodeId; readonly data: unknown }
  | { readonly t: 'addEdges'; readonly edges: readonly GraphEdgeOf<E>[]; readonly at?: number }
  | { readonly t: 'removeEdges'; readonly ids: readonly EdgeId[] }
  | { readonly t: 'setEdgeData'; readonly id: EdgeId; readonly data: unknown }
  | { readonly t: 'batch'; readonly commands: readonly GraphCommand<N, E>[] };

const noop = <N extends NodeKindDefs, E extends EdgeKindDefs>(): GraphCommand<N, E> => ({
  t: 'batch',
  commands: [],
});

const insert = <T>(list: readonly T[], items: readonly T[], at: number | undefined): T[] => {
  if (at === undefined || at >= list.length) {
    return [...list, ...items];
  }
  const copy = [...list];
  copy.splice(Math.max(0, at), 0, ...items);
  return copy;
};

export const applyCommand = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  doc: GraphDocument<N, E>,
  command: GraphCommand<N, E>,
): GraphDocument<N, E> => {
  switch (command.t) {
    case 'addNodes': {
      return { ...doc, nodes: insert(doc.nodes, command.nodes, command.at) };
    }

    case 'removeNodes': {
      const gone = new Set(command.ids);
      return {
        ...doc,
        nodes: doc.nodes.filter((node) => !gone.has(node.id)),
        // An edge whose end has been deleted is not a partial graph, it is a
        // broken one, so a node takes its edges with it. `invertCommand`
        // restores both, in their original places.
        edges: doc.edges.filter((edge) => !gone.has(edge.source.node) && !gone.has(edge.target.node)),
      };
    }

    case 'moveNodes': {
      const { deltas } = command;
      return {
        ...doc,
        nodes: doc.nodes.map((node) => {
          const delta = deltas[node.id];
          return delta === undefined
            ? node
            : { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } };
        }),
      };
    }

    case 'setPositions': {
      const { positions } = command;
      return {
        ...doc,
        nodes: doc.nodes.map((node) => {
          const position = positions[node.id];
          return position === undefined ? node : { ...node, position };
        }),
      };
    }

    case 'setNodeData': {
      return {
        ...doc,
        nodes: doc.nodes.map((node) =>
          // SAFETY: the command was built for this node's kind, so `data` matches that kind's payload type.
          node.id === command.id ? ({ ...node, data: command.data } as GraphNodeOf<N>) : node,
        ),
      };
    }

    case 'addEdges': {
      return { ...doc, edges: insert(doc.edges, command.edges, command.at) };
    }

    case 'removeEdges': {
      const gone = new Set(command.ids);
      return { ...doc, edges: doc.edges.filter((edge) => !gone.has(edge.id)) };
    }

    case 'setEdgeData': {
      return {
        ...doc,
        edges: doc.edges.map((edge) =>
          // SAFETY: the command was built for this edge's kind, so `data` matches that kind's payload type.
          edge.id === command.id ? ({ ...edge, data: command.data } as GraphEdgeOf<E>) : edge,
        ),
      };
    }

    case 'batch': {
      let current = doc;
      for (const step of command.commands) {
        current = applyCommand(current, step);
      }
      return current;
    }

    default: {
      const exhausted: never = command;
      return exhausted;
    }
  }
};

/**
 * `0 - v`, not `-v`. Negating a zero component gives -0, and `Object.is(-0, 0)`
 * is false — so an inverse of a purely horizontal drag would not compare equal
 * to the same command written by hand, and two structurally identical journal
 * entries would diff. `0 - 0` is 0 and every other value negates as usual.
 */
const negate = (deltas: Readonly<Record<NodeId, XY>>): Record<NodeId, XY> => {
  const out: Record<NodeId, XY> = {};
  for (const [id, delta] of Object.entries(deltas)) {
    out[id] = { x: 0 - delta.x, y: 0 - delta.y };
  }
  return out;
};

/**
 * One insert per item, at its ORIGINAL index, ascending. Applied in that
 * order each insert shifts the ones after it into place, so the arrays
 * come back identical — not merely with the same members. React Flow
 * paints later nodes on top, so order is a visible property.
 */
const restoreRemovedNodes = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  doc: GraphDocument<N, E>,
  gone: ReadonlySet<NodeId>,
): GraphCommand<N, E> => {
  const restores: GraphCommand<N, E>[] = [];
  for (const [at, node] of doc.nodes.entries()) {
    if (gone.has(node.id)) {
      restores.push({ t: 'addNodes', nodes: [node], at });
    }
  }
  for (const [at, edge] of doc.edges.entries()) {
    if (gone.has(edge.source.node) || gone.has(edge.target.node)) {
      restores.push({ t: 'addEdges', edges: [edge], at });
    }
  }
  return { t: 'batch', commands: restores };
};

const restoreRemovedEdges = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  doc: GraphDocument<N, E>,
  gone: ReadonlySet<EdgeId>,
): GraphCommand<N, E> => {
  const restores: GraphCommand<N, E>[] = [];
  for (const [at, edge] of doc.edges.entries()) {
    if (gone.has(edge.id)) {
      restores.push({ t: 'addEdges', edges: [edge], at });
    }
  }
  return { t: 'batch', commands: restores };
};

export const invertCommand = <N extends NodeKindDefs, E extends EdgeKindDefs>(
  doc: GraphDocument<N, E>,
  command: GraphCommand<N, E>,
): GraphCommand<N, E> => {
  switch (command.t) {
    case 'addNodes': {
      return { t: 'removeNodes', ids: command.nodes.map((node) => node.id) };
    }

    case 'removeNodes': {
      return restoreRemovedNodes(doc, new Set(command.ids));
    }

    case 'moveNodes': {
      return { t: 'moveNodes', deltas: negate(command.deltas) };
    }

    case 'setPositions': {
      const before: Record<NodeId, XY> = {};
      for (const node of doc.nodes) {
        if (node.id in command.positions) {
          before[node.id] = node.position;
        }
      }
      return { t: 'setPositions', positions: before };
    }

    case 'setNodeData': {
      const node = doc.nodes.find((candidate) => candidate.id === command.id);
      // No prior data to restore, so no-op rather than inventing one.
      return node ? { t: 'setNodeData', id: command.id, data: node.data } : noop<N, E>();
    }

    case 'addEdges': {
      return { t: 'removeEdges', ids: command.edges.map((edge) => edge.id) };
    }

    case 'removeEdges': {
      return restoreRemovedEdges(doc, new Set(command.ids));
    }

    case 'setEdgeData': {
      const edge = doc.edges.find((candidate) => candidate.id === command.id);
      return edge ? { t: 'setEdgeData', id: command.id, data: edge.data } : noop<N, E>();
    }

    case 'batch': {
      // Each step is inverted against the document it will actually meet, and
      // the list runs backwards. Inverting them all against `doc` would be
      // wrong the moment two steps touch the same node.
      const inverses: GraphCommand<N, E>[] = [];
      let current = doc;
      for (const step of command.commands) {
        inverses.push(invertCommand(current, step));
        current = applyCommand(current, step);
      }
      return { t: 'batch', commands: inverses.toReversed() };
    }

    default: {
      const exhausted: never = command;
      return exhausted;
    }
  }
};

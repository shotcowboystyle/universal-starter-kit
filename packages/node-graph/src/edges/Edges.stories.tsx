/**
 * NodeGraph/Edges — the four kinds side by side, plus a refused connection with
 * its real message.
 *
 * The canvas mounts `ReactFlow` directly rather than `NodeGraphWeb`, which is
 * task 1.11's. Nodes are React Flow's own default type for the same reason:
 * this story is about the EDGES, and pulling in `GraphNode` (task 1.8) would
 * make it fail for reasons that have nothing to do with them.
 */

import '@xyflow/react/dist/style.css';
// The package's own published stylesheet. Task 1.11's `NodeGraphWeb` imports it
// for real consumers; a story that mounts `ReactFlow` directly imports it here.
import '../../css/graph.css';

import { YStack, SizableText, View } from 'tamagui';

import { legalTargets } from '../interaction/legalTargets';
import { useKnobEnvelope } from '../knobs/useKnobEnvelope';
// Relative, not `@repo/node-graph/model`: the subpath resolves
// into `dist/`, which a source-consumed workspace package never builds.
import { createGraphSchema, defaultRules, resolvePorts, validateConnection } from '../model/index';
import type { GraphDocument } from '../model/index';
import { domOnlyStoryDecorator } from '../native/DomOnlyStory';
import { connectionPuckLabel } from '../react-flow/ConnectionPuck';
import { demoGraphSchema } from '../react-flow/demoNodeBody';
import { demoDocument } from '../react-flow/fixtures';
import { NodeGraphWeb } from '../react-flow/NodeGraphWeb';
import { Position, ReactFlow, ReactFlowProvider } from '../react-flow/xy';
import type { Edge, Node } from '../react-flow/xy';

import { builtinEdgeKindNames, builtinEdgeKinds } from './edgeKinds';
import type { BuiltinEdgeData, BuiltinEdgeKind } from './edgeKinds';
import { edgeMarkerEnd } from './edgeStyle';
import { graphEdgeType, graphEdgeTypes } from './GraphEdge';

export default {
  title: 'NodeGraph/Edges',
  parameters: { status: { type: 'beta' } },
  /*
    NATIVE STOPS HERE (task 6.8). These stories mount `ReactFlow` directly —
    the edge kinds are the subject, so the lanes are built by hand rather than
    through a document — and React Flow renders `div`s and `svg`s, which React
    Native answers with `View config getter callback for component "div" must
    be a function` and a dead tree.

    The edges themselves render on device inside the canvas's WebView, which is
    what `NodeGraph → NodeGraph` shows.
  */
  decorators: [
    domOnlyStoryDecorator({
      needs: 'mounts React Flow directly to build one lane per edge kind',
      readInstead: 'NodeGraph → NodeGraph, where the same typed edges render in a real document',
    }),
  ],
};

const rowHeight = 110;

/** One source/target pair per kind, stacked, so all four read at once. */
function laneNodes(labels: readonly string[]): Node[] {
  return labels.flatMap((label, row) => [
    {
      id: `s${row}`,
      position: { x: 0, y: row * rowHeight },
      data: { label },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
    {
      id: `t${row}`,
      position: { x: 320, y: row * rowHeight },
      data: { label: 'target' },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
  ]);
}

function laneEdge(kind: BuiltinEdgeKind, row: number, label?: string): Edge {
  return {
    id: `e${row}`,
    type: graphEdgeType,
    source: `s${row}`,
    target: `t${row}`,
    // The marker TYPE rides on the edge object: React Flow builds its marker
    // defs from the edges array.
    markerEnd: edgeMarkerEnd({ kind }),
    data: { kind, label },
  };
}

function Canvas({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const envelope = useKnobEnvelope();
  return (
    <View
      width="100%"
      height={rowHeight * Math.max(1, edges.length) + 60}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          edgeTypes={graphEdgeTypes}
          colorMode={envelope.scheme}
          fitView
          proOptions={{ hideAttribution: true }}
        />
      </ReactFlowProvider>
    </View>
  );
}

export const main = {
  name: 'Main',
  render: () => (
    <Canvas
      nodes={laneNodes(builtinEdgeKindNames)}
      edges={builtinEdgeKindNames.map((kind, row) => laneEdge(kind, row))}
    />
  ),
};

export const labels = {
  name: 'Labels',
  render: () => (
    <Canvas
      nodes={laneNodes(builtinEdgeKindNames)}
      edges={builtinEdgeKindNames.map((kind, row) => laneEdge(kind, row, kind))}
    />
  ),
};

// ── Refused ────────────────────────────────────────────────────
// The message is the model's, not the story's: `validateConnection` produces
// the code and the wording, and this story only shows them. A refusal invented
// here would drift from the one a user actually sees on a drop.

interface Nodes {
  readonly numberOut: Record<string, never>;
  readonly textIn: Record<string, never>;
}

const refusalSchema = createGraphSchema<Nodes, BuiltinEdgeData>({
  id: 'edges-story-refusal',
  nodes: {
    numberOut: {
      kind: 'numberOut',
      render: () => null,
      defaultData: {},
      measure: { width: 172, minHeight: 48 },
      ports: [
        { id: 'out', side: 'right', direction: 'out', dataType: 'number' },
        // An input on the SAME node, so the self-loop case below really is a
        // self loop. Without it `a.out -> a.out` reports `wrong-direction`,
        // because refuseDirection runs first — correct, but not what a story
        // captioned "onto itself" claims to be showing.
        { id: 'in', side: 'left', direction: 'in', dataType: 'number' },
      ],
    },
    textIn: {
      kind: 'textIn',
      render: () => null,
      defaultData: {},
      measure: { width: 172, minHeight: 48 },
      ports: [{ id: 'in', side: 'left', direction: 'in', dataType: 'string' }],
    },
  },
  edges: builtinEdgeKinds,
  rules: defaultRules,
});

const refusalDoc: GraphDocument<Nodes, BuiltinEdgeData> = {
  version: 1,
  nodes: [
    { id: 'a', kind: 'numberOut', position: { x: 0, y: 0 }, data: {} },
    { id: 'b', kind: 'textIn', position: { x: 320, y: 0 }, data: {} },
  ],
  edges: [],
};

const refusals = [
  {
    title: 'number → string',
    source: { node: 'a', port: 'out' },
    target: { node: 'b', port: 'in' },
  },
  { title: 'backwards', source: { node: 'b', port: 'in' }, target: { node: 'a', port: 'out' } },
  { title: 'onto itself', source: { node: 'a', port: 'out' }, target: { node: 'a', port: 'in' } },
] as const;

export const refused = {
  name: 'Refused',
  render: () => (
    <YStack
      gap="$3"
      padding="$4">
      {refusals.map(({ title, source, target }) => {
        const verdict = validateConnection({
          document: refusalDoc,
          schema: refusalSchema,
          source,
          target,
        });
        return (
          <YStack
            key={title}
            gap="$1">
            <SizableText fontWeight="600">{title}</SizableText>
            <SizableText>{verdict.ok ? 'allowed' : `${verdict.code} — ${verdict.message}`}</SizableText>
          </YStack>
        );
      })}
    </YStack>
  ),
};

/**
 * `Connecting` — legal-target magnetism and the puck that names what you are
 * over (design §7.4, task 3.5).
 *
 * DRAG from a port. Two things to watch, and they are the whole task:
 *
 *  1. The puck at the top of the canvas names the candidate — but only while
 *     the candidate is one `validateConnection` accepts. `connectionRadius` is
 *     the 44 px hit diameter (task 3.4 H5), so React Flow's magnetism will snap
 *     the drag onto a refused port quite happily; the puck refuses to promise
 *     it and falls back to naming what you are dragging FROM.
 *  2. The puck does not grow or shrink when you zoom. It renders as a sibling
 *     of `.react-flow__viewport`, so the pan/zoom matrix never reaches it.
 *
 * The table underneath is the same `connectionPuckLabel` call, run over every
 * port in the document at once, so what the puck will say is readable without
 * holding a mouse button down.
 */
const connectDoc = demoDocument();
const connectSchema = demoGraphSchema();

function everyTarget(): { node: string; port: string }[] {
  return connectDoc.nodes.flatMap((node) =>
    resolvePorts(connectSchema, node).map((spec) => ({ node: node.id, port: spec.id })),
  );
}

export const connecting = {
  name: 'Connecting',
  render: () => {
    const source = { node: 'a', port: 'rows' };
    const legal = new Set(
      legalTargets({ document: connectDoc, schema: connectSchema, source }).map((ref) => `${ref.node}:${ref.port}`),
    );
    return (
      <YStack
        gap="$5"
        padding="$4">
        <View
          width="100%"
          height={420}>
          <NodeGraphWeb
            schema={connectSchema}
            defaultDocument={connectDoc}
          />
        </View>
        <YStack gap="$2">
          <SizableText fontWeight="600">Dragging from a / rows — what the puck says over each port</SizableText>
          {everyTarget().map((target) => {
            const key = `${target.node}:${target.port}`;
            const label = connectionPuckLabel({
              document: connectDoc,
              schema: connectSchema,
              source,
              candidate: target,
            });
            return (
              <SizableText
                key={key}
                opacity={legal.has(key) ? 1 : 0.55}>
                {key} — {label?.legal ? 'MAGNETIC' : 'refused'} — {label?.text}
              </SizableText>
            );
          })}
        </YStack>
      </YStack>
    );
  },
};

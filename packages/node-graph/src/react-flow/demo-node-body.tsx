/**
 * The node body the task-1.11 spec and the `NodeGraph/NodeGraph` story both
 * mount.
 *
 * It is what a CONSUMER writes: a `NodeKindSpec.render` that composes the
 * package's `GraphNode` frame and `GraphPort` disc. Keeping it here rather than
 * inside the story is deliberate — the spec and the story then assert the same
 * tree, so a story that renders cannot be a story that renders something else.
 *
 * Its own file, and its own NAME, because `demo-node-body.tsx` beside a
 * `demoNodeBody.ts` would be ONE module on macOS. See the note in
 * `nodes/node-measure.ts`.
 */

import type { BuiltinEdgeData } from '../edges/edge-kinds';
import { builtinEdgeKinds } from '../edges/edge-kinds';
import { defaultRules } from '../model/connect';
import { createGraphSchema } from '../model/schema';
import type { GraphNodeRenderProps } from '../model/schema';
import { GraphNode } from '../nodes/GraphNode';
import { GraphPort } from '../nodes/GraphPort';
import type { GraphNodePort } from '../nodes/node-measure';

import type { DemoNodeData } from './fixtures';
import { demoSchemaSpec } from './fixtures';

interface BodyProps<TData> extends GraphNodeRenderProps<TData> {
  readonly title: string;
  readonly subtitle?: string;
  readonly intent?: string;
  readonly coarsePointer?: boolean;
}

const Body = <TData,>({
  id,
  title,
  subtitle,
  intent,
  ports,
  selected,
  dragging,
  renderMode,
  coarsePointer,
  measure,
}: BodyProps<TData>) => (
  <GraphNode
    id={id}
    title={title}
    subtitle={subtitle}
    intent={intent}
    selected={selected}
    dragging={dragging}
    renderMode={renderMode}
    coarsePointer={coarsePointer}
    // The kind's own measure, so the painted frame is the width the canvas
    // seeded React Flow with.
    measure={measure}
    // `PortSpec` is structurally the port the frame measures and labels; it
    // adds `index`, `dataType` and `arity`, none of which paint.
    // SAFETY: PortSpec is a structural superset of GraphNodePort (see above).
    ports={ports as readonly GraphNodePort[]}
    renderPort={(port) => (
      <GraphPort
        id={port.id}
        side={port.side}
        direction={port.direction}
        intent={intent}
        coarsePointer={coarsePointer}
      />
    )}
  />
);

export const DemoSourceBody = (props: GraphNodeRenderProps<DemoNodeData['source']>) => (
  <Body
    {...props}
    title="Source"
    subtitle={`table: ${props.data.table}`}
  />
);

export const DemoTransformBody = (props: GraphNodeRenderProps<DemoNodeData['transform']>) => (
  <Body
    {...props}
    title="Transform"
    subtitle={props.data.expression}
    intent="accent"
  />
);

export const DemoSinkBody = (props: GraphNodeRenderProps<DemoNodeData['sink']>) => (
  <Body
    {...props}
    title="Sink"
    subtitle={`→ ${props.data.target}`}
    intent="success"
  />
);

const bodies = {
  source: DemoSourceBody,
  transform: DemoTransformBody,
  sink: DemoSinkBody,
} as const;

/** The fixture schema with real bodies wired in. */
export const demoGraphSchema = () => {
  const spec = demoSchemaSpec();
  return createGraphSchema<DemoNodeData, BuiltinEdgeData>({
    id: spec.id,
    nodes: {
      source: { ...spec.nodes.source, render: bodies.source },
      transform: { ...spec.nodes.transform, render: bodies.transform },
      sink: { ...spec.nodes.sink, render: bodies.sink },
    },
    edges: builtinEdgeKinds,
    rules: defaultRules,
  });
};

/**
 * Design §13.2's control condition, re-exported so `@repo/node-graph/demo`
 * serves BOTH schemas from one subpath.
 *
 * The app's `'use dom'` entry is the only module that can hand a schema to the
 * canvas — a `render` is a component and cannot cross the bridge — and an entry
 * that had to reach two subpaths to register two schemas would be an entry with
 * a second way to get one of them wrong. It is a re-export rather than a second
 * export map entry for the same reason `NodeGraphDomInner` imports this file
 * statically: another `import()` in the DOM subtree makes Metro emit a shared
 * `__common` chunk, and `expo export`'s html serializer then dies while exiting
 * 0 (design §13.2).
 */
export { DemoControlBody, demoControlSchema } from './demo-control-body';

export type { PortSpec } from '../model/schema';

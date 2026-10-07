/**
 * The node body the task-1.11 spec and the `NodeGraph/NodeGraph` story both
 * mount.
 *
 * It is what a CONSUMER writes: a `NodeKindSpec.render` that composes the
 * package's `GraphNode` frame and `GraphPort` disc. Keeping it here rather than
 * inside the story is deliberate — the spec and the story then assert the same
 * tree, so a story that renders cannot be a story that renders something else.
 *
 * Its own file, and its own NAME, because `demoNodeBody.tsx` beside a
 * `demoNodeBody.ts` would be ONE module on macOS. See the note in
 * `nodes/nodeMeasure.ts`.
 */

import type { BuiltinEdgeData } from '../edges/edgeKinds';
import { builtinEdgeKinds } from '../edges/edgeKinds';
import type { GraphNodeRenderProps, PortSpec } from '../model/index';
import { createGraphSchema, defaultRules } from '../model/index';
import { GraphNode } from '../nodes/GraphNode';
import { GraphPort } from '../nodes/GraphPort';
import type { GraphNodePort } from '../nodes/nodeMeasure';

import type { DemoNodeData } from './fixtures';
import { demoSchemaShape } from './fixtures';

interface BodyProps<TData> extends GraphNodeRenderProps<TData> {
  readonly title: string;
  readonly subtitle?: string;
  readonly intent?: string;
  readonly coarsePointer?: boolean;
}

function Body<TData>({
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
}: BodyProps<TData>) {
  return (
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
}

export function DemoSourceBody(props: GraphNodeRenderProps<DemoNodeData['source']>) {
  return (
    <Body
      {...props}
      title="Source"
      subtitle={`table: ${props.data.table}`}
    />
  );
}

export function DemoTransformBody(props: GraphNodeRenderProps<DemoNodeData['transform']>) {
  return (
    <Body
      {...props}
      title="Transform"
      subtitle={props.data.expression}
      intent="accent"
    />
  );
}

export function DemoSinkBody(props: GraphNodeRenderProps<DemoNodeData['sink']>) {
  return (
    <Body
      {...props}
      title="Sink"
      subtitle={`→ ${props.data.target}`}
      intent="success"
    />
  );
}

const bodies = {
  source: DemoSourceBody,
  transform: DemoTransformBody,
  sink: DemoSinkBody,
} as const;

/** The fixture schema with real bodies wired in. */
export function demoGraphSchema() {
  const shape = demoSchemaShape();
  return createGraphSchema<DemoNodeData, BuiltinEdgeData>({
    id: shape.id,
    nodes: {
      source: { ...shape.nodes.source, render: bodies.source },
      transform: { ...shape.nodes.transform, render: bodies.transform },
      sink: { ...shape.nodes.sink, render: bodies.sink },
    },
    edges: builtinEdgeKinds,
    rules: defaultRules,
  });
}

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
export { DemoControlBody, demoControlSchema } from './demoControlBody';

export type { PortSpec };

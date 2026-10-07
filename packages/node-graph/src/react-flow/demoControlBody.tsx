/**
 * Design §13.2's plain-div CONTROL condition, as a schema the DOM bundle can
 * reach.
 *
 * The delta between this and `demoGraphSchema()` is the Tamagui cost, measured
 * on the host in front of you instead of carried over from the web's ~10%. Same
 * graph, same edges, same React Flow `Handle`s — only the node BODY changes,
 * from the package's `GraphNode` frame to a bare styled `div`. The handles stay
 * because removing them would change what React Flow itself does per node, and
 * then the two cells would not be the same experiment.
 *
 * WHY IT IS HERE AND NOT IN THE STORY, which is where it was written.
 *
 * A `NodeKindSpec.render` is a `ComponentType`, so it cannot be JSON and cannot
 * cross the bridge: the only string that crosses is `schemaId`, and the canvas
 * resolves it inside the DOM bundle. `bench/Perf200.stories.tsx` runs on the
 * Hermes side, so a schema built there is unreachable from the realm that has
 * to render it. Measured on the iPhone 16e at m6: `Perf200 → Control` reported
 * `render: no graph schema registered as "node-graph-demo-control"` and painted
 * nothing, which left §13.2's mandated control condition unmeasurable on every
 * device.
 *
 * Moving it into the package is only half the fix. The other half is that the
 * app's `'use dom'` entry can now register MORE THAN ONE schema — see
 * `NodeGraphDomRealmProps.schemas` — because an id-keyed lookup over a list is
 * the thing that scales past the single special case the inner tree carried.
 *
 * The inline styles are deliberately dumb literals off the `currentColor`
 * chain, with no token and no `useResolvedKnobs` anywhere in the subtree: a
 * control that resolved tokens would be measuring a slice of the thing it is
 * the control for.
 */

import type { BuiltinEdgeData } from '../edges/edgeKinds';
import { builtinEdgeKinds } from '../edges/edgeKinds';
import type { GraphNodeRenderProps } from '../model/index';
import { createGraphSchema, defaultRules } from '../model/index';

import type { DemoNodeData } from './fixtures';
import { demoControlSchemaId, demoSchemaShape } from './fixtures';
import { Handle, Position } from './xy';

export function DemoControlBody<TData>({
  ports,
  measure,
  title,
}: GraphNodeRenderProps<TData> & { readonly title: string }) {
  return (
    <div
      style={{
        width: measure?.width ?? 190,
        minHeight: measure?.minHeight ?? 72,
        boxSizing: 'border-box',
        border: '1px solid currentColor',
        borderRadius: 8,
        padding: 8,
        font: 'inherit',
        opacity: 0.9,
      }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {ports.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type={port.direction === 'out' ? 'source' : 'target'}
          position={port.side === 'right' ? Position.Right : Position.Left}
          style={{ top: 24 + index * 20, width: 8, height: 8, borderRadius: '50%' }}
        />
      ))}
    </div>
  );
}

/**
 * The same measures, ports and rules as the demo schema, with plain bodies.
 *
 * `demoSchemaShape()` rather than a second kind table, for the reason that
 * module already gives: a second copy is a second thing to keep in step, and a
 * control whose geometry drifted from the subject would measure two graphs.
 */
export function demoControlSchema() {
  const shape = demoSchemaShape();
  const body = (title: string) => (props: GraphNodeRenderProps<never>) => (
    <DemoControlBody
      {...props}
      title={title}
    />
  );
  return createGraphSchema<DemoNodeData, BuiltinEdgeData>({
    id: demoControlSchemaId,
    nodes: {
      source: { ...shape.nodes.source, render: body('Source') as never },
      transform: { ...shape.nodes.transform, render: body('Transform') as never },
      sink: { ...shape.nodes.sink, render: body('Sink') as never },
    },
    edges: builtinEdgeKinds,
    rules: defaultRules,
  });
}

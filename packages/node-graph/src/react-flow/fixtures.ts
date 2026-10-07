/**
 * One schema and one document, shared by the two task-1.11 specs and the story.
 *
 * A fixture module rather than a copy in each file: the story is the thing a
 * reviewer looks at, and a story that drifts from what the specs assert is a
 * story that proves nothing about the code under test.
 *
 * `.ts`, no JSX, and no component values — `NodeKindSpec.render` is filled in
 * by whoever mounts these, because the model half of the package must stay
 * importable without React (design §3.1).
 */

import type { BuiltinEdgeData } from '../edges/edgeKinds';
import { builtinEdgeKinds } from '../edges/edgeKinds';
import type { GraphDocument, GraphSchema, PortSpec } from '../model/index';
import { createGraphSchema, defaultRules } from '../model/index';

export interface DemoNodeData {
  readonly source: { readonly table: string };
  readonly transform: { readonly expression: string };
  readonly sink: { readonly target: string };
}

const out = (id: string, label: string): PortSpec => ({
  id,
  side: 'right',
  direction: 'out',
  label,
});
const into = (id: string, label: string): PortSpec => ({
  id,
  side: 'left',
  direction: 'in',
  label,
});

/** A stand-in `render`. `demoGraphSchema()` in demoNodeBody.tsx swaps in the real bodies. */
const noRender = (() => null) as unknown as never;

/**
 * The schema WITHOUT its `render` components.
 *
 * Split out so `demoNodeBody.tsx` can supply real bodies over the same
 * measures, ports and intents the model-only specs use. A second copy of the
 * kind table is a second thing to keep in step.
 */
/**
 * The id the package's OWN demo schema registers under.
 *
 * A named constant rather than a literal in two places, because it is the one
 * string that crosses the bridge: `NodeGraphDomInner` matches on it to register
 * this schema inside the DOM bundle, where a story cannot reach. See the note
 * there — a schema's `render` is a component and cannot be JSON, so the only
 * way a canvas gets one is a module the DOM bundle itself imports.
 */
export const demoGraphSchemaId = 'node-graph-demo';

/**
 * The id the plain-div CONTROL schema registers under.
 *
 * Design §13.2 asks for a control condition in every measurement session so the
 * Tamagui cost is measured rather than carried over from the web's ~10%. The
 * control lived in `bench/Perf200.stories.tsx` until the m6 device pass, and a
 * story runs on the Hermes side: only `schemaId` crosses the bridge, so on
 * device the canvas looked the id up, missed, and reported
 * `render: no graph schema registered as "node-graph-demo-control"`. The
 * control condition was therefore unmeasurable on every device.
 *
 * It is a constant here, beside the schema it names, for the same reason the
 * demo id is: it is a string two realms have to agree on.
 */
export const demoControlSchemaId = `${demoGraphSchemaId}-control`;

export function demoSchemaShape() {
  return {
    id: demoGraphSchemaId,
    nodes: {
      source: {
        kind: 'source' as const,
        ports: [out('rows', 'rows')],
        defaultData: { table: 'orders' },
        measure: { width: 190, minHeight: 72 },
      },
      transform: {
        kind: 'transform' as const,
        ports: [into('in', 'rows'), out('ok', 'ok'), out('err', 'error')],
        defaultData: { expression: 'row => row' },
        measure: { width: 190, minHeight: 72 },
        intent: 'accent',
      },
      sink: {
        kind: 'sink' as const,
        ports: [into('in', 'rows')],
        defaultData: { target: 'warehouse' },
        // 240 on purpose: it is not a value the default 172/190/216 table can
        // produce at any size stop, so a `measure` that fails to reach the
        // painted node is visible rather than coincidentally right.
        measure: { width: 240, minHeight: 72 },
        intent: 'success',
      },
    },
  };
}

export function demoSchema(): GraphSchema<DemoNodeData, BuiltinEdgeData> {
  const shape = demoSchemaShape();
  return createGraphSchema<DemoNodeData, BuiltinEdgeData>({
    id: shape.id,
    nodes: {
      source: { ...shape.nodes.source, render: noRender },
      transform: { ...shape.nodes.transform, render: noRender },
      sink: { ...shape.nodes.sink, render: noRender },
    },
    edges: builtinEdgeKinds,
    rules: defaultRules,
  });
}

type Doc = GraphDocument<DemoNodeData, BuiltinEdgeData>;

/** Three nodes, one edge. Small enough that a failing assertion names a node. */
export function demoDocument(): Doc {
  return {
    version: 1,
    nodes: [
      { id: 'a', kind: 'source', position: { x: 0, y: 0 }, data: { table: 'orders' } },
      {
        id: 'b',
        kind: 'transform',
        position: { x: 260, y: 0 },
        data: { expression: 'row => row' },
      },
      { id: 'c', kind: 'sink', position: { x: 520, y: 0 }, data: { target: 'warehouse' } },
    ],
    edges: [
      {
        id: 'a->b',
        kind: 'flow',
        source: { node: 'a', port: 'rows' },
        target: { node: 'b', port: 'in' },
        data: {},
      },
    ],
  };
}

/**
 * Twelve nodes and all four edge kinds — the `Main` story's graph, per design
 * §12.1 ("the default editor, 12 nodes, all four edge kinds").
 */
export function demoDocumentLarge(count = 12): Doc {
  const kinds = ['source', 'transform', 'sink'] as const;
  const nodes: Doc['nodes'] = Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length];
    const data =
      kind === 'source'
        ? { table: `orders_${index}` }
        : kind === 'transform'
          ? { expression: `row => row.${index}` }
          : { target: `warehouse_${index}` };
    return {
      id: `n${index}`,
      kind,
      position: { x: (index % 4) * 280, y: Math.floor(index / 4) * 200 },
      data,
    } as Doc['nodes'][number];
  });

  const edgeKinds = ['flow', 'data', 'error', 'conditional'] as const;
  const edges: Doc['edges'][number][] = [];
  for (let index = 0; index + 1 < count; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    const sourcePort = from.kind === 'source' ? 'rows' : from.kind === 'transform' ? 'ok' : null;
    if (!sourcePort) {
      continue;
    }
    edges.push({
      id: `${from.id}->${to.id}`,
      kind: edgeKinds[edges.length % edgeKinds.length],
      source: { node: from.id, port: sourcePort },
      target: { node: to.id, port: 'in' },
      data: {},
    } as Doc['edges'][number]);
  }
  return { version: 1, nodes, edges };
}

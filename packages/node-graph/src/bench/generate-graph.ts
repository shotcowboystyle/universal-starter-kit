/**
 * The bench graph: 200 nodes, ~400 edges, and the same document every time.
 *
 * Determinism is the point. Design §13.2 asks for five runs per cell and the
 * median of the per-run p95, which only means anything if the five runs are
 * looking at the same graph — and a `Math.random` scatter makes a regression
 * indistinguishable from a luckier layout. `mulberry32` is named in plan task
 * 5.1 for that reason: 32 bits of state, one multiply and two shifts, no
 * dependency, and identical output on Hermes and in V8.
 *
 * Edges only ever run FORWARD (`target index > source index`), so the graph is
 * acyclic by construction. That is not decoration: dagre ranks a cyclic graph
 * by breaking edges it picks itself, which would make the layout bench's
 * numbers depend on which edge it happened to break.
 *
 * No React and no `@xyflow` here — the model half of the package has to stay
 * importable from a CLI and from the CI bench (design §3.1), and this module is
 * imported by both the bench script and the story.
 */

import type { BuiltinEdgeData } from '../edges/edge-kinds';
import type { GraphDocument } from '../model/index';
import type { DemoNodeData } from '../react-flow/fixtures';

/** Mulberry32. Named in plan task 5.1; 32-bit state, seeded, repeatable. */
/* oxlint-disable eslint/no-bitwise -- mulberry32 is defined by its 32-bit integer shifts and xors; there is no non-bitwise spelling */
export const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};
/* oxlint-enable eslint/no-bitwise */

export interface BenchGraphOptions {
  readonly count: number;
  readonly seed?: number;
  /** Extra forward edges attempted per node that HAS an out port. 3 gives ~400 at 200. */
  readonly fanOut?: number;
  /** Flow units between grid columns and rows. Wide on purpose: culling is the thing under test. */
  readonly columns?: number;
  readonly columnGap?: number;
  readonly rowGap?: number;
}

type Doc = GraphDocument<DemoNodeData, BuiltinEdgeData>;

const kinds = ['source', 'transform', 'sink'] as const;
const edgeKinds = ['flow', 'data', 'error', 'conditional'] as const;

/** Which port a node of this kind sends from, or null when it only receives. */
const outPort = (kind: (typeof kinds)[number], pick: number): string | null => {
  if (kind === 'source') {
    return 'rows';
  }
  if (kind === 'transform') {
    return pick < 0.75 ? 'ok' : 'err';
  }
  return null;
};

const hasInPort = (kind: (typeof kinds)[number]): boolean => kind !== 'source';

/** The demo payload a node of this kind carries. */
const nodeData = (kind: (typeof kinds)[number], index: number): DemoNodeData[keyof DemoNodeData] => {
  if (kind === 'source') {
    return { table: `orders_${index}` };
  }
  if (kind === 'transform') {
    return { expression: `row => row.f${index}` };
  }
  return { target: `warehouse_${index}` };
};

/**
 * The first span at or past `span` whose node can receive and is not already a
 * target of `nodes[index]`, or a span past `forward` when none is left.
 */
const receivableSpan = (
  nodes: Doc['nodes'],
  seen: ReadonlySet<string>,
  index: number,
  span: number,
  forward: number,
): number => {
  const fromId = nodes[index].id;
  let next = span;
  // Walk forward to the next node that can RECEIVE rather than dropping
  // the edge: a third of the kinds have no in port, and skipping those
  // attempts outright cost 40% of the edges — 242 against the ~400 design
  // §13.2 asks for, which is a different graph, not a slightly sparser one.
  while (next <= forward && !hasInPort(nodes[index + next].kind)) {
    next += 1;
  }
  // Same walk past a duplicate. Dropping the attempt instead cost another
  // forty edges, which is the difference between ~2.0 and ~1.8 edges per
  // node — a materially sparser graph to lay out and to cull.
  while (next <= forward && seen.has(`${fromId}->${nodes[index + next].id}`)) {
    next += 1;
    while (next <= forward && !hasInPort(nodes[index + next].kind)) {
      next += 1;
    }
  }
  return next;
};

/**
 * A graph big enough that culling matters and laid out so it does NOT all fit
 * on one screen — design §13.2's runs are taken "not at `fitView`", which only
 * has meaning if the graph overflows the viewport.
 */
export const generateBenchGraph = (options: BenchGraphOptions): Doc => {
  const { count, seed = 1, fanOut = 3, columns = 14, columnGap = 320, rowGap = 220 } = options;
  const random = mulberry32(seed);

  // SAFETY: `kind` cycles through `kinds`, each node gets the data variant for its kind,
  // and `id` is unique per index — the per-kind pairing GraphNodeOf demands but TS cannot correlate.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- correlated kind/data union is checked by construction below
  const nodes = Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length];
    const jitterX = Math.round((random() - 0.5) * 80);
    const jitterY = Math.round((random() - 0.5) * 80);
    const data = nodeData(kind, index);
    return {
      id: `n${index}`,
      kind,
      position: {
        x: (index % columns) * columnGap + jitterX,
        y: Math.floor(index / columns) * rowGap + jitterY,
      },
      data,
    };
  }) as Doc['nodes'];

  const edges: Doc['edges'][number][] = [];
  const seen = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const from = nodes[index];
    const port = outPort(from.kind, random());
    // `forward` is fixed per source node, so "nothing ahead" skips every attempt at once.
    const forward = count - index - 1;
    if (port === null || forward <= 0) {
      continue;
    }
    for (let attempt = 0; attempt < fanOut; attempt += 1) {
      // Bias toward nearby targets: a graph where every edge spans the whole
      // canvas is not the graph a user builds, and it is also the pathological
      // case for edge culling, which would flatter the numbers here.
      const firstSpan = Math.max(1, Math.min(forward, 1 + Math.floor(random() * 24)));
      const span = receivableSpan(nodes, seen, index, firstSpan, forward);
      if (span > forward) {
        break;
      }
      const target = nodes[index + span];
      const id = `${from.id}->${target.id}`;
      seen.add(id);
      // SAFETY: `kind` is drawn from edgeKinds and `data: {}` is valid BuiltinEdgeData for every builtin kind.
      edges.push({
        id,
        kind: edgeKinds[edges.length % edgeKinds.length],
        source: { node: from.id, port },
        target: { node: target.id, port: 'in' },
        data: {},
      } as Doc['edges'][number]);
    }
  }

  return { version: 1, nodes, edges };
};

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

import type { BuiltinEdgeData } from '../edges/edgeKinds';
import type { GraphDocument } from '../model/index';
import type { DemoNodeData } from '../react-flow/fixtures';

/** Mulberry32. Named in plan task 5.1; 32-bit state, seeded, repeatable. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

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
function outPort(kind: (typeof kinds)[number], pick: number): string | null {
  if (kind === 'source') {
    return 'rows';
  }
  if (kind === 'transform') {
    return pick < 0.75 ? 'ok' : 'err';
  }
  return null;
}

function hasInPort(kind: (typeof kinds)[number]): boolean {
  return kind !== 'source';
}

/**
 * A graph big enough that culling matters and laid out so it does NOT all fit
 * on one screen — design §13.2's runs are taken "not at `fitView`", which only
 * has meaning if the graph overflows the viewport.
 */
export function generateBenchGraph(options: BenchGraphOptions): Doc {
  const { count, seed = 1, fanOut = 3, columns = 14, columnGap = 320, rowGap = 220 } = options;
  const random = mulberry32(seed);

  const nodes = Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length];
    const jitterX = Math.round((random() - 0.5) * 80);
    const jitterY = Math.round((random() - 0.5) * 80);
    const data =
      kind === 'source'
        ? { table: `orders_${index}` }
        : kind === 'transform'
          ? { expression: `row => row.f${index}` }
          : { target: `warehouse_${index}` };
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
    if (!port) {
      continue;
    }
    for (let attempt = 0; attempt < fanOut; attempt += 1) {
      const forward = count - index - 1;
      if (forward <= 0) {
        break;
      }
      // Bias toward nearby targets: a graph where every edge spans the whole
      // canvas is not the graph a user builds, and it is also the pathological
      // case for edge culling, which would flatter the numbers here.
      let span = Math.max(1, Math.min(forward, 1 + Math.floor(random() * 24)));
      // Walk forward to the next node that can RECEIVE rather than dropping
      // the edge: a third of the kinds have no in port, and skipping those
      // attempts outright cost 40% of the edges — 242 against the ~400 design
      // §13.2 asks for, which is a different graph, not a slightly sparser one.
      while (span <= forward && !hasInPort(nodes[index + span].kind)) {
        span += 1;
      }
      // Same walk past a duplicate. Dropping the attempt instead cost another
      // forty edges, which is the difference between ~2.0 and ~1.8 edges per
      // node — a materially sparser graph to lay out and to cull.
      while (span <= forward && seen.has(`${from.id}->${nodes[index + span].id}`)) {
        span += 1;
        while (span <= forward && !hasInPort(nodes[index + span].kind)) {
          span += 1;
        }
      }
      if (span > forward) {
        break;
      }
      const target = nodes[index + span];
      const id = `${from.id}->${target.id}`;
      seen.add(id);
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
}

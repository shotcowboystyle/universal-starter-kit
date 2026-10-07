/**
 * Task 4.1. The dagre adapter, pure and headless.
 *
 * "Headless" is asserted, not assumed: every case here runs with `document`
 * stubbed to `undefined`, because this exact module is bundled into the layout
 * worker (task 4.2) where there is no DOM at all, and a stray `document.`
 * reach would be a runtime error inside a Worker — the least debuggable place
 * in the package. happy-dom gives the spec run a real `document`, so without
 * the stub the assertion would pass on a DOM that the worker will not have.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { layoutWithDagre } from './dagre';
import type { LayoutEdgeInput, LayoutNodeInput, LayoutRequest } from './types';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Every case runs in the worker's world: no `document`, no `window`. */
function headless<T>(run: () => T): T {
  vi.stubGlobal('document');
  vi.stubGlobal('window');
  try {
    return run();
  } finally {
    vi.unstubAllGlobals();
  }
}

function node(id: string, x: number, y: number, width = 190, height = 72): LayoutNodeInput {
  return { id, width, height, position: { x, y } };
}

function edge(source: string, target: string): LayoutEdgeInput {
  return { id: `${source}->${target}`, source, target };
}

/** A diamond plus a tail: two ranks that branch and merge, then one more. */
function diamond(): LayoutRequest {
  return {
    nodes: [node('a', 11, 13), node('b', 400, 500), node('c', -90, 260), node('d', 33, 900), node('e', 720, 40)],
    edges: [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd'), edge('d', 'e')],
  };
}

describe(layoutWithDagre, () => {
  it('runs with `document === undefined`', () => {
    const result = headless(() => layoutWithDagre(diamond()));
    expect(result.engine).toBe('dagre');
    expect(Object.keys(result.positions)).toHaveLength(5);
  });

  it('covers every node id, including an isolated one with no edges', () => {
    const request: LayoutRequest = {
      nodes: [...diamond().nodes, node('lonely', 5000, 5000)],
      edges: diamond().edges,
    };
    const result = headless(() => layoutWithDagre(request));
    for (const input of request.nodes) {
      expect(result.positions[input.id], `missing ${input.id}`).toBeDefined();
      expect(Number.isFinite(result.positions[input.id].x)).toBe(true);
      expect(Number.isFinite(result.positions[input.id].y)).toBe(true);
    }
  });

  it('is deterministic: the same input twice gives the same positions', () => {
    const first = headless(() => layoutWithDagre(diamond()));
    const second = headless(() => layoutWithDagre(diamond()));
    expect(second.positions).toEqual(first.positions);
  });

  it('is deterministic under a reordered input, because the adapter sorts', () => {
    const forward = diamond();
    const shuffled: LayoutRequest = {
      nodes: [...forward.nodes].reverse(),
      edges: [...forward.edges].reverse(),
    };
    expect(headless(() => layoutWithDagre(shuffled)).positions).toEqual(
      headless(() => layoutWithDagre(forward)).positions,
    );
  });

  it("separates ranks: an edge's target sits below its source in TB", () => {
    const result = headless(() => layoutWithDagre(diamond()));
    expect(result.positions.b.y).toBeGreaterThan(result.positions.a.y);
    expect(result.positions.d.y).toBeGreaterThan(result.positions.b.y);
  });

  it('honours `direction: LR` by ranking along x instead of y', () => {
    const result = headless(() => layoutWithDagre({ ...diamond(), options: { direction: 'LR' } }));
    expect(result.positions.b.x).toBeGreaterThan(result.positions.a.x);
    expect(result.positions.d.x).toBeGreaterThan(result.positions.b.x);
  });

  it("anchors the moved set's bounding box where it already was", () => {
    const request = diamond();
    const result = headless(() => layoutWithDagre(request));
    const minOf = (pick: (p: { x: number; y: number }) => number, source: 'in' | 'out') =>
      Math.min(...request.nodes.map((input) => pick(source === 'in' ? input.position : result.positions[input.id])));
    expect(minOf((p) => p.x, 'out')).toBeCloseTo(
      minOf((p) => p.x, 'in'),
      2,
    );
    expect(minOf((p) => p.y, 'out')).toBeCloseTo(
      minOf((p) => p.y, 'in'),
      2,
    );
  });

  it("returns positions as TOP-LEFT, not dagre's centres", () => {
    // One node, no edges: dagre puts its CENTRE at (width/2, height/2), so a
    // top-left result is the anchor exactly and a centre result is off by half
    // the box. The 2 px node makes the two answers unmistakable.
    const result = headless(() => layoutWithDagre({ nodes: [node('only', 100, 200, 2, 2)], edges: [] }));
    expect(result.positions.only).toEqual({ x: 100, y: 200 });
  });

  it('rounds to 2 dp, so two structurally equal layouts diff clean', () => {
    const result = headless(() => layoutWithDagre(diamond()));
    for (const point of Object.values(result.positions)) {
      expect(point.x).toBe(Math.round(point.x * 100) / 100);
      expect(point.y).toBe(Math.round(point.y * 100) / 100);
    }
  });

  it('survives a cycle rather than hanging or throwing', () => {
    const result = headless(() =>
      layoutWithDagre({
        nodes: [node('a', 0, 0), node('b', 0, 0), node('c', 0, 0)],
        edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
      }),
    );
    expect(Object.keys(result.positions).sort()).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty result for an empty graph', () => {
    const result = headless(() => layoutWithDagre({ nodes: [], edges: [] }));
    expect(result.positions).toEqual({});
    expect(result.moved).toEqual([]);
  });

  it('reports elapsed ms as a finite number', () => {
    const result = headless(() => layoutWithDagre(diamond()));
    expect(Number.isFinite(result.ms)).toBe(true);
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  describe('subset', () => {
    it('moves only the named nodes and leaves the rest exactly where they were', () => {
      const request = diamond();
      const result = headless(() => layoutWithDagre({ ...request, options: { subset: ['a', 'b', 'd'] } }));
      expect(result.moved).toEqual(['a', 'b', 'd']);
      for (const input of request.nodes) {
        if (['a', 'b', 'd'].includes(input.id)) {
          continue;
        }
        expect(result.positions[input.id], `${input.id} moved`).toEqual(input.position);
      }
    });

    it('still covers every node id, moved or fixed', () => {
      const request = diamond();
      const result = headless(() => layoutWithDagre({ ...request, options: { subset: ['a'] } }));
      expect(Object.keys(result.positions).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('treats the fixed nodes as absent from the graph, not as unconnected ranks', () => {
      // `a -> b -> d` laid out alone must rank all three; if the adapter left
      // `c` in the dagre graph as a fixed obstacle, `d` would be pushed down a
      // rank it does not need and the subset would not be self-contained.
      const request = diamond();
      const result = headless(() => layoutWithDagre({ ...request, options: { subset: ['a', 'b', 'd'] } }));
      const spans = result.positions.d.y - result.positions.a.y;
      const whole = headless(() => layoutWithDagre(request));
      expect(spans).toBeCloseTo(whole.positions.d.y - whole.positions.a.y, 2);
    });

    it("anchors the SUBSET's box, so a tidy does not teleport the cluster", () => {
      const request = diamond();
      const subset = ['a', 'b', 'd'];
      const result = headless(() => layoutWithDagre({ ...request, options: { subset } }));
      const inMin = Math.min(...request.nodes.filter((n) => subset.includes(n.id)).map((n) => n.position.y));
      const outMin = Math.min(...subset.map((id) => result.positions[id].y));
      expect(outMin).toBeCloseTo(inMin, 2);
    });

    it('an empty subset moves nothing', () => {
      const request = diamond();
      const result = headless(() => layoutWithDagre({ ...request, options: { subset: [] } }));
      expect(result.moved).toEqual([]);
      for (const input of request.nodes) {
        expect(result.positions[input.id]).toEqual(input.position);
      }
    });

    it('ignores a subset id that is not in the node list', () => {
      const request = diamond();
      const result = headless(() => layoutWithDagre({ ...request, options: { subset: ['a', 'ghost'] } }));
      expect(result.moved).toEqual(['a']);
      expect(result.positions.ghost).toBeUndefined();
    });
  });

  describe('spacing options', () => {
    it('a larger rankSpacing pushes the ranks further apart', () => {
      const tight = headless(() => layoutWithDagre({ ...diamond(), options: { rankSpacing: 40 } }));
      const loose = headless(() => layoutWithDagre({ ...diamond(), options: { rankSpacing: 200 } }));
      expect(loose.positions.d.y - loose.positions.a.y).toBeGreaterThan(tight.positions.d.y - tight.positions.a.y);
    });

    it('a larger nodeSpacing widens the two branches of the diamond', () => {
      const tight = headless(() => layoutWithDagre({ ...diamond(), options: { nodeSpacing: 10 } }));
      const loose = headless(() => layoutWithDagre({ ...diamond(), options: { nodeSpacing: 300 } }));
      expect(Math.abs(loose.positions.b.x - loose.positions.c.x)).toBeGreaterThan(
        Math.abs(tight.positions.b.x - tight.positions.c.x),
      );
    });
  });
});

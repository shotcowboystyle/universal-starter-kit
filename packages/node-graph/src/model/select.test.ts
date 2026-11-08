/**
 * Marquee selection, design §12.2.
 *
 * The interesting part is the oracle. The implementation compares intervals;
 * the oracle below is written from the DEFINITION instead — partial is "not
 * separated on either axis", full is "all four corners inside" — so a flipped
 * comparison or an off-by-one on an edge shows up as a disagreement rather
 * than as two copies of the same mistake. 500 seeded random rects, both modes.
 */

import { describe, expect, it } from 'vitest';

import type { GraphDocument, Rect } from './document';
import { nodeRects, rectContains, rectsOverlap, selectInMarquee, unionBounds } from './select';
import type { NodeRect } from './select';

/** mulberry32. Seeded so a failure is reproducible from the test name alone. */
/* oxlint-disable eslint/no-bitwise -- mulberry32 is defined in terms of 32-bit integer bit operations */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};
/* oxlint-enable eslint/no-bitwise */

/** Written from the definition, not from the implementation. */
const oracle = (rects: readonly NodeRect[], marquee: Rect, mode: 'partial' | 'full'): string[] => {
  const inside = (x: number, y: number) =>
    x >= marquee.x && x <= marquee.x + marquee.width && y >= marquee.y && y <= marquee.y + marquee.height;
  return rects
    .filter(({ rect }) => {
      if (mode === 'full') {
        return (
          inside(rect.x, rect.y) &&
          inside(rect.x + rect.width, rect.y) &&
          inside(rect.x, rect.y + rect.height) &&
          inside(rect.x + rect.width, rect.y + rect.height)
        );
      }
      // Separated on either axis means no overlap. Touching edges are
      // separated: the overlap area is zero and a zero-area brush should not
      // sweep up a node it has not actually covered.
      const separated =
        rect.x + rect.width <= marquee.x ||
        marquee.x + marquee.width <= rect.x ||
        rect.y + rect.height <= marquee.y ||
        marquee.y + marquee.height <= rect.y;
      return !separated;
    })
    .map(({ id }) => id);
};

const randomRects = (count: number, seed: number): NodeRect[] => {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    rect: {
      x: Math.round(random() * 800 - 400),
      y: Math.round(random() * 800 - 400),
      width: Math.round(random() * 160) + 1,
      height: Math.round(random() * 120) + 1,
    },
  }));
};

describe('selectInMarquee matches a brute-force oracle', () => {
  const rects = randomRects(500, 0x1_91);

  it.each(['partial', 'full'] as const)('over 500 random rects and 60 marquees, %s', (mode) => {
    const random = seeded(0x4a_4a);
    for (let i = 0; i < 60; i += 1) {
      const marquee: Rect = {
        x: Math.round(random() * 800 - 400),
        y: Math.round(random() * 800 - 400),
        width: Math.round(random() * 500) + 1,
        height: Math.round(random() * 500) + 1,
      };
      expect(selectInMarquee(rects, marquee, mode), JSON.stringify(marquee)).toStrictEqual(
        oracle(rects, marquee, mode),
      );
    }
  });

  it('finds fewer in full mode than in partial, on a marquee that clips', () => {
    // Guards against the two modes silently becoming the same function.
    const marquee: Rect = { x: -100, y: -100, width: 200, height: 200 };
    const partial = selectInMarquee(rects, marquee, 'partial');
    const full = selectInMarquee(rects, marquee, 'full');
    expect(partial.length).toBeGreaterThan(full.length);
    // No id twice, and full is a strict subset of partial.
    expect(new Set(partial).size).toBe(partial.length);
    for (const id of full) {
      expect(partial).toContain(id);
    }
  });
});

describe('the edge cases the oracle exists to pin', () => {
  const one: NodeRect[] = [{ id: 'n', rect: { x: 0, y: 0, width: 10, height: 10 } }];

  it('does not select a node the marquee only touches', () => {
    expect(selectInMarquee(one, { x: 10, y: 0, width: 5, height: 10 }, 'partial')).toStrictEqual([]);
  });

  it('selects a node the marquee overlaps by one unit', () => {
    expect(selectInMarquee(one, { x: 9, y: 0, width: 5, height: 10 }, 'partial')).toStrictEqual(['n']);
  });

  it('counts an exactly-covering marquee as full', () => {
    expect(selectInMarquee(one, { x: 0, y: 0, width: 10, height: 10 }, 'full')).toStrictEqual(['n']);
  });

  it('does not count a marquee one unit short as full', () => {
    expect(selectInMarquee(one, { x: 0, y: 0, width: 10, height: 9 }, 'full')).toStrictEqual([]);
  });

  it('keeps the input order, so selection is stable between drags', () => {
    const many = randomRects(50, 7);
    const marquee: Rect = { x: -400, y: -400, width: 900, height: 900 };
    const selected = selectInMarquee(many, marquee, 'partial');
    expect(selected).toStrictEqual(many.filter(({ id }) => selected.includes(id)).map(({ id }) => id));
  });
});

describe(unionBounds, () => {
  it('is the smallest rect covering them all', () => {
    expect(
      unionBounds([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 100, y: -20, width: 5, height: 5 },
      ]),
      // maxY is 0 + 10, not -20 + 5, so the height is 10 - (-20).
    ).toStrictEqual({ x: 0, y: -20, width: 105, height: 30 });
  });

  it("is a single rect's own bounds", () => {
    const only = { x: 3, y: 4, width: 5, height: 6 };
    expect(unionBounds([only])).toStrictEqual(only);
  });

  it('is undefined for nothing, rather than a zero rect at the origin', () => {
    // A zero rect at 0,0 is a REAL position, and a toolbar that centres on it
    // would jump the viewport whenever the selection emptied.
    expect(unionBounds([])).toBeUndefined();
  });

  it('matches an oracle over 200 random rects', () => {
    const rects = randomRects(200, 0x55).map(({ rect }) => rect);
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.width));
    const maxY = Math.max(...rects.map((r) => r.y + r.height));
    expect(unionBounds(rects)).toStrictEqual({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    });
  });
});

describe('the predicates on their own', () => {
  const a: Rect = { x: 0, y: 0, width: 10, height: 10 };

  it('rectsOverlap is symmetric', () => {
    const b: Rect = { x: 5, y: 5, width: 10, height: 10 };
    expect(rectsOverlap(a, b)).toBe(true);
    expect(rectsOverlap(b, a)).toBe(true);
  });

  it('rectContains is not', () => {
    const inner: Rect = { x: 2, y: 2, width: 3, height: 3 };
    expect(rectContains(a, inner)).toBe(true);
    expect(rectContains(inner, a)).toBe(false);
  });
});

describe(nodeRects, () => {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- must stay an alias: interfaces lack the implicit index signature the NodeKindDefs/EdgeKindDefs constraint needs
  type Nodes = {
    readonly task: Record<string, never>;
  };
  // oxlint-disable-next-line typescript/consistent-type-definitions -- must stay an alias: interfaces lack the implicit index signature the NodeKindDefs/EdgeKindDefs constraint needs
  type Edges = {
    readonly flow: Record<string, never>;
  };

  const doc: GraphDocument<Nodes, Edges> = {
    version: 1,
    nodes: [
      {
        id: 'sized',
        kind: 'task',
        position: { x: 10, y: 20 },
        data: {},
        size: { width: 190, height: 72 },
      },
      { id: 'unsized', kind: 'task', position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [],
  };

  it("uses the node's own size when it has one", () => {
    expect(nodeRects(doc, () => ({ width: 1, height: 1 }))[0].rect).toStrictEqual({
      x: 10,
      y: 20,
      width: 190,
      height: 72,
    });
  });

  it('falls back to the measurer for a node that has not been measured yet', () => {
    // Nodes are seeded from `NodeKindSpec.measure` before first paint (design
    // §5), but a document loaded from JSON may not carry a size at all.
    expect(nodeRects(doc, () => ({ width: 172, height: 48 }))[1].rect).toStrictEqual({
      x: 0,
      y: 0,
      width: 172,
      height: 48,
    });
  });
});

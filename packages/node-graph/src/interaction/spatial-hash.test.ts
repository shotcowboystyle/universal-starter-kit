/**
 * The spatial hash, design §7.2 rule S3.
 *
 * The oracle is the point. A hash that agrees with itself proves nothing, so
 * `query` is compared against a brute-force filter written from the DEFINITION
 * of overlap over 500 seeded random rects. Half of those rects are aimed at
 * cell boundaries on purpose: a rect that lies wholly inside one cell exercises
 * none of the bucketing, and every bug this structure can have lives in the
 * straddle.
 */

import { describe, expect, it } from 'vitest';

import type { Rect } from '../model/document';

import { buildSpatialHash, defaultCellSize } from './spatial-hash';
import type { SpatialItem } from './spatial-hash';

/** mulberry32. Seeded, so a failure is reproducible from the test name alone. */
/* oxlint-disable eslint/no-bitwise, eslint/operator-assignment -- mulberry32 is defined by these exact 32-bit operations */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};
/* oxlint-enable eslint/no-bitwise, eslint/operator-assignment */

/**
 * Written from the definition, not from the implementation: two rects overlap
 * when neither axis separates them, and a shared edge is not an overlap.
 */
const oracle = (items: readonly SpatialItem[], query: Rect): string[] =>
  items
    .filter(
      ({ rect }) =>
        query.x < rect.x + rect.width &&
        rect.x < query.x + query.width &&
        query.y < rect.y + rect.height &&
        rect.y < query.y + query.height,
    )
    .map(({ id }) => id);

const scatter = (count: number, seed = 20_260_906): SpatialItem[] => {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, index) => ({
    id: `n${index}`,
    rect: {
      // A world several cells across in both directions, negative included:
      // `Math.floor` on a negative coordinate is the classic off-by-one here.
      x: Math.round(random() * 4000 - 1500),
      y: Math.round(random() * 3000 - 1000),
      width: 120 + Math.round(random() * 200),
      height: 48 + Math.round(random() * 120),
    },
  }));
};

/** Half ordinary, half deliberately hung across a cell boundary. */
const queryRects = (count: number, seed = 1337): Rect[] => {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, index) => {
    if (index % 2 === 0) {
      return {
        x: Math.round(random() * 4000 - 1500),
        y: Math.round(random() * 3000 - 1000),
        width: 1 + Math.round(random() * 500),
        height: 1 + Math.round(random() * 400),
      };
    }
    const col = Math.round(random() * 12) - 5;
    const row = Math.round(random() * 10) - 4;
    const straddleX = col * defaultCellSize - Math.round(random() * 40);
    const straddleY = row * defaultCellSize - Math.round(random() * 40);
    return {
      x: straddleX,
      y: straddleY,
      width: 60 + Math.round(random() * 400),
      height: 60 + Math.round(random() * 300),
    };
  });
};

describe(buildSpatialHash, () => {
  it('agrees with a brute-force oracle over 500 seeded rects, straddlers included', () => {
    const items = scatter(200);
    const index = buildSpatialHash(items);
    for (const query of queryRects(500)) {
      expect(index.query(query).map((item) => item.id)).toStrictEqual(oracle(items, query));
    }
  });

  it('agrees with the oracle at cell sizes far above and below the node size', () => {
    const items = scatter(120, 7);
    for (const cellSize of [16, 64, 1024]) {
      const index = buildSpatialHash(items, { cellSize });
      for (const query of queryRects(60, cellSize)) {
        expect(index.query(query).map((item) => item.id)).toStrictEqual(oracle(items, query));
      }
    }
  });

  it('returns each item once however many cells it spans', () => {
    // Four cells wide, three tall, and starting mid-cell so it lands in twelve.
    const wide: SpatialItem = { id: 'wide', rect: { x: -100, y: -100, width: 900, height: 700 } };
    const index = buildSpatialHash([wide]);
    expect(index.query({ x: -200, y: -200, width: 1200, height: 1000 })).toStrictEqual([wide]);
  });

  it('preserves insertion order, so two identical drags produce one selection', () => {
    const items: SpatialItem[] = [
      { id: 'c', rect: { x: 500, y: 0, width: 100, height: 100 } },
      { id: 'a', rect: { x: 0, y: 0, width: 100, height: 100 } },
      { id: 'b', rect: { x: 260, y: 0, width: 100, height: 100 } },
    ];
    const index = buildSpatialHash(items);
    expect(index.query({ x: -50, y: -50, width: 800, height: 200 }).map((item) => item.id)).toStrictEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('does not select a rect that only shares an edge', () => {
    const index = buildSpatialHash([{ id: 'n', rect: { x: 100, y: 100, width: 50, height: 50 } }]);
    expect(index.query({ x: 50, y: 100, width: 50, height: 50 })).toStrictEqual([]);
    expect(index.query({ x: 50, y: 100, width: 51, height: 50 })).toHaveLength(1);
  });

  it('reports its own shape, and an empty index queries to nothing', () => {
    const empty = buildSpatialHash([]);
    expect(empty.size).toBe(0);
    expect(empty.cellCount).toBe(0);
    expect(empty.cellSize).toBe(defaultCellSize);
    expect(empty.query({ x: 0, y: 0, width: 1e6, height: 1e6 })).toStrictEqual([]);
  });

  it('refuses a cell size that would not terminate', () => {
    expect(() => buildSpatialHash([], { cellSize: 0 })).toThrow(RangeError);
    expect(() => buildSpatialHash([], { cellSize: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });

  it('drops a non-finite rect instead of looping over infinite cells', () => {
    const items: SpatialItem[] = [
      { id: 'sane', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'nan', rect: { x: Number.NaN, y: 0, width: 10, height: 10 } },
      { id: 'inf', rect: { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 } },
    ];
    const index = buildSpatialHash(items);
    expect(index.size).toBe(3);
    expect(index.query({ x: -5, y: -5, width: 20, height: 20 }).map((item) => item.id)).toStrictEqual(['sane']);
    expect(index.query({ x: Number.NaN, y: 0, width: 10, height: 10 })).toStrictEqual([]);
  });

  it('builds an index over 200 nodes in under 1 ms', () => {
    const items = scatter(200, 99);
    // Median of 21, not the mean: one GC pause in a CI container must not turn
    // a real budget into a flaky test, and the median cannot be dragged by it.
    const samples: number[] = [];
    for (let run = 0; run < 21; run += 1) {
      const started = performance.now();
      buildSpatialHash(items);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    expect(samples[10]).toBeLessThan(1);
  });
});

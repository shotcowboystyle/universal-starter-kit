/**
 * The snapper, design §7.2. This file carries S2, S4, S7, S8 and S9; S1, S3,
 * S5, S6, S10 and S11 are the wiring's, and live in `snap-changes.test.ts`.
 *
 * Four of the five are written as TABLES rather than prose tests, because each
 * is a claim about a family of inputs and a single example proves the family
 * only by accident. S4 in particular is nine pairs per axis, and nine hand-
 * written `it` blocks is where one of them quietly goes missing.
 */

import { describe, expect, it } from 'vitest';

import type { NodeId, Rect } from '../model/document';

import { alignmentThreshold, defaultCandidateRadius, defaultSnapThresholdPx, snapToAlignment } from './snap-alignment';
import type { PositionedNode, SnapToAlignmentInput } from './snap-alignment';
import { buildSpatialHash } from './spatial-hash';

const nodesOf = (...nodes: PositionedNode[]): ReadonlyMap<NodeId, PositionedNode> =>
  new Map(nodes.map((node) => [node.id, node]));

/** Everything a caller has to assemble, so a test states only what it varies. */
const snap = (options: {
  readonly rect: Rect;
  readonly candidates: readonly PositionedNode[];
  readonly ids?: readonly NodeId[];
  readonly dragged?: readonly PositionedNode[];
  readonly threshold?: number;
  readonly radius?: number;
}) => {
  const dragged = options.dragged ?? [];
  const nodes = nodesOf(...options.candidates, ...dragged);
  const input: SnapToAlignmentInput = {
    ids: options.ids ?? dragged.map((node) => node.id),
    rect: options.rect,
    nodes,
    // Built over EVERY node, dragged ones included, so S7 is proven by the
    // snapper's own exclusion and not by a caller that pre-filtered for it.
    index: buildSpatialHash([...options.candidates, ...dragged]),
    thresholdFlowUnits: options.threshold ?? 5,
    radius: options.radius ?? defaultCandidateRadius,
  };
  return snapToAlignment(input);
};

const box = (id: string, x: number, y: number, width = 100, height = 50): PositionedNode => ({
  id,
  rect: { x, y, width, height },
});

describe(alignmentThreshold, () => {
  it('divides the screen threshold by the zoom, so the pull is a screen distance', () => {
    expect(alignmentThreshold({ thresholdScreenPx: 8, zoom: 1 })).toBe(8);
    expect(alignmentThreshold({ thresholdScreenPx: 8, zoom: 0.5 })).toBe(16);
    expect(alignmentThreshold({ thresholdScreenPx: 8, zoom: 2 })).toBe(4);
  });

  it('refuses a zoom that would make the threshold infinite', () => {
    expect(alignmentThreshold({ thresholdScreenPx: 8, zoom: 0 })).toBe(0);
    expect(alignmentThreshold({ thresholdScreenPx: 8, zoom: -1 })).toBe(0);
  });

  it('defaults 8 on fine pointers and 12 on coarse', () => {
    expect(defaultSnapThresholdPx.fine).toBe(8);
    expect(defaultSnapThresholdPx.coarse).toBe(12);
  });
});

describe('snapToAlignment: S2, the threshold is a SCREEN distance', () => {
  // Same physical pull at every zoom. A fixed flow-unit threshold would be
  // 4 screen px at 0.5x, which is what "the snap feels dead when pinched out"
  // actually is.
  const table = [0.5, 1, 2] as const;

  it.each(table)('pulls from 8 screen px and not from 9 at zoom %s', (zoom) => {
    const threshold = alignmentThreshold({ thresholdScreenPx: 8, zoom });
    const candidate = box('c', 400, 400);

    const inRange = snap({
      rect: { x: 400 + 8 / zoom, y: 0, width: 100, height: 50 },
      candidates: [candidate],
      threshold,
    });
    expect(inRange.acquired).toBe(true);
    expect(inRange.position.x).toBe(400);

    const outOfRange = snap({
      rect: { x: 400 + 9 / zoom, y: 0, width: 100, height: 50 },
      candidates: [candidate],
      threshold,
    });
    expect(outOfRange.acquired).toBe(false);
    expect(outOfRange.position.x).toBe(400 + 9 / zoom);
  });
});

describe('snapToAlignment: S4, nine line pairs per axis, nearest per axis', () => {
  // One candidate 100x50 at the origin, so its x lines are 0 / 50 / 100 and its
  // y lines are 0 / 25 / 50. The moving rect is 60x40, whose line offsets
  // (0 / 30 / 60 and 0 / 20 / 40) share no difference with the candidate's, so
  // exactly one pair can be inside the threshold at a time. That is what makes
  // the table a table and not nine coincidences.
  const candidate = box('c', 0, 0, 100, 50);
  const movingWidth = 60;
  const movingHeight = 40;
  const xOffsets = { start: 0, center: movingWidth / 2, end: movingWidth } as const;
  const yOffsets = { start: 0, center: movingHeight / 2, end: movingHeight } as const;
  const candidateX = { start: 0, center: 50, end: 100 } as const;
  const candidateY = { start: 0, center: 25, end: 50 } as const;
  const lines = ['start', 'center', 'end'] as const;

  const pairs = lines.flatMap((movingLine) => lines.map((candidateLine) => [movingLine, candidateLine] as const));

  describe.each(pairs)('moving %s, candidate %s', (movingLine, candidateLine) => {
    it(`x: moving ${movingLine} snaps to candidate ${candidateLine}`, () => {
      const target = candidateX[candidateLine];
      const x = target - 2 - xOffsets[movingLine];
      const result = snap({
        rect: { x, y: 400, width: movingWidth, height: movingHeight },
        candidates: [candidate],
        // Far enough on y that the candidate is still a candidate, and no y
        // pair is anywhere near firing.
        radius: 600,
      });
      expect(result.acquired).toBe(true);
      expect(result.position.x).toBe(x + 2);
      expect(result.position.y).toBe(400);
      expect(result.guides).toHaveLength(1);
      expect(result.guides[0]).toMatchObject({
        axis: 'x',
        position: target,
        nodeId: 'c',
        movingLine,
        candidateLine,
      });
    });

    it(`y: moving ${movingLine} snaps to candidate ${candidateLine}`, () => {
      const target = candidateY[candidateLine];
      const y = target - 2 - yOffsets[movingLine];
      const result = snap({
        rect: { x: 400, y, width: movingWidth, height: movingHeight },
        candidates: [candidate],
        radius: 600,
      });
      expect(result.acquired).toBe(true);
      expect(result.position.y).toBe(y + 2);
      expect(result.position.x).toBe(400);
      expect(result.guides).toHaveLength(1);
      expect(result.guides[0]).toMatchObject({
        axis: 'y',
        position: target,
        nodeId: 'c',
        movingLine,
        candidateLine,
      });
    });
  });

  it('takes x from one neighbour and y from another', () => {
    const result = snap({
      rect: { x: 302, y: 199, width: 100, height: 50 },
      candidates: [box('left', 300, 0), box('above', 0, 200)],
    });
    expect(result.position).toStrictEqual({ x: 300, y: 200 });
    expect(result.guides).toHaveLength(2);
    expect(result.guides.find((guide) => guide.axis === 'x')?.nodeId).toBe('left');
    expect(result.guides.find((guide) => guide.axis === 'y')?.nodeId).toBe('above');
  });

  it('takes the NEAREST line, not the first one inside the threshold', () => {
    // 502 is 2 from `near`'s left edge and 4 from `far`'s.
    const result = snap({
      rect: { x: 502, y: 0, width: 100, height: 50 },
      candidates: [box('far', 506, 0), box('near', 500, 0)],
    });
    expect(result.position.x).toBe(500);
    expect(result.guides[0]?.nodeId).toBe('near');
  });

  it('spans the guide across both rects, so it points at what it aligned to', () => {
    const result = snap({
      rect: { x: 302, y: 400, width: 100, height: 50 },
      candidates: [box('c', 300, 0)],
      radius: 600,
    });
    const [guide] = result.guides;
    expect(guide).toMatchObject({ axis: 'x', position: 300 });
    expect(guide.start).toBe(0);
    expect(guide.end).toBe(450);
  });
});

describe('snapToAlignment: S7, the dragged set is never its own candidate', () => {
  it('ignores the node being dragged even when the index holds it', () => {
    const dragged = box('a', 100, 100);
    const result = snap({
      rect: dragged.rect,
      candidates: [],
      dragged: [dragged],
    });
    expect(result.acquired).toBe(false);
    expect(result.guides).toStrictEqual([]);
    expect(result.position).toStrictEqual({ x: 100, y: 100 });
  });

  it('ignores EVERY member of a multi-selection, not just the first', () => {
    const a = box('a', 100, 100);
    const b = box('b', 260, 100);
    // The union of a and b. Both members' own edges sit on its lines, so a
    // partial exclusion snaps to zero and looks like success.
    const result = snap({
      rect: { x: 100, y: 100, width: 260, height: 50 },
      candidates: [],
      dragged: [a, b],
    });
    expect(result.acquired).toBe(false);
    expect(result.position).toStrictEqual({ x: 100, y: 100 });
  });

  it('still snaps the selection to a node OUTSIDE it', () => {
    const a = box('a', 102, 100);
    const b = box('b', 262, 100);
    const result = snap({
      rect: { x: 102, y: 100, width: 260, height: 50 },
      candidates: [box('anchor', 100, 300)],
      dragged: [a, b],
    });
    expect(result.acquired).toBe(true);
    expect(result.position.x).toBe(100);
  });
});

describe('snapToAlignment: S8, the bound is exclusive above', () => {
  const threshold = 5;
  const table = [
    { gap: 0, fires: true },
    { gap: 4, fires: true },
    { gap: threshold, fires: true },
    { gap: threshold + 1, fires: false },
    { gap: 40, fires: false },
  ];

  // The candidate sits 300 below, so only the x axis is ever in play. Level
  // with it, every y pair would be an exact hit and `acquired` would be true
  // for a reason the table is not about.
  const candidate = box('c', 300, 300);

  it.each(table)('$gap flow units from the line (snaps: $fires)', ({ gap, fires }) => {
    const result = snap({
      rect: { x: 300 + gap, y: 0, width: 100, height: 50 },
      candidates: [candidate],
      threshold,
    });
    expect(result.acquired).toBe(fires);
    expect(result.position.x).toBe(fires ? 300 : 300 + gap);
  });

  it('is symmetric: the same distance on the other side behaves the same', () => {
    expect(
      snap({
        rect: { x: 300 - threshold, y: 0, width: 100, height: 50 },
        candidates: [candidate],
        threshold,
      }).acquired,
    ).toBe(true);
    expect(
      snap({
        rect: { x: 300 - threshold - 1, y: 0, width: 100, height: 50 },
        candidates: [candidate],
        threshold,
      }).acquired,
    ).toBe(false);
  });
});

describe('snapToAlignment: S9, an exact tie resolves to the lower node id', () => {
  it('prefers the lower id when two candidates pull the same distance', () => {
    const result = snap({
      rect: { x: 500, y: 0, width: 100, height: 50 },
      candidates: [box('zulu', 504, 300), box('alpha', 496, 300)],
    });
    expect(result.position.x).toBe(496);
    expect(result.guides[0]?.nodeId).toBe('alpha');
  });

  it('prefers the lower id on the same side too', () => {
    const result = snap({
      rect: { x: 500, y: 0, width: 100, height: 50 },
      candidates: [box('zulu', 504, 300), box('alpha', 504, 200)],
    });
    expect(result.guides[0]?.nodeId).toBe('alpha');
  });

  it('compares ids as strings, so n10 sorts under n2 and the order is stable', () => {
    // Documented, not incidental: ids are opaque strings (design §4.1), and a
    // numeric-looking one is not a number. Both orderings are deterministic;
    // this pins WHICH.
    const first = snap({
      rect: { x: 500, y: 0, width: 100, height: 50 },
      candidates: [box('n2', 504, 300), box('n10', 496, 300)],
    });
    const flipped = snap({
      rect: { x: 500, y: 0, width: 100, height: 50 },
      candidates: [box('n10', 496, 300), box('n2', 504, 300)],
    });
    expect(first.guides[0]?.nodeId).toBe('n10');
    expect(flipped.guides[0]?.nodeId).toBe('n10');
  });
});

describe('snapToAlignment: the rest of the contract', () => {
  it('returns the rect untouched when nothing is near', () => {
    const result = snap({
      rect: { x: 1000, y: 1000, width: 100, height: 50 },
      candidates: [box('c', 0, 0)],
    });
    expect(result).toStrictEqual({
      position: { x: 1000, y: 1000 },
      guides: [],
      acquired: false,
    });
  });

  it('does not reach past the candidate radius, however aligned the node is', () => {
    const aligned = { x: 300, y: 0, width: 100, height: 50 };
    const near = snap({
      rect: aligned,
      candidates: [box('c', 302, 300)],
      radius: 400,
    });
    const far = snap({
      rect: aligned,
      candidates: [box('c', 302, 5000)],
      radius: 400,
    });
    expect(near.acquired).toBe(true);
    expect(far.acquired).toBe(false);
  });

  it('reads the LIVE rect from the node map, not the one the index snapshotted', () => {
    // The index is built at drag start (S3). If a node moved since, the map is
    // the authority for the arithmetic; the index is only the broad phase.
    const stale = box('c', 300, 0);
    const live = box('c', 302, 0);
    const result = snapToAlignment({
      ids: [],
      rect: { x: 304, y: 0, width: 100, height: 50 },
      nodes: nodesOf(live),
      index: buildSpatialHash([stale]),
      thresholdFlowUnits: 5,
      radius: defaultCandidateRadius,
    });
    expect(result.position.x).toBe(302);
  });

  it('skips a candidate that left the map mid-drag', () => {
    const result = snapToAlignment({
      ids: [],
      rect: { x: 302, y: 0, width: 100, height: 50 },
      nodes: new Map(),
      index: buildSpatialHash([box('gone', 300, 0)]),
      thresholdFlowUnits: 5,
      radius: defaultCandidateRadius,
    });
    expect(result.acquired).toBe(false);
  });

  it('emits at most one guide per axis, so the layer stays two lines', () => {
    const result = snap({
      rect: { x: 302, y: 202, width: 100, height: 50 },
      candidates: [box('a', 300, 200), box('b', 300, 200), box('c', 300, 200)],
    });
    expect(result.guides).toHaveLength(2);
    expect(new Set(result.guides.map((guide) => guide.axis))).toStrictEqual(new Set(['x', 'y']));
  });

  it('costs under 1 ms per call at 200 candidates', () => {
    const candidates = Array.from({ length: 200 }, (_, index) =>
      box(`n${index}`, (index % 20) * 180, Math.floor(index / 20) * 120),
    );
    const nodes = nodesOf(...candidates);
    const index = buildSpatialHash(candidates);
    const input: SnapToAlignmentInput = {
      ids: [],
      rect: { x: 902, y: 481, width: 100, height: 50 },
      nodes,
      index,
      thresholdFlowUnits: 5,
      radius: defaultCandidateRadius,
    };
    // Warm the shapes, then take the median of 21 so a GC pause cannot turn a
    // real budget into a flaky test.
    for (let run = 0; run < 50; run += 1) {
      snapToAlignment(input);
    }
    const samples: number[] = [];
    for (let run = 0; run < 21; run += 1) {
      const started = performance.now();
      snapToAlignment(input);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    expect(samples[10]).toBeLessThan(1);
  });
});

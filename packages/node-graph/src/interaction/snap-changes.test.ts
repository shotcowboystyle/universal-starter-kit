/**
 * The wiring, design §7.2: S1, S3, S5, S6 and S11. S10 is the guide layer's and
 * lives in `react-flow/SnapGuides.test.tsx`, because the component that renders
 * it is the only thing that can be asked how many `<line>` elements it made.
 *
 * S2, S4, S7, S8 and S9 belong to the snapper itself and are in
 * `snap-alignment.test.ts`. This file is about everything the snapper is not
 * allowed to know: which changes are a drag, when the index may be built, and
 * how grid and alignment share the two axes.
 */

import { describe, expect, it, vi } from 'vitest';

import { applySnapToChanges, createSnapSession, graphSnappingDefaults, snapContextOptions } from './snap-changes';
import type { SnapChange, SnapChangeNode, SnapContext } from './snap-changes';
import { buildSpatialHash } from './spatial-hash';
import type { SpatialHash, SpatialItem } from './spatial-hash';

const node = (id: string, x: number, y: number, width = 100, height = 50): SnapChangeNode => ({
  id,
  position: { x, y },
  initialWidth: width,
  initialHeight: height,
});

const drag = (id: string, x: number, y: number): SnapChange => ({
  type: 'position',
  id,
  position: { x, y },
  dragging: true,
});

/** Every change these tests read back is a drag, so a missing position is a bug. */
const positionOf = (change: SnapChange): { readonly x: number; readonly y: number } => {
  if (!change.position) {
    throw new Error(`change ${change.id} lost its position`);
  }
  return change.position;
};

const context = (overrides: Partial<SnapContext> & { nodes: readonly SnapChangeNode[] }) =>
  ({
    zoom: 1,
    session: createSnapSession(),
    ...overrides,
  }) satisfies SnapContext;

describe('snapContextOptions: S11, motion settings do not disable snapping', () => {
  it('leaves alignment on under animation: "none"', () => {
    const options = snapContextOptions({ animation: 'none' });
    expect(options.alignment).toBe(true);
    expect(options.animateGuides).toBe(false);
  });

  it('leaves alignment on under OS reduced motion', () => {
    const options = snapContextOptions({ reducedMotion: true });
    expect(options.alignment).toBe(true);
    expect(options.animateGuides).toBe(false);
  });

  it('animates the guides when motion is allowed', () => {
    expect(snapContextOptions({ animation: 'quick' }).animateGuides).toBe(true);
  });

  it('still snaps end to end with motion off', () => {
    const options = snapContextOptions({ animation: 'none' });
    const nodes = [node('a', 302, 0), node('c', 300, 400)];
    const result = applySnapToChanges(
      [drag('a', 302, 0)],
      context({ nodes, alignment: options.alignment, grid: options.grid }),
    );
    expect(result.guides).toHaveLength(1);
    expect(positionOf(result.changes[0])).toStrictEqual({ x: 300, y: 0 });
  });

  it('takes the coarse threshold under a finger and the fine one otherwise', () => {
    expect(snapContextOptions({ coarsePointer: true }).thresholdScreenPx).toBe(12);
    expect(snapContextOptions({}).thresholdScreenPx).toBe(8);
  });

  it('ships with alignment on and the grid off', () => {
    expect(graphSnappingDefaults.alignment).toBe(true);
    expect(graphSnappingDefaults.grid).toBeNull();
  });
});

describe('applySnapToChanges: S1, only a live drag is snapped', () => {
  const nodes = [node('a', 302, 0), node('c', 300, 400)];

  it('snaps a position change marked dragging', () => {
    const result = applySnapToChanges([drag('a', 302, 0)], context({ nodes }));
    expect(positionOf(result.changes[0])).toStrictEqual({ x: 300, y: 0 });
  });

  it('carries the snap into the closing frame, so the node lands on the line', () => {
    // React Flow's last change of a drag carries `dragging: false` AND the raw
    // pointer position (`XYDrag` end -> `updateNodePositions(dragItems, false)`,
    // system:2311). Leaving it alone puts the node back off the line the guide
    // just promised, which is measured in Chrome and is why this is snapped.
    const ctx = context({ nodes });
    applySnapToChanges([drag('a', 302, 0)], ctx);
    const result = applySnapToChanges(
      [{ type: 'position', id: 'a', position: { x: 302, y: 0 }, dragging: false }],
      ctx,
    );
    expect(positionOf(result.changes[0])).toStrictEqual({ x: 300, y: 0 });
    // The guides go with the drag, even though the position moved (S10).
    expect(result.guides).toStrictEqual([]);
  });

  it('leaves a dragging:false change alone when no drag was being snapped', () => {
    // Not a release — someone else writing a position. A fresh session is the
    // whole test for which of the two it is.
    const changes: SnapChange[] = [{ type: 'position', id: 'a', position: { x: 302, y: 0 }, dragging: false }];
    const result = applySnapToChanges(changes, context({ nodes }));
    expect(result.changes).toBe(changes);
    expect(result.guides).toStrictEqual([]);
  });

  it('forgets the drag once it closes, so the next one indexes a fresh world', () => {
    const ctx = context({ nodes });
    applySnapToChanges([drag('a', 302, 0)], ctx);
    applySnapToChanges([{ type: 'position', id: 'a', position: { x: 302, y: 0 }, dragging: false }], ctx);
    expect(ctx.session.key).toBeNull();
    expect(ctx.session.index).toBeNull();
  });

  it('leaves a programmatic move alone — layout, undo and paste are not drags', () => {
    const changes: SnapChange[] = [{ type: 'position', id: 'a', position: { x: 302, y: 0 } }];
    expect(applySnapToChanges(changes, context({ nodes })).changes).toBe(changes);
  });

  it('passes select, dimensions and remove changes through untouched', () => {
    const changes = [
      { type: 'select', id: 'a', selected: true },
      { type: 'dimensions', id: 'a', dimensions: { width: 100, height: 50 } },
      { type: 'remove', id: 'a' },
    ] as unknown as SnapChange[];
    expect(applySnapToChanges(changes, context({ nodes })).changes).toBe(changes);
  });

  it('does nothing at all when both grid and alignment are off', () => {
    const changes = [drag('a', 302, 0)];
    const result = applySnapToChanges(changes, context({ nodes, alignment: false, grid: null }));
    expect(result.changes).toBe(changes);
    expect(result.guides).toStrictEqual([]);
  });
});

describe('applySnapToChanges: S3, the index is built once per drag', () => {
  const nodes = [node('a', 0, 0), node('b', 300, 0), node('c', 600, 0), node('d', 900, 0)];

  it('builds once across a 30-change drag', () => {
    const buildIndex = vi.fn<(items: readonly SpatialItem[]) => SpatialHash>((items) => buildSpatialHash(items));
    const ctx = context({ nodes, buildIndex });
    for (let frame = 0; frame < 30; frame += 1) {
      applySnapToChanges([drag('a', 100 + frame, 0)], ctx);
    }
    expect(buildIndex).toHaveBeenCalledOnce();
  });

  it('leaves the dragged node out of its own index', () => {
    const buildIndex = vi.fn<(items: readonly SpatialItem[]) => SpatialHash>((items) => buildSpatialHash(items));
    applySnapToChanges([drag('a', 100, 0)], context({ nodes, buildIndex }));
    expect(buildIndex.mock.calls[0][0].map((item) => item.id)).toStrictEqual(['b', 'c', 'd']);
  });

  it('rebuilds for the NEXT drag, because the world moved in between', () => {
    const buildIndex = vi.fn<(items: readonly SpatialItem[]) => SpatialHash>((items) => buildSpatialHash(items));
    const ctx = context({ nodes, buildIndex });
    applySnapToChanges([drag('a', 100, 0)], ctx);
    applySnapToChanges([{ type: 'position', id: 'a', position: { x: 120, y: 0 }, dragging: false }], ctx);
    applySnapToChanges([drag('a', 130, 0)], ctx);
    expect(buildIndex).toHaveBeenCalledTimes(2);
  });

  it('rebuilds when the dragged SET changes, or the new member snaps to itself', () => {
    const buildIndex = vi.fn<(items: readonly SpatialItem[]) => SpatialHash>((items) => buildSpatialHash(items));
    const ctx = context({ nodes, buildIndex });
    applySnapToChanges([drag('a', 100, 0)], ctx);
    applySnapToChanges([drag('a', 100, 0), drag('b', 400, 0)], ctx);
    expect(buildIndex).toHaveBeenCalledTimes(2);
    expect(buildIndex.mock.calls[1][0].map((item) => item.id)).toStrictEqual(['c', 'd']);
  });
});

describe('applySnapToChanges: S5, grid and alignment compose per axis', () => {
  it('puts the node on the grid when no neighbor is in range', () => {
    const nodes = [node('a', 309, 205)];
    const result = applySnapToChanges([drag('a', 309, 205)], context({ nodes, grid: 16 }));
    expect(positionOf(result.changes[0])).toStrictEqual({ x: 304, y: 208 });
    expect(result.guides).toStrictEqual([]);
  });

  it('lets alignment override the axis a guide fired on, and only that one', () => {
    const nodes = [node('a', 309, 205), node('c', 300, 600)];
    const result = applySnapToChanges([drag('a', 309, 205)], context({ nodes, grid: 16 }));
    // x aligned to the neighbor's left edge; y still on the grid.
    expect(positionOf(result.changes[0])).toStrictEqual({ x: 300, y: 208 });
    expect(result.guides).toHaveLength(1);
    expect(result.guides[0].axis).toBe('x');
  });

  it('keeps the raw position on an unsnapped axis when the grid is off', () => {
    const nodes = [node('a', 305, 205), node('c', 300, 600)];
    const result = applySnapToChanges([drag('a', 305, 205)], context({ nodes, grid: null }));
    expect(positionOf(result.changes[0])).toStrictEqual({ x: 300, y: 205 });
  });

  it('runs the grid FIRST, so a node the grid carried into range still aligns', () => {
    // 309 is 9 from the neighbor's edge and outside an 8 px pull. The grid
    // moves it to 304, which is 4 away, and alignment then takes it.
    const nodes = [node('a', 309, 0), node('c', 300, 400)];
    const loose = applySnapToChanges([drag('a', 309, 0)], context({ nodes, grid: null }));
    expect(positionOf(loose.changes[0]).x).toBe(309);
    const gridded = applySnapToChanges([drag('a', 309, 0)], context({ nodes, grid: 16 }));
    expect(positionOf(gridded.changes[0]).x).toBe(300);
  });
});

describe('applySnapToChanges: S6, a multi-select drag keeps its shape', () => {
  const nodes = [node('a', 100, 100), node('b', 300, 100), node('c', 500, 100), node('anchor', 100, 400)];

  it('moves every selected node by ONE delta', () => {
    const changes = [drag('a', 102, 100), drag('b', 302, 100), drag('c', 502, 100)];
    const result = applySnapToChanges(changes, context({ nodes }));
    const positions = result.changes.map(positionOf);
    expect(positions).toStrictEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 500, y: 100 },
    ]);
  });

  it('preserves the relative geometry whatever the delta is', () => {
    const changes = [drag('a', 102, 100), drag('b', 302, 100), drag('c', 502, 100)];
    const before = changes.map(positionOf);
    const after = applySnapToChanges(changes, context({ nodes })).changes.map(positionOf);
    for (let index = 1; index < before.length; index += 1) {
      expect(after[index].x - after[0].x).toBe(before[index].x - before[0].x);
      expect(after[index].y - after[0].y).toBe(before[index].y - before[0].y);
    }
  });

  it("snaps the selection's BOUNDING BOX, not each node on its own", () => {
    // `c`'s own left edge is 2 from the anchor's; the union's is 402 from it.
    // A per-node snapper would move `c` and deform the selection.
    // A NARROW anchor, so none of the union's three x lines lands near one of
    // its three: a wide one puts its right edge under the union's, and the test
    // would pass for the wrong reason.
    const spread = [node('a', 100, 100), node('c', 502, 100), node('anchor', 500, 400, 20)];
    const changes = [drag('a', 100, 100), drag('c', 502, 100)];
    const result = applySnapToChanges(changes, context({ nodes: spread }));
    expect(result.changes).toBe(changes);
    expect(result.guides).toStrictEqual([]);
  });
});

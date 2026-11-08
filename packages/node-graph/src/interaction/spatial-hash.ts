/**
 * A uniform-grid spatial hash over node rects. Pure: no DOM, no React, no
 * `@xyflow`, so it runs in vitest under Node and in a worker later.
 *
 * Design §7.2 rule S3: the index is built ONCE at drag start from every
 * non-dragged node, and every frame of the drag queries it. Cell 256 flow
 * units, which is roughly a node and a gap — small enough that a query touches
 * a handful of buckets, large enough that a 200-node graph is a few hundred
 * cells rather than tens of thousands.
 *
 * `query` returns the EXACT overlap set, not the bucket contents. A broad phase
 * that hands back near misses would make every caller re-filter, and the one
 * caller there is (`snapToAlignment`) would then be the place a shared-edge
 * off-by-one lived. `rectsOverlap` from the model is the single definition of
 * touching, so the marquee and the snapper cannot disagree about it.
 */

import type { NodeId, Rect } from '../model/document';
import { rectsOverlap } from '../model/select';

/** 256 flow units: about one node plus its gap. Design §7.2 S3. */
export const defaultCellSize = 256;

export interface SpatialItem {
  readonly id: NodeId;
  readonly rect: Rect;
}

export interface SpatialHash {
  readonly cellSize: number;
  /** Items handed to `buildSpatialHash`, including any that were unindexable. */
  readonly size: number;
  /** Occupied buckets. Diagnostic — a cell size that fits the graph keeps it small. */
  readonly cellCount: number;
  /** Every item overlapping `rect`, in insertion order. */
  readonly query: (rect: Rect) => readonly SpatialItem[];
}

export interface SpatialHashOptions {
  readonly cellSize?: number;
}

interface CellSpan {
  readonly minCol: number;
  readonly maxCol: number;
  readonly minRow: number;
  readonly maxRow: number;
}

const empty: readonly SpatialItem[] = Object.freeze([]);

/**
 * `null` for a rect this grid cannot enumerate. A NaN coordinate overlaps
 * nothing under `rectsOverlap` anyway, and an infinite one would ask for an
 * infinite number of cells — the loop would never return, which is a worse
 * failure than a dropped node, and it would happen mid-drag.
 */
const cellSpan = (rect: Rect, cellSize: number): CellSpan | null => {
  const { x, y, width, height } = rect;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return {
    minCol: Math.floor(Math.min(x, x + width) / cellSize),
    maxCol: Math.floor(Math.max(x, x + width) / cellSize),
    minRow: Math.floor(Math.min(y, y + height) / cellSize),
    maxRow: Math.floor(Math.max(y, y + height) / cellSize),
  };
};

/** A string key, so a negative column is not a second bug on top of the first. */
const cellKey = (col: number, row: number): string => `${col}:${row}`;

export const buildSpatialHash = (items: Iterable<SpatialItem>, options: SpatialHashOptions = {}): SpatialHash => {
  const cellSize = options.cellSize ?? defaultCellSize;
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new RangeError(
      `[@repo/node-graph] spatial hash cellSize must be a positive finite number, got ${String(cellSize)}`,
    );
  }

  const list: SpatialItem[] = [];
  const cells = new Map<string, number[]>();

  for (const item of items) {
    const index = list.length;
    list.push(item);
    const span = cellSpan(item.rect, cellSize);
    if (!span) {
      continue;
    }
    for (let row = span.minRow; row <= span.maxRow; row += 1) {
      for (let col = span.minCol; col <= span.maxCol; col += 1) {
        const key = cellKey(col, row);
        const bucket = cells.get(key);
        if (bucket) {
          bucket.push(index);
        } else {
          cells.set(key, [index]);
        }
      }
    }
  }

  const query = (rect: Rect): readonly SpatialItem[] => {
    const span = cellSpan(rect, cellSize);
    if (!span || list.length === 0) {
      return empty;
    }
    const seen = new Set<number>();
    for (let row = span.minRow; row <= span.maxRow; row += 1) {
      for (let col = span.minCol; col <= span.maxCol; col += 1) {
        const bucket = cells.get(cellKey(col, row));
        if (!bucket) {
          continue;
        }
        for (const index of bucket) {
          seen.add(index);
        }
      }
    }
    if (seen.size === 0) {
      return empty;
    }
    const hits: number[] = [];
    for (const index of seen) {
      if (rectsOverlap(rect, list[index].rect)) {
        hits.push(index);
      }
    }
    if (hits.length === 0) {
      return empty;
    }
    // Insertion order, not cell order: the caller's tie-breaks and the
    // marquee's stability both read the order they gave us.
    hits.sort((a, b) => a - b);
    return hits.map((index) => list[index]);
  };

  return { cellSize, size: list.length, cellCount: cells.size, query };
};

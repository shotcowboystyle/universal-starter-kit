import { describe, expect, it } from 'vitest';

import { diffVisibleRows, flattenVisibleIds, isEmptyDiff } from './tree-view-motion';
import type { MotionTreeNode } from './tree-view-motion';

const tree: MotionTreeNode[] = [
  {
    id: 'src',
    children: [
      {
        id: 'components',
        children: [{ id: 'button' }, { id: 'input' }],
      },
      { id: 'index' },
    ],
  },
  { id: 'readme' },
];

const uniform = () => 36;

describe(flattenVisibleIds, () => {
  it('returns only roots when nothing is expanded', () => {
    expect(flattenVisibleIds(tree, new Set())).toStrictEqual(['src', 'readme']);
  });

  it('walks expanded branches in visual order', () => {
    expect(flattenVisibleIds(tree, new Set(['src']))).toStrictEqual(['src', 'components', 'index', 'readme']);
    expect(flattenVisibleIds(tree, new Set(['src', 'components']))).toStrictEqual([
      'src',
      'components',
      'button',
      'input',
      'index',
      'readme',
    ]);
  });

  it('ignores expanded ids for collapsed ancestors', () => {
    // "components" is expanded but its parent is not — children stay hidden.
    expect(flattenVisibleIds(tree, new Set(['components']))).toStrictEqual(['src', 'readme']);
  });
});

describe(diffVisibleRows, () => {
  it('marks revealed children as entering and pushes rows below down', () => {
    const prev = flattenVisibleIds(tree, new Set(['src']));
    const next = flattenVisibleIds(tree, new Set(['src', 'components']));
    const diff = diffVisibleRows(prev, next, uniform);

    expect([...diff.entering]).toStrictEqual(['button', 'input']);
    // Rows below the expansion start 2 rows above their new slot.
    expect(diff.deltas.get('index')).toBe(-72);
    expect(diff.deltas.get('readme')).toBe(-72);
    // Rows above the expansion do not move.
    expect(diff.deltas.has('src')).toBe(false);
    expect(diff.deltas.has('components')).toBe(false);
  });

  it('slides surviving rows up over a collapsed branch', () => {
    const prev = flattenVisibleIds(tree, new Set(['src', 'components']));
    const next = flattenVisibleIds(tree, new Set(['src']));
    const diff = diffVisibleRows(prev, next, uniform);

    expect(diff.entering.size).toBe(0);
    // "button"/"input" are simply gone; below rows start 2 rows lower.
    expect(diff.deltas.get('index')).toBe(72);
    expect(diff.deltas.get('readme')).toBe(72);
  });

  it('uses per-row heights for offsets', () => {
    const heights = new Map([
      ['src', 36],
      ['components', 36],
      ['button', 48],
      ['input', 20],
      ['index', 36],
      ['readme', 36],
    ]);
    const prev = flattenVisibleIds(tree, new Set(['src']));
    const next = flattenVisibleIds(tree, new Set(['src', 'components']));
    const diff = diffVisibleRows(prev, next, (id) => heights.get(id) ?? 0);
    expect(diff.deltas.get('index')).toBe(-(48 + 20));
  });

  it('returns an empty diff when nothing changed', () => {
    const ids = flattenVisibleIds(tree, new Set(['src']));
    const diff = diffVisibleRows(ids, ids, uniform);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('handles the root-level expand of the first branch', () => {
    const prev = flattenVisibleIds(tree, new Set());
    const next = flattenVisibleIds(tree, new Set(['src']));
    const diff = diffVisibleRows(prev, next, uniform);
    expect([...diff.entering]).toStrictEqual(['components', 'index']);
    expect(diff.deltas.get('readme')).toBe(-72);
    expect(diff.deltas.has('src')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { treeRevealExpansion, treeRevealOffset } from './treeViewReveal';

const nodes = [
  {
    id: 'folders',
    children: [
      {
        id: 'archive',
        children: Array.from({ length: 500 }, (_, index) => ({ id: `item-${index}` })),
      },
    ],
  },
  { id: 'other', children: [{ id: 'other-item' }] },
];

describe('tree reveal ancestors', () => {
  it('finds the exact last leaf of a 500-item branch and preserves unrelated expansion', () => {
    const expanded = new Set(['other']);
    expect(treeRevealExpansion(nodes, expanded, 'item-499')).toEqual(new Set(['other', 'folders', 'archive']));
    expect(expanded).toEqual(new Set(['other']));
  });

  it('does not expand the target branch itself', () => {
    expect(treeRevealExpansion(nodes, new Set(), 'archive')).toEqual(new Set(['folders']));
  });

  it('preserves the set when the target is already exposed', () => {
    const expanded = new Set(['folders', 'archive']);
    expect(treeRevealExpansion(nodes, expanded, 'item-499')).toBe(expanded);
  });

  it('does not substitute a prefix, ancestor or similarly named leaf for a missing ID', () => {
    expect(treeRevealExpansion(nodes, new Set(), 'item-500')).toBeUndefined();
    expect(treeRevealExpansion(nodes, new Set(), 'item')).toBeUndefined();
    expect(treeRevealExpansion([], new Set(), 'folders')).toBeUndefined();
  });

  it('reveals a root without expanding its children', () => {
    const expanded = new Set<string>();
    expect(treeRevealExpansion(nodes, expanded, 'folders')).toBe(expanded);
  });
});

describe('tree reveal measured offsets', () => {
  it('uses the actual layout of a distant variable-height row, not index times an estimate', () => {
    const heights = Array.from({ length: 500 }, (_, index) => (index % 2 === 0 ? 32 : 80));
    const y = heights.slice(0, 499).reduce((sum, height) => sum + height, 0);
    expect(y).toBe(27920);
    expect(treeRevealOffset({ y, height: heights[499] }, 0, 240)).toBe(27760);
    expect(treeRevealOffset({ y, height: heights[499] }, 27760, 240)).toBe(27760);
  });

  it('corrects again when virtualization replaces an estimate with a taller measurement', () => {
    expect(treeRevealOffset({ y: 27920, height: 32 }, 0, 240)).toBe(27712);
    expect(treeRevealOffset({ y: 27920, height: 80 }, 27712, 240)).toBe(27760);
  });

  it('leaves a fully visible row in place', () => {
    expect(treeRevealOffset({ y: 300, height: 80 }, 250, 240)).toBe(250);
  });

  it('reveals a row above the viewport at its top', () => {
    expect(treeRevealOffset({ y: 120, height: 80 }, 250, 240)).toBe(120);
  });

  it('aligns the top of a row taller than the viewport without oscillating', () => {
    expect(treeRevealOffset({ y: 120, height: 300 }, 250, 240)).toBe(120);
    expect(treeRevealOffset({ y: 120, height: 300 }, 120, 240)).toBe(120);
  });

  it.each([
    [{ y: 20, height: 32 }, 0, 0],
    [{ y: 20, height: 0 }, 0, 240],
    [{ y: Number.NaN, height: 32 }, 0, 240],
    [{ y: 20, height: 32 }, Number.NaN, 240],
    [{ y: 20, height: 32 }, 0, Number.POSITIVE_INFINITY],
  ])('waits for usable geometry: %o, %s, %s', (layout, offset, height) => {
    expect(treeRevealOffset(layout, offset, height)).toBeUndefined();
  });
});

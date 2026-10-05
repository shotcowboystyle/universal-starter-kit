/**
 * TreeView layout — shared tokens, not private pixel tables.
 */
import { defaultKnobs, resolveKnobs } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import {
  TREE_EDGE_ROW_PAD,
  TREE_LIFT_SHADOW,
  TREE_VIEWPORT_ROWS,
  treeDefaultHeight,
  treeEdgeRowPad,
  treeIndentStep,
} from './treeViewLayout';

function knobs(overrides: Partial<typeof defaultKnobs> = {}) {
  return resolveKnobs({ ...defaultKnobs, ...overrides }).knobProps;
}

describe('treeEdgeRowPad', () => {
  it('is the shared SP-EDGE token map (same stops as getTableCellPadding)', () => {
    expect(TREE_EDGE_ROW_PAD.small).toEqual({
      paddingHorizontal: '$1.5',
      paddingVertical: '$2',
    });
    expect(TREE_EDGE_ROW_PAD.medium).toEqual({
      paddingHorizontal: '$2',
      paddingVertical: '$3',
    });
    expect(TREE_EDGE_ROW_PAD.large).toEqual({
      paddingHorizontal: '$3',
      paddingVertical: '$4',
    });
  });

  it('steps with space, not a private compressed/default pixel table', () => {
    expect(treeEdgeRowPad('small')).toBe(TREE_EDGE_ROW_PAD.small);
    expect(treeEdgeRowPad('medium')).toBe(TREE_EDGE_ROW_PAD.medium);
    expect(treeEdgeRowPad('large')).toBe(TREE_EDGE_ROW_PAD.large);
    expect(treeEdgeRowPad('unknown')).toBe(TREE_EDGE_ROW_PAD.medium);
  });
});

describe('treeIndentStep', () => {
  it('is proportional to nestedControl.px (size), not a space-keyed table', () => {
    const small = knobs({ size: 'small' }).nestedControl.px;
    const medium = knobs({ size: 'medium' }).nestedControl.px;
    const large = knobs({ size: 'large' }).nestedControl.px;
    expect(treeIndentStep(small)).toBe(small / 2);
    expect(treeIndentStep(medium)).toBe(medium / 2);
    expect(treeIndentStep(large)).toBe(large / 2);
    expect(treeIndentStep(medium)).not.toBe(treeIndentStep(small));
  });
});

describe('treeDefaultHeight', () => {
  it('derives the viewport from nestedControl, not 320/400/480 literals', () => {
    const medium = knobs({ size: 'medium' }).nestedControl.px;
    expect(TREE_VIEWPORT_ROWS).toBe(12.5);
    expect(treeDefaultHeight(medium)).toBe(medium * TREE_VIEWPORT_ROWS);
    expect(treeDefaultHeight(medium)).toBe(400);
    expect(treeDefaultHeight(knobs({ size: 'small' }).nestedControl.px)).not.toBe(400);
  });
});

describe('TREE_LIFT_SHADOW', () => {
  it('uses a theme token, not a hex (design-audit inline color)', () => {
    expect(TREE_LIFT_SHADOW.shadowColor).toBe('$shadowColor');
    expect(String(TREE_LIFT_SHADOW.shadowColor)).not.toMatch(/^#/);
  });
});

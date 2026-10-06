/**
 * TreeView layout helpers — shared knob tokens, not private pixel tables.
 *
 * Row inset is the SP-EDGE map (same stops as table-primitives
 * `getTableCellPadding`). Indent and default viewport ride `nestedControl.px`
 * so size, not a parallel table, is the source of truth.
 */

export const TREE_EDGE_ROW_PAD = {
  small: { paddingHorizontal: '$1.5', paddingVertical: '$2' },
  medium: { paddingHorizontal: '$2', paddingVertical: '$3' },
  large: { paddingHorizontal: '$3', paddingVertical: '$4' },
} as const;

export type TreeEdgeRowPad = (typeof TREE_EDGE_ROW_PAD)[keyof typeof TREE_EDGE_ROW_PAD];

export function treeEdgeRowPad(space: string): TreeEdgeRowPad {
  if (space === 'small' || space === 'large') {
    return TREE_EDGE_ROW_PAD[space];
  }
  return TREE_EDGE_ROW_PAD.medium;
}

/** Indent per depth: half the nested row so it stays proportional to size. */
export function treeIndentStep(nestedPx: number): number {
  return nestedPx / 2;
}

/**
 * Default viewport in nested-row units. Medium nestedControl is 32px, so
 * 12.5 rows keeps the historical 400px default.
 */
export const TREE_VIEWPORT_ROWS = 12.5;

export function treeDefaultHeight(nestedPx: number): number {
  return nestedPx * TREE_VIEWPORT_ROWS;
}

/**
 * Lifted-row shadow. Gesture state, not the tree's resting elevation
 * knob. `$shadowColor` is the theme token — never a hex (design-audit).
 */
export const TREE_LIFT_SHADOW = {
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.15,
  shadowRadius: 20,
} as const;

/**
 * Stacked-group corner geometry — the one canonical mapping from a row's
 * position in a flush stack to its corner radii (Axiom 1 R-OUTER: a nested
 * rounded child directly against the frame rounds only the outer corners;
 * inner boundaries stay square).
 *
 * A "stacked group" is any run of flush siblings composing one visual unit —
 * segmented buttons, grouped inputs, accordion/sidebar rows, list rows. The
 * FIRST item rounds only its leading corners, the LAST only its trailing
 * corners, everything between is square, and a lone item keeps the plain
 * radius. State highlights (hover/press/selection) paint on the row surface
 * itself, so they inherit exactly this geometry — a uniformly rounded
 * highlight against a straight interior seam is the defect this module
 * exists to prevent. Web focus outlines follow the element's border-radius,
 * so the focus ring inherits the same geometry for free.
 *
 * It lives in `@repo/theme` because both `components`
 * (Accordion, List) and `forms` (ToggleGroup, ControlGroup) consume it and
 * the dependency direction is components → forms → theme (same reasoning as
 * menuRow.ts). Corners are LOGICAL (start/end) so RTL flips the rounding
 * with the items — physical corners would land rounded edges on interior
 * seams (the ControlGroup/ToggleGroup precedent).
 *
 * Overlay-clipped stacks (DropdownMenu/Select rows via `menuRowFrame`,
 * table frames) are the CONTAINER-CLIP arm of the same rule: rows stay flat
 * and the rounded overflow-hidden container cuts the outer corners. Use that
 * arm when a rounded clipping container already exists; use this arm when
 * the rows themselves are the outermost painted surface.
 */

import { createContext, useContext } from 'react';

/** A row's position within its stacked group. */
export type GroupPosition = 'only' | 'first' | 'middle' | 'last';

/** Stacking direction: vertical stacks round top/bottom, horizontal start/end. */
export type GroupOrientation = 'horizontal' | 'vertical';

/** Resolve a row index to its group position (count <= 1 is "only"). */
export function getGroupPosition(index: number, count: number): GroupPosition {
  if (count <= 1) {
    return 'only';
  }
  if (index <= 0) {
    return 'first';
  }
  if (index >= count - 1) {
    return 'last';
  }
  return 'middle';
}

// A type alias (not interface) so the fragment stays assignable to
// Record<string, unknown>-typed style bags.
// oxlint-disable-next-line typescript/consistent-type-definitions
export type StackRadiusFragment = {
  borderStartStartRadius: string | number;
  borderStartEndRadius: string | number;
  borderEndStartRadius: string | number;
  borderEndEndRadius: string | number;
};

/**
 * Corner fragment for a row whose leading/trailing edge may or may not be
 * the group's outer edge. `start` is the top edge (vertical) or inline-start
 * edge (horizontal); `end` the opposite. This is the low-level arm for rows
 * whose outer-edge status is conditional — an open accordion trigger's
 * bottom edge abuts its own content, so its bottom corners go square even on
 * the last item.
 */
export function stackEdgeRadius(
  radius: string | number | undefined,
  edges: { start?: boolean; end?: boolean },
  orientation: GroupOrientation = 'vertical',
): StackRadiusFragment {
  const r = radius ?? 0;
  const start = edges.start ? r : 0;
  const end = edges.end ? r : 0;
  if (orientation === 'horizontal') {
    return {
      borderStartStartRadius: start,
      borderEndStartRadius: start,
      borderStartEndRadius: end,
      borderEndEndRadius: end,
    };
  }
  return {
    borderStartStartRadius: start,
    borderStartEndRadius: start,
    borderEndStartRadius: end,
    borderEndEndRadius: end,
  };
}

/**
 * The complete corner fragment for a row at `position` in a stacked group.
 * Spread it onto the row surface (the element that paints hover/press/
 * selection) — never cherry-pick single corners out of it.
 */
export function stackRadiusProps(
  position: GroupPosition,
  radius: string | number | undefined,
  orientation: GroupOrientation = 'vertical',
): StackRadiusFragment {
  return stackEdgeRadius(
    radius,
    {
      start: position === 'first' || position === 'only',
      end: position === 'last' || position === 'only',
    },
    orientation,
  );
}

/**
 * Group containers provide each item's position so nested compound parts
 * (an Accordion.Trigger inside an Accordion.Item) resolve their geometry
 * without prop drilling. `undefined` means "not inside a stacked group" —
 * consumers treat that as "only".
 */
export const GroupPositionContext = createContext<GroupPosition | undefined>(undefined);

/** The current row's position within its stacked group, if any. */
export function useGroupPosition(): GroupPosition | undefined {
  return useContext(GroupPositionContext);
}

/**
 * Pure expand/collapse motion math for the TreeView.
 *
 * Everything here is platform-agnostic and side-effect free (same discipline
 * as `kanbanDnd.ts`) so web and native share one source of truth and the
 * logic stays unit-testable without a DOM.
 *
 * Motion vocabulary (Axiom 4): a toggle is a *discrete jump* — surviving rows
 * FLIP from their previous offset to their new one and newly revealed rows
 * fade in, all tweened by the component layer with `knobProps.transition`.
 * Offsets are expressed as transform translate deltas (never layout
 * props) so the same math is native-driver safe. Initial mount never animates
 * (mount is not a jump) and `animation: none` / reduced motion skips the
 * machine entirely.
 */

/** Minimal tree shape needed to compute visible rows. */
export interface MotionTreeNode {
  id: string;
  children?: MotionTreeNode[];
}

/**
 * Ids of the rows a tree renders for a given expansion state, in visual
 * order. Mirrors the component's flatten walk so motion diffs and rendering
 * can never disagree about what is visible.
 */
export function flattenVisibleIds(nodes: readonly MotionTreeNode[], expandedIds: ReadonlySet<string>): string[] {
  const result: string[] = [];
  const walk = (items: readonly MotionTreeNode[]) => {
    for (const node of items) {
      result.push(node.id);
      if (node.children && node.children.length > 0 && expandedIds.has(node.id)) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return result;
}

/** One toggle's worth of motion: who fades in, and who slides from where. */
export interface TreeRowMotionDiff {
  /** Rows that just became visible (expand) — enter with fade/slide. */
  entering: Set<string>;
  /**
   * Transform offset (px) a surviving row starts at so it begins the tween at
   * its previous visual position (FLIP invert). Positive = the row starts
   * lower than its new slot (collapse above it), negative = higher (expand
   * above it). Rows with a zero delta are omitted.
   */
  deltas: Map<string, number>;
}

/**
 * Diff two visible-row lists into FLIP deltas + entering rows.
 *
 * `getHeight` supplies each row's height in px (measured when available,
 * estimated otherwise) so offsets stay correct with mixed row heights.
 * Rows removed by a collapse simply unmount — the closing motion is carried
 * by the surviving rows sliding up over the vacated space, which keeps the
 * whole animation transform-only (no height/layout tweens).
 */
export function diffVisibleRows(
  prevIds: readonly string[],
  nextIds: readonly string[],
  getHeight: (id: string) => number,
): TreeRowMotionDiff {
  const entering = new Set<string>();
  const deltas = new Map<string, number>();

  const prevOffsets = new Map<string, number>();
  let offset = 0;
  for (const id of prevIds) {
    prevOffsets.set(id, offset);
    offset += getHeight(id);
  }

  let nextOffset = 0;
  for (const id of nextIds) {
    const prevOffset = prevOffsets.get(id);
    if (prevOffset === undefined) {
      entering.add(id);
    } else {
      const delta = prevOffset - nextOffset;
      if (delta !== 0) {
        deltas.set(id, delta);
      }
    }
    nextOffset += getHeight(id);
  }

  return { entering, deltas };
}

/** True when a diff carries no motion (toggle produced an identical list). */
export function isEmptyDiff(diff: TreeRowMotionDiff): boolean {
  return diff.entering.size === 0 && diff.deltas.size === 0;
}

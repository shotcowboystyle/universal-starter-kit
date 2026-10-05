/**
 * Pure drag-reorder math and keyboard state machine for the TreeView.
 *
 * Everything here is platform-agnostic and side-effect free (same discipline
 * as `kanbanDnd.ts` / `treeViewMotion.ts`) so the logic stays unit-testable
 * without a DOM and a future native fork shares one source of truth.
 *
 * Coordinate vocabulary (mirrors kanbanDnd):
 * - "original index": a node's index in its parent's `children` array (the
 *   dragged node still occupies its slot — data is never mutated mid-drag).
 * - "without-dragged index" (wd): index in the sibling list with the dragged
 *   node removed. Drop targets (`TreeDropTarget.index`) always use wd
 *   coordinates, so a target equals the final position after the drop.
 *
 * The keyboard grammar is the kanban grammar mapped onto a tree:
 * up/down move the insertion point among the current parent's positions,
 * right nests into the previous sibling, left un-nests to after the parent.
 */

// ── Types ─────────────────────────────────────────────────────

/** Minimal tree shape the DnD math needs (TreeNode satisfies this). */
export interface DndTreeNode {
  id: string;
  label?: string;
  children?: DndTreeNode[];
}

/** Where the dragged node would land if dropped now. */
export interface TreeDropTarget {
  /** Destination parent id; null = top level. */
  parentId: string | null;
  /** Insertion index among the parent's children (wd coordinates, 0..wdCount). */
  index: number;
}

/** Active drag session (source never changes while lifted). */
export interface TreeDragSession {
  nodeId: string;
  sourceParentId: string | null;
  /** Original index of the lifted node in its parent's children. */
  sourceIndex: number;
  target: TreeDropTarget;
}

export type TreeMoveDirection = 'up' | 'down' | 'left' | 'right';

/** Flattened visible row enriched with the structure DnD math needs. */
export interface TreeDndRow {
  id: string;
  parentId: string | null;
  /** Index within the parent's children (original coordinates). */
  childIndex: number;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

// ── Recognition constants (gesture bands, not animation timing) ──

/**
 * Row-fraction bands for the pointer drop model (VS Code / Notion consensus):
 * the top band inserts before the row, the bottom band inserts after it, and
 * the middle band nests into it. Recognition geometry is exempt from motion timing.
 */
export const DROP_BAND_BEFORE = 0.25;
export const DROP_BAND_AFTER = 0.75;

// ── Structure lookups ─────────────────────────────────────────

/** Node + its location, or null when the id is absent. */
export function locateNode(
  nodes: readonly DndTreeNode[],
  id: string,
): { node: DndTreeNode; parentId: string | null; index: number } | null {
  const walk = (
    items: readonly DndTreeNode[],
    parentId: string | null,
  ): { node: DndTreeNode; parentId: string | null; index: number } | null => {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) {
        return { node: items[i], parentId, index: i };
      }
      const found = items[i].children ? walk(items[i].children!, items[i].id) : null;
      if (found) {
        return found;
      }
    }
    return null;
  };
  return walk(nodes, null);
}

/** Children array of a parent (null = the roots). Missing parent → empty. */
export function childrenOf(nodes: readonly DndTreeNode[], parentId: string | null): readonly DndTreeNode[] {
  if (parentId === null) {
    return nodes;
  }
  const located = locateNode(nodes, parentId);
  return located?.node.children ?? [];
}

/** Ids of a node and every descendant (the unit that moves together). */
export function subtreeIds(nodes: readonly DndTreeNode[], id: string): Set<string> {
  const into = new Set<string>();
  const located = locateNode(nodes, id);
  if (!located) {
    return into;
  }
  const walk = (node: DndTreeNode) => {
    into.add(node.id);
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(located.node);
  return into;
}

/** Visible rows for a given expansion state, with DnD structure attached. */
export function flattenDndRows(nodes: readonly DndTreeNode[], expandedIds: ReadonlySet<string>): TreeDndRow[] {
  const result: TreeDndRow[] = [];
  const walk = (items: readonly DndTreeNode[], parentId: string | null, depth: number) => {
    for (let i = 0; i < items.length; i++) {
      const node = items[i];
      const hasChildren = (node.children?.length ?? 0) > 0;
      const isExpanded = hasChildren && expandedIds.has(node.id);
      result.push({ id: node.id, parentId, childIndex: i, depth, hasChildren, isExpanded });
      if (isExpanded) {
        walk(node.children!, node.id, depth + 1);
      }
    }
  };
  walk(nodes, null, 0);
  return result;
}

/** Child count of a parent in wd coordinates for an active session. */
export function wdChildCount(
  nodes: readonly DndTreeNode[],
  session: Pick<TreeDragSession, 'nodeId' | 'sourceParentId'>,
  parentId: string | null,
): number {
  const count = childrenOf(nodes, parentId).length;
  return session.sourceParentId === parentId ? Math.max(count - 1, 0) : count;
}

/** Convert an original child index to wd coordinates for an active session. */
export function toWdIndex(
  session: Pick<TreeDragSession, 'sourceParentId' | 'sourceIndex'>,
  parentId: string | null,
  childIndex: number,
): number {
  return parentId === session.sourceParentId && childIndex > session.sourceIndex ? childIndex - 1 : childIndex;
}

// ── Keyboard drag state machine (WAI-ARIA drag pattern) ───────

/** Begin a keyboard drag session. Returns null when the node does not exist. */
export function treeKeyboardLift(nodes: readonly DndTreeNode[], nodeId: string): TreeDragSession | null {
  const located = locateNode(nodes, nodeId);
  if (!located) {
    return null;
  }
  return {
    nodeId,
    sourceParentId: located.parentId,
    sourceIndex: located.index,
    // wd coords: with the node removed, re-inserting at its original index
    // is the identity drop.
    target: { parentId: located.parentId, index: located.index },
  };
}

/**
 * Move the drop target one step. Returns the same session object when the
 * move hits a boundary so callers can detect no-ops by identity.
 *
 * Grammar: up/down step among the current parent's insertion positions,
 * right nests into the previous sibling (append as its last child), left
 * un-nests (insert after the current parent in the grandparent).
 */
export function treeKeyboardMove(
  session: TreeDragSession,
  nodes: readonly DndTreeNode[],
  direction: TreeMoveDirection,
): TreeDragSession {
  const { target } = session;
  if (direction === 'up') {
    if (target.index <= 0) {
      return session;
    }
    return { ...session, target: { ...target, index: target.index - 1 } };
  }
  if (direction === 'down') {
    const max = wdChildCount(nodes, session, target.parentId);
    if (target.index >= max) {
      return session;
    }
    return { ...session, target: { ...target, index: target.index + 1 } };
  }
  if (direction === 'right') {
    // Nest into the sibling just above the insertion point.
    if (target.index <= 0) {
      return session;
    }
    const siblings = childrenOf(nodes, target.parentId).filter((c) => c.id !== session.nodeId);
    const prev = siblings[target.index - 1];
    if (!prev) {
      return session;
    }
    return {
      ...session,
      target: { parentId: prev.id, index: wdChildCount(nodes, session, prev.id) },
    };
  }
  // left: un-nest — become the next sibling of the current parent.
  if (target.parentId === null) {
    return session;
  }
  const parentLoc = locateNode(nodes, target.parentId);
  if (!parentLoc) {
    return session;
  }
  return {
    ...session,
    target: {
      parentId: parentLoc.parentId,
      index: toWdIndex(session, parentLoc.parentId, parentLoc.index) + 1,
    },
  };
}

export interface TreeDropResult {
  /** False when the node lands exactly where it started. */
  commit: boolean;
  from: { parentId: string | null; index: number };
  to: TreeDropTarget;
}

/** Resolve a drop for the current target (keyboard and pointer share this). */
export function resolveTreeDrop(
  session: Pick<TreeDragSession, 'sourceParentId' | 'sourceIndex' | 'target'>,
): TreeDropResult {
  const { sourceParentId, sourceIndex, target } = session;
  return {
    commit: target.parentId !== sourceParentId || target.index !== sourceIndex,
    from: { parentId: sourceParentId, index: sourceIndex },
    to: target,
  };
}

// ── Pointer hit-testing ───────────────────────────────────────

/** Visual result of a hit-test: a line between rows or a nest-into parent. */
export type TreeDropIndicator =
  | {
      kind: 'line';
      /** The line renders above the visible row at this flat index (rows.length = list end). */
      flatIndex: number;
      /** Indent depth the line should render at. */
      depth: number;
    }
  | { kind: 'into'; parentId: string };

export interface TreeDropHit {
  target: TreeDropTarget;
  indicator: TreeDropIndicator;
}

export interface TreeDropHitOptions {
  /** Pointer y in list content coordinates (client y − list top + scrollOffset). */
  localY: number;
  /** Visible rows in visual order (dragged subtree included, still in place). */
  rows: readonly TreeDndRow[];
  /** Row height in px (measured when available, estimated otherwise). */
  getHeight: (id: string) => number;
  session: Pick<TreeDragSession, 'nodeId' | 'sourceParentId' | 'sourceIndex'>;
  /** Ids of the dragged node and its descendants (invalid drop zone). */
  draggedSubtree: ReadonlySet<string>;
}

/**
 * Drop target + indicator for a pointer at `localY`, or null when the pointer
 * sits over the dragged subtree (callers keep their previous target).
 *
 * Band model per row (recognition constants above): top band inserts before
 * the row, bottom band inserts after it (which for an expanded branch means
 * first-child position), middle band nests into the row (append as last
 * child) — the parent-highlight case.
 */
export function treeDropTargetForY({
  localY,
  rows,
  getHeight,
  session,
  draggedSubtree,
}: TreeDropHitOptions): TreeDropHit | null {
  let top = 0;
  let row: TreeDndRow | null = null;
  let rowTop = 0;
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const h = getHeight(rows[i].id);
    if (localY < top + h) {
      row = rows[i];
      rowTop = top;
      rowIndex = i;
      break;
    }
    top += h;
  }

  if (!row) {
    // Beyond the last row: append at the top level.
    const rootCount = rows.filter((r) => r.parentId === null && !draggedSubtree.has(r.id)).length;
    return {
      target: { parentId: null, index: rootCount },
      indicator: { kind: 'line', flatIndex: rows.length, depth: 0 },
    };
  }

  if (draggedSubtree.has(row.id)) {
    return null;
  }

  const fraction = (localY - rowTop) / getHeight(row.id);

  if (fraction < DROP_BAND_BEFORE) {
    return {
      target: { parentId: row.parentId, index: toWdIndex(session, row.parentId, row.childIndex) },
      indicator: { kind: 'line', flatIndex: rowIndex, depth: row.depth },
    };
  }

  if (fraction >= DROP_BAND_AFTER) {
    if (row.isExpanded) {
      // After an expanded branch = its first-child position.
      return {
        target: { parentId: row.id, index: 0 },
        indicator: { kind: 'line', flatIndex: rowIndex + 1, depth: row.depth + 1 },
      };
    }
    return {
      target: {
        parentId: row.parentId,
        index: toWdIndex(session, row.parentId, row.childIndex) + 1,
      },
      indicator: { kind: 'line', flatIndex: rowIndex + 1, depth: row.depth },
    };
  }

  // Middle band: nest into the row (append as last child).
  return {
    target: { parentId: row.id, index: wdChildCountFromRows(rows, session, row.id) },
    indicator: { kind: 'into', parentId: row.id },
  };
}

/**
 * wd child count derived from the visible rows only — collapsed children are
 * not visible, so nest-into a collapsed/leaf row appends at index equal to
 * its wd child count in the *data*; callers with the data should prefer
 * `wdChildCount`. This row-based variant exists so the hit-test needs no tree
 * walk; both agree for expanded parents and for leaves (0).
 */
function wdChildCountFromRows(
  rows: readonly TreeDndRow[],
  session: Pick<TreeDragSession, 'nodeId' | 'sourceParentId'>,
  parentId: string,
): number {
  let count = 0;
  for (const r of rows) {
    if (r.parentId === parentId && r.id !== session.nodeId) {
      count++;
    }
  }
  return count;
}

/**
 * Indicator for a keyboard target. Falls back to the nest-into highlight when
 * the destination parent has no visible children (collapsed or empty), where
 * no between-rows line exists.
 */
export function indicatorForTarget(
  rows: readonly TreeDndRow[],
  session: Pick<TreeDragSession, 'nodeId' | 'sourceParentId' | 'sourceIndex'>,
  target: TreeDropTarget,
): TreeDropIndicator {
  const visibleSiblings: { row: TreeDndRow; flatIndex: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.parentId === target.parentId && r.id !== session.nodeId) {
      visibleSiblings.push({ row: r, flatIndex: i });
    }
  }

  if (visibleSiblings.length === 0) {
    return target.parentId === null
      ? { kind: 'line', flatIndex: 0, depth: 0 }
      : { kind: 'into', parentId: target.parentId };
  }

  if (target.index < visibleSiblings.length) {
    const at = visibleSiblings[target.index];
    return { kind: 'line', flatIndex: at.flatIndex, depth: at.row.depth };
  }

  // Append position: after the last visible sibling's whole subtree.
  const last = visibleSiblings[visibleSiblings.length - 1];
  let flatIndex = last.flatIndex + 1;
  while (flatIndex < rows.length && rows[flatIndex].depth > last.row.depth) {
    flatIndex++;
  }
  return { kind: 'line', flatIndex, depth: last.row.depth };
}

// ── Move application (immutable) ──────────────────────────────

/**
 * Apply a move to a tree, returning a new tree (nodes untouched on invalid
 * moves: unknown node, target inside the dragged subtree). `target.index` is
 * in wd coordinates, matching `onNodeMove` payloads, so consumers can apply
 * the callback directly: `setNodes((n) => applyTreeMove(n, nodeId, target))`.
 */
export function applyTreeMove<N extends DndTreeNode>(nodes: readonly N[], nodeId: string, target: TreeDropTarget): N[] {
  if (
    target.parentId !== null &&
    (subtreeIds(nodes, nodeId).has(target.parentId) || !locateNode(nodes, target.parentId))
  ) {
    return nodes.slice();
  }

  let moved: N | null = null;
  const remove = (items: readonly N[]): N[] => {
    const result: N[] = [];
    for (const item of items) {
      if (item.id === nodeId) {
        moved = item;
        continue;
      }
      if (item.children && item.children.length > 0) {
        const children = remove(item.children as N[]);
        result.push(children === item.children ? item : { ...item, children });
      } else {
        result.push(item);
      }
    }
    return result;
  };

  const removed = remove(nodes);
  if (!moved) {
    return nodes.slice();
  }
  const node = moved as N;

  const insertWalk = (items: N[], parentId: string | null): N[] => {
    if (parentId === target.parentId) {
      const index = Math.max(0, Math.min(target.index, items.length));
      return [...items.slice(0, index), node, ...items.slice(index)];
    }
    return items.map((item) => {
      const isTargetParent = item.id === target.parentId;
      if (!isTargetParent && !item.children?.length) {
        return item;
      }
      const children = insertWalk((item.children ?? []) as N[], item.id);
      return children === item.children ? item : { ...item, children };
    });
  };

  return insertWalk(removed, null);
}

// ── Screen-reader announcements ───────────────────────────────

export type TreeDragAnnouncement =
  | {
      type: 'lift' | 'move' | 'drop';
      node: string;
      /** Destination parent label; null = top level (caller localizes). */
      parent: string | null;
      position: number;
      count: number;
    }
  | { type: 'cancel'; node: string; parent: string | null };

/**
 * Structured announcement payload for the aria-live region. Positions are
 * 1-based and `count` is the sibling list's size after the pending drop,
 * matching the kanban grammar's "position 2 of 3" phrasing.
 */
export function describeTreeDragState(
  type: 'lift' | 'move' | 'drop',
  session: TreeDragSession,
  nodes: readonly DndTreeNode[],
  nodeLabel: string,
): TreeDragAnnouncement {
  const parent =
    session.target.parentId === null
      ? null
      : (locateNode(nodes, session.target.parentId)?.node.label ?? session.target.parentId);
  return {
    type,
    node: nodeLabel,
    parent,
    position: session.target.index + 1,
    count: wdChildCount(nodes, session, session.target.parentId) + 1,
  };
}

export function describeTreeCancel(
  session: Pick<TreeDragSession, 'sourceParentId'>,
  nodes: readonly DndTreeNode[],
  nodeLabel: string,
): TreeDragAnnouncement {
  const parent =
    session.sourceParentId === null
      ? null
      : (locateNode(nodes, session.sourceParentId)?.node.label ?? session.sourceParentId);
  return { type: 'cancel', node: nodeLabel, parent };
}

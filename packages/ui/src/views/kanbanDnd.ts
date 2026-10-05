/**
 * Pure drag-and-drop math and keyboard state machine for the Kanban board.
 *
 * Everything here is platform-agnostic and side-effect free so web
 * (`Kanban.tsx`) and native (`Kanban.native.tsx`) share one source of truth
 * and the logic stays unit-testable without a DOM.
 *
 * Coordinate vocabulary:
 * - "original index": a card's index in its column's `items` array (the
 *   dragged card still occupies its slot — data is never mutated mid-drag).
 * - "without-dragged index" (wd): index in the list with the dragged card
 *   removed. Insertion targets (`KanbanDropTarget.index`) always use wd
 *   coordinates, so a target equals the final position after the drop.
 *
 * All displacement is expressed as transform translate offsets (never layout
 * props) so the same math is native-driver safe (A-GESTURE / Axiom 4).
 */

// ── Types ─────────────────────────────────────────────────────

/** Where the dragged card would land if dropped now. */
export interface KanbanDropTarget {
  columnId: string;
  /** Insertion index in without-dragged coordinates (0..wdCount). */
  index: number;
}

/** Minimal board snapshot for the keyboard machine. */
export interface KanbanBoardColumnSnapshot {
  id: string;
  title: string;
  /** Item count with the dragged card still in place. */
  count: number;
}

/** Active keyboard drag session (source never changes while lifted). */
export interface KanbanKeyboardDrag {
  sourceColumnId: string;
  /** Original index of the lifted card in its source column. */
  sourceIndex: number;
  target: KanbanDropTarget;
}

export type KanbanMoveDirection = 'up' | 'down' | 'left' | 'right';

// ── Displacement (FLIP make-room) ─────────────────────────────

export interface SiblingOffsetOptions {
  /** Card's original index in its column. */
  index: number;
  /** Dragged card's original index when this column is the source, else null. */
  sourceIndex: number | null;
  /** Insertion index (wd coords) when this column is the drop target, else null. */
  gapIndex: number | null;
  /** Dragged slot size in px (wrapper height including its gap padding). */
  size: number;
}

/**
 * Transform offset (px) a sibling card translates by so the board makes room
 * for the insertion gap. Values are always -size, 0, or +size, so siblings
 * move with pure transforms and spring back cleanly on cancel.
 */
export function siblingOffset({ index, sourceIndex, gapIndex, size }: SiblingOffsetOptions): number {
  if (sourceIndex != null) {
    if (index === sourceIndex) {
      return 0;
    } // the dragged card itself is handled as the ghost
    const wdIndex = index > sourceIndex ? index - 1 : index;
    const closeOrigin = index > sourceIndex ? -size : 0;
    const openGap = gapIndex != null && wdIndex >= gapIndex ? size : 0;
    return closeOrigin + openGap;
  }
  return gapIndex != null && index >= gapIndex ? size : 0;
}

export interface GapPositionOptions {
  /** Insertion index in wd coordinates. */
  gapIndex: number;
  /** Dragged card's original index when this column is the source, else null. */
  sourceIndex: number | null;
  /** Total item count of the column (dragged card included when source). */
  count: number;
  /** Dragged slot size in px. */
  size: number;
  /** Column content total size in px (virtualizer total). */
  totalSize: number;
  /** Start offset (px) of the card at an original index. */
  getStart: (index: number) => number;
}

/** Top offset (px) of the insertion gap inside the column's content. */
export function gapPosition({ gapIndex, sourceIndex, count, size, totalSize, getStart }: GapPositionOptions): number {
  if (sourceIndex == null) {
    return gapIndex < count ? getStart(gapIndex) : totalSize;
  }
  if (gapIndex < sourceIndex) {
    return getStart(gapIndex);
  }
  if (gapIndex + 1 <= count - 1) {
    return getStart(gapIndex + 1) - size;
  }
  return totalSize - size;
}

// ── Insertion index from a pointer position ───────────────────

export interface RenderedCardMeasurement {
  /** Original index in the column. */
  index: number;
  /** Start offset in px (column content coordinates). */
  start: number;
  /** Measured size in px. */
  size: number;
}

export interface InsertionIndexOptions {
  /** Pointer y in column content coordinates (client y − content top + scrollTop). */
  localY: number;
  /** Rendered (virtualized) card measurements sorted by index. */
  items: RenderedCardMeasurement[];
  /** Dragged card's original index when this column is the source, else null. */
  sourceIndex: number | null;
  /** Total item count of the column (dragged card included when source). */
  count: number;
  /** Dragged slot size in px. */
  size: number;
}

/**
 * Insertion index (wd coordinates) for a pointer at `localY`. Uses the
 * midpoint rule (Trello/dnd-kit consensus): the gap lands after every card
 * whose without-dragged midpoint sits above the pointer.
 */
export function insertionIndexForY({ localY, items, sourceIndex, count, size }: InsertionIndexOptions): number {
  const wdCount = count - (sourceIndex != null ? 1 : 0);
  const rendered = items.filter((it) => it.index !== sourceIndex);
  if (rendered.length === 0 || wdCount <= 0) {
    return 0;
  }
  const first = rendered[0];
  const base = first.index - (sourceIndex != null && first.index > sourceIndex ? 1 : 0);
  let passed = 0;
  for (const it of rendered) {
    const wdStart = it.start - (sourceIndex != null && it.index > sourceIndex ? size : 0);
    if (localY > wdStart + it.size / 2) {
      passed += 1;
    }
  }
  const index = base + passed;
  return index < 0 ? 0 : index > wdCount ? wdCount : index;
}

/**
 * Closed-form insertion index for uniform card sizes (native path — FlashList
 * does not expose per-item measurements). Equivalent to the midpoint rule.
 */
export function uniformInsertionIndex(localY: number, size: number, wdCount: number): number {
  if (size <= 0 || wdCount <= 0) {
    return 0;
  }
  const index = Math.floor(localY / size + 0.5);
  return index < 0 ? 0 : index > wdCount ? wdCount : index;
}

// ── Auto-scroll ───────────────────────────────────────────────

export interface AutoScrollOptions {
  /** Pointer position along the scroll axis (client coords). */
  pos: number;
  /** Viewport start edge (client coords). */
  start: number;
  /** Viewport end edge (client coords). */
  end: number;
  /** Edge activation zone in px. */
  edge: number;
  /** Max scroll speed in px per frame. */
  maxSpeed: number;
}

/**
 * Signed scroll velocity (px/frame) for edge auto-scroll. Speed ramps
 * linearly with proximity to the edge and saturates at `maxSpeed` when the
 * pointer reaches or passes it.
 */
export function autoScrollVelocity({ pos, start, end, edge, maxSpeed }: AutoScrollOptions): number {
  const span = end - start;
  if (span <= 0) {
    return 0;
  }
  const effEdge = Math.min(edge, span / 3);
  if (effEdge <= 0) {
    return 0;
  }
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const dStart = pos - start;
  if (dStart < effEdge) {
    return -maxSpeed * (1 - clamp01(dStart / effEdge));
  }
  const dEnd = end - pos;
  if (dEnd < effEdge) {
    return maxSpeed * (1 - clamp01(dEnd / effEdge));
  }
  return 0;
}

// ── Keyboard drag state machine (WAI-ARIA drag pattern) ───────

/** Max insertion index for a column (wd coordinates). */
export function maxInsertionIndex(
  board: KanbanBoardColumnSnapshot[],
  drag: Pick<KanbanKeyboardDrag, 'sourceColumnId'>,
  columnId: string,
): number {
  const column = board.find((c) => c.id === columnId);
  if (!column) {
    return 0;
  }
  return column.id === drag.sourceColumnId ? Math.max(column.count - 1, 0) : column.count;
}

/** Begin a keyboard drag session. Returns null when the card does not exist. */
export function keyboardLift(
  board: KanbanBoardColumnSnapshot[],
  columnId: string,
  index: number,
): KanbanKeyboardDrag | null {
  const column = board.find((c) => c.id === columnId);
  if (!column || index < 0 || index >= column.count) {
    return null;
  }
  return {
    sourceColumnId: columnId,
    sourceIndex: index,
    target: { columnId, index },
  };
}

/**
 * Move the drop target one step. Returns the same session object when the
 * move hits a boundary so callers can detect no-ops by identity.
 */
export function keyboardMove(
  drag: KanbanKeyboardDrag,
  board: KanbanBoardColumnSnapshot[],
  direction: KanbanMoveDirection,
): KanbanKeyboardDrag {
  const { target } = drag;
  if (direction === 'up') {
    if (target.index <= 0) {
      return drag;
    }
    return { ...drag, target: { ...target, index: target.index - 1 } };
  }
  if (direction === 'down') {
    const max = maxInsertionIndex(board, drag, target.columnId);
    if (target.index >= max) {
      return drag;
    }
    return { ...drag, target: { ...target, index: target.index + 1 } };
  }
  const colIndex = board.findIndex((c) => c.id === target.columnId);
  if (colIndex < 0) {
    return drag;
  }
  const nextIndex = direction === 'left' ? colIndex - 1 : colIndex + 1;
  if (nextIndex < 0 || nextIndex >= board.length) {
    return drag;
  }
  const nextColumn = board[nextIndex];
  const max = maxInsertionIndex(board, drag, nextColumn.id);
  return {
    ...drag,
    target: {
      columnId: nextColumn.id,
      index: target.index > max ? max : target.index,
    },
  };
}

export interface KanbanDropResult {
  /** False when the card lands exactly where it started. */
  commit: boolean;
  from: { columnId: string; index: number };
  to: KanbanDropTarget;
}

/** Resolve a drop for the current target (keyboard and pointer share this). */
export function resolveDrop(
  drag: Pick<KanbanKeyboardDrag, 'sourceColumnId' | 'sourceIndex' | 'target'>,
): KanbanDropResult {
  const { sourceColumnId, sourceIndex, target } = drag;
  return {
    commit: target.columnId !== sourceColumnId || target.index !== sourceIndex,
    from: { columnId: sourceColumnId, index: sourceIndex },
    to: target,
  };
}

// ── Screen-reader announcements ───────────────────────────────

export type KanbanAnnouncement =
  | { type: 'lift'; card: string; column: string; position: number; count: number }
  | { type: 'move'; card: string; column: string; position: number; count: number }
  | { type: 'drop'; card: string; column: string; position: number; count: number }
  | { type: 'cancel'; card: string; column: string };

/**
 * Structured announcement payload for the aria-live region. Positions are
 * 1-based and `count` is the column's size after the pending drop, matching
 * the "position 2 of 3" phrasing of the WAI-ARIA drag pattern.
 */
export function describeDragState(
  type: 'lift' | 'move' | 'drop',
  drag: Pick<KanbanKeyboardDrag, 'sourceColumnId' | 'sourceIndex' | 'target'>,
  board: KanbanBoardColumnSnapshot[],
  card: string,
): KanbanAnnouncement {
  const column = board.find((c) => c.id === drag.target.columnId);
  const max = maxInsertionIndex(board, drag, drag.target.columnId);
  return {
    type,
    card,
    column: column?.title ?? drag.target.columnId,
    position: drag.target.index + 1,
    count: max + 1,
  };
}

export function describeCancel(
  drag: Pick<KanbanKeyboardDrag, 'sourceColumnId'>,
  board: KanbanBoardColumnSnapshot[],
  card: string,
): KanbanAnnouncement {
  const column = board.find((c) => c.id === drag.sourceColumnId);
  return { type: 'cancel', card, column: column?.title ?? drag.sourceColumnId };
}

// ── Flat-list adapters (SortableList / DataTable / ChildTable) ──────────
//
// A sortable list is a one-column Kanban board. Callers MUST go through
// these helpers instead of inventing a second insertion machine.

/** Synthetic column id for a flat list / table body. */
export const LIST_COLUMN_ID = 'list';

/** Hold-gate so a touch swipe still scrolls. Recognition, not motion. */
export const TOUCH_LONG_PRESS_MS = 200;
/** Edge band that engages auto-scroll (Kanban / board 02). */
export const AUTO_SCROLL_EDGE_PX = 48;
export const AUTO_SCROLL_MAX_SPEED = 16;
/** Overlay scale while lifted (gesture state, not the elevation knob). */
export const LIFT_SCALE = 1.03;

export function listBoardSnapshot(count: number, title = ''): KanbanBoardColumnSnapshot[] {
  return [{ id: LIST_COLUMN_ID, title, count }];
}

/**
 * Apply a resolveDrop coordinate pair to an array. `from` is the original
 * index; `to` is the without-dragged insertion index (same as
 * `KanbanDropTarget.index`).
 */
export function applyReorder<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to > items.length) {
    return items.slice();
  }
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Frappe child-table `idx`: 1-based, rewritten after a committed reorder. */
export function renumberIdx<T extends { idx?: number }>(items: readonly T[]): T[] {
  return items.map((item, i) => ({ ...item, idx: i + 1 }));
}

export function commitReorder<T>(
  items: readonly T[],
  drag: Pick<KanbanKeyboardDrag, 'sourceColumnId' | 'sourceIndex' | 'target'>,
): T[] {
  const result = resolveDrop(drag);
  if (!result.commit) {
    return items.slice();
  }
  return applyReorder(items, result.from.index, result.to.index);
}

/**
 * Board-03 aria-live copy. Payload fields come from describeDragState /
 * describeCancel (1-based position, count, row label).
 */
export function formatListAnnouncement(announcement: KanbanAnnouncement, opts?: { sourcePosition?: number }): string {
  const quoted = `\u201c${announcement.card}\u201d`;
  if (announcement.type === 'cancel') {
    const position = opts?.sourcePosition ?? 1;
    return `Reorder cancelled. ${quoted} returned to position ${position}.`;
  }
  const { position, count } = announcement;
  if (announcement.type === 'lift') {
    return `Lifted ${quoted}, position ${position} of ${count}. Use arrow keys to move, space to drop, escape to cancel.`;
  }
  if (announcement.type === 'move') {
    return `Moved ${quoted}, position ${position} of ${count}.`;
  }
  return `Dropped ${quoted}, position ${position} of ${count}.`;
}

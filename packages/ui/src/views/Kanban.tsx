import { Spinner } from '@repo/forms';
import {
  hairlineWidth,
  keyboardFocusRingProps,
  MIN_PRESS_TARGET,
  radiusClassProps,
  useResolvedKnobs,
  ensureKeyboardModalityTracking,
  wasKeyboardFocus,
} from '@repo/theme';
import { useHotkey } from '@tanstack/react-hotkeys';
import type { RegisterableHotkey } from '@tanstack/react-hotkeys';
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useCallback, useRef, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, ListItem, Text, View, XStack, YStack, type YStackProps } from 'tamagui';

import { componentColors } from '../componentColors';
import { AsyncBoundary, useAsyncCount } from '../layouts/AsyncBoundary';
import { EmptyState } from '../layouts/Page';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { Card } from '../surfaces';

import {
  autoScrollVelocity,
  describeCancel,
  describeDragState,
  gapPosition,
  insertionIndexForY,
  keyboardLift,
  keyboardMove,
  resolveDrop,
  siblingOffset,
  type KanbanAnnouncement,
  type KanbanBoardColumnSnapshot,
  type KanbanDropTarget,
  type RenderedCardMeasurement,
} from './kanbanDnd';

/**
 * A column definition for the Kanban board.
 *
 * @typeParam T - The card item type
 */
export interface KanbanColumn<T> {
  /** Unique column identifier */
  id: string;
  /** Display title for the column header */
  title: string;
  /** Cards in this column */
  items: T[];
  /** Optional color for the column header */
  color?: string;
}

/**
 * Configurable hotkey bindings for the Kanban component.
 */
export interface KanbanHotkeys {
  /** Move focus to next column (default: ArrowRight) */
  nextColumn?: RegisterableHotkey;
  /** Move focus to previous column (default: ArrowLeft) */
  prevColumn?: RegisterableHotkey;
  /** Move focus to next card within column (default: ArrowDown) */
  nextCard?: RegisterableHotkey;
  /** Move focus to previous card within column (default: ArrowUp) */
  prevCard?: RegisterableHotkey;
  /** Select the focused card (default: Enter) */
  select?: RegisterableHotkey;
  /** Lift / drop the focused card for keyboard drag-and-drop (default: Space) */
  lift?: RegisterableHotkey;
  /** Cancel an active keyboard drag (default: Escape) */
  cancel?: RegisterableHotkey;
}

/**
 * Props for the generic Kanban component.
 *
 * @typeParam T - The card item type
 */
export interface KanbanProps<T> extends Omit<YStackProps, 'children'> {
  /** Column definitions with their items */
  columns: KanbanColumn<T>[];
  /** Render function for each card */
  renderCard: (item: T) => React.ReactNode;
  /**
   * Called when a card is moved between columns. `toIndex` is the insertion
   * position inside the destination column (0-based).
   */
  onCardMove?: (item: T, fromColumn: string, toColumn: string, toIndex?: number) => void;
  /**
   * Called when a card is reordered inside its own column. Without this
   * handler, same-column drops settle back to their origin.
   */
  onCardReorder?: (item: T, columnId: string, fromIndex: number, toIndex: number) => void;
  /** Called when a card is selected via keyboard or click */
  onCardSelect?: (item: T, columnId: string) => void;
  /**
   * Per-column actions (quick-add, column menu…) anchored in the column
   * header after the count. Icon-only actions must carry their own
   * accessible names — the board renders the slot as-is.
   */
  renderColumnActions?: (column: KanbanColumn<T>) => ReactNode;
  /**
   * Rendered after the last column inside the horizontal scroller — the
   * anchored home for board-level affordances like "Add column" (never a
   * detached toolbar strip).
   */
  boardEnd?: ReactNode;
  /** Called when user scrolls near the bottom (infinite scroll) */
  onLoadMore?: () => void;
  /** Stable key extractor for virtualized cards (defaults to the item index) */
  getItemKey?: (item: T, index: number) => string | number;
  /** Human label for a card, used in screen-reader drag announcements */
  getItemLabel?: (item: T) => string;
  /** Whether more items are available */
  hasMore?: boolean;
  /** Whether data is loading */
  isLoading?: boolean;
  /**
   * Failed board load. Wins over empty columns — never shows
   * empty chrome; column count badges are suppressed.
   */
  error?: boolean | string | Error | ReactNode | null;
  /** Retry handler for the default error UI. */
  onRetry?: () => void;
  /** Column width in pixels (default: 280) */
  columnWidth?: number;
  /** Minimum column height in pixels (default: 400) */
  minColumnHeight?: number;
  /** Estimated size of each card in pixels for virtualization (default: 80) */
  estimateSize?: number;
  /** Number of items to render outside visible area (default: 5) */
  overscan?: number;
  /** Message shown when a column has no items */
  emptyColumnMessage?: string;
  /** Configurable keyboard shortcut overrides */
  hotkeys?: KanbanHotkeys;
}

// ── Interaction constants (gesture recognition, not animation timing) ──

/** Pixels of pointer travel before a press becomes a drag (clicks stay clicks below this). */
const DRAG_THRESHOLD_PX = 4;
/** Touch/pen hold before lift so vertical swipes still scroll the column. */
const TOUCH_LONG_PRESS_MS = 200;
/** Distance from a scroll edge where auto-scroll engages. */
const AUTO_SCROLL_EDGE_PX = 48;
/** Auto-scroll speed cap in px per frame; ramps with edge proximity. */
const AUTO_SCROLL_MAX_SPEED = 16;
/** Inset between the virtualized slot and the card chrome (wrapper padding). */
const CARD_INSET_PX = 4;

// Raised drag shadow: the house $4 elevation tier (single light source,
// blur = 2 x y-offset — Axiom 14 OPTICS). Explicit props because the lift is
// a gesture state, not the board's resting elevation knob; values mirror
// forms/InputParts + Accordion's cardElevationShadow.
const LIFT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.15,
  shadowRadius: 20,
} as const;

// ── Internal drag plumbing types ──────────────────────────────

interface ColumnHandle {
  scrollEl: HTMLElement | null;
  getVirtualState: () => {
    items: RenderedCardMeasurement[];
    totalSize: number;
    count: number;
  };
  scrollToIndex: (index: number) => void;
}

interface DragSession<T> {
  mode: 'pointer' | 'keyboard';
  item: T;
  /** Stable key when getItemKey is provided (used to hide the real card while settling). */
  itemKey?: string | number;
  itemLabel: string;
  sourceColumnId: string;
  sourceIndex: number;
  /** Dragged slot size in px (wrapper height including gap padding). */
  size: number;
  /** Card chrome width/height for the overlay. */
  width: number;
  height: number;
  target: KanbanDropTarget;
  /** Board-relative overlay position for keyboard mode. */
  keyboardPos?: { x: number; y: number };
  /** Board-relative card position at lift time (first overlay paint). */
  initialPos?: { x: number; y: number };
}

interface SettleSession<T> {
  item: T;
  itemKey?: string | number;
  width: number;
  height: number;
  to: { x: number; y: number };
}

/** Shared render context handed to each column while a drag is active. */
interface KanbanDragRenderContext {
  sourceColumnId: string;
  sourceIndex: number;
  size: number;
  target: KanbanDropTarget;
  keyboard: boolean;
}

interface OverlayApi {
  setPointer: (x: number, y: number) => void;
}

/**
 * Generic Kanban board component with column-level virtualization,
 * keyboard navigation, and Trello-class drag-and-drop motion.
 *
 * Drag anatomy (A-GESTURE / Axiom 4):
 * - The lifted card renders as a board-level overlay that tracks the pointer
 *   1:1 (no tween while tracking); lift scale/rotate/shadow tween in with
 *   `knobProps.transition`.
 * - Siblings make room with transform-only FLIP displacement driven by the
 *   same transition token, so the identical math is native-driver safe.
 * - Drops and cancels settle with a tween — nothing teleports;
 *   `animation=none` collapses every decorative tween while 1:1 tracking
 *   keeps working (Axiom 3 NULL).
 * - Keyboard drag follows the WAI-ARIA pattern: Space lifts, arrows move,
 *   Space/Enter drops, Escape cancels, with aria-live announcements.
 *
 * @typeParam T - The card item type
 *
 * @example
 * ```tsx
 * <Kanban
 *   columns={[
 *     { id: 'todo', title: 'To Do', items: todoItems },
 *     { id: 'in-progress', title: 'In Progress', items: progressItems },
 *     { id: 'done', title: 'Done', items: doneItems },
 *   ]}
 *   renderCard={(item) => <Text>{item.title}</Text>}
 *   onCardMove={(item, from, to, toIndex) => moveCard(item, to, toIndex)}
 *   onCardReorder={(item, column, from, to) => reorderCard(item, column, to)}
 * />
 * ```
 */
export function Kanban<T>({
  columns,
  renderCard,
  onCardMove,
  onCardReorder,
  onCardSelect,
  renderColumnActions,
  boardEnd,
  onLoadMore,
  getItemKey,
  getItemLabel,
  hasMore = false,
  isLoading = false,
  error = null,
  onRetry,
  columnWidth: columnWidthProp,
  minColumnHeight: minColumnHeightProp,
  estimateSize: estimateSizeProp,
  overscan = 5,
  emptyColumnMessage: emptyColumnMessageProp,
  hotkeys: hotkeyOverrides,
  ...stackProps
}: KanbanProps<T>) {
  const { t } = useTranslation();
  const emptyColumnMessage = emptyColumnMessageProp ?? t('No items');
  const { knobProps } = useResolvedKnobs();
  const sz = knobProps.sizeToken;
  const columnWidth = columnWidthProp ?? (sz === '$3' ? 240 : sz === '$5' ? 320 : 280);
  const minColumnHeight = minColumnHeightProp ?? (sz === '$3' ? 320 : sz === '$5' ? 480 : 400);
  const estimateSize = estimateSizeProp ?? (sz === '$3' ? 64 : sz === '$5' ? 96 : 80);
  const kanbanId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<any>(null);
  const [focusedCol, setFocusedCol] = useState(-1);
  const [focusedCard, setFocusedCard] = useState(-1);
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }
  const handleContainerFocus = useCallback(() => {
    if (!wasKeyboardFocus()) {
      return;
    }
    setFocusedCol((prev) => (prev < 0 ? 0 : prev));
    setFocusedCard((prev) => (prev < 0 ? 0 : prev));
  }, []);

  const canDrag = Boolean(onCardMove || onCardReorder);

  // ── Drag state ──────────────────────────────────────────────
  const [drag, setDrag] = useState<DragSession<T> | null>(null);
  const [settle, setSettle] = useState<SettleSession<T> | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dragRef = useRef<DragSession<T> | null>(null);
  dragRef.current = drag;
  const columnHandles = useRef(new Map<string, ColumnHandle>());
  const overlayApiRef = useRef<OverlayApi | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const hoverColumnRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const sessionCleanupRef = useRef<(() => void) | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);

  useEffect(() => () => sessionCleanupRef.current?.(), []);

  const registerColumn = useCallback((id: string, handle: ColumnHandle | null) => {
    if (handle) {
      columnHandles.current.set(id, handle);
    } else {
      columnHandles.current.delete(id);
    }
  }, []);

  const board = useMemo(
    (): KanbanBoardColumnSnapshot[] => columns.map((c) => ({ id: c.id, title: c.title, count: c.items.length })),
    [columns],
  );

  const announce = useCallback(
    (a: KanbanAnnouncement) => {
      const text =
        a.type === 'lift'
          ? t(
              'Lifted {{card}} in {{column}}, position {{position}} of {{count}}. Use arrow keys to move, space to drop, escape to cancel.',
              a,
            )
          : a.type === 'move'
            ? t('Moved {{card}} to {{column}}, position {{position}} of {{count}}.', a)
            : a.type === 'drop'
              ? t('Dropped {{card}} in {{column}}, position {{position}} of {{count}}.', a)
              : t('Movement cancelled. {{card}} returned to {{column}}.', a);
      setAnnouncement(text);
    },
    [t],
  );

  // ── Geometry helpers ────────────────────────────────────────

  const getColumnStart = useCallback(
    (handle: ColumnHandle, index: number): number => {
      const state = handle.getVirtualState();
      const found = state.items.find((it) => it.index === index);
      return found ? found.start : index * estimateSize;
    },
    [estimateSize],
  );

  /** Board-relative rect of the card chrome for an insertion gap. */
  const gapRectInBoard = useCallback(
    (
      columnId: string,
      gapIndex: number,
      session: Pick<DragSession<T>, 'sourceColumnId' | 'sourceIndex' | 'size'>,
    ): { x: number; y: number } | null => {
      const handle = columnHandles.current.get(columnId);
      const container = containerRef.current;
      if (!handle?.scrollEl || !container) {
        return null;
      }
      const state = handle.getVirtualState();
      const gapY = gapPosition({
        gapIndex,
        sourceIndex: columnId === session.sourceColumnId ? session.sourceIndex : null,
        count: state.count,
        size: session.size,
        totalSize: state.totalSize,
        getStart: (index) => getColumnStart(handle, index),
      });
      const scrollRect = handle.scrollEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        x: scrollRect.left - containerRect.left + CARD_INSET_PX,
        y: scrollRect.top - containerRect.top + gapY - handle.scrollEl.scrollTop + CARD_INSET_PX,
      };
    },
    [getColumnStart],
  );

  /** Pointer position → drop target. Falls back to the origin slot so drops outside cancel. */
  const hitTest = useCallback((clientX: number, clientY: number, session: DragSession<T>): KanbanDropTarget => {
    const el = typeof document !== 'undefined' ? document.elementFromPoint(clientX, clientY) : null;
    const columnEl = el?.closest?.('[data-kanban-column]') as HTMLElement | null;
    const columnId = columnEl?.getAttribute('data-kanban-column') ?? null;
    hoverColumnRef.current = columnId;
    if (!columnId) {
      return { columnId: session.sourceColumnId, index: session.sourceIndex };
    }
    const handle = columnHandles.current.get(columnId);
    if (!handle?.scrollEl) {
      return { columnId, index: 0 };
    }
    const rect = handle.scrollEl.getBoundingClientRect();
    const localY = clientY - rect.top + handle.scrollEl.scrollTop;
    const state = handle.getVirtualState();
    const index = insertionIndexForY({
      localY,
      items: state.items,
      sourceIndex: columnId === session.sourceColumnId ? session.sourceIndex : null,
      count: state.count,
      size: session.size,
    });
    return { columnId, index };
  }, []);

  const getBoardScrollEl = useCallback((): HTMLElement | null => {
    const node = boardScrollRef.current;
    return (node?.getScrollableNode?.() ?? node) as HTMLElement | null;
  }, []);

  // ── Auto-scroll (velocity ramps with edge proximity) ────────

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
    }
    autoScrollRafRef.current = null;
  }, []);

  const startAutoScroll = useCallback(() => {
    stopAutoScroll();
    const tick = () => {
      const session = dragRef.current;
      if (!session || session.mode !== 'pointer') {
        autoScrollRafRef.current = null;
        return;
      }
      const { x, y } = pointerRef.current;
      let scrolled = false;
      const hoverId = hoverColumnRef.current;
      const handle = hoverId ? columnHandles.current.get(hoverId) : null;
      if (handle?.scrollEl) {
        const rect = handle.scrollEl.getBoundingClientRect();
        const vy = autoScrollVelocity({
          pos: y,
          start: rect.top,
          end: rect.bottom,
          edge: AUTO_SCROLL_EDGE_PX,
          maxSpeed: AUTO_SCROLL_MAX_SPEED,
        });
        if (vy !== 0) {
          handle.scrollEl.scrollTop += vy;
          scrolled = true;
        }
      }
      const boardEl = getBoardScrollEl();
      if (boardEl) {
        const rect = boardEl.getBoundingClientRect();
        const vx = autoScrollVelocity({
          pos: x,
          start: rect.left,
          end: rect.right,
          edge: AUTO_SCROLL_EDGE_PX,
          maxSpeed: AUTO_SCROLL_MAX_SPEED,
        });
        if (vx !== 0) {
          boardEl.scrollLeft += vx;
          scrolled = true;
        }
      }
      if (scrolled) {
        const target = hitTest(x, y, session);
        setDrag((prev) =>
          prev && (prev.target.columnId !== target.columnId || prev.target.index !== target.index)
            ? { ...prev, target }
            : prev,
        );
      }
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, [getBoardScrollEl, hitTest, stopAutoScroll]);

  // ── Drop / cancel ───────────────────────────────────────────

  const endDrag = useCallback(
    (commit: boolean) => {
      const session = dragRef.current;
      if (!session) {
        return;
      }
      stopAutoScroll();
      sessionCleanupRef.current?.();
      sessionCleanupRef.current = null;

      const resolved = resolveDrop(session);
      const crossColumn = resolved.to.columnId !== resolved.from.columnId;
      const canCommit = commit && resolved.commit && (crossColumn ? Boolean(onCardMove) : Boolean(onCardReorder));

      const dest = canCommit
        ? gapRectInBoard(resolved.to.columnId, resolved.to.index, session)
        : gapRectInBoard(resolved.from.columnId, resolved.from.index, session);

      setDrag(null);
      if (dest) {
        setSettle({
          item: session.item,
          itemKey: session.itemKey,
          width: session.width,
          height: session.height,
          to: dest,
        });
      }

      if (canCommit) {
        announce(describeDragState('drop', session, board, session.itemLabel));
        if (crossColumn) {
          onCardMove?.(session.item, resolved.from.columnId, resolved.to.columnId, resolved.to.index);
        } else {
          onCardReorder?.(session.item, resolved.from.columnId, resolved.from.index, resolved.to.index);
        }
      } else {
        announce(describeCancel(session, board, session.itemLabel));
      }
    },
    [announce, board, gapRectInBoard, onCardMove, onCardReorder, stopAutoScroll],
  );

  // Settle completion: watch the overlay transform until it stops changing
  // (mechanical spring-rest detection — no timing constants). With
  // animation=none the position lands in one frame and this exits immediately.
  useEffect(() => {
    if (!settle) {
      return;
    }
    const el = containerRef.current?.querySelector('[data-kanban-overlay]') as HTMLElement | null;
    if (!el || typeof requestAnimationFrame === 'undefined') {
      setSettle(null);
      return;
    }
    let last: string | null = null;
    let stableFrames = 0;
    let raf = 0;
    const check = () => {
      const current = getComputedStyle(el).transform;
      if (current === last) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        last = current;
      }
      if (stableFrames >= 3) {
        setSettle(null);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [settle]);

  // ── Pointer drag session ────────────────────────────────────

  const beginDrag = useCallback(
    (item: T, columnId: string, index: number, cardEl: HTMLElement, clientX: number, clientY: number): boolean => {
      const wrapper = cardEl.closest('[data-index]') as HTMLElement | null;
      const container = containerRef.current;
      if (!wrapper || !container) {
        return false;
      }
      const wrapperRect = wrapper.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      grabOffsetRef.current = { x: clientX - cardRect.left, y: clientY - cardRect.top };
      pointerRef.current = { x: clientX, y: clientY };
      hoverColumnRef.current = columnId;
      const session: DragSession<T> = {
        mode: 'pointer',
        item,
        itemKey: getItemKey ? getItemKey(item, index) : undefined,
        itemLabel: getItemLabel?.(item) ?? t('Card'),
        sourceColumnId: columnId,
        sourceIndex: index,
        size: wrapperRect.height,
        width: cardRect.width,
        height: cardRect.height,
        target: { columnId, index },
        initialPos: {
          x: cardRect.left - containerRect.left,
          y: cardRect.top - containerRect.top,
        },
      };
      setSettle(null);
      setDrag(session);
      dragRef.current = session;
      announce(describeDragState('lift', session, board, session.itemLabel));
      startAutoScroll();
      return true;
    },
    [announce, board, getItemKey, getItemLabel, startAutoScroll, t],
  );

  const handleCardPointerDown = useCallback(
    (item: T, columnId: string, index: number, e: any) => {
      if (!canDrag || typeof window === 'undefined') {
        return;
      }
      if (e.button != null && e.button !== 0) {
        return;
      }
      if (dragRef.current) {
        return;
      }
      sessionCleanupRef.current?.();

      const cardEl = e.currentTarget as HTMLElement;
      const startX = e.clientX as number;
      const startY = e.clientY as number;
      const pointerType: string = e.pointerType ?? 'mouse';
      let lifted = false;
      let longPressTimer: ReturnType<typeof setTimeout> | null = null;
      let prevUserSelect = '';
      let prevCursor = '';

      const lift = (x: number, y: number) => {
        if (lifted) {
          return;
        }
        lifted = beginDrag(item, columnId, index, cardEl, x, y);
        if (!lifted) {
          return;
        }
        prevUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
        prevCursor = document.documentElement.style.cursor;
        document.documentElement.style.cursor = 'grabbing';
      };

      const teardown = () => {
        if (longPressTimer != null) {
          clearTimeout(longPressTimer);
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('contextmenu', onContextMenu, true);
        sessionCleanupRef.current = null;
        if (lifted) {
          document.body.style.userSelect = prevUserSelect;
          document.documentElement.style.cursor = prevCursor;
          suppressClickRef.current = true;
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        }
      };

      const onMove = (me: PointerEvent) => {
        pointerRef.current = { x: me.clientX, y: me.clientY };
        if (!lifted) {
          const travelled = Math.hypot(me.clientX - startX, me.clientY - startY);
          if (pointerType === 'mouse') {
            if (travelled >= DRAG_THRESHOLD_PX) {
              lift(me.clientX, me.clientY);
            }
          } else if (travelled >= DRAG_THRESHOLD_PX) {
            // Finger moved before the hold elapsed — this is a scroll, not a drag.
            teardown();
          }
          if (!lifted) {
            return;
          }
        }
        const containerRect = containerRef.current?.getBoundingClientRect();
        overlayApiRef.current?.setPointer(
          me.clientX - (containerRect?.left ?? 0) - grabOffsetRef.current.x,
          me.clientY - (containerRect?.top ?? 0) - grabOffsetRef.current.y,
        );
        const session = dragRef.current;
        if (!session) {
          return;
        }
        const target = hitTest(me.clientX, me.clientY, session);
        setDrag((prev) =>
          prev && (prev.target.columnId !== target.columnId || prev.target.index !== target.index)
            ? { ...prev, target }
            : prev,
        );
      };

      const onUp = () => {
        const wasLifted = lifted;
        teardown();
        if (wasLifted) {
          endDrag(true);
        }
      };

      const onCancel = () => {
        const wasLifted = lifted;
        teardown();
        if (wasLifted) {
          endDrag(false);
        }
      };

      const onKey = (ke: KeyboardEvent) => {
        if (ke.key !== 'Escape') {
          return;
        }
        ke.stopPropagation();
        const wasLifted = lifted;
        teardown();
        if (wasLifted) {
          endDrag(false);
        }
      };

      // While lifted, claim touch moves so the page/column does not scroll
      // out from under the drag (registered non-passive on purpose).
      const onTouchMove = (te: TouchEvent) => {
        if (lifted) {
          te.preventDefault();
        }
      };
      const onContextMenu = (ce: Event) => {
        if (lifted || longPressTimer != null) {
          ce.preventDefault();
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('contextmenu', onContextMenu, true);
      sessionCleanupRef.current = () => {
        const wasLifted = lifted;
        teardown();
        if (wasLifted) {
          endDrag(false);
        }
      };

      if (pointerType !== 'mouse') {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          const p = pointerRef.current;
          lift(p.x || startX, p.y || startY);
        }, TOUCH_LONG_PRESS_MS);
        pointerRef.current = { x: startX, y: startY };
      }
    },
    [beginDrag, canDrag, endDrag, hitTest],
  );

  // ── Keyboard drag (WAI-ARIA pattern) ────────────────────────

  const keyboardOverlayPos = useCallback(
    (session: DragSession<T>): { x: number; y: number } | undefined =>
      gapRectInBoard(session.target.columnId, session.target.index, session) ?? undefined,
    [gapRectInBoard],
  );

  const liftFocusedCard = useCallback(() => {
    if (!canDrag || dragRef.current) {
      return false;
    }
    const column = columns[focusedCol];
    const item = column?.items[focusedCard];
    if (!column || item == null) {
      return false;
    }
    const kb = keyboardLift(board, column.id, focusedCard);
    if (!kb) {
      return false;
    }
    const handle = columnHandles.current.get(column.id);
    const wrapper = handle?.scrollEl?.querySelector(`[data-index="${focusedCard}"]`) as HTMLElement | null;
    const cardEl = (wrapper?.firstElementChild as HTMLElement | null) ?? wrapper;
    if (!wrapper || !cardEl) {
      return false;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const session: DragSession<T> = {
      mode: 'keyboard',
      item,
      itemKey: getItemKey ? getItemKey(item, focusedCard) : undefined,
      itemLabel: getItemLabel?.(item) ?? t('Card'),
      sourceColumnId: column.id,
      sourceIndex: focusedCard,
      size: wrapperRect.height,
      width: cardRect.width,
      height: cardRect.height,
      target: kb.target,
    };
    session.keyboardPos = keyboardOverlayPos(session);
    setSettle(null);
    setDrag(session);
    dragRef.current = session;
    announce(describeDragState('lift', session, board, session.itemLabel));
    return true;
  }, [announce, board, canDrag, columns, focusedCard, focusedCol, getItemKey, getItemLabel, keyboardOverlayPos, t]);

  const moveKeyboardDrag = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const session = dragRef.current;
      if (!session || session.mode !== 'keyboard') {
        return false;
      }
      const next = keyboardMove(session, board, direction);
      if (next === session) {
        return true;
      } // boundary no-op still swallows the key
      const updated: DragSession<T> = { ...session, target: next.target };
      const handle = columnHandles.current.get(next.target.columnId);
      handle?.scrollToIndex(next.target.index);
      updated.keyboardPos = keyboardOverlayPos(updated);
      setDrag(updated);
      dragRef.current = updated;
      announce(describeDragState('move', updated, board, updated.itemLabel));
      // Recompute after the virtualizer applies the scroll so the overlay
      // lands on the final gap rect.
      requestAnimationFrame(() => {
        const current = dragRef.current;
        if (!current || current.mode !== 'keyboard') {
          return;
        }
        const pos = keyboardOverlayPos(current);
        if (pos) {
          const moved = { ...current, keyboardPos: pos };
          setDrag(moved);
          dragRef.current = moved;
        }
      });
      return true;
    },
    [announce, board, keyboardOverlayPos],
  );

  // ── Hotkeys ─────────────────────────────────────────────────

  const hotkeyOpts = {
    target: containerRef as React.RefObject<HTMLElement | null>,
  };

  useHotkey(
    hotkeyOverrides?.nextColumn ?? 'ArrowRight',
    () => {
      if (moveKeyboardDrag('right')) {
        return;
      }
      setFocusedCol((prev) => {
        const next = prev < 0 ? 0 : Math.min(prev + 1, columns.length - 1);
        const colItems = columns[next]?.items ?? [];
        setFocusedCard((cardIdx) => (cardIdx < 0 ? 0 : Math.min(cardIdx, colItems.length - 1)));
        return next;
      });
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.prevColumn ?? 'ArrowLeft',
    () => {
      if (moveKeyboardDrag('left')) {
        return;
      }
      setFocusedCol((prev) => {
        const next = prev < 0 ? columns.length - 1 : Math.max(prev - 1, 0);
        const colItems = columns[next]?.items ?? [];
        setFocusedCard((cardIdx) => (cardIdx < 0 ? 0 : Math.min(cardIdx, colItems.length - 1)));
        return next;
      });
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.nextCard ?? 'ArrowDown',
    () => {
      if (moveKeyboardDrag('down')) {
        return;
      }
      if (focusedCol < 0) {
        setFocusedCol(0);
        setFocusedCard(0);
        return;
      }
      const colItems = columns[focusedCol]?.items ?? [];
      setFocusedCard((prev) => (prev < 0 ? 0 : Math.min(prev + 1, colItems.length - 1)));
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.prevCard ?? 'ArrowUp',
    () => {
      if (moveKeyboardDrag('up')) {
        return;
      }
      if (focusedCol < 0) {
        setFocusedCol(0);
        setFocusedCard(0);
        return;
      }
      const colItems = columns[focusedCol]?.items ?? [];
      setFocusedCard((prev) => (prev < 0 ? colItems.length - 1 : Math.max(prev - 1, 0)));
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.select ?? 'Enter',
    () => {
      if (dragRef.current?.mode === 'keyboard') {
        endDrag(true);
        return;
      }
      if (focusedCol >= 0 && focusedCard >= 0) {
        const col = columns[focusedCol];
        const item = col?.items[focusedCard];
        if (item && col) {
          onCardSelect?.(item, col.id);
        }
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.lift ?? 'Space',
    () => {
      if (dragRef.current?.mode === 'keyboard') {
        endDrag(true);
        return;
      }
      liftFocusedCard();
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.cancel ?? 'Escape',
    () => {
      if (dragRef.current?.mode === 'keyboard') {
        endDrag(false);
      }
    },
    hotkeyOpts,
  );

  const boardLoading = !error && isLoading && columns.every((c) => c.items.length === 0);
  const boardEmpty = !error && columns.length === 0;

  const dragContext: KanbanDragRenderContext | null = drag
    ? {
        sourceColumnId: drag.sourceColumnId,
        sourceIndex: drag.sourceIndex,
        size: drag.size,
        target: drag.target,
        keyboard: drag.mode === 'keyboard',
      }
    : null;

  const overlaySession = drag ?? settle;

  return (
    <AsyncBoundary
      loading={boardLoading}
      empty={boardEmpty}
      error={error}
      onRetry={onRetry}
      layout="kanban"
      emptyTitle="No columns"
      {...stackProps}>
      <View
        ref={containerRef as any}
        tabIndex={0}
        role="grid"
        aria-label={t('Kanban board')}
        outlineWidth={0}
        onFocus={handleContainerFocus}
        position="relative">
        <ScrollView ref={boardScrollRef} horizontal showsHorizontalScrollIndicator={false}>
          <XStack {...knobProps.gap}>
            {columns.map((column, colIndex) => (
              <KanbanColumnView
                key={column.id}
                kanbanId={kanbanId}
                column={column}
                columnIndex={colIndex}
                focusedColumnIndex={focusedCol}
                focusedCardIndex={focusedCard}
                renderCard={renderCard}
                columnWidth={columnWidth}
                minColumnHeight={minColumnHeight}
                estimateSize={estimateSize}
                overscan={overscan}
                emptyColumnMessage={emptyColumnMessage}
                onCardSelect={onCardSelect}
                onCardPointerDown={canDrag ? handleCardPointerDown : undefined}
                suppressClickRef={suppressClickRef}
                registerColumn={registerColumn}
                drag={dragContext}
                settlingKey={settle?.itemKey}
                renderColumnActions={renderColumnActions}
                onLoadMore={onLoadMore}
                getItemKey={getItemKey}
                hasMore={hasMore}
                isLoading={isLoading}
                onCardFocus={(col, card) => {
                  setFocusedCol(col);
                  setFocusedCard(card);
                }}
              />
            ))}
            {boardEnd}
          </XStack>
        </ScrollView>

        {overlaySession && (
          <KanbanDragOverlay
            phase={drag ? drag.mode : 'settling'}
            width={overlaySession.width}
            height={overlaySession.height}
            initialPos={drag?.initialPos}
            keyboardPos={drag?.keyboardPos}
            settleTo={settle?.to}
            transition={knobProps.transition}
            registerApi={(api) => {
              overlayApiRef.current = api;
            }}>
            {renderCard(overlaySession.item)}
          </KanbanDragOverlay>
        )}

        {/* Screen-reader drag announcements (WAI-ARIA drag pattern) */}
        <View
          aria-live="assertive"
          aria-atomic
          data-kanban-announcer
          position="absolute"
          width={1}
          height={1}
          overflow="hidden"
          opacity={0}
          pointerEvents="none">
          <Text>{announcement}</Text>
        </View>
      </View>
    </AsyncBoundary>
  );
}

// ── Drag overlay ──────────────────────────────────────────────

interface KanbanDragOverlayProps {
  phase: 'pointer' | 'keyboard' | 'settling';
  width: number;
  height: number;
  initialPos?: { x: number; y: number };
  keyboardPos?: { x: number; y: number };
  settleTo?: { x: number; y: number };
  transition: any;
  registerApi: (api: OverlayApi) => void;
  children: React.ReactNode;
}

/**
 * Board-level clone of the dragged card. Pointer mode tracks 1:1 with no
 * tween (A-GESTURE); keyboard steps and the drop/cancel settle tween with the
 * animation knob (Axiom 4: leaps tween, carried values track).
 */
function KanbanDragOverlay({
  phase,
  width,
  height,
  initialPos,
  keyboardPos,
  settleTo,
  transition,
  registerApi,
  children,
}: KanbanDragOverlayProps) {
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(initialPos ?? null);

  useEffect(() => {
    registerApi({
      setPointer: (x: number, y: number) => {
        setPointerPos({ x, y });
      },
    });
  }, [registerApi]);

  const pos =
    phase === 'settling' && settleTo
      ? settleTo
      : phase === 'keyboard' && keyboardPos
        ? keyboardPos
        : (pointerPos ?? initialPos ?? keyboardPos ?? settleTo ?? null);
  if (!pos) {
    return null;
  }

  const lifted = phase !== 'settling';

  return (
    <View
      data-kanban-overlay
      data-kanban-overlay-phase={phase}
      position="absolute"
      top={0}
      left={0}
      x={pos.x}
      y={pos.y}
      width={width}
      height={height}
      pointerEvents="none"
      zIndex={1000}
      // 1:1 while the pointer carries the card; tween only for the discrete
      // keyboard steps and the settle leap.
      transition={phase === 'pointer' ? 'none' : transition}>
      <View
        transition={transition}
        enterStyle={{ scale: 1, rotate: '0deg' }}
        scale={lifted ? 1.03 : 1}
        rotate={lifted ? '2.5deg' : '0deg'}
        {...(lifted ? LIFT_SHADOW : undefined)}
        overflow="hidden"
        height="100%">
        <Card height="100%" overflow="hidden">
          {children}
        </Card>
      </View>
    </View>
  );
}

// ── Column ────────────────────────────────────────────────────

interface KanbanColumnViewProps<T> {
  kanbanId: string;
  column: KanbanColumn<T>;
  columnIndex: number;
  focusedColumnIndex: number;
  focusedCardIndex: number;
  renderCard: (item: T) => React.ReactNode;
  columnWidth: number;
  minColumnHeight: number;
  estimateSize: number;
  overscan: number;
  emptyColumnMessage: string;
  onCardSelect?: (item: T, columnId: string) => void;
  onCardPointerDown?: (item: T, columnId: string, index: number, e: any) => void;
  suppressClickRef: React.MutableRefObject<boolean>;
  registerColumn: (id: string, handle: ColumnHandle | null) => void;
  drag: KanbanDragRenderContext | null;
  settlingKey?: string | number;
  renderColumnActions?: (column: KanbanColumn<T>) => ReactNode;
  onLoadMore?: () => void;
  getItemKey?: (item: T, index: number) => string | number;
  hasMore?: boolean;
  isLoading?: boolean;
  onCardFocus?: (columnIndex: number, cardIndex: number) => void;
}

function KanbanColumnView<T>({
  kanbanId,
  column,
  columnIndex,
  focusedColumnIndex,
  focusedCardIndex,
  renderCard,
  columnWidth,
  minColumnHeight,
  estimateSize,
  overscan,
  emptyColumnMessage,
  onCardSelect,
  onCardPointerDown,
  suppressClickRef,
  registerColumn,
  drag,
  settlingKey,
  renderColumnActions,
  onLoadMore,
  getItemKey,
  hasMore,
  isLoading,
  onCardFocus,
}: KanbanColumnViewProps<T>) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const parentRef = useRef<HTMLDivElement>(null);
  // Hide column counts when a parent AsyncBoundary is in error.
  const itemCount = useAsyncCount(column.items.length);

  const virtualizer = useVirtualizer({
    count: column.items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    ...(getItemKey && {
      getItemKey: (index: number) => getItemKey(column.items[index], index),
    }),
  });

  const isActiveColumn = columnIndex === focusedColumnIndex;
  const isSource = drag?.sourceColumnId === column.id;
  const gapIndex = drag?.target.columnId === column.id ? drag.target.index : null;
  const isDropTarget = gapIndex != null;

  // FLIP readiness gate: first paint (and the virtualizer's initial
  // measurement corrections) must not wiggle into place (Axiom 4 mount rule).
  const [flipReady, setFlipReady] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setFlipReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  // Register geometry accessors for hit-testing / auto-scroll / settle math.
  useEffect(() => {
    registerColumn(column.id, {
      scrollEl: parentRef.current,
      getVirtualState: () => ({
        items: virtualizer.getVirtualItems().map((v) => ({ index: v.index, start: v.start, size: v.size })),
        totalSize: virtualizer.getTotalSize(),
        count: column.items.length,
      }),
      scrollToIndex: (index: number) => {
        if (column.items.length > 0) {
          virtualizer.scrollToIndex(Math.min(index, column.items.length - 1), { align: 'auto' });
        }
      },
    });
    return () => {
      registerColumn(column.id, null);
    };
  }, [registerColumn, column.id, column.items.length, virtualizer]);

  // Scroll to focused card within active column
  useEffect(() => {
    if (isActiveColumn && focusedCardIndex >= 0 && focusedCardIndex < column.items.length) {
      virtualizer.scrollToIndex(focusedCardIndex, { align: 'auto' });
    }
  }, [isActiveColumn, focusedCardIndex, column.items.length, virtualizer]);

  // Detect scroll near bottom for infinite scroll
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el || !onLoadMore || !hasMore || isLoading) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < estimateSize * 2) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore, isLoading, estimateSize]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) {
      return;
    }
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // Enter animations only for keys never seen on this board instance —
  // virtualization remounts on scroll must not replay them (Axiom 4).
  const seenKeysRef = useRef(new Set<string | number>());

  // Exit layer: cards removed from the data get a paired fade-out at their
  // last known slot (enter/exit pairing). Scroll-driven unmounts are
  // not data removals and are skipped.
  const lastRenderedRef = useRef(new Map<string | number, { item: T; y: number; size: number }>());
  const prevKeysRef = useRef<Set<string | number> | null>(null);
  const [leaving, setLeaving] = useState<{ key: string | number; item: T; y: number; size: number }[]>([]);

  const currentKeys = useMemo(() => {
    const keys = new Set<string | number>();
    column.items.forEach((item, index) => keys.add(getItemKey ? getItemKey(item, index) : index));
    return keys;
  }, [column.items, getItemKey]);

  useEffect(() => {
    const prev = prevKeysRef.current;
    prevKeysRef.current = currentKeys;
    if (!prev || !getItemKey) {
      return;
    }
    const gone: { key: string | number; item: T; y: number; size: number }[] = [];
    for (const key of prev) {
      if (currentKeys.has(key) || key === settlingKey) {
        continue;
      }
      const snapshot = lastRenderedRef.current.get(key);
      if (snapshot) {
        gone.push({ key, ...snapshot });
      }
    }
    if (gone.length > 0) {
      setLeaving((existing) => {
        const seen = new Set(existing.map((l) => l.key));
        return [...existing, ...gone.filter((g) => !seen.has(g.key))];
      });
    }
  }, [currentKeys, getItemKey, settlingKey]);

  useEffect(() => {
    if (leaving.length === 0) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      setLeaving([]);
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [leaving]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const gapOpensColumn = isDropTarget && !isSource;
  const contentHeight = totalSize + (gapOpensColumn ? (drag?.size ?? 0) : 0);

  const getStart = useCallback(
    (index: number): number => {
      const found = virtualItems.find((v) => v.index === index);
      return found ? found.start : index * estimateSize;
    },
    [virtualItems, estimateSize],
  );

  const gapY =
    gapIndex != null && drag
      ? gapPosition({
          gapIndex,
          sourceIndex: isSource ? drag.sourceIndex : null,
          count: column.items.length,
          size: drag.size,
          totalSize,
          getStart,
        })
      : null;

  const isEmpty = column.items.length === 0;
  // Wrapper transitions: FLIP displacement + data-change jumps tween; raw
  // scrolling measurement corrections and first paint stay instant. During an
  // active drag the transition stays on so displacement tweens even while
  // auto-scroll runs.
  const wrapperTransition =
    drag != null ? knobProps.transition : flipReady && !virtualizer.isScrolling ? knobProps.transition : undefined;

  return (
    <YStack
      width={columnWidth}
      minHeight={minColumnHeight}
      flexShrink={0}
      overflow="hidden"
      transition={knobProps.transition}
      {...knobProps.borderRadius}
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      backgroundColor={isDropTarget || isActiveColumn ? componentColors.interactive.background : 'transparent'}
      data-kanban-column={column.id}>
      <ListItem
        title={column.title}
        icon={
          column.color ? (
            <YStack
              {...radiusClassProps('R-PILL', 'Kanban column dot')}
              width={8}
              height={8}
              borderRadius={4}
              backgroundColor={column.color as any}
              data-kanban-column-dot
            />
          ) : undefined
        }
        iconAfter={
          itemCount !== undefined || renderColumnActions ? (
            <XStack alignItems="center" {...knobProps.gap}>
              {itemCount !== undefined && (
                <Text color={knobProps.textAccentColor} {...knobProps.label} {...knobProps.textWeight} data-async-count>
                  {itemCount}
                </Text>
              )}
              {renderColumnActions?.(column)}
            </XStack>
          ) : undefined
        }
        size={knobProps.sizeToken}
        borderBottomWidth={hairlineWidth}
        borderBottomColor="$borderColor"
      />

      {/* Cards container — always rendered so empty columns stay drop targets. */}
      <View
        ref={parentRef as any}
        data-kanban-column-scroll={column.id}
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: minColumnHeight - 60,
        }}
        pointerEvents={drag ? ('none' as any) : undefined}>
        {isEmpty ? (
          !isDropTarget && <EmptyState compact title={emptyColumnMessage} opacity={0.5} flex={1} />
        ) : (
          <View
            style={{
              height: contentHeight,
              width: '100%',
              position: 'relative',
            }}>
            {virtualItems.map((virtualItem) => {
              const item = column.items[virtualItem.index];
              const itemKey = getItemKey ? getItemKey(item, virtualItem.index) : virtualItem.index;
              const isFocused = isActiveColumn && focusedCardIndex === virtualItem.index;
              const isDragged = isSource && drag != null && virtualItem.index === drag.sourceIndex;

              let y = virtualItem.start;
              let ghost = false;
              let hidden = false;
              if (drag) {
                if (isDragged) {
                  if (gapIndex != null && gapY != null) {
                    // In-column silhouette: the origin card *is* the moving gap.
                    y = gapY;
                    ghost = true;
                  } else {
                    // Target moved to another column — the origin gap closes.
                    hidden = true;
                  }
                } else {
                  y +=
                    siblingOffset({
                      index: virtualItem.index,
                      sourceIndex: isSource && drag ? drag.sourceIndex : null,
                      gapIndex,
                      size: drag.size,
                    }) || 0;
                }
              }
              if (getItemKey && settlingKey != null && itemKey === settlingKey) {
                // The overlay is this card's visual while it settles into place.
                hidden = true;
              }

              if (getItemKey) {
                lastRenderedRef.current.set(itemKey, {
                  item,
                  y: virtualItem.start,
                  size: virtualItem.size,
                });
              }
              const isNew = flipReady && getItemKey != null && !seenKeysRef.current.has(itemKey);
              seenKeysRef.current.add(itemKey);

              return (
                <View
                  key={virtualItem.key}
                  ref={virtualizer.measureElement as any}
                  {...{ 'data-index': virtualItem.index }}
                  position="absolute"
                  top={0}
                  left={0}
                  width="100%"
                  y={y}
                  padding={CARD_INSET_PX}
                  transition={wrapperTransition}
                  opacity={hidden ? 0 : ghost ? 0.4 : 1}
                  pointerEvents={hidden ? ('none' as any) : undefined}>
                  <Card
                    id={`${kanbanId}-col-${columnIndex}-card-${virtualItem.index}`}
                    elevation={knobProps.elevation}
                    minHeight={MIN_PRESS_TARGET}
                    transition={knobProps.transition}
                    {...(isNew && {
                      enterStyle: { opacity: 0, scale: 0.97 },
                    })}
                    {...(ghost
                      ? {
                          borderWidth: hairlineWidth,
                          borderColor: componentColors.interactive.border,
                          borderStyle: 'dashed' as any,
                        }
                      : undefined)}
                    {...(isFocused ? { backgroundColor: '$accentBackground' } : undefined)}
                    {...(isFocused && wasKeyboardFocus() ? keyboardFocusRingProps : { outlineWidth: 0 })}
                    hoverStyle={{ backgroundColor: componentColors.interactive.background }}
                    pressStyle={{ scale: 0.98 }}
                    overflow="hidden"
                    data-kanban-card={String(itemKey)}
                    {...(isFocused && { 'data-kanban-focused': 'true' })}
                    {...(onCardPointerDown && { 'data-kanban-draggable': 'true' })}
                    onPress={() => {
                      onCardFocus?.(columnIndex, virtualItem.index);
                      if (suppressClickRef.current) {
                        return;
                      }
                      onCardSelect?.(item, column.id);
                    }}
                    cursor={onCardPointerDown ? 'grab' : 'pointer'}
                    {...(onCardPointerDown && {
                      onPointerDown: (e: any) => {
                        onCardPointerDown(item, column.id, virtualItem.index, e);
                      },
                    })}>
                    {renderCard(item)}
                  </Card>
                </View>
              );
            })}

            {/* Exit layer: paired fade-out for removed cards. */}
            <AnimatePresence>
              {leaving.map((l) => (
                <View
                  key={`leaving-${String(l.key)}`}
                  position="absolute"
                  top={0}
                  left={0}
                  width="100%"
                  y={l.y}
                  padding={CARD_INSET_PX}
                  pointerEvents="none"
                  transition={knobProps.transition}
                  exitStyle={{ opacity: 0, scale: 0.97 }}>
                  <Card overflow="hidden">{renderCard(l.item)}</Card>
                </View>
              ))}
            </AnimatePresence>
          </View>
        )}

        {/* Insertion slot outline for cross-column targets and empty columns. */}
        <AnimatePresence>
          {drag && gapIndex != null && !isSource && (
            <View
              key="kanban-slot"
              data-kanban-slot={column.id}
              position="absolute"
              top={0}
              left={0}
              width="100%"
              y={gapY ?? 0}
              height={drag.size}
              padding={CARD_INSET_PX}
              pointerEvents="none"
              transition={knobProps.transition}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}>
              <View
                flex={1}
                {...knobProps.borderRadius}
                borderStyle="dashed"
                borderColor={componentColors.interactive.border}
                backgroundColor={componentColors.interactive.background}
                opacity={0.8}
                alignItems="center"
                justifyContent="center">
                {isEmpty && (
                  <Text color={knobProps.textAccentColor} {...knobProps.label}>
                    {t('Drop here')}
                  </Text>
                )}
              </View>
            </View>
          )}
        </AnimatePresence>
      </View>

      {isLoading && (
        <YStack {...knobProps.panelPadding} alignItems="center">
          <Spinner size="small" />
        </YStack>
      )}
    </YStack>
  );
}

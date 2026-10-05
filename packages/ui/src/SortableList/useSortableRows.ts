import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_SPEED,
  LIST_COLUMN_ID,
  TOUCH_LONG_PRESS_MS,
  applyReorder,
  autoScrollVelocity,
  describeCancel,
  describeDragState,
  formatListAnnouncement,
  insertionIndexForY,
  keyboardLift,
  keyboardMove,
  listBoardSnapshot,
  resolveDrop,
  siblingOffset,
  type KanbanKeyboardDrag,
} from '../views/kanbanDnd';

export type SortableMode = 'keyboard' | 'pointer';

export interface SortableSession {
  mode: SortableMode;
  sourceIndex: number;
  targetIndex: number;
  id: string;
  label: string;
  size: number;
}

export interface UseSortableRowsOptions<T> {
  items: T[];
  getId: (item: T, index: number) => string;
  getLabel: (item: T, index: number) => string;
  canReorder?: (item: T, index: number) => boolean;
  onChange?: (next: T[]) => void;
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  rowSelector?: string;
}

const DEFAULT_ROW_SELECTOR = '[data-sortable-row], [data-child-row]';

const SortableSessionContext = createContext<{ sourceId: string | null }>({
  sourceId: null,
});

/** Lets a remount-prone cell (ChildTable handle) read lift state without recreating column defs. */
export function SortableSessionProvider({ sourceId, children }: { sourceId: string | null; children: ReactNode }) {
  return createElement(SortableSessionContext.Provider, { value: { sourceId } }, children);
}

export function useSortableDragging(itemId: string, dragging?: boolean) {
  const { sourceId } = useContext(SortableSessionContext);
  return dragging ?? sourceId === itemId;
}

export function useSortableRows<T>({
  items,
  getId,
  getLabel,
  canReorder,
  onChange,
  enabled,
  containerRef,
  rowSelector = DEFAULT_ROW_SELECTOR,
}: UseSortableRowsOptions<T>) {
  const [session, setSession] = useState<SortableSession | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const sessionRef = useRef<SortableSession | null>(null);
  sessionRef.current = session;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const board = useMemo(() => listBoardSnapshot(items.length), [items.length]);

  const ids = useMemo(() => items.map((item, i) => getId(item, i)), [items, getId]);
  const labels = useMemo(() => items.map((item, i) => getLabel(item, i)), [items, getLabel]);

  const rowEnabled = useCallback(
    (index: number) => {
      if (!enabled) {
        return false;
      }
      if (index < 0 || index >= items.length) {
        return false;
      }
      return canReorder ? canReorder(items[index], index) : true;
    },
    [canReorder, enabled, items],
  );

  const announce = useCallback(
    (type: 'lift' | 'move' | 'drop' | 'cancel', drag: KanbanKeyboardDrag, label: string) => {
      if (type === 'cancel') {
        setAnnouncement(
          formatListAnnouncement(describeCancel(drag, board, label), {
            sourcePosition: drag.sourceIndex + 1,
          }),
        );
        return;
      }
      setAnnouncement(formatListAnnouncement(describeDragState(type, drag, board, label)));
    },
    [board],
  );

  const toDrag = useCallback(
    (s: SortableSession): KanbanKeyboardDrag => ({
      sourceColumnId: LIST_COLUMN_ID,
      sourceIndex: s.sourceIndex,
      target: { columnId: LIST_COLUMN_ID, index: s.targetIndex },
    }),
    [],
  );

  const focusRow = useCallback(
    (id: string) => {
      const root = containerRef.current;
      if (!root) {
        return;
      }
      const el = root.querySelector(`[data-sortable-row="${id}"], [data-child-row-id="${id}"]`);
      (el as HTMLElement | null)?.focus?.();
    },
    [containerRef],
  );

  const liftAt = useCallback(
    (index: number, mode: SortableMode) => {
      if (!rowEnabled(index)) {
        return false;
      }
      const kb = keyboardLift(board, LIST_COLUMN_ID, index);
      if (!kb) {
        return false;
      }
      const next: SortableSession = {
        mode,
        sourceIndex: index,
        targetIndex: kb.target.index,
        id: ids[index],
        label: labels[index],
        size: 44,
      };
      setSession(next);
      sessionRef.current = next;
      announce('lift', kb, next.label);
      return true;
    },
    [announce, board, ids, labels, rowEnabled],
  );

  const moveSession = useCallback(
    (direction: 'up' | 'down') => {
      const current = sessionRef.current;
      if (!current) {
        return false;
      }
      const drag = toDrag(current);
      const moved = keyboardMove(drag, board, direction);
      if (moved === drag) {
        return true;
      }
      const next = { ...current, targetIndex: moved.target.index };
      setSession(next);
      sessionRef.current = next;
      announce('move', moved, current.label);
      return true;
    },
    [announce, board, toDrag],
  );

  const dropSession = useCallback(() => {
    const current = sessionRef.current;
    if (!current) {
      return false;
    }
    const drag = toDrag(current);
    const result = resolveDrop(drag);
    announce('drop', drag, current.label);
    setSession(null);
    sessionRef.current = null;
    if (result.commit) {
      onChange?.(applyReorder(itemsRef.current, result.from.index, result.to.index));
    }
    requestAnimationFrame(() => {
      focusRow(current.id);
    });
    return true;
  }, [announce, focusRow, onChange, toDrag]);

  const cancelSession = useCallback(() => {
    const current = sessionRef.current;
    if (!current) {
      return false;
    }
    announce('cancel', toDrag(current), current.label);
    setSession(null);
    sessionRef.current = null;
    requestAnimationFrame(() => {
      focusRow(current.id);
    });
    return true;
  }, [announce, focusRow, toDrag]);

  const onRowKeyDown = useCallback(
    (index: number, e: { key: string; preventDefault: () => void }) => {
      if (!enabled) {
        return;
      }
      if (sessionRef.current) {
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        liftAt(index, 'keyboard');
      }
    },
    [enabled, liftAt],
  );

  const onHandleKeyDown = useCallback(
    (index: number, e: { key: string; preventDefault: () => void }) => {
      if (!enabled) {
        return;
      }
      if (sessionRef.current) {
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        liftAt(index, 'keyboard');
      }
    },
    [enabled, liftAt],
  );

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      const current = sessionRef.current;
      if (current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelSession();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          moveSession('down');
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          moveSession('up');
          return;
        }
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          dropSession();
        }
        return;
      }
      if (e.key !== ' ' && e.key !== 'Enter') {
        return;
      }
      const handle = (e.target as HTMLElement | null)?.closest?.('[data-sortable-handle]');
      if (!handle) {
        return;
      }
      const id = handle.getAttribute('data-sortable-handle');
      const index = ids.indexOf(id ?? '');
      if (index < 0) {
        return;
      }
      e.preventDefault();
      liftAt(index, 'keyboard');
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [cancelSession, dropSession, enabled, ids, liftAt, moveSession]);

  const measure = useCallback(() => {
    const root = containerRef.current;
    if (!root) {
      return { items: [], size: 44 };
    }
    const els = [...root.querySelectorAll(rowSelector)];
    const top = root.getBoundingClientRect().top;
    const rows = els.map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        start: r.top - top + root.scrollTop,
        size: r.height,
      };
    });
    return { items: rows, size: rows[0]?.size ?? 44 };
  }, [containerRef, rowSelector]);

  const onHandlePointerDown = useCallback(
    (index: number, e: { pointerType?: string; clientY: number; pointerId?: number; preventDefault?: () => void }) => {
      if (!enabled || !rowEnabled(index)) {
        return;
      }
      e.preventDefault?.();
      const pointerType = e.pointerType ?? 'mouse';
      let lifted = false;
      let hold: ReturnType<typeof setTimeout> | null = null;

      const liftPointer = (clientY: number) => {
        if (lifted) {
          return;
        }
        lifted = true;
        const { items: measured, size } = measure();
        if (!liftAt(index, 'pointer')) {
          return;
        }
        const current = sessionRef.current;
        if (current) {
          const sized = { ...current, size };
          setSession(sized);
          sessionRef.current = sized;
        }
        const localY = (() => {
          const root = containerRef.current;
          if (!root) {
            return 0;
          }
          return clientY - root.getBoundingClientRect().top + root.scrollTop;
        })();
        const target = insertionIndexForY({
          localY,
          items: measured,
          sourceIndex: index,
          count: itemsRef.current.length,
          size,
        });
        const next = sessionRef.current;
        if (next && target !== next.targetIndex) {
          const moved = { ...next, targetIndex: target };
          setSession(moved);
          sessionRef.current = moved;
          announce('move', toDrag(moved), moved.label);
        }
      };

      const onMove = (ev: PointerEvent) => {
        if (!lifted) {
          return;
        }
        const root = containerRef.current;
        if (!root) {
          return;
        }
        const rect = root.getBoundingClientRect();
        const vel = autoScrollVelocity({
          pos: ev.clientY,
          start: rect.top,
          end: rect.bottom,
          edge: AUTO_SCROLL_EDGE_PX,
          maxSpeed: AUTO_SCROLL_MAX_SPEED,
        });
        if (vel) {
          root.scrollTop += vel;
        }
        const { items: measured, size } = measure();
        const localY = ev.clientY - rect.top + root.scrollTop;
        const current = sessionRef.current;
        if (!current) {
          return;
        }
        const target = insertionIndexForY({
          localY,
          items: measured,
          sourceIndex: current.sourceIndex,
          count: itemsRef.current.length,
          size,
        });
        if (target === current.targetIndex) {
          return;
        }
        const moved = { ...current, targetIndex: target };
        setSession(moved);
        sessionRef.current = moved;
        announce('move', toDrag(moved), moved.label);
      };

      const teardown = () => {
        if (hold != null) {
          clearTimeout(hold);
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      };

      const onUp = () => {
        teardown();
        if (lifted) {
          dropSession();
        }
      };
      const onCancel = () => {
        teardown();
        if (lifted) {
          cancelSession();
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);

      if (pointerType === 'mouse') {
        liftPointer(e.clientY);
      } else {
        hold = setTimeout(() => {
          liftPointer(e.clientY);
        }, TOUCH_LONG_PRESS_MS);
      }
    },
    [announce, cancelSession, containerRef, dropSession, enabled, liftAt, measure, rowEnabled, toDrag],
  );

  const translateForIndex = useCallback(
    (index: number) => {
      const current = session;
      if (!current) {
        return 0;
      }
      return siblingOffset({
        index,
        sourceIndex: current.sourceIndex,
        gapIndex: current.targetIndex,
        size: current.size,
      });
    },
    [session],
  );

  return {
    session,
    announcement,
    focusedIndex,
    setFocusedIndex,
    rowEnabled,
    ids,
    labels,
    liftAt,
    onRowKeyDown,
    onHandleKeyDown,
    onHandlePointerDown,
    translateForIndex,
    liveProps: {
      'aria-live': 'polite' as const,
      'aria-atomic': true,
      'data-sortable-live': 'true',
    },
  };
}

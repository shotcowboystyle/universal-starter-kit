import { type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useRef } from 'react';

export interface UseDragScrollOptions {
  /** Direction of scroll - vertical or horizontal */
  direction?: 'vertical' | 'horizontal';
  /** Multiplier for drag distance (default: 1) */
  sensitivity?: number;
  /** Callback when drag starts */
  onDragStart?: () => void;
  /** Callback when drag ends */
  onDragEnd?: () => void;
}

export interface UseDragScrollReturn {
  /** Ref to attach to the scrollable container */
  scrollRef: RefObject<HTMLElement | null>;
  /** Props to spread on the scrollable container */
  dragProps: {
    onPointerDown: (e: ReactPointerEvent) => void;
    style: CSSProperties;
  };
}

/**
 * Hook to enable drag-to-scroll behavior on a scrollable container.
 * Allows users to click and drag to scroll the content.
 */
export function useDragScroll(options: UseDragScrollOptions = {}): UseDragScrollReturn {
  const { direction = 'vertical', sensitivity = 1, onDragStart, onDragEnd } = options;

  const scrollRef = useRef<HTMLElement | null>(null);
  const isDragging = useRef(false);
  const startPos = useRef(0);
  const startScroll = useRef(0);
  const hasMoved = useRef(false);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging.current || !scrollRef.current) {
        return;
      }

      const currentPos = direction === 'vertical' ? e.clientY : e.clientX;
      const delta = (startPos.current - currentPos) * sensitivity;

      if (Math.abs(delta) > 3) {
        hasMoved.current = true;
      }

      if (direction === 'vertical') {
        scrollRef.current.scrollTop = startScroll.current + delta;
      } else {
        scrollRef.current.scrollLeft = startScroll.current + delta;
      }
    },
    [direction, sensitivity],
  );

  const handlePointerUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      if (hasMoved.current) {
        onDragEnd?.();
      }
    }
  }, [handlePointerMove, onDragEnd]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      // Only handle primary button (left click)
      if (e.button !== 0) {
        return;
      }
      // Don't interfere with interactive elements
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('a') ||
        target.closest('[role="option"]') ||
        target.closest('[role="button"]')
      ) {
        return;
      }

      isDragging.current = true;
      hasMoved.current = false;
      startPos.current = direction === 'vertical' ? e.clientY : e.clientX;
      startScroll.current =
        direction === 'vertical' ? (scrollRef.current?.scrollTop ?? 0) : (scrollRef.current?.scrollLeft ?? 0);

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.body.style.userSelect = 'none';

      onDragStart?.();
    },
    [direction, handlePointerMove, handlePointerUp, onDragStart],
  );

  return {
    scrollRef,
    dragProps: {
      onPointerDown: handlePointerDown,
      style: {
        cursor: 'grab',
        touchAction: direction === 'vertical' ? 'pan-x' : 'pan-y',
      },
    },
  };
}

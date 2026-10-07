/**
 * Horizontal scroll hook and scroll arrow component for toolbar overflow
 *
 * Extracted as-is from EditorToolbar.tsx (well-implemented).
 */

import { useDirection } from '@repo/ui';
import { transitionProps } from '@repo/theme';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { LinearGradient } from '@tamagui/linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'tamagui';

const scrollArrowThreshold = 8;

/**
 * Physical px distances from each horizontal scroll edge. The arrows are
 * physically-anchored edge overlays (left:0 / right:0), but CSSOM flips the
 * `scrollLeft` range under RTL: an RTL scroller runs 0 → −(scrollWidth −
 * clientWidth), so the LTR reading (`scrollLeft` = distance from the left
 * edge) inverts and both arrow visibility and the remaining-distance clamp
 * break. Normalize per `useDirection()` (house RTL pattern) instead of
 * reading the raw sign.
 */
export function horizontalScrollEdges(
  element: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>,
  direction: 'ltr' | 'rtl',
): { fromLeftEdge: number; fromRightEdge: number } {
  const range = Math.max(element.scrollWidth - element.clientWidth, 0);
  const minScrollLeft = direction === 'rtl' ? -range : 0;
  return {
    fromLeftEdge: element.scrollLeft - minScrollLeft,
    fromRightEdge: minScrollLeft + range - element.scrollLeft,
  };
}

// ===========================================================================
// useHorizontalScroll
// ===========================================================================

/**
 * Hook to enable horizontal scroll via mouse wheel and drag
 */
export function useHorizontalScroll(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    // Handle wheel -> horizontal scroll (both vertical and horizontal wheel)
    const handleWheel = (e: WheelEvent) => {
      // Use deltaY (vertical scroll) or deltaX (horizontal scroll)
      const delta = e.deltaY === 0 ? e.deltaX : e.deltaY;
      if (delta !== 0 && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += delta;
      }
    };

    // Handle drag to scroll
    let isDown = false;
    let isDragging = false;
    let startX = 0;
    let scrollLeft = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      isDown = true;
      isDragging = false;
      startX = e.clientX;
      scrollLeft = el.scrollLeft;
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging) {
        // Prevent click on buttons if we were dragging
        e.preventDefault();
        e.stopPropagation();
      }
      isDown = false;
      isDragging = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) {
        return;
      }

      const x = e.clientX;
      const diff = Math.abs(x - startX);

      // Start dragging after moving more than 5px
      if (diff > 5) {
        isDragging = true;
        e.preventDefault();
        const walk = x - startX;
        el.scrollLeft = scrollLeft - walk;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('mousedown', handleMouseDown, { capture: true });
    el.addEventListener('mouseup', handleMouseUp, { capture: true });
    el.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', () => {
      isDown = false;
      isDragging = false;
    });

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('mousedown', handleMouseDown, { capture: true });
      el.removeEventListener('mouseup', handleMouseUp, { capture: true });
      el.removeEventListener('mousemove', handleMouseMove);
    };
  }, [ref]);
}

// ===========================================================================
// useHorizontalScrollArrows
// ===========================================================================

/**
 * Hook to track horizontal scroll arrows visibility
 */
export function useHorizontalScrollArrows() {
  const direction = useDirection();
  const [arrowLeft, setArrowLeft] = useState(false);
  const [arrowRight, setArrowRight] = useState(false);
  const arrowScrollDirRef = useRef<'left' | 'right' | null>(null);

  const updateArrows = useCallback(
    (element: HTMLElement) => {
      const { fromLeftEdge, fromRightEdge } = horizontalScrollEdges(element, direction);
      const left = fromLeftEdge > scrollArrowThreshold;
      const right = fromRightEdge > scrollArrowThreshold;
      setArrowLeft((prev) => (prev === left ? prev : left));
      setArrowRight((prev) => (prev === right ? prev : right));
    },
    [direction],
  );

  return { arrowLeft, arrowRight, arrowScrollDirRef, updateArrows };
}

// ===========================================================================
// HorizontalScrollArrow
// ===========================================================================

export interface HorizontalScrollArrowProps {
  direction: 'left' | 'right';
  scrollRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
  arrowScrollDirRef: React.RefObject<'left' | 'right' | null>;
  transition?: string;
}

/**
 * Horizontal scroll arrow component
 */
export function HorizontalScrollArrow({
  direction,
  scrollRef,
  visible,
  arrowScrollDirRef,
  transition,
}: HorizontalScrollArrowProps) {
  const isLeft = direction === 'left';
  const textDirection = useDirection();
  const animationFrameRef = useRef(0);
  const lastTimeRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringRef = useRef(false);
  const activeRef = useRef(false);
  const selfScrollingRef = useRef(false);
  const resumeDelay = 100;

  const stopLoop = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;
  }, []);

  const startLoop = useCallback(() => {
    if (activeRef.current || !hoveringRef.current) {
      return;
    }
    activeRef.current = true;
    lastTimeRef.current = performance.now();
    const tick = () => {
      const el = scrollRef.current;
      if (!el || !hoveringRef.current || !activeRef.current) {
        activeRef.current = false;
        return;
      }
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      lastTimeRef.current = now;
      // Remaining distance to this arrow's physical edge (RTL-normalized);
      // the step itself stays physical: scrollLeft always decreases leftward.
      const { fromLeftEdge, fromRightEdge } = horizontalScrollEdges(el, textDirection);
      const px = Math.min(elapsed / 2, Math.max(isLeft ? fromLeftEdge : fromRightEdge, 0));
      if (px > 0) {
        selfScrollingRef.current = true;
        arrowScrollDirRef.current = isLeft ? 'left' : 'right';
        el.scrollLeft += isLeft ? -px : px;
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [isLeft, scrollRef, arrowScrollDirRef, textDirection]);

  const openTimestampRef = useRef(0);
  useEffect(() => {
    openTimestampRef.current = performance.now();
  }, [visible]);

  const handlePointerEnter = useCallback(() => {
    hoveringRef.current = true;
    const elapsed = performance.now() - openTimestampRef.current;
    const wasOverOnOpen = elapsed < 80;
    if (wasOverOnOpen) {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
      }
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null;
        if (hoveringRef.current) {
          startLoop();
        }
      }, 600);
    } else {
      startLoop();
    }
  }, [startLoop]);

  const handlePointerLeave = useCallback(() => {
    hoveringRef.current = false;
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    stopLoop();
  }, [stopLoop]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !visible) {
      return;
    }
    const onScroll = () => {
      if (selfScrollingRef.current) {
        selfScrollingRef.current = false;
        return;
      }
      if (!hoveringRef.current) {
        return;
      }
      stopLoop();
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
      }
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null;
        if (hoveringRef.current) {
          startLoop();
        }
      }, resumeDelay);
    };
    el.addEventListener('scroll', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [scrollRef, visible, startLoop, stopLoop]);

  useEffect(
    () => () => {
      handlePointerLeave();
    },
    [handlePointerLeave],
  );

  const Icon = isLeft ? CaretLeftIcon : CaretRightIcon;

  return (
    <View
      position="absolute"
      {...{ [isLeft ? 'left' : 'right']: 0 }}
      top={0}
      bottom={0}
      width={28}
      alignItems="center"
      justifyContent="center"
      zIndex={2}
      pointerEvents={visible ? 'auto' : 'none'}
      opacity={visible ? 1 : 0}
      // `animation` is the tamagui 1.x prop — silently dropped on 2.x, which
      // left this opacity fade popping.
      {...transitionProps(transition)}
      onPointerEnter={visible ? handlePointerEnter : undefined}
      onPointerLeave={handlePointerLeave}
      data-testid={`toolbar-scroll-arrow-${direction}`}>
      <LinearGradient
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        colors={isLeft ? ['$color3', 'transparent'] : ['transparent', '$color3']}
        start={isLeft ? [0, 0] : [0.6, 0]}
        end={isLeft ? [0.6, 0] : [1, 0]}
      />
      <View
        position="relative"
        zIndex={1}>
        <Icon size={16} />
      </View>
    </View>
  );
}

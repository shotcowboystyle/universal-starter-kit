import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';
import { useResolvedKnobs } from '@repo/theme';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { View } from 'tamagui';

import { FocusContext, getInputFrameTransitionProps } from '../InputParts';

const dropdownMaxRadiusTokenNum = 8;

export function clampDropdownRadius(fieldRadius: string): string | 0 {
  if (fieldRadius === '$0') {
    return 0;
  }
  if (typeof fieldRadius === 'string' && fieldRadius.startsWith('$')) {
    const num = Number.parseInt(fieldRadius.slice(1), 10);
    return num > dropdownMaxRadiusTokenNum ? `$${dropdownMaxRadiusTokenNum}` : fieldRadius;
  }
  return fieldRadius;
}

export function SyncFocusToOpen({ open }: { open: boolean }) {
  const { setFocused } = FocusContext.useStyledContext();
  useEffect(() => {
    setFocused(open);
  }, [open, setFocused]);
  return null;
}

export const scrollArrowThreshold = 8;

// ── Scroll Arrow (sticky inside scrollable panels) ────────────

export function ScrollArrow({
  direction,
  scrollRef,
  visible,
  arrowScrollDirRef,
}: {
  direction: 'up' | 'down';
  scrollRef: RefObject<HTMLElement | null>;
  visible: boolean;
  arrowScrollDirRef: RefObject<'up' | 'down' | null>;
}) {
  const isUp = direction === 'up';
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
      const px = Math.min(
        elapsed / 2,
        Math.max(isUp ? el.scrollTop : el.scrollHeight - el.clientHeight - el.scrollTop, 0),
      );
      if (px > 0) {
        selfScrollingRef.current = true;
        arrowScrollDirRef.current = isUp ? 'up' : 'down';
        el.scrollTop += isUp ? -px : px;
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [isUp, scrollRef]);

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
    el.addEventListener('scroll', onScroll, { passive: true });
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

  const Icon = isUp ? CaretUpIcon : CaretDownIcon;
  const { knobProps } = useResolvedKnobs();
  const iconSize = knobProps.controlIcon.width;
  const transitionProps = getInputFrameTransitionProps(
    typeof knobProps.transition === 'string' ? knobProps.transition : undefined,
  );
  const transitionStyle = transitionProps && 'style' in transitionProps ? transitionProps.style : undefined;

  return (
    <View position="sticky" top={isUp ? 0 : undefined} bottom={isUp ? undefined : 0} height={0} zIndex={2}>
      <View
        data-mpo-scroll-arrow=""
        data-direction={direction}
        data-icon-size={String(iconSize)}
        position="absolute"
        left={0}
        right={0}
        top={isUp ? 0 : undefined}
        bottom={isUp ? undefined : 0}
        {...knobProps.controlIcon}
        width="100%"
        alignItems="center"
        justifyContent="center"
        pointerEvents={visible ? 'auto' : 'none'}
        opacity={visible ? 1 : 0}
        {...transitionProps}
        style={{
          ...transitionStyle,
          background: isUp
            ? 'linear-gradient(to bottom, var(--background) 40%, transparent)'
            : 'linear-gradient(to top, var(--background) 40%, transparent)',
        }}
        onPointerEnter={visible ? handlePointerEnter : undefined}
        onPointerLeave={handlePointerLeave}>
        <View position="relative" zIndex={1} {...knobProps.controlIcon} style={{ lineHeight: 0 }}>
          <Icon size={iconSize} />
        </View>
      </View>
    </View>
  );
}

import { useResolvedKnobs } from '@repo/theme';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';
import type { GetProps, SizeTokens } from 'tamagui';
import { View, getTokens, isWeb, styled, Text } from 'tamagui';

import { t } from '../shared/t';

import { fireSelectionHaptic } from './haptic';
import { WheelEdgeFade } from './WheelEdgeFade';

// ── Types ─────────────────────────────────────────────────────

export interface WheelItem<T = string | number> {
  value: T;
  label?: string;
}

/** iOS 14 multi-column highlight joining (CupertinoPicker capStart/capEnd). */
export type WheelHighlightEdges = 'all' | 'start' | 'end' | 'none';

export interface WheelProps<T = string | number> {
  /** Array of items to display */
  items: (T | WheelItem<T>)[];
  /** Currently selected value */
  value?: T;
  /** Called when selection changes */
  onChange?: (value: T) => void;
  /** Number of visible items (should be odd for center alignment) */
  visibleItems?: 3 | 5 | 7;
  /** Height of each item */
  itemHeight?: number;
  /** Column width in px. Items are absolutely positioned, so this is the painted width. */
  width?: number;
  /** Custom render function for items */
  renderItem?: (item: T, index: number, isSelected: boolean) => ReactNode;
  /** Whether the wheel is disabled */
  disabled?: boolean;
  /** Size token for text */
  size?: SizeTokens;
  /**
   * When true (and there are at least 2 items), scrolling wraps at the ends
   * instead of rubber-banding. Uses virtual rows with modulo item indexing.
   */
  loop?: boolean;
  /**
   * How the iOS selection fill rounds and insets. `"all"` is a standalone
   * column; `"start"` / `"end"` / `"none"` join adjacent columns into one band.
   */
  highlightEdges?: WheelHighlightEdges;
  /** Stretch inside a row of columns (time picker). */
  flex?: number;
  /**
   * Fires once each time a different item crosses the centre band (drag,
   * flick, or snap). Native wires this to a selection haptic.
   */
  onItemCross?: (value: T, index: number) => void;
  /** Accessible name for the picker (web renders role="slider"). */
  'aria-label'?: string;
}

// ── iOS Physics Constants ─────────────────────────────────────
// Based on Apple's UIScrollView deceleration behavior

const friction = 0.95; // Apple's PKScrollViewDecelerationFrictionFactor
const minVelocity = 0.5; // Minimum velocity before snapping
const momentumMultiplier = 0.8; // Velocity multiplier for momentum feel
const rubberBandConstant = 0.55; // Apple's rubber-banding constant
const tapSlopPx = 8;

interface WheelPointer {
  clientY: number;
  pointerId: number;
  locationY?: number;
}

/**
 * Flutter CupertinoPicker / UIPickerView cylinder. diameterRatio 1.07 and
 * squeeze 1.45 are the Cupertino defaults — a shallow drum, not a 70° fan.
 */
const diameterRatio = 1.07;
const squeeze = 1.45;
const perspectivePx = 400;
const defaultColumnWidth = 88;

/** Type scale for wheel numerals — iOS UIPickerView is ~21pt at default size. */
const wheelFontBySize: Record<'small' | 'medium' | 'large', SizeTokens> = {
  small: '$6',
  medium: '$8',
  large: '$9',
};

/** Durations for discrete snaps (mirrors theme animationConfig). */
const transitionDurationsMs: Record<string, number> = {
  bouncy: 200,
  lazy: 600,
  slow: 500,
  medium: 250,
  quick: 100,
  tooltip: 400,
  snappy: 80,
  gentle: 450,
};

// The interactive wrapper is a raw <div>, so the non-removable focus-visible
// ring (2px solid $outlineColor) has to come from
// an injected stylesheet — inline styles cannot express :focus-visible.
// Inset (−2px): the viewport clips overflow to radius (clipping arm).
const WHEEL_FOCUS_STYLE_ID = 'mp1-wheel-focus';
function ensureWheelFocusStyles() {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(WHEEL_FOCUS_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = WHEEL_FOCUS_STYLE_ID;
  style.textContent =
    '.mp1-wheel-wrapper:focus-visible { outline: 2px solid var(--outlineColor, var(--c-outlineColor, CanvasText)); outline-offset: -2px; }';
  document.head.appendChild(style);
}

const wheelMaskStyle: CSSProperties | undefined = isWeb
  ? {
      WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, #000 32%, #000 68%, rgba(0,0,0,0.28) 100%)',
      maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, #000 32%, #000 68%, rgba(0,0,0,0.28) 100%)',
    }
  : undefined;

// ── Styled components ─────────────────────────────────────────

const WheelContainer = styled(View, {
  name: 'Wheel',
  position: 'relative',
  overflow: 'hidden',
  userSelect: 'none',
});

const WheelItemContainer = styled(View, {
  name: 'WheelItem',
  position: 'absolute',
  left: 0,
  right: 0,
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
});

const SelectionIndicator = styled(View, {
  name: 'WheelSelectionIndicator',
  position: 'absolute',
  left: 0,
  right: 0,
  pointerEvents: 'none',
});

// ── Helper functions ──────────────────────────────────────────

function normalizeItem<T>(item: T | WheelItem<T>): WheelItem<T> {
  if (typeof item === 'object' && item !== null && 'value' in item) {
    return item;
  }
  return { value: item, label: String(item) };
}

function getItemLabel<T>(item: T | WheelItem<T>): string {
  const normalized = normalizeItem(item);
  return normalized.label ?? String(normalized.value);
}

function getItemValue<T>(item: T | WheelItem<T>): T {
  const normalized = normalizeItem(item);
  return normalized.value;
}

/** Non-negative modulo (JavaScript % can be negative for negative lhs). */
function modIndex(row: number, n: number): number {
  if (n <= 0) {
    return 0;
  }
  return ((row % n) + n) % n;
}

/**
 * Scroll offset that shows the same item as `targetOffset` (same row mod n), chosen so its
 * value is closest to `referenceOffset` — shortest motion when animating from `referenceOffset`.
 */
function equivalentOffsetNear(referenceOffset: number, targetOffset: number, n: number, itemHeight: number): number {
  if (n <= 0 || itemHeight <= 0) {
    return targetOffset;
  }
  const rT = Math.round(targetOffset / itemHeight);
  const m = modIndex(rT, n);
  const span = n * itemHeight;
  const base = m * itemHeight;
  const k = Math.round((referenceOffset - base) / span);
  return base + k * span;
}

/** Shortest steps on the item circle from current row to target data index. */
function nearestRowForDataIndex(currentRow: number, targetDataIndex: number, n: number): number {
  const currentMod = modIndex(currentRow, n);
  let delta = targetDataIndex - currentMod;
  if (delta > n / 2) {
    delta -= n;
  }
  if (delta < -n / 2) {
    delta += n;
  }
  return currentRow + delta;
}

// Rubber-band effect for over-scrolling (iOS style)
function rubberBand(offset: number, dimension: number): number {
  const c = rubberBandConstant;
  const x = Math.abs(offset);
  const result = (x * dimension * c) / (dimension + c * x);
  return offset < 0 ? -result : result;
}

/**
 * Project a row onto the Cupertino cylinder. Angle 0 sits in the selection
 * band; off-center rows recede with rotateX + foreshortening (not opacity —
 * row text stays on the AA $color11 ramp).
 */
function getItemTransform(
  index: number,
  scrollOffset: number,
  itemHeight: number,
  containerHeight: number,
): { translateY: number; rotateX: number; scale: number; opacity: number } {
  const radius = (containerHeight * diameterRatio) / 2;
  const angle = (index * itemHeight - scrollOffset) / squeeze / Math.max(radius, 1);
  const clamped = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, angle));
  const centerTop = (containerHeight - itemHeight) / 2;
  const translateY = centerTop + radius * Math.sin(clamped);
  const rotateX = -(clamped * 180) / Math.PI;
  const scale = Math.max(0.72, Math.min(1, Math.cos(clamped)));
  return {
    translateY,
    rotateX,
    scale,
    opacity: 1,
  };
}

function tokenPx(token: string | number, scale: 'radius' | 'space'): number {
  if (typeof token === 'number') {
    return token;
  }
  const key = String(token).replace(/^\$/, '');
  const val = (getTokens() as { [k: string]: Record<string, { val?: number }> })[scale]?.[key]?.val;
  if (typeof val === 'number') {
    return val;
  }
  return scale === 'radius' ? 9 : 8;
}

function highlightBandStyle(edges: WheelHighlightEdges, radiusToken: string | number, pointy: boolean): CSSProperties {
  const r = pointy ? 0 : tokenPx(radiusToken, 'radius');
  const inset = tokenPx('$2', 'space');
  const capStart = edges === 'all' || edges === 'start';
  const capEnd = edges === 'all' || edges === 'end';
  return {
    borderStartStartRadius: capStart ? r : 0,
    borderStartEndRadius: capEnd ? r : 0,
    borderEndStartRadius: capStart ? r : 0,
    borderEndEndRadius: capEnd ? r : 0,
    marginInlineStart: capStart ? inset : 0,
    marginInlineEnd: capEnd ? inset : 0,
  };
}

// ── Wheel Component ───────────────────────────────────────────

export function Wheel<T = string | number>({
  items,
  value,
  onChange,
  visibleItems = 5,
  itemHeight: itemHeightProp,
  width: widthProp,
  renderItem,
  disabled = false,
  size: sizeProp,
  loop = false,
  highlightEdges = 'all',
  flex,
  onItemCross,
  'aria-label': ariaLabel,
}: WheelProps<T>) {
  const { knobProps } = useResolvedKnobs();
  const sizeKnob = (knobProps.size as 'small' | 'medium' | 'large') ?? 'medium';
  const size = sizeProp ?? wheelFontBySize[sizeKnob] ?? '$8';
  // Row geometry rides nestedControl (density-aware, 32px at medium — iOS
  // UIPickerView item extent). Explicit itemHeight ejects.
  const itemHeight = itemHeightProp ?? knobProps.nestedControl.px ?? 32;
  const columnWidth = widthProp ?? defaultColumnWidth;
  ensureWheelFocusStyles();
  // Discrete snaps (keyboard / controlled value) tween; drag stays 1:1.
  // knobProps.transition is undefined at animation "none" (which also carries
  // prefers-reduced-motion) — snaps must JUMP then, not fall back to a tween.
  const motionTransition = knobProps.transition as string | undefined;
  const snapDurationMs = motionTransition ? (transitionDurationsMs[motionTransition] ?? 100) : 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const n = items.length;
  const loopEnabled = Boolean(loop && n > 1);

  // Keep a ref in sync with scrollOffset to avoid stale closures
  const scrollOffsetRef = useRef(scrollOffset);
  scrollOffsetRef.current = scrollOffset;

  // Animation state
  const animationRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const hasMountedRef = useRef(false);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  // Drag state
  const isDraggingRef = useRef(false);
  const lastYRef = useRef(0);
  const downYRef = useRef(0);
  const dragDistanceRef = useRef(0);
  const lastTimeRef = useRef(0);
  const dragVelocitiesRef = useRef<number[]>([]);

  const containerHeight = itemHeight * visibleItems;
  const paddingItems = Math.floor(visibleItems / 2);
  const minOffset = 0;
  const maxOffset = n > 0 ? (n - 1) * itemHeight : 0;

  const liveDataIndex =
    n === 0
      ? 0
      : loopEnabled
        ? modIndex(Math.round(scrollOffset / itemHeight), n)
        : Math.max(0, Math.min(Math.round(scrollOffset / itemHeight), n - 1));

  const lastCrossIndexRef = useRef<number | null>(null);
  const onItemCrossRef = useRef(onItemCross);
  onItemCrossRef.current = onItemCross;
  useEffect(() => {
    if (n === 0) {
      return;
    }
    if (lastCrossIndexRef.current === null) {
      lastCrossIndexRef.current = liveDataIndex;
      return;
    }
    if (lastCrossIndexRef.current === liveDataIndex) {
      return;
    }
    lastCrossIndexRef.current = liveDataIndex;
    const item = items[liveDataIndex];
    if (item === undefined) {
      return;
    }
    onItemCrossRef.current?.(getItemValue(item), liveDataIndex);
    fireSelectionHaptic();
  }, [liveDataIndex, items, n]);

  const runSnapComplete = useCallback(
    (finalOffset: number, dataIndex: number) => {
      const safeIdx = Math.max(0, Math.min(dataIndex, n - 1));
      const settled = loopEnabled && n > 0 ? equivalentOffsetNear(0, finalOffset, n, itemHeight) : finalOffset;
      scrollOffsetRef.current = settled;
      setScrollOffset(settled);
      setSelectedIndex(safeIdx);
      onChange?.(getItemValue(items[safeIdx]));
      isAnimatingRef.current = false;
    },
    [items, n, onChange, loopEnabled, itemHeight],
  );

  const animateToOffset = useCallback(
    (targetOffset: number, dataIndex: number, animated: boolean) => {
      const startOffset = scrollOffsetRef.current;
      const goal = loopEnabled && n > 0 ? equivalentOffsetNear(startOffset, targetOffset, n, itemHeight) : targetOffset;

      if (!animated || snapDurationMs <= 0) {
        runSnapComplete(goal, dataIndex);
        return;
      }

      const distance = goal - startOffset;
      if (Math.abs(distance) < 0.5) {
        runSnapComplete(goal, dataIndex);
        return;
      }
      const duration = snapDurationMs;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const newOffset = startOffset + distance * eased;
        scrollOffsetRef.current = newOffset;
        setScrollOffset(newOffset);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          runSnapComplete(goal, dataIndex);
        }
      };

      isAnimatingRef.current = true;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = requestAnimationFrame(animate);
    },
    [loopEnabled, n, itemHeight, runSnapComplete, snapDurationMs],
  );

  /** Snap selection to a data index (0..n-1). */
  const snapToIndex = useCallback(
    (targetIndex: number, animated = true) => {
      if (n === 0) {
        return;
      }
      const clampedData = Math.max(0, Math.min(targetIndex, n - 1));

      if (!loopEnabled) {
        const targetOffset = clampedData * itemHeight;
        animateToOffset(targetOffset, clampedData, animated);
        return;
      }

      const currentR = Math.round(scrollOffsetRef.current / itemHeight);
      const targetR = nearestRowForDataIndex(currentR, clampedData, n);
      const targetOffset = targetR * itemHeight;
      const dataIdx = modIndex(targetR, n);
      animateToOffset(targetOffset, dataIdx, animated);
    },
    [n, itemHeight, loopEnabled, animateToOffset],
  );

  // Sync from controlled value — discrete jumps animate; drag stays live.
  useEffect(() => {
    if (value === undefined) {
      return;
    }
    const index = items.findIndex((item) => getItemValue(item) === value);
    if (index === -1) {
      return;
    }

    // First paint: land instantly (no entrance tween from 0).
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      setSelectedIndex(index);
      const raw = index * itemHeight;
      const settled = loopEnabled && n > 1 ? equivalentOffsetNear(0, raw, n, itemHeight) : raw;
      scrollOffsetRef.current = settled;
      setScrollOffset(settled);
      return;
    }

    // Continuous drag owns the offset — don't fight the pointer.
    if (isDraggingRef.current) {
      setSelectedIndex(index);
      return;
    }

    if (index === selectedIndexRef.current && !isAnimatingRef.current) {
      // Already settled on this value (e.g. onChange echo) — keep offset.
      return;
    }

    snapToIndex(index, true);
  }, [value, items, itemHeight, loopEnabled, n, snapToIndex]);

  /** After free scroll, land on the nearest row (drag / wheel / momentum). */
  const snapToNearestRow = useCallback(
    (animated = true) => {
      if (n === 0) {
        return;
      }
      const r = Math.round(scrollOffsetRef.current / itemHeight);
      if (loopEnabled) {
        const targetOffset = r * itemHeight;
        const dataIdx = modIndex(r, n);
        animateToOffset(targetOffset, dataIdx, animated);
      } else {
        const dataIdx = Math.max(0, Math.min(r, n - 1));
        animateToOffset(dataIdx * itemHeight, dataIdx, animated);
      }
    },
    [n, itemHeight, loopEnabled, animateToOffset],
  );

  const hitTestDataIndex = useCallback(
    (tapY: number): number | null => {
      if (n === 0) {
        return null;
      }
      const offset = scrollOffsetRef.current;
      const centerRow = Math.round(offset / itemHeight);
      const rowBuffer = paddingItems + 5;
      let best: { dataIndex: number; dist: number } | null = null;
      for (let vr = centerRow - rowBuffer; vr <= centerRow + rowBuffer; vr++) {
        if (!loopEnabled && (vr < 0 || vr >= n)) {
          continue;
        }
        const dataIndex = loopEnabled ? modIndex(vr, n) : vr;
        const { translateY } = getItemTransform(vr, offset, itemHeight, containerHeight);
        const dist = Math.abs(translateY + itemHeight / 2 - tapY);
        if (!best || dist < best.dist) {
          best = { dataIndex, dist };
        }
      }
      if (best && best.dist <= itemHeight) {
        return best.dataIndex;
      }
      return null;
    },
    [n, itemHeight, paddingItems, loopEnabled, containerHeight],
  );

  // Momentum animation (iOS-style deceleration). At animation "none"
  // / PRM there is no coast — jump to the nearest row (Apple Reduce Motion,
  // GOV.UK scroll-behavior:auto, Material spatial-motion off).
  const startMomentum = useCallback(
    (initialVelocity: number) => {
      if (snapDurationMs <= 0) {
        snapToNearestRow(false);
        return;
      }
      let velocity = initialVelocity * momentumMultiplier;
      let offset = scrollOffsetRef.current;

      const animate = () => {
        velocity *= friction;
        offset += velocity;

        if (!loopEnabled) {
          if (offset < minOffset) {
            offset = minOffset + rubberBand(offset - minOffset, containerHeight);
            velocity *= 0.5;
          } else if (offset > maxOffset) {
            offset = maxOffset + rubberBand(offset - maxOffset, containerHeight);
            velocity *= 0.5;
          }
        }

        scrollOffsetRef.current = offset;
        setScrollOffset(offset);

        if (Math.abs(velocity) > minVelocity) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          snapToNearestRow(true);
        }
      };

      isAnimatingRef.current = true;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = requestAnimationFrame(animate);
    },
    [loopEnabled, minOffset, maxOffset, containerHeight, snapToNearestRow, snapDurationMs],
  );

  // Handle pointer/mouse down
  const handlePointerDown = useCallback(
    (e: WheelPointer) => {
      if (disabled) {
        return;
      }

      // Stop any ongoing animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        isAnimatingRef.current = false;
      }

      isDraggingRef.current = true;
      lastYRef.current = e.clientY;
      downYRef.current = e.clientY;
      dragDistanceRef.current = 0;
      lastTimeRef.current = performance.now();
      dragVelocitiesRef.current = [];

      if (isWeb && containerRef.current) {
        containerRef.current.setPointerCapture(e.pointerId);
        containerRef.current.style.cursor = 'grabbing';
      }
    },
    [disabled],
  );

  // Handle pointer/mouse move
  const handlePointerMove = useCallback(
    (e: WheelPointer) => {
      if (!isDraggingRef.current || disabled) {
        return;
      }

      const currentY = e.clientY;
      const currentTime = performance.now();
      const deltaY = lastYRef.current - currentY;
      const deltaTime = currentTime - lastTimeRef.current;
      dragDistanceRef.current += Math.abs(deltaY);

      // Calculate velocity
      if (deltaTime > 0) {
        const velocity = (deltaY / deltaTime) * 16; // Normalize to ~60fps
        dragVelocitiesRef.current.push(velocity);
        // Keep only last 5 velocities for averaging
        if (dragVelocitiesRef.current.length > 5) {
          dragVelocitiesRef.current.shift();
        }
      }

      let newOffset = scrollOffsetRef.current + deltaY;
      if (!loopEnabled) {
        if (newOffset < minOffset) {
          newOffset = minOffset + rubberBand(newOffset - minOffset, containerHeight);
        } else if (newOffset > maxOffset) {
          newOffset = maxOffset + rubberBand(newOffset - maxOffset, containerHeight);
        }
      }

      // Update ref immediately so subsequent pointer events use the correct base offset
      // (React 18 may batch multiple setScrollOffset calls, leaving scrollOffsetRef stale)
      scrollOffsetRef.current = newOffset;
      setScrollOffset(newOffset);
      lastYRef.current = currentY;
      lastTimeRef.current = currentTime;
    },
    [disabled, loopEnabled, minOffset, maxOffset, containerHeight],
  );

  // Handle pointer/mouse up
  const handlePointerUp = useCallback(
    (e: WheelPointer) => {
      if (!isDraggingRef.current) {
        return;
      }

      isDraggingRef.current = false;

      if (isWeb && containerRef.current) {
        try {
          containerRef.current.releasePointerCapture(e.pointerId);
        } catch {
          // already released
        }
        containerRef.current.style.cursor = disabled ? 'not-allowed' : 'grab';
      }

      // iOS: a tap on a visible row snaps that row to center.
      if (dragDistanceRef.current < tapSlopPx) {
        const localY = e.locationY;
        const rect = containerRef.current?.getBoundingClientRect();
        const tapY = typeof localY === 'number' ? localY : e.clientY - (rect?.top ?? 0);
        const tapped = hitTestDataIndex(tapY);
        if (tapped != null) {
          snapToIndex(tapped, true);
          return;
        }
      }

      // Calculate average velocity for momentum
      const velocities = dragVelocitiesRef.current;
      if (velocities.length > 0) {
        const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;

        if (Math.abs(avgVelocity) > minVelocity * 2) {
          startMomentum(avgVelocity);
        } else {
          snapToNearestRow(true);
        }
      } else {
        snapToNearestRow(true);
      }
    },
    [snapToNearestRow, startMomentum, hitTestDataIndex, snapToIndex, disabled],
  );

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const pointerDownRef = useRef(handlePointerDown);
  pointerDownRef.current = handlePointerDown;
  const pointerMoveRef = useRef(handlePointerMove);
  pointerMoveRef.current = handlePointerMove;
  const pointerUpRef = useRef(handlePointerUp);
  pointerUpRef.current = handlePointerUp;

  const panResponder = useMemo(() => {
    if (isWeb) {
      return { panHandlers: {} as Record<string, unknown> };
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 1,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        pointerDownRef.current({
          clientY: evt.nativeEvent.pageY,
          pointerId: 1,
        });
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        pointerMoveRef.current({
          clientY: evt.nativeEvent.pageY,
          pointerId: 1,
        });
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        pointerUpRef.current({
          clientY: evt.nativeEvent.pageY,
          pointerId: 1,
          locationY: evt.nativeEvent.locationY,
        });
      },
      onPanResponderTerminate: (evt: GestureResponderEvent) => {
        pointerUpRef.current({
          clientY: evt.nativeEvent.pageY,
          pointerId: 1,
          locationY: evt.nativeEvent.locationY,
        });
      },
    });
  }, []);

  // Handle mouse wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent | WheelEvent) => {
      if (disabled) {
        return;
      }
      e.preventDefault();

      // Stop any ongoing animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        isAnimatingRef.current = false;
      }

      // Use deltaY for scrolling
      const delta = e.deltaY;
      const currentOffset = scrollOffsetRef.current;
      let newOffset = currentOffset + delta;

      if (!loopEnabled) {
        if (newOffset < minOffset) {
          newOffset = minOffset;
        } else if (newOffset > maxOffset) {
          newOffset = maxOffset;
        }
      }

      scrollOffsetRef.current = newOffset;
      setScrollOffset(newOffset);

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = requestAnimationFrame(() => {
        setTimeout(() => {
          if (!isDraggingRef.current && !isAnimatingRef.current) {
            snapToNearestRow(true);
          }
        }, 100);
      });
    },
    [disabled, loopEnabled, minOffset, maxOffset, snapToNearestRow],
  );

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      if (disabled) {
        return;
      }

      let delta = 0;
      switch (e.key) {
        case 'ArrowUp':
        case 'k':
          delta = -1;
          break;
        case 'ArrowDown':
        case 'j':
          delta = 1;
          break;
        case 'PageUp':
          delta = -visibleItems;
          break;
        case 'PageDown':
          delta = visibleItems;
          break;
        case 'Home':
          snapToIndex(0);
          e.preventDefault();
          return;
        case 'End':
          snapToIndex(n - 1);
          e.preventDefault();
          return;
        default:
          return;
      }

      e.preventDefault();
      if (loopEnabled) {
        const newIndex = modIndex(selectedIndex + delta, n);
        snapToIndex(newIndex);
      } else {
        const newIndex = Math.max(0, Math.min(selectedIndex + delta, n - 1));
        snapToIndex(newIndex);
      }
    },
    [disabled, selectedIndex, n, visibleItems, snapToIndex, loopEnabled],
  );

  // Set up event listeners for web
  useEffect(() => {
    if (!isWeb) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Wheel event with passive: false to allow preventDefault
    const wheelHandler = (e: WheelEvent) => {
      handleWheel(e);
    };
    container.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [handleWheel]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const renderRows = useMemo(() => {
    if (n === 0) {
      return [];
    }
    if (loopEnabled) {
      const centerRow = Math.round(scrollOffset / itemHeight);
      const rowBuffer = paddingItems + 5;
      const list: { virtualRow: number; dataIndex: number }[] = [];
      for (let vr = centerRow - rowBuffer; vr <= centerRow + rowBuffer; vr++) {
        list.push({ virtualRow: vr, dataIndex: modIndex(vr, n) });
      }
      return list;
    }
    const start = Math.max(0, Math.floor(scrollOffset / itemHeight) - paddingItems - 1);
    const end = Math.min(n - 1, Math.ceil((scrollOffset + containerHeight) / itemHeight) + paddingItems + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => {
      const virtualRow = start + i;
      return { virtualRow, dataIndex: virtualRow };
    });
  }, [n, loopEnabled, scrollOffset, itemHeight, paddingItems, containerHeight]);

  const itemColor = (isSelected: boolean) => (disabled ? '$color10' : isSelected ? '$color12' : '$color11');

  const radiusToken = knobProps.borderRadius.borderRadius as string | number;
  const highlightStyle = highlightBandStyle(highlightEdges, radiusToken, Boolean(knobProps.pointy));
  const highlightSmoothClass =
    'className' in knobProps.borderRadius && typeof knobProps.borderRadius.className === 'string'
      ? knobProps.borderRadius.className
      : undefined;

  const renderItemNode = (dataIndex: number, isSelected: boolean) => {
    const item = items[dataIndex];
    const itemValue = getItemValue(item);
    if (renderItem) {
      return renderItem(itemValue, dataIndex, isSelected);
    }
    return (
      <Text
        {...knobProps.body}
        fontSize={size}
        color={itemColor(isSelected)}
        numberOfLines={1}
        ellipsizeMode="tail"
        maxWidth="100%"
        paddingHorizontal="$2">
        {getItemLabel(item)}
      </Text>
    );
  };

  return (
    <WheelContainer
      height={containerHeight}
      width={flex ? '100%' : columnWidth}
      minWidth={flex ? 0 : columnWidth}
      flex={flex}
      data-testid="wheel"
      data-disabled={disabled ? true : undefined}
      aria-disabled={disabled || undefined}
      opacity={1}>
      {/* iOS 14+ selection fill — selected=fill, never hairline borders */}
      <SelectionIndicator
        className={highlightSmoothClass}
        backgroundColor="$color4"
        top={paddingItems * itemHeight}
        height={itemHeight}
        style={highlightStyle}
        data-testid="wheel-selection"
      />

      {/* Interactive container */}
      {isWeb ? (
        <div
          ref={containerRef}
          className="mp1-wheel-wrapper"
          tabIndex={disabled ? -1 : 0}
          role="slider"
          aria-label={ariaLabel ?? t('Value picker')}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, n - 1)}
          aria-valuenow={selectedIndex}
          aria-valuetext={items[selectedIndex] !== undefined ? getItemLabel(items[selectedIndex]) : undefined}
          aria-disabled={disabled || undefined}
          data-disabled={disabled ? true : undefined}
          style={{
            width: '100%',
            height: containerHeight,
            position: 'relative',
            perspective: `${perspectivePx}px`,
            perspectiveOrigin: 'center center',
            overflow: 'hidden',
            userSelect: 'none',
            touchAction: 'none',
            cursor: disabled ? 'not-allowed' : 'grab',
            ...wheelMaskStyle,
          }}
          onPointerDown={handlePointerDown as any}
          onPointerMove={handlePointerMove as any}
          onPointerUp={handlePointerUp as any}
          onPointerCancel={handlePointerUp as any}
          onKeyDown={handleKeyDown as any}
          data-testid="wheel-wrapper">
          {renderRows.map(({ virtualRow, dataIndex }) => {
            const isSelected = dataIndex === liveDataIndex;
            const transform = getItemTransform(virtualRow, scrollOffset, itemHeight, containerHeight);

            if (Math.abs(transform.rotateX) > 85) {
              return null;
            }

            return (
              <div
                key={`${dataIndex}-${virtualRow}`}
                data-testid="wheel-item"
                data-index={dataIndex}
                data-selected={isSelected ? true : undefined}
                aria-hidden={isSelected ? undefined : true}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: itemHeight,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `translateY(${transform.translateY}px) rotateX(${transform.rotateX}deg) scale(${transform.scale})`,
                  opacity: transform.opacity,
                  pointerEvents: 'none',
                  transformOrigin: 'center center',
                  transformStyle: 'preserve-3d',
                  backfaceVisibility: 'hidden',
                }}>
                {renderItemNode(dataIndex, isSelected)}
              </div>
            );
          })}
        </div>
      ) : (
        <View
          width="100%"
          height={containerHeight}
          position="relative"
          overflow="hidden"
          cursor={disabled ? 'not-allowed' : 'grab'}
          data-testid="wheel-wrapper"
          data-disabled={disabled ? true : undefined}
          aria-disabled={disabled || undefined}
          {...panResponder.panHandlers}>
          {renderRows.map(({ virtualRow, dataIndex }) => {
            const isSelected = dataIndex === liveDataIndex;
            const transform = getItemTransform(virtualRow, scrollOffset, itemHeight, containerHeight);

            if (Math.abs(transform.rotateX) > 85) {
              return null;
            }

            return (
              <View
                key={`${dataIndex}-${virtualRow}`}
                position="absolute"
                left={0}
                right={0}
                height={itemHeight}
                alignItems="center"
                justifyContent="center"
                opacity={transform.opacity}
                pointerEvents="none"
                y={transform.translateY}
                scale={transform.scale}
                rotateX={`${transform.rotateX}deg`}
                data-testid="wheel-item"
                data-index={dataIndex}
                data-selected={isSelected ? true : undefined}>
                {renderItemNode(dataIndex, isSelected)}
              </View>
            );
          })}
          <WheelEdgeFade height={paddingItems * itemHeight} />
        </View>
      )}
    </WheelContainer>
  );
}

// ── Sub-components for composition ────────────────────────────

Wheel.Item = WheelItemContainer;

export type WheelContainerProps = GetProps<typeof WheelContainer>;
export type WheelItemProps = GetProps<typeof WheelItemContainer>;

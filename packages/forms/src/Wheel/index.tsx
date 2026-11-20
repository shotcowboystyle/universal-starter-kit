import { useResolvedKnobs } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  WheelEvent as ReactWheelEvent,
  ReactNode,
  RefObject,
} from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type { GetProps, SizeTokens } from 'tamagui';
import { View, getTokens, getVariableValue, isWeb, styled, Text } from 'tamagui';

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
   * Fires once each time a different item crosses the center band (drag,
   * flick, or snap). Native wires this to a selection haptic.
   */
  onItemCross?: (value: T, index: number) => void;
  /** Accessible name for the picker (web renders role="slider"). */
  'aria-label'?: string;
}

// ── iOS Physics Constants ─────────────────────────────────────
// Based on Apple's UIScrollView deceleration behavior

/** Apple's PKScrollViewDecelerationFrictionFactor */
const friction = 0.95;
/** Minimum velocity before snapping */
const minVelocity = 0.5;
/** Velocity multiplier for momentum feel */
const momentumMultiplier = 0.8;
/** Apple's rubber-banding constant */
const rubberBandConstant = 0.55;
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
const wheelFontBySize = {
  small: '$6',
  medium: '$8',
  large: '$9',
} as const satisfies Record<'small' | 'medium' | 'large', SizeTokens>;

/** Durations for discrete snaps (mirrors theme animationConfig). */
const transitionDurationsMs = {
  bouncy: 200,
  lazy: 600,
  slow: 500,
  medium: 250,
  quick: 100,
  tooltip: 400,
  snappy: 80,
  gentle: 450,
} as const satisfies Record<string, number>;

const defaultSnapDurationMs = 100;

/** Snap duration for a knob transition token; unknown tokens use the default, `undefined` (animation "none") means jump. */
const snapDurationFor = (transition: KnobProps['transition']): number =>
  transition == null
    ? 0
    : (Object.entries(transitionDurationsMs).find(([name]) => name === transition)?.[1] ?? defaultSnapDurationMs);

/** Wheel numeral size: the explicit prop, else the density knob's step, else the medium step. */
const fontSizeFor = (sizeProp: SizeTokens | undefined, sizeKnob: string): SizeTokens =>
  sizeProp ?? Object.entries(wheelFontBySize).find(([name]) => name === sizeKnob)?.[1] ?? wheelFontBySize.medium;

// The interactive wrapper is a raw <div>, so the non-removable focus-visible
// ring (2px solid $outlineColor) has to come from
// an injected stylesheet — inline styles cannot express :focus-visible.
// Inset (−2px): the viewport clips overflow to radius (clipping arm).
const WHEEL_FOCUS_STYLE_ID = 'mp1-wheel-focus';
const ensureWheelFocusStyles = () => {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  if (document.querySelector(`#${WHEEL_FOCUS_STYLE_ID}`)) {
    return;
  }
  const style = document.createElement('style');
  style.id = WHEEL_FOCUS_STYLE_ID;
  style.textContent =
    '.mp1-wheel-wrapper:focus-visible { outline: 2px solid var(--outlineColor, var(--c-outlineColor, CanvasText)); outline-offset: -2px; }';
  document.head.append(style);
};

const wheelMaskStyle: CSSProperties | undefined = isWeb
  ? {
      WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, #000 32%, #000 68%, rgba(0,0,0,0.28) 100%)',
      maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, #000 32%, #000 68%, rgba(0,0,0,0.28) 100%)',
    }
  : undefined;

/** Static part of a web row's inline style; only height/transform/opacity vary per render. */
const webRowBaseStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  transformOrigin: 'center center',
  transformStyle: 'preserve-3d',
  backfaceVisibility: 'hidden',
};

const wheelCursor = (disabled: boolean): 'not-allowed' | 'grab' => (disabled ? 'not-allowed' : 'grab');

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

const normalizeItem = <T,>(item: T | WheelItem<T>): WheelItem<T> => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- items are either a bare value or a { value, label } descriptor with no discriminant; the shape is the only way to tell them apart
  if (typeof item === 'object' && item !== null && 'value' in item) {
    return item;
  }
  return { value: item, label: String(item) };
};

const getItemLabel = <T,>(item: T | WheelItem<T>): string => {
  const normalized = normalizeItem(item);
  return normalized.label ?? String(normalized.value);
};

const getItemValue = <T,>(item: T | WheelItem<T>): T => {
  const normalized = normalizeItem(item);
  return normalized.value;
};

/** Non-negative modulo (JavaScript % can be negative for negative lhs). */
const modIndex = (row: number, n: number): number => {
  if (n <= 0) {
    return 0;
  }
  return ((row % n) + n) % n;
};

/** Data index seated in the center band for a scroll offset (wrapped when looping, clamped otherwise). */
const liveIndexFor = (n: number, loopEnabled: boolean, scrollOffset: number, itemHeight: number): number => {
  if (n === 0) {
    return 0;
  }
  const row = Math.round(scrollOffset / itemHeight);
  return loopEnabled ? modIndex(row, n) : Math.max(0, Math.min(row, n - 1));
};

/**
 * Scroll offset that shows the same item as `targetOffset` (same row mod n), chosen so its
 * value is closest to `referenceOffset` — shortest motion when animating from `referenceOffset`.
 */
const equivalentOffsetNear = (referenceOffset: number, targetOffset: number, n: number, itemHeight: number): number => {
  if (n <= 0 || itemHeight <= 0) {
    return targetOffset;
  }
  const rT = Math.round(targetOffset / itemHeight);
  const m = modIndex(rT, n);
  const span = n * itemHeight;
  const base = m * itemHeight;
  const k = Math.round((referenceOffset - base) / span);
  return base + k * span;
};

/** Shortest steps on the item circle from current row to target data index. */
const nearestRowForDataIndex = (currentRow: number, targetDataIndex: number, n: number): number => {
  const currentMod = modIndex(currentRow, n);
  let delta = targetDataIndex - currentMod;
  if (delta > n / 2) {
    delta -= n;
  }
  if (delta < -n / 2) {
    delta += n;
  }
  return currentRow + delta;
};

// Rubber-band effect for over-scrolling (iOS style)
const rubberBand = (offset: number, dimension: number): number => {
  const c = rubberBandConstant;
  const x = Math.abs(offset);
  const result = (x * dimension * c) / (dimension + c * x);
  return offset < 0 ? -result : result;
};

/**
 * Project a row onto the Cupertino cylinder. Angle 0 sits in the selection
 * band; off-center rows recede with rotateX + foreshortening (not opacity —
 * row text stays on the AA $color11 ramp).
 */
const getItemTransform = (index: number, scrollOffset: number, itemHeight: number, containerHeight: number) => {
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
};

const tokenPx = (token: string, scale: 'radius' | 'space'): number => {
  const key = token.replace(/^\$/u, '');
  const entry = Object.entries(getTokens()[scale]).find(([name]) => name === key)?.[1];
  const px = entry === undefined ? Number.NaN : Number(getVariableValue(entry));
  if (Number.isFinite(px)) {
    return px;
  }
  return scale === 'radius' ? 9 : 8;
};

const highlightBandStyle = (edges: WheelHighlightEdges, radiusToken: string, pointy: boolean): CSSProperties => {
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
};

const itemColor = (disabled: boolean, isSelected: boolean): '$color10' | '$color11' | '$color12' => {
  if (disabled) {
    return '$color10';
  }
  return isSelected ? '$color12' : '$color11';
};

/** Nothing to tear down when an effect has no listener to remove. */
const noopCleanup = () => {
  // Intentionally empty: the effect registered nothing.
};

// ── Motion: scroll state, snapping, momentum, controlled sync ──

interface WheelGeometry {
  n: number;
  itemHeight: number;
  visibleItems: number;
  loopEnabled: boolean;
  containerHeight: number;
  paddingItems: number;
  minOffset: number;
  maxOffset: number;
  snapDurationMs: number;
}

interface WheelMotionInput<T> {
  items: (T | WheelItem<T>)[];
  value: T | undefined;
  onChange: ((value: T) => void) | undefined;
  onItemCross: ((value: T, index: number) => void) | undefined;
  geometry: WheelGeometry;
}

const useWheelMotion = <T,>({ items, value, onChange, onItemCross, geometry }: WheelMotionInput<T>) => {
  const { n, itemHeight, loopEnabled, containerHeight, paddingItems, minOffset, maxOffset, snapDurationMs } = geometry;
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keep a ref in sync with scrollOffset to avoid stale closures
  const scrollOffsetRef = useRef(scrollOffset);
  useLayoutEffect(() => {
    scrollOffsetRef.current = scrollOffset;
  });

  // Animation state
  const animationRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const hasMountedRef = useRef(false);
  const selectedIndexRef = useRef(selectedIndex);
  useLayoutEffect(() => {
    selectedIndexRef.current = selectedIndex;
  });
  const isDraggingRef = useRef(false);

  const liveDataIndex = liveIndexFor(n, loopEnabled, scrollOffset, itemHeight);

  const lastCrossIndexRef = useRef<number | null>(null);
  const onItemCrossRef = useRef(onItemCross);
  useLayoutEffect(() => {
    onItemCrossRef.current = onItemCross;
  });
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
    // oxlint-disable-next-line react-doctor/no-pass-live-state-to-parent -- onItemCross is an event the consumer asked for, fired when the center row changes; it carries the item, not state to mirror
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
        const eased = 1 - (1 - progress) ** 3;
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
      if (animationRef.current !== null) {
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

  /** First paint: land on `index` instantly (no entrance tween from 0). */
  const landInstantly = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      const raw = index * itemHeight;
      const settled = loopEnabled && n > 1 ? equivalentOffsetNear(0, raw, n, itemHeight) : raw;
      scrollOffsetRef.current = settled;
      setScrollOffset(settled);
    },
    [itemHeight, loopEnabled, n],
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

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      landInstantly(index);
      return;
    }

    // Continuous drag owns the offset — don't fight the pointer.
    if (isDraggingRef.current) {
      // oxlint-disable-next-line react-doctor/no-chain-state-updates -- an independent branch: while dragging, only the selected index follows the controlled value
      setSelectedIndex(index);
      return;
    }

    if (index === selectedIndexRef.current && !isAnimatingRef.current) {
      // Already settled on this value (e.g. onChange echo) — keep offset.
      return;
    }

    snapToIndex(index, true);
  }, [value, items, landInstantly, snapToIndex]);

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
      for (let vr = centerRow - rowBuffer; vr <= centerRow + rowBuffer; vr += 1) {
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
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = requestAnimationFrame(animate);
    },
    [loopEnabled, minOffset, maxOffset, containerHeight, snapToNearestRow, snapDurationMs],
  );

  // Cleanup animation on unmount
  useEffect(
    () => () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    },
    [],
  );

  return {
    scrollOffset,
    setScrollOffset,
    selectedIndex,
    liveDataIndex,
    scrollOffsetRef,
    animationRef,
    isAnimatingRef,
    isDraggingRef,
    snapToIndex,
    snapToNearestRow,
    hitTestDataIndex,
    startMomentum,
  };
};

// ── Input: pointer drag, mouse wheel, keyboard, native pan responder ──

interface WheelPanRefs {
  disabledRef: RefObject<boolean>;
  pointerDownRef: RefObject<(e: WheelPointer) => void>;
  pointerMoveRef: RefObject<(e: WheelPointer) => void>;
  pointerUpRef: RefObject<(e: WheelPointer) => void>;
}

/** Native drag gesture; it reaches the latest handlers through refs so it is created once. */
const createWheelPanResponder = ({ disabledRef, pointerDownRef, pointerMoveRef, pointerUpRef }: WheelPanRefs) =>
  PanResponder.create({
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

interface WheelInputConfig {
  geometry: WheelGeometry;
  disabled: boolean;
  motion: ReturnType<typeof useWheelMotion>;
}

const useWheelInput = ({ geometry, disabled, motion }: WheelInputConfig) => {
  const { n, visibleItems, loopEnabled, containerHeight, minOffset, maxOffset } = geometry;
  const {
    setScrollOffset,
    selectedIndex,
    scrollOffsetRef,
    animationRef,
    isAnimatingRef,
    isDraggingRef,
    snapToIndex,
    snapToNearestRow,
    hitTestDataIndex,
    startMomentum,
  } = motion;
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const lastYRef = useRef(0);
  const downYRef = useRef(0);
  const dragDistanceRef = useRef(0);
  const lastTimeRef = useRef(0);
  const dragVelocitiesRef = useRef<number[]>([]);

  // Handle pointer/mouse down
  const handlePointerDown = useCallback(
    (e: WheelPointer) => {
      if (disabled) {
        return;
      }

      // Stop any ongoing animation
      if (animationRef.current !== null) {
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
    [disabled, animationRef, isAnimatingRef, isDraggingRef],
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
        // Normalize to ~60fps
        const velocity = (deltaY / deltaTime) * 16;
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
    [disabled, loopEnabled, minOffset, maxOffset, containerHeight, isDraggingRef, scrollOffsetRef, setScrollOffset],
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
        containerRef.current.style.cursor = wheelCursor(disabled);
      }

      // iOS: a tap on a visible row snaps that row to center.
      if (dragDistanceRef.current < tapSlopPx) {
        const rect = containerRef.current?.getBoundingClientRect();
        const tapY = e.locationY ?? e.clientY - (rect?.top ?? 0);
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
    [snapToNearestRow, startMomentum, hitTestDataIndex, snapToIndex, disabled, isDraggingRef],
  );

  // The pan responder is created once; it reaches the latest handlers through these refs.
  const disabledRef = useRef(disabled);
  useLayoutEffect(() => {
    disabledRef.current = disabled;
  });
  const pointerDownRef = useRef(handlePointerDown);
  useLayoutEffect(() => {
    pointerDownRef.current = handlePointerDown;
  });
  const pointerMoveRef = useRef(handlePointerMove);
  useLayoutEffect(() => {
    pointerMoveRef.current = handlePointerMove;
  });
  const pointerUpRef = useRef(handlePointerUp);
  useLayoutEffect(() => {
    pointerUpRef.current = handlePointerUp;
  });

  const panResponder = useMemo(() => {
    if (isWeb) {
      return { panHandlers: {} };
    }
    // oxlint-disable-next-line react/refs -- created once; the gesture reaches the latest handlers through these refs when it fires, never during render
    return createWheelPanResponder({ disabledRef, pointerDownRef, pointerMoveRef, pointerUpRef });
  }, []);

  // Handle mouse wheel
  const handleWheel = useCallback(
    (e: ReactWheelEvent | WheelEvent) => {
      if (disabled) {
        return;
      }
      e.preventDefault();

      // Stop any ongoing animation
      if (animationRef.current !== null) {
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

      if (animationRef.current !== null) {
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
    [
      disabled,
      loopEnabled,
      minOffset,
      maxOffset,
      snapToNearestRow,
      animationRef,
      isAnimatingRef,
      isDraggingRef,
      scrollOffsetRef,
      setScrollOffset,
    ],
  );

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent | KeyboardEvent) => {
      if (disabled) {
        return;
      }

      let delta = 0;
      switch (e.key) {
        case 'ArrowUp':
        case 'k': {
          delta = -1;
          break;
        }
        case 'ArrowDown':
        case 'j': {
          delta = 1;
          break;
        }
        case 'PageUp': {
          delta = -visibleItems;
          break;
        }
        case 'PageDown': {
          delta = visibleItems;
          break;
        }
        case 'Home': {
          snapToIndex(0);
          e.preventDefault();
          return;
        }
        case 'End': {
          snapToIndex(n - 1);
          e.preventDefault();
          return;
        }
        default: {
          return;
        }
      }

      e.preventDefault();
      const newIndex = loopEnabled
        ? modIndex(selectedIndex + delta, n)
        : Math.max(0, Math.min(selectedIndex + delta, n - 1));
      snapToIndex(newIndex);
    },
    [disabled, selectedIndex, n, visibleItems, snapToIndex, loopEnabled],
  );

  // Set up event listeners for web
  useEffect(() => {
    const container = containerRef.current;
    if (!isWeb || !container) {
      return noopCleanup;
    }

    // Wheel event with passive: false to allow preventDefault
    const wheelHandler = (e: WheelEvent) => {
      handleWheel(e);
    };
    // oxlint-disable-next-line github/require-passive-events -- the handler calls preventDefault() to stop page scroll while the wheel is over the picker, which a passive listener forbids
    container.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [handleWheel]);

  return {
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
    panHandlers: panResponder.panHandlers,
  };
};

// ── Rendering ─────────────────────────────────────────────────

interface WheelRowModel {
  virtualRow: number;
  dataIndex: number;
  isSelected: boolean;
  transform: ReturnType<typeof getItemTransform>;
  content: ReactNode;
}

/** Virtual rows to paint: the whole circle neighborhood when looping, else the visible window. */
const visibleRowsFor = (geometry: WheelGeometry, scrollOffset: number): { virtualRow: number; dataIndex: number }[] => {
  const { n, loopEnabled, itemHeight, paddingItems, containerHeight } = geometry;
  if (n === 0) {
    return [];
  }
  if (loopEnabled) {
    const centerRow = Math.round(scrollOffset / itemHeight);
    const rowBuffer = paddingItems + 5;
    const list: { virtualRow: number; dataIndex: number }[] = [];
    for (let vr = centerRow - rowBuffer; vr <= centerRow + rowBuffer; vr += 1) {
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
};

const DefaultWheelItem = ({
  label,
  size,
  color,
  knobProps,
}: {
  label: string;
  size: SizeTokens;
  color: '$color10' | '$color11' | '$color12';
  knobProps: KnobProps;
}) => (
  <Text
    {...knobProps.body}
    fontSize={size}
    color={color}
    numberOfLines={1}
    ellipsizeMode="tail"
    maxWidth="100%"
    paddingHorizontal="$2">
    {label}
  </Text>
);

const WebWheelRows = ({ rows, itemHeight }: { rows: readonly WheelRowModel[]; itemHeight: number }) =>
  rows.map(({ virtualRow, dataIndex, isSelected, transform, content }) => (
    <div
      key={`${dataIndex}-${virtualRow}`}
      data-testid="wheel-item"
      data-index={dataIndex}
      data-selected={isSelected ? true : undefined}
      aria-hidden={isSelected ? undefined : true}
      style={{
        ...webRowBaseStyle,
        height: itemHeight,
        transform: `translateY(${transform.translateY}px) rotateX(${transform.rotateX}deg) scale(${transform.scale})`,
        opacity: transform.opacity,
      }}>
      {content}
    </div>
  ));

const NativeWheelRows = ({ rows, itemHeight }: { rows: readonly WheelRowModel[]; itemHeight: number }) =>
  rows.map(({ virtualRow, dataIndex, isSelected, transform, content }) => (
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
      {content}
    </View>
  ));

/** Screen-reader text of the selected row, or nothing when the selection is out of range. */
const valueTextFor = <T,>(items: (T | WheelItem<T>)[], selectedIndex: number): string | undefined => {
  const item = items[selectedIndex];
  return item === undefined ? undefined : getItemLabel(item);
};

const wheelGeometry = ({
  n,
  itemHeight,
  visibleItems,
  loop,
  snapDurationMs,
}: {
  n: number;
  itemHeight: number;
  visibleItems: number;
  loop: boolean;
  snapDurationMs: number;
}): WheelGeometry => ({
  n,
  itemHeight,
  visibleItems,
  loopEnabled: loop && n > 1,
  containerHeight: itemHeight * visibleItems,
  paddingItems: Math.floor(visibleItems / 2),
  minOffset: 0,
  maxOffset: n > 0 ? (n - 1) * itemHeight : 0,
  snapDurationMs,
});

/** Beyond this rotation a row is edge-on to the viewer and is not painted. */
const MAX_ROW_ROTATION_DEG = 85;

const buildWheelRows = <T,>({
  renderRows,
  scrollOffset,
  geometry,
  liveDataIndex,
  items,
  renderItem,
  size,
  disabled,
  knobProps,
}: {
  renderRows: { virtualRow: number; dataIndex: number }[];
  scrollOffset: number;
  geometry: WheelGeometry;
  liveDataIndex: number;
  items: (T | WheelItem<T>)[];
  renderItem: WheelProps<T>['renderItem'];
  size: SizeTokens;
  disabled: boolean;
  knobProps: KnobProps;
}): WheelRowModel[] => {
  const rows: WheelRowModel[] = [];
  for (const { virtualRow, dataIndex } of renderRows) {
    const transform = getItemTransform(virtualRow, scrollOffset, geometry.itemHeight, geometry.containerHeight);
    if (Math.abs(transform.rotateX) <= MAX_ROW_ROTATION_DEG) {
      const isSelected = dataIndex === liveDataIndex;
      const item = items[dataIndex];
      const content =
        renderItem === undefined ? (
          <DefaultWheelItem
            label={getItemLabel(item)}
            size={size}
            color={itemColor(disabled, isSelected)}
            knobProps={knobProps}
          />
        ) : (
          renderItem(getItemValue(item), dataIndex, isSelected)
        );
      rows.push({ virtualRow, dataIndex, isSelected, transform, content });
    }
  }
  return rows;
};

// ── Wheel Component ───────────────────────────────────────────

export const Wheel = <T = string | number,>({
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
}: WheelProps<T>) => {
  const { knobProps } = useResolvedKnobs();
  const size = fontSizeFor(sizeProp, knobProps.size);
  // Row geometry rides nestedControl (density-aware, 32px at medium — iOS
  // UIPickerView item extent). Explicit itemHeight ejects.
  const itemHeight = itemHeightProp ?? knobProps.nestedControl.px ?? 32;
  const columnWidth = widthProp ?? defaultColumnWidth;
  ensureWheelFocusStyles();
  // Discrete snaps (keyboard / controlled value) tween; drag stays 1:1.
  // knobProps.transition is undefined at animation "none" (which also carries
  // prefers-reduced-motion) — snaps must JUMP then, not fall back to a tween.
  const snapDurationMs = snapDurationFor(knobProps.transition);

  const geometry = wheelGeometry({ n: items.length, itemHeight, visibleItems, loop, snapDurationMs });
  const { n, containerHeight, paddingItems } = geometry;

  const motion = useWheelMotion({ items, value, onChange, onItemCross, geometry });
  const { scrollOffset, selectedIndex, liveDataIndex } = motion;
  const { containerRef, handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown, panHandlers } =
    useWheelInput({ geometry, disabled, motion });

  const renderRows = visibleRowsFor(geometry, scrollOffset);

  const radiusToken = knobProps.borderRadius.borderRadius;
  const highlightStyle = highlightBandStyle(highlightEdges, radiusToken, knobProps.pointy);
  const highlightSmoothClass = knobProps.borderRadius.className;

  const rows = buildWheelRows({
    renderRows,
    scrollOffset,
    geometry,
    liveDataIndex,
    items,
    renderItem,
    size,
    disabled,
    knobProps,
  });
  const stretches = flex !== undefined && flex !== 0;

  return (
    <WheelContainer
      height={containerHeight}
      width={stretches ? '100%' : columnWidth}
      minWidth={stretches ? 0 : columnWidth}
      flex={flex}
      data-testid="wheel"
      data-disabled={disabled ? true : undefined}
      aria-disabled={disabled ? true : undefined}
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
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a drag/wheel/keyboard picker over absolutely positioned rows; <input type="range"> cannot host them
          role="slider"
          aria-label={ariaLabel ?? t('Value picker')}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, n - 1)}
          aria-valuenow={selectedIndex}
          aria-valuetext={valueTextFor(items, selectedIndex)}
          aria-disabled={disabled ? true : undefined}
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
            cursor: wheelCursor(disabled),
            ...wheelMaskStyle,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          data-testid="wheel-wrapper">
          <WebWheelRows
            rows={rows}
            itemHeight={itemHeight}
          />
        </div>
      ) : (
        <View
          width="100%"
          height={containerHeight}
          position="relative"
          overflow="hidden"
          cursor={wheelCursor(disabled)}
          data-testid="wheel-wrapper"
          data-disabled={disabled ? true : undefined}
          aria-disabled={disabled ? true : undefined}
          {...panHandlers}>
          <NativeWheelRows
            rows={rows}
            itemHeight={itemHeight}
          />
          <WheelEdgeFade height={paddingItems * itemHeight} />
        </View>
      )}
    </WheelContainer>
  );
};

// ── Sub-components for composition ────────────────────────────

Wheel.Item = WheelItemContainer;

export type WheelContainerProps = GetProps<typeof WheelContainer>;
export type WheelItemProps = GetProps<typeof WheelItemContainer>;

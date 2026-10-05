import { isWeb } from '@repo/platform';
import { transitionProps, useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
// tamagui 2.0.0-rc dropped the StackProps alias; YStackProps is the same shape.
import type { TamaguiElement, TransitionProp, YStackProps as StackProps } from 'tamagui';
import { View } from 'tamagui';

/**
 * AnimateHeight — the house auto-height primitive.
 *
 * CSS cannot transition to `height: auto` — intrinsic (content-driven) height
 * changes snap no matter what `transition` is set, because height never
 * appears as an interpolable value. This container measures its content
 * (ResizeObserver on web, onLayout on native) and drives a NUMERIC `height`
 * through the house `transition` token on web. The RN driver cannot tween
 * layout props (Axiom 4), so native uses intrinsic height while open and
 * unmounts closed content immediately, without waiting for a measurement.
 *
 * Two modes:
 *  - follower (no `open` prop): always mounted; height tracks the content's
 *    intrinsic height, so content that grows or shrinks while visible tweens
 *    instead of snapping.
 *  - collapsible (`open: boolean`): `false` tweens to 0 and unmounts children
 *    once the collapse settles (immediately when nothing can tween, e.g.
 *    reduced motion or no measurement yet); `true` remounts children and
 *    tweens 0 → measured height, then keeps following content changes.
 *
 * Reduced motion is respected CONDITIONALLY: the transition resolves through
 * the knob system (`useResolvedKnobs`), which is `undefined` under OS
 * `prefers-reduced-motion` or `animation="none"` — heights then apply
 * instantly, with no decorative tween, but state changes still land.
 *
 * Padding belongs INSIDE children (or on a wrapper around this component):
 * the measured box is the children's wrapper, so padding on AnimateHeight
 * itself would be excluded from the animated height.
 */
export interface AnimateHeightProps extends Omit<StackProps, 'height' | 'children'> {
  /**
   * Collapsible mode. Omit entirely for follower mode (height always tracks
   * content). `false` collapses to 0 and unmounts children at rest.
   */
  open?: boolean;
  children?: ReactNode;
}

/**
 * Conservative settle time (ms) per house transition token, for unmounting
 * after the collapse tween. Keep in sync with the token vocabulary in
 * public/theme/src/theme/animations (css timings AND spring physics): values
 * cover the native spring tails, which outlast the fixed css durations — on
 * web the box is already clipped to 0 by then, so the later unmount is
 * invisible.
 */
const settleTable: Record<string, number> = {
  snappy: 300,
  quick: 450,
  bouncy: 800,
  medium: 600,
  tooltip: 700,
  gentle: 900,
  slow: 1100,
  lazy: 1300,
};

/**
 * Settle time before finalizing (unmounting / releasing a clamp) — token
 * settle + buffer. Exported for siblings that sequence work after a height
 * tween (e.g. CodeBlock's reveal releases its maxHeight clamp on settle).
 */
export function settleMs(transition: TransitionProp | undefined): number {
  if (!transition) {
    return 0;
  }
  const ms = typeof transition === 'string' ? settleTable[transition] : undefined;
  // Non-string TransitionProp shapes (arrays/objects) fall back like an
  // unknown token name.
  return (ms ?? 600) + 80;
}

const WebAnimateHeight = forwardRef<TamaguiElement, AnimateHeightProps>(function AnimateHeight(
  { open, children, transition: transitionProp, ...props },
  ref,
) {
  const { knobProps } = useResolvedKnobs();
  // knob transition is undefined under reduced motion / animation="none"
  const transition = transitionProp ?? knobProps.transition;
  const collapsible = open !== undefined;

  // null = natural (auto) height: initial open/follower render before the
  // first measurement, so there is never a flash of collapsed content.
  const [displayHeight, setDisplayHeight] = useState<number | null>(collapsible && !open ? 0 : null);
  // Children stay mounted through the exit tween, then unmount at rest.
  const [exiting, setExiting] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  const measuredRef = useRef<number | null>(null);
  // Set on closed → open: hold height 0 until the first measurement so the
  // expand tweens 0 → px instead of snapping to auto.
  const openingRef = useRef(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const innerRef = useRef<TamaguiElement | null>(null);

  // Adjust state during render (React's usePrevious pattern) so children
  // mount in the SAME commit `open` flips true, and stay mounted for the
  // exit tween when it flips false.
  if (collapsible && open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      // Hold at 0 until measurement only when children were unmounted (at
      // rest). Re-opening mid-exit keeps the existing measurement — the
      // observer will not re-fire for unchanged content — so the effect
      // below retargets it directly and the tween reverses in place.
      openingRef.current = !exiting;
      if (exiting) {
        setExiting(false);
      }
    } else {
      openingRef.current = false;
      setExiting(true);
    }
  }

  const shouldRenderChildren = !collapsible || open || exiting;
  const atRestClosed = collapsible && !open && !exiting;

  const clearPending = useCallback(() => {
    if (unmountTimerRef.current != null) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    if (rafRef.current != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const handleMeasured = useCallback(
    (height: number) => {
      measuredRef.current = height;
      // Closing (or closed): the target stays 0 — ignore content measures.
      if (collapsible && !open) {
        return;
      }
      if (openingRef.current) {
        openingRef.current = false;
        // Double rAF: guarantee the browser paints the height-0 frame
        // before the target lands, or the 0 → px tween never runs.
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            setDisplayHeight(height);
          });
        });
        return;
      }
      setDisplayHeight(height);
    },
    [collapsible, open],
  );
  const handleMeasuredRef = useRef(handleMeasured);
  handleMeasuredRef.current = handleMeasured;
  const transitionRef = useRef(transition);
  transitionRef.current = transition;

  // Web: ResizeObserver on the content wrapper — fires on observe (initial
  // measure) and on any intrinsic size change while mounted.
  useLayoutEffect(() => {
    if (!isWeb || !shouldRenderChildren) {
      return;
    }
    const node = innerRef.current as unknown as HTMLElement | null;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      // getBoundingClientRect keeps fractional text heights exact.
      handleMeasuredRef.current(node.getBoundingClientRect().height);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [shouldRenderChildren]);

  // Native: onLayout on the content wrapper is the measurement source.
  const onInnerLayout = useCallback((event: LayoutChangeEvent) => {
    handleMeasuredRef.current(event.nativeEvent.layout.height);
  }, []);

  // Drive the open/close targets after commit.
  useEffect(() => {
    if (!collapsible) {
      return;
    }
    clearPending();
    if (open) {
      // Opening from closed holds 0 until measurement (openingRef); if a
      // measurement already exists (close interrupted mid-tween), retarget
      // it immediately so the tween reverses from wherever it is.
      if (!openingRef.current && measuredRef.current != null) {
        setDisplayHeight(measuredRef.current);
      }
      return;
    }
    // Closing: tween px → 0, then unmount at rest. When nothing can tween
    // (no transition token — reduced motion — or no real measurement, as in
    // non-layout test environments), finalize immediately. The transition is
    // read through a ref at close time only — mid-tween knob changes should
    // not restart the exit timer.
    setDisplayHeight(0);
    const closeTransition = transitionRef.current;
    const canTween = Boolean(closeTransition) && (measuredRef.current ?? 0) > 0;
    if (canTween) {
      unmountTimerRef.current = setTimeout(() => {
        unmountTimerRef.current = null;
        setExiting(false);
      }, settleMs(closeTransition));
    } else {
      setExiting(false);
    }
  }, [collapsible, open, clearPending]);

  useEffect(() => clearPending, [clearPending]);

  return (
    <View
      ref={ref}
      overflow="hidden"
      {...(displayHeight != null ? { height: displayHeight } : {})}
      {...(atRestClosed ? { display: 'none' as const } : {})}
      {...transitionProps(transition)}
      {...props}>
      {shouldRenderChildren ? (
        <View
          ref={innerRef}
          // keep natural height inside the clipped, height-driven outer
          flexShrink={0}
          {...(!isWeb ? { onLayout: onInnerLayout } : {})}>
          {children}
        </View>
      ) : null}
    </View>
  );
});

/** Native layout has no height tween, so measurement must not gate visibility. */
const NativeAnimateHeight = forwardRef<TamaguiElement, AnimateHeightProps>(function NativeAnimateHeight(
  { open, children, ...props },
  ref,
) {
  return (
    <View ref={ref} overflow="hidden" {...(open === false ? { display: 'none' as const } : {})} {...props}>
      {open !== false ? <View flexShrink={0}>{children}</View> : null}
    </View>
  );
});

export const AnimateHeight = forwardRef<TamaguiElement, AnimateHeightProps>(function AnimateHeight(props, ref) {
  return isWeb ? <WebAnimateHeight {...props} ref={ref} /> : <NativeAnimateHeight {...props} ref={ref} />;
});

import { CheckIcon } from '@phosphor-icons/react';
import {
  FOCUS_VISIBLE_RING,
  MIN_PRESS_TARGET,
  ensureKeyboardModalityTracking,
  radiusClassProps,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { GetProps } from 'tamagui';
import { View, XStack, getTokens, isWeb, styled } from 'tamagui';

import { componentColors } from '../componentColors';
import { useTranslation } from '../shared/i18n';
import { withInterp } from '../shared/t';

// ── Types ─────────────────────────────────────────────────────

/**
 * Which IDIOM the strip paints — never a size of its own.
 *
 * - `dots` — carousel page control: idle circles, active a short capsule
 *   (iOS UIPageControl + Linear/Stripe worm, not a 3× caterpillar).
 * - `pills` — always capsules; idle is a short pill, active a longer one.
 * - `bars` — progress-TICK idiom: the mark takes the scale's `bar` metric
 *   and never carries a completion badge (a tick is not a badge).
 *
 * **The mark's size resolves through exactly one channel**, in this order:
 * 1. the host's pin — `dotSize` / `activeDotSize`;
 * 2. otherwise the size knob's scale (`dotGeometryMap`), read at the metric
 *    the idiom selects.
 *
 * That single rule is why `<Pagination variant="bars">` is chunkier than a
 * bare `<DotIndicator variant="bars">`: the pager PINS a larger step, because
 * its strip sits on a rail between 44px controls. Same idiom, one channel,
 * two sizes — `bars` does not name a second geometry.
 */
export type DotVariant = 'dots' | 'bars' | 'pills';

/**
 * What the dots stand for. The two idioms differ only in a11y vocabulary:
 * a carousel marks its current slide (`aria-current="true"`, "Go to item N"),
 * a wizard marks its current step (`aria-current="step"`, "Go to step N").
 */
export type DotIdiom = 'item' | 'step';

export interface DotIndicatorProps {
  /** Total number of dots */
  total: number;
  /** Current active index (0-based) */
  activeIndex: number;
  /** Called when a dot is clicked */
  onChange?: (index: number) => void;
  /** Visual variant */
  variant?: DotVariant;
  /** Gap between dots */
  gap?: number | string;
  /** Disable interaction */
  disabled?: boolean;
  /** Indices already completed — painted in the completion ramp with a check */
  completedSteps?: Set<number>;
  /** A11y vocabulary: carousel position (default) or wizard progress */
  idiom?: DotIdiom;
  /** Seat the strip on a filled capsule rail (the wizard/pager chrome) */
  rail?: boolean;
  /** Painted dot size; defaults to the size knob's geometry */
  dotSize?: number | string;
  /** Painted width of the active dot; defaults to the size knob's geometry */
  activeDotSize?: number | string;
  /** Named transition tweening the active dot's geometry and color */
  transition?: string;
  /**
   * Name of the per-dot state attribute (`active` / `idle`). Hosts that
   * publish their own DOM contract pass theirs — Pagination keeps
   * `data-pagination-dot`, which probes and specs already assert against.
   */
  dotStateAttribute?: string;
}

// ── Knob mappings ─────────────────────────────────────────────

// SP-GAP: space knob moves only the inter-item gap;
// medium keeps the previous $2.
const dotGapMap: Record<string, string> = {
  small: '$1',
  medium: '$2',
  large: '$3',
};

// R-PILL items scale their geometry with the size knob (spec:526-528);
// medium keeps the previous 8/6/24 geometry.
//
// This table is the ONLY place an unpinned mark's pixels are defined: the
// idiom picks `dot` or `bar`, the size knob picks the row. A host that needs
// another size pins one (`dotSize`/`activeDotSize`) rather than declaring a
// second geometry under a variant name.
const dotGeometryMap: Record<string, { dot: number; bar: number; active: number }> = {
  $3: { dot: 6, bar: 5, active: 18 },
  $4: { dot: 8, bar: 6, active: 24 },
  $5: { dot: 10, bar: 8, active: 30 },
};

/**
 * Smallest dot that can legibly hold the completion checkmark. The tick idiom
 * never carries one at ANY size — that is what makes it a tick rather than a
 * badge — so the size floor only guards the badge-capable idioms.
 */
const CHECK_MIN_DOT = 8;

/**
 * Instagram / Swiper `dynamicBullets` window: five marks, distance scale,
 * the rest collapse. Long carousels stay compact instead of a 10-dot ruler.
 */
const WINDOW = 5;

/** Resolve a size token (`$0.75`) or raw px to the number the press-target math needs. */
function sizePx(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const token = (getTokens().size as Record<string, { val?: number } | undefined>)?.[value]?.val;
    if (typeof token === 'number') {
      return token;
    }
  }
  return fallback;
}

function idleMarkWidth(variant: DotVariant, itemSize: number, activeSize: number): number {
  if (variant === 'pills') {
    return Math.round(itemSize * 2.25);
  }
  // Tick: wider than tall when unpinned; Pagination's 24×24 pin is unchanged
  // because `max(itemSize, 0.55×active)` keeps the pin when itemSize is chunky.
  if (variant === 'bars') {
    return Math.max(itemSize, Math.round(activeSize * 0.55));
  }
  return itemSize;
}

function activeMarkWidth(variant: DotVariant, itemSize: number, geometryActive: number): number {
  // Unpinned carousel dots: a short capsule (~2×), not a 3× worm. Host pins
  // (Pagination 28×8 / 36×24) still win via `sizePx(activeDotSize, …)`.
  if (variant === 'dots') {
    return Math.round(itemSize * 2);
  }
  if (variant === 'pills') {
    return Math.round(itemSize * 3);
  }
  return geometryActive;
}

function windowRange(active: number, total: number): [number, number] {
  if (total <= WINDOW) {
    return [0, Math.max(0, total - 1)];
  }
  const half = Math.floor(WINDOW / 2);
  let start = active - half;
  let end = active + half;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > total - 1) {
    start -= end - (total - 1);
    end = total - 1;
  }
  return [Math.max(0, start), end];
}

function windowScale(index: number, active: number, start: number, end: number, total: number): number {
  if (total <= WINDOW) {
    return 1;
  }
  if (index < start || index > end) {
    return 0;
  }
  const dist = Math.abs(index - active);
  if (dist === 0) {
    return 1;
  }
  if (dist === 1) {
    return 0.72;
  }
  return 0.48;
}

function isRtl(node: HTMLElement | null): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const fromNode = node?.closest('[dir]')?.getAttribute('dir');
  const dir = fromNode || document.documentElement.dir;
  return dir === 'rtl';
}

// ── Styled components ─────────────────────────────────────────

const DotsContainer = styled(XStack, {
  name: 'DotIndicator',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '$2',
  // Outer +2px focus ring on the painted mark must not clip at the strip edge.
  overflow: 'visible',
  variants: {
    // A rail seats the strip on a filled capsule instead of the page. It is a
    // variant of the strip rather than host chrome because the rail and the
    // idle dot color are ONE decision: idle dots have to step up the ramp to
    // stay visible on the rail's fill, and split across two files that pairing
    // drifts.
    rail: {
      true: {
        backgroundColor: componentColors.interactive.background,
        // R-PILL: the rail is a capsule at every radius value,
        // like the dots it holds.
        ...radiusClassProps('R-PILL', 'DotIndicator rail'),
        borderRadius: '$10',
      },
    },
  } as const,
});

// Press-floor: the painted dot stays tiny (6–10px) but the
// press target is a transparent wrapper floored at 44px tall via the house
// pressTarget* channel (grown box + negative outset). The horizontal target
// is pitch-limited: it extends only ~half the inter-dot gap each side so
// adjacent enlarged targets never overlap (overlapping targets are their own
// defect — same trade WCAG 2.5.8 makes for dense dot strips).
const DotTarget = styled(View, {
  name: 'DotTarget',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
  overflow: 'visible',
  borderRadius: 1000,
  // The 44px hit box is not the perceived control (Chip ✕ rule). Rest,
  // mouse-focus, and :focus-visible paint no ring here — the ring rides the
  // painted mark via FOCUS_VISIBLE_RING when wasKeyboardFocus().
  outlineWidth: 0,
  outlineStyle: 'none' as any,
  focusStyle: { outlineWidth: 0, outlineStyle: 'none' as any },
  focusVisibleStyle: { outlineWidth: 0, outlineStyle: 'none' as any },
});

const Dot = styled(View, {
  name: 'Dot',
  // R-PILL: an ornamental dot is a circle at every radius
  // value — the knob moves its size, never its shape — so it declares the
  // class the `radius:none` sweep licenses it under.
  ...radiusClassProps('R-PILL', 'DotIndicator dot'),
  // Centers the completion checkmark; inert for the empty dots.
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 1000,
  backgroundColor: componentColors.indicator.inactive,
  hoverStyle: {
    backgroundColor: componentColors.indicator.hover,
  },
  variants: {
    active: {
      true: {
        // The active dot is the selected mark, so it carries the accent
        // (it read $color9 neutral — indistinguishable from idle chrome).
        backgroundColor: componentColors.indicator.selected,
      },
    },
    // No `variant` geometry here: the mark's width/height are always passed
    // explicitly from the one size channel below, so a per-variant pixel table
    // on the styled component could only ever be a second, silently-losing
    // definition of the same thing (it already disagreed with the scale at
    // size knob `$3`, where a tick is 5px, not 6).
    disabled: {
      true: {
        opacity: 0.5,
      },
    },
  } as const,
});

// ── DotIndicator Component ────────────────────────────────────

export function DotIndicator({
  total,
  activeIndex,
  onChange,
  variant = 'dots',
  gap: gapProp,
  disabled = false,
  completedSteps,
  idiom = 'item',
  rail = false,
  dotSize,
  activeDotSize,
  transition,
  dotStateAttribute = 'data-dot-state',
}: DotIndicatorProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const onCompleted = useReadableTextOn(componentColors.indicator.completed);
  const rootRef = useRef<HTMLElement | null>(null);
  const [kbFocusIndex, setKbFocusIndex] = useState<number | null>(null);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  // Consumer gap ejects; otherwise the space knob drives the inter-item gap.
  const gap = gapProp ?? dotGapMap[knobProps.space] ?? '$2';
  const geometry = dotGeometryMap[knobProps.sizeToken] ?? dotGeometryMap.$4;
  // The tick idiom (`bars`) is ONE flag: it picks the scale's thinner metric
  // AND withholds the completion badge, so the name cannot come to mean one
  // thing for size and another for badging.
  const isTick = variant === 'bars';
  // A host may pin the painted geometry (Pagination's token sizes); otherwise
  // the size knob drives it. Pin first, scale second — one channel.
  const itemSize = sizePx(dotSize, isTick ? geometry.bar : geometry.dot);
  const activeSize = sizePx(activeDotSize, activeMarkWidth(variant, itemSize, geometry.active));
  const idleWidth = idleMarkWidth(variant, itemSize, activeSize);

  // Horizontal slop is capped at just under half the resolved gap so two
  // enlarged targets keep ≥1px of dead space between them.
  const gapPx = typeof gap === 'number' ? gap : ((getTokens().space as any)?.[gap]?.val ?? 7);
  const slopX = Math.max(0, Math.floor((gapPx - 1) / 2));
  const outsetY = Math.max(0, Math.ceil((MIN_PRESS_TARGET - itemSize) / 2));

  // No onChange means the indicator is read-only (informational), which is
  // different from disabled (interactive but blocked)
  const interactive = !disabled && !!onChange;
  const isStep = idiom === 'step';
  const label = isStep ? t('Go to step {{number}}') : t('Go to item {{number}}');
  const currentValue = isStep ? 'step' : 'true';
  // Motion gates on the resolved animation knob (undefined at "none"
  // / prefers-reduced-motion). Host `transition` may name the tween but cannot
  // re-enable motion the knob turned off.
  const motion = knobProps.transition ? (transition ?? knobProps.transition) : undefined;
  // Discrete jumps tween the indicator; the explicit CSS shorthand is
  // the belt-and-suspenders arm for the web driver, which only picks up
  // Tamagui's named transition on some props.
  const motionStyle = motion
    ? {
        transition:
          'width var(--mp-transition, 200ms) ease, height var(--mp-transition, 200ms) ease, background-color var(--mp-transition, 200ms) ease, transform var(--mp-transition, 200ms) ease',
      }
    : undefined;

  const clampedActive = Math.min(Math.max(0, activeIndex), Math.max(0, total - 1));
  const [winStart, winEnd] = windowRange(clampedActive, total);

  const focusMark = (index: number) => {
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector?.(`[data-dot-index="${index}"]`) as HTMLElement | null;
      el?.focus?.();
    });
  };

  const moveTo = (index: number) => {
    const next = Math.min(Math.max(0, index), total - 1);
    onChange?.(next);
    focusMark(next);
  };

  return (
    <DotsContainer
      ref={rootRef as any}
      gap={gap}
      rail={rail}
      {...(interactive ? ({ role: 'group' } as const) : undefined)}
      {...(rail ? { paddingHorizontal: knobProps.panelPadding.padding, height: knobProps.sizeToken } : undefined)}>
      {Array.from({ length: total }).map((_, index) => {
        const isActive = index === activeIndex;
        // Completion is what a step ALREADY did; the current step outranks it.
        const isCompleted = !isActive && !!completedSteps?.has(index);
        const scale = windowScale(index, clampedActive, winStart, winEnd, total);
        const hidden = scale === 0;
        const baseWidth = isActive ? activeSize : idleWidth;
        const dotWidth = Math.max(1, Math.round(baseWidth * scale));
        const dotHeight = Math.max(1, Math.round(itemSize * scale));
        // Only the NON-selected fills are computed here. The selected mark
        // stays on the `active` variant so no later prop can paint over the
        // accent — the failure mode this component was fixed for.
        const restingFill = isCompleted
          ? componentColors.indicator.completed
          : rail
            ? // Idle chrome steps up the ramp on a rail so the dot still
              // separates from the capsule fill it sits on.
              componentColors.indicator.track
            : componentColors.indicator.inactive;
        const kbRing = kbFocusIndex === index;
        return (
          <DotTarget
            key={index}
            display={hidden ? 'none' : 'flex'}
            width={dotWidth + slopX * 2}
            minHeight={MIN_PRESS_TARGET}
            marginHorizontal={-slopX}
            marginVertical={-outsetY}
            zIndex={kbRing ? 1 : undefined}
            cursor={interactive ? 'pointer' : disabled ? 'not-allowed' : 'default'}
            onPress={
              interactive
                ? () => {
                    onChange?.(index);
                  }
                : undefined
            }
            aria-label={withInterp(label, { number: index + 1 })}
            {...({ 'data-dot-index': String(index) } as Record<string, unknown>)}
            {...(hidden ? ({ 'data-dot-hidden': 'true' } as Record<string, unknown>) : undefined)}
            {...(isActive ? ({ 'aria-current': currentValue } as Record<string, unknown>) : undefined)}
            {...(interactive
              ? {
                  role: 'button' as const,
                  tabIndex: 0,
                  onFocus: () => {
                    // Native has no pointer-vs-keyboard split; any focus rings.
                    if (!isWeb || wasKeyboardFocus()) {
                      setKbFocusIndex(index);
                    }
                  },
                  onBlur: () => {
                    setKbFocusIndex((prev) => (prev === index ? null : prev));
                  },
                  onKeyDown: ((e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onChange?.(index);
                      return;
                    }
                    const rtl = isRtl(e.currentTarget as unknown as HTMLElement);
                    if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      moveTo(index + (rtl ? -1 : 1));
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      moveTo(index + (rtl ? 1 : -1));
                    } else if (e.key === 'Home') {
                      e.preventDefault();
                      moveTo(0);
                    } else if (e.key === 'End') {
                      e.preventDefault();
                      moveTo(total - 1);
                    }
                  }) as unknown as () => void,
                }
              : disabled
                ? { role: 'button' as const }
                : undefined)}>
            <Dot
              active={isActive}
              {...(isActive
                ? undefined
                : {
                    backgroundColor: restingFill,
                    // A completed dot and a rail dot both hold their fill on
                    // hover: the neutral hover step is PALER than either, so
                    // the page-level hover would read as a dim.
                    ...(isCompleted || rail ? { hoverStyle: { backgroundColor: restingFill } } : undefined),
                  })}
              width={dotWidth}
              height={dotHeight}
              disabled={disabled}
              transition={motion}
              style={motionStyle}
              {...(kbRing ? FOCUS_VISIBLE_RING : { outlineWidth: 0 })}
              {...({
                [dotStateAttribute]: isActive ? 'active' : 'idle',
                'data-mark-width': String(dotWidth),
                'data-mark-height': String(dotHeight),
              } as Record<string, unknown>)}
              {...(kbRing ? ({ 'data-dot-ring': 'true' } as Record<string, unknown>) : undefined)}>
              {isCompleted && !isTick && itemSize >= CHECK_MIN_DOT && (
                <CheckIcon
                  size={8}
                  color={onCompleted ?? '$color1'}
                  weight="bold"
                  data-check-ink={onCompleted ?? '$color1'}
                />
              )}
            </Dot>
          </DotTarget>
        );
      })}
    </DotsContainer>
  );
}

export type DotsContainerProps = GetProps<typeof DotsContainer>;
export type DotProps = GetProps<typeof Dot>;

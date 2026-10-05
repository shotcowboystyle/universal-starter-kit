/**
 * Knob-aware Carousel.
 *
 * Nested hue is opt-in: this module does not wrap a tint surface.
 * Viewport clips via `containerRadius`. Slides size from the
 * measured scroll viewport. Arrow chrome rides size-recipe
 * fragments + R-BINARY radius and A-STATE fill.
 */

import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { zIndex } from '@repo/forms';
import { MIN_PRESS_TARGET, pressTargetHitSlop, pressTargetStyle, useResolvedKnobs } from '@repo/theme';
import type { KeyboardEvent, ReactNode } from 'react';
import { useState, useRef, useCallback, useEffect, Children } from 'react';
import type { GetProps, ScrollView as TamaguiScrollView } from 'tamagui';
import { View, XStack, getTokens, isWeb, styled } from 'tamagui';

import { DotIndicator } from '../DotIndicator';
import { useDirection } from '../hooks/useDirection';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { withInterp } from '../shared/t';

// ── Types ─────────────────────────────────────────────────────

export interface CarouselProps {
  children: ReactNode;
  /** Show navigation arrows */
  showArrows?: boolean;
  /** Show dot indicators */
  showDots?: boolean;
  /** Auto-play interval in milliseconds (0 to disable) */
  autoPlay?: number;
  /** Loop back to start when reaching the end */
  loop?: boolean;
  /** Gap between items */
  gap?: number | string;
  /** Called when the active slide changes */
  onSlideChange?: (index: number) => void;
  /** Initial slide index */
  initialSlide?: number;
}

// ── Ring the painted arrow, never the viewport or the 44px hit box ─
// Embla / Polaris / Apple: the halo follows the perceived control (the
// circle), keyboard-only (`:focus-visible`). Chip dismiss uses the same
// parent-focus → child-ring split; this sheet is local because the shared
// composite CSS rings the node that carries the class, not its descendant.

const ARROW_RING_STYLE_ID = 'mp-carousel-arrow-ring';

function ensureCarouselArrowRing() {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(ARROW_RING_STYLE_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = ARROW_RING_STYLE_ID;
  tag.textContent = `.mp-carousel-arrow:focus,
.mp-carousel-arrow:focus-visible {
  outline: none !important;
}
.mp-carousel-arrow:focus-visible .mp-carousel-arrow-visual {
  outline: 2px solid var(--outlineColor, var(--c-outlineColor, CanvasText)) !important;
  outline-offset: 2px !important;
}`;
  document.head.appendChild(tag);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

// ── Styled components ─────────────────────────────────────────

const CarouselContainer = styled(View, {
  name: 'Carousel',
  position: 'relative',
  width: '100%',
  overflow: 'hidden',
});

const CarouselStage = styled(View, {
  name: 'CarouselStage',
  position: 'relative',
  width: '100%',
});

const CarouselSlide = styled(View, {
  name: 'CarouselSlide',
  flexShrink: 0,
});

// Press-floor: the interactive element is a transparent
// absolute target floored at 44×44 (house pressTarget* channel); the painted
// circle (ArrowVisual) keeps its knob-driven visual size centered inside.
// A-STATE hover/press fill lives on the visual (SF-CONTROL), never as
// untokened scale on the hit box. This node never paints a ring —
// `:focus-visible` forwards it to ArrowVisual.
const ArrowButton = styled(View, {
  name: 'CarouselArrow',
  position: 'absolute',
  top: '50%',
  transform: [{ translateY: '-50%' }],
  // Local tier top (Axiom 14): arrows float over slides within the carousel.
  zIndex: zIndex.localTop,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  outlineWidth: 0,
  focusStyle: {
    outlineWidth: 0,
  },
  focusVisibleStyle: {
    outlineWidth: 0,
  },
  variants: {
    disabled: {
      true: {
        cursor: 'not-allowed',
      },
    },
  } as const,
});

const ArrowVisual = styled(View, {
  name: 'CarouselArrowVisual',
  alignItems: 'center',
  justifyContent: 'center',
});

const DotsWrapper = styled(View, {
  name: 'CarouselDotsWrapper',
  alignItems: 'center',
});

// ── Carousel Component ────────────────────────────────────────

export function Carousel({
  children,
  showArrows = true,
  showDots = true,
  autoPlay = 0,
  loop = false,
  gap: gapProp,
  onSlideChange,
  initialSlide = 0,
}: CarouselProps) {
  const { t } = useTranslation();
  const { knobProps, control, disabledState } = useResolvedKnobs({
    component: 'Carousel',
  });
  ensureCarouselArrowRing();
  // Inter-slide gap follows the space knob fragment (SP-GAP); an explicit
  // `gap` prop ejects. Arrow chrome follows the size-recipe fragments
  // (visual height/icon), not a parallel sizeRecipeForToken call.
  // Press target stays floored at 44 (MIN_PRESS_TARGET vs visual).
  const gap = gapProp ?? knobProps.gap.gap;
  // Scroll-offset math needs the gap in px — the slide pitch is
  // slideWidth + gap. Space tokens resolve the way DotIndicator's do.
  const gapPx =
    typeof gap === 'number'
      ? gap
      : ((getTokens().space as Record<string, { val?: number } | undefined>)?.[gap]?.val ?? 0);
  const arrowSize = knobProps.control.height;
  // Arrows are R-BINARY (spec Carousel anatomy): square in the radius `none`
  // world, a full circle at every other value. The fixed 1000 arc was
  // knob-dead — an undeclared knob-immune shape the old geometric sweep
  // silently read as an identity circle.
  const arrowRadius = knobProps.pointy ? 0 : 1000;
  // Press-floor target around the painted circle; the edge inset shifts so
  // the circle still sits 8px from the container edge (clamped ≥0 so the
  // enlarged target never hangs off the stage).
  const arrowTargetSize = Math.max(arrowSize, MIN_PRESS_TARGET);
  const arrowEdgeInset = Math.max(0, 8 - Math.round((arrowTargetSize - arrowSize) / 2));
  const arrowHitSlop = pressTargetHitSlop(arrowSize);
  const [activeIndex, setActiveIndex] = useState(initialSlide);
  const trackRef = useRef<TamaguiScrollView | null>(null);
  const hoverPauseRef = useRef(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const slideCount = Children.count(children);
  // SLIDE-VIEWPORT-WIDTH: slides size from the MEASURED scroll viewport,
  // so the measurement is state (slides re-render on measure/resize). On web a
  // slide's `width="100%"` resolves against the track's CONTENT size, not the
  // clipping viewport — N fixed-width slides inflate to N×W each and slides
  // 2..N land beyond max scroll while the dots animate at nothing.
  const [slideWidth, setSlideWidth] = useState(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // knobProps.transition resolves to undefined at animation "none" (incl.
  // prefers-reduced-motion) — slide snaps must jump instead of smooth-scroll.
  // GOV.UK / WCAG C39: programmatic paging uses behavior auto; no momentum
  // coast. Do not re-read the media query here — the knob already carries it.
  const animateSnaps = Boolean(knobProps.transition);
  const scrollToSlide = useCallback(
    (index: number) => {
      if (!trackRef.current) {
        return;
      }
      if (index < 0 || index >= slideCount) {
        return;
      }
      const offset = index * (slideWidth + gapPx);
      trackRef.current.scrollTo({ x: offset, animated: animateSnaps });
    },
    [slideCount, slideWidth, gapPx, animateSnaps],
  );

  const goToSlide = useCallback(
    (index: number) => {
      let targetIndex = index;
      if (loop) {
        if (index < 0) {
          targetIndex = slideCount - 1;
        }
        if (index >= slideCount) {
          targetIndex = 0;
        }
      } else {
        targetIndex = Math.max(0, Math.min(index, slideCount - 1));
      }
      setActiveIndex(targetIndex);
      scrollToSlide(targetIndex);
      onSlideChange?.(targetIndex);
    },
    [slideCount, loop, scrollToSlide, onSlideChange],
  );

  const goNext = useCallback(() => {
    goToSlide(activeIndex + 1);
  }, [activeIndex, goToSlide]);
  const goPrev = useCallback(() => {
    goToSlide(activeIndex - 1);
  }, [activeIndex, goToSlide]);

  // Handle scroll to update active index (pitch = slideWidth + gap)
  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const scrollX = event.nativeEvent.contentOffset.x;
      if (!slideWidth) {
        return;
      }
      const newIndex = Math.round(scrollX / (slideWidth + gapPx));
      if (newIndex !== activeIndex && newIndex >= 0 && newIndex < slideCount) {
        setActiveIndex(newIndex);
        onSlideChange?.(newIndex);
      }
    },
    [activeIndex, slideCount, onSlideChange, slideWidth, gapPx],
  );

  // Auto-play is A-CONTINUOUS: stop at animation none / PRM (Carousel
  // invariant). Manual paging still works; it just jumps. Embla Autoplay +
  // W3C APG: pause while hovered or while focus is inside the carousel.
  useEffect(() => {
    if (autoPlay > 0 && animateSnaps) {
      autoPlayRef.current = setInterval(() => {
        if (hoverPauseRef.current) {
          return;
        }
        const root = rootRef.current;
        if (isWeb && typeof document !== 'undefined' && root) {
          const active = document.activeElement;
          if (active && root.contains(active)) {
            return;
          }
        }
        goNext();
      }, autoPlay);
      return () => {
        if (autoPlayRef.current) {
          clearInterval(autoPlayRef.current);
        }
      };
    }
  }, [autoPlay, goNext, animateSnaps]);

  // Anchor the active slide whenever geometry changes: the first measure
  // (which also lands `initialSlide` — activeIndex starts there), a resize
  // re-measure, or a gap change. Index offsets are only valid at the pitch
  // they were computed for, so re-derive and snap without animating.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  useEffect(() => {
    if (!slideWidth || slideCount === 0 || !trackRef.current) {
      return;
    }
    const index = Math.max(0, Math.min(activeIndexRef.current, slideCount - 1));
    trackRef.current.scrollTo({ x: index * (slideWidth + gapPx), animated: false });
  }, [slideWidth, gapPx, slideCount]);

  const canGoPrev = loop || activeIndex > 0;
  const canGoNext = loop || activeIndex < slideCount - 1;
  const [hoverSide, setHoverSide] = useState<'prev' | 'next' | null>(null);
  const [pressSide, setPressSide] = useState<'prev' | 'next' | null>(null);

  // In RTL the slide track flows right-to-left, so "previous" lives on the
  // physical right and "next" on the physical left. Both the anchoring side
  // and the glyph mirror together (glyph swap keyed on useDirection — the
  // one mechanism for directional chrome): each edge button keeps pointing
  // outward, toward the slide it navigates to. Semantics (labels, disabled)
  // stay bound to the prev/next action, not the physical side.
  const isRTL = useDirection() === 'rtl';
  const prevSide = isRTL ? ('right' as const) : ('left' as const);
  const nextSide = isRTL ? ('left' as const) : ('right' as const);
  const PrevGlyph = isRTL ? CaretRightIcon : CaretLeftIcon;
  const NextGlyph = isRTL ? CaretLeftIcon : CaretRightIcon;

  // Embla keyboard plugin / Polaris Pagination previousKeys+nextKeys / APG:
  // arrows page the strip; Home/End jump the ends. Logical (RTL swaps the
  // painted sides, not the keys).
  const handleRegionKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToSlide(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToSlide(slideCount - 1);
      }
    },
    [goPrev, goNext, goToSlide, slideCount],
  );

  const renderArrow = (
    side: 'prev' | 'next',
    physicalSide: 'left' | 'right',
    enabled: boolean,
    label: string,
    Glyph: typeof CaretLeftIcon,
    onPress: () => void,
  ) => (
    <ArrowButton
      {...{ [physicalSide]: arrowEdgeInset }}
      className="mp-carousel-arrow"
      disabled={!enabled}
      {...pressTargetStyle()}
      width={arrowTargetSize}
      height={arrowTargetSize}
      hitSlop={arrowHitSlop}
      transition={knobProps.transition}
      {...(!enabled ? disabledState.chromeKnobProps : undefined)}
      onPress={enabled ? onPress : undefined}
      role="button"
      aria-label={label}
      aria-disabled={!enabled || undefined}
      // Keyboard floor (Axiom 12): div[role=button] gets no native
      // focus or Enter/Space activation — supply both. Ring is CSS on
      // the visual, not this hit box and not the viewport.
      tabIndex={enabled ? 0 : -1}
      onKeyDown={
        ((e: KeyboardEvent) => {
          if ((e.key === 'Enter' || e.key === ' ') && enabled) {
            e.preventDefault();
            onPress();
          }
        }) as unknown as () => void
      }
      {...({
        'data-carousel-arrow': side,
        onHoverIn: () => {
          if (enabled) {
            setHoverSide(side);
          }
        },
        onHoverOut: () => {
          setHoverSide((current) => (current === side ? null : current));
        },
        onPressIn: () => {
          if (enabled) {
            setPressSide(side);
          }
        },
        onPressOut: () => {
          setPressSide((current) => (current === side ? null : current));
        },
      } as Record<string, unknown>)}>
      <ArrowVisual
        className="mp-carousel-arrow-visual"
        width={arrowSize}
        height={arrowSize}
        {...knobProps.surface}
        {...(hoverSide === side ? control.hoverKnobProps : undefined)}
        {...(pressSide === side && enabled ? control.pressKnobProps : undefined)}
        // Surface is SF-CONTROL; radius stays R-BINARY (after the spread).
        borderRadius={arrowRadius}
        transition={knobProps.transition}
        {...({ 'data-carousel-arrow-visual': side } as Record<string, unknown>)}>
        <Glyph {...knobProps.controlIcon} />
      </ArrowVisual>
    </ArrowButton>
  );

  return (
    <View
      ref={rootRef as never}
      role="region"
      aria-roledescription="carousel"
      aria-label={t('Carousel')}
      data-density={knobProps.density}
      data-size={knobProps.size}
      onKeyDown={handleRegionKeyDown as unknown as () => void}
      // Tamagui forwards onHoverIn/onHoverOut at runtime; the RN-flavored View
      // prop type omits them (house Record cast).
      {...({
        onHoverIn: () => {
          hoverPauseRef.current = true;
        },
        onHoverOut: () => {
          hoverPauseRef.current = false;
        },
      } as Record<string, unknown>)}>
      {/* Embla: arrows are siblings of the clipping viewport so the
          halo is not severed by overflow:hidden (Apple focus-halo on the
          control, not the scroller). */}
      <CarouselStage>
        <CarouselContainer
          {...knobProps.borderRadius}
          borderWidth={0}
          {...({ 'data-media-tile': 'carousel' } as Record<string, unknown>)}>
          <ScrollView
            ref={trackRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={
              {
                scrollSnapType: 'x mandatory',
                // Defeat inherited `scroll-behavior: smooth` when the knob is off.
                ...(!animateSnaps ? { scrollBehavior: 'auto' } : {}),
              } as any
            }
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onLayout={(e) => {
              setSlideWidth(e.nativeEvent.layout.width);
            }}
            tabIndex={-1}
            // The viewport is not a control. Never a keyboard stop,
            // never a UA outline — rings live on arrows and dots.
            outlineWidth={0}
            outlineStyle={'none' as any}
            focusStyle={{ outlineWidth: 0, outlineStyle: 'none' as any }}
            focusVisibleStyle={{ outlineWidth: 0, outlineStyle: 'none' as any }}
            {...({ dataSet: { carouselTrack: 'true' } } as Record<string, unknown>)}>
            <XStack {...(gapProp != null ? { gap: gapProp } : knobProps.gap)}>
              {Children.map(children, (child, index) => (
                <CarouselSlide
                  key={index}
                  // Measured-viewport width, never a percentage; slides
                  // stay content-sized only for the pre-measure frame.
                  width={slideWidth > 0 ? slideWidth : undefined}
                  style={{ scrollSnapAlign: 'start' } as any}
                  aria-roledescription="slide"
                  aria-label={withInterp(t('Slide {{number}} of {{total}}'), {
                    number: index + 1,
                    total: slideCount,
                  })}
                  {...({ 'data-carousel-slide': index } as Record<string, unknown>)}>
                  {child}
                </CarouselSlide>
              ))}
            </XStack>
          </ScrollView>
        </CarouselContainer>

        {showArrows && slideCount > 1 && (
          <>
            {renderArrow('prev', prevSide, canGoPrev, t('Previous slide'), PrevGlyph, goPrev)}
            {renderArrow('next', nextSide, canGoNext, t('Next slide'), NextGlyph, goNext)}
          </>
        )}
      </CarouselStage>

      {showDots && slideCount > 1 && (
        <DotsWrapper paddingVertical={knobProps.gap.gap}>
          <DotIndicator
            total={slideCount}
            activeIndex={activeIndex}
            onChange={goToSlide}
            transition={knobProps.transition as string | undefined}
          />
        </DotsWrapper>
      )}
    </View>
  );
}

// ── Sub-components for composition ────────────────────────────

Carousel.Slide = CarouselSlide;

export type CarouselContainerProps = GetProps<typeof CarouselContainer>;
export type CarouselSlideProps = GetProps<typeof CarouselSlide>;

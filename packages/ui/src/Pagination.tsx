import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
} from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import {
  FOCUS_VISIBLE_RING,
  ensureKeyboardModalityTracking,
  pressTargetStyle,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import type React from 'react';
import { useCallback, useState } from 'react';
import { Text, XStack, isWeb, type XStackProps } from 'tamagui';

import { componentColors } from './componentColors';
import { DotIndicator } from './DotIndicator';
import { useDirection } from './hooks/useDirection';
import { useTranslation } from './shared/i18n';
import { bidiIsolate, withInterp } from './shared/t';

export type PaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

const range = (start: number, end: number) => Array.from({ length: Math.max(end - start + 1, 0) }, (_, i) => start + i);

/**
 * Ellipsis windowing for the numbered variant: always show the boundary
 * pages, the current page and its siblings, and collapse the gaps into
 * ellipses — e.g. total=20, page=5 → [1, …, 4, 5, 6, …, 20].
 */
export function getPaginationItems(total: number, page: number, siblingCount = 1, boundaryCount = 1): PaginationItem[] {
  if (total <= 0) {
    return [];
  }
  const startPages = range(1, Math.min(boundaryCount, total));
  const endPages = range(Math.max(total - boundaryCount + 1, boundaryCount + 1), total);

  const siblingsStart = Math.max(
    Math.min(page - siblingCount, total - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2),
    endPages.length > 0 ? endPages[0] - 2 : total - 1,
  );

  const items: PaginationItem[] = [...startPages];
  if (siblingsStart > boundaryCount + 2) {
    items.push('ellipsis-start');
  } else if (boundaryCount + 1 < total - boundaryCount) {
    items.push(boundaryCount + 1);
  }
  items.push(...range(siblingsStart, siblingsEnd));
  if (siblingsEnd < total - boundaryCount - 1) {
    items.push('ellipsis-end');
  } else if (total - boundaryCount > boundaryCount) {
    items.push(total - boundaryCount);
  }
  items.push(...endPages);
  return items;
}

/**
 * The size the pager pins its strip at, as steps on the size-token scale.
 *
 * The strip itself is `DotIndicator` (one dot-strip implementation in
 * the catalog), and `DotVariant` documents the one channel a mark's size may
 * come from: a host pin, else the size knob's scale. This host pins, because
 * its strip is seated on a rail between 44px controls and a bare strip's knob
 * geometry reads lost there. Selecting a STEP keeps the pager on that channel
 * instead of authoring a second geometry under a variant name.
 */
const stripSteps = {
  base: { mark: '$0.75', active: '$2' },
  large: { mark: '$1.5', active: '$3' },
} as const;

/** Every page control paints at least 44×44. */
const pageControlFloor = pressTargetStyle();

const restRing = { outlineWidth: 0 } as const;

export interface PaginationProps extends Omit<XStackProps, 'children' | 'onChange'> {
  /** Total number of pages/steps */
  total: number;
  /** Current active index (0-based, controlled). Prefer `page` for the numbered variant. */
  activeIndex?: number;
  /** Called with the new 0-based index when the user requests a page change */
  onChange?: (index: number) => void;
  /** Current page (1-based, controlled). Equivalent to `activeIndex + 1`. */
  page?: number;
  /** Initial page (1-based) when uncontrolled */
  defaultPage?: number;
  /** Called with the new 1-based page when the user requests a page change */
  onPageChange?: (page: number) => void;
  /** Set of completed step indices (shows checkmarks, dots variant) */
  completedSteps?: Set<number>;
  /** Whether clicking a dot navigates directly to that step (dots variant) */
  allowJumpTo?: boolean;
  /** Whether the last step triggers onSubmit instead of onChange (dots variant) */
  isLastStep?: boolean;
  /** Called when submit is triggered on the last step (dots variant) */
  onSubmit?: () => void;
  /** Disable all navigation */
  disabled?: boolean;
  /**
   * Visual variant: dots/bars = carousel & wizard idiom, numbered = table &
   * data idiom. `bars` is the progress-tick idiom (never badges a completed
   * step) at the pager's large step — see `DotVariant` for the one rule that
   * governs a strip mark's size.
   */
  variant?: 'dots' | 'bars' | 'numbered' | 'simple';
  /** Total number of items across all pages (numbered summary slot) */
  totalItems?: number;
  /** Items per page (numbered summary slot) */
  pageSize?: number;
  /** Show the "1–25 of 312" summary. Requires totalItems + pageSize. */
  showSummary?: boolean;
  /** Pages shown either side of the current page before collapsing to an ellipsis */
  siblingCount?: number;
  /** Pages always shown at the start and end */
  boundaryCount?: number;
  /** Show first/last double-chevron buttons (numbered variant) */
  showFirstLast?: boolean;
}

export function Pagination({
  total,
  activeIndex,
  onChange,
  page,
  defaultPage,
  onPageChange,
  completedSteps,
  allowJumpTo = false,
  isLastStep = false,
  onSubmit,
  disabled = false,
  variant = 'dots',
  totalItems,
  pageSize,
  showSummary = false,
  siblingCount = 1,
  boundaryCount = 1,
  showFirstLast = false,
  ...stackProps
}: PaginationProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  // Undefined at animation "none" / PRM — a `|| "quick"` fallback
  // re-enables the tween and is the violation. DotIndicator also drops
  // host transition when the knob is off.
  const motionTransition = knobProps.transition as string | undefined;
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  // Ring rides the focused page control only, keyboard-origin, never
  // mouse. Selected is fill (below), not this outline channel.
  const [kbFocus, setKbFocus] = useState<string | null>(null);

  // Directional glyphs encode direction-of-travel (Axiom 15), so they must
  // point toward their targets in RTL too. Mechanism: swap the paired glyph
  // (CaretLeft ⇄ CaretRight) keyed on useDirection() — pixel-exact for the
  // symmetric caret/arrow pairs and portable to native, unlike a scaleX(-1)
  // transform. The checkmark is direction-neutral and never mirrors.
  const isRTL = useDirection() === 'rtl';
  const PrevIcon = isRTL ? CaretRightIcon : CaretLeftIcon;
  const NextIcon = isRTL ? CaretLeftIcon : CaretRightIcon;
  const FirstIcon = isRTL ? CaretDoubleRightIcon : CaretDoubleLeftIcon;
  const LastIcon = isRTL ? CaretDoubleLeftIcon : CaretDoubleRightIcon;
  const PrevArrowIcon = isRTL ? ArrowRightIcon : ArrowLeftIcon;
  const NextArrowIcon = isRTL ? ArrowLeftIcon : ArrowRightIcon;

  // Controlled via `page` (1-based) or `activeIndex` (0-based); uncontrolled otherwise.
  const [uncontrolledPage, setUncontrolledPage] = useState(defaultPage ?? 1);
  const controlledIndex = page != null ? page - 1 : activeIndex;
  const index = controlledIndex ?? uncontrolledPage - 1;
  const currentPage = index + 1;

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, total - 1));
      if (controlledIndex == null) {
        setUncontrolledPage(clamped + 1);
      }
      onChange?.(clamped);
      onPageChange?.(clamped + 1);
    },
    [controlledIndex, total, onChange, onPageChange],
  );

  const handlePrev = useCallback(() => {
    if (index > 0) {
      goTo(index - 1);
    }
  }, [index, goTo]);

  const handleNext = useCallback(() => {
    if (isLastStep && onSubmit) {
      onSubmit();
    } else if (index < total - 1) {
      goTo(index + 1);
    }
  }, [index, total, isLastStep, onSubmit, goTo]);

  const activateOnEnterSpace = (fn: () => void, enabled: boolean) =>
    ((e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (enabled) {
          fn();
        }
      }
    }) as unknown as () => void;

  const pageControlProps = (id: string) => ({
    ...pageControlFloor,
    elevation: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    focusStyle: restRing,
    focusVisibleStyle: restRing,
    ...(isWeb
      ? {
          onFocus: () => {
            if (wasKeyboardFocus()) {
              setKbFocus(id);
            }
          },
          onBlur: () => {
            setKbFocus((prev) => (prev === id ? null : prev));
          },
        }
      : undefined),
    ...(kbFocus === id ? FOCUS_VISIBLE_RING : restRing),
  });

  const isSimple = variant === 'simple';
  const isNumbered = variant === 'numbered';
  const isPageNavigation = isNumbered || isSimple;

  // The two idioms differ in which glyphs the controls take, whether the
  // control is circular, and whether the last step submits — not in structure.
  const canPrev = !disabled && index > 0;
  const canNext = isPageNavigation
    ? !disabled && currentPage < total
    : // dots/bars: an onSubmit makes the last step actionable, so the forward
      // control is not dead there.
      !(disabled || (!isLastStep && index >= total - 1 && !onSubmit));
  const submits = !isPageNavigation && isLastStep;

  const items = isNumbered ? getPaginationItems(total, currentPage, siblingCount, boundaryCount) : [];

  // Bidi-isolate the whole formatted range so an RTL paragraph can't
  // reorder the latin/numeric runs ("1–5 of 5" ⇏ "of 5 5–1").
  const summary =
    isNumbered && showSummary && totalItems != null && pageSize != null
      ? bidiIsolate(
          totalItems === 0
            ? t('0 of 0')
            : withInterp(t('{{start}}–{{end}} of {{total}}'), {
                start: (currentPage - 1) * pageSize + 1,
                end: Math.min(currentPage * pageSize, totalItems),
                total: totalItems,
              }),
        )
      : undefined;

  // Resolved: `bars` names the progress-TICK idiom (no completion
  // badge), never a geometry. The pager pins the large step for it — that pin,
  // and nothing about the name, is why this strip is chunkier than a bare
  // `<DotIndicator variant="bars">`.
  const step = variant === 'bars' ? stripSteps.large : stripSteps.base;

  return (
    <XStack
      alignItems="center"
      justifyContent="center"
      role="navigation"
      aria-label={t('Pagination')}
      data-animation={motionTransition ?? 'none'}
      data-pad="panel"
      {...knobProps.panelPadding}
      {...knobProps.gap}
      {...(isSimple ? { paddingHorizontal: 0, minWidth: 0, flexShrink: 1 } : undefined)}
      {...stackProps}>
      {isNumbered && showFirstLast && (
        <Button
          size={knobProps.sizeToken}
          chromeless
          icon={FirstIcon}
          onPress={() => {
            goTo(0);
          }}
          disabled={!canPrev}
          aria-label={t('Go to first page')}
          onKeyDown={activateOnEnterSpace(() => {
            goTo(0);
          }, canPrev)}
          {...pageControlProps('first')}
        />
      )}

      <Button
        size={knobProps.sizeToken}
        circular={!isPageNavigation}
        chromeless
        icon={isPageNavigation ? PrevIcon : PrevArrowIcon}
        onPress={handlePrev}
        disabled={!canPrev}
        // The Button's own disabled wash owns the treatment — the
        // legacy opacity 0.3 dim stacked on top of it (double-dim).
        aria-label={isPageNavigation ? t('Go to previous page') : t('Previous page')}
        onKeyDown={activateOnEnterSpace(handlePrev, canPrev)}
        {...pageControlProps('prev')}
      />

      {isSimple ? (
        <Text
          {...knobProps.body}
          color={componentColors.text.primary}
          aria-live="polite"
          userSelect="none"
          numberOfLines={1}
          flexShrink={1}
          minWidth={0}>
          {bidiIsolate(withInterp(t('{{page}} of {{total}}'), { page: currentPage, total }))}
        </Text>
      ) : isNumbered ? (
        <XStack alignItems="center" {...knobProps.gap}>
          {items.map((item) => {
            if (typeof item !== 'number') {
              return (
                <Text
                  key={item}
                  aria-hidden
                  userSelect="none"
                  textAlign="center"
                  minWidth="$2"
                  minHeight={pageControlFloor.minHeight}
                  {...knobProps.body}
                  color={knobProps.textAccentColor}>
                  …
                </Text>
              );
            }
            const isCurrent = item === currentPage;
            return (
              <Button
                key={item}
                size={knobProps.sizeToken}
                accent={isCurrent}
                chromeless={!isCurrent}
                disabled={disabled}
                onPress={() => {
                  goTo(item - 1);
                }}
                aria-label={withInterp(t('Page {{number}}'), { number: item })}
                aria-current={isCurrent ? 'page' : undefined}
                onKeyDown={activateOnEnterSpace(() => {
                  goTo(item - 1);
                }, !disabled)}
                {...pageControlProps(`page-${item}`)}>
                {String(item)}
              </Button>
            );
          })}
        </XStack>
      ) : (
        // The dot strip IS `DotIndicator` — this component owns the
        // pager frame around it, not a second strip. `completedSteps`, the
        // wizard a11y idiom and the rail all ride the primitive, so the two
        // strips in the catalog cannot drift apart again.
        <DotIndicator
          total={total}
          activeIndex={index}
          variant={variant}
          idiom="step"
          rail
          completedSteps={completedSteps}
          dotSize={step.mark}
          activeDotSize={step.active}
          transition={motionTransition}
          dotStateAttribute="data-pagination-dot"
          onChange={allowJumpTo && !disabled ? goTo : undefined}
          // A strip nobody can press has no disabled state — only a jumpable
          // one is "interactive but blocked".
          disabled={allowJumpTo && disabled}
        />
      )}

      <Button
        size={knobProps.sizeToken}
        circular={!isPageNavigation}
        chromeless={!submits}
        theme={submits ? 'active' : undefined}
        icon={isPageNavigation ? NextIcon : submits ? CheckIcon : NextArrowIcon}
        onPress={handleNext}
        disabled={!canNext}
        aria-label={isPageNavigation ? t('Go to next page') : submits ? t('Submit') : t('Next page')}
        onKeyDown={activateOnEnterSpace(handleNext, canNext)}
        {...pageControlProps(submits ? 'submit' : 'next')}
      />

      {isNumbered && showFirstLast && (
        <Button
          size={knobProps.sizeToken}
          chromeless
          icon={LastIcon}
          onPress={() => {
            goTo(total - 1);
          }}
          disabled={!canNext}
          aria-label={t('Go to last page')}
          onKeyDown={activateOnEnterSpace(() => {
            goTo(total - 1);
          }, canNext)}
          {...pageControlProps('last')}
        />
      )}

      {summary && (
        <Text {...knobProps.body} color={knobProps.textAccentColor} aria-live="polite" userSelect="none">
          {summary}
        </Text>
      )}
    </XStack>
  );
}

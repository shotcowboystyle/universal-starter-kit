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
import type { KnobProps } from '@repo/theme';
import type React from 'react';
import { useCallback, useState } from 'react';
import { Text, XStack, isWeb } from 'tamagui';
import type { XStackProps } from 'tamagui';

import { componentColors } from './component-colors';
import { DotIndicator } from './DotIndicator';
import { useDirection } from './hooks/use-direction';
import { getPaginationItems, isEllipsis } from './pagination-items';
import { useTranslation } from './shared/i18n';
import { bidiIsolate, withInterp } from './shared/t';

export type { PaginationItem } from './pagination-items';
export { getPaginationItems } from './pagination-items';

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

type StepVariant = 'dots' | 'bars';
type PageVariant = 'numbered' | 'simple';

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
  variant?: StepVariant | PageVariant;
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

type TranslateFn = ReturnType<typeof useTranslation>['t'];
type IconComponent = typeof CaretLeftIcon;

const isTransitionName = (value: unknown): value is string => typeof value === 'string';

const activateOnEnterSpace = (fn: () => void, enabled: boolean) => (e?: React.KeyboardEvent) => {
  if (e?.key === 'Enter' || e?.key === ' ') {
    e.preventDefault();
    if (enabled) {
      fn();
    }
  }
};

/**
 * Directional glyphs encode direction-of-travel (Axiom 15), so they must
 * point toward their targets in RTL too. Mechanism: swap the paired glyph
 * (CaretLeft ⇄ CaretRight) keyed on useDirection() — pixel-exact for the
 * symmetric caret/arrow pairs and portable to native, unlike a scaleX(-1)
 * transform. The checkmark is direction-neutral and never mirrors.
 */
const useDirectionalIcons = () => {
  const isRTL = useDirection() === 'rtl';
  return {
    PrevIcon: isRTL ? CaretRightIcon : CaretLeftIcon,
    NextIcon: isRTL ? CaretLeftIcon : CaretRightIcon,
    FirstIcon: isRTL ? CaretDoubleRightIcon : CaretDoubleLeftIcon,
    LastIcon: isRTL ? CaretDoubleLeftIcon : CaretDoubleRightIcon,
    PrevArrowIcon: isRTL ? ArrowRightIcon : ArrowLeftIcon,
    NextArrowIcon: isRTL ? ArrowLeftIcon : ArrowRightIcon,
  };
};

/**
 * Ring rides the focused page control only, keyboard-origin, never
 * mouse. Selected is fill, not this outline channel.
 */
const usePageControlProps = () => {
  const [kbFocus, setKbFocus] = useState<string | null>(null);
  return (id: string) => ({
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
};

type PageControlProps = ReturnType<typeof usePageControlProps>;

/** Controlled via `page` (1-based) or `activeIndex` (0-based); uncontrolled otherwise. */
const usePaginationState = ({
  total,
  activeIndex,
  page,
  defaultPage,
  onChange,
  onPageChange,
  isLastStep,
  onSubmit,
}: Pick<
  PaginationProps,
  'total' | 'activeIndex' | 'page' | 'defaultPage' | 'onChange' | 'onPageChange' | 'onSubmit'
> & {
  isLastStep: boolean;
}) => {
  const [uncontrolledPage, setUncontrolledPage] = useState(defaultPage ?? 1);
  const controlledIndex = page == null ? activeIndex : page - 1;
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

  return { index, currentPage, goTo, handlePrev, handleNext };
};

/**
 * The two idioms differ in which glyphs the controls take, whether the
 * control is circular, and whether the last step submits — not in structure.
 */
const getPagerState = ({
  variant,
  disabled,
  isLastStep,
  hasSubmit,
  index,
  currentPage,
  total,
}: {
  variant: PaginationProps['variant'];
  disabled: boolean;
  isLastStep: boolean;
  hasSubmit: boolean;
  index: number;
  currentPage: number;
  total: number;
}) => {
  const isSimple = variant === 'simple';
  const isNumbered = variant === 'numbered';
  const isPageNavigation = isNumbered || isSimple;
  const canPrev = !disabled && index > 0;
  // dots/bars: an onSubmit makes the last step actionable, so the forward
  // control is not dead there.
  const canAdvanceSteps = !(disabled || (!isLastStep && index >= total - 1 && !hasSubmit));
  const canNext = isPageNavigation ? !disabled && currentPage < total : canAdvanceSteps;
  return { isSimple, isNumbered, isPageNavigation, canPrev, canNext, submits: !isPageNavigation && isLastStep };
};

/**
 * Bidi-isolate the whole formatted range so an RTL paragraph can't
 * reorder the latin/numeric runs ("1–5 of 5" ⇏ "of 5 5–1").
 */
const formatSummary = (
  t: TranslateFn,
  currentPage: number,
  totalItems: number | undefined,
  pageSize: number | undefined,
) => {
  if (totalItems == null || pageSize == null) {
    return null;
  }
  if (totalItems === 0) {
    return bidiIsolate(t('0 of 0'));
  }
  return bidiIsolate(
    withInterp(t('{{start}}–{{end}} of {{total}}'), {
      start: (currentPage - 1) * pageSize + 1,
      end: Math.min(currentPage * pageSize, totalItems),
      total: totalItems,
    }),
  );
};

const PagerButton = ({
  id,
  label,
  icon,
  onPress,
  enabled,
  knobProps,
  pageControlProps,
  circular = false,
  submits = false,
}: {
  id: string;
  label: string;
  icon: IconComponent;
  onPress: () => void;
  enabled: boolean;
  knobProps: KnobProps;
  pageControlProps: PageControlProps;
  circular?: boolean;
  submits?: boolean;
}) => (
  <Button
    size={knobProps.sizeToken}
    circular={circular}
    chromeless={!submits}
    theme={submits ? 'active' : undefined}
    icon={icon}
    onPress={onPress}
    disabled={!enabled}
    aria-label={label}
    onKeyDown={activateOnEnterSpace(onPress, enabled)}
    {...pageControlProps(id)}
  />
);

const NumberedPages = ({
  total,
  currentPage,
  siblingCount,
  boundaryCount,
  disabled,
  goTo,
  knobProps,
  pageControlProps,
}: {
  total: number;
  currentPage: number;
  siblingCount: number;
  boundaryCount: number;
  disabled: boolean;
  goTo: (index: number) => void;
  knobProps: KnobProps;
  pageControlProps: PageControlProps;
}) => {
  const { t } = useTranslation();
  const items = getPaginationItems(total, currentPage, siblingCount, boundaryCount);
  return (
    <XStack
      alignItems="center"
      {...knobProps.gap}>
      {items.map((item) => {
        if (isEllipsis(item)) {
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
  );
};

const PaginationMiddle = ({
  variant,
  total,
  index,
  currentPage,
  disabled,
  allowJumpTo,
  completedSteps,
  siblingCount,
  boundaryCount,
  goTo,
  knobProps,
  motionTransition,
  pageControlProps,
}: {
  variant: NonNullable<PaginationProps['variant']>;
  total: number;
  index: number;
  currentPage: number;
  disabled: boolean;
  allowJumpTo: boolean;
  completedSteps: PaginationProps['completedSteps'];
  siblingCount: number;
  boundaryCount: number;
  goTo: (index: number) => void;
  knobProps: KnobProps;
  motionTransition: string | undefined;
  pageControlProps: PageControlProps;
}) => {
  const { t } = useTranslation();
  if (variant === 'simple') {
    return (
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
    );
  }
  if (variant === 'numbered') {
    return (
      <NumberedPages
        total={total}
        currentPage={currentPage}
        siblingCount={siblingCount}
        boundaryCount={boundaryCount}
        disabled={disabled}
        goTo={goTo}
        knobProps={knobProps}
        pageControlProps={pageControlProps}
      />
    );
  }
  // Resolved: `bars` names the progress-TICK idiom (no completion
  // badge), never a geometry. The pager pins the large step for it — that pin,
  // and nothing about the name, is why this strip is chunkier than a bare
  // `<DotIndicator variant="bars">`.
  const step = variant === 'bars' ? stripSteps.large : stripSteps.base;
  // The dot strip IS `DotIndicator` — this component owns the
  // pager frame around it, not a second strip. `completedSteps`, the
  // wizard a11y idiom and the rail all ride the primitive, so the two
  // strips in the catalog cannot drift apart again.
  return (
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
  );
};

const pickNextIcon = (isPageNavigation: boolean, submits: boolean, icons: ReturnType<typeof useDirectionalIcons>) => {
  if (isPageNavigation) {
    return icons.NextIcon;
  }
  return submits ? CheckIcon : icons.NextArrowIcon;
};

const PaginationSummary = ({
  show,
  currentPage,
  totalItems,
  pageSize,
  knobProps,
}: {
  show: boolean;
  currentPage: number;
  totalItems: number | undefined;
  pageSize: number | undefined;
  knobProps: KnobProps;
}) => {
  const { t } = useTranslation();
  const summary = show ? formatSummary(t, currentPage, totalItems, pageSize) : null;
  if (summary === null || summary === '') {
    return null;
  }
  return (
    <Text
      {...knobProps.body}
      color={knobProps.textAccentColor}
      aria-live="polite"
      userSelect="none">
      {summary}
    </Text>
  );
};

const nextLabel = (isPageNavigation: boolean, submits: boolean, t: TranslateFn) => {
  if (isPageNavigation) {
    return t('Go to next page');
  }
  return submits ? t('Submit') : t('Next page');
};

export const Pagination = ({
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
}: PaginationProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  // Undefined at animation "none" / PRM — a `|| "quick"` fallback
  // re-enables the tween and is the violation. DotIndicator also drops
  // host transition when the knob is off.
  const motionTransition = isTransitionName(knobProps.transition) ? knobProps.transition : undefined;
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const pageControlProps = usePageControlProps();
  const { index, currentPage, goTo, handlePrev, handleNext } = usePaginationState({
    total,
    activeIndex,
    page,
    defaultPage,
    onChange,
    onPageChange,
    isLastStep,
    onSubmit,
  });
  const { isSimple, isNumbered, isPageNavigation, canPrev, canNext, submits } = getPagerState({
    variant,
    disabled,
    isLastStep,
    hasSubmit: onSubmit != null,
    index,
    currentPage,
    total,
  });
  const showEnds = isNumbered && showFirstLast;
  const icons = useDirectionalIcons();
  const nextIcon = pickNextIcon(isPageNavigation, submits, icons);
  const prevIcon = isPageNavigation ? icons.PrevIcon : icons.PrevArrowIcon;

  return (
    <XStack
      alignItems="center"
      justifyContent="center"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack is not a <nav>; role carries the landmark on web and native
      role="navigation"
      aria-label={t('Pagination')}
      data-animation={motionTransition ?? 'none'}
      data-pad="panel"
      {...knobProps.panelPadding}
      {...knobProps.gap}
      {...(isSimple ? { paddingHorizontal: 0, minWidth: 0, flexShrink: 1 } : undefined)}
      {...stackProps}>
      {showEnds && (
        <PagerButton
          id="first"
          label={t('Go to first page')}
          icon={icons.FirstIcon}
          onPress={() => {
            goTo(0);
          }}
          enabled={canPrev}
          knobProps={knobProps}
          pageControlProps={pageControlProps}
        />
      )}

      <PagerButton
        id="prev"
        // The Button's own disabled wash owns the treatment — the
        // legacy opacity 0.3 dim stacked on top of it (double-dim).
        label={isPageNavigation ? t('Go to previous page') : t('Previous page')}
        icon={prevIcon}
        onPress={handlePrev}
        enabled={canPrev}
        circular={!isPageNavigation}
        knobProps={knobProps}
        pageControlProps={pageControlProps}
      />

      <PaginationMiddle
        variant={variant}
        total={total}
        index={index}
        currentPage={currentPage}
        disabled={disabled}
        allowJumpTo={allowJumpTo}
        completedSteps={completedSteps}
        siblingCount={siblingCount}
        boundaryCount={boundaryCount}
        goTo={goTo}
        knobProps={knobProps}
        motionTransition={motionTransition}
        pageControlProps={pageControlProps}
      />

      <PagerButton
        id={submits ? 'submit' : 'next'}
        label={nextLabel(isPageNavigation, submits, t)}
        icon={nextIcon}
        onPress={handleNext}
        enabled={canNext}
        circular={!isPageNavigation}
        submits={submits}
        knobProps={knobProps}
        pageControlProps={pageControlProps}
      />

      {showEnds && (
        <PagerButton
          id="last"
          label={t('Go to last page')}
          icon={icons.LastIcon}
          onPress={() => {
            goTo(total - 1);
          }}
          enabled={canNext}
          knobProps={knobProps}
          pageControlProps={pageControlProps}
        />
      )}

      <PaginationSummary
        show={isNumbered && showSummary}
        currentPage={currentPage}
        totalItems={totalItems}
        pageSize={pageSize}
        knobProps={knobProps}
      />
    </XStack>
  );
};

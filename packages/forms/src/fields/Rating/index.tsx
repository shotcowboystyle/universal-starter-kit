import { StarIcon as DefaultStarIcon } from '@phosphor-icons/react';
import type { KnobProps } from '@repo/theme';
import {
  ensureKeyboardModalityTracking,
  FOCUS_RING_HALO_OFFSET,
  keyboardFocusRingProps,
  MIN_PRESS_TARGET,
  pressTargetHitSlop,
  pressTargetStyle,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import type { ComponentProps, ComponentType, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
// Named import (not default) — same interop hazard as fields/Signature.
import { Path, Svg } from 'react-native-svg';
import type { LabelProps, SizeTokens, TamaguiElement, TransitionProp } from 'tamagui';
import { getVariable, getVariableValue, isWeb, SizableText, styled, useTheme, View, XStack } from 'tamagui';

import { Field, FieldLayout, useFieldA11y, useFieldDescribedBy } from '../../FieldLayout';
import type { FieldLayoutProps } from '../../FieldLayout';
import { formControlColors, formSelectedColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/table-cell-context';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import type { FieldValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

import { filledCount } from './rating-math';
import { StarInk } from './StarInk';

export { filledCount } from './rating-math';

/** Visual glyph follows the size token (Material small/medium/large). Floor 16. */
const starGlyphSize = (sizeToken: SizeTokens | undefined): number => {
  const control = Number(getVariableValue(getSize(sizeToken ?? '$4')));
  if (!Number.isFinite(control) || control <= 0) {
    return 24;
  }
  return Math.max(16, Math.round(control * 0.55));
};

const starPath = (size: number, innerRatio = 0.382): string => {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 1;
  const innerR = outerR * innerRatio;
  const parts: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const outerA = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const innerA = outerA + Math.PI / 5;
    parts.push(
      `${cx + outerR * Math.cos(outerA)},${cy + outerR * Math.sin(outerA)}`,
      `${cx + innerR * Math.cos(innerA)},${cy + innerR * Math.sin(innerA)}`,
    );
  }
  return `M${parts.join('L')}Z`;
};

const PointyStar = ({ size, weight, color }: { size: number; weight: 'fill' | 'regular'; color: string }) => {
  const d = starPath(size);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}>
      <Path
        d={d}
        // `transparent` rather than `none`: an empty->filled star has to
        // interpolate its fill, and `none` is not a color so it can
        // only jump. Paints identically.
        fill={weight === 'fill' ? color : 'transparent'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="miter"
        strokeMiterlimit={10}
      />
    </Svg>
  );
};

// CSS timing strings for web transitions (mirrors theme animation config)
const cssTimings = {
  bouncy: 'ease-in 200ms',
  lazy: 'ease-in 600ms',
  slow: 'ease-in 500ms',
  medium: 'ease-in-out 250ms',
  quick: 'ease-in 100ms',
  tooltip: 'ease-in 400ms',
  snappy: 'ease-out 80ms',
  gentle: 'ease-in-out 450ms',
} as const satisfies Record<string, string>;

/** Unknown or non-token transitions fall back to the `quick` timing. */
const inkTokenFor = (transition: TransitionProp): string =>
  Object.keys(cssTimings).find((name) => name === transition) ?? 'quick';

const timingFor = (transition: TransitionProp): string =>
  Object.entries(cssTimings).find(([name]) => name === transition)?.[1] ?? cssTimings.quick;

/** Discrete fill jumps tween; omit when animation knob is none or scrubbing. */
const getTransitionStyle = (transition: TransitionProp | undefined, live: boolean) => {
  const timing = isWeb && !live && transition != null ? timingFor(transition) : undefined;
  return timing === undefined
    ? undefined
    : { transition: [`transform ${timing}`, `opacity ${timing}`, `color ${timing}`].join(', ') };
};

// Star ink: the visible change is the SVG `fill`/`stroke` of the glyph
// CHILD, and `transition` does not inherit — a declaration on the wrapper can
// never reach it, while the swappable `starIcon` contract ({ size, weight,
// color }) has no style passthrough to declare it on. A one-shot descendant
// stylesheet (Spinner/Wheel pattern) arms the tween on whatever glyph the
// contract renders, so the contract itself stays untouched.
//
// Native has no cascade, and the SVG paint prop is not a style key the RN
// driver animates either, so it solves the same problem by cross-fading a
// layer stack it owns — see `StarInk.native.tsx`.
const INK_STYLE_ID = 'mp1-rating-ink';
const inkClassName = (token: string) => `mp1-rating-ink-${token}`;
const ensureRatingInkStyles = () => {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  if (document.querySelector(`#${INK_STYLE_ID}`)) {
    return;
  }
  const style = document.createElement('style');
  style.id = INK_STYLE_ID;
  // Shape elements only, never the <svg> root: a Phosphor-shaped glyph paints
  // the root's `fill` and the shape INHERITS it, so arming both would leave
  // the shape chasing an already-animating value and stretch the tween well
  // past the token.
  style.textContent = Object.entries(cssTimings)
    .map(([token, timing]) => `.${inkClassName(token)} svg * { transition: fill ${timing}, stroke ${timing}; }`)
    .join('\n');
  document.head.append(style);
};

const StarWrapper = styled(View, {
  alignItems: 'center',
  justifyContent: 'center',
  outlineWidth: 0,
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { outlineWidth: 0 },
  variants: {
    // Material iconActive: only the hovered/focused star scales — never a
    // spin on every filled star.
    active: {
      true: { scale: 1.12 },
      false: { scale: 1 },
    },
  } as const,
});

const isActivationKey = (event: Pick<KeyboardEvent, 'key' | 'code'>): boolean =>
  event.key === 'Enter' || event.key === ' ' || event.code === 'Space';

/** Roving-radio target star for a navigation key, or undefined for any other key. */
const starKeyTarget = (key: string, starNumber: number, maxStars: number): number | undefined => {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp': {
      return Math.min(starNumber + 1, maxStars);
    }
    case 'ArrowLeft':
    case 'ArrowDown': {
      return Math.max(starNumber - 1, 1);
    }
    case 'Home': {
      return 1;
    }
    case 'End': {
      return maxStars;
    }
    default: {
      return undefined;
    }
  }
};

/** Star (1-based) under a pointer x-position along the row, or null off the row. */
const starFromPointer = (clientX: number, row: HTMLElement, maxStars: number): number | null => {
  const stars = [...row.querySelectorAll('[data-rating-star]')];
  const first = stars.at(0)?.getBoundingClientRect();
  const last = stars.at(-1)?.getBoundingClientRect();
  if (first === undefined || last === undefined) {
    return null;
  }
  const width = last.right - first.left;
  if (width <= 0) {
    return null;
  }
  const ratio = Math.min(1, Math.max(0, (clientX - first.left) / width));
  return Math.max(1, Math.ceil(ratio * maxStars));
};

const starNumbersFor = (count: number): number[] => Array.from({ length: count }, (_, i) => i + 1);

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

type ThemeColorLookup = Record<string, { get: (platform: 'web') => string | undefined } | undefined>;

const resolveThemeColor = (theme: ThemeColorLookup, token: string): string =>
  String(
    getVariable(theme[token]?.get('web') ?? theme.color10?.get('web') ?? theme.color?.get('web')) ?? 'currentColor',
  );

const ReadOnlyStar = ({
  starNumber,
  starSize,
  isFilled,
  children,
}: {
  starNumber: number;
  starSize: number;
  isFilled: boolean;
  children: ReactNode;
}) => (
  <View
    width={starSize}
    height={starSize}
    data-rating-star={isFilled ? 'filled' : 'empty'}
    data-rating-index={starNumber}>
    {children}
  </View>
);

interface InteractiveStarProps {
  starNumber: number;
  maxStars: number;
  filledStars: number;
  displayFilled: number;
  scrubbing: boolean;
  allowMotion: boolean;
  focusedStar: number | null;
  kbFocusStar: number | null;
  tabStopStar: number;
  disabled: boolean;
  disabledChrome: ReturnType<typeof useResolvedKnobs>['disabledState']['chromeKnobProps'] | undefined;
  itemRadius: number;
  growPressTarget: boolean;
  starOutset: number;
  starSize: number;
  motionTransition: TransitionProp | undefined;
  inkToken: string | undefined;
  glyph: ReactNode;
  registerStar: (starNumber: number, node: TamaguiElement | null) => void;
  onPress: (starNumber: number) => void;
  onStarFocus: (starNumber: number) => void;
  onStarBlur: (starNumber: number) => void;
  onStarKeyDown: (event: KeyboardEvent, starNumber: number) => void;
}

const InteractiveStar = ({
  starNumber,
  maxStars,
  filledStars,
  displayFilled,
  scrubbing,
  allowMotion,
  focusedStar,
  kbFocusStar,
  tabStopStar,
  disabled,
  disabledChrome,
  itemRadius,
  growPressTarget,
  starOutset,
  starSize,
  motionTransition,
  inkToken,
  glyph,
  registerStar,
  onPress,
  onStarFocus,
  onStarBlur,
  onStarKeyDown,
}: InteractiveStarProps) => {
  const isFilled = starNumber <= displayFilled;
  const isChecked = filledStars > 0 && starNumber === filledStars;
  const isActive = allowMotion && (scrubbing ? starNumber === displayFilled : starNumber === focusedStar);
  const showRing = kbFocusStar === starNumber;
  return (
    <StarWrapper
      ref={(node) => {
        registerStar(starNumber, node);
      }}
      onPress={() => {
        onPress(starNumber);
      }}
      cursor={disabled ? 'default' : 'pointer'}
      // Stars are text-free chrome — dim via the
      // recipe (read-only stays full-contrast, only pointer changes).
      {...(disabled ? disabledChrome : undefined)}
      active={isActive}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- StarWrapper is a styled View with press/ring chrome; the radiogroup wiring is aria-based by design
      role="radio"
      aria-label={t('{{star}} of {{max}} stars', { star: starNumber, max: maxStars })}
      aria-disabled={disabled || undefined}
      aria-checked={isChecked}
      borderRadius={itemRadius}
      {...(growPressTarget
        ? {
            ...pressTargetStyle(),
            marginHorizontal: -starOutset,
            marginVertical: -starOutset,
            'data-rating-grow': 'true' as const,
          }
        : {})}
      hitSlop={pressTargetHitSlop(starSize)}
      // Keyboard: roving tabindex + Enter/Space + arrows select (native
      // radio). Disabled drops out of the tab order.
      {...(isWeb && !disabled
        ? {
            tabIndex: starNumber === tabStopStar ? 0 : -1,
            onFocus: () => {
              onStarFocus(starNumber);
            },
            onBlur: () => {
              onStarBlur(starNumber);
            },
            onKeyDown: (e: KeyboardEvent) => {
              onStarKeyDown(e, starNumber);
            },
          }
        : {})}
      // RN only exposes plain Views to the a11y tree when `accessible` is set
      {...(isWeb ? {} : { accessible: true })}
      data-rating-star={isFilled ? 'filled' : 'empty'}
      data-rating-index={starNumber}
      {...(!isWeb && !scrubbing ? { transition: motionTransition } : {})}
      {...(inkToken === undefined ? undefined : { className: inkClassName(inkToken) })}
      style={getTransitionStyle(scrubbing ? undefined : motionTransition, scrubbing)}>
      <View
        borderRadius={itemRadius}
        // Halo: circular thumb (star glyph). The inset the
        // composite ring carries would paint over the star's own points;
        // the halo clears it.
        {...(showRing
          ? {
              ...keyboardFocusRingProps,
              outlineOffset: FOCUS_RING_HALO_OFFSET,
              'data-rating-ring': 'true',
            }
          : {})}>
        {glyph}
      </View>
    </StarWrapper>
  );
};

/** Roving radio-group focus: one tab stop, arrows move AND select. */
const useRovingStars = ({
  maxStars,
  readOnly,
  onStarPress,
}: {
  maxStars: number;
  readOnly: boolean | undefined;
  onStarPress: (starIndex: number) => void;
}) => {
  const starRefs = useRef<(TamaguiElement | null)[]>([]);
  const [focusedStar, setFocusedStar] = useState<number | null>(null);
  const [kbFocusStar, setKbFocusStar] = useState<number | null>(null);
  const registerStar = (starNumber: number, node: TamaguiElement | null) => {
    starRefs.current[starNumber - 1] = node;
  };
  const focusStar = (starNumber: number) => {
    starRefs.current[starNumber - 1]?.focus?.();
  };
  const commitStar = (starNumber: number) => {
    if (!readOnly) {
      onStarPress(starNumber);
    }
  };
  const handleStarFocus = (starNumber: number) => {
    setFocusedStar(starNumber);
    if (wasKeyboardFocus()) {
      setKbFocusStar(starNumber);
    }
  };
  const handleStarBlur = (starNumber: number) => {
    setFocusedStar((prev) => (prev === starNumber ? null : prev));
    setKbFocusStar((prev) => (prev === starNumber ? null : prev));
  };
  const handleStarKeyDown = (event: KeyboardEvent, starNumber: number) => {
    if (isActivationKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      commitStar(starNumber);
      return;
    }
    const next = starKeyTarget(event.key, starNumber, maxStars);
    if (next !== undefined) {
      event.preventDefault();
      focusStar(next);
      commitStar(next);
    }
  };
  return { focusedStar, kbFocusStar, registerStar, handleStarFocus, handleStarBlur, handleStarKeyDown };
};

type RowProps = ComponentProps<typeof XStack> & Record<string, string | number | boolean | undefined>;

interface RowSemanticsInput {
  readOnly: boolean | undefined;
  required: boolean | undefined;
  hasError: boolean | undefined;
  disabled: boolean;
  valueLabel: string;
  describedBy: string | undefined;
  nativeLabel: string | undefined;
  nativeHint: string | undefined;
}

/** Radiogroup (or read-only image) semantics of the row, plus native accessibility labels. */
const rowSemanticProps = ({
  readOnly,
  required,
  hasError,
  disabled,
  valueLabel,
  describedBy,
  nativeLabel,
  nativeHint,
}: RowSemanticsInput): RowProps => {
  const props: RowProps = {
    role: readOnly ? 'img' : 'radiogroup',
    'aria-label': readOnly ? valueLabel : undefined,
    'aria-required': !readOnly && required ? true : undefined,
    'aria-invalid': !readOnly && hasError ? true : undefined,
    'aria-disabled': disabled || undefined,
    'aria-readonly': readOnly ? true : undefined,
    'aria-describedby': describedBy,
  };
  if (!isWeb) {
    props.accessible = true;
    props.accessibilityLabel = nativeLabel ?? valueLabel;
    props.accessibilityHint = nativeHint;
  }
  return props;
};

/** Pointer scrub preview (web only): the fill follows the pointer until it leaves the row. */
const useStarScrub = ({ maxStars, enabled }: { maxStars: number; enabled: boolean }) => {
  const [scrubFilled, setScrubFilled] = useState<number | null>(null);
  const scrubHandlers = enabled
    ? {
        onPointerMove: (e: PointerEvent<HTMLElement>) => {
          const next = starFromPointer(e.clientX, e.currentTarget, maxStars);
          if (next === null) {
            return;
          }
          setScrubFilled(next);
        },
        onPointerLeave: () => {
          setScrubFilled(null);
        },
      }
    : {};
  return { scrubFilled, scrubHandlers };
};

const StarRow = ({
  id,
  filledStars,
  maxStars,
  disabled,
  readOnly,
  onStarPress,
  knobProps,
  StarIcon,
  filledColor,
  emptyColor,
  required,
  hasError,
  starSize,
  pointy,
  inTableCell,
}: {
  id?: string;
  filledStars: number;
  maxStars: number;
  disabled: boolean;
  readOnly?: boolean;
  onStarPress: (starIndex: number) => void;
  knobProps: KnobProps;
  StarIcon: ComponentType<{ size: number; weight: 'fill' | 'regular'; color: string }>;
  filledColor: string;
  emptyColor: string;
  required?: boolean;
  hasError?: boolean;
  starSize: number;
  pointy: boolean;
  inTableCell?: boolean;
}) => {
  const { disabledState } = useResolvedKnobs();
  const describedBy = useFieldDescribedBy();
  const fieldA11y = useFieldA11y();
  const { scrubFilled, scrubHandlers } = useStarScrub({ maxStars, enabled: isWeb && !disabled && !readOnly });
  const scrubbing = scrubFilled != null;
  const displayFilled = scrubFilled ?? filledStars;
  // Discrete star jumps tween via knob transition. During pointer
  // scrub, omit transition so fill tracks the pointer 1:1. `transition` is
  // undefined exactly at animation="none" (which prefers-reduced-motion maps
  // onto), and Axiom 3 says that position is NO motion — not a default one.
  const motionTransition = knobProps.transition;
  const live = scrubbing;
  const allowMotion = Boolean(motionTransition);
  ensureRatingInkStyles();
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const inkToken = isWeb && !live && motionTransition != null ? inkTokenFor(motionTransition) : undefined;

  // Material radio group: one tab stop, arrows move AND select. The stop
  // follows the committed value star, or the focused star while inside.
  const { focusedStar, kbFocusStar, registerStar, handleStarFocus, handleStarBlur, handleStarKeyDown } = useRovingStars(
    {
      maxStars,
      readOnly,
      onStarPress,
    },
  );
  const tabStopStar = focusedStar ?? Math.min(Math.max(filledStars, 1), Math.max(maxStars, 1));
  const starOutset = Math.max(0, (MIN_PRESS_TARGET - starSize) / 2);
  const itemRadius = pointy ? 0 : 1000;
  const growPressTarget = !inTableCell;
  const valueLabel = t('{{star}} of {{max}} stars', { star: displayFilled, max: maxStars });

  const glyph = (isFilled: boolean) => (
    <StarInk
      StarIcon={StarIcon}
      size={starSize}
      filled={isFilled}
      filledColor={filledColor}
      emptyColor={emptyColor}
      // Same gate the web ink class uses: no token while scrubbing, so
      // the fill tracks the pointer 1:1 instead of lagging.
      transition={live ? undefined : motionTransition}
    />
  );

  return (
    <XStack
      id={id}
      {...knobProps.gap}
      alignItems="center"
      {...rowSemanticProps({
        readOnly,
        required,
        hasError,
        disabled,
        valueLabel,
        describedBy,
        nativeLabel: fieldA11y?.label,
        nativeHint: fieldA11y?.description,
      })}
      data-rating-row
      data-rating-live={live ? 'true' : undefined}
      data-rating-glyph={starSize}
      data-rating-cell={inTableCell ? 'true' : undefined}
      data-rating-pointy={pointy ? 'true' : undefined}
      {...scrubHandlers}>
      {starNumbersFor(maxStars).map((starNumber) => {
        const glyphNode = glyph(starNumber <= displayFilled);
        if (readOnly) {
          return (
            <ReadOnlyStar
              key={starNumber}
              starNumber={starNumber}
              starSize={starSize}
              isFilled={starNumber <= displayFilled}>
              {glyphNode}
            </ReadOnlyStar>
          );
        }
        return (
          <InteractiveStar
            key={starNumber}
            starNumber={starNumber}
            maxStars={maxStars}
            filledStars={filledStars}
            displayFilled={displayFilled}
            scrubbing={scrubbing}
            allowMotion={allowMotion}
            focusedStar={focusedStar}
            kbFocusStar={kbFocusStar}
            tabStopStar={tabStopStar}
            disabled={disabled}
            disabledChrome={disabledState.chromeKnobProps}
            itemRadius={itemRadius}
            growPressTarget={growPressTarget}
            starOutset={starOutset}
            starSize={starSize}
            motionTransition={motionTransition}
            inkToken={inkToken}
            glyph={glyphNode}
            registerStar={registerStar}
            onPress={onStarPress}
            onStarFocus={handleStarFocus}
            onStarBlur={handleStarBlur}
            onStarKeyDown={handleStarKeyDown}
          />
        );
      })}
      {!inTableCell && maxStars > 0 ? (
        <SizableText
          {...knobProps.body}
          aria-hidden
          userSelect="none"
          data-rating-value>
          {valueLabel}
        </SizableText>
      ) : null}
    </XStack>
  );
};

export interface RatingProps {
  name?: string;
  form?: AnyFormApi;
  validators?: FieldValidators;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  size?: SizeTokens;
  id?: string;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  onBlur?: FieldLayoutProps['onBlur'];
  disabled?: boolean;
  readOnly?: boolean;
  maxStars?: number;
  /**
   * Star glyph renderer. Optional — bare use falls back to the package star
   * (Phosphor `StarIcon`, the house icon set) so the contract is usable
   * without any icon wiring (Axiom 13 ONE BODY). Pointy themes keep the
   * built-in sharp-pointed star.
   */
  starIcon?: ComponentType<{ size: number; weight: 'fill' | 'regular'; color: string }>;
  /** Force sharp-pointed stars. Defaults to `true` when the theme knob `borderRadius` is `"none"`. */
  pointy?: boolean;
  /** When true, renders a skeleton placeholder instead of the rating */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
}

export const Rating = ({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  size,
  id: idProp,
  value = 0,
  defaultValue,
  onChange,
  onBlur,
  disabled,
  readOnly,
  maxStars = 5,
  starIcon,
  pointy,
  skeleton,
  compact,
}: RatingProps) => {
  const { resolvedForm, knobProps, id } = useFormField({ form: formProp, id: idProp, compact });
  const inTableCell = useIsInTableCell();
  const resolvedPointy = pointy ?? knobProps.pointy;
  // Sane bare default: an omitted starIcon renders the package star
  // instead of an invalid element crash on rounded themes.
  const ResolvedStarIcon = resolvedPointy ? PointyStar : (starIcon ?? DefaultStarIcon);
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const sizeToken = size ?? knobProps.sizeToken;
  const starSize = starGlyphSize(sizeToken);
  const filledStars = useMemo(() => filledCount(value, maxStars), [value, maxStars]);

  // Resolve color tokens to actual CSS values for Phosphor icons.
  // The FILLED star is the selection mark, so it resolves the shared
  // accent mark token — it painted `$color10`, a muted neutral that made a
  // 3-star rating read as disabled chrome rather than as a chosen value.
  // The empty star stays neutral: it marks nothing.
  const theme = useTheme();
  const markToken = formSelectedColors.mark.slice(1);
  const emptyToken = formControlColors.boundary.slice(1);
  // SAFETY: useTheme() is a proxy keyed by theme token name whose values are Tamagui Variables exposing get().
  const themeColors = theme as ThemeColorLookup;
  const filledColor = resolveThemeColor(themeColors, markToken);
  // WCAG 1.4.11: empty stars are graphical objects. $color7 is below
  // the 3:1 boundary floor; Radio's empty ring uses the same boundary token.
  const emptyColor = resolveThemeColor(themeColors, emptyToken);

  const handleStarPress = (starIndex: number, currentFilled: number, onValueChange?: (v: number) => void) => {
    if (disabled || readOnly) {
      return;
    }
    const newFilled = starIndex === currentFilled ? 0 : starIndex;
    onValueChange?.(newFilled / maxStars);
  };

  // Render skeleton placeholder
  if (skeleton) {
    return (
      <FieldLayout
        id={id}
        label={inTableCell ? undefined : label}
        size={size}
        knobProps={knobProps}>
        <XStack
          {...knobProps.gap}
          alignItems="center">
          {starNumbersFor(maxStars).map((starNumber) => (
            <Skeleton
              key={starNumber}
              variant={resolvedPointy ? 'rounded' : 'circular'}
              width={starSize}
              height={starSize}
              borderRadius={resolvedPointy ? 0 : undefined}
            />
          ))}
        </XStack>
      </FieldLayout>
    );
  }

  if (resolvedForm === undefined || name === undefined || name === '') {
    return (
      <FieldLayout
        id={id}
        label={inTableCell ? undefined : label}
        labelProps={labelProps}
        error={error}
        helperText={inTableCell ? undefined : helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        <StarRow
          id={id}
          knobProps={knobProps}
          filledStars={filledStars}
          maxStars={maxStars}
          disabled={!!disabled}
          readOnly={readOnly}
          onStarPress={(i) => {
            handleStarPress(i, filledStars, onChange);
          }}
          StarIcon={ResolvedStarIcon}
          filledColor={filledColor}
          emptyColor={emptyColor}
          required={required}
          hasError={hasErrorValue(error)}
          starSize={starSize}
          pointy={resolvedPointy}
          inTableCell={inTableCell}
        />
      </FieldLayout>
    );
  }

  return (
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        const fieldValue = field.state.value ?? 0;
        const fieldFilledStars = filledCount(fieldValue, maxStars);
        return (
          <FieldLayout
            id={id}
            label={inTableCell ? undefined : label}
            labelProps={labelProps}
            error={resolvedError}
            helperText={inTableCell ? undefined : helperText}
            required={required}
            size={size}
            knobProps={knobProps}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}>
            <StarRow
              id={id}
              knobProps={knobProps}
              filledStars={fieldFilledStars}
              maxStars={maxStars}
              disabled={!!disabled}
              readOnly={readOnly}
              onStarPress={(i) => {
                handleStarPress(i, fieldFilledStars, (v) => {
                  field.handleChange(v);
                  onChange?.(v);
                });
              }}
              StarIcon={ResolvedStarIcon}
              filledColor={filledColor}
              emptyColor={emptyColor}
              required={required}
              hasError={hasErrorValue(resolvedError)}
              starSize={starSize}
              pointy={resolvedPointy}
              inTableCell={inTableCell}
            />
          </FieldLayout>
        );
      }}
    </Field>
  );
};

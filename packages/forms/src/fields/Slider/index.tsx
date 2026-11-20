import {
  useTouchSurface,
  isTouchSurface,
  animationConfig,
  borderRadiusMap,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  FOCUS_RING_HALO_OFFSET,
  resolveRadiusClass,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import type { BorderRadius } from '@repo/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps, Dispatch, KeyboardEvent, ReactNode, RefObject, SetStateAction } from 'react';
import { Slider as TamaguiSlider, Paragraph, View, XStack, isWeb, styled, useTheme } from 'tamagui';
import type { LabelProps, SizeTokens, SliderProps as TamaguiSliderProps } from 'tamagui';

import { Field, FieldLayout, useFieldA11y, useFieldDescribedBy } from '../../FieldLayout';
import { formCommonColors, formControlColors, formSelectedColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import {
  getElevationWrapperProps,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';
import { hasElevationProp, isNumber, isString, themeTokenValue } from '../field-helpers';

import {
  getNextSortedValues,
  getSliderThumbRenderSize,
  hasMinStepsBetween,
  snapSliderValue,
  useSliderJumpMotion,
} from './jump-motion';
import type { SliderJumpMotion } from './jump-motion';

/**
 * Visual rail height. Spectrum ~3px, Apple ~4pt; Material's 16dp track is a
 * density class of its own. House skeleton already paints 6px — match it so
 * loading and loaded share one rail.
 */
const TRACK_HEIGHT = 6;

type AnyHandler = NonNullable<ComponentProps<typeof FieldLayout>['onBlur']>;

const radiusStopFromToken = (token: number | string): BorderRadius => {
  if (token === 0 || token === '$0') {
    return 'none';
  }
  // SAFETY: borderRadiusMap is keyed exactly by the BorderRadius stops.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys widens the stop keys to string
  for (const stop of Object.keys(borderRadiusMap) as BorderRadius[]) {
    if (borderRadiusMap[stop] === token) {
      return stop;
    }
  }
  throw new Error(`Slider: "${String(token)}" is not a radius token in borderRadiusMap`);
};

// Track styling helper - returns props to pass to TamaguiSlider.Track
const getTrackProps = (borderRadius: number, outlined = false) => ({
  unstyled: false,
  height: TRACK_HEIGHT,
  width: '100%',
  alignSelf: 'center' as const,
  backgroundColor: outlined ? 'transparent' : formControlColors.background,
  borderWidth: outlined ? 1 : 0,
  borderColor: outlined ? formControlColors.border : undefined,
  borderRadius,
  // Inline so the BINARY px is the painted radius happy-dom can measure
  // (Tamagui's atomic class does not cascade in the test environment).
  style: { borderRadius },
  'data-slider-part': 'rail' as const,
});

/** Single source for the thumb size: styled default + native jump-delta math. */
const THUMB_SIZE_TOKEN = '$1.5';
const THUMB_RENDER_SIZE = getSliderThumbRenderSize(THUMB_SIZE_TOKEN, undefined, !isWeb && isTouchSurface());

const SliderThumbFrame = styled(TamaguiSlider.Thumb, {
  size: THUMB_SIZE_TOKEN,
  width: THUMB_RENDER_SIZE,
  height: THUMB_RENDER_SIZE,
  // Solid thumb: the thumb is a solid physical handle lifted off the
  // track by a subtle drop shadow (same values as the Switch thumb) — never a
  // border. Tamagui's Thumb defaults `borderWidth: 2`; pin 0 here AND on the
  // instance so the inverse SliderThumb sub-theme cannot restore a ring.
  borderWidth: 0,
  borderColor: 'transparent',
  ...(isWeb
    ? {
        cursor: 'grab',
        boxShadow: '0 1px 2px rgba(0,0,0,0.18), 0 0 1px rgba(0,0,0,0.12)',
      }
    : {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 2,
      }),
});

const formatSliderOutput = (values: number[], step: number): string => {
  const decimals = (String(step).split('.')[1] || '').length;
  const fmt = (n: number) => (decimals ? n.toFixed(decimals) : String(n));
  if (values.length <= 1) {
    return fmt(values[0] ?? 0);
  }
  return `${fmt(values[0] ?? 0)}–${fmt(values.at(-1) ?? 0)}`;
};

const JUMP_KEYS = new Set(['Home', 'End', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Clear jump-tween shortly after the transition window so later layout does not re-tween. */
const JUMP_MOTION_MS = 180;

/** VoiceOver adjustable actions (native): swipe up/down steps the value. */
const A11Y_ADJUSTABLE_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

const valuesEqual = (a: number[] | undefined, b: number[] | undefined) => {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((v, i) => v === b[i]);
};

export interface SliderProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Parameters<typeof useResolvedValidators>[1];
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  value?: number[];
  defaultValue?: number[];
  /**
   * Canonical change handler, consistent with the rest of the field family.
   * Prefer this over `onValueChange`.
   */
  onChange?: (value: number[]) => void;
  /** @deprecated Use `onChange` instead. Kept as an alias for the tamagui name. */
  onValueChange?: (value: number[]) => void;
  onBlur?: AnyHandler;
  min?: number;
  max?: number;
  step?: number;
  sliderProps?: Omit<TamaguiSliderProps, 'value' | 'defaultValue' | 'id' | 'onValueChange' | 'children'>;
  /** When true, renders a skeleton placeholder instead of the slider */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
  'aria-label'?: string;
}

interface SliderControlProps {
  id: string;
  sliderValue: number[];
  /**
   * True when `sliderValue` is a live upstream value (controlled `value` prop
   * or TanStack field state): tamagui then runs controlled so a value arriving
   * AFTER mount still moves the thumb. False keeps the mount-only
   * `defaultValue` for genuinely uncontrolled standalone use.
   */
  controlled?: boolean;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  hasError?: boolean;
  hasLabel?: boolean;
  /** Plain-text field label, used to build per-thumb accessible names. */
  labelText?: string;
  'aria-label'?: string;
  size?: SizeTokens;
  sizeToken: SizeTokens;
  outlined?: boolean;
  borderRadius: number | string;
  transitionToken: string;
  elevationWrapperProps: ReturnType<typeof getElevationWrapperProps>;
  sliderProps?: SliderProps['sliderProps'];
  onChangeValues?: (values: number[]) => void;
  onBlur?: AnyHandler;
}

/** Per-thumb label for a range ("Minimum", "Maximum", "Value 2") — a single thumb has none. */
const rangePositionLabel = (thumbIndex: number, count: number): string => {
  if (thumbIndex === 0) {
    return t('Minimum');
  }
  if (thumbIndex === count - 1) {
    return t('Maximum');
  }
  return t('Value {{number}}', { number: thumbIndex + 1 });
};

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

/** An error prop is set when it is a non-empty message or `true`. */
const isErrorValue = (value: string | boolean | undefined): boolean =>
  value !== undefined && value !== false && value !== '';

/**
 * Per-thumb accessible names (values are announced via the aria-valuenow the
 * thumb already carries). Range sliders name each thumb "Minimum"/"Maximum"
 * (prefixed with the field label context) — a labelledby pointing at the shared
 * field label would make all thumbs announce identically, so it is dropped when
 * a per-thumb label exists (aria-labelledby otherwise wins name computation).
 */
const thumbAccessibleLabel = ({
  thumbIndex,
  count,
  ariaLabel,
  labelText,
  hasLabel,
}: {
  thumbIndex: number;
  count: number;
  ariaLabel?: string;
  labelText?: string;
  hasLabel: boolean;
}): string | undefined => {
  if (count > 1) {
    const labelContext = ariaLabel ?? labelText;
    const position = rangePositionLabel(thumbIndex, count);
    return hasText(labelContext) ? `${labelContext} ${position}` : position;
  }
  return ariaLabel ?? labelText ?? (hasLabel ? undefined : t('Slider'));
};

/**
 * Native mirror of the web aria wiring: an "adjustable" element per thumb with
 * the accessible name (id-based aria-labelledby has no native equivalent, so the
 * label string comes from the field a11y context), current value, helper/error
 * hint, and step actions.
 */
const nativeThumbA11yProps = ({
  label,
  hint,
  min,
  max,
  now,
  disabled,
  onAdjust,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  now: number;
  disabled?: boolean;
  onAdjust: (direction: 1 | -1) => void;
}) =>
  isWeb
    ? undefined
    : {
        accessible: true,
        // Tamagui's Thumb sets role="slider" (web semantics); on this
        // RN version it shadows accessibilityRole without mapping to
        // the iOS adjustable trait — clear it so the trait applies.
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an explicit undefined clears the thumb's web role so the adjustable trait applies
        role: undefined,
        accessibilityRole: 'adjustable' as const,
        accessibilityLabel: label,
        accessibilityHint: hint,
        accessibilityValue: {
          min,
          max,
          now,
          text: String(now),
        },
        accessibilityState: { disabled: disabled === true },
        accessibilityActions: A11Y_ADJUSTABLE_ACTIONS,
        onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
          if (event.nativeEvent.actionName === 'increment') {
            onAdjust(1);
          } else if (event.nativeEvent.actionName === 'decrement') {
            onAdjust(-1);
          }
        },
      };

/** Ring, fill and keyboard-focus paint shared by every thumb. */
const buildThumbRingProps = ({
  thumbFill,
  thumbIndex,
  kbThumb,
  thumbFocusRing,
  setKbThumb,
}: {
  thumbFill: string;
  thumbIndex: number;
  kbThumb: number | null;
  thumbFocusRing: ReturnType<typeof ensureFocusVisibleRing>;
  setKbThumb: Dispatch<SetStateAction<number | null>>;
}) => ({
  outlineWidth: 0,
  borderWidth: 0,
  borderColor: 'transparent',
  backgroundColor: thumbFill,
  hoverStyle: {
    backgroundColor: thumbFill,
    ...(isWeb ? { cursor: 'grab' } : undefined),
  },
  pressStyle: {
    backgroundColor: thumbFill,
    opacity: 0.92,
    ...(isWeb ? { cursor: 'grabbing' } : undefined),
  },
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { outlineWidth: 0 },
  ...(isWeb
    ? {
        onFocus: () => {
          if (wasKeyboardFocus()) {
            setKbThumb(thumbIndex);
          } else {
            setKbThumb((prev) => (prev === thumbIndex ? null : prev));
          }
        },
        onBlur: () => {
          setKbThumb((prev) => (prev === thumbIndex ? null : prev));
        },
      }
    : undefined),
  ...(kbThumb === thumbIndex ? { ...thumbFocusRing, 'data-kb-focus': 'true' } : undefined),
});

/** One thumb. The elevation wrapper is WEB-ONLY — see the note in `SliderThumbPart`. */
const SliderThumbPart = ({
  thumbIndex,
  thumbSize,
  thumbRadius,
  elevated,
  elevationWrapperProps,
  thumbProps,
}: {
  thumbIndex: number;
  thumbSize: number;
  thumbRadius: number;
  elevated: boolean;
  elevationWrapperProps: ReturnType<typeof getElevationWrapperProps>;
  thumbProps: ComponentProps<typeof SliderThumbFrame>;
}) => {
  const thumb = (
    <SliderThumbFrame
      width={thumbSize}
      height={thumbSize}
      index={thumbIndex}
      circular={false}
      borderRadius={thumbRadius}
      style={{ borderRadius: thumbRadius }}
      data-slider-part="thumb"
      {...thumbProps}
    />
  );
  // The elevation wrapper is WEB-ONLY: on iOS the wrapper is a
  // zero-height flow view (the thumb inside is absolutely positioned),
  // and iOS accessibility culls the entire subtree under a zero-rect
  // ancestor — the thumb was invisible to VoiceOver. The wrapper also
  // draws nothing on native (a zero-rect casts no shadow; the thumb
  // carries its own shadow), so dropping it changes no pixels.
  return elevated ? (
    <View
      {...elevationWrapperProps}
      borderRadius={thumbRadius}>
      {thumb}
    </View>
  ) : (
    thumb
  );
};

/** The rail, wrapped in the elevation surface when the field has one. */
const SliderRail = ({
  elevated,
  elevationWrapperProps,
  railRadius,
  outlined,
  children,
}: {
  elevated: boolean;
  elevationWrapperProps: ReturnType<typeof getElevationWrapperProps>;
  railRadius: number;
  outlined?: boolean;
  children: ReactNode;
}) =>
  elevated ? (
    <View
      {...elevationWrapperProps}
      width="100%"
      height="100%"
      borderRadius={railRadius}>
      <TamaguiSlider.Track {...getTrackProps(railRadius, outlined)}>{children}</TamaguiSlider.Track>
    </View>
  ) : (
    <TamaguiSlider.Track {...getTrackProps(railRadius, outlined)}>{children}</TamaguiSlider.Track>
  );

const isJumpMotionEnabled = (sliderProps: SliderProps['sliderProps']): boolean =>
  !isWeb && sliderProps?.orientation !== 'vertical' && sliderProps?.dir !== 'rtl';

/** Ring and fill colors resolved at the field's scope (see the notes inline). */
const useSliderFill = (hasError = false) => {
  // The thumb renders inside tamagui's t_SliderThumb component
  // sub-theme, an INVERSE template whose `$outlineColor` clears 3:1 against
  // its own (inverted) surfaces — but the ring draws on the parent surface,
  // where it measured 1.05:1 (invisible). Resolve the ring color at the
  // field's scope instead and pin the LITERAL on the thumb (`.val`, not
  // `.get()` — the CSS var re-resolves inside the sub-theme).
  const fieldTheme = useTheme();
  const thumbFocusRing = ensureFocusVisibleRing({
    outlineColor: themeTokenValue(fieldTheme, 'outlineColor') ?? '$outlineColor',
    // Halo: circular thumb. At offset 0 the band is concentric with
    // the thumb's edge and reads as a fatter thumb rather than a focus ring.
    outlineOffset: FOCUS_RING_HALO_OFFSET,
  });
  // Apple/Material/Spectrum: the filled rail is the value (accent). Pin the
  // literal so Tamagui's SliderActive sub-theme cannot remap `$accentBackground`
  // onto a gray that matches the inactive track (the before-state defect).
  const fillToken = hasError ? formCommonColors.error : formSelectedColors.mark;
  const fillKey = fillToken.startsWith('$') ? fillToken.slice(1) : fillToken;
  const themedFill = themeTokenValue(fieldTheme, fillKey);
  const fillLiteral = hasText(themedFill) ? themedFill : fillToken;
  // Paper vs ink on the ACTUAL fill, computed at field scope so the
  // inverse SliderThumb template cannot flip the handle to a same-lightness disc.
  const thumbColor = useReadableTextOn(fillLiteral);
  return { thumbFocusRing, fillLiteral, thumbColor };
};

/** The jump-tween session: arms a short-lived transition for discrete jumps and tracks drag vs jump. */
const useJumpSession = () => {
  const [animateJump, setAnimateJump] = useState(false);
  const sessionRef = useRef<'idle' | 'drag' | 'jump'>('idle');
  const jumpClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** After a drag ends, ignore the trailing controlled sync so it does not re-tween. */
  const ignoreJumpUntilRef = useRef(0);

  const clearJumpTimer = useCallback(() => {
    if (jumpClearRef.current !== null) {
      clearTimeout(jumpClearRef.current);
      jumpClearRef.current = null;
    }
  }, []);

  const armJump = useCallback(() => {
    sessionRef.current = 'jump';
    setAnimateJump(true);
    clearJumpTimer();
    jumpClearRef.current = setTimeout(() => {
      if (sessionRef.current === 'jump') {
        sessionRef.current = 'idle';
        setAnimateJump(false);
      }
      jumpClearRef.current = null;
    }, JUMP_MOTION_MS);
  }, [clearJumpTimer]);

  useEffect(
    () => () => {
      clearJumpTimer();
    },
    [clearJumpTimer],
  );

  return { animateJump, setAnimateJump, sessionRef, ignoreJumpUntilRef, clearJumpTimer, armJump };
};

type JumpSession = ReturnType<typeof useJumpSession>;

type SliderEventProps = Pick<
  ComponentProps<typeof TamaguiSlider>,
  'onPointerDown' | 'onSlideStart' | 'onSlideEnd' | 'onKeyDown' | 'onValueChange'
>;

const sliderAriaProps = ({
  required,
  hasError,
  readOnly,
}: {
  required?: boolean;
  hasError?: boolean;
  readOnly?: boolean;
}) => ({
  ...(readOnly ? { pointerEvents: 'none' as const } : undefined),
  'aria-required': required ? true : undefined,
  'aria-invalid': hasError ? true : undefined,
  'aria-readonly': readOnly ? true : undefined,
});

/** Pointer, slide, key and value handlers: they drive the jump/drag session and mirror values for VoiceOver. */
const useSliderEventProps = ({
  disabled,
  readOnly,
  sliderProps,
  a11yValues,
  setA11yValues,
  setNativeValues,
  setDisplayValues,
  setKbThumb,
  jumpMotion,
  session,
  currentValuesRef,
  onChangeValues,
}: {
  disabled?: boolean;
  readOnly?: boolean;
  sliderProps: SliderProps['sliderProps'];
  a11yValues: number[] | null;
  setA11yValues: Dispatch<SetStateAction<number[] | null>>;
  setNativeValues: Dispatch<SetStateAction<number[]>>;
  setDisplayValues: Dispatch<SetStateAction<number[]>>;
  setKbThumb: Dispatch<SetStateAction<number | null>>;
  jumpMotion: SliderJumpMotion;
  session: JumpSession;
  currentValuesRef: RefObject<number[]>;
  onChangeValues?: (values: number[]) => void;
}): SliderEventProps => ({
  onPointerDown: (event) => {
    // Any pointer session (click, track press, thumb drag)
    // drops the keyboard ring. Tab-then-drag used to keep :focus-visible
    // because the thumb never blurs.
    if (isWeb) {
      setKbThumb(null);
    }
    sliderProps?.onPointerDown?.(event);
  },
  onSlideStart: (_event, value, target) => {
    if (disabled || readOnly) {
      return;
    }
    if (isWeb) {
      setKbThumb(null);
    }
    if (!isWeb && a11yValues) {
      setA11yValues(null);
    }
    if (target === 'track') {
      jumpMotion.onTrackPress(value);
      session.armJump();
    } else {
      jumpMotion.onDragStart();
      session.sessionRef.current = 'drag';
      session.clearJumpTimer();
      session.setAnimateJump(false);
    }
  },
  onSlideEnd: () => {
    if (!isWeb) {
      setNativeValues(currentValuesRef.current);
    }
    if (session.sessionRef.current === 'drag') {
      session.sessionRef.current = 'idle';
      session.ignoreJumpUntilRef.current = Date.now() + 50;
    }
  },
  onKeyDown: (event: KeyboardEvent) => {
    if (disabled || readOnly) {
      return;
    }
    if (JUMP_KEYS.has(event.key)) {
      session.armJump();
    }
  },
  onValueChange: (values) => {
    // Position tracking first: the jump/drag machine must see every
    // internal value even when the value-emit below is gated.
    jumpMotion.onInternalValueChange(values);
    currentValuesRef.current = values;
    setDisplayValues(values);
    // Keep announcements fresh without re-rendering per drag move.
    if (!isWeb && session.sessionRef.current !== 'drag') {
      setNativeValues(values);
    }
    if (disabled) {
      return;
    }
    onChangeValues?.(values);
  },
});

/** The filled part of the rail. */
const SliderFill = ({
  fillLiteral,
  railRadius,
  transitionProp,
}: {
  fillLiteral: string;
  railRadius: number;
  transitionProp: string;
}) => (
  <TamaguiSlider.TrackActive
    backgroundColor={fillLiteral}
    height="100%"
    // The fill rides the same BINARY radius as the rail it sits in
    // — never a leftover pill inside a square track.
    borderRadius={railRadius}
    style={{ borderRadius: railRadius }}
    data-slider-part="fill"
    transition={transitionProp}
  />
);

/** The current value (or range) beside the track. */
const SliderOutput = ({ values, step, isRange }: { values: number[]; step: number; isRange: boolean }) => (
  <Paragraph
    size="$2"
    color={formCommonColors.text}
    minWidth={isRange ? 56 : 32}
    textAlign="right"
    aria-hidden>
    {formatSliderOutput(values, step)}
  </Paragraph>
);

/**
 * The values after a VoiceOver step on one thumb, or null when nothing moves.
 * Mirrors tamagui's updateValues semantics: step, snap, clamp, sort, reject
 * when minStepsBetweenThumbs would be violated.
 */
const adjustedValues = ({
  current,
  thumbIndex,
  direction,
  step,
  min,
  max,
  minStepsBetweenThumbs,
}: {
  current: number[];
  thumbIndex: number;
  direction: 1 | -1;
  step: number;
  min: number;
  max: number;
  minStepsBetweenThumbs: number;
}): number[] | null => {
  const currentValue = current[thumbIndex];
  if (currentValue === undefined) {
    return null;
  }
  const next = snapSliderValue(currentValue + direction * step, min, max, step);
  const nextValues = getNextSortedValues(current, next, thumbIndex);
  if (!hasMinStepsBetween(nextValues, minStepsBetweenThumbs * step) || valuesEqual(current, nextValues)) {
    return null;
  }
  return nextValues;
};

/**
 * Jump-only motion: tween thumb + TrackActive only for discrete jumps
 * (track click, keyboard, controlled value change). Drag and first paint stay
 * transition-off so the handle never lags the pointer or wiggles on mount.
 */
const SliderControl = ({
  id,
  sliderValue,
  controlled,
  min,
  max,
  step,
  disabled,
  readOnly,
  required,
  hasError,
  hasLabel,
  labelText,
  'aria-label': ariaLabel,
  size,
  sizeToken,
  outlined,
  borderRadius,
  transitionToken,
  elevationWrapperProps,
  sliderProps,
  onChangeValues,
  onBlur,
}: SliderControlProps) => {
  const describedBy = useFieldDescribedBy();
  const { disabledState } = useResolvedKnobs();
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const { thumbFocusRing, fillLiteral, thumbColor } = useSliderFill(hasError);
  const session = useJumpSession();
  const { animateJump, sessionRef, ignoreJumpUntilRef, armJump } = session;
  const [kbThumb, setKbThumb] = useState<number | null>(null);
  const [displayValues, setDisplayValues] = useState<number[]>(sliderValue);
  const paintedRef = useRef(false);
  const prevValueRef = useRef(sliderValue);

  // Rail, fill and thumb are one BINARY member — 0 at
  // none, the part's own height/2 at every other stop. Tracks square
  // with their thumbs.
  const radiusStop = radiusStopFromToken(borderRadius);
  const railRadius = resolveRadiusClass('BINARY', radiusStop, { heightPx: TRACK_HEIGHT });

  // Native jump tween rides transform (FLIP) — the RN driver cannot animate
  // the thumb's `left` percent (see ./jump-motion.ts). Web keeps the css
  // transition session below untouched.
  const trackWidthRef = useRef(0);
  // RENDERED thumb diameter — the same number tamagui's internal x-offset
  // resolves to after measuring itself (the `circular` variant renders the
  // UNSHIFTED size token and wins over the size variant's shift -1; see
  // getSliderThumbRenderSize). Using the shifted token here put the base-x
  // replica 1-4pt off the true rendered position.
  const hydrationTouch = useTouchSurface();
  const thumbSize = getSliderThumbRenderSize(THUMB_SIZE_TOKEN, undefined, hydrationTouch);
  const jumpMotionEnabled = isJumpMotionEnabled(sliderProps);
  const jumpMotion = useSliderJumpMotion({
    enabled: jumpMotionEnabled,
    min,
    max,
    step,
    transitionToken,
    initialValues: sliderValue,
    minStepsBetweenThumbs: sliderProps?.minStepsBetweenThumbs ?? 0,
    getTrackWidth: () => trackWidthRef.current,
    thumbSize,
    resolveAnimationConfig: (token) => Object.entries(animationConfig).find(([name]) => name === token)?.[1],
  });
  const jumpMotionRef = useRef(jumpMotion);
  useEffect(() => {
    jumpMotionRef.current = jumpMotion;
  });

  // ── Native accessibility (VoiceOver) ────────────────────────────────────
  // The web path names/values the thumbs via aria-*; on native the slider was
  // absent from the accessibility tree entirely. Each thumb becomes an
  // "adjustable" element with label/value/hint and increment/decrement
  // actions mapped to step changes. All state below is native-only: web never
  // updates it, so the web render path stays byte-identical.
  const fieldA11y = useFieldA11y();
  /**
   * VoiceOver-driven values. Tamagui is uncontrolled (`defaultValue` only),
   * so an a11y action moves the thumb by temporarily passing `value` — while
   * controlled, tamagui keeps its internal state synced to the prop, so
   * clearing this on the next touch gesture hands control back seamlessly.
   */
  const [a11yValues, setA11yValues] = useState<number[] | null>(null);
  /** Freshest committed values for accessibilityValue announcements. */
  const [nativeValues, setNativeValues] = useState<number[]>(sliderValue);
  const currentValuesRef = useRef(sliderValue);

  const handleA11yAdjust = (thumbIndex: number, direction: 1 | -1) => {
    if (disabled || readOnly) {
      return;
    }
    const current = a11yValues ?? currentValuesRef.current;
    const nextValues = adjustedValues({
      current,
      thumbIndex,
      direction,
      step,
      min,
      max,
      minStepsBetweenThumbs: sliderProps?.minStepsBetweenThumbs ?? 0,
    });
    if (nextValues === null) {
      return;
    }
    currentValuesRef.current = nextValues;
    jumpMotion.onInternalValueChange(nextValues);
    setA11yValues(nextValues);
    setNativeValues(nextValues);
    onChangeValues?.(nextValues);
  };

  const eventProps = useSliderEventProps({
    disabled,
    readOnly,
    sliderProps,
    a11yValues,
    setA11yValues,
    setNativeValues,
    setDisplayValues,
    setKbThumb,
    jumpMotion,
    session,
    currentValuesRef,
    onChangeValues,
  });

  // A genuine external value change adopts the new value as the displayed one
  // and releases any VoiceOver-held override (native only). Adjusted during
  // render so the stale value never paints.
  const [adoptedValue, setAdoptedValue] = useState(sliderValue);
  if (!valuesEqual(adoptedValue, sliderValue)) {
    setAdoptedValue(sliderValue);
    setDisplayValues(sliderValue);
    if (!isWeb) {
      setNativeValues(sliderValue);
      setA11yValues(null);
    }
  }

  // Controlled / external value jumps animate; first paint and drag sync do not.
  useEffect(() => {
    const prev = prevValueRef.current;
    prevValueRef.current = sliderValue;
    if (!paintedRef.current) {
      paintedRef.current = true;
      return;
    }
    if (valuesEqual(prev, sliderValue)) {
      return;
    }
    currentValuesRef.current = sliderValue;
    if (!isWeb) {
      // Keep the FLIP replica's value mirror current so the next track-press
      // glide computes its origin from the externally-applied position.
      jumpMotionRef.current.onInternalValueChange(sliderValue);
    }
    if (sessionRef.current === 'drag') {
      return;
    }
    // oxlint-disable-next-line react/purity -- Date.now() runs inside an effect, not during render
    if (Date.now() < ignoreJumpUntilRef.current) {
      return;
    }
    armJump();
  }, [sliderValue, armJump, sessionRef, ignoreJumpUntilRef, jumpMotionRef, currentValuesRef, paintedRef, prevValueRef]);

  const motionTransition = animateJump ? transitionToken : undefined;
  const thumbRadius = resolveRadiusClass('BINARY', radiusStop, {
    heightPx: thumbSize,
  });

  // `"none"` (not omitted): Tamagui styled defaults / animateOnly can leave a
  // residual tween if the prop is absent after a jump session. This string
  // session drives web thumbs + TrackActive; native thumbs use jumpMotion
  // (TrackActive edges are layout props the RN driver cannot animate, so the
  // fill snaps on native — the gliding thumb is the perceptual anchor).
  const transitionProp = motionTransition ?? 'none';

  const hitHeight = size ?? sizeToken;
  const thumbFill = thumbColor ?? formControlColors.thumb.base;
  const elevated = hasElevationProp(elevationWrapperProps);

  const renderThumb = (thumbIndex: number) => {
    const thumbLabel = thumbAccessibleLabel({
      thumbIndex,
      count: sliderValue.length,
      ariaLabel,
      labelText,
      hasLabel: hasLabel === true,
    });
    const thumbA11y = {
      'aria-label': thumbLabel,
      'aria-labelledby': !hasText(thumbLabel) && hasLabel ? `${id}-label` : undefined,
      'aria-describedby': describedBy,
    };
    const thumbValueNow = (a11yValues ?? nativeValues)[thumbIndex] ?? sliderValue[thumbIndex] ?? min;
    const nativeThumbA11y = nativeThumbA11yProps({
      label: thumbLabel ?? fieldA11y?.label ?? t('Slider'),
      hint: fieldA11y?.description,
      min,
      max,
      now: thumbValueNow,
      disabled,
      onAdjust: (direction) => {
        handleA11yAdjust(thumbIndex, direction);
      },
    });
    // Web: string transition session (css driver tweens `left`).
    // Native: per-property transform transition + FLIP `x` override.
    const thumbMotionProps = jumpMotionEnabled
      ? jumpMotion.getThumbMotionProps(thumbIndex)
      : { transition: transitionProp };
    return (
      <SliderThumbPart
        key={thumbIndex}
        thumbIndex={thumbIndex}
        thumbSize={thumbSize}
        thumbRadius={thumbRadius}
        elevated={elevated && isWeb}
        elevationWrapperProps={elevationWrapperProps}
        thumbProps={{
          ...buildThumbRingProps({ thumbFill, thumbIndex, kbThumb, thumbFocusRing, setKbThumb }),
          ...thumbMotionProps,
          ...thumbA11y,
          ...nativeThumbA11y,
        }}
      />
    );
  };

  return (
    <XStack
      height={hitHeight}
      alignItems="center"
      width="100%"
      gap="$3"
      // Disabled-visible: track+thumb+output are text-free chrome —
      // dim the whole control while the sibling label/helper stay readable.
      {...(disabled ? disabledState.chromeKnobProps : undefined)}>
      <View
        flex={1}
        minWidth={0}
        height="100%"
        justifyContent="center"
        onLayout={(event) => {
          trackWidthRef.current = event.nativeEvent.layout.width;
        }}>
        <TamaguiSlider
          size={sizeToken}
          width="100%"
          {...sliderProps}
          disabled={disabled}
          id={id}
          // Controlled when an upstream value drives the slider (value prop /
          // field state) — mount-only `defaultValue` froze late-arriving values
          // (create-mode seeding). Uncontrolled standalone keeps defaultValue.
          // Tamagui's prop-wins controllable state adopts a late prop without
          // firing onValueChange. Same split as ToggleGroup.
          {...(controlled ? { value: sliderValue } : { defaultValue: sliderValue })}
          // Native only: while VoiceOver adjusts the value the slider runs
          // controlled (tamagui syncs its internal state to the prop), and the
          // next touch gesture releases it back to uncontrolled seamlessly.
          {...(!isWeb && a11yValues ? { value: a11yValues } : undefined)}
          min={min}
          max={max}
          step={step}
          {...eventProps}
          {...(onBlur ? { onBlur } : undefined)}
          {...sliderAriaProps({ required, hasError, readOnly })}
          aria-label={ariaLabel}
          // Labeled: the sibling Label wires `aria-labelledby` onto this id
          // itself — naming it here too doubles the spoken name.
          aria-describedby={describedBy}>
          <SliderRail
            elevated={elevated}
            elevationWrapperProps={elevationWrapperProps}
            railRadius={railRadius}
            outlined={outlined}>
            <SliderFill
              fillLiteral={fillLiteral}
              railRadius={railRadius}
              transitionProp={transitionProp}
            />
          </SliderRail>
          {/* oxlint-disable-next-line react/refs -- renderThumb only hands handlers to the thumbs; the refs they read are touched when a handler runs, never during render */}
          {sliderValue.map((_thumbValue, thumbIndex) => renderThumb(thumbIndex))}
        </TamaguiSlider>
      </View>
      <SliderOutput
        values={displayValues}
        step={step}
        isRange={sliderValue.length > 1}
      />
    </XStack>
  );
};

export const Slider = ({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  readOnly,
  size,
  id: idProp,
  value,
  defaultValue,
  onChange,
  // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is still honored
  onValueChange,
  onBlur,
  min = 0,
  max = 100,
  step = 1,
  sliderProps,
  skeleton,
  compact,
  'aria-label': ariaLabel,
}: SliderProps) => {
  // Canonical `onChange` and the alias `onValueChange` both fire from the
  // single emit site below (same reconciliation as Switch).
  const handleValueChange = (values: number[]) => {
    onChange?.(values);
    onValueChange?.(values);
  };
  const { resolvedForm, knobProps, elevation, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const hasLabel = Boolean(label);
  const elevationWrapperProps = getElevationWrapperProps(knobProps, elevation);
  const transitionToken =
    isString(knobProps.transition) && knobProps.transition !== '' ? knobProps.transition : 'quick';

  // Render skeleton placeholder
  if (skeleton) {
    return (
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        <XStack
          height={size ?? knobProps.sizeToken}
          alignItems="center"
          width="100%">
          <Skeleton
            variant="rounded"
            width="100%"
            height={TRACK_HEIGHT}
          />
        </XStack>
      </FieldLayout>
    );
  }

  const control = (
    sliderValue: number[],
    isControlled: boolean,
    handleChange: ((values: number[]) => void) | undefined,
    handleBlur: AnyHandler | undefined,
    hasError: boolean,
  ) => (
    <SliderControl
      id={id}
      sliderValue={sliderValue}
      controlled={isControlled}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      hasError={hasError}
      hasLabel={hasLabel}
      labelText={isString(label) ? label : undefined}
      aria-label={ariaLabel}
      size={size}
      sizeToken={knobProps.sizeToken}
      outlined={knobProps.outlined}
      borderRadius={knobProps.borderRadius.borderRadius}
      transitionToken={transitionToken}
      elevationWrapperProps={elevationWrapperProps}
      sliderProps={sliderProps}
      onChangeValues={(values) => {
        handleChange?.(values);
        handleValueChange(values);
      }}
      onBlur={handleBlur}
    />
  );

  if (!resolvedForm || name === undefined || name === '') {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        required={required}
        helperText={helperText}
        size={size}
        knobProps={knobProps}
        disabled={disabled}>
        {control(value ?? defaultValue ?? [min], value !== undefined, undefined, onBlur, isErrorValue(error))}
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

        const formValue: unknown = field.state.value;
        const normalizedValue = Array.isArray(formValue)
          ? formValue.filter(isNumber)
          : [isNumber(formValue) ? formValue : min];

        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            required={required}
            helperText={helperText}
            size={size}
            knobProps={knobProps}
            disabled={disabled}>
            {control(
              value ?? normalizedValue,
              // Form-integrated is always controlled: field state is the live
              // source and handleChange below closes the loop (ToggleGroup
              // form branch does the same).
              true,
              (values) => {
                // SAFETY: the field is bound to this slider's value, so handleChange accepts the number or number[] it is given.
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field API's value type is erased to `never` for a form of unknown shape
                field.handleChange((values.length > 1 ? values : values[0]) as never);
              },
              mergeFieldHandler(field, 'handleBlur', onBlur),
              isErrorValue(resolvedError),
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
};

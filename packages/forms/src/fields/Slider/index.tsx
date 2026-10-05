import { useTouchSurface, isTouchSurface } from '@repo/theme';
import {
  animationConfig,
  borderRadiusMap,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  FOCUS_RING_HALO_OFFSET,
  resolveRadiusClass,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
  type BorderRadius,
} from '@repo/theme';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import {
  type SliderProps as TamaguiSliderProps,
  Slider as TamaguiSlider,
  Paragraph,
  View,
  XStack,
  isWeb,
  styled,
  useTheme,
} from 'tamagui';

import { Field, FieldLayout, useFieldA11y, useFieldDescribedBy } from '../../fieldLayout';
import { formCommonColors, formControlColors, formSelectedColors } from '../../shared/colorRamps';
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

import {
  getNextSortedValues,
  getSliderThumbRenderSize,
  hasMinStepsBetween,
  snapSliderValue,
  useSliderJumpMotion,
} from './jumpMotion';

/**
 * Visual rail height. Spectrum ~3px, Apple ~4pt; Material's 16dp track is a
 * density class of its own. House skeleton already paints 6px — match it so
 * loading and loaded share one rail.
 */
const TRACK_HEIGHT = 6;

function radiusStopFromToken(token: number | string): BorderRadius {
  if (token === 0 || token === '$0') {
    return 'none';
  }
  for (const stop of Object.keys(borderRadiusMap) as BorderRadius[]) {
    if (borderRadiusMap[stop] === token) {
      return stop;
    }
  }
  throw new Error(`Slider: "${String(token)}" is not a radius token in borderRadiusMap`);
}

// Track styling helper - returns props to pass to TamaguiSlider.Track
const getTrackProps = (outlined: boolean | undefined, borderRadius: number) => ({
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

function formatSliderOutput(values: number[], step: number): string {
  const decimals = (String(step).split('.')[1] || '').length;
  const fmt = (n: number) => (decimals ? n.toFixed(decimals) : String(n));
  if (values.length <= 1) {
    return fmt(values[0] ?? 0);
  }
  return `${fmt(values[0] ?? 0)}–${fmt(values[values.length - 1] ?? 0)}`;
}

const JUMP_KEYS = new Set(['Home', 'End', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Clear jump-tween shortly after the transition window so later layout does not re-tween. */
const JUMP_MOTION_MS = 180;

/** VoiceOver adjustable actions (native): swipe up/down steps the value. */
const A11Y_ADJUSTABLE_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

function valuesEqual(a: number[] | undefined, b: number[] | undefined) {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((v, i) => v === b[i]);
}

export interface SliderProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
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
  onBlur?: (...args: any[]) => void;
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
  onBlur?: (...args: any[]) => void;
}

/**
 * Jump-only motion: tween thumb + TrackActive only for discrete jumps
 * (track click, keyboard, controlled value change). Drag and first paint stay
 * transition-off so the handle never lags the pointer or wiggles on mount.
 */
function SliderControl({
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
}: SliderControlProps) {
  const describedBy = useFieldDescribedBy();
  const { disabledState } = useResolvedKnobs();
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  // The thumb renders inside tamagui's t_SliderThumb component
  // sub-theme, an INVERSE template whose `$outlineColor` clears 3:1 against
  // its own (inverted) surfaces — but the ring draws on the parent surface,
  // where it measured 1.05:1 (invisible). Resolve the ring color at the
  // field's scope instead and pin the LITERAL on the thumb (`.val`, not
  // `.get()` — the CSS var re-resolves inside the sub-theme).
  const fieldTheme = useTheme();
  const thumbFocusRing = ensureFocusVisibleRing({
    outlineColor: (fieldTheme.outlineColor?.val as string | undefined) ?? '$outlineColor',
    // Halo: circular thumb. At offset 0 the band is concentric with
    // the thumb's edge and reads as a fatter thumb rather than a focus ring.
    outlineOffset: FOCUS_RING_HALO_OFFSET,
  });
  // Apple/Material/Spectrum: the filled rail is the value (accent). Pin the
  // literal so Tamagui's SliderActive sub-theme cannot remap `$accentBackground`
  // onto a gray that matches the inactive track (the before-state defect).
  const fillToken = hasError ? formCommonColors.error : formSelectedColors.mark;
  const fillKey = fillToken.startsWith('$') ? fillToken.slice(1) : fillToken;
  const fillLiteral = (fieldTheme[fillKey as keyof typeof fieldTheme]?.val as string | undefined) || fillToken;
  // Paper vs ink on the ACTUAL fill, computed at field scope so the
  // inverse SliderThumb template cannot flip the handle to a same-lightness disc.
  const thumbColor = useReadableTextOn(fillLiteral);
  const [animateJump, setAnimateJump] = useState(false);
  const [kbThumb, setKbThumb] = useState<number | null>(null);
  const [displayValues, setDisplayValues] = useState<number[]>(sliderValue);
  const sessionRef = useRef<'idle' | 'drag' | 'jump'>('idle');
  const jumpClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paintedRef = useRef(false);
  const prevValueRef = useRef(sliderValue);
  /** After a drag ends, ignore the trailing controlled sync so it does not re-tween. */
  const ignoreJumpUntilRef = useRef(0);

  // Rail, fill and thumb are one BINARY member — 0 at
  // none, the part's own height/2 at every other stop. Tracks square
  // with their thumbs.
  const radiusStop = radiusStopFromToken(borderRadius);
  const railRadius = resolveRadiusClass('BINARY', radiusStop, { heightPx: TRACK_HEIGHT });

  // Native jump tween rides transform (FLIP) — the RN driver cannot animate
  // the thumb's `left` percent (see ./jumpMotion.ts). Web keeps the css
  // transition session below untouched.
  const trackWidthRef = useRef(0);
  // RENDERED thumb diameter — the same number tamagui's internal x-offset
  // resolves to after measuring itself (the `circular` variant renders the
  // UNSHIFTED size token and wins over the size variant's shift -1; see
  // getSliderThumbRenderSize). Using the shifted token here put the base-x
  // replica 1-4pt off the true rendered position.
  const hydrationTouch = useTouchSurface();
  const thumbSize = getSliderThumbRenderSize(THUMB_SIZE_TOKEN, undefined, hydrationTouch);
  const jumpMotionEnabled = !isWeb && sliderProps?.orientation !== 'vertical' && sliderProps?.dir !== 'rtl';
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
    resolveAnimationConfig: (token) => (animationConfig as Record<string, unknown>)[token],
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
    const currentValue = current[thumbIndex];
    if (currentValue === undefined) {
      return;
    }
    // Mirror tamagui's updateValues semantics: step, snap, clamp, sort,
    // reject when minStepsBetweenThumbs would be violated.
    const next = snapSliderValue(currentValue + direction * step, min, max, step);
    const nextValues = getNextSortedValues(current, next, thumbIndex);
    if (!hasMinStepsBetween(nextValues, (sliderProps?.minStepsBetweenThumbs ?? 0) * step)) {
      return;
    }
    if (valuesEqual(current, nextValues)) {
      return;
    }
    currentValuesRef.current = nextValues;
    jumpMotion.onInternalValueChange(nextValues);
    setA11yValues(nextValues);
    setNativeValues(nextValues);
    onChangeValues?.(nextValues);
  };

  const clearJumpTimer = () => {
    if (jumpClearRef.current !== null) {
      clearTimeout(jumpClearRef.current);
      jumpClearRef.current = null;
    }
  };

  const armJump = () => {
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
  };

  useEffect(
    () => () => {
      clearJumpTimer();
    },
    [],
  );

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
    // A genuine external value change: adopt it as the current value and
    // release any VoiceOver-held value override (native only).
    currentValuesRef.current = sliderValue;
    setDisplayValues(sliderValue);
    if (!isWeb) {
      setNativeValues(sliderValue);
      setA11yValues(null);
      // Keep the FLIP replica's value mirror current so the next track-press
      // glide computes its origin from the externally-applied position.
      jumpMotion.onInternalValueChange(sliderValue);
    }
    if (sessionRef.current === 'drag') {
      return;
    }
    if (Date.now() < ignoreJumpUntilRef.current) {
      return;
    }
    armJump();
  }, [sliderValue]);

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

  const trackActive = (
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
  const hitHeight = size || sizeToken;
  const thumbFill = thumbColor ?? formControlColors.thumb.base;

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
          {...(readOnly ? { pointerEvents: 'none' as const } : undefined)}
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
          onPointerDown={(event) => {
            // Any pointer session (click, track press, thumb drag)
            // drops the keyboard ring. Tab-then-drag used to keep :focus-visible
            // because the thumb never blurs.
            if (isWeb) {
              setKbThumb(null);
            }
            sliderProps?.onPointerDown?.(event);
          }}
          onSlideStart={(_event, value, target) => {
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
              armJump();
            } else {
              jumpMotion.onDragStart();
              sessionRef.current = 'drag';
              clearJumpTimer();
              setAnimateJump(false);
            }
          }}
          onSlideEnd={() => {
            if (!isWeb) {
              setNativeValues(currentValuesRef.current);
            }
            if (sessionRef.current === 'drag') {
              sessionRef.current = 'idle';
              ignoreJumpUntilRef.current = Date.now() + 50;
            }
          }}
          onKeyDown={(event: KeyboardEvent) => {
            if (disabled || readOnly) {
              return;
            }
            if (JUMP_KEYS.has(event.key)) {
              armJump();
            }
          }}
          onValueChange={(values) => {
            // Position tracking first: the jump/drag machine must see every
            // internal value even when the value-emit below is gated.
            jumpMotion.onInternalValueChange(values);
            currentValuesRef.current = values;
            setDisplayValues(values);
            // Keep announcements fresh without re-rendering per drag move.
            if (!isWeb && sessionRef.current !== 'drag') {
              setNativeValues(values);
            }
            if (disabled) {
              return;
            }
            onChangeValues?.(values);
          }}
          {...(onBlur ? { onBlur } : undefined)}
          aria-required={required || undefined}
          aria-invalid={hasError || undefined}
          aria-readonly={readOnly || undefined}
          aria-label={ariaLabel}
          // Labelled: the sibling Label wires `aria-labelledby` onto this id
          // itself — naming it here too doubles the spoken name.
          aria-describedby={describedBy}>
          {elevationWrapperProps.elevation ? (
            <View {...elevationWrapperProps} width="100%" height="100%" borderRadius={railRadius}>
              <TamaguiSlider.Track {...getTrackProps(outlined, railRadius)}>{trackActive}</TamaguiSlider.Track>
            </View>
          ) : (
            <TamaguiSlider.Track {...getTrackProps(outlined, railRadius)}>{trackActive}</TamaguiSlider.Track>
          )}
          {sliderValue.map((_thumbValue, thumbIndex) => {
            // Per-thumb accessible names (values are announced via the
            // aria-valuenow the thumb already carries). Range sliders name each
            // thumb "Minimum"/"Maximum" (prefixed with the field label context)
            // — a labelledby pointing at the shared field label would make all
            // thumbs announce identically, so it is dropped when a per-thumb
            // label exists (aria-labelledby otherwise wins name computation).
            const isRange = sliderValue.length > 1;
            const labelContext = ariaLabel ?? labelText;
            const positionLabel =
              thumbIndex === 0
                ? t('Minimum')
                : thumbIndex === sliderValue.length - 1
                  ? t('Maximum')
                  : t('Value {{number}}', { number: thumbIndex + 1 });
            const thumbLabel = isRange
              ? labelContext
                ? `${labelContext} ${positionLabel}`
                : positionLabel
              : (ariaLabel ?? labelText ?? (hasLabel ? undefined : t('Slider')));
            const thumbA11y = {
              'aria-label': thumbLabel,
              'aria-labelledby': !thumbLabel && hasLabel ? `${id}-label` : undefined,
              'aria-describedby': describedBy,
            };
            // Native mirror of the web aria wiring: an "adjustable" element per
            // thumb with the accessible name (id-based aria-labelledby has no
            // native equivalent, so the label string comes from the field a11y
            // context), current value, helper/error hint, and step actions.
            const thumbValueNow = (a11yValues ?? nativeValues)[thumbIndex] ?? sliderValue[thumbIndex] ?? min;
            const nativeThumbA11y = isWeb
              ? undefined
              : {
                  accessible: true,
                  // Tamagui's Thumb sets role="slider" (web semantics); on this
                  // RN version it shadows accessibilityRole without mapping to
                  // the iOS adjustable trait — clear it so the trait applies.
                  role: undefined,
                  accessibilityRole: 'adjustable' as const,
                  accessibilityLabel: thumbLabel ?? fieldA11y?.label ?? t('Slider'),
                  accessibilityHint: fieldA11y?.description,
                  accessibilityValue: {
                    min,
                    max,
                    now: thumbValueNow,
                    text: String(thumbValueNow),
                  },
                  accessibilityState: { disabled: !!disabled },
                  accessibilityActions: A11Y_ADJUSTABLE_ACTIONS,
                  onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
                    if (event.nativeEvent.actionName === 'increment') {
                      handleA11yAdjust(thumbIndex, 1);
                    } else if (event.nativeEvent.actionName === 'decrement') {
                      handleA11yAdjust(thumbIndex, -1);
                    }
                  },
                };
            // Web: string transition session (css driver tweens `left`).
            // Native: per-property transform transition + FLIP `x` override.
            const thumbMotionProps = jumpMotionEnabled
              ? (jumpMotion.getThumbMotionProps(thumbIndex) as Record<string, unknown>)
              : { transition: transitionProp };
            // The elevation wrapper is WEB-ONLY: on iOS the wrapper is a
            // zero-height flow view (the thumb inside is absolutely positioned),
            // and iOS accessibility culls the entire subtree under a zero-rect
            // ancestor — the thumb was invisible to VoiceOver. The wrapper also
            // draws nothing on native (a zero-rect casts no shadow; the thumb
            // carries its own shadow), so dropping it changes no pixels.
            const thumbRingProps = {
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
            };
            return elevationWrapperProps.elevation && isWeb ? (
              <View key={thumbIndex} {...elevationWrapperProps} borderRadius={thumbRadius}>
                <SliderThumbFrame
                  width={thumbSize}
                  height={thumbSize}
                  index={thumbIndex}
                  circular={false}
                  borderRadius={thumbRadius}
                  style={{ borderRadius: thumbRadius }}
                  data-slider-part="thumb"
                  {...thumbRingProps}
                  {...thumbMotionProps}
                  {...thumbA11y}
                  {...(nativeThumbA11y as Record<string, unknown> | undefined)}
                />
              </View>
            ) : (
              <SliderThumbFrame
                width={thumbSize}
                height={thumbSize}
                key={thumbIndex}
                index={thumbIndex}
                circular={false}
                borderRadius={thumbRadius}
                style={{ borderRadius: thumbRadius }}
                data-slider-part="thumb"
                {...thumbRingProps}
                {...thumbMotionProps}
                {...thumbA11y}
                {...(nativeThumbA11y as Record<string, unknown> | undefined)}
              />
            );
          })}
        </TamaguiSlider>
      </View>
      <Paragraph
        size="$2"
        color={formCommonColors.text}
        minWidth={sliderValue.length > 1 ? 56 : 32}
        textAlign="right"
        aria-hidden>
        {formatSliderOutput(displayValues, step)}
      </Paragraph>
    </XStack>
  );
}

export function Slider({
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
  onValueChange,
  onBlur,
  min = 0,
  max = 100,
  step = 1,
  sliderProps,
  skeleton,
  compact,
  'aria-label': ariaLabel,
}: SliderProps) {
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
  const transitionToken = (knobProps.transition as string | undefined) || 'quick';

  // Render skeleton placeholder
  if (skeleton) {
    return (
      <FieldLayout id={id} label={label} size={size} knobProps={knobProps}>
        <XStack height={size || knobProps.sizeToken} alignItems="center" width="100%">
          <Skeleton variant="rounded" width="100%" height={TRACK_HEIGHT} />
        </XStack>
      </FieldLayout>
    );
  }

  const control = (
    sliderValue: number[],
    isControlled: boolean,
    handleChange?: (values: number[]) => void,
    handleBlur?: (...args: any[]) => void,
    hasError?: boolean,
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
      labelText={typeof label === 'string' ? label : undefined}
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

  if (!resolvedForm || !name) {
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
        {control(value ?? defaultValue ?? [min], value !== undefined, undefined, onBlur, !!error)}
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);

        const formValue = field.state.value;
        const normalizedValue = Array.isArray(formValue) ? formValue : [(formValue as number) ?? min];

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
              value !== undefined ? value : normalizedValue,
              // Form-integrated is always controlled: field state is the live
              // source and handleChange below closes the loop (ToggleGroup
              // form branch does the same).
              true,
              (values) => {
                field.handleChange((values.length > 1 ? values : values[0]) as any);
              },
              mergeFieldHandler(field, 'handleBlur', onBlur),
              !!resolvedError,
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
}

import { CaretDownIcon, CaretUpIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { useTouchSurface } from '@repo/theme';
import { currencyAffix, sizeRecipeForToken, useGlyphColor } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import {
  type ComponentProps,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Pressable } from 'react-native';
import { isWeb, Text, useProps, View } from 'tamagui';
import { Input as TamaguiInput } from 'tamagui';

import { resolveStepperPlacement } from './resolveStepperPlacement';

export { resolveStepperPlacement, type StepperButtonPosition } from './resolveStepperPlacement';

type InputProps = ComponentProps<typeof TamaguiInput>;
import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formButtonColors, formInputColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';
import { useWheelIncrement } from '../../shared/useWheelIncrement';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

const repeatDelay = 400;
const repeatInterval = 80;
const boundCaptionDuration = 2000;
const LARGE_STEP_FACTOR = 10;

/** CSS timings for discrete value motion (mirrors theme animationConfig). */
const stepperCssTimings: Record<string, string> = {
  bouncy: 'ease-in 200ms',
  lazy: 'ease-in 600ms',
  slow: 'ease-in 500ms',
  medium: 'ease-in-out 250ms',
  quick: 'ease-in 100ms',
  tooltip: 'ease-in 400ms',
  snappy: 'ease-out 80ms',
  gentle: 'ease-in-out 450ms',
};

const noButtonRing = {
  outlineWidth: 0,
  outlineStyle: 'none' as const,
  outlineColor: 'transparent',
};

function preventFocusSteal(e: { preventDefault?: () => void }) {
  // Spectrum / React Aria: spin buttons are not a tab stop and must not
  // steal focus from the field. The ring stays on Input.Box (+/− inside).
  e.preventDefault?.();
}

function useRepeatAction(action: () => void, repeatingRef: MutableRefObject<boolean>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actionRef = useRef(action);
  actionRef.current = action;

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    repeatingRef.current = false;
  }, [repeatingRef]);

  const start = useCallback(() => {
    stop();
    // First tap is discrete; interval ticks are continuous scrub.
    actionRef.current();
    timerRef.current = setTimeout(() => {
      repeatingRef.current = true;
      intervalRef.current = setInterval(() => {
        actionRef.current();
      }, repeatInterval);
    }, repeatDelay);
  }, [stop, repeatingRef]);

  useEffect(() => stop, [stop]);

  return { onPressIn: start, onPressOut: stop, stop };
}

export type StepperProps<
  TParentData = any,
  TName extends DeepKeys<TParentData> = any,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator = any,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  // "onChange"/"value": FormFieldProps carries DOM handlers from YStackProps;
  // this field exposes a canonical numeric value callback instead.
  'children' | 'field' | 'onChange' | 'value'
> &
  Partial<
    Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children' | 'value'>
  > & {
    readOnly?: boolean;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
    showButtons?: boolean;
    /**
     * Spin-button placement. Default `both` (minus | value | plus).
     * `right`/`left` — Spectrum stacked carets on that edge (desktop eject;
     * coerced to `both` on touch).
     */
    buttonPosition?: 'left' | 'right' | 'both';
    /**
     * ISO 4217 code or Frappe-style symbol. Writes the currency glyph beside
     * the value on the locale's side and puts the value on the numeric
     * (end) alignment.
     */
    currency?: string;
    allowEmpty?: boolean;
    placeholder?: string;
    inputProps?: Omit<InputProps, 'value' | 'onChangeText' | 'ref'>;
    /** Standalone (no form/name) change callback — commits on blur and +/- */
    onChange?: (value: number | null) => void;
    /** Standalone controlled value. Omit for uncontrolled (`defaultValue`). */
    value?: number | null;
    /** When true, renders a skeleton placeholder instead of the stepper */
    skeleton?: boolean;
    /** When true, uses compact sizing */
    compact?: boolean;
  };

function StepperSpinButton({
  kind,
  disabled,
  atBound,
  seamWidth,
  stacked,
  seam,
  onPressIn,
  onPressOut,
  onActivate,
  onBoundPress,
  children,
}: {
  kind: 'increment' | 'decrement';
  disabled: boolean;
  atBound: boolean;
  seamWidth: number;
  stacked?: boolean;
  seam?: 'bottom' | 'end' | 'start';
  onPressIn: () => void;
  onPressOut: () => void;
  onActivate: () => void;
  onBoundPress: () => void;
  children: ReactNode;
}) {
  const label = kind === 'increment' ? t('Increase') : t('Decrease');
  const [pressed, setPressed] = useState(false);
  const button = (
    <InputParts.Button
      tabIndex={-1}
      disabled={disabled}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      cursor={disabled || atBound ? 'not-allowed' : 'pointer'}
      opacity={disabled || atBound ? 0.4 : 1}
      backgroundColor={pressed && !disabled && !atBound ? formButtonColors.background.active : 'transparent'}
      height="100%"
      alignSelf="stretch"
      borderBottomWidth={seam === 'bottom' ? seamWidth : 0}
      {...(isWeb
        ? {
            style: {
              borderInlineEndWidth: seam === 'end' ? seamWidth : 0,
              borderInlineStartWidth: seam === 'start' ? seamWidth : 0,
              borderInlineEndStyle: 'solid',
              borderInlineStartStyle: 'solid',
            },
          }
        : {
            borderEndWidth: seam === 'end' ? seamWidth : 0,
            borderStartWidth: seam === 'start' ? seamWidth : 0,
          })}
      borderColor={formInputColors.border.base}
      focusStyle={noButtonRing}
      focusVisibleStyle={noButtonRing}
      hoverStyle={disabled ? { backgroundColor: 'transparent' } : undefined}>
      {children}
    </InputParts.Button>
  );
  const start = () => {
    if (disabled) {
      return;
    }
    setPressed(true);
    onActivate();
    if (atBound) {
      onBoundPress();
    } else {
      onPressIn();
    }
  };
  const stop = () => {
    setPressed(false);
    onPressOut();
  };
  const hitStyle = {
    display: 'flex' as const,
    height: stacked ? ('50%' as const) : ('100%' as const),
    flex: stacked ? 1 : undefined,
  };
  // Keep the press target mounted when a step reaches its bound. Tamagui
  // suppresses aria-disabled presses; the wrapper owns attempted-step feedback.
  return isWeb ? (
    <div
      role="button"
      aria-label={label}
      aria-disabled={disabled || atBound || undefined}
      tabIndex={-1}
      data-stepper-button={kind}
      style={hitStyle}
      onPointerDown={(event) => {
        // This raw wrapper owns the pointer lifecycle. Cancel compatibility
        // mouse events so touch and pen cannot commit the same step twice.
        preventFocusSteal(event);
        start();
      }}
      onMouseDown={preventFocusSteal}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onClick={(event) => {
        if (event.detail !== 0) {
          return;
        }
        start();
        stop();
      }}>
      {button}
    </div>
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || atBound }}
      // An explicit false overrides accessibilityState in React Native.
      disabled={disabled || undefined}
      onPressIn={start}
      onPressOut={stop}
      hitSlop={{ top: seamWidth, bottom: seamWidth }}
      style={hitStyle}>
      {button}
    </Pressable>
  );
}

export function Stepper<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator = any,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: StepperProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const hydrationTouch = useTouchSurface();
  const {
    defaultValue,
    form,
    inputProps,
    min,
    max,
    step = 1,
    precision = 0,
    showButtons = true,
    // Minus | value | plus. Stacked carets are a desktop eject.
    buttonPosition,
    allowEmpty = false,
    placeholder,
    mode,
    name,
    preserveValue,
    validators,
    disabled,
    readOnly,
    label,
    labelProps,
    error: errorProp,
    helperText,
    required,
    size,
    onBlur,
    onChange,
    value: valueProp,
    skeleton,
    compact,
    id: idProp,
    currency,
    ...restProps
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const affix = currencyAffix(currency);
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const motionTransition = knobProps.transition as string | undefined;
  const controlSize = size || knobProps.sizeToken;
  // +/- glyphs are control-internal icons: the recipe's icon channel.
  const iconPx = sizeRecipeForToken(String(controlSize)).iconSize;
  const glyphColor = useGlyphColor();
  const placement = resolveStepperPlacement(buttonPosition, hydrationTouch);
  const isControlled = valueProp !== undefined && !name;

  // Initialize inputValue from defaultValue for standalone mode
  const [inputValue, setInputValue] = useState<string>(() => {
    const initial = isControlled ? valueProp : defaultValue;
    if (initial !== undefined && initial !== null) {
      return precision > 0 ? (initial as number).toFixed(precision) : String(initial);
    }
    return '';
  });
  // Discrete +/- taps tween the value chrome; hold-repeat / typing stay live.
  // Opacity (not transform) — Tamagui Input owns transform internally on web.
  const [valueFlash, setValueFlash] = useState(false);
  const [boundCaption, setBoundCaption] = useState<string | null>(null);
  const boundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearBoundCaption = useCallback(() => {
    if (boundTimerRef.current) {
      clearTimeout(boundTimerRef.current);
    }
    boundTimerRef.current = null;
    setBoundCaption(null);
  }, []);
  const showBoundCaption = useCallback((kind: 'min' | 'max') => {
    if (boundTimerRef.current) {
      clearTimeout(boundTimerRef.current);
    }
    setBoundCaption(kind === 'min' ? t('Minimum reached') : t('Maximum reached'));
    boundTimerRef.current = setTimeout(() => {
      boundTimerRef.current = null;
      setBoundCaption(null);
    }, boundCaptionDuration);
  }, []);
  useEffect(
    () => () => {
      if (boundTimerRef.current) {
        clearTimeout(boundTimerRef.current);
      }
    },
    [],
  );
  const repeatingRef = useRef(false);
  const typingRef = useRef(false);
  const incrementRef = useRef<() => void>(() => {});
  const decrementRef = useRef<() => void>(() => {});
  const areaRef = useRef<any>(null);

  const focusArea = useCallback(() => {
    const node = areaRef.current as { focus?: () => void } | null;
    node?.focus?.();
  }, []);

  const pulseDiscreteStep = useCallback(() => {
    if (repeatingRef.current || typingRef.current) {
      return;
    }
    // No tween when the animation knob resolves to none.
    if (!motionTransition) {
      return;
    }
    setValueFlash(true);
    // Hold the dipped opacity long enough for the CSS transition to paint
    // intermediates (quick = 100ms).
    setTimeout(() => {
      setValueFlash(false);
    }, 90);
  }, [motionTransition]);

  const repeatIncrement = useRepeatAction(() => {
    incrementRef.current();
  }, repeatingRef);
  const repeatDecrement = useRepeatAction(() => {
    decrementRef.current();
  }, repeatingRef);

  // Format number to string with precision
  const formatValue = useCallback(
    (value: number | null): string => {
      if (value === null || value === undefined) {
        return '';
      }
      return precision > 0 ? value.toFixed(precision) : value.toString();
    },
    [precision],
  );

  // Parse string to number
  const parseValue = useCallback(
    (value: string): number | null => {
      if (value === '' && allowEmpty) {
        return null;
      }
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    },
    [allowEmpty],
  );

  // Normalize bounds so reversed min/max still clamp into the real range
  const boundsLo = min !== undefined && max !== undefined ? Math.min(min, max) : min;
  const boundsHi = min !== undefined && max !== undefined ? Math.max(min, max) : max;

  // Clamp value within min/max bounds
  const clampValue = useCallback(
    (value: number | null): number | null => {
      if (value === null) {
        return null;
      }
      if (boundsLo !== undefined && value < boundsLo) {
        return boundsLo;
      }
      if (boundsHi !== undefined && value > boundsHi) {
        return boundsHi;
      }
      return value;
    },
    [boundsLo, boundsHi],
  );

  const commitNumber = useCallback(
    (next: number | null, pulse = false) => {
      const clamped = clampValue(next);
      const formatted = formatValue(clamped);
      if (formatted === inputValue) {
        return;
      }
      clearBoundCaption();
      if (pulse) {
        pulseDiscreteStep();
      }
      setInputValue(formatted);
      if (!name) {
        onChange?.(clamped);
      }
    },
    [clampValue, formatValue, inputValue, name, onChange, pulseDiscreteStep, clearBoundCaption],
  );

  const applyDelta = useCallback(
    (delta: number) => {
      if (disabled || readOnly) {
        return;
      }
      const current = parseValue(inputValue);
      const from = current ?? 0;
      if (current !== null && delta < 0 && boundsLo !== undefined && from <= boundsLo) {
        showBoundCaption('min');
        return;
      }
      if (current !== null && delta > 0 && boundsHi !== undefined && from >= boundsHi) {
        showBoundCaption('max');
        return;
      }
      commitNumber(from + delta, true);
    },
    [disabled, readOnly, parseValue, inputValue, commitNumber, boundsLo, boundsHi, showBoundCaption],
  );

  useEffect(() => {
    const current = parseValue(inputValue);
    if (disabled || readOnly || (current !== null && boundsHi !== undefined && current >= boundsHi)) {
      repeatIncrement.stop();
    }
    if (disabled || readOnly || (current !== null && boundsLo !== undefined && current <= boundsLo)) {
      repeatDecrement.stop();
    }
  }, [inputValue, parseValue, boundsLo, boundsHi, disabled, readOnly, repeatIncrement.stop, repeatDecrement.stop]);

  const increment = useCallback(() => {
    applyDelta(step);
  }, [applyDelta, step]);
  const decrement = useCallback(() => {
    applyDelta(-step);
  }, [applyDelta, step]);

  incrementRef.current = increment;
  decrementRef.current = decrement;

  useEffect(() => {
    if (!isControlled || typingRef.current) {
      return;
    }
    const formatted = formatValue(valueProp ?? null);
    setInputValue((prev) => (prev === formatted ? prev : formatted));
  }, [isControlled, valueProp, formatValue]);

  const { wheelProps } = useWheelIncrement({
    onIncrement: increment,
    onDecrement: decrement,
    disabled,
    readOnly,
  });

  const handleStepperKeyDown = useCallback(
    (event: any) => {
      if (disabled || readOnly) {
        return;
      }
      const unit = event.shiftKey ? step * LARGE_STEP_FACTOR : step;
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          applyDelta(unit);
          break;
        case 'ArrowDown':
          event.preventDefault();
          applyDelta(-unit);
          break;
        case 'PageUp':
          event.preventDefault();
          applyDelta(step * LARGE_STEP_FACTOR);
          break;
        case 'PageDown':
          event.preventDefault();
          applyDelta(-step * LARGE_STEP_FACTOR);
          break;
        case 'Home':
          if (boundsLo !== undefined) {
            event.preventDefault();
            commitNumber(boundsLo, true);
          }
          break;
        case 'End':
          if (boundsHi !== undefined) {
            event.preventDefault();
            commitNumber(boundsHi, true);
          }
          break;
        default:
          break;
      }
    },
    [disabled, readOnly, step, applyDelta, boundsLo, boundsHi, commitNumber],
  );

  // Handle input change
  const handleInputChange = useCallback(
    (text: string) => {
      typingRef.current = true;
      // Allow empty string
      if (text === '' && allowEmpty) {
        setInputValue('');
        return;
      }

      // Only allow valid number characters
      const cleanText = text.replace(/[^0-9.-]/g, '');

      // Prevent multiple decimal points
      if (precision === 0 && cleanText.includes('.')) {
        return;
      }

      setInputValue(cleanText);
    },
    [allowEmpty, precision],
  );

  const renderNumberRow = (onBlurHandler?: () => void, onFocusHandler?: () => void, hasError?: boolean) => {
    const currentValue = parseValue(inputValue);
    const atMin = currentValue !== null && boundsLo !== undefined && currentValue <= boundsLo;
    const atMax = currentValue !== null && boundsHi !== undefined && currentValue >= boundsHi;
    const live = repeatingRef.current || typingRef.current;
    const timing = motionTransition ? (stepperCssTimings[motionTransition] ?? stepperCssTimings.quick) : undefined;
    // Prefer explicit CSS opacity transition — Tamagui `transition` on Input can
    // compile to `all` and fight focus rings; scoped opacity is enough for jump motion.
    const valueMotionStyle =
      !live && timing
        ? {
            transition: isWeb ? `opacity ${timing}` : undefined,
            opacity: valueFlash ? 0.45 : 1,
          }
        : { opacity: 1 };

    const stacked = placement === 'left' || placement === 'right';
    const showSpin = showButtons && !readOnly;
    const seamWidth = knobProps.borderRadius.borderWidth;

    const decrementButton = (
      <StepperSpinButton
        kind="decrement"
        disabled={!!disabled}
        atBound={atMin}
        seamWidth={seamWidth}
        stacked={stacked}
        seam={placement === 'both' ? 'end' : undefined}
        onPressIn={repeatDecrement.onPressIn}
        onPressOut={repeatDecrement.onPressOut}
        onActivate={focusArea}
        onBoundPress={() => {
          showBoundCaption('min');
        }}>
        {stacked ? (
          <CaretDownIcon size={iconPx} weight="bold" color={glyphColor} aria-hidden />
        ) : (
          <MinusIcon size={iconPx} weight="bold" color={glyphColor} aria-hidden />
        )}
      </StepperSpinButton>
    );
    const incrementButton = (
      <StepperSpinButton
        kind="increment"
        disabled={!!disabled}
        atBound={atMax}
        seamWidth={seamWidth}
        stacked={stacked}
        seam={stacked ? 'bottom' : placement === 'both' ? 'start' : undefined}
        onPressIn={repeatIncrement.onPressIn}
        onPressOut={repeatIncrement.onPressOut}
        onActivate={focusArea}
        onBoundPress={() => {
          showBoundCaption('max');
        }}>
        {stacked ? (
          <CaretUpIcon size={iconPx} weight="bold" color={glyphColor} aria-hidden />
        ) : (
          <PlusIcon size={iconPx} weight="bold" color={glyphColor} aria-hidden />
        )}
      </StepperSpinButton>
    );

    const spinColumn = (edge: 'start' | 'end') => (
      <View
        flexDirection="column"
        alignSelf="stretch"
        flexShrink={0}
        width={controlSize}
        {...(isWeb
          ? {
              borderInlineStartWidth: edge === 'end' ? seamWidth : 0,
              borderInlineEndWidth: edge === 'start' ? seamWidth : 0,
              borderInlineStartStyle: 'solid',
              borderInlineEndStyle: 'solid',
            }
          : {
              borderStartWidth: edge === 'end' ? seamWidth : 0,
              borderEndWidth: edge === 'start' ? seamWidth : 0,
            })}
        borderColor={formInputColors.border.base}>
        {incrementButton}
        {decrementButton}
      </View>
    );

    const area = (
      <InputParts.Area
        ref={areaRef}
        id={id}
        value={inputValue}
        placeholder={placeholder}
        keyboardType={precision > 0 ? 'decimal-pad' : 'numeric'}
        inputMode={precision > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        disabled={disabled}
        readOnly={!!readOnly}
        role="spinbutton"
        aria-valuenow={currentValue ?? undefined}
        aria-valuemin={boundsLo}
        aria-valuemax={boundsHi}
        // Labelled: the sibling Label wires `aria-labelledby` onto this id
        // itself — naming it here too doubles the spoken name.
        aria-label={label ? undefined : t('Number')}
        aria-required={required || undefined}
        aria-invalid={hasError || undefined}
        aria-readonly={readOnly || undefined}
        data-stepper-value
        data-stepper-live={live ? 'true' : undefined}
        data-stepper-flash={valueFlash ? 'true' : undefined}
        onChangeText={readOnly ? undefined : handleInputChange}
        textAlign={affix ? 'right' : 'center'}
        opacity={valueMotionStyle.opacity}
        // Native value tween intentionally disabled: Tamagui's RN
        // animation driver crashes Hermes ("Cannot add new property
        // '_tracking'") when animating a text input. Web keeps the CSS tween.
        {...(inputProps as any)}
        {...(isWeb
          ? {
              style: {
                ...(inputProps as any)?.style,
                transition: valueMotionStyle.transition,
                opacity: valueMotionStyle.opacity,
              },
            }
          : undefined)}
        onKeyDown={(event: any) => {
          (inputProps as any)?.onKeyDown?.(event);
          if (event.defaultPrevented) {
            return;
          }
          handleStepperKeyDown(event);
        }}
        {...(onBlurHandler
          ? {
              onBlur: () => {
                typingRef.current = false;
                clearBoundCaption();
                onBlurHandler();
              },
            }
          : {
              onBlur: () => {
                typingRef.current = false;
                clearBoundCaption();
              },
            })}
        {...(onFocusHandler ? { onFocus: onFocusHandler } : undefined)}
      />
    );

    // T-VALUE: the glyph is part of the amount, never dimmed by textAccent.
    const affixGlyph = affix ? (
      <Text
        data-testid="stepper-currency"
        data-text-class="T-VALUE"
        aria-hidden
        alignSelf="center"
        flexShrink={0}
        paddingHorizontal="$1.5"
        {...knobProps.body}
        fontSize={sizeRecipeForToken(String(controlSize), { touch: hydrationTouch }).fontSize}
        color="$color"
        userSelect="none">
        {affix.glyph}
      </Text>
    ) : null;

    // Ring rides Input.Box so +/− sit inside the perceived boundary.
    const box = (
      <InputParts.Box
        size={controlSize}
        disabled={disabled}
        data-stepper="true"
        data-stepper-control="true"
        data-stepper-placement={placement}
        {...(showSpin
          ? {
              paddingHorizontal: 0,
              sizeRecipeEscape: 'LC-81 stepper segments reach the compound frame edges',
            }
          : undefined)}>
        {showSpin && placement === 'both' ? decrementButton : null}
        {showSpin && placement === 'left' ? spinColumn('start') : null}
        {affix?.position === 'leading' ? affixGlyph : null}
        {area}
        {affix?.position === 'trailing' ? affixGlyph : null}
        {showSpin && placement === 'right' ? spinColumn('end') : null}
        {showSpin && placement === 'both' ? incrementButton : null}
      </InputParts.Box>
    );

    // Wrap with wheel handler on web
    if (isWeb && !disabled && !readOnly) {
      return (
        <div {...wheelProps} style={{ minWidth: 0, width: '100%' }}>
          {box}
        </div>
      );
    }
    return box;
  };

  // Render skeleton placeholder
  if (skeleton) {
    return (
      <InputParts size={controlSize}>
        {label && <Skeleton variant="text" width="30%" />}
        <Skeleton variant="rounded" width="100%" height={controlSize} />
      </InputParts>
    );
  }

  if (!resolvedForm || !name) {
    const commitStandalone = () => {
      const clamped = clampValue(parseValue(inputValue));
      setInputValue(formatValue(clamped));
      onChange?.(clamped);
    };
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={errorProp}
        helperText={boundCaption ?? helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        <InputParts size={controlSize}>{renderNumberRow(commitStandalone, undefined, !!errorProp)}</InputParts>
      </FieldLayout>
    );
  }

  // Works with TanStack Form context
  return (
    <Field
      defaultValue={defaultValue}
      form={resolvedForm}
      mode={mode}
      name={name}
      preserveValue={preserveValue}
      validators={resolvedValidators}>
      {(field) => (
        <StepperFieldRenderer
          field={field}
          fieldProps={{
            label,
            labelProps,
            error: errorProp,
            helperText: boundCaption ?? helperText,
            required,
            size,
            readOnly,
            disabled,
            onBlur,
            ...restProps,
          }}
          id={id}
          inputValue={inputValue}
          setInputValue={setInputValue}
          formatValue={formatValue}
          parseValue={parseValue}
          clampValue={clampValue}
          knobProps={knobProps}
          controlSize={controlSize}
          renderNumberRow={renderNumberRow}
        />
      )}
    </Field>
  );
}

function StepperFieldRenderer<TData>({
  field,
  fieldProps,
  id,
  inputValue,
  setInputValue,
  formatValue,
  parseValue,
  clampValue,
  knobProps,
  controlSize,
  renderNumberRow,
}: any) {
  const isFieldUpdateRef = useRef(false);

  useEffect(() => {
    const fieldValue = field.state.value as number | null;
    if (fieldValue !== undefined && fieldValue !== null) {
      const formatted = formatValue(fieldValue);
      if (formatted !== inputValue) {
        isFieldUpdateRef.current = true;
        setInputValue(formatted);
      }
    } else if (fieldValue === null && inputValue !== '') {
      isFieldUpdateRef.current = true;
      setInputValue('');
    }
  }, [field.state.value, formatValue, setInputValue]);

  useEffect(() => {
    if (isFieldUpdateRef.current) {
      isFieldUpdateRef.current = false;
      return;
    }
    const parsedValue = parseValue(inputValue);
    const clampedValue = clampValue(parsedValue);
    if (clampedValue !== field.state.value) {
      field.handleChange(clampedValue as TData);
    }
  }, [inputValue, parseValue, clampValue, field.handleChange, field.state.value]);

  const error = getFieldError(field, fieldProps.error);

  return (
    <FieldLayout
      id={id}
      label={fieldProps.label}
      labelProps={fieldProps.labelProps}
      error={error}
      helperText={fieldProps.helperText}
      required={fieldProps.required}
      size={fieldProps.size}
      knobProps={knobProps}
      onBlur={mergeFieldHandler(field, 'handleBlur', fieldProps.onBlur)}
      // See standalone branch — FieldLayout carries dimWhole.
      disabled={fieldProps.disabled}>
      <InputParts size={fieldProps.size || controlSize || knobProps.sizeToken}>
        {renderNumberRow(undefined, () => field.handleChange(parseValue(inputValue) as TData), !!error)}
      </InputParts>
    </FieldLayout>
  );
}

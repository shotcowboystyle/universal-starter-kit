import { CaretDownIcon, CaretUpIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { useTouchSurface, currencyAffix, sizeRecipeForToken, useGlyphColor } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ComponentProps,
  CSSProperties,
  Dispatch,
  KeyboardEvent,
  ReactElement,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';
import { Pressable } from 'react-native';
import type { SizeTokens, TamaguiElement } from 'tamagui';
import { isWeb, Text, useProps, View } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import type { FormFieldProps } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formButtonColors, formInputColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { useWheelIncrement } from '../../shared/use-wheel-increment';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, SimpleFieldApi } from '../../types';

import { resolveStepperPlacement } from './resolve-stepper-placement';
import type { StepperButtonPosition } from './resolve-stepper-placement';

export { resolveStepperPlacement, type StepperButtonPosition } from './resolve-stepper-placement';

type AreaProps = ComponentProps<typeof InputParts.Area>;

const repeatDelay = 400;
const repeatInterval = 80;
const boundCaptionDuration = 2000;
const LARGE_STEP_FACTOR = 10;

/** CSS timings for discrete value motion (mirrors theme animationConfig). */
const stepperCssTimings = {
  bouncy: 'ease-in 200ms',
  lazy: 'ease-in 600ms',
  slow: 'ease-in 500ms',
  medium: 'ease-in-out 250ms',
  quick: 'ease-in 100ms',
  tooltip: 'ease-in 400ms',
  snappy: 'ease-out 80ms',
  gentle: 'ease-in-out 450ms',
} as const satisfies Record<string, string>;

const stepperTimingFor = (transition: KnobProps['transition']): string =>
  Object.entries(stepperCssTimings).find(([name]) => name === transition)?.[1] ?? stepperCssTimings.quick;

interface StepperKeyEvent {
  key: string;
  shiftKey: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
}

const noButtonRing = {
  outlineWidth: 0,
  outlineStyle: 'none' as const,
  outlineColor: 'transparent',
};

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

const preventFocusSteal = (e: { preventDefault?: () => void }) => {
  // Spectrum / React Aria: spin buttons are not a tab stop and must not
  // steal focus from the field. The ring stays on Input.Box (+/− inside).
  e.preventDefault?.();
};

const useRepeatAction = (action: () => void, repeatingRef: RefObject<boolean>) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actionRef = useRef(action);
  useLayoutEffect(() => {
    actionRef.current = action;
  });

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current !== null) {
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
};

export type StepperProps<
  TParentData = unknown,
  TName extends string = string,
  TFieldValidator = unknown,
  TFormValidator = unknown,
  TData = number | null,
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
    buttonPosition?: StepperButtonPosition;
    /**
     * ISO 4217 code or a currency symbol (e.g. `₹`). Writes the currency glyph beside
     * the value on the locale's side and puts the value on the numeric
     * (end) alignment.
     */
    currency?: string;
    allowEmpty?: boolean;
    placeholder?: string;
    inputProps?: Omit<AreaProps, 'value' | 'onChangeText' | 'ref' | 'role'>;
    /** Standalone (no form/name) change callback — commits on blur and +/- */
    onChange?: (value: number | null) => void;
    /** Standalone controlled value. Omit for uncontrolled (`defaultValue`). */
    value?: number | null;
    /** When true, renders a skeleton placeholder instead of the stepper */
    skeleton?: boolean;
    /** When true, uses compact sizing */
    compact?: boolean;
  };

const StepperSpinButton = ({
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
  seam?: SpinSeam;
  onPressIn: () => void;
  onPressOut: () => void;
  onActivate: () => void;
  onBoundPress: () => void;
  children: ReactNode;
}) => {
  const label = kind === 'increment' ? t('Increase') : t('Decrease');
  const [pressed, setPressed] = useState(false);
  const blocked = disabled || atBound;
  const button = (
    <InputParts.Button
      tabIndex={-1}
      disabled={disabled}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      cursor={blocked ? 'not-allowed' : 'pointer'}
      opacity={blocked ? 0.4 : 1}
      backgroundColor={pressed && !blocked ? formButtonColors.background.active : 'transparent'}
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
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- deliberately not a tab stop (tabIndex -1); keyboard users step via the spinbutton's arrow keys, and detail === 0 clicks cover assistive-tech activation
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a real <button> would nest inside InputParts.Button's own interactive content and add UA button chrome
      role="button"
      aria-label={label}
      aria-disabled={blocked || undefined}
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
      accessibilityState={{ disabled: blocked }}
      // An explicit false overrides accessibilityState in React Native.
      disabled={disabled || undefined}
      onPressIn={start}
      onPressOut={stop}
      hitSlop={{ top: seamWidth, bottom: seamWidth }}
      style={hitStyle}>
      {button}
    </Pressable>
  );
};

interface StepperFieldRendererProps {
  field: SimpleFieldApi<number | null>;
  fieldProps: Pick<
    StepperProps,
    'label' | 'labelProps' | 'error' | 'helperText' | 'required' | 'size' | 'disabled' | 'onBlur'
  >;
  id: string;
  inputValue: string;
  setInputValue: Dispatch<SetStateAction<string>>;
  formatValue: (value: number | null) => string;
  parseValue: (value: string) => number | null;
  clampValue: (value: number | null) => number | null;
  knobProps: KnobProps;
  controlSize: SizeTokens | undefined;
  renderNumberRow: (onBlurHandler?: () => void, onFocusHandler?: () => void, hasError?: boolean) => ReactNode;
}

const StepperFieldRenderer = ({
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
}: StepperFieldRendererProps) => {
  const isFieldUpdateRef = useRef(false);
  const fieldValue = field.state.value;
  const { handleChange } = field;

  useEffect(() => {
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
    // inputValue is read but deliberately not a dependency: re-running on every keystroke would overwrite in-progress text (e.g. "1.") with the formatted field value
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [fieldValue, formatValue, setInputValue]);

  useEffect(() => {
    if (isFieldUpdateRef.current) {
      isFieldUpdateRef.current = false;
      return;
    }
    const parsedValue = parseValue(inputValue);
    const clampedValue = clampValue(parsedValue);
    if (clampedValue !== fieldValue) {
      handleChange(clampedValue);
    }
  }, [inputValue, parseValue, clampValue, handleChange, fieldValue]);

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
      <InputParts size={fieldProps.size ?? controlSize ?? knobProps.sizeToken}>
        {renderNumberRow(
          undefined,
          () => {
            handleChange(parseValue(inputValue));
          },
          hasErrorValue(error),
        )}
      </InputParts>
    </FieldLayout>
  );
};

type SpinSeam = 'bottom' | 'end' | 'start';

/**
 * The consumer's own input style as a CSS object (web branch only).
 * SAFETY: on web, Tamagui Input's `style` is a plain CSS object; arrays and falsy values spread to nothing useful, exactly as before.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
const webInputStyle = (style: AreaProps['style']) => style as CSSProperties | undefined;

type StepperKeyAction = { kind: 'delta'; delta: number } | { kind: 'lower' } | { kind: 'upper' };

/** What a key press asks the stepper to do: step by a delta, or jump to a bound. */
const stepperKeyAction = (key: string, shiftKey: boolean, step: number): StepperKeyAction | undefined => {
  const unit = shiftKey ? step * LARGE_STEP_FACTOR : step;
  switch (key) {
    case 'ArrowUp': {
      return { kind: 'delta', delta: unit };
    }
    case 'ArrowDown': {
      return { kind: 'delta', delta: -unit };
    }
    case 'PageUp': {
      return { kind: 'delta', delta: step * LARGE_STEP_FACTOR };
    }
    case 'PageDown': {
      return { kind: 'delta', delta: -step * LARGE_STEP_FACTOR };
    }
    case 'Home': {
      return { kind: 'lower' };
    }
    case 'End': {
      return { kind: 'upper' };
    }
    default: {
      return undefined;
    }
  }
};

const atLowerBound = (value: number | null, bound: number | undefined): boolean =>
  value !== null && bound !== undefined && value <= bound;

const atUpperBound = (value: number | null, bound: number | undefined): boolean =>
  value !== null && bound !== undefined && value >= bound;

const isStacked = (placement: StepperButtonPosition): boolean => placement === 'left' || placement === 'right';

const incrementSeamFor = (placement: StepperButtonPosition): SpinSeam | undefined => {
  if (isStacked(placement)) {
    return 'bottom';
  }
  return placement === 'both' ? 'start' : undefined;
};

type SpinColumnBuilder = (edge: 'start' | 'end') => ReactElement;

/** The spin control(s) that sit before the value: the minus button, or the left caret column. */
const spinBefore = (
  placement: StepperButtonPosition,
  decrementButton: ReactElement,
  spinColumn: SpinColumnBuilder,
): ReactElement | null => {
  if (placement === 'both') {
    return decrementButton;
  }
  return placement === 'left' ? spinColumn('start') : null;
};

/** The spin control(s) that sit after the value: the plus button, or the right caret column. */
const spinAfter = (
  placement: StepperButtonPosition,
  incrementButton: ReactElement,
  spinColumn: SpinColumnBuilder,
): ReactElement | null => {
  if (placement === 'both') {
    return incrementButton;
  }
  return placement === 'right' ? spinColumn('end') : null;
};

const SPIN_ICONS = {
  decrement: { stacked: CaretDownIcon, flat: MinusIcon },
  increment: { stacked: CaretUpIcon, flat: PlusIcon },
} as const;

interface StepperSpinControlProps {
  kind: 'increment' | 'decrement';
  stacked: boolean;
  seam: SpinSeam | undefined;
  disabled: boolean;
  atBound: boolean;
  seamWidth: number;
  iconPx: number;
  glyphColor: ReturnType<typeof useGlyphColor>;
  repeat: { onPressIn: () => void; onPressOut: () => void };
  onActivate: () => void;
  onBoundPress: () => void;
}

const StepperSpinControl = ({
  kind,
  stacked,
  seam,
  disabled,
  atBound,
  seamWidth,
  iconPx,
  glyphColor,
  repeat,
  onActivate,
  onBoundPress,
}: StepperSpinControlProps) => {
  const Icon = SPIN_ICONS[kind][stacked ? 'stacked' : 'flat'];
  const { onPressIn: handlePressIn, onPressOut: handlePressOut } = repeat;
  return (
    <StepperSpinButton
      kind={kind}
      disabled={disabled}
      atBound={atBound}
      seamWidth={seamWidth}
      stacked={stacked}
      seam={seam}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onActivate={onActivate}
      onBoundPress={onBoundPress}>
      <Icon
        size={iconPx}
        weight="bold"
        color={glyphColor}
        aria-hidden
      />
    </StepperSpinButton>
  );
};

const StepperSpinColumn = ({
  edge,
  seamWidth,
  controlSize,
  children,
}: {
  edge: 'start' | 'end';
  seamWidth: number;
  controlSize: SizeTokens | undefined;
  children: ReactNode;
}) => (
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
    {children}
  </View>
);

/** T-VALUE: the glyph is part of the amount, never dimmed by textAccent. */
const StepperAffixGlyph = ({
  glyph,
  knobProps,
  controlSize,
  touch,
}: {
  glyph: string;
  knobProps: KnobProps;
  controlSize: SizeTokens | undefined;
  touch: boolean;
}) => (
  <Text
    data-testid="stepper-currency"
    data-text-class="T-VALUE"
    aria-hidden
    alignSelf="center"
    flexShrink={0}
    paddingHorizontal="$1.5"
    {...knobProps.body}
    fontSize={sizeRecipeForToken(String(controlSize), { touch }).fontSize}
    color="$color"
    userSelect="none">
    {glyph}
  </Text>
);

interface ValueMotion {
  transition?: string;
  opacity: number;
}

/**
 * Prefer explicit CSS opacity transition — Tamagui `transition` on Input can
 * compile to `all` and fight focus rings; scoped opacity is enough for jump motion.
 */
const valueMotionFor = (motionTransition: KnobProps['transition'], live: boolean, valueFlash: boolean): ValueMotion => {
  const hasMotion = motionTransition !== undefined && motionTransition !== '';
  if (live || !hasMotion) {
    return { opacity: 1 };
  }
  return {
    transition: isWeb ? `opacity ${stepperTimingFor(motionTransition)}` : undefined,
    opacity: valueFlash ? 0.45 : 1,
  };
};

interface StepperAreaProps {
  areaRef: RefObject<TamaguiElement | null>;
  id: string;
  inputValue: string;
  placeholder: string | undefined;
  precision: number;
  disabled: boolean | undefined;
  readOnly: boolean | undefined;
  required: boolean | undefined;
  hasLabel: boolean;
  hasError: boolean;
  currentValue: number | null;
  boundsLo: number | undefined;
  boundsHi: number | undefined;
  live: boolean;
  valueFlash: boolean;
  hasAffix: boolean;
  motion: ValueMotion;
  inputProps: StepperProps['inputProps'];
  onChangeText: (text: string) => void;
  onStepperKeyDown: (event: StepperKeyEvent) => void;
  onBlur: () => void;
  onFocus: (() => void) | undefined;
}

const StepperArea = ({
  areaRef,
  id,
  inputValue,
  placeholder,
  precision,
  disabled,
  readOnly,
  required,
  hasLabel,
  hasError,
  currentValue,
  boundsLo,
  boundsHi,
  live,
  valueFlash,
  hasAffix,
  motion,
  inputProps,
  onChangeText,
  onStepperKeyDown,
  onBlur,
  onFocus,
}: StepperAreaProps) => (
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
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui Input renders the <input>; the explicit spinbutton role (with aria-value*) is what lets assistive tech announce stepping
    role="spinbutton"
    aria-valuenow={currentValue ?? undefined}
    aria-valuemin={boundsLo}
    aria-valuemax={boundsHi}
    // Labeled: the sibling Label wires `aria-labelledby` onto this id
    // itself — naming it here too doubles the spoken name.
    aria-label={hasLabel ? undefined : t('Number')}
    aria-required={required ? true : undefined}
    aria-invalid={hasError ? true : undefined}
    aria-readonly={readOnly ? true : undefined}
    data-stepper-value
    data-stepper-live={live ? 'true' : undefined}
    data-stepper-flash={valueFlash ? 'true' : undefined}
    onChangeText={readOnly ? undefined : onChangeText}
    textAlign={hasAffix ? 'right' : 'center'}
    opacity={motion.opacity}
    // Native value tween intentionally disabled: Tamagui's RN
    // animation driver crashes Hermes ("Cannot add new property
    // '_tracking'") when animating a text input. Web keeps the CSS tween.
    {...inputProps}
    {...(isWeb
      ? {
          style: {
            ...webInputStyle(inputProps?.style),
            transition: motion.transition,
            opacity: motion.opacity,
          },
        }
      : undefined)}
    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
      inputProps?.onKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }
      onStepperKeyDown(event);
    }}
    onBlur={onBlur}
    {...(onFocus ? { onFocus } : undefined)}
  />
);

/** Bound-hit caption ("Minimum reached") that self-clears after a short delay. */
const useBoundCaption = () => {
  const [boundCaption, setBoundCaption] = useState<string | null>(null);
  const boundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearBoundCaption = useCallback(() => {
    if (boundTimerRef.current !== null) {
      clearTimeout(boundTimerRef.current);
    }
    boundTimerRef.current = null;
    setBoundCaption(null);
  }, []);
  const showBoundCaption = useCallback((kind: 'min' | 'max') => {
    if (boundTimerRef.current !== null) {
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
      if (boundTimerRef.current !== null) {
        clearTimeout(boundTimerRef.current);
      }
    },
    [],
  );
  return { boundCaption, clearBoundCaption, showBoundCaption };
};
/** Number <-> text conversion and min/max clamping for the stepper's text value. */
const useStepperNumbers = ({
  precision,
  allowEmpty,
  min,
  max,
}: {
  precision: number;
  allowEmpty: boolean;
  min: number | undefined;
  max: number | undefined;
}) => {
  // Format number to string with precision
  const formatValue = useCallback(
    (value: number | null): string => {
      if (value === null) {
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
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- parseFloat deliberately accepts a numeric prefix while typing (e.g. "1-" or "1.2.3"); Number() would reject it
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

  return { formatValue, parseValue, clampValue, boundsLo, boundsHi };
};

interface StepperNumberRowProps {
  id: string;
  inputValue: string;
  placeholder: string | undefined;
  precision: number;
  disabled: boolean | undefined;
  readOnly: boolean | undefined;
  required: boolean | undefined;
  hasLabel: boolean;
  hasError: boolean;
  parseValue: (value: string) => number | null;
  boundsLo: number | undefined;
  boundsHi: number | undefined;
  placement: ReturnType<typeof resolveStepperPlacement>;
  showButtons: boolean;
  knobProps: KnobProps;
  controlSize: SizeTokens | undefined;
  iconPx: number;
  glyphColor: ReturnType<typeof useGlyphColor>;
  repeatIncrement: ReturnType<typeof useRepeatAction>;
  repeatDecrement: ReturnType<typeof useRepeatAction>;
  focusArea: () => void;
  showBoundCaption: (kind: 'min' | 'max') => void;
  areaRef: RefObject<TamaguiElement | null>;
  valueFlash: boolean;
  repeatingRef: RefObject<boolean>;
  typingRef: RefObject<boolean>;
  motionTransition: KnobProps['transition'];
  inputProps: StepperProps['inputProps'];
  affix: ReturnType<typeof currencyAffix>;
  hydrationTouch: boolean;
  handleInputChange: (text: string) => void;
  handleStepperKeyDown: (event: StepperKeyEvent) => void;
  clearBoundCaption: () => void;
  wheelProps: ReturnType<typeof useWheelIncrement>['wheelProps'];
  onBlurHandler: (() => void) | undefined;
  onFocusHandler: (() => void) | undefined;
}

const StepperNumberRow = ({
  id,
  inputValue,
  placeholder,
  precision,
  disabled,
  readOnly,
  required,
  hasLabel,
  hasError,
  parseValue,
  boundsLo,
  boundsHi,
  placement,
  showButtons,
  knobProps,
  controlSize,
  iconPx,
  glyphColor,
  repeatIncrement,
  repeatDecrement,
  focusArea,
  showBoundCaption,
  areaRef,
  valueFlash,
  repeatingRef,
  typingRef,
  motionTransition,
  inputProps,
  affix,
  hydrationTouch,
  handleInputChange,
  handleStepperKeyDown,
  clearBoundCaption,
  wheelProps,
  onBlurHandler,
  onFocusHandler,
}: StepperNumberRowProps) => {
  const currentValue = parseValue(inputValue);
  const atMin = atLowerBound(currentValue, boundsLo);
  const atMax = atUpperBound(currentValue, boundsHi);
  // oxlint-disable-next-line react/refs -- hold-repeat and typing are imperative gestures that deliberately live in refs; they only choose the no-tween styling for this render
  const live = repeatingRef.current || typingRef.current;
  const stacked = isStacked(placement);
  const showSpin = showButtons && !readOnly;
  const seamWidth = knobProps.borderRadius.borderWidth;

  const decrementButton = (
    <StepperSpinControl
      kind="decrement"
      disabled={!!disabled}
      atBound={atMin}
      seamWidth={seamWidth}
      stacked={stacked}
      seam={placement === 'both' ? 'end' : undefined}
      iconPx={iconPx}
      glyphColor={glyphColor}
      repeat={repeatDecrement}
      onActivate={focusArea}
      onBoundPress={() => {
        showBoundCaption('min');
      }}
    />
  );
  const incrementButton = (
    <StepperSpinControl
      kind="increment"
      disabled={!!disabled}
      atBound={atMax}
      seamWidth={seamWidth}
      stacked={stacked}
      seam={incrementSeamFor(placement)}
      iconPx={iconPx}
      glyphColor={glyphColor}
      repeat={repeatIncrement}
      onActivate={focusArea}
      onBoundPress={() => {
        showBoundCaption('max');
      }}
    />
  );

  const spinColumn = (edge: 'start' | 'end') => (
    <StepperSpinColumn
      edge={edge}
      seamWidth={seamWidth}
      controlSize={controlSize}>
      {incrementButton}
      {decrementButton}
    </StepperSpinColumn>
  );

  const area = (
    <StepperArea
      areaRef={areaRef}
      id={id}
      inputValue={inputValue}
      placeholder={placeholder}
      precision={precision}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      hasLabel={hasLabel}
      hasError={hasError}
      currentValue={currentValue}
      boundsLo={boundsLo}
      boundsHi={boundsHi}
      // oxlint-disable-next-line react/refs -- hold-repeat and typing are imperative gestures that deliberately live in refs; they only choose the no-tween styling for this render
      live={live}
      valueFlash={valueFlash}
      hasAffix={affix !== undefined}
      // oxlint-disable-next-line react/refs -- same imperative live flag as above
      motion={valueMotionFor(motionTransition, live, valueFlash)}
      inputProps={inputProps}
      onChangeText={handleInputChange}
      onStepperKeyDown={handleStepperKeyDown}
      onBlur={() => {
        typingRef.current = false;
        clearBoundCaption();
        onBlurHandler?.();
      }}
      onFocus={onFocusHandler}
    />
  );

  const affixGlyph =
    affix === undefined ? null : (
      <StepperAffixGlyph
        glyph={affix.glyph}
        knobProps={knobProps}
        controlSize={controlSize}
        touch={hydrationTouch}
      />
    );

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
      {showSpin ? spinBefore(placement, decrementButton, spinColumn) : null}
      {affix?.position === 'leading' ? affixGlyph : null}
      {area}
      {affix?.position === 'trailing' ? affixGlyph : null}
      {showSpin ? spinAfter(placement, incrementButton, spinColumn) : null}
    </InputParts.Box>
  );

  // Wrap with wheel handler on web
  if (isWeb && !disabled && !readOnly) {
    return (
      <div
        {...wheelProps}
        style={{ minWidth: 0, width: '100%' }}>
        {box}
      </div>
    );
  }
  return box;
};

interface StepperEngineInput {
  valueProp: number | null | undefined;
  defaultValue: number | null | undefined;
  hasName: boolean;
  isControlled: boolean;
  precision: number;
  allowEmpty: boolean;
  min: number | undefined;
  max: number | undefined;
  step: number;
  disabled: boolean | undefined;
  readOnly: boolean | undefined;
  onChange: ((value: number | null) => void) | undefined;
  motionTransition: KnobProps['transition'];
}

/** The stepper's editing state: text value, stepping, hold-repeat, keyboard and wheel input. */
const useStepperEngine = ({
  valueProp,
  defaultValue,
  hasName,
  isControlled,
  precision,
  allowEmpty,
  min,
  max,
  step,
  disabled,
  readOnly,
  onChange,
  motionTransition,
}: StepperEngineInput) => {
  // Initialize inputValue from defaultValue for standalone mode
  const [inputValue, setInputValue] = useState<string>(() => {
    const initial = isControlled ? valueProp : defaultValue;
    if (initial !== undefined && initial !== null) {
      return precision > 0 ? initial.toFixed(precision) : String(initial);
    }
    return '';
  });
  // Discrete +/- taps tween the value chrome; hold-repeat / typing stay live.
  // Opacity (not transform) — Tamagui Input owns transform internally on web.
  const [valueFlash, setValueFlash] = useState(false);
  const { boundCaption, clearBoundCaption, showBoundCaption } = useBoundCaption();
  const repeatingRef = useRef(false);
  const typingRef = useRef(false);
  const incrementRef = useRef<(() => void) | null>(null);
  const decrementRef = useRef<(() => void) | null>(null);
  const areaRef = useRef<TamaguiElement>(null);

  const focusArea = useCallback(() => {
    areaRef.current?.focus?.();
  }, []);

  const pulseDiscreteStep = useCallback(() => {
    if (repeatingRef.current || typingRef.current) {
      return;
    }
    // No tween when the animation knob resolves to none.
    if (motionTransition === undefined || motionTransition === '') {
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
    incrementRef.current?.();
  }, repeatingRef);
  const repeatDecrement = useRepeatAction(() => {
    decrementRef.current?.();
  }, repeatingRef);

  const { formatValue, parseValue, clampValue, boundsLo, boundsHi } = useStepperNumbers({
    precision,
    allowEmpty,
    min,
    max,
  });

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
      if (!hasName) {
        onChange?.(clamped);
      }
    },
    [clampValue, formatValue, inputValue, hasName, onChange, pulseDiscreteStep, clearBoundCaption],
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

  const { stop: stopIncrement } = repeatIncrement;
  const { stop: stopDecrement } = repeatDecrement;
  useEffect(() => {
    const current = parseValue(inputValue);
    const locked = disabled === true || readOnly === true;
    if (locked || atUpperBound(current, boundsHi)) {
      stopIncrement();
    }
    if (locked || atLowerBound(current, boundsLo)) {
      stopDecrement();
    }
  }, [inputValue, parseValue, boundsLo, boundsHi, disabled, readOnly, stopIncrement, stopDecrement]);

  const increment = useCallback(() => {
    applyDelta(step);
  }, [applyDelta, step]);
  const decrement = useCallback(() => {
    applyDelta(-step);
  }, [applyDelta, step]);

  useLayoutEffect(() => {
    incrementRef.current = increment;
    decrementRef.current = decrement;
  });

  useEffect(() => {
    if (!isControlled || typingRef.current) {
      return;
    }
    const formatted = formatValue(valueProp ?? null);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- the text is local editing state that a controlled `value` overwrites; it cannot be derived because typing must stay uncommitted until blur
    setInputValue((prev) => (prev === formatted ? prev : formatted));
  }, [isControlled, valueProp, formatValue]);

  const { wheelProps } = useWheelIncrement({
    onIncrement: increment,
    onDecrement: decrement,
    disabled,
    readOnly,
  });

  const handleStepperKeyDown = useCallback(
    (event: StepperKeyEvent) => {
      if (disabled || readOnly) {
        return;
      }
      const action = stepperKeyAction(event.key, event.shiftKey, step);
      if (action === undefined) {
        return;
      }
      if (action.kind === 'delta') {
        event.preventDefault();
        applyDelta(action.delta);
        return;
      }
      const bound = action.kind === 'lower' ? boundsLo : boundsHi;
      if (bound !== undefined) {
        event.preventDefault();
        commitNumber(bound, true);
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
      const cleanText = text.replaceAll(/[^0-9.-]/gu, '');

      // Prevent multiple decimal points
      if (precision === 0 && cleanText.includes('.')) {
        return;
      }

      setInputValue(cleanText);
    },
    [allowEmpty, precision],
  );

  return {
    inputValue,
    setInputValue,
    valueFlash,
    boundCaption,
    clearBoundCaption,
    showBoundCaption,
    repeatingRef,
    typingRef,
    areaRef,
    focusArea,
    repeatIncrement,
    repeatDecrement,
    formatValue,
    parseValue,
    clampValue,
    boundsLo,
    boundsHi,
    wheelProps,
    handleStepperKeyDown,
    handleInputChange,
  };
};

export const Stepper = (props: StepperProps) => {
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
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const affix = currencyAffix(currency);
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const motionTransition = knobProps.transition;
  const controlSize = size ?? knobProps.sizeToken;
  const hasLabel = label != null && label !== false && label !== '' && label !== 0;
  // +/- glyphs are control-internal icons: the recipe's icon channel.
  const iconPx = sizeRecipeForToken(String(controlSize)).iconSize;
  const glyphColor = useGlyphColor();
  const placement = resolveStepperPlacement(buttonPosition, hydrationTouch);
  const hasName = name !== undefined && name !== '';
  const isControlled = valueProp !== undefined && !hasName;

  const {
    inputValue,
    setInputValue,
    valueFlash,
    boundCaption,
    clearBoundCaption,
    showBoundCaption,
    repeatingRef,
    typingRef,
    areaRef,
    focusArea,
    repeatIncrement,
    repeatDecrement,
    formatValue,
    parseValue,
    clampValue,
    boundsLo,
    boundsHi,
    wheelProps,
    handleStepperKeyDown,
    handleInputChange,
  } = useStepperEngine({
    valueProp,
    defaultValue,
    hasName,
    isControlled,
    precision,
    allowEmpty,
    min,
    max,
    step,
    disabled,
    readOnly,
    onChange,
    motionTransition,
  });

  const renderNumberRow = (onBlurHandler?: () => void, onFocusHandler?: () => void, hasError = false) => (
    <StepperNumberRow
      id={id}
      inputValue={inputValue}
      placeholder={placeholder}
      precision={precision}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      hasLabel={hasLabel}
      hasError={hasError}
      parseValue={parseValue}
      boundsLo={boundsLo}
      boundsHi={boundsHi}
      placement={placement}
      showButtons={showButtons}
      knobProps={knobProps}
      controlSize={controlSize}
      iconPx={iconPx}
      glyphColor={glyphColor}
      repeatIncrement={repeatIncrement}
      repeatDecrement={repeatDecrement}
      focusArea={focusArea}
      showBoundCaption={showBoundCaption}
      areaRef={areaRef}
      valueFlash={valueFlash}
      repeatingRef={repeatingRef}
      typingRef={typingRef}
      motionTransition={motionTransition}
      inputProps={inputProps}
      affix={affix}
      hydrationTouch={hydrationTouch}
      handleInputChange={handleInputChange}
      handleStepperKeyDown={handleStepperKeyDown}
      clearBoundCaption={clearBoundCaption}
      wheelProps={wheelProps}
      onBlurHandler={onBlurHandler}
      onFocusHandler={onFocusHandler}
    />
  );

  // Render skeleton placeholder
  if (skeleton) {
    return (
      <InputParts size={controlSize}>
        {hasLabel ? (
          <Skeleton
            variant="text"
            width="30%"
          />
        ) : null}
        <Skeleton
          variant="rounded"
          width="100%"
          height={controlSize}
        />
      </InputParts>
    );
  }

  if (resolvedForm === undefined || name === undefined || name === '') {
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
        <InputParts size={controlSize}>
          {renderNumberRow(commitStandalone, undefined, hasErrorValue(errorProp))}
        </InputParts>
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
            disabled,
            onBlur,
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
};

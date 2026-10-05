import { useTouchSurface } from '@repo/theme';
import { ensureFocusVisibleRing, useResolvedKnobs } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import {
  type ClipboardEvent,
  type ComponentProps,
  Fragment,
  type KeyboardEvent,
  memo,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useProps, type SizeTokens, type TamaguiElement } from 'tamagui';
import { Input, Text, XStack, getVariableValue, isWeb, useDidFinishSSR } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { FocusContext, Input as InputParts, InputContext } from '../../InputParts';
import { formCommonColors, formControlColors, formInputColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';
import {
  getFieldHeight,
  getOTPCellRadius,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { Validator } from '../../types';
import type { FieldComponentProps } from '../../types';

import { ensureOtpCellCss } from './otpCellCss';

export type OTPInputProps<
  TParentData extends Record<string, unknown> = Record<string, unknown>,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  // "onChange": FormFieldProps carries the DOM ChangeEventHandler from
  // YStackProps; this field exposes a canonical value callback instead.
  'children' | 'field' | 'onChange'
> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    length?: number;
    secureTextEntry?: boolean;
    autoFocus?: boolean;
    onComplete?: (code: string) => void;
    onChange?: (value: string) => void;
    value?: string;
    type?: 'numeric' | 'alphanumeric' | 'password';
    clearable?: boolean;
    separator?: string;
    inputProps?: Omit<ComponentProps<typeof Input>, 'value' | 'onChangeText' | 'ref'>;
    /** When true, renders a skeleton placeholder instead of the OTP input */
    skeleton?: boolean;
    /** When true, uses compact sizing */
    compact?: boolean;
  };

type OTPType = 'numeric' | 'alphanumeric' | 'password';

// Get validation pattern based on type
const getValidationPattern = (inputType: string) => {
  switch (inputType) {
    case 'numeric':
      return /[^0-9]/g;
    case 'alphanumeric':
      return /[^a-zA-Z0-9]/g;
    case 'password':
      return /[^a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/g;
    default:
      return /[^0-9]/g;
  }
};

// Get secure text entry based on type
const getSecureTextEntry = (inputType: string, secure: boolean) => {
  if (inputType === 'password') {
    return true;
  }
  return secure;
};

/** Split a value into per-cell digits, dropping characters the type forbids */
const valueToDigits = (value: string, inputType: string, length: number): string[] =>
  value
    .replace(getValidationPattern(inputType), '')
    .slice(0, length)
    .split('')
    .concat(Array(length).fill(''))
    .slice(0, length);

const navigationKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

/**
 * Pull a one-time code out of clipboard / SMS bodies (Apple AutoFill + Stripe).
 * Prefers an exact-length run so a date like 20260814 does not steal a 6-digit
 * prefix from "code 123456" at the end of the same message.
 */
export function extractOtpCode(text: string, inputType: string, length: number): string {
  if (!text || length <= 0) {
    return '';
  }
  const stripped = text.replace(getValidationPattern(inputType), '');
  if (stripped.length === length) {
    return stripped;
  }
  const splitter = inputType === 'alphanumeric' ? /[^a-zA-Z0-9]+/ : /\D+/;
  if (inputType === 'numeric' || inputType === 'alphanumeric') {
    const tokens = text.split(splitter).filter((token) => token.length === length);
    if (tokens.length) {
      return tokens[tokens.length - 1];
    }
  }
  return stripped.slice(0, length);
}

/** Apple / Stripe 6-digit codes group 3+3; even lengths ≥4 split at the midpoint. */
function otpGroupSizes(length: number, separator?: string): number[] | null {
  if (separator || length < 4 || length % 2 !== 0) {
    return null;
  }
  const half = length / 2;
  return [half, half];
}

function digitFontSize(cellSize: string | number | undefined): string {
  const key = String(cellSize ?? '$true');
  if (key === '$2' || key === '28') {
    return '$5';
  }
  if (key === '$4' || key === '$true' || key === '44') {
    return '$7';
  }
  return '$6';
}

/**
 * The height the cell PAINTS, which is what CIRCULAR-AT-FULL halves.
 *
 * The cell sets `height={cellSize}`, so its painted edge is the `$size` token —
 * NOT the touch-floored recipe height. On a touch surface those disagree at every
 * step (`sizeRecipeForToken("$4", { touch: true }).height` is 48 against a 44pt
 * token, `$2` is 44 against 28), and a resolver fed the recipe height resolves 24
 * on a 44pt cell: over the edge, so the engine clamps it back to 22. That clamp is
 * exactly the defect to avoid, so the radius rides the painted token instead.
 * Same source as the avatar square face (`avatarTokenPx`, components/Avatar).
 */
export function otpCellHeightPx(cellSize: string | number | undefined, touch?: boolean): number {
  if (typeof cellSize === 'number' && Number.isFinite(cellSize) && cellSize > 0) {
    return cellSize;
  }
  const token = (cellSize ?? '$4') as SizeTokens;
  const painted = getVariableValue(getSize(token));
  if (typeof painted === 'number' && Number.isFinite(painted) && painted > 0) {
    return painted;
  }
  return getFieldHeight(token, 1, touch);
}

/**
 * Digit cells own their focus ring: the ring must be CSS-driven
 * on the focused input itself — Input.Box's state-driven ring paints on the
 * wrapper a frame later, which forced-focus a11y probes (interact sweep)
 * never see. The Box ring is therefore suppressed for OTP cells (see the
 * no-op FocusContext below) so the cell shows exactly one ring.
 */
const suppressBoxFocusRing = { focused: false, setFocused: (_val: boolean) => {} };

interface OTPDigitInputProps {
  value: string;
  type: OTPType;
  onChange: (value: string) => void;
  onKeyPress: (key: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onPaste: (text: string) => void;
  autoFocus?: boolean;
  secureTextEntry?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  hasError?: boolean;
  digitIndex: number;
  digitCount: number;
  fieldId?: string;
  hasLabel?: boolean;
  inputProps?: Omit<ComponentProps<typeof Input>, 'value' | 'onChangeText' | 'ref'>;
  /** Stable per-cell element ref (select-on-focus / autoFocus target). */
  inputRef: RefObject<TamaguiElement | null>;
  /** Stable ref callback wiring this cell's element into the parent refs. */
  attachRef: (el: TamaguiElement | null) => void;
}

/**
 * One digit cell.
 *
 * MEMOIZED with per-cell-stable props on purpose (iOS-sweep fix): every
 * focus/blur/auto-advance flips OTP-root state (focusedIndex/digits), and on
 * iOS Fabric a re-render that touches the focused RN TextInput resigns the
 * first responder — the keyboard closed the instant a digit took focus, so
 * cells could never be typed into. With React.memo + stable handlers, root
 * re-renders skip the untouched cells entirely and focus survives; only the
 * cell whose `value` changed re-renders.
 */
const OTPDigitInput = memo(function OTPDigitInput({
  value,
  type,
  onChange,
  onKeyPress,
  onFocus,
  onBlur,
  onPaste,
  autoFocus,
  secureTextEntry,
  disabled,
  readOnly,
  required,
  hasError,
  digitIndex,
  digitCount,
  fieldId,
  hasLabel,
  inputProps,
  inputRef,
  attachRef,
}: OTPDigitInputProps) {
  const didFinishSSR = useDidFinishSSR();
  const hydrationTouch = useTouchSurface();
  const { knobProps, control } = useResolvedKnobs();
  // Honor the size the field was given (InputParts root receives
  // `fieldProps.size || knobProps.sizeToken`): table cells pass a compact
  // token, and default-size 44pt digit squares overflow the ~$8-wide cell.
  const { size: contextSize } = InputContext.useStyledContext();
  const cellSize = contextSize ?? knobProps.sizeToken;
  // Carve-out: inset (−2) on the focused cell so neighbors don't clip it.
  const cellFocusRing = ensureFocusVisibleRing({
    ...control.focusVisibleKnobProps,
    outlineOffset: -2,
  });
  if (isWeb) {
    ensureOtpCellCss();
  }

  useEffect(() => {
    if (autoFocus && didFinishSSR && inputRef.current) {
      (inputRef.current as HTMLElement).focus();
    }
  }, [autoFocus, didFinishSSR, inputRef]);

  const cellRadius = getOTPCellRadius(knobProps.borderRadius.borderRadius, otpCellHeightPx(cellSize, hydrationTouch));
  const isNumeric = type === 'numeric';
  const cellBorder = hasError
    ? formCommonColors.error
    : value
      ? formControlColors.boundary
      : formInputColors.border.base;
  const firstCell = digitIndex === 0;

  return (
    <InputParts.Box
      width={cellSize}
      height={cellSize}
      // Inside table cells Input.Box goes chromeless with `flex={1}` —
      // flex-basis 0 beats `width` in Yoga and every digit collapses to 0pt
      // (the row shrinks to just its gaps). Digit cells are fixed squares, so
      // pin them inflexible; outside cells this is the default anyway.
      flexGrow={0}
      flexShrink={0}
      flexBasis="auto"
      borderRadius={cellRadius}
      data-otp-part="cell"
      justifyContent="center"
      alignItems="center"
      // Apple / Stripe slots are flat squares — Input.Box elevation would
      // lift each cell off the page.
      elevation={0}
      shadowOpacity={0}
      borderColor={cellBorder}
      hoverStyle={{ borderColor: hasError ? formCommonColors.error : formInputColors.border.hover }}
      focusStyle={{ borderColor: hasError ? formCommonColors.error : formInputColors.border.focus }}
      // Forward `disabled` so each cell renders the washed chrome.
      disabled={disabled}
      // Web only: keep the Box out of the tab order. The focus handlers live
      // on the Area itself (native RN Views neither focus nor bubble focus).
      {...(isWeb
        ? {
            tabIndex: -1,
            className: knobProps.transition ? 'mp-otp-cell' : 'mp-otp-cell mp-otp-motion-none',
            style: { boxShadow: 'none', borderRadius: cellRadius },
          }
        : {})}>
      <FocusContext.Provider {...suppressBoxFocusRing}>
        <InputParts.Area
          ref={attachRef}
          value={value}
          focusStyle={cellFocusRing}
          focusVisibleStyle={cellFocusRing}
          keyboardType={isNumeric ? 'number-pad' : 'default'}
          textContentType={firstCell ? 'oneTimeCode' : 'none'}
          autoComplete={firstCell ? 'one-time-code' : 'off'}
          autoCorrect={false}
          secureTextEntry={secureTextEntry}
          textAlign="center"
          padding={0}
          fontWeight="600"
          fontSize={digitFontSize(cellSize)}
          disabled={disabled}
          readOnly={!!readOnly}
          id={firstCell ? fieldId : undefined}
          aria-label={
            hasLabel
              ? `Digit ${digitIndex + 1} of ${digitCount}`
              : `One-time code digit ${digitIndex + 1} of ${digitCount}`
          }
          aria-required={required || undefined}
          aria-invalid={hasError || undefined}
          aria-readonly={readOnly || undefined}
          placeholder=" "
          onFocus={() => {
            onFocus();
            if (isWeb && inputRef.current) {
              requestAnimationFrame(() => {
                (inputRef.current as unknown as HTMLInputElement)?.select();
              });
            }
          }}
          onBlur={onBlur}
          onChangeText={(text) => {
            const pattern = getValidationPattern(type);
            const filtered = text.replace(pattern, '');
            if (!filtered) {
              return;
            }
            // SMS AutoFill / OS paste often dumps the whole code into one cell.
            if (filtered.length > 1) {
              onPaste(filtered);
              return;
            }
            onChange(filtered[0]);
          }}
          onKeyPress={
            isWeb
              ? undefined
              : (e) => {
                  const event = e.nativeEvent;
                  onKeyPress(event.key);
                }
          }
          {...(isWeb
            ? {
                className: 'mp-otp-area',
                inputMode: isNumeric ? 'numeric' : 'text',
                pattern: isNumeric ? '[0-9]*' : undefined,
                autoCapitalize: isNumeric ? 'none' : 'characters',
                spellCheck: false,
                enterKeyHint: digitIndex === digitCount - 1 ? 'done' : 'next',
                // react-native-web never fires onKeyPress reliably, so drive
                // navigation/deletion from the DOM keydown event instead
                onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
                  if (navigationKeys.includes(e.key)) {
                    e.preventDefault();
                    onKeyPress(e.key);
                  }
                },
                onPaste: (e: ClipboardEvent<HTMLInputElement>) => {
                  e.preventDefault();
                  const pastedData = e.clipboardData?.getData('text') || '';
                  if (pastedData) {
                    onPaste(pastedData);
                  }
                },
              }
            : {})}
          {...(inputProps as Record<string, unknown>)}
        />
      </FocusContext.Provider>
    </InputParts.Box>
  );
});

// ---------------------------------------------------------------------------
// OTPCellsRow — the digit row shared by the standalone and form branches
// ---------------------------------------------------------------------------

/** Stable per-cell handler bundle (see OTPDigitInput memo note). */
interface StableCell {
  onChange: (value: string) => void;
  onKeyPress: (key: string) => void;
  onPaste: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  inputRef: RefObject<TamaguiElement | null>;
  attachRef: (el: TamaguiElement | null) => void;
}

interface OTPCellsRowProps {
  digits: string[];
  length: number;
  type: OTPType;
  secureTextEntry: boolean;
  autoFocus: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  hasError: boolean;
  fieldId?: string;
  hasLabel: boolean;
  separator?: string;
  clearable: boolean;
  inputProps?: Omit<ComponentProps<typeof Input>, 'value' | 'onChangeText' | 'ref'>;
  inputRefs: RefObject<Array<HTMLElement | null>>;
  onDigitChange: (index: number, value: string) => void;
  onKeyPress: (index: number, key: string) => void;
  onPaste: (text: string) => void;
  onFocusIndex: (index: number) => void;
  onClear: () => void;
}

function OTPCellsRow({
  digits,
  length,
  type,
  secureTextEntry,
  autoFocus,
  disabled,
  readOnly,
  required,
  hasError,
  fieldId,
  hasLabel,
  separator,
  clearable,
  inputProps,
  inputRefs,
  onDigitChange,
  onKeyPress,
  onPaste,
  onFocusIndex,
  onClear,
}: OTPCellsRowProps) {
  const { knobProps } = useResolvedKnobs();

  // Handlers route through a `latest` ref so the per-cell callbacks handed to
  // the memoized cells never change identity (identity churn re-renders the
  // focused cell, and on iOS Fabric that resigns the first responder).
  const latest = useRef({ onDigitChange, onKeyPress, onPaste, onFocusIndex });
  latest.current = { onDigitChange, onKeyPress, onPaste, onFocusIndex };

  const cellsRef = useRef<Map<number, StableCell>>(new Map());
  const cellAt = (index: number): StableCell => {
    let cell = cellsRef.current.get(index);
    if (!cell) {
      const inputRef: RefObject<TamaguiElement | null> = { current: null };
      cell = {
        onChange: (value) => {
          latest.current.onDigitChange(index, value);
        },
        onKeyPress: (key) => {
          latest.current.onKeyPress(index, key);
        },
        onPaste: (text) => {
          latest.current.onPaste(text);
        },
        onFocus: () => {
          latest.current.onFocusIndex(index);
        },
        onBlur: () => {
          latest.current.onFocusIndex(-1);
        },
        inputRef,
        attachRef: (el) => {
          inputRef.current = el;
          inputRefs.current[index] = el as HTMLElement | null;
        },
      };
      cellsRef.current.set(index, cell);
    }
    return cell;
  };

  const renderDigit = (index: number) => {
    const cell = cellAt(index);
    return (
      <OTPDigitInput
        key={`digit-${index}`}
        value={digits[index]}
        type={type}
        onChange={cell.onChange}
        onKeyPress={cell.onKeyPress}
        onPaste={cell.onPaste}
        onFocus={cell.onFocus}
        onBlur={cell.onBlur}
        autoFocus={autoFocus && index === 0}
        secureTextEntry={getSecureTextEntry(type, secureTextEntry)}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        hasError={hasError}
        digitIndex={index}
        digitCount={length}
        fieldId={fieldId}
        hasLabel={hasLabel}
        inputProps={inputProps}
        inputRef={cell.inputRef}
        attachRef={cell.attachRef}
      />
    );
  };

  const groups = otpGroupSizes(length, separator);
  const cellGap = knobProps.gap.gap;
  // Stripe / Apple 3+3: group gap is a clear pause, not one more cell-gap.
  const groupGap = '$8';
  const hasValue = digits.some(Boolean);
  const clearButton =
    clearable && !readOnly && hasValue ? (
      <Button
        chromeless
        circular
        size="$2"
        onPress={onClear}
        disabled={disabled}
        marginInlineStart="$2"
        aria-label={t('Clear')}
        tabIndex={-1}>
        ×
      </Button>
    ) : null;

  const rowA11y = isWeb ? { role: 'group' as const, ...(hasLabel ? {} : { 'aria-label': t('One-time code') }) } : {};

  if (groups) {
    let offset = 0;
    return (
      <XStack gap={groupGap} alignItems="center" {...rowA11y}>
        {groups.map((size, gi) => {
          const start = offset;
          offset += size;
          return (
            <XStack key={`otp-group-${gi}`} gap={cellGap} alignItems="center">
              {Array.from({ length: size }, (_, j) => renderDigit(start + j))}
            </XStack>
          );
        })}
        {clearButton}
      </XStack>
    );
  }

  return (
    <XStack gap={cellGap} alignItems="center" {...rowA11y}>
      {Array.from({ length }, (_, index) => (
        <Fragment key={`digit-${index}`}>
          {renderDigit(index)}
          {separator && index < length - 1 && (
            <Text {...knobProps.body} color={formCommonColors.muted}>
              {separator}
            </Text>
          )}
        </Fragment>
      ))}
      {clearButton}
    </XStack>
  );
}

/** Minimal field interface for OTPFieldRenderer */
interface OTPFieldApi {
  state: {
    value: string;
    meta: { errors: readonly (string | undefined)[] };
  };
  handleChange: (value: string) => void;
  handleBlur: () => void;
}

/** Props for OTPFieldRenderer inner component */
interface OTPFieldRendererProps {
  field: OTPFieldApi;
  digits: string[];
  setDigits: (digits: string[]) => void;
  length: number;
  handleDigitChange: (index: number, value: string) => void;
  handleKeyPress: (index: number, key: string) => void;
  handlePaste: (text: string) => void;
  setFocusedIndex: (index: number) => void;
  autoFocus: boolean;
  type: OTPType;
  secureTextEntry: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  clearable: boolean;
  separator?: string;
  inputProps?: Omit<ComponentProps<typeof Input>, 'value' | 'onChangeText' | 'ref'>;
  fieldProps: Omit<FormFieldProps<Record<string, unknown>, string, unknown, unknown>, 'children' | 'field'>;
  inputRefs: RefObject<Array<HTMLElement | null>>;
  onComplete?: (code: string) => void;
  onChange?: (value: string) => void;
  fieldBlurHandler: (...args: any[]) => void;
  id?: string;
}

function OTPFieldRenderer({
  field,
  digits,
  setDigits,
  length,
  handleDigitChange,
  handleKeyPress,
  handlePaste,
  setFocusedIndex,
  autoFocus,
  type,
  secureTextEntry,
  disabled,
  readOnly,
  clearable,
  separator,
  inputProps,
  fieldProps,
  inputRefs,
  onComplete,
  onChange,
  fieldBlurHandler,
  id,
}: OTPFieldRendererProps) {
  const lastFieldValueRef = useRef<string | null>(null);
  const fieldHandleChangeRef = useRef(field.handleChange);
  fieldHandleChangeRef.current = field.handleChange;
  const { knobProps } = useResolvedKnobs();

  // Sync digits with field value
  useEffect(() => {
    const fieldValue = field.state.value;
    if (fieldValue && fieldValue !== lastFieldValueRef.current) {
      lastFieldValueRef.current = fieldValue;
      setDigits(valueToDigits(fieldValue, type, length));
    }
  }, [field.state.value, type, length, setDigits]);

  // Update field value when digits change. Callbacks live in refs so a new
  // onChange/onComplete identity alone cannot re-emit and loop parents.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    const code = digits.join('');
    if (code === lastFieldValueRef.current) {
      return;
    }
    lastFieldValueRef.current = code;
    fieldHandleChangeRef.current(code);

    if (disabled) {
      return;
    }
    onChangeRef.current?.(code);
    if (code.length === length) {
      onCompleteRef.current?.(code);
    }
  }, [digits, length, disabled]);

  const error = field.state.meta.errors.length ? String(field.state.meta.errors[0]) : fieldProps.error;

  const handleClear = () => {
    setDigits(Array(length).fill(''));
    field.handleChange('');
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  };

  return (
    <FieldLayout
      id={id}
      label={fieldProps.label}
      labelProps={fieldProps.labelProps}
      error={error}
      helperText={fieldProps.helperText}
      required={fieldProps.required}
      size={fieldProps.size}
      knobProps={knobProps as any}
      onBlur={fieldBlurHandler}
      // FieldLayout owns the dimWhole assembly dim (keepLabel pins
      // the sibling label/helper readable) — it needs the disabled state.
      disabled={disabled}>
      <InputParts size={fieldProps.size || knobProps.sizeToken}>
        <OTPCellsRow
          digits={digits}
          length={length}
          type={type}
          secureTextEntry={secureTextEntry}
          autoFocus={autoFocus}
          disabled={disabled}
          readOnly={readOnly}
          required={fieldProps.required}
          hasError={!!error}
          fieldId={id}
          hasLabel={Boolean(fieldProps.label)}
          separator={separator}
          clearable={clearable}
          inputProps={inputProps}
          inputRefs={inputRefs}
          onDigitChange={handleDigitChange}
          onKeyPress={handleKeyPress}
          onPaste={handlePaste}
          onFocusIndex={setFocusedIndex}
          onClear={handleClear}
        />
      </InputParts>
    </FieldLayout>
  );
}

export function OTPInput<
  TParentData extends Record<string, unknown> = Record<string, unknown>,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: OTPInputProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const {
    defaultValue,
    form,
    inputProps,
    length = 6,
    secureTextEntry = false,
    autoFocus = false,
    onComplete,
    onChange,
    value,
    type = 'numeric',
    clearable = false,
    separator,
    mode,
    name,
    preserveValue,
    validators,
    disabled,
    readOnly,
    skeleton,
    compact,
    id: idProp,
    ...fieldProps
  } = useProps(props);

  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(fieldProps.required, validators, fieldProps.label, name);

  const [digits, setDigits] = useState<string[]>(() => {
    if (value) {
      return valueToDigits(value, type, length);
    }
    return Array(length).fill('');
  });
  // Render-synced mirror so the stable handlers below can read the current
  // digits without depending on the state (identity churn re-renders the
  // memoized cells — see OTPDigitInput).
  const digitsRef = useRef(digits);
  digitsRef.current = digits;
  // Tracked for parity with the previous implementation (focus state is not
  // used for styling — the focused cell paints its own CSS/native ring).
  const [, setFocusedIndex] = useState<number>(autoFocus ? 0 : -1);
  const inputRefs = useRef<Array<HTMLElement | null>>([]);

  // Last code emitted to standalone onChange/onComplete. Prevents re-emitting
  // the same code (SB-T2-10 idle loop when WiredTable rebuilt onChange each render).
  const lastEmittedCodeRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Update digits when value prop changes (standalone mode)
  useEffect(() => {
    if (value === undefined) {
      return;
    }
    const next = valueToDigits(value, type, length);
    setDigits((prev) => (prev.join('') === next.join('') ? prev : next));
    // Keep emit guard aligned with the controlled value so remounts/syncs
    // don't immediately bounce the same code back to the parent.
    lastEmittedCodeRef.current = typeof value === 'string' ? value : next.join('');
  }, [value, type, length]);

  // Emit standalone callbacks only when the joined code actually changes.
  useEffect(() => {
    // Skip if using form integration - callbacks are handled in OTPFieldRenderer
    if (resolvedForm && name) {
      return;
    }

    const code = digits.join('');
    if (code === lastEmittedCodeRef.current) {
      return;
    }
    lastEmittedCodeRef.current = code;

    if (disabled) {
      return;
    }
    onChangeRef.current?.(code);
    if (code.length === length) {
      onCompleteRef.current?.(code);
    }
  }, [digits, length, resolvedForm, name, disabled]);

  // Stable handlers (functional updates; identities never change) so the
  // memoized digit cells skip re-renders — see the OTPDigitInput memo note.
  const handleDigitChange = useCallback(
    (index: number, digitValue: string) => {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = digitValue;
        return next;
      });

      // Auto-advance to next input
      if (digitValue && index < length - 1) {
        setFocusedIndex(index + 1);
        inputRefs.current[index + 1]?.focus();
      }
    },
    [length],
  );

  const handleKeyPress = useCallback(
    (index: number, key: string) => {
      if (key === 'Backspace' || key === 'Delete') {
        const wasEmpty = !digitsRef.current[index];
        setDigits((prev) => {
          const next = [...prev];
          if (!prev[index] && index > 0) {
            next[index - 1] = '';
          } else {
            next[index] = '';
          }
          return next;
        });
        if (wasEmpty && index > 0) {
          setFocusedIndex(index - 1);
          inputRefs.current[index - 1]?.focus();
        }
      } else if (key === 'ArrowLeft' && index > 0) {
        setFocusedIndex(index - 1);
        inputRefs.current[index - 1]?.focus();
      } else if (key === 'ArrowRight' && index < length - 1) {
        setFocusedIndex(index + 1);
        inputRefs.current[index + 1]?.focus();
      } else if (key === 'Home' && index > 0) {
        setFocusedIndex(0);
        inputRefs.current[0]?.focus();
      } else if (key === 'End' && index < length - 1) {
        setFocusedIndex(length - 1);
        inputRefs.current[length - 1]?.focus();
      }
    },
    [length],
  );

  const handlePaste = useCallback(
    (pastedText: string) => {
      const pastedChars = extractOtpCode(pastedText, type, length).split('');
      if (!pastedChars.length) {
        return;
      }
      const newDigits = pastedChars.concat(Array(length).fill('')).slice(0, length);
      setDigits(newDigits);
      const focusIndex = Math.min(pastedChars.length, length - 1);
      setFocusedIndex(focusIndex);
      inputRefs.current[focusIndex]?.focus();
    },
    [length, type],
  );

  useEffect(() => {
    if (!isWeb || type !== 'numeric' || disabled || readOnly) {
      return;
    }
    if (typeof window === 'undefined' || !('OTPCredential' in window)) {
      return;
    }
    const credentials = navigator.credentials;
    if (!credentials?.get) {
      return;
    }
    const ac = new AbortController();
    void credentials
      .get({
        otp: { transport: ['sms'] },
        signal: ac.signal,
      } as CredentialRequestOptions)
      .then((cred) => {
        const code = (cred as { code?: string } | null)?.code;
        if (code) {
          handlePaste(code);
        }
      })
      .catch(() => {
        /* dismissed or unsupported */
      });
    return () => {
      ac.abort();
    };
  }, [type, disabled, readOnly, handlePaste]);

  const handleClearStandalone = () => {
    setDigits(Array(length).fill(''));
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  };

  // Render skeleton placeholder (after all hooks)
  if (skeleton) {
    // Skeleton mirrors anatomy: cells shrink-wrap the row, so the
    // label MUST be a deterministic px width — never % inside this auto-width
    // stack. Cell size + radius match live OTPDigitInput (getOTPCellRadius).
    const cellSize = fieldProps.size || knobProps.sizeToken;
    const cellRadius = getOTPCellRadius(knobProps.borderRadius.borderRadius, otpCellHeightPx(cellSize, hydrationTouch));
    const cellGap = knobProps.gap.gap;
    const groups = otpGroupSizes(length, separator);
    const groupGap = '$8';
    // knobProps.body carries only fontFamily/fontWeight/color (no lineHeight),
    // so the skeleton label mirrors the live label's deterministic px height.
    const labelHeight = 16;
    const skeletonCell = (i: number) => (
      <Skeleton key={i} variant="rounded" width={cellSize} height={cellSize} borderRadius={cellRadius} />
    );
    let groupOffset = 0;
    return (
      <InputParts size={cellSize}>
        {fieldProps.label && <Skeleton variant="text" width={96} height={labelHeight} />}
        {groups ? (
          <XStack gap={groupGap} alignItems="center">
            {groups.map((size, gi) => {
              const start = groupOffset;
              groupOffset += size;
              return (
                <XStack key={`otp-skel-${gi}`} gap={cellGap} alignItems="center">
                  {Array.from({ length: size }, (_, j) => skeletonCell(start + j))}
                </XStack>
              );
            })}
          </XStack>
        ) : (
          <XStack gap={cellGap} alignItems="center">
            {Array.from({ length }, (_, i) => skeletonCell(i))}
          </XStack>
        )}
      </InputParts>
    );
  }

  if (!resolvedForm || !name) {
    return (
      <FieldLayout
        id={id}
        label={fieldProps.label}
        labelProps={fieldProps.labelProps}
        error={fieldProps.error}
        helperText={fieldProps.helperText}
        required={fieldProps.required}
        size={fieldProps.size}
        knobProps={knobProps as any}
        onBlur={fieldProps.onBlur}
        // See form branch — FieldLayout carries dimWhole.
        disabled={disabled}>
        <InputParts size={fieldProps.size || knobProps.sizeToken}>
          <OTPCellsRow
            digits={digits}
            length={length}
            type={type}
            secureTextEntry={secureTextEntry}
            autoFocus={autoFocus}
            disabled={disabled}
            readOnly={readOnly}
            required={fieldProps.required}
            hasError={!!fieldProps.error}
            fieldId={id}
            hasLabel={Boolean(fieldProps.label)}
            separator={separator}
            clearable={clearable}
            inputProps={inputProps}
            inputRefs={inputRefs}
            onDigitChange={handleDigitChange}
            onKeyPress={handleKeyPress}
            onPaste={handlePaste}
            onFocusIndex={setFocusedIndex}
            onClear={handleClearStandalone}
          />
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
        <OTPFieldRenderer
          field={field as unknown as OTPFieldApi}
          digits={digits}
          setDigits={setDigits}
          length={length}
          handleDigitChange={handleDigitChange}
          handleKeyPress={handleKeyPress}
          handlePaste={handlePaste}
          setFocusedIndex={setFocusedIndex}
          autoFocus={autoFocus}
          type={type}
          secureTextEntry={secureTextEntry}
          disabled={disabled}
          readOnly={readOnly}
          clearable={clearable}
          separator={separator}
          inputProps={inputProps}
          fieldProps={fieldProps}
          inputRefs={inputRefs}
          onComplete={onComplete}
          onChange={onChange}
          fieldBlurHandler={mergeFieldHandler(field, 'handleBlur', fieldProps.onBlur)}
          id={id}
        />
      )}
    </Field>
  );
}

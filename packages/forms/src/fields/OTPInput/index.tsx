import { useTouchSurface, ensureFocusVisibleRing, isTouchSurface, useResolvedKnobs } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, ComponentProps, CSSProperties, KeyboardEvent, RefObject } from 'react';
import { useProps, Text, XStack, getVariableValue, isWeb, useDidFinishSSR } from 'tamagui';
import type { Input, SizeTokens, TamaguiElement } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout } from '../../FieldLayout';
import type { FormFieldProps } from '../../FieldLayout';
import { FocusContext, Input as InputParts, InputContext } from '../../InputParts';
import { formCommonColors, formControlColors, formInputColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import {
  getFieldHeight,
  getOTPCellRadius,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { Validator, FieldComponentProps } from '../../types';

import { ensureOtpCellCss } from './otp-cell-css';

type OTPAreaInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChangeText' | 'ref'>;

export type OTPInputProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors the TParentData constraint of FormFieldProps/FieldComponentProps
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
    inputProps?: OTPAreaInputProps;
    /** When true, renders a skeleton placeholder instead of the OTP input */
    skeleton?: boolean;
    /** When true, uses compact sizing */
    compact?: boolean;
  };

type OTPType = 'numeric' | 'alphanumeric' | 'password';

// Get validation pattern based on type
const getValidationPattern = (inputType: string) => {
  switch (inputType) {
    case 'numeric': {
      return /[^0-9]/gu;
    }
    case 'alphanumeric': {
      return /[^a-zA-Z0-9]/gu;
    }
    case 'password': {
      return /[^a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/gu;
    }
    default: {
      return /[^0-9]/gu;
    }
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
const emptyDigits = (length: number): string[] => Array.from({ length }, () => '');

const padDigits = (chars: string[], length: number): string[] => [...chars, ...emptyDigits(length)].slice(0, length);

const valueToDigits = (value: string, inputType: string, length: number): string[] =>
  padDigits(value.replace(getValidationPattern(inputType), '').slice(0, length).split(''), length);

const navigationKeys = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** Stable ids for a run of positional cells (cells are fixed slots, not reorderable items). */
const cellPositions = (start: number, count: number): { id: string; index: number }[] =>
  Array.from({ length: count }, (_, j) => ({ id: `digit-${start + j}`, index: start + j }));

/** Lay the groups out without mutating render-scope state. */
const groupLayout = (sizes: number[], idPrefix: string): { id: string; start: number; size: number }[] => {
  let start = 0;
  return sizes.map((size, gi) => {
    const group = { id: `${idPrefix}-${gi}`, start, size };
    start += size;
    return group;
  });
};

/**
 * Pull a one-time code out of clipboard / SMS bodies (Apple AutoFill + Stripe).
 * Prefers an exact-length run so a date like 20260814 does not steal a 6-digit
 * prefix from "code 123456" at the end of the same message.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- exported pure helper consumed by tests and other fields
export const extractOtpCode = (text: string, inputType: string, length: number): string => {
  if (!text || length <= 0) {
    return '';
  }
  const stripped = text.replace(getValidationPattern(inputType), '');
  if (stripped.length === length) {
    return stripped;
  }
  const splitter = inputType === 'alphanumeric' ? /[^a-zA-Z0-9]+/u : /\D+/u;
  if (inputType === 'numeric' || inputType === 'alphanumeric') {
    const tokens = text.split(splitter).filter((token) => token.length === length);
    const last = tokens.at(-1);
    if (last !== undefined) {
      return last;
    }
  }
  return stripped.slice(0, length);
};

/** Apple / Stripe 6-digit codes group 3+3; even lengths ≥4 split at the midpoint. */
const otpGroupSizes = (length: number, separator?: string): number[] | null => {
  if ((separator !== undefined && separator !== '') || length < 4 || length % 2 !== 0) {
    return null;
  }
  const half = length / 2;
  return [half, half];
};

const digitFontSize = (cellSize: string | number | undefined): string => {
  const key = String(cellSize ?? '$true');
  if (key === '$2' || key === '28') {
    return '$5';
  }
  if (key === '$4' || key === '$true' || key === '44') {
    return '$7';
  }
  return '$6';
};

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
// oxlint-disable-next-line react-doctor/only-export-components -- exported pure helper consumed by tests and other fields
export const otpCellHeightPx = (cellSize: string | number | undefined, touch = isTouchSurface()): number => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- cellSize is a string token | number px union; only the number arm is an explicit px height
  if (typeof cellSize === 'number' && Number.isFinite(cellSize) && cellSize > 0) {
    return cellSize;
  }
  // SAFETY: a string cellSize is a size-token key ($1..$N) taken from the size prop or knob
  const token = (cellSize ?? '$4') as SizeTokens;
  const painted = Number(getVariableValue(getSize(token)));
  if (Number.isFinite(painted) && painted > 0) {
    return painted;
  }
  return getFieldHeight(token, 1, touch);
};

/**
 * Digit cells own their focus ring: the ring must be CSS-driven
 * on the focused input itself — Input.Box's state-driven ring paints on the
 * wrapper a frame later, which forced-focus a11y probes (interact sweep)
 * never see. The Box ring is therefore suppressed for OTP cells (see the
 * no-op FocusContext below) so the cell shows exactly one ring.
 */
const suppressBoxFocusRing = {
  focused: false,
  setFocused: (_val: boolean): void => {
    // intentionally inert: the cell paints its own ring, so the Box must not
  },
};

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
  inputProps?: OTPAreaInputProps;
  /** Stable per-cell element ref (select-on-focus / autoFocus target). */
  inputRef: RefObject<TamaguiElement | null>;
  /** Stable ref callback wiring this cell's element into the parent refs. */
  attachRef: (el: TamaguiElement | null) => void;
}

const cellBorderColor = (value: string, hasError = false) => {
  if (hasError) {
    return formCommonColors.error;
  }
  if (value !== '') {
    return formControlColors.boundary;
  }
  return formInputColors.border.base;
};

const digitAriaLabel = (digitIndex: number, digitCount: number, hasLabel = false): string =>
  hasLabel ? `Digit ${digitIndex + 1} of ${digitCount}` : `One-time code digit ${digitIndex + 1} of ${digitCount}`;

const handleDigitText = (
  text: string,
  type: OTPType,
  onChange: (value: string) => void,
  onPaste: (text: string) => void,
): void => {
  const filtered = text.replace(getValidationPattern(type), '');
  if (filtered === '') {
    return;
  }
  // SMS AutoFill / OS paste often dumps the whole code into one cell.
  if (filtered.length > 1) {
    onPaste(filtered);
    return;
  }
  onChange(filtered[0]);
};

const handleDigitKeyDown = (e: KeyboardEvent<HTMLInputElement>, onKeyPress: (key: string) => void): void => {
  if (navigationKeys.has(e.key)) {
    e.preventDefault();
    onKeyPress(e.key);
  }
};

const handleDigitPaste = (e: ClipboardEvent<HTMLInputElement>, onPaste: (text: string) => void): void => {
  e.preventDefault();
  const pastedData = e.clipboardData?.getData('text') ?? '';
  if (pastedData !== '') {
    onPaste(pastedData);
  }
};

const webBoxProps = (className: string, cellRadius: CSSProperties['borderRadius']) => ({
  tabIndex: -1,
  className,
  style: { boxShadow: 'none', borderRadius: cellRadius } satisfies CSSProperties,
});

interface WebAreaProps {
  className: string;
  inputMode: 'numeric' | 'text';
  pattern: string | undefined;
  autoCapitalize: 'none' | 'characters';
  spellCheck: false;
  enterKeyHint: 'done' | 'next';
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => void;
}

const webAreaProps = (
  isNumeric: boolean,
  digitIndex: number,
  digitCount: number,
  onKeyPress: (key: string) => void,
  onPaste: (text: string) => void,
): WebAreaProps => ({
  className: 'mp-otp-area',
  inputMode: isNumeric ? 'numeric' : 'text',
  pattern: isNumeric ? '[0-9]*' : undefined,
  autoCapitalize: isNumeric ? 'none' : 'characters',
  spellCheck: false,
  enterKeyHint: digitIndex === digitCount - 1 ? 'done' : 'next',
  // react-native-web never fires onKeyPress reliably, so drive
  // navigation/deletion from the DOM keydown event instead
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
    handleDigitKeyDown(e, onKeyPress);
  },
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => {
    handleDigitPaste(e, onPaste);
  },
});

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
    if (autoFocus && didFinishSSR) {
      inputRef.current?.focus();
    }
  }, [autoFocus, didFinishSSR, inputRef]);

  const cellRadius = getOTPCellRadius(knobProps.borderRadius.borderRadius, otpCellHeightPx(cellSize, hydrationTouch));
  const isNumeric = type === 'numeric';
  const cellBorder = cellBorderColor(value, hasError);
  const firstCell = digitIndex === 0;
  const motionClassName = knobProps.transition == null ? 'mp-otp-cell mp-otp-motion-none' : 'mp-otp-cell';

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
      {...(isWeb ? webBoxProps(motionClassName, cellRadius) : {})}>
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
          aria-label={digitAriaLabel(digitIndex, digitCount, hasLabel)}
          aria-required={required ? true : undefined}
          aria-invalid={hasError ? true : undefined}
          aria-readonly={readOnly ? true : undefined}
          placeholder=" "
          onFocus={() => {
            onFocus();
            if (isWeb && inputRef.current) {
              requestAnimationFrame(() => {
                const el = inputRef.current;
                if (el instanceof HTMLInputElement) {
                  el.select();
                }
              });
            }
          }}
          onBlur={onBlur}
          onChangeText={(text) => {
            handleDigitText(text, type, onChange, onPaste);
          }}
          // oxlint-disable-next-line typescript/no-deprecated -- RN TextInput exposes no other hardware-key event on native
          onKeyPress={
            isWeb
              ? undefined
              : (e: { nativeEvent: { key: string } }) => {
                  onKeyPress(e.nativeEvent.key);
                }
          }
          {...(isWeb ? webAreaProps(isNumeric, digitIndex, digitCount, onKeyPress, onPaste) : {})}
          // SAFETY: inputProps is typed against Input; Area wraps the same native input and accepts the same pass-through props
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- Input and Area prop types diverge on variant keys only
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
  handleChange: (value: string) => void;
  handleKeyPress: (key: string) => void;
  handlePaste: (text: string) => void;
  handleFocus: () => void;
  handleBlur: () => void;
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
  inputProps?: OTPAreaInputProps;
  inputRefs: RefObject<(TamaguiElement | null)[]>;
  onDigitChange: (index: number, value: string) => void;
  onKeyPress: (index: number, key: string) => void;
  onPaste: (text: string) => void;
  onFocusIndex: (index: number) => void;
  onClear: () => void;
}

const rowA11yProps = (hasLabel: boolean) => {
  if (!isWeb) {
    return {};
  }
  if (hasLabel) {
    return { role: 'group' as const };
  }
  return { role: 'group' as const, 'aria-label': t('One-time code') };
};

const OTPCellsRow = ({
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
}: OTPCellsRowProps) => {
  const { knobProps } = useResolvedKnobs();

  // Handlers route through a `latest` ref so the per-cell callbacks handed to
  // the memoized cells never change identity (identity churn re-renders the
  // focused cell, and on iOS Fabric that resigns the first responder).
  const latest = useRef({ onDigitChange, onKeyPress, onPaste, onFocusIndex });
  useEffect(() => {
    latest.current = { onDigitChange, onKeyPress, onPaste, onFocusIndex };
  });

  const cells = useMemo(
    () =>
      Array.from({ length }, (_, index): StableCell => {
        const inputRef: RefObject<TamaguiElement | null> = { current: null };
        return {
          handleChange: (value) => {
            latest.current.onDigitChange(index, value);
          },
          handleKeyPress: (key) => {
            latest.current.onKeyPress(index, key);
          },
          handlePaste: (text) => {
            latest.current.onPaste(text);
          },
          handleFocus: () => {
            latest.current.onFocusIndex(index);
          },
          handleBlur: () => {
            latest.current.onFocusIndex(-1);
          },
          inputRef,
          attachRef: (el) => {
            inputRef.current = el;
            inputRefs.current[index] = el;
          },
        };
      }),
    [length, inputRefs],
  );

  const renderDigit = (index: number, id: string) => {
    const cell = cells[index];
    return (
      <OTPDigitInput
        key={id}
        value={digits[index]}
        type={type}
        onChange={cell.handleChange}
        onKeyPress={cell.handleKeyPress}
        onPaste={cell.handlePaste}
        onFocus={cell.handleFocus}
        onBlur={cell.handleBlur}
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

  const rowA11y = rowA11yProps(hasLabel);

  if (groups) {
    return (
      <XStack
        gap={groupGap}
        alignItems="center"
        {...rowA11y}>
        {groupLayout(groups, 'otp-group').map((group) => (
          <XStack
            key={group.id}
            gap={cellGap}
            alignItems="center">
            {cellPositions(group.start, group.size).map(({ id, index }) => renderDigit(index, id))}
          </XStack>
        ))}
        {clearButton}
      </XStack>
    );
  }

  return (
    <XStack
      gap={cellGap}
      alignItems="center"
      {...rowA11y}>
      {cellPositions(0, length).map(({ id, index }) => (
        <Fragment key={id}>
          {renderDigit(index, id)}
          {separator !== undefined && separator !== '' && index < length - 1 && (
            <Text
              {...knobProps.body}
              color={formCommonColors.muted}>
              {separator}
            </Text>
          )}
        </Fragment>
      ))}
      {clearButton}
    </XStack>
  );
};

interface OtpCredentialLike extends Credential {
  code: string;
}

/** WebOTP resolves an OTPCredential carrying the SMS `code`. */
const isOtpCredential = (cred: Credential | null): cred is OtpCredentialLike => cred !== null && 'code' in cred;

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
  inputProps?: OTPAreaInputProps;
  fieldProps: Omit<FormFieldProps, 'children' | 'field'>;
  inputRefs: RefObject<(TamaguiElement | null)[]>;
  onComplete?: (code: string) => void;
  onChange?: (value: string) => void;
  fieldBlurHandler: NonNullable<ComponentProps<typeof FieldLayout>['onBlur']>;
  id?: string;
}

const OTPFieldRenderer = ({
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
}: OTPFieldRendererProps) => {
  const lastFieldValueRef = useRef<string | null>(null);
  const fieldHandleChangeRef = useRef(field.handleChange);
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onComplete);
  // Callbacks live in refs so a new onChange/onComplete identity alone cannot
  // re-emit and loop parents; declared before the effects that read them.
  useEffect(() => {
    fieldHandleChangeRef.current = field.handleChange;
    onChangeRef.current = onChange;
    onCompleteRef.current = onComplete;
  });
  const { knobProps } = useResolvedKnobs();

  // Sync digits with field value
  useEffect(() => {
    const fieldValue = field.state.value;
    if (fieldValue && fieldValue !== lastFieldValueRef.current) {
      lastFieldValueRef.current = fieldValue;
      setDigits(valueToDigits(fieldValue, type, length));
    }
  }, [field.state.value, type, length, setDigits]);

  // Update field value when digits change.
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

  const error = field.state.meta.errors.length > 0 ? String(field.state.meta.errors[0]) : fieldProps.error;

  const handleClear = () => {
    setDigits(emptyDigits(length));
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
      knobProps={knobProps}
      onBlur={fieldBlurHandler}
      // FieldLayout owns the dimWhole assembly dim (keepLabel pins
      // the sibling label/helper readable) — it needs the disabled state.
      disabled={disabled}>
      <InputParts size={fieldProps.size ?? knobProps.sizeToken}>
        <OTPCellsRow
          digits={digits}
          length={length}
          type={type}
          secureTextEntry={secureTextEntry}
          autoFocus={autoFocus}
          disabled={disabled}
          readOnly={readOnly}
          required={fieldProps.required}
          hasError={Boolean(error)}
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
};

// oxlint-disable-next-line react-doctor/no-giant-component -- one component owns standalone, form and skeleton branches that share the same hooks
export const OTPInput = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors the TParentData constraint of FormFieldProps/FieldComponentProps
  TParentData extends Record<string, unknown> = Record<string, unknown>,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(
  props: OTPInputProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
) => {
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
    if (value !== undefined && value !== '') {
      return valueToDigits(value, type, length);
    }
    return emptyDigits(length);
  });
  // Render-synced mirror so the stable handlers below can read the current
  // digits without depending on the state (identity churn re-renders the
  // memoized cells — see OTPDigitInput).
  const digitsRef = useRef(digits);
  useEffect(() => {
    digitsRef.current = digits;
  }, [digits]);
  // Tracked for parity with the previous implementation (focus state is not
  // used for styling — the focused cell paints its own CSS/native ring).
  const [, setFocusedIndex] = useState<number>(autoFocus ? 0 : -1);
  const inputRefs = useRef<(TamaguiElement | null)[]>([]);

  // Last code emitted to standalone onChange/onComplete. Prevents re-emitting
  // the same code (SB-T2-10 idle loop when WiredTable rebuilt onChange each render).
  const lastEmittedCodeRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onChangeRef.current = onChange;
    onCompleteRef.current = onComplete;
  });

  // Update digits when value prop changes (standalone mode)
  useEffect(() => {
    if (value === undefined) {
      return;
    }
    const next = valueToDigits(value, type, length);
    // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-adjust-state-on-prop-change -- controlled `value` must also reset the emit guard ref below; deriving state in render would skip it
    setDigits((prev) => (prev.join('') === next.join('') ? prev : next));
    // Keep emit guard aligned with the controlled value so remounts/syncs
    // don't immediately bounce the same code back to the parent.
    lastEmittedCodeRef.current = value;
  }, [value, type, length]);

  // Emit standalone callbacks only when the joined code actually changes.
  useEffect(() => {
    // Skip if using form integration - callbacks are handled in OTPFieldRenderer
    if (resolvedForm && name !== undefined && name !== '') {
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
    // oxlint-disable-next-line react-doctor/no-pass-data-to-parent -- standalone onChange/onComplete are the component's public callbacks
    onChangeRef.current?.(code);
    if (code.length === length) {
      // oxlint-disable-next-line react-doctor/no-pass-data-to-parent -- standalone onComplete is the component's public callback
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
      if (pastedChars.length === 0) {
        return;
      }
      const newDigits = padDigits(pastedChars, length);
      setDigits(newDigits);
      const focusIndex = Math.min(pastedChars.length, length - 1);
      setFocusedIndex(focusIndex);
      inputRefs.current[focusIndex]?.focus();
    },
    [length, type],
  );

  useEffect(() => {
    const ac = new AbortController();
    const requestSmsCode = async () => {
      try {
        const cred = await navigator.credentials.get(
          // SAFETY: lib.dom does not yet type the WebOTP `otp` member; browsers with OTPCredential accept it
          {
            otp: { transport: ['sms'] },
            signal: ac.signal,
          } as CredentialRequestOptions,
        );
        if (isOtpCredential(cred) && cred.code !== '') {
          handlePaste(cred.code);
        }
      } catch {
        /* dismissed or unsupported */
      }
    };
    const wantsSms = isWeb && type === 'numeric' && !disabled && !readOnly;
    const hasWebOtp = typeof window !== 'undefined' && 'OTPCredential' in window && 'credentials' in navigator;
    if (wantsSms && hasWebOtp) {
      void requestSmsCode();
    }
    return () => {
      ac.abort();
    };
  }, [type, disabled, readOnly, handlePaste]);

  const handleClearStandalone = () => {
    setDigits(emptyDigits(length));
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  };

  // Render skeleton placeholder (after all hooks)
  if (skeleton) {
    // Skeleton mirrors anatomy: cells shrink-wrap the row, so the
    // label MUST be a deterministic px width — never % inside this auto-width
    // stack. Cell size + radius match live OTPDigitInput (getOTPCellRadius).
    const cellSize = fieldProps.size ?? knobProps.sizeToken;
    const cellRadius = getOTPCellRadius(knobProps.borderRadius.borderRadius, otpCellHeightPx(cellSize, hydrationTouch));
    const cellGap = knobProps.gap.gap;
    const groups = otpGroupSizes(length, separator);
    const groupGap = '$8';
    // knobProps.body carries only fontFamily/fontWeight/color (no lineHeight),
    // so the skeleton label mirrors the live label's deterministic px height.
    const labelHeight = 16;
    const skeletonCell = (cellKey: string) => (
      <Skeleton
        key={cellKey}
        variant="rounded"
        width={cellSize}
        height={cellSize}
        borderRadius={cellRadius}
      />
    );
    return (
      <InputParts size={cellSize}>
        {Boolean(fieldProps.label) && (
          <Skeleton
            variant="text"
            width={96}
            height={labelHeight}
          />
        )}
        {groups ? (
          <XStack
            gap={groupGap}
            alignItems="center">
            {groupLayout(groups, 'otp-skel').map((group) => (
              <XStack
                key={group.id}
                gap={cellGap}
                alignItems="center">
                {cellPositions(group.start, group.size).map(({ id: cellKey }) => skeletonCell(cellKey))}
              </XStack>
            ))}
          </XStack>
        ) : (
          <XStack
            gap={cellGap}
            alignItems="center">
            {cellPositions(0, length).map(({ id: cellKey }) => skeletonCell(cellKey))}
          </XStack>
        )}
      </InputParts>
    );
  }

  const handleFieldBlur = fieldProps.onBlur;
  if (!resolvedForm || name === undefined || name === '') {
    return (
      <FieldLayout
        id={id}
        label={fieldProps.label}
        labelProps={fieldProps.labelProps}
        error={fieldProps.error}
        helperText={fieldProps.helperText}
        required={fieldProps.required}
        size={fieldProps.size}
        knobProps={knobProps}
        onBlur={handleFieldBlur}
        // See form branch — FieldLayout carries dimWhole.
        disabled={disabled}>
        <InputParts size={fieldProps.size ?? knobProps.sizeToken}>
          <OTPCellsRow
            digits={digits}
            length={length}
            type={type}
            secureTextEntry={secureTextEntry}
            autoFocus={autoFocus}
            disabled={disabled}
            readOnly={readOnly}
            required={fieldProps.required}
            hasError={Boolean(fieldProps.error)}
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
          // SAFETY: an OTP field's value is the joined code string, which OTPFieldApi narrows from the generic TData
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- SimpleFieldApi<TData> has no overlap with the string-only view
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
};

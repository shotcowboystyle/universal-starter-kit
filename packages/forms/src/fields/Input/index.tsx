import { ClipboardIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { writeToClipboard } from '@repo/platform';
import { useTouchSurface } from '@repo/theme';
import { MIN_PRESS_TARGET, pressTargetHitSlop } from '@repo/theme';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import type { InputKeyboardType, InputTextContentType, LabelProps, SizeTokens, TamaguiElement } from 'tamagui';
import { isWeb, Text } from 'tamagui';

import { resolveFieldInputProps } from '../../fieldDefaults';
import { Field, FieldLayout } from '../../fieldLayout';
import { Input as InputParts, useForwardFocus } from '../../InputParts';
import { formCommonColors } from '../../shared/colorRamps';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi, LinkResolver } from '../../types';
import { LinkCell } from '../../utils/LinkCell';

type InputAreaProps = ComponentProps<typeof InputParts.Area>;

/** F1 / reference §10: standalone Input rings at offset 0, not the inset −2. */
const INPUT_FIELD_RING_STYLE_ID = 'mp-input-field-ring-offset';

export function ensureInputFieldRingOffset(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(INPUT_FIELD_RING_STYLE_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = INPUT_FIELD_RING_STYLE_ID;
  tag.textContent = `[data-mp-input-field][data-mp-ring="inset"]:has(input:focus),
[data-mp-input-field][data-mp-ring="inset"]:has(textarea:focus),
[data-mp-input-field][data-mp-ring="inset"]:has([data-mp-input-area]:focus),
[data-mp-input-field][data-mp-ring="inset"]:focus-visible {
  outline-offset: 0px !important;
}`;
  document.head.appendChild(tag);
}

export interface InputProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  /**
   * Hide the visible label while keeping it as the accessible name
   * (Polaris `labelHidden` / Primer visually-hidden label). Search-style
   * fields are the usual caller; pass `aria-label` to override the name.
   */
  labelHidden?: boolean;
  /** Accessible name when there is no visible label. */
  'aria-label'?: string;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  linkResolver?: LinkResolver;
  /**
   * Painted control height (Tamagui size token). Orthogonal to `compact`:
   * density steps the knob sizeToken, `size` ejects the box height.
   */
  size?: SizeTokens;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: any) => void;
  onChangeText?: (text: string) => void;
  onBlur?: (...args: any[]) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: InputKeyboardType;
  textContentType?: InputTextContentType;
  autoComplete?: string;
  /**
   * Semantic content purpose. Drives the default
   * width (via FieldLayout) plus autocomplete token, web `inputMode` and
   * native `keyboardType` (email, phone/tel, postalCode, year). Explicit
   * `autoComplete` / `keyboardType` / `inputProps` eject.
   */
  purpose?: string;
  leftIcon?: ReactElement;
  rightIcon?: ReactElement;
  /**
   * Mark the rightIcon as interactive (e.g. a clear button). Skips the
   * focus-forwarding wrapper, which otherwise bounces focus back to the
   * input and makes anything inside the icon unreachable by keyboard.
   */
  rightIconInteractive?: boolean;
  inputProps?: Omit<InputAreaProps, 'value' | 'id' | 'onChange' | 'onChangeText'>;
  children?: ReactNode;
  /** When true, renders a skeleton placeholder instead of the input */
  skeleton?: boolean;
  /**
   * Density override. Compact steps knob size+space down one level; it is
   * not a `size` token. Default remains comfortable (44px painted box).
   */
  compact?: boolean;
  /** When true, renders without borders/background (for toolbar integration) */
  chromeless?: boolean;
  /**
   * Declared copy end-cap (CopyField is the second consumer of Input.Button).
   * Empty omits the cap. Disabled keeps geometry and drops the tab stop.
   */
  copy?: boolean;
  /** Called after a copy attempt. CopyField routes this through notify(). */
  onCopyResult?: (ok: boolean) => void;
}

const COPY_LABEL = 'Copy to clipboard';

export function Input({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  labelHidden,
  'aria-label': ariaLabel,
  helperText,
  error,
  required,
  disabled,
  size,
  id: idProp,
  value,
  defaultValue,
  onChange,
  onChangeText,
  onBlur,
  secureTextEntry,
  placeholder,
  multiline,
  maxLength,
  keyboardType,
  textContentType,
  autoComplete,
  purpose,
  readOnly,
  linkResolver,
  leftIcon,
  rightIcon,
  rightIconInteractive,
  inputProps,
  children,
  skeleton,
  compact,
  chromeless,
  copy,
  onCopyResult,
}: InputProps) {
  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, control, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const inputRef = useRef<TamaguiElement>(null);
  const focusTrigger = useForwardFocus(inputRef);
  if (isWeb) {
    ensureInputFieldRingOffset();
  }

  const resolvedValidators = useResolvedValidators(required, validators, label, name);

  // Purpose → autocomplete token + keyboard hints (DG §32). Explicit
  // autoComplete/keyboardType/inputProps below eject per key.
  const purposeInputProps = resolveFieldInputProps(purpose, autoComplete);

  // density ≠ size: compact steps knobProps.sizeToken; an explicit `size`
  // ejects only the painted box height and leaves density alone.
  const resolvedSize = (size ?? knobProps.sizeToken) as SizeTokens;
  const visualHeight = getFieldHeight(resolvedSize, 1, hydrationTouch);
  const belowFloor = visualHeight < MIN_PRESS_TARGET;
  const visibleLabel = labelHidden ? undefined : label;
  const resolvedAriaLabel = ariaLabel ?? (labelHidden && typeof label === 'string' ? label : undefined);

  const boxContract = {
    size: resolvedSize,
    'data-density': knobProps.density,
    'data-size': String(resolvedSize),
    'data-visual-height': String(visualHeight),
    'data-press-floor': belowFloor ? 'slop' : 'box',
    'data-ring-target': 'box',
    'data-radius-class': 'DEFAULT',
    'data-radius-part': 'Input',
    'data-ring-offset': '0',
    'data-mp-input-field': 'true',
    ...(belowFloor ? { hitSlop: pressTargetHitSlop(visualHeight) } : undefined),
  } as const;

  // Chromeless strips border + fill for toolbar bands. The ring
  // stays on InputParts.Box (whole frame, icons included; text-entry
  // mouse carve-out). Do not paint a ring on Area and do not replace
  // Box's focusVisibleStyle — that would drop the composite ring recipe.
  const chromelessProps = chromeless
    ? {
        borderWidth: 0,
        backgroundColor: 'transparent' as const,
        hoverStyle: {
          borderColor: 'transparent' as const,
          ...control.hoverKnobProps,
        },
        focusStyle: {
          borderColor: 'transparent' as const,
          ...control.focusKnobProps,
        },
      }
    : undefined;

  const layoutBind = {
    id,
    label: visibleLabel,
    // Label is weight 400. Consumer labelProps still eject last.
    labelProps: { fontWeight: '400' as const, ...labelProps },
    helperText,
    required,
    disabled,
    size: resolvedSize,
    knobProps,
    purpose,
    autoComplete,
    placeholder,
    'aria-label': resolvedAriaLabel,
  };

  const areaName = visibleLabel || !resolvedAriaLabel ? undefined : { 'aria-label': resolvedAriaLabel };

  const handleCopy = useCallback(
    async (text: string) => {
      const ok = await writeToClipboard(text);
      onCopyResult?.(ok);
    },
    [onCopyResult],
  );

  // Identifier values (tokens, URLs) ride the mono register.
  const identifierProps = copy
    ? ({
        fontFamily: '$mono',
        letterSpacing: 0,
        'data-register': 'identifier',
      } as const)
    : undefined;

  // Render skeleton placeholder — FieldLayout keeps label/helper anatomy;
  // only the control chrome is the skeleton.
  if (skeleton) {
    return (
      <FieldLayout {...layoutBind} error={error}>
        <InputParts size={resolvedSize}>
          <Skeleton variant="rounded" width="100%" height={visualHeight} />
        </InputParts>
      </FieldLayout>
    );
  }

  if (children) {
    return (
      <InputParts size={resolvedSize} {...(error ? { theme: 'error' } : undefined)}>
        {children}
      </InputParts>
    );
  }

  const renderInputBox = (
    inputValue: string | undefined,
    handleChange?: (text: string) => void,
    handleBlur?: (...args: any[]) => void,
    hasError?: boolean,
  ) => {
    const copyText = String(inputValue ?? '');
    // Empty omits the cap so the field stays one tab stop.
    const showCopy = Boolean(copy && copyText);
    const activateCopy = () => {
      if (disabled) {
        return;
      }
      void handleCopy(copyText);
    };
    return (
      <InputParts.Box
        {...boxContract}
        {...(handleBlur ? { onBlur: handleBlur } : undefined)}
        // The Box owns the disabled chrome treatment (read-only renders
        // its own branch below and never dims).
        disabled={disabled}
        {...(showCopy ? { paddingInlineEnd: 0 } : undefined)}
        {...chromelessProps}>
        {leftIcon && (
          <InputParts.Icon adornment="leading" {...focusTrigger}>
            {leftIcon}
          </InputParts.Icon>
        )}
        {readOnly ? (
          linkResolver ? (
            <LinkCell value={inputValue} linkResolver={linkResolver}>
              <Text
                id={id}
                aria-readonly="true"
                aria-required={required || undefined}
                aria-invalid={hasError || undefined}
                {...areaName}
                {...identifierProps}
                color="$color">
                {inputValue ?? ''}
              </Text>
            </LinkCell>
          ) : (
            <InputParts.Area
              ref={inputRef}
              value={inputValue ?? ''}
              readOnly
              id={id}
              aria-readonly="true"
              aria-required={required || undefined}
              aria-invalid={hasError || undefined}
              {...identifierProps}
              {...areaName}
            />
          )
        ) : (
          <InputParts.Area
            ref={inputRef}
            {...(purposeInputProps.inputMode !== undefined ? { inputMode: purposeInputProps.inputMode } : undefined)}
            {...(purposeInputProps.keyboardType !== undefined
              ? { keyboardType: purposeInputProps.keyboardType }
              : undefined)}
            {...(purposeInputProps.autoComplete !== undefined
              ? { autoComplete: purposeInputProps.autoComplete }
              : undefined)}
            {...inputProps}
            {...identifierProps}
            {...(multiline !== undefined ? { multiline } : undefined)}
            {...(maxLength !== undefined ? { maxLength } : undefined)}
            {...(keyboardType !== undefined ? { keyboardType } : undefined)}
            {...(textContentType !== undefined ? { textContentType } : undefined)}
            {...(autoComplete !== undefined ? { autoComplete } : undefined)}
            {...(secureTextEntry !== undefined ? { secureTextEntry } : undefined)}
            {...(placeholder !== undefined ? { placeholder } : undefined)}
            disabled={disabled}
            id={id}
            {...(handleChange || value !== undefined ? { value: inputValue ?? '' } : { defaultValue: inputValue })}
            aria-required={required || undefined}
            aria-invalid={hasError || undefined}
            {...areaName}
            onChange={onChange}
            onChangeText={(text) => {
              if (disabled) {
                return;
              }
              handleChange?.(text);
              onChangeText?.(text);
            }}
          />
        )}
        {showCopy ? (
          <InputParts.Button
            glyphRing
            size={resolvedSize}
            type="button"
            disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            aria-label={COPY_LABEL}
            accessibilityLabel={COPY_LABEL}
            hitSlop={belowFloor ? pressTargetHitSlop(visualHeight) : undefined}
            onPress={disabled ? undefined : activateCopy}
            onKeyDown={
              ((e: KeyboardEvent) => {
                if (disabled) {
                  return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  activateCopy();
                }
              }) as unknown as () => void
            }>
            <InputParts.Icon aria-hidden>
              <ClipboardIcon />
            </InputParts.Icon>
          </InputParts.Button>
        ) : rightIcon ? (
          <InputParts.Icon adornment="trailing" {...(rightIconInteractive ? undefined : focusTrigger)}>
            {rightIcon}
          </InputParts.Icon>
        ) : hasError ? (
          // M3 / Polaris / Spectrum: in-field error glyph (color is not the
          // only channel). Omitted when the consumer owns the trailing slot.
          <InputParts.Icon adornment="trailing" color={formCommonColors.error}>
            <WarningCircleIcon aria-hidden />
          </InputParts.Icon>
        ) : null}
      </InputParts.Box>
    );
  };

  if (!resolvedForm || !name) {
    return (
      <FieldLayout {...layoutBind} error={error} onBlur={onBlur}>
        <InputParts size={resolvedSize}>
          {renderInputBox(value ?? defaultValue, undefined, undefined, !!error)}
        </InputParts>
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        return (
          <FieldLayout {...layoutBind} error={resolvedError} onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}>
            <InputParts size={resolvedSize}>
              {renderInputBox(
                field.state.value,
                (text) => {
                  field.handleChange(text as any);
                },
                undefined,
                !!resolvedError,
              )}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
}

Input.Icon = InputParts.Icon;
Input.Box = InputParts.Box;
Input.Area = InputParts.Area;
Input.Section = InputParts.Section;
Input.Button = InputParts.Button;
Input.Info = InputParts.Info;
Input.Meta = InputParts.Meta;
Input.Label = InputParts.Label;
Input.XGroup = InputParts.XGroup;

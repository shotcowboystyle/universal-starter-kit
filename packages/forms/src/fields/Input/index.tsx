import { ClipboardIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { writeToClipboard } from '@repo/platform';
import { useTouchSurface, MIN_PRESS_TARGET, pressTargetHitSlop } from '@repo/theme';
import type { ComponentProps, ReactElement, ReactNode, RefObject } from 'react';
import { useCallback, useRef } from 'react';
import type { InputKeyboardType, InputTextContentType, LabelProps, SizeTokens, TamaguiElement } from 'tamagui';
import { isWeb, Text } from 'tamagui';

import { resolveFieldInputProps } from '../../field-defaults';
import { Field, FieldLayout } from '../../FieldLayout';
import { Input as InputParts, useForwardFocus } from '../../InputParts';
import { formCommonColors } from '../../shared/color-ramps';
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
type AnyHandler = NonNullable<ComponentProps<typeof FieldLayout>['onBlur']>;

/** F1 / reference §10: standalone Input rings at offset 0, not the inset −2. */
const INPUT_FIELD_RING_STYLE_ID = 'mp-input-field-ring-offset';

// oxlint-disable-next-line react-doctor/only-export-components -- exported API consumed outside this file; moving it would change the module surface
export const ensureInputFieldRingOffset = (): void => {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.querySelector(`#${INPUT_FIELD_RING_STYLE_ID}`)) {
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
  document.head.append(tag);
};

export interface InputProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Parameters<typeof useResolvedValidators>[1];
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
  onChange?: AnyHandler;
  onChangeText?: (text: string) => void;
  onBlur?: AnyHandler;
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

const chromelessBoxProps = (control: ReturnType<typeof useFormField>['control']) => ({
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
});

const resolveAreaName = (hasVisibleLabel: boolean, ariaLabel: string | undefined) =>
  hasVisibleLabel || ariaLabel === undefined || ariaLabel === '' ? undefined : { 'aria-label': ariaLabel };

const flag = (value: boolean | undefined = false): true | undefined => (value ? true : undefined);

const omitUndefined = <T extends object>(input: T): Partial<T> =>
  // SAFETY: only entries are dropped, so every remaining key/value pair still matches T.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fromEntries widens to a string index; dropping entries keeps every pair valid for T
  Object.fromEntries(Object.entries(input).filter(([, entry]) => entry !== undefined)) as Partial<T>;

type KeyEventArgs = Partial<[Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopPropagation'>]>;

interface InputBoxContext {
  copy: InputProps['copy'];
  disabled: InputProps['disabled'];
  inputProps: InputProps['inputProps'];
  leftIcon: InputProps['leftIcon'];
  linkResolver: InputProps['linkResolver'];
  onChange: InputProps['onChange'];
  onChangeText: InputProps['onChangeText'];
  readOnly: InputProps['readOnly'];
  required: InputProps['required'];
  rightIcon: InputProps['rightIcon'];
  rightIconInteractive: InputProps['rightIconInteractive'];
  value: InputProps['value'];
  areaName: { 'aria-label': string } | undefined;
  belowFloor: boolean;
  boxProps: object;
  fieldOverrides: Partial<InputAreaProps>;
  focusTrigger: ReturnType<typeof useForwardFocus>;
  handleCopy: (text: string) => Promise<void>;
  id: ReturnType<typeof useFormField>['id'];
  identifierProps: object | undefined;
  inputRef: RefObject<TamaguiElement | null>;
  purposeOverrides: Partial<InputAreaProps>;
  resolvedSize: SizeTokens;
  visualHeight: number;
}

const renderReadOnly = (ctx: InputBoxContext, inputValue: string | undefined, hasError: boolean): ReactElement => {
  const { areaName, id, identifierProps, inputRef, linkResolver, required } = ctx;
  if (linkResolver !== undefined) {
    return (
      <LinkCell
        value={inputValue}
        linkResolver={linkResolver}>
        <Text
          id={id}
          aria-readonly="true"
          aria-required={flag(required)}
          aria-invalid={flag(hasError)}
          {...areaName}
          {...identifierProps}
          color="$color">
          {inputValue ?? ''}
        </Text>
      </LinkCell>
    );
  }
  return (
    <InputParts.Area
      ref={inputRef}
      value={inputValue ?? ''}
      readOnly
      id={id}
      aria-readonly="true"
      aria-required={flag(required)}
      aria-invalid={flag(hasError)}
      {...identifierProps}
      {...areaName}
    />
  );
};

const renderEditable = (
  ctx: InputBoxContext,
  inputValue: string | undefined,
  handleChange: ((text: string) => void) | undefined,
  hasError: boolean,
): ReactElement => {
  const { areaName, disabled, fieldOverrides, id, identifierProps, inputProps, inputRef, onChange, onChangeText } = ctx;
  const valueProps =
    handleChange !== undefined || ctx.value !== undefined ? { value: inputValue ?? '' } : { defaultValue: inputValue };
  return (
    <InputParts.Area
      ref={inputRef}
      {...ctx.purposeOverrides}
      {...inputProps}
      {...identifierProps}
      {...fieldOverrides}
      disabled={disabled}
      id={id}
      {...valueProps}
      aria-required={flag(ctx.required)}
      aria-invalid={flag(hasError)}
      {...areaName}
      onChange={onChange}
      onChangeText={(text) => {
        if (disabled === true) {
          return;
        }
        handleChange?.(text);
        onChangeText?.(text);
      }}
    />
  );
};

const renderTrailing = (
  ctx: InputBoxContext,
  hasError: boolean,
  copyButton: ReactElement | undefined,
): ReactElement | null => {
  if (copyButton !== undefined) {
    return copyButton;
  }
  if (ctx.rightIcon !== undefined) {
    return (
      <InputParts.Icon
        adornment="trailing"
        {...(ctx.rightIconInteractive === true ? undefined : ctx.focusTrigger)}>
        {ctx.rightIcon}
      </InputParts.Icon>
    );
  }
  if (!hasError) {
    return null;
  }
  // M3 / Polaris / Spectrum: in-field error glyph (color is not the
  // only channel). Omitted when the consumer owns the trailing slot.
  return (
    <InputParts.Icon
      adornment="trailing"
      color={formCommonColors.error}>
      <WarningCircleIcon aria-hidden />
    </InputParts.Icon>
  );
};

const renderCopyButton = (ctx: InputBoxContext, activateCopy: () => void): ReactElement => {
  const { belowFloor, disabled, resolvedSize, visualHeight } = ctx;
  const isDisabled = disabled === true;
  return (
    <InputParts.Button
      glyphRing
      size={resolvedSize}
      type="button"
      disabled={disabled}
      tabIndex={isDisabled ? -1 : 0}
      aria-label={COPY_LABEL}
      accessibilityLabel={COPY_LABEL}
      hitSlop={belowFloor ? pressTargetHitSlop(visualHeight) : undefined}
      onPress={isDisabled ? undefined : activateCopy}
      // Button types onKeyDown as a no-arg handler, but on web it receives the key event.
      onKeyDown={(...args: KeyEventArgs) => {
        const [event] = args;
        if (isDisabled || event === undefined) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          activateCopy();
        }
      }}>
      <InputParts.Icon aria-hidden>
        <ClipboardIcon />
      </InputParts.Icon>
    </InputParts.Button>
  );
};

const renderInputBox = (
  ctx: InputBoxContext,
  inputValue: string | undefined,
  handleChange: ((text: string) => void) | undefined,
  hasError: boolean,
): ReactElement => {
  const copyText = inputValue ?? '';
  // Empty omits the cap so the field stays one tab stop.
  const showCopy = ctx.copy === true && copyText !== '';
  const activateCopy = () => {
    if (ctx.disabled === true) {
      return;
    }
    void ctx.handleCopy(copyText);
  };
  return (
    <InputParts.Box
      {...ctx.boxProps}
      // The Box owns the disabled chrome treatment (read-only renders
      // its own branch below and never dims).
      disabled={ctx.disabled}
      {...(showCopy ? { paddingInlineEnd: 0 } : undefined)}>
      {ctx.leftIcon && (
        <InputParts.Icon
          adornment="leading"
          {...ctx.focusTrigger}>
          {ctx.leftIcon}
        </InputParts.Icon>
      )}
      {ctx.readOnly === true
        ? renderReadOnly(ctx, inputValue, hasError)
        : renderEditable(ctx, inputValue, handleChange, hasError)}
      {renderTrailing(ctx, hasError, showCopy ? renderCopyButton(ctx, activateCopy) : undefined)}
    </InputParts.Box>
  );
};

export const Input = ({
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
}: InputProps) => {
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
  // SAFETY: knobProps.sizeToken is always a Tamagui size token; the cast only narrows its string type.
  const resolvedSize = (size ?? knobProps.sizeToken) as SizeTokens;
  const visualHeight = getFieldHeight(resolvedSize, 1, hydrationTouch);
  const belowFloor = visualHeight < MIN_PRESS_TARGET;
  const visibleLabel = labelHidden ? undefined : label;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- label is ReactNode; only a string can serve as aria-label
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
  const chromelessProps = chromeless ? chromelessBoxProps(control) : undefined;

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

  const areaName = resolveAreaName(Boolean(visibleLabel), resolvedAriaLabel);

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
  const hasChildren = Boolean(children);
  const hasError = Boolean(error);

  if (skeleton === true) {
    return (
      <FieldLayout
        {...layoutBind}
        error={error}>
        <InputParts size={resolvedSize}>
          <Skeleton
            variant="rounded"
            width="100%"
            height={visualHeight}
          />
        </InputParts>
      </FieldLayout>
    );
  }

  if (hasChildren) {
    return (
      <InputParts
        size={resolvedSize}
        {...(hasError ? { theme: 'error' } : undefined)}>
        {children}
      </InputParts>
    );
  }

  const ctx: InputBoxContext = {
    areaName,
    belowFloor,
    boxProps: { ...boxContract, ...chromelessProps },
    copy,
    disabled,
    fieldOverrides: omitUndefined({
      multiline,
      maxLength,
      keyboardType,
      textContentType,
      autoComplete,
      secureTextEntry,
      placeholder,
    }),
    focusTrigger,
    handleCopy,
    id,
    identifierProps,
    inputProps,
    inputRef,
    leftIcon,
    linkResolver,
    onChange,
    onChangeText,
    purposeOverrides: omitUndefined({
      inputMode: purposeInputProps.inputMode,
      keyboardType: purposeInputProps.keyboardType,
      autoComplete: purposeInputProps.autoComplete,
    }),
    readOnly,
    required,
    resolvedSize,
    rightIcon,
    rightIconInteractive,
    value,
    visualHeight,
  };

  if (resolvedForm == null || name === undefined || name === '') {
    return (
      <FieldLayout
        {...layoutBind}
        error={error}
        onBlur={onBlur}>
        <InputParts size={resolvedSize}>{renderInputBox(ctx, value ?? defaultValue, undefined, hasError)}</InputParts>
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
        return (
          <FieldLayout
            {...layoutBind}
            error={resolvedError}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}>
            <InputParts size={resolvedSize}>
              {renderInputBox(
                ctx,
                field.state.value,
                (text) => {
                  field.handleChange(text);
                },
                Boolean(resolvedError),
              )}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
};

Input.Icon = InputParts.Icon;
Input.Box = InputParts.Box;
Input.Area = InputParts.Area;
Input.Section = InputParts.Section;
Input.Button = InputParts.Button;
Input.Info = InputParts.Info;
Input.Meta = InputParts.Meta;
Input.Label = InputParts.Label;
Input.XGroup = InputParts.XGroup;

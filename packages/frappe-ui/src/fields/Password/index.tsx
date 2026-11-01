/**
 * Password — masked Data with a reveal in the end-cap.
 *
 * Bento ships no password field (0 type=password, 0 reveal toggles across
 * 14 inputs, measured 2026-08-28, bento-pickers-measured.md §6.2). The
 * toggle is PROPOSED. Bento's right adornment is an inert 16.8px svg
 * inside a 46-tall / radius-5 / #f7f7f7 frame; ours is a real Input.Button
 * tab stop. Frame stays measured mpo 44/9 on $color2 (chain step 1).
 *
 * Reveal uses Input.Button `glyphRing`: chip-dismiss class, 2px offset 0
 * on the glyph, not the 44px hit box (LC-71). Size comes from the
 * generated end-cap recipe, not a hardcoded square.
 */
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import {
  Field,
  FieldLayout,
  Input as FormsInput,
  Skeleton,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '@repo/forms';
import { MIN_PRESS_TARGET, isTouchSurface, pressTargetHitSlop, sizeRecipeForToken } from '@repo/theme';
import type { DeepKeys } from '@tanstack/form-core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SizeTokens, TamaguiElement } from 'tamagui';
import { useProps } from 'tamagui';

export type PasswordProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
  'children' | 'field' | 'onChange'
> &
  Partial<
    Omit<
      FieldComponentProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
      'children'
    >
  > & {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- pass-through props spread onto the native input
    inputProps?: Record<string, unknown>;
    size?: SizeTokens;
  };

const SHOW_PASSWORD = 'Show password';
const HIDE_PASSWORD = 'Hide password';

interface Selection {
  start: number;
  end: number;
}

const isErrorShown = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives the Tamagui ref: a DOM input on web, an opaque host handle on native
const nativeInput = (node: unknown, id?: string): HTMLInputElement | null => {
  // SAFETY: a duck-typed probe; every member is optional and checked before use
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const fromRef = node as { selectionStart?: number; setSelectionRange?: unknown } | null;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- duck-types a DOM input; native handles lack setSelectionRange
  if (fromRef && typeof fromRef.setSelectionRange === 'function') {
    // SAFETY: only DOM text inputs expose setSelectionRange, checked just above
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return fromRef as HTMLInputElement;
  }
  if (typeof document === 'undefined' || id === undefined || id === '') {
    return null;
  }
  return document.querySelector(`#${id}`);
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- forwards the opaque Tamagui ref to nativeInput
const readSelection = (node: unknown, id?: string): Selection | null => {
  const el = nativeInput(node, id);
  if (!el || el.selectionStart === null) {
    return null;
  }
  return { start: el.selectionStart, end: el.selectionEnd ?? el.selectionStart };
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- forwards the opaque Tamagui ref to nativeInput
const restoreSelection = (node: unknown, sel: Selection | null, id?: string) => {
  const el = nativeInput(node, id);
  el?.focus();
  if (sel) {
    el?.setSelectionRange(sel.start, sel.end);
  }
};

export const Password = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: PasswordProps<TData, TName>,
) => {
  // SAFETY: useProps only expands Tamagui shorthands/media props; the keys remain PasswordProps'
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- useProps widens the bag; unknown keys flow into fieldProps
  const resolvedProps = useProps(props) as PasswordProps<TData, TName> & { size?: unknown } & Record<string, unknown>;
  const {
    defaultValue,
    form,
    inputProps,
    _mode,
    name,
    onBlur,
    onChange,
    placeholder,
    _preserveValue,
    validators,
    disabled,
    value,
    size: sizeFromProps,
    ...fieldProps
  } = resolvedProps;

  const { resolvedForm, knobProps, id } = useFormField({
    form,
    id: fieldProps.id,
    compact: fieldProps.compact,
  });
  const resolvedValidators = useResolvedValidators(fieldProps.required, validators, fieldProps.label, name);
  // SAFETY: every source is a Tamagui size token (prop, field prop, or density knob)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const resolvedSize: SizeTokens = (sizeFromProps ?? fieldProps.size ?? knobProps.sizeToken) as SizeTokens;
  const visualHeight = sizeRecipeForToken(String(resolvedSize), {
    touch: isTouchSurface(),
  }).height;
  const belowFloor = visualHeight < MIN_PRESS_TARGET;

  const isControlled = value !== undefined;
  const [internalText, setInternalText] = useState(defaultValue ?? '');
  const text = isControlled ? (value ?? '') : internalText;
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<TamaguiElement>(null);
  const pendingSelection = useRef<Selection | null>(null);

  useEffect(() => {
    if (!text) {
      // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-adjust-state-on-prop-change, react-doctor/no-chain-state-updates -- clearing re-masks the field and it must stay masked when retyped, so it cannot be derived from text
      setRevealed(false);
    }
  }, [text]);

  useLayoutEffect(() => {
    if (!pendingSelection.current) {
      return;
    }
    restoreSelection(inputRef.current, pendingSelection.current, id);
    pendingSelection.current = null;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- revealed is the trigger: restore the caret after the input re-renders with its new type
  }, [id, revealed]);

  const handleChangeText = useCallback(
    (next: string) => {
      if (disabled) {
        return;
      }
      if (!isControlled) {
        setInternalText(next);
      }
      onChange?.(next);
    },
    [disabled, isControlled, onChange],
  );

  const toggleReveal = useCallback(() => {
    pendingSelection.current = readSelection(inputRef.current, id);
    setRevealed((open) => !open);
  }, [id]);

  const boxContract = {
    size: resolvedSize,
    'data-density': knobProps.density,
    'data-size': String(resolvedSize),
    'data-visual-height': String(visualHeight),
    'data-press-floor': belowFloor ? 'slop' : 'box',
    'data-ring-target': 'box',
    ...(belowFloor ? { hitSlop: pressTargetHitSlop(visualHeight) } : undefined),
  } as const;

  const layoutBind = {
    id,
    label: fieldProps.label,
    labelProps: fieldProps.labelProps,
    helperText: fieldProps.helperText,
    required: fieldProps.required,
    disabled,
    size: resolvedSize,
    knobProps,
    placeholder,
  };

  // oxlint-disable-next-line sonarjs/no-unused-vars -- destructured out so callers cannot override the password input type
  const { type: _omitInputType, ...areaInputProps } = inputProps ?? {};

  const renderBox = (inputValue: string | undefined, handleChange?: (text: string) => void, hasError = false) => (
    <FormsInput.Box
      {...boxContract}
      disabled={disabled}
      {...(hasError ? { theme: 'error' } : undefined)}>
      <FormsInput.Area
        ref={inputRef}
        // SAFETY: caller-supplied native input props, spread as-is like any host prop bag
        {...(areaInputProps as object)}
        id={id}
        value={inputValue ?? ''}
        disabled={disabled}
        readOnly={fieldProps.readOnly}
        placeholder={placeholder}
        type={revealed ? 'text' : 'password'}
        secureTextEntry={!revealed}
        textContentType="password"
        autoComplete="current-password"
        spellCheck={false}
        aria-required={fieldProps.required ?? undefined}
        aria-invalid={hasError}
        aria-readonly={fieldProps.readOnly ?? undefined}
        onChangeText={(next: string) => {
          handleChange?.(next);
          handleChangeText(next);
        }}
      />
      <FormsInput.Button
        glyphRing
        size={resolvedSize}
        disabled={disabled}
        aria-label={revealed ? HIDE_PASSWORD : SHOW_PASSWORD}
        aria-pressed={revealed}
        aria-controls={id}
        hitSlop={belowFloor ? pressTargetHitSlop(visualHeight) : undefined}
        onPress={disabled || fieldProps.readOnly ? undefined : toggleReveal}
        onKeyDown={
          // SAFETY: on web Tamagui forwards the DOM KeyboardEvent; the prop type is the native no-arg press signature
          // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
          ((e: KeyboardEvent) => {
            if (disabled || fieldProps.readOnly) {
              return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              toggleReveal();
            }
          }) as unknown as () => void
        }>
        <FormsInput.Icon aria-hidden>{revealed ? <EyeSlashIcon /> : <EyeIcon />}</FormsInput.Icon>
      </FormsInput.Button>
    </FormsInput.Box>
  );

  if (fieldProps.skeleton) {
    return (
      <FieldLayout
        {...layoutBind}
        error={fieldProps.error}>
        <FormsInput size={resolvedSize}>
          <Skeleton
            variant="rounded"
            width="100%"
            height={visualHeight}
          />
        </FormsInput>
      </FieldLayout>
    );
  }

  if (!resolvedForm || name === undefined || name === '') {
    return (
      <FieldLayout
        {...layoutBind}
        error={fieldProps.error}
        onBlur={onBlur}>
        <FormsInput
          size={resolvedSize}
          error={fieldProps.error}>
          {renderBox(text, undefined, isErrorShown(fieldProps.error))}
        </FormsInput>
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
        const resolvedError = getFieldError(field, fieldProps.error);
        return (
          <FieldLayout
            {...layoutBind}
            error={resolvedError}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}>
            <FormsInput
              size={resolvedSize}
              error={resolvedError}>
              {renderBox(
                field.state.value,
                (next) => {
                  // SAFETY: Password binds string-valued fields only (FormFieldProps' value type is string)
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
                  field.handleChange(next as never);
                },
                isErrorShown(resolvedError),
              )}
            </FormsInput>
          </FieldLayout>
        );
      }}
    </Field>
  );
};

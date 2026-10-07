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
import type { DeepKeys } from '@tanstack/form-core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SizeTokens, TamaguiElement } from 'tamagui';
import { useProps } from 'tamagui';

export type PasswordProps<
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
    inputProps?: Record<string, unknown>;
    size?: import('tamagui').SizeTokens;
  };

const SHOW_PASSWORD = 'Show password';
const HIDE_PASSWORD = 'Hide password';

interface Selection {
  start: number;
  end: number;
}

function nativeInput(node: unknown, id?: string): HTMLInputElement | null {
  const fromRef = node as { selectionStart?: number; setSelectionRange?: unknown } | null;
  if (fromRef && typeof fromRef.setSelectionRange === 'function') {
    return fromRef as HTMLInputElement;
  }
  if (typeof document === 'undefined' || !id) {
    return null;
  }
  return document.querySelector(`#${id}`) as HTMLInputElement | null;
}

function readSelection(node: unknown, id?: string): Selection | null {
  const el = nativeInput(node, id);
  if (!el || typeof el.selectionStart !== 'number') {
    return null;
  }
  return { start: el.selectionStart, end: el.selectionEnd ?? el.selectionStart };
}

function restoreSelection(node: unknown, sel: Selection | null, id?: string) {
  const el = nativeInput(node, id);
  el?.focus();
  if (sel) {
    el?.setSelectionRange(sel.start, sel.end);
  }
}

export function Password<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: PasswordProps<TData, TName>) {
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
  } = useProps(props) as PasswordProps<TData, TName> & { size?: unknown } & Record<string, unknown>;

  const { resolvedForm, knobProps, id } = useFormField({
    form,
    id: fieldProps.id,
    compact: fieldProps.compact,
  });
  const resolvedValidators = useResolvedValidators(fieldProps.required, validators, fieldProps.label, name);
  const resolvedSize: SizeTokens = (sizeFromProps ?? fieldProps.size ?? knobProps.sizeToken) as SizeTokens;
  const visualHeight = sizeRecipeForToken(String(resolvedSize), {
    touch: isTouchSurface(),
  }).height;
  const belowFloor = visualHeight < MIN_PRESS_TARGET;

  const isControlled = value !== undefined;
  const [internalText, setInternalText] = useState(String(defaultValue ?? ''));
  const text = isControlled ? String(value ?? '') : internalText;
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<TamaguiElement>(null);
  const pendingSelection = useRef<Selection | null>(null);

  useEffect(() => {
    if (!text) {
      setRevealed(false);
    }
  }, [text]);

  useLayoutEffect(() => {
    if (!pendingSelection.current) {
      return;
    }
    restoreSelection(inputRef.current, pendingSelection.current, id);
    pendingSelection.current = null;
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

  const { type: _omitInputType, ...areaInputProps } = inputProps ?? {};

  const renderBox = (inputValue: string | undefined, handleChange?: (text: string) => void, hasError?: boolean) => (
    <FormsInput.Box
      {...boxContract}
      disabled={disabled}
      {...(hasError ? { theme: 'error' } : undefined)}>
      <FormsInput.Area
        ref={inputRef}
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
        aria-invalid={hasError ?? undefined}
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

  if (!resolvedForm || !name) {
    return (
      <FieldLayout
        {...layoutBind}
        error={fieldProps.error}
        onBlur={onBlur}>
        <FormsInput
          size={resolvedSize}
          error={fieldProps.error}>
          {renderBox(text, undefined, !!fieldProps.error)}
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
                  field.handleChange(next as never);
                },
                !!resolvedError,
              )}
            </FormsInput>
          </FieldLayout>
        );
      }}
    </Field>
  );
}

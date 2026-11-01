/**
 * Frappe Check field — thin adapter over forms Checkbox.
 *
 * Design-law lives on this file: compose Checkbox, do not fork its chrome.
 * Radius stays NEVER circular (Checkbox clamp / per-component override).
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Checkbox as FormsCheckbox } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ComponentProps } from 'react';
import { useProps } from 'tamagui';

export type CheckProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, boolean>,
  // "onChange": FormFieldProps carries the DOM ChangeEventHandler from
  // YStackProps; this field exposes a canonical value callback instead.
  'children' | 'field' | 'onChange'
> &
  Partial<
    Omit<
      FieldComponentProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, boolean>,
      'children'
    >
  > & {
    value?: boolean;
    onChange?: (value: boolean) => void;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- pass-through props spread onto the Tamagui checkbox
    checkboxProps?: Record<string, unknown>;
  };

export const Check = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: CheckProps<TData, TName>,
) => {
  // SAFETY: useProps only expands Tamagui shorthands/media props; the keys remain CheckProps'
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- useProps widens the bag; extra keys flow into fieldProps
  const resolvedProps = useProps(props) as CheckProps<TData, TName> & Record<string, unknown>;
  const {
    checkboxProps,
    defaultValue,
    form,
    _mode,
    name,
    onBlur,
    onChange,
    _preserveValue,
    validators,
    disabled,
    value,
    ...fieldProps
  } = resolvedProps;

  return (
    <FormsCheckbox
      name={name}
      form={form}
      validators={validators}
      defaultValue={defaultValue}
      label={fieldProps.label}
      labelProps={fieldProps.labelProps}
      error={fieldProps.error}
      helperText={fieldProps.helperText}
      readOnly={fieldProps.readOnly}
      skeleton={fieldProps.skeleton}
      compact={fieldProps.compact}
      required={fieldProps.required}
      id={fieldProps.id}
      size={fieldProps.size}
      checked={value}
      onChange={(checked) => onChange?.(checked === true)}
      onBlur={onBlur}
      disabled={disabled}
      // SAFETY: caller-supplied Tamagui checkbox props, forwarded as-is
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      checkboxProps={checkboxProps as ComponentProps<typeof FormsCheckbox>['checkboxProps']}
    />
  );
};

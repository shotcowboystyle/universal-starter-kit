/**
 * Frappe Check field — thin adapter over forms Checkbox.
 *
 * Design-law lives on this file: compose Checkbox, do not fork its chrome.
 * Radius stays NEVER circular (Checkbox clamp / per-component override).
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Checkbox as FormsCheckbox } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type CheckProps<
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
    checkboxProps?: Record<string, unknown>;
  };

export function Check<TData extends Record<string, unknown> = Record<string, unknown>, TName extends string = string>(
  props: CheckProps<TData, TName>,
) {
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
  } = useProps(props) as CheckProps<TData, TName> & Record<string, unknown>;

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
      checkboxProps={checkboxProps as any}
    />
  );
}

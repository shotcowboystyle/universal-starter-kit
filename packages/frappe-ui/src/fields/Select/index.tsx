/**
 * Frappe Select — thin adapter over forms Select.
 * Design-law lives on this file: compose Select, canonical onChange (LC-14).
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Select as FormsSelect } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type SelectProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
  'children' | 'field'
> &
  Partial<
    Omit<
      FieldComponentProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
      'children'
    >
  > & {
    value?: string;
    onChange?: (value: string) => void;
    options: string[] | { label: string; value: string }[];
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
  };

export function Select<TData extends Record<string, unknown> = Record<string, unknown>, TName extends string = string>(
  props: SelectProps<TData, TName>,
) {
  const {
    defaultValue,
    form,
    _mode,
    name,
    onBlur,
    onChange,
    options,
    placeholder = 'Select an option',
    _preserveValue,
    validators,
    disabled,
    value,
    ...fieldProps
  } = useProps(props) as SelectProps<TData, TName> & Record<string, unknown>;

  const normalizedOptions = (options || []).map((opt) => (typeof opt === 'string' ? { label: opt, value: opt } : opt));

  return (
    <FormsSelect
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
      disabled={disabled}
      value={value}
      onChange={(val) => onChange?.(Array.isArray(val) ? (val[0] ?? '') : val)}
      onBlur={onBlur}
      options={normalizedOptions}
      placeholder={placeholder}
    />
  );
}

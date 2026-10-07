/**
 * Frappe Data field — thin adapter over forms Input.
 *
 * Design-law lives on this file: compose Input, do not fork its chrome.
 * D/R/E/Q/S/C and the DEFAULT-class field box all inherit.
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Input as FormsInput } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type DataProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
  // "onChange": FormFieldProps carries the DOM ChangeEventHandler from
  // YStackProps; this field exposes a canonical value callback instead.
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
    type?: 'data' | 'small_text' | 'long_text' | 'text_editor';
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    maxLength?: number;
    inputProps?: Record<string, unknown>;
  };

export function Data<TData extends Record<string, unknown> = Record<string, unknown>, TName extends string = string>(
  props: DataProps<TData, TName>,
) {
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
    type = 'data',
    maxLength,
    ...fieldProps
  } = useProps(props) as DataProps<TData, TName> & Record<string, unknown>;
  const isMultiline = type === 'long_text' || type === 'text_editor' || type === 'small_text';

  return (
    <FormsInput
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
      value={value}
      onChangeText={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      multiline={isMultiline}
      maxLength={maxLength ?? (isMultiline ? undefined : 140)}
      inputProps={inputProps as any}
    />
  );
}

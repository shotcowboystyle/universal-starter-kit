/**
 * Frappe Small Text — thin adapter over forms TextArea.
 * Design-law lives on this file: compose TextArea, do not fork Input chrome.
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { TextArea } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type SmallTextProps<
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
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    maxLength?: number;
    textAreaProps?: Record<string, unknown>;
  };

export function SmallText<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: SmallTextProps<TData, TName>) {
  const {
    defaultValue,
    form,
    _mode,
    name,
    onBlur,
    onChange,
    placeholder,
    _preserveValue,
    validators,
    disabled,
    value,
    maxLength,
    textAreaProps,
    ...fieldProps
  } = useProps(props) as SmallTextProps<TData, TName> & Record<string, unknown>;

  return (
    <TextArea
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
      maxLength={maxLength}
      minRows={2}
      maxRows={4}
      textAreaProps={textAreaProps as any}
    />
  );
}

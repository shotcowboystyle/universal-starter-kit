import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { OTPInput } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type OTPInputFieldProps<
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
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    length?: number;
    secureTextEntry?: boolean;
    onComplete?: (code: string) => void;
    type?: 'numeric' | 'alphanumeric' | 'password';
  };

export function OTPInputField<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: OTPInputFieldProps<TData, TName>) {
  const {
    defaultValue,
    form,
    name,
    onChange,
    validators,
    disabled,
    value,
    length,
    secureTextEntry,
    onComplete,
    type,
    mode: _mode,
    preserveValue: _preserveValue,
    ...fieldProps
  } = useProps(props);

  return (
    <OTPInput
      name={name}
      form={form}
      validators={validators}
      defaultValue={defaultValue as any}
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
      onChange={onChange}
      disabled={disabled}
      length={length}
      secureTextEntry={secureTextEntry}
      onComplete={onComplete}
      type={type}
    />
  );
}

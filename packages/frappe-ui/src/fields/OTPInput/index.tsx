import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { OTPInput } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
type FieldData = Record<string, unknown>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
export type OTPInputFieldProps<TData extends FieldData = FieldData, TName extends string = string> = Omit<
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

export const OTPInputField = <TData extends FieldData = FieldData, TName extends string = string>(
  props: OTPInputFieldProps<TData, TName>,
) => {
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
    ...fieldProps
  } = useProps(props);

  return (
    <OTPInput
      name={name}
      form={form}
      validators={validators}
      // SAFETY: the field's defaultValue is the same OTP string; OTPInput's DeepValue-derived type cannot be named from this generic adapter
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      defaultValue={defaultValue as never}
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
};

import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Progress as FormsProgress } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type ProgressFieldProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, number>,
  'children' | 'field'
> &
  Partial<
    Omit<
      FieldComponentProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, number>,
      'children'
    >
  > & {
    value?: number;
    max?: number;
    progressProps?: Record<string, unknown>;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
  };

export function ProgressField<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: ProgressFieldProps<TData, TName>) {
  const {
    progressProps,
    defaultValue,
    form,
    name,
    validators,
    value,
    max,
    mode: _mode,
    preserveValue: _preserveValue,
    ...fieldProps
  } = useProps(props);

  return (
    <FormsProgress
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
      max={max}
      progressProps={progressProps as any}
    />
  );
}

import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { RadioGroup as FormsRadioGroup } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ReactNode } from 'react';
import { useProps } from 'tamagui';

export type RadioGroupFieldProps<
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
    options?: { label: string; value: string }[];
    orientation?: 'horizontal' | 'vertical';
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    children?: ReactNode;
    radioGroupProps?: Record<string, unknown>;
  };

export function RadioGroupField<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: RadioGroupFieldProps<TData, TName>) {
  const {
    radioGroupProps,
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
    options,
    orientation,
    children,
    ...fieldProps
  } = useProps(props) as RadioGroupFieldProps<TData, TName> & Record<string, unknown>;

  return (
    <FormsRadioGroup
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
      onValueChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      options={options}
      orientation={orientation}
      radioGroupProps={radioGroupProps as any}>
      {children}
    </FormsRadioGroup>
  );
}

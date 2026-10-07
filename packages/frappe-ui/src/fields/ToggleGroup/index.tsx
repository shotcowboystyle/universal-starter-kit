import type { FormFieldProps, FieldComponentProps, ToggleGroupOption } from '@repo/forms';
import { ToggleGroup as FormsToggleGroup } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ReactNode } from 'react';
import { useProps } from 'tamagui';

export type ToggleGroupFieldProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string | string[]>,
  'children' | 'field'
> &
  Partial<
    Omit<
      FieldComponentProps<
        TData,
        TName extends DeepKeys<TData> ? TName : DeepKeys<TData>,
        unknown,
        unknown,
        string | string[]
      >,
      'children'
    >
  > & {
    type?: 'single' | 'multiple';
    value?: string | string[];
    onChange?: (value: string | string[]) => void;
    options?: ToggleGroupOption[];
    orientation?: 'horizontal' | 'vertical';
    disabled?: boolean;
    /** DG-ST-03 — explains why the group is disabled (forms ToggleGroup contract). */
    disabledReason?: string;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    children?: ReactNode;
  };

export function ToggleGroupField<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: ToggleGroupFieldProps<TData, TName>) {
  const {
    defaultValue,
    form,
    _mode,
    name,
    onBlur,
    onChange,
    _preserveValue,
    validators,
    disabled,
    disabledReason,
    value,
    type,
    options,
    orientation,
    children,
    ...fieldProps
  } = useProps(props) as ToggleGroupFieldProps<TData, TName> & Record<string, unknown>;

  return (
    <FormsToggleGroup
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
      type={type}
      value={value}
      onValueChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      disabledReason={disabledReason}
      options={options}
      orientation={orientation}>
      {children}
    </FormsToggleGroup>
  );
}

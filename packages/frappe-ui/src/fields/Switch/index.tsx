import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Switch as FormsSwitch } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type SwitchFieldProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, boolean>,
  'children' | 'field'
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
    switchProps?: Record<string, unknown>;
  };

export function SwitchField<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: SwitchFieldProps<TData, TName>) {
  const {
    switchProps,
    defaultValue,
    form,
    name,
    onBlur,
    onChange,
    validators,
    disabled,
    value,
    mode: _mode,
    preserveValue: _preserveValue,
    ...fieldProps
  } = useProps(props);

  return (
    <FormsSwitch
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
      onCheckedChange={(checked) => onChange?.(checked)}
      onBlur={onBlur}
      disabled={disabled}
      switchProps={switchProps as any}
    />
  );
}

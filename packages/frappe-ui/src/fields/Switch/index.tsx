import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Switch as FormsSwitch } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ComponentProps } from 'react';
import { useProps } from 'tamagui';

export type SwitchFieldProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
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
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- pass-through props spread onto the Tamagui switch
    switchProps?: Record<string, unknown>;
  };

export const SwitchField = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: SwitchFieldProps<TData, TName>,
) => {
  const { switchProps, defaultValue, form, name, onBlur, onChange, validators, disabled, value, ...fieldProps } =
    useProps(props);

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
      // SAFETY: caller-supplied Tamagui switch props, forwarded as-is
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      switchProps={switchProps as ComponentProps<typeof FormsSwitch>['switchProps']}
    />
  );
};

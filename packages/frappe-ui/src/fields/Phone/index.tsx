/**
 * Frappe Phone — thin adapter over forms PhoneInput.
 * Design-law lives on this file: compose PhoneInput, canonical onChange.
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { PhoneInput } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ComponentProps } from 'react';
import { useProps } from 'tamagui';

export type PhoneFieldProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
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
    defaultCountry?: string;
    placeholder?: string;
  };

export const Phone = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: PhoneFieldProps<TData, TName>,
) => {
  // SAFETY: useProps only expands Tamagui shorthands/media props; the keys remain PhoneFieldProps'
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- useProps widens the bag; extra keys flow into fieldProps
  const resolvedProps = useProps(props) as PhoneFieldProps<TData, TName> & Record<string, unknown>;
  const {
    defaultValue,
    form,
    _mode,
    name,
    onChange,
    placeholder,
    _preserveValue,
    validators,
    disabled,
    value,
    defaultCountry,
    ...fieldProps
  } = resolvedProps;

  const phoneProps: ComponentProps<typeof PhoneInput> = {
    name,
    form,
    validators,
    defaultValue,
    label: fieldProps.label,
    labelProps: fieldProps.labelProps,
    error: fieldProps.error,
    helperText: fieldProps.helperText,
    readOnly: fieldProps.readOnly,
    skeleton: fieldProps.skeleton,
    compact: fieldProps.compact,
    required: fieldProps.required,
    id: fieldProps.id,
    size: fieldProps.size,
    value,
    onChange,
    placeholder,
    disabled,
    defaultCountry,
  };

  return <PhoneInput {...phoneProps} />;
};

/**
 * Frappe Phone — thin adapter over forms PhoneInput.
 * Design-law lives on this file: compose PhoneInput, canonical onChange.
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { PhoneInput } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type PhoneFieldProps<
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

export function Phone<TData extends Record<string, unknown> = Record<string, unknown>, TName extends string = string>(
  props: PhoneFieldProps<TData, TName>,
) {
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
  } = useProps(props) as PhoneFieldProps<TData, TName> & Record<string, unknown>;

  const phoneProps: any = {
    name,
    form,
    validators,
    defaultValue: defaultValue!,
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
}

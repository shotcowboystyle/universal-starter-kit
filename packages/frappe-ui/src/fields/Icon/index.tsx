import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Icon as FormsIcon } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type IconProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
  'children' | 'field' | 'onChange'
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
    icons?: readonly string[];
    options?: string;
  };

export function Icon<TData extends Record<string, unknown> = Record<string, unknown>, TName extends string = string>(
  props: IconProps<TData, TName>,
) {
  const {
    defaultValue,
    form,
    mode,
    name,
    onBlur,
    onChange,
    preserveValue,
    validators,
    disabled,
    value,
    placeholder,
    icons,
    options,
    ...fieldProps
  } = useProps(props) as IconProps<TData, TName> & Record<string, unknown>;

  return (
    <FormsIcon
      name={name}
      form={form}
      validators={validators}
      value={value}
      onChange={onChange as ((v: string) => void) | undefined}
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
      disabled={disabled}
      placeholder={placeholder}
      icons={icons}
      options={options}
      onBlur={onBlur}
      mode={mode}
      preserveValue={preserveValue}
    />
  );
}

import { NavigationArrowIcon } from '@phosphor-icons/react';
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Geolocation as FormsGeolocation } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type GeolocationProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors the TParentData constraint of FormFieldProps/FieldComponentProps
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
    /** JSON string: compact {"lat":n,"lng":n} or a stock Frappe FeatureCollection */
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
  };

export const Geolocation = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors the TParentData constraint of FormFieldProps/FieldComponentProps
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: GeolocationProps<TData, TName>,
) => {
  const { defaultValue, form, name, onBlur, onChange, validators, disabled, value, ...fieldProps } = useProps(props);

  return (
    <FormsGeolocation
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
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      locationIcon={<NavigationArrowIcon size={16} />}
    />
  );
};

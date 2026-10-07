import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Slider as FormsSlider } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type SliderFieldProps<
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
    onChange?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    sliderProps?: Record<string, unknown>;
  };

export function SliderField<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: SliderFieldProps<TData, TName>) {
  const {
    sliderProps,
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
    min,
    max,
    step,
    ...fieldProps
  } = useProps(props) as SliderFieldProps<TData, TName> & Record<string, unknown>;

  return (
    <FormsSlider
      name={name}
      form={form}
      validators={validators}
      defaultValue={defaultValue == null ? undefined : [defaultValue]}
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
      value={value == null ? undefined : [value]}
      onValueChange={(values) => onChange?.(values[0])}
      onBlur={onBlur}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      sliderProps={sliderProps as any}
    />
  );
}

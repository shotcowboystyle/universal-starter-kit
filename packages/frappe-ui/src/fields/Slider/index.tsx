import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Slider as FormsSlider } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ComponentProps } from 'react';
import { useProps } from 'tamagui';

export type SliderFieldProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
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
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- pass-through props spread onto the Tamagui slider
    sliderProps?: Record<string, unknown>;
  };

export const SliderField = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: SliderFieldProps<TData, TName>,
) => {
  // SAFETY: useProps only expands Tamagui shorthands/media props; the keys remain SliderFieldProps'
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- useProps widens the bag; extra keys flow into fieldProps
  const resolvedProps = useProps(props) as SliderFieldProps<TData, TName> & Record<string, unknown>;
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
  } = resolvedProps;

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
      onChange={(values) => onChange?.(values[0])}
      onBlur={onBlur}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      // SAFETY: caller-supplied Tamagui slider props, forwarded as-is
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      sliderProps={sliderProps as ComponentProps<typeof FormsSlider>['sliderProps']}
    />
  );
};

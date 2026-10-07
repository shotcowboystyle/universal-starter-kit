/**
 * Frappe Int / Float / Currency / Percent — thin adapter over forms Stepper.
 *
 * Design-law lives on this file: compose Stepper, do not fork Input chrome.
 * Currency / Percent unit marks are semantic content and read from
 * formCommonColors.text ($color11), never the muted tier.
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Stepper as FormsStepper, formCommonColors, useForm } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useEffect, useRef } from 'react';
import { Text, XStack, YStack, useProps } from 'tamagui';

export type NumericType = 'Int' | 'Float' | 'Currency' | 'Percent';

export type NumericProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, number>,
  // "onChange": FormFieldProps carries the DOM ChangeEventHandler from
  // YStackProps; this field exposes a canonical value callback instead.
  'children' | 'field' | 'onChange'
> &
  Partial<
    Omit<
      FieldComponentProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, number>,
      'children'
    >
  > & {
    value?: number;
    onChange?: (value: number | undefined) => void;
    type?: NumericType;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
    currencySymbol?: string;
    inputProps?: Record<string, unknown>;
  };

function derivePrecision(type: NumericType, explicitPrecision?: number): number {
  if (explicitPrecision !== undefined) {
    return explicitPrecision;
  }
  return type === 'Int' ? 0 : 2;
}

export function Numeric<TData extends Record<string, unknown> = Record<string, unknown>, TName extends string = string>(
  props: NumericProps<TData, TName>,
) {
  const {
    defaultValue,
    form,
    inputProps,
    mode,
    name,
    onBlur,
    onChange,
    preserveValue,
    validators,
    disabled,
    value,
    type = 'Float',
    placeholder,
    min,
    max,
    step,
    precision,
    currencySymbol = '$',
    ...fieldProps
  } = useProps(props);

  const resolvedPrecision = derivePrecision(type, precision);

  // Standalone controlled usage (value/onChange without a parent form) is
  // bridged through a local single-field form so Stepper's field mode
  // notifies the caller on every change.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const fieldName = (name as string | undefined) ?? 'value';
  const localForm = useForm({
    defaultValues: { [fieldName]: value ?? defaultValue },
    listeners: {
      onChange: ({ fieldApi }) => {
        onChangeRef.current?.(fieldApi.state.value as number | undefined);
      },
    },
  });
  const useLocalForm = !form && (onChange !== undefined || value !== undefined);

  useEffect(() => {
    if (!useLocalForm || value === undefined) {
      return;
    }
    if (localForm.getFieldValue(fieldName) !== value) {
      localForm.setFieldValue(fieldName, value as never);
    }
  }, [useLocalForm, value, localForm, fieldName]);

  const stepper = (
    <FormsStepper
      name={useLocalForm ? fieldName : name}
      form={(form ?? (useLocalForm ? localForm : undefined)) as any}
      validators={validators}
      defaultValue={value ?? defaultValue}
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
      min={min}
      max={max}
      step={step}
      precision={resolvedPrecision}
      onBlur={onBlur}
      mode={mode}
      preserveValue={preserveValue}
      inputProps={inputProps as any}
    />
  );

  if (type === 'Currency' || type === 'Percent') {
    // Unit adornments are semantic content, not placeholders: the muted tier
    // ($color10) measured 3.96:1 on the form surface (contrast resweep,
    // FrappeUI/Numeric), so they read from the ramp's body-text tier.
    return (
      <XStack
        gap="$2"
        alignItems="center">
        {type === 'Currency' && <Text color={formCommonColors.text}>{currencySymbol}</Text>}
        <YStack flex={1}>{stepper}</YStack>
        {type === 'Percent' && <Text color={formCommonColors.text}>%</Text>}
      </XStack>
    );
  }

  return stepper;
}

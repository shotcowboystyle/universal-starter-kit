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
import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import { Text, XStack, YStack, useProps } from 'tamagui';

export type NumericType = 'Int' | 'Float' | 'Currency' | 'Percent';

type StepperFieldProps = ComponentProps<typeof FormsStepper>;

export type NumericProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
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
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- pass-through props spread onto the Stepper's input
    inputProps?: Record<string, unknown>;
  };

const derivePrecision = (type: NumericType, explicitPrecision?: number): number => {
  if (explicitPrecision !== undefined) {
    return explicitPrecision;
  }
  return type === 'Int' ? 0 : 2;
};

export const Numeric = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: NumericProps<TData, TName>,
) => {
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
  // oxlint-disable-next-line react/refs -- latest-value ref synced during render; read only from the form listener
  onChangeRef.current = onChange;
  // SAFETY: TName is constrained to string keys of TData
  const fieldName = (name as string | undefined) ?? 'value';
  const localForm = useForm({
    defaultValues: { [fieldName]: value ?? defaultValue },
    listeners: {
      onChange: ({ fieldApi }) => {
        // SAFETY: the bridge form holds this one numeric field, seeded from value/defaultValue
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
      // SAFETY: fieldName is the bridge form's only key and holds a number
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      localForm.setFieldValue(fieldName, value as never);
    }
  }, [useLocalForm, value, localForm, fieldName]);

  const stepper = (
    <FormsStepper
      name={useLocalForm ? fieldName : name}
      // SAFETY: Stepper only reads and writes the named field, which exists on either form
      form={(form ?? (useLocalForm ? localForm : undefined)) as StepperFieldProps['form']}
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
      // SAFETY: caller-supplied host input props, forwarded as-is
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      inputProps={inputProps as StepperFieldProps['inputProps']}
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
};

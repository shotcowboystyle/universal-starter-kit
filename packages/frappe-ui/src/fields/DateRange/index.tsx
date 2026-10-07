import type { DateRange, FormFieldProps, FieldComponentProps } from '@repo/forms';
import { DateRangePicker as FormsDateRangePicker } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useMemo } from 'react';
import { useProps } from 'tamagui';

import { fromFrappeDateValue, toFrappeDateValue } from '../Date/wire';

export type DateRangeFieldProps<
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
    placeholder?: string;
  };

/**
 * A `Date Range` is stored as its two ends, comma-separated, and each end is
 * the same bare `YYYY-MM-DD` a `Date` field writes — so both ends serialize
 * through the Date field's shared wire body rather than a second local-midnight
 * parse that could drift from it.
 */
const rangeSeparator = ',';

function toPickerDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = fromFrappeDateValue(value, 'date');
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `undefined` stays undefined so uncontrolled (`defaultValue`-only) and
 * form-bound use keep their semantics: the picker adopts an external value
 * only when `value` is not undefined.
 */
function toPickerRange(value: string | undefined): DateRange | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value) {
    return null;
  }
  const [start, end] = value.split(rangeSeparator);
  return { start: toPickerDate(start?.trim()), end: toPickerDate(end?.trim()) };
}

function toWireValue(range: DateRange | null): string {
  if (!range?.start) {
    return '';
  }
  const start = toFrappeDateValue(range.start, 'date');
  if (!range.end) {
    return start;
  }
  return `${start}${rangeSeparator}${toFrappeDateValue(range.end, 'date')}`;
}

export function DateRangeField<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: DateRangeFieldProps<TData, TName>) {
  const {
    defaultValue,
    form,
    mode: _mode,
    name,
    onBlur: _onBlur,
    onChange,
    preserveValue: _preserveValue,
    validators,
    disabled,
    value,
    placeholder,
    ...fieldProps
  } = useProps(props);

  const wireValue = value;
  const emit = onChange as ((value: string) => void) | undefined;
  // Memoized so the Date identities are stable across renders: the picker
  // re-seeds its display state from every new `value` identity, which would
  // otherwise discard a half-picked range on an unrelated re-render.
  const rangeValue = useMemo(() => toPickerRange(wireValue), [wireValue]);
  const rangeDefault = useMemo(
    () => (typeof defaultValue === 'string' ? toPickerRange(defaultValue) : defaultValue),
    [defaultValue],
  );

  return (
    <FormsDateRangePicker
      name={name}
      form={form}
      validators={validators}
      value={rangeValue}
      onChange={(range) => emit?.(toWireValue(range))}
      defaultValue={rangeDefault}
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
    />
  );
}

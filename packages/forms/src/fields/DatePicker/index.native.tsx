/**
 * Native DatePicker — OS calendar (iOS inline / Android dialog).
 *
 * Replaces `index.tsx` on native via Metro. Sibling pickers (range, month,
 * calendar) stay the catalog implementations.
 */
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { useCallback, useEffect, useState } from 'react';
import { Pressable as RNPressable } from 'react-native';
import { useProps } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { Validator } from '../../types';
import { OsDateTimeSheet } from '../nativeDateTime/OsDateTimeSheet';

import { DatePicker as CatalogDatePicker } from './catalog';
import type { DatePickerProps } from './catalog';
import { DatePickerFieldValueSync } from './FieldValueSync';
import { DatePickerInputTrigger, formatDateDisplay } from './parts';
import { coerceToDate } from './utils';

export type { DatePickerProps } from './catalog';

export type { ViewMode } from './parts';
export { MultiDatePicker } from './MultiDatePicker';
export type { MultiDatePickerProps } from './MultiDatePicker';
export { DateRangePicker } from './DateRangePicker';
export type { DateRange, DateRangePickerProps } from './DateRangePicker';
export { Calendar } from './Calendar';
export type { CalendarProps, CalendarMode } from './Calendar';
export { MonthPicker } from './MonthPicker';
export type { MonthPickerProps, MonthPickerValue } from './MonthPicker';
export { DatetimePicker } from './DatetimePicker';
export type { DatetimePickerProps } from './DatetimePicker';

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

const NativeDatePicker = (props: DatePickerProps) => {
  const {
    defaultValue,
    value: controlledValue,
    onChange,
    // oxlint-disable-next-line typescript/no-deprecated -- keep calling the deprecated alias for back-compat
    onValueChange,
    form,
    placeholder = t('Select date'),
    minDate,
    maxDate,
    disabled,
    mode,
    name,
    preserveValue,
    validators,
    label,
    labelProps,
    error: errorProp,
    helperText,
    required,
    size,
    readOnly,
    onBlur,
    skeleton,
    compact,
    id: idProp,
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const hasLabel = Boolean(label);
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => coerceToDate(controlledValue ?? defaultValue));
  useEffect(() => {
    if (controlledValue === undefined) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- controlled value must mirror into local selection after commit() also writes it; derived state would drop commits
    setSelectedDate(coerceToDate(controlledValue));
  }, [controlledValue]);

  const commit = useCallback(
    (date: Date | null, fieldChange?: (value: Date | null) => void) => {
      setSelectedDate(date);
      fieldChange?.(date);
      onChange?.(date);
      onValueChange?.(date);
      setOpen(false);
    },
    [onChange, onValueChange],
  );

  const renderControl = (
    hasError = false,
    blurHandler?: (...args: unknown[]) => void,
    fieldChange?: (value: Date | null) => void,
  ) => {
    if (readOnly) {
      return (
        <InputParts.Box>
          <InputParts.Area
            value={formatDateDisplay(selectedDate)}
            readOnly
            aria-readonly="true"
            aria-required={required ? true : undefined}
            aria-invalid={hasError ? true : undefined}
            placeholder={placeholder}
          />
        </InputParts.Box>
      );
    }
    return (
      <>
        <RNPressable
          onPress={() => {
            if (!disabled) {
              setOpen(true);
            }
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={hasLabel ? undefined : t('Date')}
          accessibilityValue={{ text: formatDateDisplay(selectedDate) || placeholder }}
          style={{ width: '100%' }}>
          <DatePickerInputTrigger
            value={formatDateDisplay(selectedDate)}
            placeholder={placeholder}
            disabled={disabled}
            open={open}
            onReset={() => {
              commit(null, fieldChange);
            }}
            onButtonPress={() => {
              // Press is handled by the wrapping RNPressable on native.
            }}
            error={hasError}
            id={id}
            aria-label={hasLabel ? undefined : t('Date')}
            aria-required={required ? true : undefined}
            aria-invalid={hasError ? true : undefined}
          />
        </RNPressable>
        <OsDateTimeSheet
          open={open}
          // oxlint-disable-next-line react/purity -- fallback 'now' only matters when the sheet opens; matches prior per-render behavior
          value={selectedDate ?? new Date()}
          mode="date"
          minDate={minDate}
          maxDate={maxDate}
          onCancel={() => {
            setOpen(false);
            blurHandler?.();
          }}
          onConfirm={(date) => {
            commit(date, fieldChange);
            blurHandler?.();
          }}
        />
      </>
    );
  };

  if (skeleton) {
    return (
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        <Skeleton
          variant="rounded"
          width="100%"
          height={knobProps.sizeToken}
        />
      </FieldLayout>
    );
  }

  if (resolvedForm == null || name == null || name === '') {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={errorProp}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        disabled={disabled}>
        <InputParts size={size ?? knobProps.sizeToken}>{renderControl(hasErrorValue(errorProp))}</InputParts>
      </FieldLayout>
    );
  }

  return (
    <Field
      defaultValue={defaultValue}
      form={resolvedForm}
      mode={mode}
      name={name}
      preserveValue={preserveValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, errorProp);
        return (
          <>
            <DatePickerFieldValueSync
              value={field.state.value}
              onSync={setSelectedDate}
            />
            <FieldLayout
              id={id}
              label={label}
              labelProps={labelProps}
              error={resolvedError}
              helperText={helperText}
              required={required}
              size={size}
              knobProps={knobProps}
              disabled={disabled}>
              <InputParts size={size ?? knobProps.sizeToken}>
                {renderControl(
                  hasErrorValue(resolvedError),
                  mergeFieldHandler(field, 'handleBlur', onBlur),
                  mergeFieldHandler(field, 'handleChange'),
                )}
              </InputParts>
            </FieldLayout>
          </>
        );
      }}
    </Field>
  );
};

export const DatePicker = <
  TParentData,
  TName extends DeepKeys<TParentData>,
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- Validator<DeepValue<..>> resolves to any via TanStack's typings; signature must match catalog
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- Validator<DeepValue<..>> resolves to any via TanStack's typings; signature must match catalog
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(
  props: DatePickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
) => (props.native === false ? <CatalogDatePicker {...props} /> : <NativeDatePicker {...props} />);

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

import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';
import { OsDateTimeSheet } from '../nativeDateTime/OsDateTimeSheet';

import { DatePicker as CatalogDatePicker } from './catalog';
import { DatePickerFieldValueSync } from './fieldValueSync';
import { DatePickerInputTrigger, formatDateDisplay } from './parts';
import { coerceToDate } from './utils';

export type DatePickerProps<
  TParentData = any,
  TName extends DeepKeys<TParentData> = any,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  'children' | 'field' | 'onChange'
> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    placeholder?: string;
    format?: string;
    minDate?: Date;
    maxDate?: Date;
    disabled?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    value?: Date | string | null;
    onChange?: (value: Date | null) => void;
    onValueChange?: (value: Date | null) => void;
    /**
     * Opt out of the OS picker and keep the catalog calendar. Default on
     * native is the OS picker (iOS calendar / time wheel).
     */
    native?: boolean;
  };

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

export function DatePicker<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: DatePickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  if (props.native === false) {
    return <CatalogDatePicker {...props} />;
  }
  const {
    defaultValue,
    value: controlledValue,
    onChange,
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
    setSelectedDate(coerceToDate(controlledValue));
  }, [controlledValue]);

  const commit = useCallback(
    (date: Date | null, fieldChange?: (value: unknown) => void) => {
      setSelectedDate(date);
      fieldChange?.(date);
      onChange?.(date);
      onValueChange?.(date);
      setOpen(false);
    },
    [onChange, onValueChange],
  );

  const renderControl = (
    hasError?: boolean,
    blurHandler?: (...args: unknown[]) => void,
    fieldChange?: (value: unknown) => void,
  ) => {
    if (readOnly) {
      return (
        <InputParts.Box>
          <InputParts.Area
            value={formatDateDisplay(selectedDate)}
            readOnly
            aria-readonly="true"
            aria-required={required || undefined}
            aria-invalid={hasError || undefined}
            placeholder={placeholder}
          />
        </InputParts.Box>
      );
    }
    return (
      <>
        <RNPressable
          onPress={() => !disabled && setOpen(true)}
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
            onButtonPress={() => {}}
            error={!!hasError}
            id={id}
            aria-label={hasLabel ? undefined : t('Date')}
            aria-required={required || undefined}
            aria-invalid={hasError || undefined}
          />
        </RNPressable>
        <OsDateTimeSheet
          open={open}
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
      <FieldLayout id={id} label={label} size={size} knobProps={knobProps}>
        <Skeleton variant="rounded" width="100%" height={knobProps.sizeToken} />
      </FieldLayout>
    );
  }

  if (!resolvedForm || !name) {
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
        <InputParts size={size || knobProps.sizeToken}>{renderControl(!!errorProp)}</InputParts>
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
            <DatePickerFieldValueSync value={field.state.value} onSync={setSelectedDate} />
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
              <InputParts size={size || knobProps.sizeToken}>
                {renderControl(
                  !!resolvedError,
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
}

import { formatAbsoluteDateTime } from '@repo/theme';
/**
 * Native DatetimePicker — iOS calendar then time wheel; Android date then time.
 */
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { DatetimePicker as CatalogDatetimePicker } from './DatetimePicker.catalog';
import { DatePickerFieldValueSync } from './fieldValueSync';
import { DatePickerInputTrigger } from './parts';
import { coerceToDate } from './utils';

type TimeFormat = '12h' | '24h';

export type DatetimePickerProps<
  TParentData = any,
  TName extends DeepKeys<TParentData> = any,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children' | 'field'> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    placeholder?: string;
    minDate?: Date;
    maxDate?: Date;
    disabled?: boolean;
    timeFormat?: TimeFormat;
    minuteStep?: number;
    showSeconds?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    value?: Date | string | null;
    onChange?: (value: Date | null) => void;
    onValueChange?: (value: Date | null) => void;
    native?: boolean;
  };

function formatDatetimeDisplay(date: Date | null, timeFormat: TimeFormat, showSeconds: boolean): string {
  if (!date) {
    return '';
  }
  return formatAbsoluteDateTime(date, {
    year: 'always',
    hour12: timeFormat === '12h',
    seconds: showSeconds,
  });
}

export function DatetimePicker<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: DatetimePickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  if (props.native === false) {
    return <CatalogDatetimePicker {...props} />;
  }
  const {
    defaultValue,
    value: controlledValue,
    onChange,
    onValueChange,
    form,
    placeholder = t('Select date & time'),
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
    timeFormat = '12h',
    showSeconds = false,
    id: idProp,
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const hasLabel = Boolean(label);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Date | null>(() => coerceToDate(controlledValue ?? defaultValue));
  useEffect(() => {
    if (controlledValue === undefined) {
      return;
    }
    setSelected(coerceToDate(controlledValue));
  }, [controlledValue]);

  const display = useMemo(
    () => formatDatetimeDisplay(selected, timeFormat, showSeconds),
    [selected, timeFormat, showSeconds],
  );

  const commit = useCallback(
    (date: Date | null, fieldChange?: (value: unknown) => void) => {
      setSelected(date);
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
            value={display}
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
          accessibilityLabel={hasLabel ? undefined : t('Date and time')}
          accessibilityValue={{ text: display || placeholder }}
          style={{ width: '100%' }}>
          <DatePickerInputTrigger
            value={display}
            placeholder={placeholder}
            disabled={disabled}
            open={open}
            onReset={() => {
              commit(null, fieldChange);
            }}
            onButtonPress={() => {}}
            error={!!hasError}
            id={id}
            aria-label={hasLabel ? undefined : t('Date and time')}
            aria-required={required || undefined}
            aria-invalid={hasError || undefined}
          />
        </RNPressable>
        <OsDateTimeSheet
          open={open}
          value={selected ?? new Date()}
          mode="datetime"
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
            <DatePickerFieldValueSync value={field.state.value} onSync={setSelected} />
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

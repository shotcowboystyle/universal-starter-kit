/**
 * Native TimePicker — iOS time wheel / Android time dialog.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable as RNPressable } from 'react-native';

import { Field, FieldLayout } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import { OsDateTimeSheet } from '../nativeDateTime/OsDateTimeSheet';

import { TimePicker as CatalogTimePicker } from './catalog';
import type { TimePickerProps } from './catalog';
import {
  TimePickerInputTrigger,
  firstError,
  formatTimeDisplay,
  isValidTimeString,
  parseTimeString,
  toTimeString,
} from './parts';

export type { TimePickerProps } from './catalog';

export type { TimeFormat } from './parts';
export { formatTimeDisplay, isValidTimeString, parseTimeString, toTimeString } from './parts';

const timeToDate = (value: string): Date => {
  const { h, m, s } = parseTimeString(value);
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d;
};

const dateToTime = (date: Date, showSeconds: boolean): string =>
  toTimeString(date.getHours(), date.getMinutes(), showSeconds ? date.getSeconds() : undefined);

type FieldChange = (value: string) => void;

const NativeTimePicker = (props: TimePickerProps) => {
  const {
    name,
    form: formProp,
    validators,
    label,
    labelProps,
    helperText,
    error,
    required,
    size,
    id: idProp,
    value: valueProp,
    defaultValue,
    onChange,
    onBlur,
    disabled,
    readOnly,
    timeFormat = '12h',
    showSeconds = false,
    placeholder = t('Select time'),
    clockIcon,
    skeleton,
    compact,
  } = props;
  const { resolvedForm, knobProps, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const hasLabel = Boolean(label);
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string>(() => valueProp ?? defaultValue ?? '');
  useEffect(() => {
    if (valueProp === undefined) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- adopts the controlled `value` prop into display state
    setInternalValue(valueProp);
  }, [valueProp]);
  const value = internalValue;
  const valueIsInvalid = !!value.trim() && !isValidTimeString(value);
  const formatError = valueIsInvalid ? t('Invalid time value') : undefined;

  const commit = useCallback(
    (time: string, fieldChange?: FieldChange) => {
      setInternalValue(time);
      fieldChange?.(time);
      onChange?.(time);
      setOpen(false);
    },
    [onChange],
  );

  const renderControl = (current: string, hasError = false, fieldChange?: FieldChange, readonly = false) => (
    <>
      <RNPressable
        onPress={() => {
          if (!disabled) {
            setOpen(true);
          }
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={hasLabel ? undefined : t('Time')}
        style={{ width: '100%' }}>
        <TimePickerInputTrigger
          value={valueIsInvalid ? '' : formatTimeDisplay(current, timeFormat, showSeconds)}
          placeholder={placeholder}
          disabled={disabled}
          error={hasError}
          id={id}
          clockIcon={clockIcon}
          onOpen={() => {
            // the surrounding RNPressable opens the OS sheet
          }}
          onClear={() => {
            commit('', fieldChange);
          }}
          aria-label={hasLabel ? undefined : t('Time')}
          aria-readonly={readonly || undefined}
          aria-required={required === true || undefined}
          aria-invalid={hasError || undefined}
        />
      </RNPressable>
      <OsDateTimeSheet
        open={open}
        value={timeToDate(current === '' ? '00:00' : current)}
        mode="time"
        onCancel={() => {
          setOpen(false);
        }}
        onConfirm={(date) => {
          commit(dateToTime(date, showSeconds), fieldChange);
        }}
      />
    </>
  );

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

  if (!resolvedForm || name === undefined || name === '') {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={firstError(formatError, error)}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        disabled={disabled}>
        <InputParts size={size ?? knobProps.sizeToken}>
          {renderControl(value, Boolean(firstError(formatError, error)), undefined, readOnly)}
        </InputParts>
      </FieldLayout>
    );
  }

  return (
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = firstError(getFieldError(field, error), formatError);
        // SAFETY: the field is registered under a time name whose value is an 'HH:MM[:SS]' string or unset
        const current = (field.state.value as string | undefined) ?? value;
        return (
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
              {renderControl(current, Boolean(resolvedError), mergeFieldHandler(field, 'handleChange'), readOnly)}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
};

export const TimePicker = (props: TimePickerProps) =>
  props.native === false ? <CatalogTimePicker {...props} /> : <NativeTimePicker {...props} />;

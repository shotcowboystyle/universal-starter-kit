/**
 * Native TimePicker — iOS time wheel / Android time dialog.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable as RNPressable } from 'react-native';

import { Field, FieldLayout } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import { OsDateTimeSheet } from '../nativeDateTime/OsDateTimeSheet';

import { TimePicker as CatalogTimePicker } from './catalog';
import {
  TimePickerInputTrigger,
  formatTimeDisplay,
  isValidTimeString,
  parseTimeString,
  toTimeString,
  type TimeFormat,
} from './parts';

export interface TimePickerProps {
  name?: string;
  form?: import('../../types').AnyFormApi;
  validators?: Record<string, unknown>;
  label?: import('react').ReactNode;
  labelProps?: Omit<import('tamagui').LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  size?: import('tamagui').SizeTokens;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (...args: any[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  timeFormat?: TimeFormat;
  minuteStep?: number;
  showSeconds?: boolean;
  placeholder?: string;
  clockIcon?: import('react').ReactNode;
  skeleton?: boolean;
  compact?: boolean;
  native?: boolean;
}

export type { TimeFormat } from './parts';
export { formatTimeDisplay, isValidTimeString, parseTimeString, toTimeString } from './parts';

function timeToDate(value: string): Date {
  const { h, m, s } = parseTimeString(value);
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d;
}

function dateToTime(date: Date, showSeconds: boolean): string {
  return toTimeString(date.getHours(), date.getMinutes(), showSeconds ? date.getSeconds() : undefined);
}

export function TimePicker(props: TimePickerProps) {
  if (props.native === false) {
    return <CatalogTimePicker {...props} />;
  }
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
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string>(() => valueProp ?? defaultValue ?? '');
  useEffect(() => {
    if (valueProp === undefined) {
      return;
    }
    setInternalValue(valueProp);
  }, [valueProp]);
  const value = internalValue;
  const valueIsInvalid = !!value.trim() && !isValidTimeString(value);
  const formatError = valueIsInvalid ? t('Invalid time value') : undefined;

  const commit = useCallback(
    (time: string, fieldChange?: (v: unknown) => void) => {
      setInternalValue(time);
      fieldChange?.(time);
      onChange?.(time);
      setOpen(false);
    },
    [onChange],
  );

  const renderControl = (
    current: string,
    hasError?: boolean,
    fieldChange?: (v: unknown) => void,
    readonly?: boolean,
  ) => (
    <>
      <RNPressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? undefined : t('Time')}
        style={{ width: '100%' }}>
        <TimePickerInputTrigger
          value={valueIsInvalid ? '' : formatTimeDisplay(current, timeFormat, showSeconds)}
          placeholder={placeholder}
          disabled={disabled}
          error={hasError}
          id={id}
          clockIcon={clockIcon}
          onOpen={() => {}}
          onClear={() => {
            commit('', fieldChange);
          }}
          aria-label={label ? undefined : t('Time')}
          aria-readonly={readonly || undefined}
          aria-required={required || undefined}
          aria-invalid={hasError || undefined}
        />
      </RNPressable>
      <OsDateTimeSheet
        open={open}
        value={timeToDate(current || '00:00')}
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
        error={formatError || error}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        disabled={disabled}>
        <InputParts size={size || knobProps.sizeToken}>
          {renderControl(value, !!(formatError || error), undefined, readOnly)}
        </InputParts>
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error) || formatError;
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
            <InputParts size={size || knobProps.sizeToken}>
              {renderControl(current, !!resolvedError, mergeFieldHandler(field, 'handleChange'), readOnly)}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
}

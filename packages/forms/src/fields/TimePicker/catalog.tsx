import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { isWeb } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import { FloatingPanel } from '../../FloatingPanel';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

import {
  TimePanel,
  TimePickerClearButton,
  TimePickerInputTrigger,
  firstError,
  formatTimeDisplay,
  isValidTimeString,
} from './parts';
import type { TimeFormat } from './parts';

export type { TimeFormat } from './parts';
export { formatTimeDisplay, isValidTimeString, parseTimeString, toTimeString } from './parts';

export interface TimePickerProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Parameters<typeof useResolvedValidators>[1];
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  size?: SizeTokens;
  id?: string;
  /** Time string in "HH:MM" or "HH:MM:SS" 24h format */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: ComponentProps<typeof FieldLayout>['onBlur'];
  disabled?: boolean;
  readOnly?: boolean;
  /** Display format (default "12h") */
  timeFormat?: TimeFormat;
  /** Minute step increment (default 5) */
  minuteStep?: number;
  /** Show seconds column (default false) */
  showSeconds?: boolean;
  placeholder?: string;
  clockIcon?: ReactNode;
  /** When true, renders a skeleton placeholder instead of the time picker */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
  /** Native only. Omit for the OS time wheel; `false` keeps the catalog panel. */
  native?: boolean;
}

type FieldChange = (value: string) => void;

const triggerLabel = (label: ReactNode): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- label is a ReactNode; only a non-empty string can name the trigger for assistive tech
  const text = typeof label === 'string' && label !== '' ? label : undefined;
  return text ?? t('Time');
};

export const TimePicker = ({
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
  minuteStep = 5,
  showSeconds = false,
  placeholder = t('Select time'),
  clockIcon,
  skeleton,
  compact,
}: TimePickerProps) => {
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

  const displayValue = useMemo(
    () => (valueIsInvalid ? '' : formatTimeDisplay(value, timeFormat, showSeconds)),
    [value, valueIsInvalid, timeFormat, showSeconds],
  );

  const handleChange = useCallback(
    (time: string, fieldChange?: FieldChange) => {
      setInternalValue(time);
      fieldChange?.(time);
      onChange?.(time);
    },
    [onChange],
  );

  const handleClear = useCallback(
    (fieldChange?: FieldChange) => {
      handleChange('', fieldChange);
    },
    [handleChange],
  );

  const renderTrigger = (triggerValue: string, hasError = false, fieldChange?: FieldChange, readonly = false) => (
    <TimePickerInputTrigger
      value={triggerValue}
      placeholder={placeholder}
      disabled={disabled}
      error={hasError}
      id={id}
      clockIcon={clockIcon}
      onOpen={() => {
        setOpen(true);
      }}
      onClear={() => {
        handleClear(fieldChange);
      }}
      aria-label={hasLabel ? undefined : t('Time')}
      aria-readonly={readonly || undefined}
      aria-required={required === true || undefined}
      aria-invalid={hasError || undefined}
    />
  );

  const panelContent = (currentValue: string, onValueChange: (next: string) => void) => (
    <TimePanel
      value={currentValue === '' ? '00:00' : currentValue}
      onChange={onValueChange}
      timeFormat={timeFormat}
      minuteStep={minuteStep}
      showSeconds={showSeconds}
    />
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

  const renderField = (
    triggerValue: string,
    hasError = false,
    blurHandler?: () => void,
    fieldChange?: FieldChange,
    fieldValue?: string,
  ) => {
    if (readOnly) {
      return renderTrigger(triggerValue, hasError, undefined, true);
    }
    return (
      <FloatingPanel
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) {
            blurHandler?.();
          }
        }}
        disabled={disabled}
        sizing="grow"
        widthMode="at-least-trigger"
        contentPadding="none"
        triggerA11y={{
          label: triggerLabel(label),
          value: triggerValue === '' ? placeholder : triggerValue,
          hint: helperText,
        }}
        trigger={renderTrigger(triggerValue, hasError, fieldChange)}
        triggerEnd={
          !isWeb && triggerValue !== '' ? (
            <TimePickerClearButton
              onClear={() => {
                handleClear(fieldChange);
              }}
              disabled={disabled}
            />
          ) : undefined
        }>
        {panelContent(fieldValue ?? value, (time) => {
          handleChange(time, fieldChange);
        })}
      </FloatingPanel>
    );
  };

  if (!resolvedForm || name === undefined || name === '') {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={firstError(error, formatError)}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        disabled={disabled}>
        <InputParts size={size ?? knobProps.sizeToken}>
          {renderField(displayValue, Boolean(error) || valueIsInvalid, onBlur)}
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
        const resolvedError = getFieldError(field, error);
        const fieldValue = field.state.value ?? '';
        const fieldIsInvalid = !!fieldValue.trim() && !isValidTimeString(fieldValue);
        const fieldFormatError = fieldIsInvalid ? t('Invalid time value') : undefined;
        const fieldDisplay = fieldIsInvalid ? '' : formatTimeDisplay(fieldValue, timeFormat, showSeconds);
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={firstError(resolvedError, fieldFormatError)}
            helperText={helperText}
            required={required}
            size={size}
            knobProps={knobProps}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
            disabled={disabled}>
            <InputParts size={size ?? knobProps.sizeToken}>
              {renderField(
                fieldDisplay,
                Boolean(resolvedError) || fieldIsInvalid,
                mergeFieldHandler(field, 'handleBlur', onBlur),
                (v) => {
                  field.handleChange(v);
                },
                fieldValue,
              )}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
};

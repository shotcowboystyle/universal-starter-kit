/**
 * Web `Date` field for the three Frappe date fieldtypes.
 *
 * The field used to render ONE date-only calendar for all three types, with
 * only the placeholder varying — so a `Datetime` silently dropped its time
 * component from the picker and a `Time` rendered EMPTY, because the calendar
 * adopts its value through `coerceToDate`, for which a bare `HH:mm` is not a
 * date (SB-M-617). Each type now gets the house primitive that matches it:
 *
 *   date      → forms `DatePicker`      (month grid)
 *   datetime  → forms `DatetimePicker`  (Date/Time tabs — grid, then columns)
 *   time      → the package's own `TimePicker`, which is also what the field
 *               registry routes the Frappe `Time` fieldtype to, so a
 *               `Date type="time"` and a `Time` field are one control
 *
 * This mirrors what the native half already does (calendar / wheel /
 * calendar-then-wheel), and every branch serializes through the one shared
 * `wire.ts` body, so a web pick and a native pick of the same moment persist
 * byte-identical strings.
 */

import { DatePicker as FormsDatePicker, DatetimePicker as FormsDatetimePicker } from '@repo/forms';
import { useMemo } from 'react';
import { useProps } from 'tamagui';

import { TimePicker } from '../TimePicker';
import type { TimePickerProps } from '../TimePicker';

import type { DateProps } from './types';
import { fromFrappeDateValue, toFrappeDateValue } from './wire';

export type { DateProps } from './types';

/**
 * Adopt a Frappe datetime wire string through the shared read body rather
 * than handing the raw string to the picker, whose `coerceToDate` falls
 * through to `new Date(string)` for anything that is not date-only —
 * implementation-defined for the space-separated shape Frappe writes.
 * Memoized by the caller so the Date identity is stable across renders: the
 * picker re-seeds its display state from every new `value` identity, which
 * would otherwise discard an in-progress edit on an unrelated re-render.
 */
function toPickerDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = fromFrappeDateValue(value, 'datetime');
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `TimePicker` speaks `HH:mm`; Frappe stores `HH:mm:ss`. Round-tripping
 * through the shared wire body — rather than padding the string here — is
 * what keeps the two platform halves byte-identical, since the native half
 * serializes its wheel pick through exactly this call.
 */
function toTimeWireValue(picked: string): string {
  if (!picked) {
    return '';
  }
  const date = fromFrappeDateValue(picked, 'time');
  return Number.isNaN(date.getTime()) ? '' : toFrappeDateValue(date, 'time');
}

export function Date<TData extends Record<string, unknown> = Record<string, unknown>, TName extends string = string>(
  props: DateProps<TData, TName>,
) {
  const {
    defaultValue,
    form,
    inputProps: _inputProps,
    mode,
    name,
    onBlur,
    onChange,
    preserveValue,
    validators,
    disabled,
    value,
    type = 'date',
    ...fieldProps
  } = useProps(props) as DateProps<TData, TName> & Record<string, unknown>;

  const wireValue = value;
  const emit = onChange as ((v: string) => void) | undefined;
  const datetimeValue = useMemo(() => (type === 'datetime' ? toPickerDate(wireValue) : null), [type, wireValue]);

  const placeholder =
    fieldProps.placeholder ??
    (type === 'time' ? 'Select time' : type === 'datetime' ? 'Select date & time' : 'Select date');

  if (type === 'time') {
    return (
      <TimePicker
        // `TimePicker` is not generic over the form's data shape, so the
        // three form props are re-cast to its own non-generic surface.
        name={name as TimePickerProps['name']}
        form={form as TimePickerProps['form']}
        validators={validators as TimePickerProps['validators']}
        // The wire shape is what this control already speaks: `HH:mm[:ss]`,
        // 24h. It adopts the string directly, so nothing has to widen the
        // shared date parser to let a Time field display its own value.
        value={wireValue}
        onChange={(picked) => emit?.(toTimeWireValue(picked))}
        defaultValue={defaultValue}
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
        onBlur={onBlur}
      />
    );
  }

  if (type === 'datetime') {
    return (
      <FormsDatetimePicker
        name={name}
        form={form}
        validators={validators}
        value={datetimeValue}
        // No `previousValue`: this picker owns both halves of the value and
        // preserves an existing time across a day change itself, so carrying
        // the old time part here would overwrite a time the user just set.
        // The native half passes nothing for the same reason.
        onChange={(date) => emit?.(date ? toFrappeDateValue(date, 'datetime') : '')}
        defaultValue={defaultValue}
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
        minDate={fieldProps.minDate}
        maxDate={fieldProps.maxDate}
        placeholder={placeholder}
        onBlur={onBlur}
        mode={mode}
        preserveValue={preserveValue}
      />
    );
  }

  return (
    <FormsDatePicker
      name={name}
      form={form}
      validators={validators}
      // Controlled pass-through: folding `value` into `defaultValue` was
      // mount-only, so a value arriving after first paint (create-mode
      // engine seeding) never displayed — and `onChange` was dropped, so
      // picks never reached the consumer doc. `undefined` stays undefined so
      // uncontrolled (defaultValue-only) use keeps its semantics.
      value={wireValue}
      onChange={(date) => emit?.(date ? toFrappeDateValue(date, 'date') : '')}
      defaultValue={defaultValue}
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
      minDate={fieldProps.minDate}
      maxDate={fieldProps.maxDate}
      placeholder={placeholder}
      onBlur={onBlur}
      mode={mode}
      preserveValue={preserveValue}
    />
  );
}

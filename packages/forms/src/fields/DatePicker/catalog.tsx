import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import { type Popover, useProps } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

import { DatePickerFieldValueSync } from './fieldValueSync';
import {
  CalendarDays,
  CalendarHeader,
  CalendarPanelFrame,
  DatePickerInputTrigger,
  DatePickerPopoverShell,
  CalendarViewSwitcher,
  formatDateDisplay,
  isSameDay,
  useCalendarData,
  useDateNavigation,
  yearPageSize,
} from './parts';
import type { ViewMode } from './parts';
import { coerceToDate } from './utils';

export type { ViewMode } from './parts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DatePickerProps<
  TParentData = any,
  TName extends DeepKeys<TParentData> = any,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  // "onChange": FormFieldProps carries the DOM ChangeEventHandler from
  // YStackProps; this field exposes a canonical value callback instead.
  'children' | 'field' | 'onChange'
> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    placeholder?: string;
    format?: string;
    minDate?: Date;
    maxDate?: Date;
    disabled?: boolean;
    inputProps?: Omit<ComponentProps<typeof InputParts.Area>, 'value' | 'onChangeText' | 'ref'>;
    /** When true, renders a skeleton placeholder instead of the date picker */
    skeleton?: boolean;
    /** When true, applies compact density (tighter layout gaps; control size unchanged) */
    compact?: boolean;
    /** Standalone controlled value (Date or ISO string). Ignored when used inside a form. */
    value?: Date | string | null;
    /**
     * Canonical change handler, consistent with the rest of the field family.
     * Prefer this over `onValueChange`.
     */
    onChange?: (value: Date | null) => void;
    /** @deprecated Use `onChange` instead. */
    onValueChange?: (value: Date | null) => void;
    /** Native only. `false` keeps the catalog calendar; omit for the OS picker. */
    native?: boolean;
  };

// ---------------------------------------------------------------------------
// DayGrid — animated day cells (single-select)
// ---------------------------------------------------------------------------

interface DayGridProps {
  calendarData: ReturnType<typeof useCalendarData>;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

function DayGrid({ calendarData, selectedDate, onSelectDate, minDate, maxDate }: DayGridProps) {
  return (
    <CalendarDays
      calendarData={calendarData}
      minDate={minDate}
      maxDate={maxDate}
      isSelected={(day) => isSameDay(selectedDate, day)}
      onSelect={onSelectDate}
      onToday={() => {
        onSelectDate(new Date());
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// CalendarBody — orchestrates day/month/year views
// ---------------------------------------------------------------------------

interface CalendarBodyProps {
  displayDate: Date;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onNavigateMonth: (direction: 'prev' | 'next') => void;
  onSetDisplayDate: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

function CalendarBody({
  displayDate,
  selectedDate,
  onSelectDate,
  onNavigateMonth,
  onSetDisplayDate,
  minDate,
  maxDate,
}: CalendarBodyProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const calendarData = useCalendarData(displayDate);
  const [yearPageStart, setYearPageStart] = useState(() => calendarData.year - (calendarData.year % yearPageSize));

  return (
    <CalendarViewSwitcher
      calendarData={calendarData}
      displayDate={displayDate}
      onSetDisplayDate={onSetDisplayDate}
      viewMode={viewMode}
      setViewMode={setViewMode}
      yearPageStart={yearPageStart}
      setYearPageStart={setYearPageStart}>
      <CalendarPanelFrame>
        <CalendarHeader
          year={calendarData.year}
          monthName={calendarData.monthName}
          onPrevMonth={() => {
            onNavigateMonth('prev');
          }}
          onNextMonth={() => {
            onNavigateMonth('next');
          }}
          onYearPress={() => {
            setYearPageStart(calendarData.year - (calendarData.year % yearPageSize));
            setViewMode('year');
          }}
          onMonthPress={() => {
            setViewMode('month');
          }}
        />
        <DayGrid
          calendarData={calendarData}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          minDate={minDate}
          maxDate={maxDate}
        />
      </CalendarPanelFrame>
    </CalendarViewSwitcher>
  );
}

// ---------------------------------------------------------------------------
// DatePicker — main exported component
// ---------------------------------------------------------------------------

export function DatePicker<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: DatePickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const {
    defaultValue,
    value: controlledValue,
    onChange,
    onValueChange,
    form,
    inputProps: _inputProps,
    placeholder = t('Select date'),
    format: _format = 'MM/DD/YYYY',
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
    ..._restProps
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const hasLabel = Boolean(label);

  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => coerceToDate(controlledValue ?? defaultValue));
  // Sync external `value` changes (controlled standalone mode).
  useEffect(() => {
    if (controlledValue === undefined) {
      return;
    }
    setSelectedDate(coerceToDate(controlledValue));
  }, [controlledValue]);
  // Axiom 11 VALUE IS DATA: the calendar opens at the selected value's
  // month, not today's — seed the display date from the current value and
  // re-seed on every open (see openCalendar / handleOpenChange).
  const { displayDate, setDisplayDate, navigateMonth } = useDateNavigation(selectedDate ?? undefined);
  const popoverRef = useRef<Popover>(null);

  const closePopover = useCallback(() => {
    setOpen(false);
    popoverRef.current?.close();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      closePopover();
    }
  }, [selectedDate, closePopover]);

  const handleDateSelect = useCallback(
    (date: Date, fieldChange?: (value: any) => void) => {
      if (minDate && date < minDate) {
        return;
      }
      if (maxDate && date > maxDate) {
        return;
      }
      setSelectedDate(date);
      setDisplayDate(date);
      // Form mode: commit into TanStack field state (clears meta errors on change).
      fieldChange?.(date);
      // Canonical `onChange` and the alias `onValueChange` both fire (single emit).
      onChange?.(date);
      onValueChange?.(date);
      closePopover();
    },
    [minDate, maxDate, setDisplayDate, closePopover, onChange, onValueChange],
  );

  const handleClearDate = useCallback(
    (fieldChange?: (value: any) => void) => {
      setSelectedDate(null);
      setDisplayDate(new Date());
      fieldChange?.(null);
      onChange?.(null);
      onValueChange?.(null);
    },
    [setDisplayDate, onChange, onValueChange],
  );

  const calendarContent = (fieldChange?: (value: any) => void) => (
    <CalendarBody
      displayDate={displayDate}
      selectedDate={selectedDate}
      onSelectDate={(date) => {
        handleDateSelect(date, fieldChange);
      }}
      onNavigateMonth={navigateMonth}
      onSetDisplayDate={setDisplayDate}
      minDate={minDate}
      maxDate={maxDate}
    />
  );

  const renderPopover = (
    hasError?: boolean,
    blurHandler?: (...args: any[]) => void,
    fieldChange?: (value: any) => void,
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

    const handleOpenChange = (isOpen: boolean) => {
      // Re-seed the visible month from the current value on every open —
      // the value may have changed (externally or by a pick) since mount.
      if (isOpen && selectedDate) {
        setDisplayDate(selectedDate);
      }
      setOpen(isOpen);
      if (!isOpen) {
        blurHandler?.();
      }
    };

    return (
      <DatePickerPopoverShell
        open={open}
        onOpenChange={handleOpenChange}
        // Disabling only the trigger is what LET the panel open: the trigger
        // goes `pointerEvents:none`, so the click falls through to
        // FloatingPanel's own reference wrapper, which opens on click unless
        // it is told the field is disabled (SB-M-614). DatetimePicker and
        // TimePicker already pass it.
        disabled={disabled}
        popoverRef={popoverRef}
        // "Date, Jul 15 2026": VO gets the field name + current value on the
        // native trigger (the web trigger announces via aria on the Area).
        triggerA11y={{
          label: (typeof label === 'string' && label) || t('Date'),
          value: formatDateDisplay(selectedDate) || placeholder,
          hint: helperText,
        }}
        trigger={
          <DatePickerInputTrigger
            value={formatDateDisplay(selectedDate)}
            placeholder={placeholder}
            disabled={disabled}
            open={open}
            onReset={() => {
              handleClearDate(fieldChange);
            }}
            onButtonPress={() => {
              if (selectedDate) {
                setDisplayDate(selectedDate);
              }
              setOpen(true);
            }}
            error={!!hasError}
            id={id}
            // Labelled: FieldLayout's Label wires `aria-labelledby` onto this
            // id itself — naming it here too doubles the spoken name.
            aria-label={hasLabel ? undefined : t('Date')}
            aria-describedby={
              [helperText && id ? `${id}-description` : undefined, hasError && id ? `${id}-error` : undefined]
                .filter(Boolean)
                .join(' ') || undefined
            }
            aria-required={required || undefined}
            aria-invalid={hasError || undefined}
          />
        }
        clearValue={formatDateDisplay(selectedDate)}
        onClear={() => {
          handleClearDate(fieldChange);
        }}>
        {calendarContent(fieldChange)}
      </DatePickerPopoverShell>
    );
  };

  // Render skeleton placeholder (after all hooks)
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
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        <InputParts size={size || knobProps.sizeToken}>{renderPopover(!!errorProp)}</InputParts>
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
            {/* Form branch displays from `selectedDate` — keep it synced to
                the live field value (late seeds / programmatic updates). */}
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
              // See standalone branch — FieldLayout carries dimWhole.
              disabled={disabled}>
              <InputParts size={size || knobProps.sizeToken}>
                {renderPopover(
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

// Re-export new picker variants
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

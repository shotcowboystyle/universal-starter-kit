import { formatAbsoluteDateTime } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, useProps, isWeb } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { FloatingPanel } from '../../FloatingPanel';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { TimeWheels } from '../../shared/TimeColumn';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

import { DatePickerFieldValueSync } from './fieldValueSync';
import {
  CalendarDays,
  CalendarHeader,
  CalendarPanelFrame,
  CalendarViewSwitcher,
  DatePickerClearButton,
  DatePickerInputTrigger,
  isSameDay,
  useCalendarData,
  useCalendarKnobs,
  useDateNavigation,
  yearPageSize,
} from './parts';
import { coerceToDate } from './utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
    inputProps?: Omit<ComponentProps<typeof InputParts.Area>, 'value' | 'onChangeText' | 'ref'>;
    /** When true, renders a skeleton placeholder instead of the datetime picker */
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
    /** Native only. `false` keeps the catalog overlay; omit for the OS picker. */
    native?: boolean;
  };

// ---------------------------------------------------------------------------
// Time utilities
// ---------------------------------------------------------------------------

function parseTimeFromDate(date: Date): { h: number; m: number; s: number } {
  return {
    h: date.getHours(),
    m: date.getMinutes(),
    s: date.getSeconds(),
  };
}

/**
 * Timestamp register: one register formats the whole value, date part
 * and time part together. Composing `formatAbsoluteDate` with a hand-built
 * clock is what let this half drift from the native half by the separator
 * Intl puts between the two ("Mar 5, 2026 2:30 PM" vs "Mar 5, 2026, 2:30 PM");
 * the picker's `timeFormat` / `showSeconds` contract now rides the register.
 */
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

// ---------------------------------------------------------------------------
// DayGrid — animated day cells
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
// TimeSection — time selection within the picker
// ---------------------------------------------------------------------------

interface TimeSectionProps {
  selectedDate: Date;
  onTimeChange: (date: Date) => void;
  timeFormat: TimeFormat;
  minuteStep: number;
  showSeconds: boolean;
}

function TimeSection({ selectedDate, onTimeChange, timeFormat, minuteStep, showSeconds }: TimeSectionProps) {
  const { h, m, s } = parseTimeFromDate(selectedDate);

  const handleChange = useCallback(
    (hour24: number, minute: number, second: number) => {
      const next = new Date(selectedDate);
      next.setHours(hour24, minute, second);
      onTimeChange(next);
    },
    [onTimeChange, selectedDate],
  );

  return (
    <TimeWheels
      hour24={h}
      minute={m}
      second={s}
      timeFormat={timeFormat}
      minuteStep={minuteStep}
      showSeconds={showSeconds}
      onChange={handleChange}
    />
  );
}

// ---------------------------------------------------------------------------
// DatetimePickerBody — combined date and time selection
// ---------------------------------------------------------------------------

type ViewMode = 'date' | 'time';

interface DatetimePickerBodyProps {
  displayDate: Date;
  selectedDatetime: Date | null;
  onSelectDatetime: (date: Date) => void;
  onNavigateMonth: (direction: 'prev' | 'next') => void;
  onSetDisplayDate: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  timeFormat: TimeFormat;
  minuteStep: number;
  showSeconds: boolean;
}

function DatetimePickerBody({
  displayDate,
  selectedDatetime,
  onSelectDatetime,
  onNavigateMonth,
  onSetDisplayDate,
  minDate,
  maxDate,
  timeFormat,
  minuteStep,
  showSeconds,
}: DatetimePickerBodyProps) {
  const { knobProps } = useCalendarKnobs();
  const { px } = knobProps.nestedControl;
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'year'>('day');
  const [activeTab, setActiveTab] = useState<ViewMode>('date');
  const calendarData = useCalendarData(displayDate);
  const [yearPageStart, setYearPageStart] = useState(() => calendarData.year - (calendarData.year % yearPageSize));

  const handleDateSelect = useCallback(
    (date: Date) => {
      // Preserve time from selected datetime if exists
      if (selectedDatetime) {
        date.setHours(selectedDatetime.getHours(), selectedDatetime.getMinutes(), selectedDatetime.getSeconds());
      }
      onSelectDatetime(date);
      setActiveTab('time');
    },
    [selectedDatetime, onSelectDatetime],
  );

  const handleTimeChange = useCallback(
    (date: Date) => {
      onSelectDatetime(date);
    },
    [onSelectDatetime],
  );

  return (
    <View flexDirection="column" alignItems="center" minWidth={px * 7} alignSelf="stretch">
      <View
        flexDirection="row"
        width="100%"
        {...knobProps.panelPadding}
        // The active content frame owns the space below this strip.
        paddingBottom={0}>
        {(['date', 'time'] as const).map((tab) => {
          const active = activeTab === tab;
          const tabDisabled = tab === 'time' && !selectedDatetime;
          return (
            <View
              key={tab}
              flex={1}
              height={px}
              alignItems="center"
              justifyContent="center"
              cursor={tabDisabled ? 'default' : 'pointer'}
              opacity={tabDisabled ? 0.5 : 1}
              theme={active ? ('accent' as any) : undefined}
              backgroundColor={active ? '$background' : 'transparent'}
              onPress={() => {
                if (!tabDisabled) {
                  setActiveTab(tab);
                }
              }}
              data-nested-px={px}>
              <Text {...knobProps.label} {...knobProps.textWeight} fontWeight={active ? '600' : '400'}>
                {tab === 'date' ? t('Date') : t('Time')}
              </Text>
            </View>
          );
        })}
      </View>

      {activeTab === 'date' ? (
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
              selectedDate={selectedDatetime}
              onSelectDate={handleDateSelect}
              minDate={minDate}
              maxDate={maxDate}
            />
          </CalendarPanelFrame>
        </CalendarViewSwitcher>
      ) : (
        selectedDatetime && (
          <CalendarPanelFrame>
            <View width={px * 7}>
              <TimeSection
                selectedDate={selectedDatetime}
                onTimeChange={handleTimeChange}
                timeFormat={timeFormat}
                minuteStep={minuteStep}
                showSeconds={showSeconds}
              />
            </View>
          </CalendarPanelFrame>
        )
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// DatetimePicker — main exported component
// ---------------------------------------------------------------------------

export function DatetimePicker<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: DatetimePickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const {
    defaultValue,
    value: controlledValue,
    onChange,
    onValueChange,
    form,
    inputProps: _inputProps,
    placeholder = t('Select date and time'),
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
    onBlur: _onBlur,
    timeFormat = '12h',
    minuteStep = 5,
    showSeconds = false,
    skeleton,
    compact,
    id: idProp,
    ..._restProps
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);

  const [open, setOpen] = useState(false);
  const [selectedDatetime, setSelectedDatetime] = useState<Date | null>(() =>
    coerceToDate(controlledValue ?? defaultValue),
  );
  useEffect(() => {
    if (controlledValue === undefined) {
      return;
    }
    setSelectedDatetime(coerceToDate(controlledValue));
  }, [controlledValue]);
  // Axiom 11 VALUE IS DATA: the calendar opens at the selected value's
  // month, not today's — seed from the current value and re-seed per open.
  const { displayDate, setDisplayDate, navigateMonth } = useDateNavigation(selectedDatetime ?? undefined);
  const selectedDatetimeRef = useRef(selectedDatetime);
  selectedDatetimeRef.current = selectedDatetime;

  const openPicker = useCallback(() => {
    const seed = selectedDatetimeRef.current;
    if (seed) {
      setDisplayDate(seed);
    }
    setOpen(true);
  }, [setDisplayDate]);

  const handleDatetimeSelect = useCallback(
    (date: Date, fieldChange?: (value: any) => void) => {
      if (minDate && date < minDate) {
        return;
      }
      if (maxDate && date > maxDate) {
        return;
      }
      setSelectedDatetime(date);
      setDisplayDate(date);
      fieldChange?.(date);
      // Canonical `onChange` and the alias `onValueChange` both fire (single emit).
      onChange?.(date);
      onValueChange?.(date);
    },
    [minDate, maxDate, setDisplayDate, onChange, onValueChange],
  );

  const handleClearDatetime = useCallback(
    (fieldChange?: (value: any) => void) => {
      setSelectedDatetime(null);
      setDisplayDate(new Date());
      fieldChange?.(null);
      onChange?.(null);
      onValueChange?.(null);
    },
    [setDisplayDate, onChange, onValueChange],
  );

  const displayValue = useMemo(
    () => formatDatetimeDisplay(selectedDatetime, timeFormat, showSeconds),
    [selectedDatetime, timeFormat, showSeconds],
  );

  const pickerContent = (fieldChange?: (value: any) => void) => (
    <DatetimePickerBody
      displayDate={displayDate}
      selectedDatetime={selectedDatetime}
      onSelectDatetime={(date) => {
        handleDatetimeSelect(date, fieldChange);
      }}
      onNavigateMonth={navigateMonth}
      onSetDisplayDate={setDisplayDate}
      minDate={minDate}
      maxDate={maxDate}
      timeFormat={timeFormat}
      minuteStep={minuteStep}
      showSeconds={showSeconds}
    />
  );

  const renderTrigger = (value: string, hasError?: boolean, fieldChange?: (value: any) => void) => (
    <DatePickerInputTrigger
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      open={open}
      onReset={() => {
        handleClearDatetime(fieldChange);
      }}
      onButtonPress={openPicker}
      error={!!hasError}
      id={id}
      aria-label={label ? undefined : t('Date and time')}
      aria-required={required || undefined}
      aria-invalid={hasError || undefined}
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
            value={displayValue}
            readOnly
            id={id}
            aria-label={label ? undefined : t('Date and time')}
            aria-readonly="true"
            aria-required={required || undefined}
            aria-invalid={hasError || undefined}
            placeholder={placeholder}
          />
        </InputParts.Box>
      );
    }
    const handleOpenChange = (isOpen: boolean) => {
      // Re-seed the visible month from the current value on every open.
      if (isOpen && selectedDatetimeRef.current) {
        setDisplayDate(selectedDatetimeRef.current);
      }
      setOpen(isOpen);
      if (!isOpen) {
        blurHandler?.();
      }
    };
    return (
      <FloatingPanel
        open={open}
        onOpenChange={handleOpenChange}
        trigger={renderTrigger(displayValue, hasError, fieldChange)}
        triggerEnd={
          !isWeb && displayValue ? (
            <DatePickerClearButton
              onReset={() => {
                handleClearDatetime(fieldChange);
              }}
              disabled={disabled}
            />
          ) : undefined
        }
        disabled={disabled}
        sizing="grow"
        contentPadding="none"
        widthMode="fit-content">
        {pickerContent(fieldChange)}
      </FloatingPanel>
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
            {/* Form branch displays from `selectedDatetime` — keep it synced
                to the live field value (late seeds / programmatic updates). */}
            <DatePickerFieldValueSync value={field.state.value} onSync={setSelectedDatetime} />
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
                  mergeFieldHandler(field, 'handleBlur', _onBlur),
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

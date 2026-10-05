import { useTouchSurface } from '@repo/theme';
import { formatAbsoluteDate, useResolvedKnobs } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Popover, type SizeTokens, Separator, View, useMedia, useProps } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

import { FieldValueSync } from './fieldValueSync';
import {
  CalendarDays,
  CalendarHeader,
  CalendarPanelFrame,
  DatePickerInputTrigger,
  DatePickerPopoverShell,
  CalendarViewSwitcher,
  isSameDay,
  useCalendarData,
  useDateNavigation,
  yearPageSize,
} from './parts';
import type { ViewMode } from './parts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MultiDatePickerProps<
  TParentData = any,
  TName extends DeepKeys<TParentData> = any,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children' | 'field'> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    placeholder?: string;
    minDate?: Date;
    maxDate?: Date;
    disabled?: boolean;
    readOnly?: boolean;
    /** Max number of dates that can be selected. Defaults to 5. */
    limit?: number;
    /** Controlled value for standalone (no form/name) usage */
    value?: Date[];
    /** Standalone change callback — fires on each toggle/clear */
    onChange?: (value: Date[]) => void;
    inputProps?: Omit<ComponentProps<typeof InputParts.Area>, 'value' | 'onChangeText' | 'ref'>;
    /** When true, renders a skeleton placeholder instead of the multi-date picker */
    skeleton?: boolean;
    /** When true, applies compact density (tighter layout gaps; control size unchanged) */
    compact?: boolean;
  };

// ---------------------------------------------------------------------------
// MultiDayGrid — day cells with toggle selection
// ---------------------------------------------------------------------------

interface MultiDayGridProps {
  calendarData: ReturnType<typeof useCalendarData>;
  selectedDates: Date[];
  onToggleDate: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  selectionCapped?: boolean;
}

function MultiDayGrid({
  calendarData,
  selectedDates,
  onToggleDate,
  minDate,
  maxDate,
  selectionCapped,
}: MultiDayGridProps) {
  return (
    <CalendarDays
      calendarData={calendarData}
      minDate={minDate}
      maxDate={maxDate}
      selectionCapped={selectionCapped}
      isSelected={(day) => selectedDates.some((d) => isSameDay(d, day))}
      onSelect={onToggleDate}
      onToday={() => {
        onToggleDate(new Date());
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// SingleCalendar — one month panel with header + day grid
// ---------------------------------------------------------------------------

interface SingleCalendarProps {
  displayDate: Date;
  selectedDates: Date[];
  onToggleDate: (date: Date) => void;
  onNavigateMonth: (months: number) => void;
  onSetDisplayDate: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  selectionCapped?: boolean;
  showPrev?: boolean;
  showNext?: boolean;
}

function SingleCalendar({
  displayDate,
  selectedDates,
  onToggleDate,
  onNavigateMonth,
  onSetDisplayDate,
  minDate,
  maxDate,
  selectionCapped,
  showPrev = true,
  showNext = true,
}: SingleCalendarProps) {
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
            onNavigateMonth(-1);
          }}
          onNextMonth={() => {
            onNavigateMonth(1);
          }}
          showPrev={showPrev}
          showNext={showNext}
          onYearPress={() => {
            setYearPageStart(calendarData.year - (calendarData.year % yearPageSize));
            setViewMode('year');
          }}
          onMonthPress={() => {
            setViewMode('month');
          }}
        />
        <MultiDayGrid
          calendarData={calendarData}
          selectedDates={selectedDates}
          onToggleDate={onToggleDate}
          minDate={minDate}
          maxDate={maxDate}
          selectionCapped={selectionCapped}
        />
      </CalendarPanelFrame>
    </CalendarViewSwitcher>
  );
}

// ---------------------------------------------------------------------------
// DualCalendarBody — side-by-side or single calendar depending on screen
// ---------------------------------------------------------------------------

interface DualCalendarBodyProps {
  selectedDates: Date[];
  onToggleDate: (date: Date) => void;
  displayDate: Date;
  setDisplayDate: (date: Date) => void;
  navigateMonth: (direction: 'prev' | 'next') => void;
  minDate?: Date;
  maxDate?: Date;
  selectionCapped?: boolean;
}

function DualCalendarBody({
  selectedDates,
  onToggleDate,
  displayDate,
  setDisplayDate,
  navigateMonth,
  minDate,
  maxDate,
  selectionCapped,
}: DualCalendarBodyProps) {
  const { knobProps } = useResolvedKnobs();
  // v5 `sm` = minWidth 640 (`gtSm` died with the v5 media map):
  // dual-calendar layout exactly when the panel floats (OVERLAY_BREAKPOINT).
  const { sm: fullWidthMode } = useMedia();

  const prevMonthDate = useMemo(() => {
    const date = new Date(displayDate);
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    return date;
  }, [displayDate]);

  const handleNavigate = useCallback(
    (months: number) => {
      navigateMonth(months < 0 ? 'prev' : 'next');
    },
    [navigateMonth],
  );

  const handleSetDisplayForPrev = useCallback(
    (date: Date) => {
      const next = new Date(date);
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      setDisplayDate(next);
    },
    [setDisplayDate],
  );

  if (!fullWidthMode) {
    return (
      <View>
        <SingleCalendar
          displayDate={displayDate}
          selectedDates={selectedDates}
          onToggleDate={onToggleDate}
          onNavigateMonth={handleNavigate}
          onSetDisplayDate={setDisplayDate}
          minDate={minDate}
          maxDate={maxDate}
          selectionCapped={selectionCapped}
        />
      </View>
    );
  }

  return (
    <View flexDirection="row" {...knobProps.gap}>
      <SingleCalendar
        displayDate={prevMonthDate}
        selectedDates={selectedDates}
        onToggleDate={onToggleDate}
        onNavigateMonth={handleNavigate}
        onSetDisplayDate={handleSetDisplayForPrev}
        minDate={minDate}
        maxDate={maxDate}
        selectionCapped={selectionCapped}
        showNext={false}
      />
      <Separator vertical />
      <SingleCalendar
        displayDate={displayDate}
        selectedDates={selectedDates}
        onToggleDate={onToggleDate}
        onNavigateMonth={handleNavigate}
        onSetDisplayDate={setDisplayDate}
        minDate={minDate}
        maxDate={maxDate}
        selectionCapped={selectionCapped}
        showPrev={false}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// formatMultiDates — display value for multiple selected dates
// ---------------------------------------------------------------------------

function formatMultiDates(dates: Date[]): string {
  if (dates.length === 0) {
    return '';
  }
  // House absolute register: single selection shows the year
  // (editing precision), multi-selection lists compact dates with the year
  // auto-added only when a date leaves the current year.
  if (dates.length === 1) {
    return formatAbsoluteDate(dates[0], { year: 'always' });
  }
  return dates.map((d) => formatAbsoluteDate(d)).join(', ');
}

// ---------------------------------------------------------------------------
// MultiDatePicker — main component
// ---------------------------------------------------------------------------

// A required multi-date field is empty when no dates are selected — the
// default isEmpty only catches null/"" and would let `[]` pass validation.
const isEmptyDates = (value: unknown) => value == null || value === '' || (Array.isArray(value) && value.length === 0);

export function MultiDatePicker<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: MultiDatePickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const hydrationTouch = useTouchSurface();
  const {
    defaultValue,
    value: valueProp,
    onChange,
    form,
    inputProps: _inputProps,
    placeholder = t('Select dates'),
    minDate,
    maxDate,
    disabled,
    readOnly,
    limit = 5,
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
    onBlur: _onBlur,
    skeleton,
    compact,
    id: idProp,
    ..._restProps
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name, isEmptyDates);
  const resolvedSize = (size ?? knobProps.sizeToken) as SizeTokens;
  const visualHeight = getFieldHeight(resolvedSize, 1, hydrationTouch);

  const initialDates = (
    Array.isArray(valueProp) ? valueProp : Array.isArray(defaultValue) ? defaultValue : []
  ) as Date[];
  const [open, setOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>(initialDates);
  // Ref mirror so rapid toggles batched into one render still accumulate.
  const selectedDatesRef = useRef(selectedDates);
  // Axiom 11 VALUE IS DATA: the calendar opens at the first selected date's
  // month, not today's — seed from the value and re-seed per open.
  const { displayDate, setDisplayDate, navigateMonth } = useDateNavigation(selectedDates[0]);
  const popoverRef = useRef<Popover>(null);

  const openPicker = useCallback(() => {
    const seed = selectedDatesRef.current[0];
    if (seed) {
      setDisplayDate(seed);
    }
    setOpen(true);
  }, [setDisplayDate]);

  // Adopt an externally-applied value (controlled `value` prop or the live
  // TanStack field value) into the display state without emitting onChange.
  // Skip setState when the calendar days are unchanged so a new
  // array identity from the parent cannot force a render storm.
  const adoptExternalValue = useCallback((raw: unknown) => {
    const next = Array.isArray(raw) ? (raw as Date[]) : [];
    const prev = selectedDatesRef.current;
    const same = prev.length === next.length && prev.every((d, i) => next[i] != null && isSameDay(d, next[i]));
    if (same) {
      return;
    }
    selectedDatesRef.current = next;
    setSelectedDates(next);
  }, []);

  // Keep standalone/controlled state in sync when the parent value changes.
  useEffect(() => {
    if (valueProp === undefined) {
      return;
    }
    adoptExternalValue(valueProp);
  }, [valueProp, adoptExternalValue]);

  const handleToggleDate = useCallback(
    (date: Date, fieldChange?: (value: any) => void) => {
      if (minDate && date < minDate) {
        return;
      }
      if (maxDate && date > maxDate) {
        return;
      }

      const current = selectedDatesRef.current;
      const existing = current.findIndex((d) => isSameDay(d, date));
      let next: Date[];
      if (existing >= 0) {
        next = current.filter((_, i) => i !== existing);
      } else {
        if (current.length >= limit) {
          return;
        }
        next = [...current, date].sort((a, b) => a.getTime() - b.getTime());
      }
      selectedDatesRef.current = next;
      setSelectedDates(next);
      fieldChange?.(next);
    },
    [minDate, maxDate, limit],
  );

  const handleClear = useCallback((fieldChange?: (value: any) => void) => {
    selectedDatesRef.current = [];
    setSelectedDates([]);
    fieldChange?.([]);
  }, []);

  const calendarContent = (fieldChange?: (value: any) => void) => (
    <DualCalendarBody
      selectedDates={selectedDates}
      onToggleDate={(date) => {
        handleToggleDate(date, fieldChange);
      }}
      displayDate={displayDate}
      setDisplayDate={setDisplayDate}
      navigateMonth={navigateMonth}
      minDate={minDate}
      maxDate={maxDate}
      selectionCapped={selectedDates.length >= limit}
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
            value={formatMultiDates(selectedDates)}
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
      // Re-seed the visible month from the current selection on every open.
      if (isOpen && selectedDatesRef.current[0]) {
        setDisplayDate(selectedDatesRef.current[0]);
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
        popoverRef={popoverRef}
        disabled={disabled}
        trigger={
          <DatePickerInputTrigger
            value={formatMultiDates(selectedDates)}
            placeholder={placeholder}
            disabled={disabled}
            open={open}
            onReset={() => {
              handleClear(fieldChange);
            }}
            onButtonPress={openPicker}
            error={!!hasError}
            // SB-KS-04: without the field id the sibling FieldLayout label's
            // `htmlFor` resolves to nothing — a dangling label and a control
            // with no accessible name.
            id={id}
            aria-required={required || undefined}
            aria-invalid={hasError || undefined}
          />
        }
        clearValue={formatMultiDates(selectedDates)}
        onClear={() => {
          handleClear(fieldChange);
        }}>
        {calendarContent(fieldChange)}
      </DatePickerPopoverShell>
    );
  };

  // Render skeleton placeholder (after all hooks)
  if (skeleton) {
    return (
      <FieldLayout id={id} label={label} size={size} knobProps={knobProps}>
        <InputParts size={resolvedSize}>
          <Skeleton variant="rounded" width="100%" height={visualHeight} data-multidate-skeleton="" />
        </InputParts>
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
        <InputParts size={size || knobProps.sizeToken}>{renderPopover(!!errorProp, undefined, onChange)}</InputParts>
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
            {/* Form branch displays from `selectedDates` — keep it synced to
                the live field value (late seeds / programmatic updates). */}
            <FieldValueSync value={field.state.value} onSync={adoptExternalValue} />
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

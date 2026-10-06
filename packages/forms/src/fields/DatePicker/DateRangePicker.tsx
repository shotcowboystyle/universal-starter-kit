import { useTouchSurface, formatAbsoluteDate, transitionProps, useResolvedKnobs } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Separator, View, useMedia, useProps } from 'tamagui';
import type { Popover, SizeTokens } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import type { FormFieldProps } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formInputColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import type { FieldValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

import { FieldValueSync } from './FieldValueSync';
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

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export type DateRangePickerProps<
  TParentData = object,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> = undefined,
  TFormValidator extends Validator<TParentData> = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  'children' | 'field' | 'onChange'
> &
  Partial<
    Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children' | 'validators'>
  > & {
    validators?: FieldValidators;
    placeholder?: string;
    minDate?: Date;
    maxDate?: Date;
    disabled?: boolean;
    readOnly?: boolean;
    /** Controlled value for standalone (no form/name) usage */
    value?: DateRange | null;
    /** Standalone change callback — fires when a complete range is set/cleared */
    onChange?: (value: DateRange | null) => void;
    inputProps?: Omit<ComponentProps<typeof InputParts.Area>, 'value' | 'onChangeText' | 'ref'>;
    /** When true, renders a skeleton placeholder instead of the date range picker */
    skeleton?: boolean;
    /** When true, applies compact density (tighter layout gaps; control size unchanged) */
    compact?: boolean;
  };

// ---------------------------------------------------------------------------
// Range day status helpers
// ---------------------------------------------------------------------------

const RANGE_START = 'range-start';
type RangeStatus = 'none' | typeof RANGE_START | 'range-end' | 'in-range' | 'selected-single';
type RangeChange = (value: DateRange | null) => void;

const rangeStripeInsets = {
  [RANGE_START]: { insetInlineStart: '50%', insetInlineEnd: 0, width: '50%' },
  'range-end': { insetInlineStart: 0, insetInlineEnd: '50%', width: '50%' },
  'in-range': { insetInlineStart: 0, insetInlineEnd: 0, width: '100%' },
} as const;

const getRangeStatus = (day: Date, start: Date | null, end: Date | null): RangeStatus => {
  if (!start) {
    return 'none';
  }
  if (isSameDay(day, start) && !end) {
    return 'selected-single';
  }
  if (isSameDay(day, start)) {
    return RANGE_START;
  }
  if (end && isSameDay(day, end)) {
    return 'range-end';
  }
  if (end && day > start && day < end) {
    return 'in-range';
  }
  return 'none';
};

// ---------------------------------------------------------------------------
// RangeDayGrid — day cells with range highlighting
// ---------------------------------------------------------------------------

interface RangeDayGridProps {
  calendarData: ReturnType<typeof useCalendarData>;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onSelectDate: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

const renderRangeStripe = (
  day: Date,
  rangeStart: Date | null,
  rangeEnd: Date | null,
  transition: ReturnType<typeof useResolvedKnobs>['knobProps']['transition'],
) => {
  const rangeStatus = getRangeStatus(day, rangeStart, rangeEnd);
  if (rangeStatus !== 'in-range' && rangeStatus !== RANGE_START && rangeStatus !== 'range-end') {
    return null;
  }
  return (
    <View
      {...transitionProps(transition)}
      data-range-stripe={rangeStatus}
      position="absolute"
      height="100%"
      zIndex={0}
      backgroundColor={formInputColors.background.focus}
      enterStyle={{ opacity: 0 }}
      exitStyle={{ opacity: 0 }}
      opacity={1}
      {...rangeStripeInsets[rangeStatus]}
    />
  );
};

const RangeDayGrid = ({ calendarData, rangeStart, rangeEnd, onSelectDate, minDate, maxDate }: RangeDayGridProps) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <CalendarDays
      calendarData={calendarData}
      minDate={minDate}
      maxDate={maxDate}
      skipEmptyWeeks
      isSelected={(day) => {
        const status = getRangeStatus(day, rangeStart, rangeEnd);
        return status === RANGE_START || status === 'range-end' || status === 'selected-single';
      }}
      onSelect={onSelectDate}
      selectedBackground={formInputColors.background.focus}
      onToday={() => {
        onSelectDate(new Date());
      }}
      rangeStripe={(day) => renderRangeStripe(day, rangeStart, rangeEnd, knobProps.transition)}
    />
  );
};

// ---------------------------------------------------------------------------
// SingleCalendar — one month panel for range picker
// ---------------------------------------------------------------------------

interface SingleCalendarProps {
  displayDate: Date;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onSelectDate: (date: Date) => void;
  onNavigateMonth: (months: number) => void;
  onSetDisplayDate: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  showPrev?: boolean;
  showNext?: boolean;
}

const SingleCalendar = ({
  displayDate,
  rangeStart,
  rangeEnd,
  onSelectDate,
  onNavigateMonth,
  onSetDisplayDate,
  minDate,
  maxDate,
  showPrev = true,
  showNext = true,
}: SingleCalendarProps) => {
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
        <RangeDayGrid
          calendarData={calendarData}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onSelectDate={onSelectDate}
          minDate={minDate}
          maxDate={maxDate}
        />
      </CalendarPanelFrame>
    </CalendarViewSwitcher>
  );
};

// ---------------------------------------------------------------------------
// DualCalendarBody — two panels side-by-side on wide screens
// ---------------------------------------------------------------------------

interface DualCalendarBodyProps {
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onSelectDate: (date: Date) => void;
  displayDate: Date;
  setDisplayDate: (date: Date) => void;
  navigateMonth: (direction: 'prev' | 'next') => void;
  minDate?: Date;
  maxDate?: Date;
}

const DualCalendarBody = ({
  rangeStart,
  rangeEnd,
  onSelectDate,
  displayDate,
  setDisplayDate,
  navigateMonth,
  minDate,
  maxDate,
}: DualCalendarBodyProps) => {
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
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onSelectDate={onSelectDate}
          onNavigateMonth={handleNavigate}
          onSetDisplayDate={setDisplayDate}
          minDate={minDate}
          maxDate={maxDate}
        />
      </View>
    );
  }

  return (
    <View
      flexDirection="row"
      {...knobProps.gap}>
      <SingleCalendar
        displayDate={prevMonthDate}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onSelectDate={onSelectDate}
        onNavigateMonth={handleNavigate}
        onSetDisplayDate={handleSetDisplayForPrev}
        minDate={minDate}
        maxDate={maxDate}
        showNext={false}
      />
      <Separator vertical />
      <SingleCalendar
        displayDate={displayDate}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onSelectDate={onSelectDate}
        onNavigateMonth={handleNavigate}
        onSetDisplayDate={setDisplayDate}
        minDate={minDate}
        maxDate={maxDate}
        showPrev={false}
      />
    </View>
  );
};

const keepIfSameDay = (prev: Date | null, next: Date | null): Date | null => {
  if (prev === next) {
    return prev;
  }
  return prev !== null && next !== null && isSameDay(prev, next) ? prev : next;
};

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

// Boundary parser for the untyped form/controlled value.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser: value arrives untyped from TanStack field state
const parseDateRange = (raw: unknown): DateRange | null => {
  if (!(raw instanceof Object)) {
    return null;
  }
  return {
    start: 'start' in raw && raw.start instanceof Date ? raw.start : null,
    end: 'end' in raw && raw.end instanceof Date ? raw.end : null,
  };
};

const RangeReadOnly = ({
  value,
  placeholder,
  required,
  hasError,
}: {
  value: string;
  placeholder: string;
  required: boolean | undefined;
  hasError: boolean;
}) => (
  <InputParts.Box>
    <InputParts.Area
      value={value}
      readOnly
      aria-readonly="true"
      aria-required={required ? true : undefined}
      aria-invalid={hasError ? true : undefined}
      placeholder={placeholder}
    />
  </InputParts.Box>
);

const RangeSkeleton = ({
  id,
  label,
  size,
  knobProps,
  resolvedSize,
  visualHeight,
}: {
  id: string;
  label: ReactNode;
  size: SizeTokens | undefined;
  knobProps: ReturnType<typeof useResolvedKnobs>['knobProps'];
  resolvedSize: SizeTokens;
  visualHeight: ReturnType<typeof getFieldHeight>;
}) => (
  <FieldLayout
    id={id}
    label={label}
    size={size}
    knobProps={knobProps}>
    <InputParts size={resolvedSize}>
      <Skeleton
        variant="rounded"
        width="100%"
        height={visualHeight}
        data-daterange-skeleton=""
      />
    </InputParts>
  </FieldLayout>
);

// ---------------------------------------------------------------------------
// formatRange — display value for date range
// ---------------------------------------------------------------------------

// House absolute register — never the toDateString()
// system voice ("Sat Aug 09 2026").
const formatDate = (date: Date) => formatAbsoluteDate(date, { year: 'always' });

const formatRange = (start: Date | null, end: Date | null): string => {
  if (!start) {
    return '';
  }
  if (!end) {
    return `${formatDate(start)} – end date`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
};

// ---------------------------------------------------------------------------
// DateRangePicker — main component
// ---------------------------------------------------------------------------

export const DateRangePicker = <
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> = undefined,
  TFormValidator extends Validator<TParentData> = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(
  props: DateRangePickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
) => {
  const hydrationTouch = useTouchSurface();
  const {
    defaultValue,
    value: valueProp,
    onChange,
    form,
    placeholder = t('Start date – End date'),
    minDate,
    maxDate,
    disabled,
    readOnly,
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
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  // SAFETY: `size` is a SizeTokens prop and knobProps.sizeToken is a size token; the union is only widened by the knob typing.
  const resolvedSize = (size ?? knobProps.sizeToken) as SizeTokens;
  const visualHeight = getFieldHeight(resolvedSize, 1, hydrationTouch);

  const initialRange = parseDateRange(valueProp ?? defaultValue);
  const [open, setOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState<Date | null>(() => initialRange?.start ?? null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(() => initialRange?.end ?? null);
  // Axiom 11 VALUE IS DATA: the calendar opens at the current range's start
  // month, not today's — seed from the value and re-seed per open.
  const { displayDate, setDisplayDate, navigateMonth } = useDateNavigation(rangeStart ?? undefined);
  const popoverRef = useRef<Popover>(null);

  const openPicker = useCallback(() => {
    if (rangeStart !== null) {
      setDisplayDate(rangeStart);
    }
    setOpen(true);
  }, [rangeStart, setDisplayDate]);

  const closePopover = useCallback(() => {
    setOpen(false);
    popoverRef.current?.close();
  }, []);

  // Adopt an externally-applied value (controlled `value` prop or the live
  // TanStack field value) into the display state without emitting onChange.
  // Skip while a range is half-picked (start set, end pending): the
  // first click of a new range used to call onChange(null), and syncing that
  // null wiped rangeStart so the second click could never complete.
  const pickingRangeRef = useRef(false);
  const adoptExternalValue = useCallback(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- FieldValueSync's onSync contract is (value: unknown)
    (raw: unknown) => {
      const next = parseDateRange(raw);
      if (pickingRangeRef.current && next === null) {
        return;
      }
      pickingRangeRef.current = false;
      const nextStart = next?.start ?? null;
      const nextEnd = next?.end ?? null;
      setRangeStart((prev) => keepIfSameDay(prev, nextStart));
      setRangeEnd((prev) => keepIfSameDay(prev, nextEnd));
      if (nextStart !== null && nextEnd !== null) {
        closePopover();
      }
    },
    [closePopover],
  );

  // Keep standalone/controlled state in sync when the parent value changes.
  useEffect(() => {
    if (valueProp === undefined) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- syncs the controlled `value` prop into display state (no onChange); no event handler to hook into
    adoptExternalValue(valueProp);
  }, [valueProp, adoptExternalValue]);

  const handleSelectDate = useCallback(
    (date: Date, fieldChange?: RangeChange) => {
      if (minDate && date < minDate) {
        return;
      }
      if (maxDate && date > maxDate) {
        return;
      }

      if (rangeStart === null || rangeEnd !== null) {
        // Begin a new range locally only — do not commit null to a controlled
        // parent (that would sync-wipe rangeStart before the end date is picked).
        pickingRangeRef.current = true;
        setRangeStart(date);
        setRangeEnd(null);
        return;
      }

      pickingRangeRef.current = false;
      if (date < rangeStart) {
        setRangeEnd(rangeStart);
        setRangeStart(date);
        fieldChange?.({ start: date, end: rangeStart });
        closePopover();
      } else if (isSameDay(date, rangeStart)) {
        setRangeStart(null);
        setRangeEnd(null);
        fieldChange?.(null);
      } else {
        setRangeEnd(date);
        fieldChange?.({ start: rangeStart, end: date });
        closePopover();
      }
    },
    [rangeStart, rangeEnd, minDate, maxDate, closePopover],
  );

  const handleClear = useCallback((fieldChange?: RangeChange) => {
    pickingRangeRef.current = false;
    setRangeStart(null);
    setRangeEnd(null);
    fieldChange?.(null);
  }, []);

  const calendarContent = (fieldChange?: RangeChange) => (
    <DualCalendarBody
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      onSelectDate={(date) => {
        handleSelectDate(date, fieldChange);
      }}
      displayDate={displayDate}
      setDisplayDate={setDisplayDate}
      navigateMonth={navigateMonth}
      minDate={minDate}
      maxDate={maxDate}
    />
  );

  const renderPopover = (hasError = false, blurHandler?: () => void, fieldChange?: RangeChange) => {
    if (readOnly) {
      return (
        <RangeReadOnly
          value={formatRange(rangeStart, rangeEnd)}
          placeholder={placeholder}
          required={required}
          hasError={hasError}
        />
      );
    }
    const handleOpenChange = (isOpen: boolean) => {
      // Re-seed the visible month from the current range on every open.
      if (isOpen && rangeStart !== null) {
        setDisplayDate(rangeStart);
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
            value={formatRange(rangeStart, rangeEnd)}
            placeholder={placeholder}
            disabled={disabled}
            open={open}
            onReset={() => {
              handleClear(fieldChange);
            }}
            onButtonPress={openPicker}
            error={hasError}
            // SB-KS-04: without the field id the sibling FieldLayout label's
            // `htmlFor` resolves to nothing — a dangling label and a control
            // with no accessible name.
            id={id}
            aria-required={required ? true : undefined}
            aria-invalid={hasError ? true : undefined}
          />
        }
        clearValue={formatRange(rangeStart, rangeEnd)}
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
      <RangeSkeleton
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}
        resolvedSize={resolvedSize}
        visualHeight={visualHeight}
      />
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
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        <InputParts size={resolvedSize}>{renderPopover(hasErrorValue(errorProp), undefined, onChange)}</InputParts>
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
            {/* Form branch displays from `rangeStart`/`rangeEnd` — keep them
                synced to the live field value (late seeds / programmatic
                updates). */}
            <FieldValueSync
              value={field.state.value}
              onSync={adoptExternalValue}
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
              // See standalone branch — FieldLayout carries dimWhole.
              disabled={disabled}>
              <InputParts size={resolvedSize}>
                {renderPopover(
                  hasErrorValue(resolvedError),
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
};

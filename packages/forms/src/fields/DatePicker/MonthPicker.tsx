import { useGlyphColor } from '@repo/theme';
import { ChevronLeft, ChevronRight } from '@tamagui/lucide-icons-2';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import { Text, View, useProps, type Popover } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

import { FieldValueSync } from './fieldValueSync';
import {
  CalendarChromeButton,
  CalendarPanelFrame,
  CalendarTextButton,
  DatePickerInputTrigger,
  DatePickerPopoverShell,
  MonthGrid,
  YearGrid,
  months,
  useCalendarKnobs,
  useDateAnimation,
  useDateNavigation,
  yearPageSize,
} from './parts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthPickerValue {
  year: number;
  month: number;
}

export type MonthPickerProps<
  TParentData = any,
  TName extends DeepKeys<TParentData> = any,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children' | 'field'> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    /** When true, render a non-interactive skeleton instead of the picker. */
    skeleton?: boolean;
    /** When true, applies compact density (tighter layout gaps; control size unchanged) */
    compact?: boolean;
    placeholder?: string;
    disabled?: boolean;
    minYear?: number;
    maxYear?: number;
    inputProps?: Omit<ComponentProps<typeof InputParts.Area>, 'value' | 'onChangeText' | 'ref'>;
    /**
     * Canonical change handler, consistent with the rest of the field family.
     * Fires with the selected month or `null` when cleared.
     */
    onChange?: (value: MonthPickerValue | null) => void;
  };

// ---------------------------------------------------------------------------
// formatMonthDisplay — format month/year for display
// ---------------------------------------------------------------------------

function formatMonthDisplay(value: MonthPickerValue | null): string {
  if (!value) {
    return '';
  }
  return `${months[value.month]} ${value.year}`;
}

// ---------------------------------------------------------------------------
// MonthPickerBody — month and year selection
// ---------------------------------------------------------------------------

type ViewMode = 'month' | 'year';

interface MonthPickerBodyProps {
  displayDate: Date;
  selectedValue: MonthPickerValue | null;
  onSelectMonth: (value: MonthPickerValue) => void;
  onSetDisplayDate: (date: Date) => void;
  minYear?: number;
  maxYear?: number;
}

function MonthPickerBody({
  displayDate,
  selectedValue,
  onSelectMonth,
  onSetDisplayDate,
  minYear,
  maxYear,
}: MonthPickerBodyProps) {
  const { knobProps } = useCalendarKnobs();
  const glyphColor = useGlyphColor();
  const { px } = knobProps.nestedControl;
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const year = displayDate.getFullYear();
  const [yearPageStart, setYearPageStart] = useState(() => year - (year % yearPageSize));

  const handleSelectMonth = useCallback(
    (month: number) => {
      onSelectMonth({ year, month });
    },
    [year, onSelectMonth],
  );

  const handleSelectYear = useCallback(
    (selectedYear: number) => {
      const newDate = new Date(displayDate);
      newDate.setDate(1);
      newDate.setFullYear(selectedYear);
      onSetDisplayDate(newDate);
      setViewMode('month');
    },
    [displayDate, onSetDisplayDate],
  );

  const handlePrevYear = useCallback(() => {
    const newDate = new Date(displayDate);
    newDate.setDate(1);
    newDate.setFullYear(newDate.getFullYear() - 1);
    if (minYear && newDate.getFullYear() < minYear) {
      return;
    }
    onSetDisplayDate(newDate);
  }, [displayDate, onSetDisplayDate, minYear]);

  const handleNextYear = useCallback(() => {
    const newDate = new Date(displayDate);
    newDate.setDate(1);
    newDate.setFullYear(newDate.getFullYear() + 1);
    if (maxYear && newDate.getFullYear() > maxYear) {
      return;
    }
    onSetDisplayDate(newDate);
  }, [displayDate, onSetDisplayDate, maxYear]);

  const { animation, animationKey } = useDateAnimation(year);

  if (viewMode === 'year') {
    return (
      <CalendarPanelFrame>
        <YearGrid
          yearPageStart={yearPageStart}
          selectedYear={year}
          onSelectYear={handleSelectYear}
          onPrevPage={() => {
            setYearPageStart((s) => s - yearPageSize);
          }}
          onNextPage={() => {
            setYearPageStart((s) => s + yearPageSize);
          }}
        />
      </CalendarPanelFrame>
    );
  }

  const prevDisabled = minYear !== undefined && year <= minYear;
  const nextDisabled = maxYear !== undefined && year >= maxYear;

  return (
    <CalendarPanelFrame>
      <View
        key={animationKey}
        flexDirection="column"
        alignItems="center"
        {...knobProps.gap}
        width={px * 7}
        {...animation}
        transition={knobProps.transition}>
        <View flexDirection="row" width={px * 7} alignItems="center" justifyContent="space-between">
          <CalendarChromeButton
            onPress={() => {
              if (!prevDisabled) {
                handlePrevYear();
              }
            }}
            label={t('Previous year')}>
            <View opacity={prevDisabled ? 0.4 : 1}>
              <ChevronLeft size={knobProps.controlIcon.width} color={glyphColor} />
            </View>
          </CalendarChromeButton>

          <CalendarTextButton
            onPress={() => {
              setViewMode('year');
            }}>
            <Text color="$color" {...knobProps.label} {...knobProps.textWeight}>
              {year}
            </Text>
          </CalendarTextButton>

          <CalendarChromeButton
            onPress={() => {
              if (!nextDisabled) {
                handleNextYear();
              }
            }}
            label={t('Next year')}>
            <View opacity={nextDisabled ? 0.4 : 1}>
              <ChevronRight size={knobProps.controlIcon.width} color={glyphColor} />
            </View>
          </CalendarChromeButton>
        </View>

        <MonthGrid
          currentYear={year}
          selectedMonth={selectedValue?.year === year ? selectedValue.month : -1}
          onSelectMonth={handleSelectMonth}
        />
      </View>
    </CalendarPanelFrame>
  );
}

// ---------------------------------------------------------------------------
// MonthPicker — main exported component
// ---------------------------------------------------------------------------

export function MonthPicker<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: MonthPickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const {
    defaultValue,
    form,
    inputProps: _inputProps,
    placeholder = t('Select month'),
    minYear,
    maxYear,
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
    onChange,
    skeleton,
    compact,
    id: idProp,
    ..._restProps
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);

  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState<MonthPickerValue | null>(null);
  const { displayDate, setDisplayDate } = useDateNavigation();
  const popoverRef = useRef<Popover>(null);

  // Display comes from `selectedValue`, which only user picks used to set —
  // a field value applied AFTER mount (create-mode seeding, setFieldValue,
  // even the Field-level defaultValue) never rendered. Adopt the live field
  // value without emitting onChange. Identity is preserved when the
  // month is unchanged so the close-on-select effect never re-fires.
  const adoptFieldValue = useCallback((raw: unknown) => {
    const next =
      raw !== null &&
      typeof raw === 'object' &&
      typeof (raw as MonthPickerValue).month === 'number' &&
      typeof (raw as MonthPickerValue).year === 'number'
        ? (raw as MonthPickerValue)
        : null;
    setSelectedValue((prev) =>
      prev === next || (prev !== null && next !== null && prev.month === next.month && prev.year === next.year)
        ? prev
        : next,
    );
  }, []);

  const closePopover = useCallback(() => {
    setOpen(false);
    popoverRef.current?.close();
  }, []);

  useEffect(() => {
    if (selectedValue) {
      closePopover();
    }
  }, [selectedValue, closePopover]);

  const handleMonthSelect = useCallback(
    (value: MonthPickerValue, fieldChange?: (value: any) => void) => {
      if (minYear && value.year < minYear) {
        return;
      }
      if (maxYear && value.year > maxYear) {
        return;
      }
      setSelectedValue(value);
      fieldChange?.(value);
      onChange?.(value);
      closePopover();
    },
    [minYear, maxYear, closePopover, onChange],
  );

  const handleClear = useCallback(
    (fieldChange?: (value: any) => void) => {
      setSelectedValue(null);
      setDisplayDate(new Date());
      fieldChange?.(null);
      onChange?.(null);
    },
    [setDisplayDate, onChange],
  );

  const pickerContent = (fieldChange?: (value: any) => void) => (
    <MonthPickerBody
      displayDate={displayDate}
      selectedValue={selectedValue}
      onSelectMonth={(value) => {
        handleMonthSelect(value, fieldChange);
      }}
      onSetDisplayDate={setDisplayDate}
      minYear={minYear}
      maxYear={maxYear}
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
            value={formatMonthDisplay(selectedValue)}
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
            value={formatMonthDisplay(selectedValue)}
            placeholder={placeholder}
            disabled={disabled}
            open={open}
            onReset={() => {
              handleClear(fieldChange);
            }}
            onButtonPress={() => {
              setOpen(true);
            }}
            error={!!hasError}
            // SB-KS-04: without the field id the sibling FieldLayout label's
            // `htmlFor` resolves to nothing — a dangling label and a control
            // with no accessible name. Carrying it also lets the Label wire
            // `aria-labelledby`, which is the only name source (see
            // fieldLayout.tsx).
            id={id}
            aria-required={required || undefined}
            aria-invalid={hasError || undefined}
          />
        }
        clearValue={formatMonthDisplay(selectedValue)}
        onClear={() => {
          handleClear(fieldChange);
        }}>
        {pickerContent(fieldChange)}
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
            {/* Form branch displays from `selectedValue` — keep it synced to
                the live field value (late seeds / programmatic updates). */}
            <FieldValueSync value={field.state.value} onSync={adoptFieldValue} />
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

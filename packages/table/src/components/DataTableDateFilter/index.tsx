import { ScrollView } from '@repo/ui';
import { Button, DatePicker, FloatingPanel } from '@repo/forms';
import { formatAbsoluteDate, parseCalendarDate, useResolvedKnobs } from '@repo/theme';
import {
  CalendarIcon,
  CalendarDotsIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  ClockIcon,
  XIcon,
} from '@phosphor-icons/react';
import React, { useState, useMemo } from 'react';
import { Separator, Text, View, XStack, YStack, getTokens, getVariableValue } from 'tamagui';

import { t } from '../../shared/t';
import { iconSizeForToken } from '../../utils/chromeIcons';

export type DateFilterOperator =
  | 'is'
  | 'isNot'
  | 'isBefore'
  | 'isAfter'
  | 'isOnOrBefore'
  | 'isOnOrAfter'
  | 'isBetween'
  | 'isToday'
  | 'isYesterday'
  | 'isTomorrow'
  | 'isThisWeek'
  | 'isLastWeek'
  | 'isNextWeek'
  | 'isThisMonth'
  | 'isLastMonth'
  | 'isNextMonth'
  | 'isThisYear'
  | 'isLastYear'
  | 'isNextYear'
  | 'isEmpty'
  | 'isNotEmpty';

export interface DateFilterValue {
  operator: DateFilterOperator;
  value?: string; // ISO date string
  values?: [string, string]; // For range operators
}

export interface DateFilterPreset {
  id: string;
  label: string;
  operator: DateFilterOperator;
  value?: string;
  values?: [string, string];
  icon?: React.ReactNode;
}

export interface DataTableDateFilterProps {
  value?: DateFilterValue;
  onChange?: (value: DateFilterValue | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  showPresets?: boolean;
  customPresets?: DateFilterPreset[];
  dateFormat?: string; // For display formatting
  minDate?: Date;
  maxDate?: Date;
}

// LC-10: the preset window clips on whole-row boundaries only — its max
// height is an exact multiple of the row height (plus in-between gaps),
// never a fractional row. The scrollbar is the affordance for the rest.
const PRESET_VISIBLE_ROWS = 4;
const PRESET_ROW_GAP_TOKEN = '$1';

export function DataTableDateFilter({
  value,
  onChange,
  placeholder = t('Filter by date...'),
  disabled = false,
  showPresets = true,
  customPresets = [],
  dateFormat: _dateFormat = 'MMM dd, yyyy',
  minDate,
  maxDate,
}: DataTableDateFilterProps) {
  const { knobProps } = useResolvedKnobs();
  const sz = knobProps.sizeToken;
  const iconPx = iconSizeForToken(String(sz));
  const triggerMinWidth = sz === '$3' ? 160 : sz === '$5' ? 240 : 200;
  const popoverMinWidth = sz === '$3' ? 280 : sz === '$5' ? 360 : 320;
  // Row height derives from the same size token the preset Buttons render
  // at, so the whole-row window stays exact under every size knob.
  const tokens = getTokens({ prefixed: true });
  const sizeTokens = tokens.size as Record<string, unknown>;
  const presetRowHeight = Math.round(getVariableValue(sizeTokens[sz] ?? sizeTokens.$true));
  const presetRowGap = Math.round(getVariableValue((tokens.space as Record<string, unknown>)[PRESET_ROW_GAP_TOKEN]));
  const presetListMaxHeight = PRESET_VISIBLE_ROWS * presetRowHeight + (PRESET_VISIBLE_ROWS - 1) * presetRowGap;
  const [isOpen, setIsOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Built-in date presets
  const defaultPresets: DateFilterPreset[] = [
    {
      id: 'today',
      label: t('Today'),
      operator: 'isToday',
      icon: <CalendarIcon size={iconPx} />,
    },
    {
      id: 'yesterday',
      label: t('Yesterday'),
      operator: 'isYesterday',
      icon: <CalendarIcon size={iconPx} />,
    },
    {
      id: 'thisWeek',
      label: t('This Week'),
      operator: 'isThisWeek',
      icon: <CalendarDotsIcon size={iconPx} />,
    },
    {
      id: 'thisMonth',
      label: t('This Month'),
      operator: 'isThisMonth',
      icon: <CalendarDotsIcon size={iconPx} />,
    },
    {
      id: 'last7days',
      label: t('Last 7 Days'),
      operator: 'isBetween',
      values: [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString()],
      icon: <CalendarBlankIcon size={iconPx} />,
    },
    {
      id: 'last30days',
      label: t('Last 30 Days'),
      operator: 'isBetween',
      values: [new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString()],
      icon: <CalendarBlankIcon size={iconPx} />,
    },
    {
      id: 'empty',
      label: t('Is Empty'),
      operator: 'isEmpty',
      icon: <XIcon size={iconPx} />,
    },
    {
      id: 'notEmpty',
      label: t('Is Not Empty'),
      operator: 'isNotEmpty',
      icon: <ClockIcon size={iconPx} />,
    },
  ];

  const allPresets = useMemo(() => [...defaultPresets, ...customPresets], [customPresets]);

  // LC-21 (owner adjudication 2026-08-12): a filter panel composes multiple
  // picks — selection applies live and never dismisses. The panel closes only
  // on dismissal intent: outside click, Escape, or the trigger toggle.
  const handlePresetSelect = (preset: DateFilterPreset) => {
    const newValue: DateFilterValue = {
      operator: preset.operator,
      value: preset.value,
      values: preset.values,
    };
    setActivePresetId(preset.id);
    onChange?.(newValue);
  };

  const handleCustomDateSelect = (dateValue: string, operator: DateFilterOperator = 'is') => {
    const newValue: DateFilterValue = {
      operator,
      value: dateValue,
    };
    // Custom commits take over from the preset (7.3 two-way sync).
    setActivePresetId(null);
    onChange?.(newValue);
  };

  const handleDateRangeSelect = (startDate: string, endDate: string) => {
    const newValue: DateFilterValue = {
      operator: 'isBetween',
      values: [startDate, endDate],
    };
    setActivePresetId(null);
    onChange?.(newValue);
  };

  // The custom-range pickers are controlled from the SAME filter value the
  // trigger label reads (7.2/7.3): a preset pick populates them through this
  // resolved window, and a manual pick starts from the preset's dates.
  const pickerRange = useMemo(() => resolveDateFilterRange(value), [value]);

  // Canonical LC-14 onChange from the pickers commits live (LC-21: the filter
  // panel stays open while composing; the DatePicker's own calendar popover is
  // a single-value picker that closes itself on pick). Custom picks commit on
  // day boundaries so the filter matches exactly the dates the pickers show.
  const commitCustomRange = (start: Date | null, end: Date | null) => {
    setActivePresetId(null);
    if (start && end) {
      handleDateRangeSelect(startOfDay(start).toISOString(), endOfDay(end).toISOString());
    } else if (start) {
      onChange?.({ operator: 'isOnOrAfter', value: startOfDay(start).toISOString() });
    } else if (end) {
      onChange?.({ operator: 'isOnOrBefore', value: endOfDay(end).toISOString() });
    } else {
      onChange?.();
    }
  };

  const handleStartDatePick = (date: Date | null) => {
    // Picking a start past the current end starts a new range.
    const end = date && pickerRange.end && pickerRange.end < startOfDay(date) ? null : pickerRange.end;
    commitCustomRange(date, end);
  };

  const handleEndDatePick = (date: Date | null) => {
    // Picking an end before the current start starts a new range.
    const start = date && pickerRange.start && pickerRange.start > endOfDay(date) ? null : pickerRange.start;
    commitCustomRange(start, date);
  };

  const handleClear = () => {
    setActivePresetId(null);
    onChange?.();
  };

  // House absolute register (LC-12 / DF-14) — one formatter owns every absolute date.
  const formatDate = (dateString: string) => {
    const formatted = formatAbsoluteDate(dateString, { year: 'always' });
    return formatted === '' ? dateString : formatted;
  };

  const getDisplayValue = () => {
    if (!value) {
      return placeholder;
    }

    switch (value.operator) {
      case 'is': {
        return value.value ? t('Is {{date}}', { date: formatDate(value.value) }) : placeholder;
      }
      case 'isNot': {
        return value.value ? t('Is not {{date}}', { date: formatDate(value.value) }) : placeholder;
      }
      case 'isBefore': {
        return value.value ? t('Before {{date}}', { date: formatDate(value.value) }) : placeholder;
      }
      case 'isAfter': {
        return value.value ? t('After {{date}}', { date: formatDate(value.value) }) : placeholder;
      }
      case 'isOnOrBefore': {
        return value.value ? t('On or before {{date}}', { date: formatDate(value.value) }) : placeholder;
      }
      case 'isOnOrAfter': {
        return value.value ? t('On or after {{date}}', { date: formatDate(value.value) }) : placeholder;
      }
      case 'isBetween': {
        return value.values
          ? t('{{start}} - {{end}}', {
              start: formatDate(value.values[0]),
              end: formatDate(value.values[1]),
            })
          : placeholder;
      }
      case 'isToday': {
        return t('Today');
      }
      case 'isYesterday': {
        return t('Yesterday');
      }
      case 'isTomorrow': {
        return t('Tomorrow');
      }
      case 'isThisWeek': {
        return t('This week');
      }
      case 'isLastWeek': {
        return t('Last week');
      }
      case 'isNextWeek': {
        return t('Next week');
      }
      case 'isThisMonth': {
        return t('This month');
      }
      case 'isLastMonth': {
        return t('Last month');
      }
      case 'isNextMonth': {
        return t('Next month');
      }
      case 'isThisYear': {
        return t('This year');
      }
      case 'isLastYear': {
        return t('Last year');
      }
      case 'isNextYear': {
        return t('Next year');
      }
      case 'isEmpty': {
        return t('Is empty');
      }
      case 'isNotEmpty': {
        return t('Is not empty');
      }
      default: {
        return placeholder;
      }
    }
  };

  const trigger = (
    <Button
      size={knobProps.sizeToken}
      disabled={disabled}
      icon={<CalendarIcon size={iconPx} />}
      justifyContent="flex-start"
      minWidth={triggerMinWidth}>
      <Text
        flex={1}
        textAlign="left"
        // LC-40: while disabled, the placeholder tier ($color10) drops
        // below AA on the washed chrome — pin to the lowest AA step.
        color={disabled ? '$color11' : value ? undefined : '$color10'}
        fontSize="$3"
        numberOfLines={1}>
        {getDisplayValue()}
      </Text>
      <CaretDownIcon size={iconPx} />
    </Button>
  );

  return (
    // LC-06: anchored editor. FloatingPanel attaches flush to the trigger
    // (MPO-38 cover contract), clamps inside the viewport and becomes a sheet
    // at 640 and below.
    <FloatingPanel
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      scrollable>
      <YStack
        {...knobProps.gapLg}
        minWidth={popoverMinWidth}
        data-dismiss-class="compose">
        <XStack
          justifyContent="space-between"
          alignItems="center">
          <Text
            {...knobProps.label}
            fontWeight="400">
            {t('Date Filter')}
          </Text>
          {value && (
            <Button
              size={knobProps.sizeToken}
              onPress={handleClear}
              icon={<XIcon size={iconPx} />}>
              {t('Clear')}
            </Button>
          )}
        </XStack>

        {/* Quick Presets */}
        {showPresets && (
          <YStack gap="$2">
            <Text
              {...knobProps.label}
              fontWeight="400">
              {t('Quick Filters')}
            </Text>
            <ScrollView maxHeight={presetListMaxHeight}>
              <YStack gap={PRESET_ROW_GAP_TOKEN}>
                {allPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    size={knobProps.sizeToken}
                    justifyContent="flex-start"
                    onPress={() => {
                      handlePresetSelect(preset);
                    }}
                    {...(activePresetId === preset.id
                      ? { theme: 'accent' as any, backgroundColor: '$background' }
                      : undefined)}>
                    <Text fontSize="$3">{preset.label}</Text>
                  </Button>
                ))}
              </YStack>
            </ScrollView>
          </YStack>
        )}

        <Separator />

        {/* Custom Date Selection */}
        <YStack {...knobProps.gap}>
          <Text
            {...knobProps.label}
            fontWeight="400">
            {t('Custom Date')}
          </Text>

          <XStack gap="$2">
            <Button
              flex={1}
              size={knobProps.sizeToken}
              onPress={() => {
                handleCustomDateSelect(new Date().toISOString(), 'is');
              }}>
              {t('Today')}
            </Button>
            <Button
              flex={1}
              size={knobProps.sizeToken}
              onPress={() => {
                handleCustomDateSelect(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), 'is');
              }}>
              {t('Yesterday')}
            </Button>
          </XStack>

          {/* Date Range */}
          <YStack gap="$2">
            <Text
              {...knobProps.label}
              fontWeight="400">
              {t('Date Range')}
            </Text>
            <XStack gap="$2">
              <Button
                flex={1}
                size={knobProps.sizeToken}
                onPress={() => {
                  handleDateRangeSelect(
                    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    new Date().toISOString(),
                  );
                }}>
                {t('Last 7 days')}
              </Button>
              <Button
                flex={1}
                size={knobProps.sizeToken}
                onPress={() => {
                  handleDateRangeSelect(
                    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    new Date().toISOString(),
                  );
                }}>
                {t('Last 30 days')}
              </Button>
            </XStack>
          </YStack>

          {/* DatePicker-based Custom Range Selection */}
          <YStack gap="$2">
            <Text
              {...knobProps.label}
              fontWeight="400">
              {t('Custom Range')}
            </Text>
            <XStack gap="$2">
              <View
                flex={1}
                data-testid="start-date-picker">
                <DatePicker
                  placeholder={t('Start date')}
                  label={t('From')}
                  minDate={minDate}
                  maxDate={maxDate}
                  value={pickerRange.start ?? null}
                  onChange={handleStartDatePick}
                />
              </View>
              <View
                flex={1}
                data-testid="end-date-picker">
                <DatePicker
                  placeholder={t('End date')}
                  label={t('To')}
                  minDate={minDate}
                  maxDate={maxDate}
                  value={pickerRange.end ?? null}
                  onChange={handleEndDatePick}
                />
              </View>
            </XStack>
          </YStack>
        </YStack>
      </YStack>
    </FloatingPanel>
  );
}

// Date Filter Utilities

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function endOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(23, 59, 59, 999);
  return day;
}

/**
 * Resolve the concrete calendar window a DateFilterValue covers, used to
 * populate the custom-range DatePickers (spec tasks 7.2/7.3): presets and
 * relative operators (isToday, isThisWeek, …) resolve against `now` with the
 * same boundaries applyDateFilter matches on; open-ended operators leave the
 * missing side null; negations/emptiness have no contiguous window.
 */
export function resolveDateFilterRange(
  filterValue: DateFilterValue | undefined,
  now: Date = new Date(),
): { start: Date | null; end: Date | null } {
  if (!filterValue) {
    return { start: null, end: null };
  }
  const { operator, value, values } = filterValue;
  const today = startOfDay(now);
  // Same day-grid parse applyDateFilter matches on, so the pickers open on the
  // day a date-only comparand names rather than the UTC instant it would be.
  const parsed = (iso?: string) => parseCalendarDate(iso);
  const dayWindow = (offsetDays: number) => {
    const day = new Date(today);
    day.setDate(day.getDate() + offsetDays);
    return { start: day, end: endOfDay(day) };
  };
  const weekWindow = (offsetWeeks: number) => {
    // Same week boundaries as applyDateFilter: weeks start on Sunday.
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + offsetWeeks * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return { start: weekStart, end: endOfDay(weekEnd) };
  };
  const monthWindow = (offsetMonths: number) => {
    const start = new Date(today.getFullYear(), today.getMonth() + offsetMonths, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + offsetMonths + 1, 0);
    return { start, end: endOfDay(end) };
  };
  const yearWindow = (offsetYears: number) => {
    const start = new Date(today.getFullYear() + offsetYears, 0, 1);
    const end = new Date(today.getFullYear() + offsetYears, 11, 31);
    return { start, end: endOfDay(end) };
  };
  switch (operator) {
    case 'isBetween': {
      return { start: parsed(values?.[0]), end: parsed(values?.[1]) };
    }
    case 'is': {
      const date = parsed(value);
      return date ? { start: date, end: date } : { start: null, end: null };
    }
    case 'isAfter':
    case 'isOnOrAfter': {
      return { start: parsed(value), end: null };
    }
    case 'isBefore':
    case 'isOnOrBefore': {
      return { start: null, end: parsed(value) };
    }
    case 'isToday': {
      return dayWindow(0);
    }
    case 'isYesterday': {
      return dayWindow(-1);
    }
    case 'isTomorrow': {
      return dayWindow(1);
    }
    case 'isThisWeek': {
      return weekWindow(0);
    }
    case 'isLastWeek': {
      return weekWindow(-1);
    }
    case 'isNextWeek': {
      return weekWindow(1);
    }
    case 'isThisMonth': {
      return monthWindow(0);
    }
    case 'isLastMonth': {
      return monthWindow(-1);
    }
    case 'isNextMonth': {
      return monthWindow(1);
    }
    case 'isThisYear': {
      return yearWindow(0);
    }
    case 'isLastYear': {
      return yearWindow(-1);
    }
    case 'isNextYear': {
      return yearWindow(1);
    }
    default: {
      return { start: null, end: null };
    }
  }
}

export function applyDateFilter<T>(data: T[], columnKey: keyof T, filterValue?: DateFilterValue): T[] {
  if (!filterValue) {
    return data;
  }

  const { operator, value, values } = filterValue;

  return data.filter((item) => {
    const itemValue = item[columnKey];
    if (!itemValue) {
      return operator === 'isEmpty';
    }

    // Rows and comparands share the day-grid parse. A date-only "YYYY-MM-DD"
    // names a calendar day, and `new Date()` reads that as UTC midnight — the
    // previous local day west of UTC, mid-afternoon east of it — while every
    // window below is built from local parts. Parsed apart, the two sides
    // disagree by a day and the filter drops or admits a day of rows.
    const itemDate = parseCalendarDate(itemValue as string);
    if (!itemDate) {
      return false;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (operator) {
      case 'is': {
        const on = parseCalendarDate(value);
        return on ? itemDate.toDateString() === on.toDateString() : false;
      }
      case 'isNot': {
        if (!value) {
          return false;
        }
        const on = parseCalendarDate(value);
        // An unusable comparand still excludes nothing, as it always did.
        return !on || itemDate.toDateString() !== on.toDateString();
      }
      case 'isBefore': {
        const on = parseCalendarDate(value);
        return on ? itemDate < on : false;
      }
      case 'isAfter': {
        const on = parseCalendarDate(value);
        return on ? itemDate > on : false;
      }
      case 'isOnOrBefore': {
        const on = parseCalendarDate(value);
        return on ? itemDate <= on : false;
      }
      case 'isOnOrAfter': {
        const on = parseCalendarDate(value);
        return on ? itemDate >= on : false;
      }
      case 'isBetween': {
        const from = parseCalendarDate(values?.[0]);
        const to = parseCalendarDate(values?.[1]);
        return from && to ? itemDate >= from && itemDate <= to : false;
      }
      case 'isToday': {
        return itemDate.toDateString() === today.toDateString();
      }
      case 'isYesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return itemDate.toDateString() === yesterday.toDateString();
      }
      case 'isTomorrow': {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return itemDate.toDateString() === tomorrow.toDateString();
      }
      // Week windows are day-granular like isToday/isThisMonth: the last day
      // counts in full (endOfDay), not only its first midnight instant.
      case 'isThisWeek': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return itemDate >= weekStart && itemDate <= endOfDay(weekEnd);
      }
      case 'isLastWeek': {
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        return itemDate >= lastWeekStart && itemDate <= endOfDay(lastWeekEnd);
      }
      case 'isNextWeek': {
        const nextWeekStart = new Date(today);
        nextWeekStart.setDate(today.getDate() - today.getDay() + 7);
        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
        return itemDate >= nextWeekStart && itemDate <= endOfDay(nextWeekEnd);
      }
      case 'isThisMonth': {
        return itemDate.getMonth() === today.getMonth() && itemDate.getFullYear() === today.getFullYear();
      }
      case 'isLastMonth': {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1);
        return itemDate.getMonth() === lastMonth.getMonth() && itemDate.getFullYear() === lastMonth.getFullYear();
      }
      case 'isNextMonth': {
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1);
        return itemDate.getMonth() === nextMonth.getMonth() && itemDate.getFullYear() === nextMonth.getFullYear();
      }
      case 'isThisYear': {
        return itemDate.getFullYear() === today.getFullYear();
      }
      case 'isLastYear': {
        return itemDate.getFullYear() === today.getFullYear() - 1;
      }
      case 'isNextYear': {
        return itemDate.getFullYear() === today.getFullYear() + 1;
      }
      case 'isEmpty': {
        return !itemValue;
      }
      case 'isNotEmpty': {
        return !!itemValue;
      }
      default: {
        return true;
      }
    }
  });
}

// Hook for Date Filtering

export interface UseDateFilterOptions<T = any> {
  data: T[];
  columnKey: keyof T;
  initialFilter?: DateFilterValue;
  onFilterChange?: (filteredData: T[], filter: DateFilterValue | undefined) => void;
}

export interface UseDateFilterReturn<T = any> {
  filteredData: T[];
  filterValue: DateFilterValue | undefined;
  setFilterValue: (value: DateFilterValue | undefined) => void;
  clearFilter: () => void;
  isFiltered: boolean;
}

export function useDateFilter<T = any>({
  data,
  columnKey,
  initialFilter,
  onFilterChange,
}: UseDateFilterOptions<T>): UseDateFilterReturn<T> {
  const [filterValue, setFilterValue] = useState<DateFilterValue | undefined>(initialFilter);

  const filteredData = useMemo(() => {
    if (!filterValue) {
      return data;
    }
    return applyDateFilter(data, columnKey, filterValue);
  }, [data, columnKey, filterValue]);

  React.useEffect(() => {
    onFilterChange?.(filteredData, filterValue);
  }, [filteredData, filterValue, onFilterChange]);

  const clearFilter = React.useCallback(() => {
    setFilterValue(undefined);
  }, []);

  return {
    filteredData,
    filterValue,
    setFilterValue,
    clearFilter,
    isFiltered: !!filterValue,
  };
}

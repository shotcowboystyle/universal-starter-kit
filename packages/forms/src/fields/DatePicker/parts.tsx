import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, ClockIcon, XIcon } from '@phosphor-icons/react';
import {
  ensureFocusVisibleRing,
  formatAbsoluteDate,
  getMonthNames,
  useAccentOnSurface,
  useGlyphColor,
  useResolvedKnobs,
} from '@repo/theme';
import { type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, Text, View, isWeb } from 'tamagui';

import { FloatingPanel, floatingPanelActionProps, isNestedPanelAction } from '../../FloatingPanel';
import type { PanelActionEvent } from '../../FloatingPanel/nestedAction';
import { Input as InputParts } from '../../InputParts';
import { formCommonColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewMode = 'day' | 'month' | 'year';

export interface CalendarData {
  year: number;
  month: number;
  monthName: string;
  days: Date[];
  today: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const yearPageSize = 12;

// ---------------------------------------------------------------------------
// Styled sub-components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// useDateAnimation — smooth directional transitions
// ---------------------------------------------------------------------------

export function useDateAnimation(current: string | number) {
  const prev = useRef<string | number | null>(null);

  const direction = useMemo(() => {
    if (prev.current === null) {
      return 0;
    }
    return current > prev.current ? 1 : current < prev.current ? -1 : 0;
  }, [current]);

  useEffect(() => {
    prev.current = current;
  }, [current]);

  const animation = useMemo(
    () => ({
      enterStyle: { opacity: 0, x: direction * 15 },
      exitStyle: { opacity: 0, x: direction * -15 },
    }),
    [direction],
  );

  return { animation, animationKey: current };
}

// ---------------------------------------------------------------------------
// useCalendarData — compute calendar grid for a given month
// ---------------------------------------------------------------------------

// Picker headers speak the house month register, not
// a locale pinned to en-US at the call site.
const monthNames = getMonthNames();

export function useCalendarData(displayDate: Date): CalendarData {
  return useMemo(() => {
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));

    const days: Date[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return {
      year,
      month,
      monthName: monthNames[month],
      days,
      today: new Date(),
    };
  }, [displayDate]);
}

// ---------------------------------------------------------------------------
// useDateNavigation — shared month/display date management
// ---------------------------------------------------------------------------

export function useDateNavigation(initialDate?: Date) {
  const [displayDate, setDisplayDate] = useState<Date>(initialDate ?? new Date());

  const navigateMonth = useCallback((direction: 'prev' | 'next') => {
    setDisplayDate((prev) => {
      const next = new Date(prev);
      next.setDate(1);
      next.setMonth(next.getMonth() + (direction === 'prev' ? -1 : 1));
      return next;
    });
  }, []);

  return { displayDate, setDisplayDate, navigateMonth };
}

// ---------------------------------------------------------------------------
// toWeeks — split days array into 7-day rows
// ---------------------------------------------------------------------------

export function toWeeks(days: Date[]): Date[][] {
  const result: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    result.push(days.slice(i, i + 7));
  }
  return result;
}

// ---------------------------------------------------------------------------
// isSameDay — date comparison utility
// ---------------------------------------------------------------------------

export function isSameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return a.toDateString() === b.toDateString();
}

// ---------------------------------------------------------------------------
// dayCellRadius — binary-pointy day cells
// ---------------------------------------------------------------------------

/**
 * Day cells are circular by default; at the "none" borderRadius knob they go
 * square (binary-pointy, same contract as Switch/Radio). Inline style so a
 * consumer `circular` variant cannot expand past the nested-control box.
 */
export function dayCellRadius(knobProps: { pointy?: boolean }): {
  style: { borderRadius: number };
} {
  return { style: { borderRadius: knobProps.pointy ? 0 : 9999 } };
}

/** Calendar chrome sits one density step below the page. */
export function useCalendarKnobs() {
  return useResolvedKnobs({ compact: true });
}

/** Overlay/dialog calendar frame: compact padding + a 7-cell content width. */
export function CalendarPanelFrame({ children }: { children: ReactNode }) {
  const { knobProps } = useCalendarKnobs();
  const { px } = knobProps.nestedControl;
  return (
    <View
      flexDirection="column"
      alignItems="center"
      {...knobProps.gap}
      minWidth={px * 7}
      alignSelf="center"
      {...knobProps.panelPadding}
      data-testid="date-picker-calendar">
      {children}
    </View>
  );
}

function splitNestedControl(nested: {
  px: number;
  hitSlop: { top: number; bottom: number; left: number; right: number };
  width: number;
  height: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}) {
  const { px, hitSlop, ...box } = nested;
  return { px, hitSlop, box };
}

function calendarKeyHandler(onPress: () => void) {
  return (e: { key?: string; preventDefault?: () => void }) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault?.();
      onPress();
    }
  };
}

export function CalendarChromeButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
}) {
  const { knobProps } = useCalendarKnobs();
  const { hitSlop, box } = splitNestedControl(knobProps.nestedControl);
  return (
    <View
      {...box}
      role="button"
      aria-label={label}
      cursor="pointer"
      alignItems="center"
      justifyContent="center"
      onPress={onPress}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing()}
      {...(!isWeb ? { hitSlop } : {})}
      {...(isWeb
        ? { tabIndex: 0, onKeyDown: calendarKeyHandler(onPress) as unknown as () => void }
        : { accessible: true })}>
      {children}
    </View>
  );
}

export function CalendarTextButton({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <View
      role="button"
      cursor="pointer"
      paddingVertical={2}
      paddingHorizontal={4}
      onPress={onPress}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing()}
      {...(isWeb
        ? { tabIndex: 0, onKeyDown: calendarKeyHandler(onPress) as unknown as () => void }
        : { accessible: true })}>
      {children}
    </View>
  );
}

export function CalendarDaySlot({ children }: { children?: ReactNode }) {
  const { knobProps } = useCalendarKnobs();
  const { px } = knobProps.nestedControl;
  return (
    <View width={px} height={px} justifyContent="center" alignItems="center" position="relative">
      {children}
    </View>
  );
}

export function CalendarWeekRow({ children }: { children: ReactNode }) {
  const { knobProps } = useCalendarKnobs();
  const { px } = knobProps.nestedControl;
  return (
    <View flexDirection="row" width={px * 7}>
      {children}
    </View>
  );
}

export function CalendarDayCell({
  day,
  selected,
  today,
  disabled,
  visible = true,
  dimmed,
  tabIndex,
  onPress,
  onKeyDown,
  selectedBackground,
}: {
  day: Date;
  selected?: boolean;
  today?: boolean;
  disabled?: boolean;
  visible?: boolean;
  dimmed?: boolean;
  tabIndex?: number;
  onPress: () => void;
  onKeyDown?: (e: { key?: string; preventDefault?: () => void }) => void;
  selectedBackground?: string;
}) {
  const { knobProps } = useCalendarKnobs();
  const accentText = useAccentOnSurface();
  const { px, hitSlop, box } = splitNestedControl(knobProps.nestedControl);

  if (!visible) {
    return <View width={px} height={px} />;
  }

  const showTodayMark = !!today && !selected;
  const resolvedTabIndex = tabIndex ?? (disabled ? -1 : 0);

  return (
    <View
      {...box}
      {...dayCellRadius(knobProps)}
      role="button"
      aria-label={String(day.getDate())}
      aria-disabled={disabled || undefined}
      aria-pressed={selected || undefined}
      aria-current={today ? 'date' : undefined}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      alignItems="center"
      justifyContent="center"
      onPress={() => {
        if (!disabled) {
          onPress();
        }
      }}
      // Adjacent-month spill uses this file's 0.45 day-cell dim.
      // Unavailable (min/max or multi-select cap) uses the 0.5 disabled
      // idiom from the Today control and the trigger Box. Unavailable
      // wins when both apply so an out-of-range adjacent day does not
      // look like a pickable spill-over day. Bento paints this state
      // identical to a choosable cell; we do not adopt that.
      opacity={disabled ? 0.5 : dimmed ? 0.45 : 1}
      pointerEvents={disabled ? 'none' : 'auto'}
      backgroundColor={selected ? (selectedBackground ?? '$background') : 'transparent'}
      theme={selected ? ('accent' as any) : undefined}
      borderWidth={showTodayMark ? 2 : 0}
      borderColor={showTodayMark ? accentText : 'transparent'}
      zIndex={1}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
      data-nested-px={px}
      data-calendar-day={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
      {...(!isWeb ? { hitSlop } : {})}
      {...(isWeb
        ? {
            tabIndex: resolvedTabIndex,
            onKeyDown: ((e: { key?: string; preventDefault?: () => void }) => {
              if (!disabled) {
                calendarKeyHandler(onPress)(e);
              }
              onKeyDown?.(e);
            }) as unknown as () => void,
          }
        : { accessible: true })}>
      <Text
        {...knobProps.label}
        {...knobProps.textWeight}
        fontWeight={selected ? 'bold' : knobProps.textWeight.fontWeight}
        color={selected ? undefined : today ? accentText : formCommonColors.text}>
        {day.getDate()}
      </Text>
    </View>
  );
}

export function CalendarDays({
  calendarData,
  minDate,
  maxDate,
  isSelected,
  onSelect,
  selectedBackground,
  skipEmptyWeeks,
  rangeStripe,
  onToday,
  selectionCapped,
}: {
  calendarData: CalendarData;
  minDate?: Date;
  maxDate?: Date;
  isSelected: (day: Date) => boolean;
  onSelect: (day: Date) => void;
  selectedBackground?: string;
  skipEmptyWeeks?: boolean;
  rangeStripe?: (day: Date) => ReactNode;
  onToday?: () => void;
  /** Multiple-mode is at `limit`; unselected cells look unavailable. */
  selectionCapped?: boolean;
}) {
  const { knobProps } = useCalendarKnobs();
  const { animation, animationKey } = useDateAnimation(`${calendarData.year}-${calendarData.month}`);
  const weeks = toWeeks(calendarData.days);
  const { px } = knobProps.nestedControl;

  const [focusedDay, setFocusedDay] = useState<Date | null>(() => {
    const selected = calendarData.days.find((day) => day.getMonth() === calendarData.month && isSelected(day));
    const today = calendarData.days.find(
      (day) => day.getMonth() === calendarData.month && isSameDay(calendarData.today, day),
    );
    return selected ?? today ?? calendarData.days.find((day) => day.getMonth() === calendarData.month) ?? null;
  });

  useEffect(() => {
    const selected = calendarData.days.find((day) => day.getMonth() === calendarData.month && isSelected(day));
    const today = calendarData.days.find(
      (day) => day.getMonth() === calendarData.month && isSameDay(calendarData.today, day),
    );
    setFocusedDay(selected ?? today ?? calendarData.days.find((day) => day.getMonth() === calendarData.month) ?? null);
  }, [calendarData.year, calendarData.month]);

  const moveFocus = useCallback(
    (from: Date, delta: number) => {
      const idx = calendarData.days.findIndex((day) => isSameDay(day, from));
      const next = calendarData.days[idx + delta];
      if (!next) {
        return;
      }
      setFocusedDay(next);
      if (!isWeb) {
        return;
      }
      const key = `${next.getFullYear()}-${next.getMonth()}-${next.getDate()}`;
      requestAnimationFrame(() => {
        (document.querySelector(`[data-calendar-day="${key}"]`) as HTMLElement | null)?.focus?.();
      });
    },
    [calendarData.days],
  );

  const todayOutOfRange =
    (minDate != null && calendarData.today < minDate) || (maxDate != null && calendarData.today > maxDate);

  return (
    <AnimatePresence key={animationKey}>
      <View
        transition={knobProps.transition}
        {...animation}
        alignSelf="center"
        gap="$1"
        width={px * 7}
        role="grid"
        aria-label={t('Calendar')}>
        <WeekView />
        {weeks.map((week) => {
          const hasCurrentMonthDay = week.some((d) => d.getMonth() === calendarData.month);
          if (skipEmptyWeeks && !hasCurrentMonthDay) {
            return <View key={week[0].toISOString()} height="$3" />;
          }
          return (
            <CalendarWeekRow key={week[0].toISOString()}>
              {week.map((day) => {
                const key = day.toISOString();
                const isCurrentMonth = day.getMonth() === calendarData.month;
                const isToday = isSameDay(calendarData.today, day);
                const isOutOfRange = (minDate != null && day < minDate) || (maxDate != null && day > maxDate);
                const isDisabled = isOutOfRange || (!!selectionCapped && !isSelected(day));
                const cell = (
                  <CalendarDayCell
                    day={day}
                    selected={isCurrentMonth && isSelected(day)}
                    today={isToday}
                    disabled={isDisabled}
                    visible
                    dimmed={!isCurrentMonth}
                    tabIndex={isSameDay(focusedDay, day) ? 0 : -1}
                    onPress={() => {
                      onSelect(day);
                    }}
                    onKeyDown={(e) => {
                      const delta =
                        e.key === 'ArrowLeft'
                          ? -1
                          : e.key === 'ArrowRight'
                            ? 1
                            : e.key === 'ArrowUp'
                              ? -7
                              : e.key === 'ArrowDown'
                                ? 7
                                : 0;
                      if (!delta) {
                        return;
                      }
                      e.preventDefault?.();
                      moveFocus(day, delta);
                    }}
                    selectedBackground={selectedBackground}
                  />
                );
                if (!rangeStripe) {
                  return <View key={key}>{cell}</View>;
                }
                return (
                  <CalendarDaySlot key={key}>
                    {rangeStripe(day)}
                    {cell}
                  </CalendarDaySlot>
                );
              })}
            </CalendarWeekRow>
          );
        })}
        {onToday ? (
          <CalendarTextButton onPress={todayOutOfRange ? () => {} : onToday}>
            <Text
              {...knobProps.label}
              {...knobProps.textWeight}
              color={todayOutOfRange ? formCommonColors.muted : formCommonColors.text}
              opacity={todayOutOfRange ? 0.5 : 1}>
              {t('Today')}
            </Text>
          </CalendarTextButton>
        ) : null}
      </View>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// WeekView — weekday header row
// ---------------------------------------------------------------------------

export function WeekView() {
  const { knobProps } = useCalendarKnobs();
  const { px } = knobProps.nestedControl;
  return (
    <View flexDirection="row" width={px * 7} alignSelf="center">
      {weekdays.map((day) => (
        <Text
          key={day}
          width={px}
          textAlign="center"
          color={formCommonColors.muted}
          {...knobProps.label}
          {...knobProps.textWeight}>
          {t(day)}
        </Text>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// CalendarHeader — clickable year + month with nav arrows
// ---------------------------------------------------------------------------

interface CalendarHeaderProps {
  year: number;
  monthName: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onYearPress: () => void;
  onMonthPress: () => void;
  showPrev?: boolean;
  showNext?: boolean;
}

export function CalendarHeader({
  year,
  monthName,
  onPrevMonth,
  onNextMonth,
  onYearPress,
  onMonthPress,
  showPrev = true,
  showNext = true,
}: CalendarHeaderProps) {
  const { knobProps } = useCalendarKnobs();
  const glyphColor = useGlyphColor();
  const { px } = knobProps.nestedControl;
  return (
    <View flexDirection="row" width={px * 7} alignSelf="center" alignItems="center" justifyContent="space-between">
      {showPrev && onPrevMonth ? (
        <CalendarChromeButton onPress={onPrevMonth} label={t('Previous month')}>
          <CaretLeftIcon size={knobProps.controlIcon.width} color={glyphColor} />
        </CalendarChromeButton>
      ) : (
        <View width={px} height={px} />
      )}

      <View flexDirection="row" alignItems="center" {...knobProps.gap}>
        <CalendarTextButton onPress={onMonthPress}>
          <Text color="$color" {...knobProps.label} {...knobProps.textWeight} fontWeight="600">
            {monthName}
          </Text>
        </CalendarTextButton>
        <CalendarTextButton onPress={onYearPress}>
          <Text color={formCommonColors.muted} {...knobProps.label} {...knobProps.textWeight}>
            {year}
          </Text>
        </CalendarTextButton>
      </View>

      {showNext && onNextMonth ? (
        <CalendarChromeButton onPress={onNextMonth} label={t('Next month')}>
          <CaretRightIcon size={knobProps.controlIcon.width} color={glyphColor} />
        </CalendarChromeButton>
      ) : (
        <View width={px} height={px} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// MonthGrid — 4x3 month selector
// ---------------------------------------------------------------------------

interface MonthGridProps {
  currentYear: number;
  selectedMonth: number;
  onSelectMonth: (month: number) => void;
}

export function MonthGrid({ currentYear, selectedMonth, onSelectMonth }: MonthGridProps) {
  const { knobProps } = useCalendarKnobs();
  const { animation, animationKey } = useDateAnimation(currentYear);
  const { px, hitSlop, box } = splitNestedControl(knobProps.nestedControl);
  const cellW = (px * 7) / 3;

  return (
    <AnimatePresence key={animationKey}>
      <View
        {...animation}
        transition={knobProps.transition}
        flexDirection="row"
        flexWrap="wrap"
        width={px * 7}
        alignSelf="center">
        {months.map((name, index) => {
          const isSelected = selectedMonth === index;
          return (
            <View
              key={name}
              {...box}
              width={cellW}
              maxWidth={cellW}
              minWidth={cellW}
              height={px}
              minHeight={px}
              maxHeight={px}
              role="button"
              aria-pressed={isSelected || undefined}
              cursor="pointer"
              alignItems="center"
              justifyContent="center"
              theme={isSelected ? ('accent' as any) : undefined}
              backgroundColor={isSelected ? '$background' : 'transparent'}
              onPress={() => {
                onSelectMonth(index);
              }}
              outlineWidth={0}
              focusStyle={{ outlineWidth: 0 }}
              focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
              data-nested-px={px}
              {...(!isWeb ? { hitSlop } : {})}
              {...(isWeb
                ? {
                    tabIndex: 0,
                    onKeyDown: calendarKeyHandler(() => {
                      onSelectMonth(index);
                    }) as unknown as () => void,
                  }
                : { accessible: true })}>
              <Text
                {...knobProps.label}
                color={isSelected ? '$color' : formCommonColors.text}
                fontWeight={isSelected ? 'bold' : '400'}>
                {t(name.slice(0, 3))}
              </Text>
            </View>
          );
        })}
      </View>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// YearGrid — paginated year selector with range slider
// ---------------------------------------------------------------------------

interface YearGridProps {
  yearPageStart: number;
  selectedYear: number;
  onSelectYear: (year: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function YearGrid({ yearPageStart, selectedYear, onSelectYear, onPrevPage, onNextPage }: YearGridProps) {
  const { knobProps } = useCalendarKnobs();
  const glyphColor = useGlyphColor();
  const { px, hitSlop, box } = splitNestedControl(knobProps.nestedControl);
  const cellW = (px * 7) / 3;
  const years = useMemo(() => {
    const result: number[] = [];
    for (let i = 0; i < yearPageSize; i++) {
      result.push(yearPageStart + i);
    }
    return result;
  }, [yearPageStart]);

  const { animation, animationKey } = useDateAnimation(yearPageStart);

  return (
    <View width={px * 7} alignSelf="center" {...knobProps.gap}>
      <View flexDirection="row" width={px * 7} alignItems="center" justifyContent="space-between">
        <CalendarChromeButton onPress={onPrevPage} label={t('Previous years')}>
          <CaretLeftIcon size={knobProps.controlIcon.width} color={glyphColor} />
        </CalendarChromeButton>
        <Text {...knobProps.label} {...knobProps.textWeight}>
          {years[0]} – {years[years.length - 1]}
        </Text>
        <CalendarChromeButton onPress={onNextPage} label={t('Next years')}>
          <CaretRightIcon size={knobProps.controlIcon.width} color={glyphColor} />
        </CalendarChromeButton>
      </View>

      <AnimatePresence key={animationKey}>
        <View {...animation} transition={knobProps.transition} flexDirection="row" flexWrap="wrap" width={px * 7}>
          {years.map((year) => {
            const isSelected = year === selectedYear;
            return (
              <View
                key={year}
                {...box}
                width={cellW}
                maxWidth={cellW}
                minWidth={cellW}
                height={px}
                minHeight={px}
                maxHeight={px}
                role="button"
                aria-pressed={isSelected || undefined}
                cursor="pointer"
                alignItems="center"
                justifyContent="center"
                theme={isSelected ? ('accent' as any) : undefined}
                backgroundColor={isSelected ? '$background' : 'transparent'}
                onPress={() => {
                  onSelectYear(year);
                }}
                outlineWidth={0}
                focusStyle={{ outlineWidth: 0 }}
                focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
                data-nested-px={px}
                {...(!isWeb ? { hitSlop } : {})}
                {...(isWeb
                  ? {
                      tabIndex: 0,
                      onKeyDown: calendarKeyHandler(() => {
                        onSelectYear(year);
                      }) as unknown as () => void,
                    }
                  : { accessible: true })}>
                <Text
                  {...knobProps.label}
                  color={isSelected ? '$color' : formCommonColors.text}
                  fontWeight={isSelected ? 'bold' : '400'}>
                  {year}
                </Text>
              </View>
            );
          })}
        </View>
      </AnimatePresence>
    </View>
  );
}

// ---------------------------------------------------------------------------
// DatePickerInputTrigger — compound input with calendar/clear icon
// ---------------------------------------------------------------------------

interface DatePickerInputTriggerProps {
  value: string;
  placeholder: string;
  disabled?: boolean;
  open?: boolean;
  onReset: () => void;
  onButtonPress: () => void;
  error?: boolean;
  id?: string;
  /** Empty-state glyph. Datetime uses calendar; TimePicker uses clock. */
  glyph?: 'calendar' | 'clock';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
}

export function DatePickerClearButton({
  onReset,
  disabled,
  label,
}: {
  onReset: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <InputParts.Button
      {...floatingPanelActionProps}
      data-testid="date-picker-clear"
      aria-label={label ?? t('Clear date')}
      disabled={disabled}
      onPress={(e) => {
        e.stopPropagation();
        onReset();
      }}>
      <InputParts.Icon>
        <XIcon />
      </InputParts.Icon>
    </InputParts.Button>
  );
}

export function DatePickerInputTrigger({
  value,
  onButtonPress,
  onReset,
  disabled,
  placeholder,
  error,
  id,
  open,
  glyph = 'calendar',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
}: DatePickerInputTriggerProps) {
  const handleTriggerKey = (e: PanelActionEvent & { key?: string; code?: string; preventDefault?: () => void }) => {
    if (disabled || isNestedPanelAction(e)) {
      return;
    }
    const key = e.key;
    if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || e.code === 'Space') {
      e.preventDefault?.();
      onButtonPress();
      return;
    }
    if ((key === 'Backspace' || key === 'Delete') && value) {
      e.preventDefault?.();
      onReset();
    }
  };

  const Glyph = glyph === 'clock' ? ClockIcon : CalendarBlankIcon;

  return (
    // The disabled Box below is pointerEvents-none, so the cursor
    // affordance must ride this wrapper — the fragment's not-allowed never
    // reaches the pointer otherwise (the wrapper kept advertising
    // "pointer" on a disabled field).
    <View
      flexDirection="row"
      alignItems="center"
      width="100%"
      cursor={disabled ? 'not-allowed' : 'pointer'}
      // Native parents own the tap; expanded field paint must not consume it.
      pointerEvents={isWeb ? undefined : 'none'}>
      <InputParts.Box
        theme={error ? 'error' : undefined}
        // Yoga has no intrinsic TextInput width to size this row child.
        {...(isWeb ? undefined : { flex: 1, minWidth: 0 })}
        // Elevation is an overlay recipe: it belongs on the open panel, never
        // on the closed text-field trigger.
        elevation={undefined}
        data-testid="date-picker-trigger"
        id={id}
        onPress={isWeb && !disabled ? onButtonPress : undefined}
        {...(disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined)}
        {...(isWeb
          ? {
              role: 'combobox' as const,
              'aria-haspopup': 'dialog',
              'aria-expanded': !!open,
              'aria-label': ariaLabel,
              'aria-labelledby': ariaLabelledBy,
              'aria-describedby': ariaDescribedBy,
              'aria-required': ariaRequired,
              'aria-invalid': ariaInvalid,
              tabIndex: disabled ? -1 : 0,
              onKeyDown: handleTriggerKey as unknown as () => void,
            }
          : undefined)}>
        <InputParts.Section data-testid="date-picker-glyph">
          <InputParts.Icon adornment="leading" color={formCommonColors.muted}>
            <Glyph />
          </InputParts.Icon>
        </InputParts.Section>
        <InputParts.Section>
          <InputParts.Area
            readOnly
            pointerEvents="none"
            tabIndex={-1}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            color={formCommonColors.text}
            placeholderTextColor={formCommonColors.muted}
          />
        </InputParts.Section>
        {value && isWeb ? (
          <InputParts.Section>
            <DatePickerClearButton onReset={onReset} disabled={disabled} />
          </InputParts.Section>
        ) : null}
      </InputParts.Box>
    </View>
  );
}

// ---------------------------------------------------------------------------
// DatePickerPopoverShell — FloatingPanel (sheet below OVERLAY_BREAKPOINT)
// ---------------------------------------------------------------------------

interface DatePickerPopoverShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  triggerEnd?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  popoverRef?: RefObject<any>;
  /** Native trigger announcement (name / current value / hint) — see FloatingPanel. */
  triggerA11y?: { label?: string; value?: string; hint?: string };
  /** When set, native hosts render Clear outside the pointerEvents-none trigger. */
  clearValue?: string;
  onClear?: () => void;
}

export function DatePickerPopoverShell({
  open,
  onOpenChange,
  trigger,
  triggerEnd,
  children,
  disabled,
  triggerA11y,
  clearValue,
  onClear,
}: DatePickerPopoverShellProps) {
  const nativeClear =
    !isWeb && clearValue && onClear ? <DatePickerClearButton onReset={onClear} disabled={disabled} /> : undefined;
  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      triggerEnd={triggerEnd ?? nativeClear}
      disabled={disabled}
      sizing="grow"
      contentPadding="none"
      compact
      widthMode="fit-content"
      triggerA11y={triggerA11y}>
      {children}
    </FloatingPanel>
  );
}

// ---------------------------------------------------------------------------
// CalendarViewSwitcher — orchestrates day/month/year view modes
// ---------------------------------------------------------------------------

interface CalendarViewSwitcherProps {
  calendarData: CalendarData;
  displayDate: Date;
  onSetDisplayDate: (date: Date) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  yearPageStart: number;
  setYearPageStart: (fn: (s: number) => number) => void;
  children: ReactNode;
}

export function CalendarViewSwitcher({
  calendarData,
  displayDate,
  onSetDisplayDate,
  viewMode,
  setViewMode,
  yearPageStart,
  setYearPageStart,
  children,
}: CalendarViewSwitcherProps) {
  const { knobProps } = useCalendarKnobs();
  const handleSelectMonth = useCallback(
    (month: number) => {
      const newDate = new Date(displayDate);
      newDate.setDate(1);
      newDate.setMonth(month);
      onSetDisplayDate(newDate);
      setViewMode('day');
    },
    [displayDate, onSetDisplayDate, setViewMode],
  );

  const handleSelectYear = useCallback(
    (year: number) => {
      const newDate = new Date(displayDate);
      newDate.setDate(1);
      newDate.setFullYear(year);
      onSetDisplayDate(newDate);
      setViewMode('month');
    },
    [displayDate, onSetDisplayDate, setViewMode],
  );

  if (viewMode === 'month') {
    return (
      <CalendarPanelFrame>
        <Text alignSelf="center" {...knobProps.label} {...knobProps.textWeight}>
          Select a month
        </Text>
        <MonthGrid
          currentYear={calendarData.year}
          selectedMonth={calendarData.month}
          onSelectMonth={handleSelectMonth}
        />
      </CalendarPanelFrame>
    );
  }

  if (viewMode === 'year') {
    return (
      <CalendarPanelFrame>
        <YearGrid
          yearPageStart={yearPageStart}
          selectedYear={calendarData.year}
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

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// formatDateDisplay — shared date formatting
// ---------------------------------------------------------------------------

/**
 * Picker display value in the house absolute register:
 * "Jan 15, 2024" — same voice as table date cells and Timeline, with the
 * year always shown because an editing surface is a precision context.
 */
export function formatDateDisplay(date: Date | null): string {
  if (!date) {
    return '';
  }
  return formatAbsoluteDate(date, { year: 'always' });
}

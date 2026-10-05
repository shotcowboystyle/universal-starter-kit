import { useCallback, useMemo, useState } from 'react';
import { Separator, Text, View, XStack, YStack, useMedia } from 'tamagui';

import { formCommonColors, formInputColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';

import {
  CalendarDays,
  CalendarHeader,
  CalendarPanelFrame,
  CalendarViewSwitcher,
  isSameDay,
  useCalendarData,
  useCalendarKnobs,
  useDateNavigation,
  yearPageSize,
} from './parts';
import type { CalendarData, ViewMode } from './parts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarMode = 'single' | 'multiple' | 'range';

export interface CalendarProps {
  /** Which selection mode to use. Defaults to "range". */
  mode?: CalendarMode;
  /** Show tabs to switch between modes. Defaults to true. */
  showTabs?: boolean;
  /** Currently selected dates (controlled). */
  selectedDates?: Date[];
  /** Called when dates change. */
  onDatesChange?: (dates: Date[]) => void;
  /** Min selectable date. */
  minDate?: Date;
  /** Max selectable date. */
  maxDate?: Date;
  /** Max number of dates in "multiple" mode. Defaults to 10. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Range status helpers
// ---------------------------------------------------------------------------

type RangeStatus = 'none' | 'range-start' | 'range-end' | 'in-range' | 'selected-single';

function getRangeStatus(day: Date, dates: Date[]): RangeStatus {
  if (dates.length === 0) {
    return 'none';
  }
  if (dates.length === 1 && isSameDay(day, dates[0])) {
    return 'selected-single';
  }
  if (dates.length < 2) {
    return 'none';
  }

  const [start, end] = dates[0] < dates[1] ? [dates[0], dates[1]] : [dates[1], dates[0]];
  if (isSameDay(day, start)) {
    return 'range-start';
  }
  if (isSameDay(day, end)) {
    return 'range-end';
  }
  if (day > start && day < end) {
    return 'in-range';
  }
  return 'none';
}

// ---------------------------------------------------------------------------
// CalendarDayGrid — unified day grid supporting all modes
// ---------------------------------------------------------------------------

interface CalendarDayGridProps {
  calendarData: CalendarData;
  selectedDates: Date[];
  onDayPress: (date: Date) => void;
  mode: CalendarMode;
  minDate?: Date;
  maxDate?: Date;
  selectionCapped?: boolean;
}

function CalendarDayGrid({
  calendarData,
  selectedDates,
  onDayPress,
  mode,
  minDate,
  maxDate,
  selectionCapped,
}: CalendarDayGridProps) {
  const { knobProps } = useCalendarKnobs();
  return (
    <CalendarDays
      calendarData={calendarData}
      minDate={minDate}
      maxDate={maxDate}
      selectionCapped={selectionCapped}
      skipEmptyWeeks
      isSelected={(day) => {
        if (mode === 'range') {
          const status = getRangeStatus(day, selectedDates);
          return status === 'range-start' || status === 'range-end' || status === 'selected-single';
        }
        return selectedDates.some((date) => isSameDay(date, day));
      }}
      onSelect={onDayPress}
      selectedBackground={formInputColors.background.focus}
      onToday={() => {
        onDayPress(new Date());
      }}
      rangeStripe={
        mode === 'range'
          ? (day) => {
              const rangeStatus = getRangeStatus(day, selectedDates);
              if (rangeStatus !== 'in-range' && rangeStatus !== 'range-start' && rangeStatus !== 'range-end') {
                return null;
              }
              return (
                <View
                  transition={knobProps.transition}
                  position="absolute"
                  height="100%"
                  zIndex={0}
                  backgroundColor={formInputColors.background.focus}
                  enterStyle={{ opacity: 0 }}
                  exitStyle={{ opacity: 0 }}
                  opacity={1}
                  {...(rangeStatus === 'range-start'
                    ? { insetInlineStart: '50%', insetInlineEnd: 0, width: '50%' }
                    : rangeStatus === 'range-end'
                      ? { insetInlineStart: 0, insetInlineEnd: '50%', width: '50%' }
                      : { insetInlineStart: 0, insetInlineEnd: 0, width: '100%' })}
                />
              );
            }
          : undefined
      }
    />
  );
}

// ---------------------------------------------------------------------------
// CalendarPanel — one month panel with header + grid
// ---------------------------------------------------------------------------

interface CalendarPanelProps {
  displayDate: Date;
  selectedDates: Date[];
  onDayPress: (date: Date) => void;
  onNavigateMonth: (months: number) => void;
  onSetDisplayDate: (date: Date) => void;
  mode: CalendarMode;
  minDate?: Date;
  maxDate?: Date;
  selectionCapped?: boolean;
  showPrev?: boolean;
  showNext?: boolean;
}

function CalendarPanel({
  displayDate,
  selectedDates,
  onDayPress,
  onNavigateMonth,
  onSetDisplayDate,
  mode,
  minDate,
  maxDate,
  selectionCapped,
  showPrev = true,
  showNext = true,
}: CalendarPanelProps) {
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
        <CalendarDayGrid
          calendarData={calendarData}
          selectedDates={selectedDates}
          onDayPress={onDayPress}
          mode={mode}
          minDate={minDate}
          maxDate={maxDate}
          selectionCapped={selectionCapped}
        />
      </CalendarPanelFrame>
    </CalendarViewSwitcher>
  );
}

// ---------------------------------------------------------------------------
// Calendar — inline calendar with optional mode tabs
// ---------------------------------------------------------------------------

export function Calendar({
  mode: modeProp,
  showTabs = true,
  selectedDates: controlledDates,
  onDatesChange,
  minDate,
  maxDate,
  limit = 10,
}: CalendarProps) {
  const { knobProps } = useCalendarKnobs();
  const { px } = knobProps.nestedControl;
  const [internalMode, setInternalMode] = useState<CalendarMode>(modeProp ?? 'range');
  const mode = modeProp ?? internalMode;

  const [internalDates, setInternalDates] = useState<Date[]>([]);
  const selectedDates = controlledDates ?? internalDates;
  const setSelectedDates = useCallback(
    (dates: Date[]) => {
      if (!controlledDates) {
        setInternalDates(dates);
      }
      onDatesChange?.(dates);
    },
    [controlledDates, onDatesChange],
  );

  const { displayDate, setDisplayDate, navigateMonth } = useDateNavigation();
  const selectionCapped = mode === 'multiple' && selectedDates.length >= limit;
  // v5 `sm` = minWidth 640 (`gtSm` died with the v5 media map).
  const { sm: fullWidthMode } = useMedia();

  const handleModeChange = useCallback(
    (value: string) => {
      if (value === 'single' || value === 'multiple' || value === 'range') {
        setInternalMode(value);
        setSelectedDates([]);
      }
    },
    [setSelectedDates],
  );

  const handleDayPress = useCallback(
    (date: Date) => {
      if (minDate && date < minDate) {
        return;
      }
      if (maxDate && date > maxDate) {
        return;
      }

      switch (mode) {
        case 'single':
          setSelectedDates([date]);
          break;

        case 'multiple': {
          const existing = selectedDates.findIndex((d) => isSameDay(d, date));
          if (existing >= 0) {
            setSelectedDates(selectedDates.filter((_, i) => i !== existing));
          } else if (selectedDates.length < limit) {
            setSelectedDates([...selectedDates, date].sort((a, b) => a.getTime() - b.getTime()));
          }
          break;
        }

        case 'range': {
          if (selectedDates.length === 0 || selectedDates.length === 2) {
            setSelectedDates([date]);
          } else if (selectedDates.length === 1) {
            if (isSameDay(date, selectedDates[0])) {
              setSelectedDates([]);
            } else {
              const pair = date < selectedDates[0] ? [date, selectedDates[0]] : [selectedDates[0], date];
              setSelectedDates(pair);
            }
          }
          break;
        }
      }
    },
    [mode, selectedDates, setSelectedDates, minDate, maxDate, limit],
  );

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

  const prevMonthDate = useMemo(() => {
    const date = new Date(displayDate);
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    return date;
  }, [displayDate]);

  return (
    <YStack {...knobProps.gap}>
      {showTabs && (
        <XStack
          alignSelf="center"
          width={px * 7}
          {...knobProps.borderRadius}
          borderWidth={knobProps.borderRadius.borderWidth || 1}
          borderColor={formCommonColors.divider}
          backgroundColor="$backgroundStrong"
          padding={2}>
          {(['range', 'single', 'multiple'] as const).map((m) => (
            <View
              key={m}
              flex={1}
              height={px}
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              theme={mode === m ? ('accent' as any) : undefined}
              backgroundColor={mode === m ? '$background' : 'transparent'}
              onPress={() => {
                handleModeChange(m);
              }}
              data-nested-px={px}>
              <Text {...knobProps.label} {...knobProps.textWeight} fontWeight={mode === m ? '600' : '400'}>
                {m === 'range' ? t('Range') : m === 'single' ? t('Single') : t('Multiple')}
              </Text>
            </View>
          ))}
        </XStack>
      )}

      <View
        backgroundColor="$background"
        flexDirection="row"
        {...knobProps.gap}
        {...knobProps.panelPadding}
        {...knobProps.borderRadiusNested}
        borderWidth={knobProps.borderRadius.borderWidth || 1}
        borderColor={formCommonColors.divider}>
        {!fullWidthMode && (
          <CalendarPanel
            displayDate={displayDate}
            selectedDates={selectedDates}
            onDayPress={handleDayPress}
            onNavigateMonth={handleNavigate}
            onSetDisplayDate={setDisplayDate}
            mode={mode}
            minDate={minDate}
            maxDate={maxDate}
            selectionCapped={selectionCapped}
          />
        )}

        {fullWidthMode && (
          <>
            <CalendarPanel
              displayDate={prevMonthDate}
              selectedDates={selectedDates}
              onDayPress={handleDayPress}
              onNavigateMonth={handleNavigate}
              onSetDisplayDate={handleSetDisplayForPrev}
              mode={mode}
              minDate={minDate}
              maxDate={maxDate}
              selectionCapped={selectionCapped}
              showNext={false}
            />
            <Separator vertical />
            <CalendarPanel
              displayDate={displayDate}
              selectedDates={selectedDates}
              onDayPress={handleDayPress}
              onNavigateMonth={handleNavigate}
              onSetDisplayDate={setDisplayDate}
              mode={mode}
              minDate={minDate}
              maxDate={maxDate}
              selectionCapped={selectionCapped}
              showPrev={false}
            />
          </>
        )}
      </View>
    </YStack>
  );
}

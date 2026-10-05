import { useResolvedKnobs } from '@repo/theme';
import { useCallback, useMemo } from 'react';
import { View } from 'tamagui';

import { Wheel, type WheelHighlightEdges } from '../Wheel';

import { t } from './t';

export type TimeFormat = '12h' | '24h';

export function generateRange(min: number, max: number, step = 1): number[] {
  const result: number[] = [];
  const size = Math.max(1, step);
  for (let i = min; i <= max; i += size) {
    result.push(i);
  }
  return result;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function to12Hour(h24: number): { h: number; period: 'AM' | 'PM' } {
  return {
    h: h24 % 12 === 0 ? 12 : h24 % 12,
    period: h24 >= 12 ? 'PM' : 'AM',
  };
}

function to24Hour(displayH: number, period: 'AM' | 'PM'): number {
  const wrapped = ((displayH - 1) % 12) + 1;
  if (period === 'AM') {
    return wrapped === 12 ? 0 : wrapped;
  }
  return wrapped === 12 ? 12 : wrapped + 12;
}

const hours24 = generateRange(0, 23);
const hours12 = generateRange(1, 12);
const secondsAll = generateRange(0, 59);
const periods = ['AM', 'PM'] as const;

function columnEdge(index: number, count: number): WheelHighlightEdges {
  if (count <= 1) {
    return 'all';
  }
  if (index === 0) {
    return 'start';
  }
  if (index === count - 1) {
    return 'end';
  }
  return 'none';
}

export interface TimeWheelsProps {
  hour24: number;
  minute: number;
  second: number;
  timeFormat: TimeFormat;
  minuteStep: number;
  showSeconds: boolean;
  onChange: (hour24: number, minute: number, second: number) => void;
}

/**
 * iOS UIPickerView-style hour / minute / (second) / AM-PM columns.
 * Hours and minutes loop; AM/PM does not.
 */
export function TimeWheels({ hour24, minute, second, timeFormat, minuteStep, showSeconds, onChange }: TimeWheelsProps) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const itemHeight = knobProps.nestedControl.px;
  const minutes = useMemo(() => generateRange(0, 59, minuteStep), [minuteStep]);
  const { h: hour12, period } = to12Hour(hour24);
  const showPeriod = timeFormat === '12h';
  const columnCount = 2 + (showSeconds ? 1 : 0) + (showPeriod ? 1 : 0);

  const emit = useCallback(
    (h: number, m: number, s: number) => {
      onChange(h, m, s);
    },
    [onChange],
  );

  let col = 0;
  const hourEdge = columnEdge(col++, columnCount);
  const minuteEdge = columnEdge(col++, columnCount);
  const secondEdge = showSeconds ? columnEdge(col++, columnCount) : 'none';
  const periodEdge = showPeriod ? columnEdge(col++, columnCount) : 'none';

  return (
    <View
      flexDirection="row"
      width="100%"
      alignItems="stretch"
      justifyContent="center"
      data-testid="time-picker-wheels">
      <Wheel
        items={
          timeFormat === '24h'
            ? hours24.map((h) => ({ value: h, label: pad2(h) }))
            : hours12.map((h) => ({ value: h, label: String(h) }))
        }
        value={timeFormat === '24h' ? hour24 : hour12}
        onChange={(next) => {
          emit(timeFormat === '24h' ? next : to24Hour(next, period), minute, second);
        }}
        loop
        visibleItems={5}
        itemHeight={itemHeight}
        flex={1}
        highlightEdges={hourEdge}
        aria-label={t('Hour')}
      />
      <Wheel
        items={minutes.map((m) => ({ value: m, label: pad2(m) }))}
        value={minutes.includes(minute) ? minute : (minutes[0] ?? 0)}
        onChange={(next) => {
          emit(hour24, next, second);
        }}
        loop
        visibleItems={5}
        itemHeight={itemHeight}
        flex={1}
        highlightEdges={minuteEdge}
        aria-label={t('Min')}
      />
      {showSeconds ? (
        <Wheel
          items={secondsAll.map((s) => ({ value: s, label: pad2(s) }))}
          value={second}
          onChange={(next) => {
            emit(hour24, minute, next);
          }}
          loop
          visibleItems={5}
          itemHeight={itemHeight}
          flex={1}
          highlightEdges={secondEdge}
          aria-label={t('Sec')}
        />
      ) : null}
      {showPeriod ? (
        <Wheel
          items={periods.map((p) => ({ value: p, label: p }))}
          value={period}
          onChange={(next) => {
            emit(to24Hour(hour12, next), minute, second);
          }}
          loop={false}
          visibleItems={5}
          itemHeight={itemHeight}
          flex={1}
          highlightEdges={periodEdge}
          aria-label={t('AM/PM')}
        />
      ) : null}
    </View>
  );
}

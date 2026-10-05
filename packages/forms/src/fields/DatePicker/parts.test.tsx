import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CalendarViewSwitcher, useCalendarData, useDateNavigation, type ViewMode } from './parts';

function MonthCursor({ initial, view }: { initial: Date; view: ViewMode }) {
  const [date, setDate] = useState(initial);
  const [viewMode, setViewMode] = useState(view);
  const [yearPageStart, setYearPageStart] = useState(2020);
  const calendarData = useCalendarData(date);
  return (
    <>
      <output data-testid="display-month">{`${date.getFullYear()}-${date.getMonth() + 1}`}</output>
      <CalendarViewSwitcher
        calendarData={calendarData}
        displayDate={date}
        onSetDisplayDate={setDate}
        viewMode={viewMode}
        setViewMode={setViewMode}
        yearPageStart={yearPageStart}
        setYearPageStart={setYearPageStart}>
        <span>Day view</span>
      </CalendarViewSwitcher>
    </>
  );
}

describe('calendar display-month navigation', () => {
  it.each([
    ['next', 3],
    ['prev', 1],
  ] as const)('moves %s from March 31 without skipping a month', (direction, month) => {
    const initial = new Date(2024, 2, 31);
    const { result } = renderHook(() => useDateNavigation(initial));
    act(() => {
      result.current.navigateMonth(direction);
    });
    expect(result.current.displayDate.getFullYear()).toBe(2024);
    expect(result.current.displayDate.getMonth()).toBe(month);
    expect(initial.getDate()).toBe(31);
  });

  it('selects February from a January 31 display cursor', async () => {
    const result = renderWithProviders(<MonthCursor initial={new Date(2024, 0, 31)} view="month" />);
    await act(async () => fireEvent.click(result.getByText('Feb')));
    expect(result.getByTestId('display-month').textContent).toBe('2024-2');
  });

  it('keeps February when switching a leap-day cursor to a non-leap year', async () => {
    const result = renderWithProviders(<MonthCursor initial={new Date(2024, 1, 29)} view="year" />);
    await act(async () => fireEvent.click(result.getByText('2025')));
    expect(result.getByTestId('display-month').textContent).toBe('2025-2');
  });
});

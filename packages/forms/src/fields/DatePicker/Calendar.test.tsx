import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { Theme } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Calendar } from './Calendar';
import { CalendarDays, isSameDay, useCalendarData } from './parts';

vi.mock('@phosphor-icons/react', () => ({
  CalendarBlankIcon: () => null,
  CaretLeftIcon: () => null,
  CaretRightIcon: () => null,
  ClockIcon: () => null,
  XIcon: () => null,
}));

function getEnabledDayButtons(root: ParentNode): HTMLButtonElement[] {
  const allButtons = Array.from(root.querySelectorAll('button, [role="button"]')) as HTMLButtonElement[];
  return allButtons.filter((btn) => {
    const text = btn.textContent?.trim() ?? '';
    const isDay = /^\d{1,2}$/.test(text);
    const disabled =
      btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' || btn.hasAttribute('data-disabled');
    return isDay && !disabled;
  });
}

function getDayButtons(root: ParentNode): HTMLButtonElement[] {
  const allButtons = Array.from(root.querySelectorAll('button, [role="button"]')) as HTMLButtonElement[];
  return allButtons.filter((btn) => /^\d{1,2}$/.test(btn.textContent?.trim() ?? ''));
}

/** Tamagui emits opacity as `_o-<value>` (see StarInk.native.spec). */
function opacityOf(el: HTMLElement): number {
  const fromClass = el.className.match(/(?:^|\s)_o-([\d.]+)(?:\s|$)/);
  if (fromClass) {
    return Number(fromClass[1]);
  }
  if (el.style.opacity !== '') {
    return Number(el.style.opacity);
  }
  const computed = getComputedStyle(el).opacity;
  return computed === '' ? 1 : Number(computed);
}

function dayCell(root: ParentNode, year: number, monthIndex: number, date: number) {
  return root.querySelector(`[data-calendar-day="${year}-${monthIndex}-${date}"]`) as HTMLElement | null;
}

function JuneGrid({
  minDate,
  maxDate,
  selectionCapped,
  selected,
  onSelect,
}: {
  minDate?: Date;
  maxDate?: Date;
  selectionCapped?: boolean;
  selected?: Date[];
  onSelect?: (day: Date) => void;
}) {
  const calendarData = useCalendarData(new Date(2024, 5, 15));
  return (
    <CalendarDays
      calendarData={calendarData}
      minDate={minDate}
      maxDate={maxDate}
      selectionCapped={selectionCapped}
      isSelected={(day) => (selected ?? []).some((d) => isSameDay(d, day))}
      onSelect={onSelect ?? (() => {})}
    />
  );
}

describe('Calendar', () => {
  it('renders tabs and switches modes', async () => {
    const onDatesChange = vi.fn();
    const result = renderWithProviders(
      <Calendar showTabs onDatesChange={onDatesChange} selectedDates={[new Date(2024, 0, 1)]} />,
    );

    const singleTab = result.findTextElement('Single');
    const multipleTab = result.findTextElement('Multiple');
    expect(singleTab).toBeDefined();
    expect(multipleTab).toBeDefined();

    await act(async () => {
      if (singleTab) {
        fireEvent.click(singleTab);
      }
    });
    await act(async () => {
      if (multipleTab) {
        fireEvent.click(multipleTab);
      }
    });

    await waitFor(() => {
      expect(onDatesChange).toHaveBeenCalledWith([]);
    });
  });

  it('emits single-date selection in single mode', async () => {
    const onDatesChange = vi.fn();
    const result = renderWithProviders(<Calendar mode="single" onDatesChange={onDatesChange} />);

    await waitFor(() => {
      expect(getEnabledDayButtons(result.container).length).toBeGreaterThan(0);
    });

    const firstDay = getEnabledDayButtons(result.container)[0];
    await act(async () => {
      fireEvent.click(firstDay);
    });

    await waitFor(() => {
      const calls = onDatesChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[calls.length - 1][0]).toHaveLength(1);
    });
  });

  it('respects selection limit in multiple mode', async () => {
    const onDatesChange = vi.fn();
    const result = renderWithProviders(<Calendar mode="multiple" limit={1} onDatesChange={onDatesChange} />);

    await waitFor(() => {
      expect(getEnabledDayButtons(result.container).length).toBeGreaterThan(1);
    });

    const dayButtons = getEnabledDayButtons(result.container);
    await act(async () => {
      fireEvent.click(dayButtons[0]);
      fireEvent.click(dayButtons[1]);
    });

    await waitFor(() => {
      const calls = onDatesChange.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[calls.length - 1][0]).toHaveLength(1);
    });
  });

  it('day cells paint nestedControl size, not the page press floor', () => {
    // Compact steps space only. Default medium is nestedControlPxMap.medium = 32.
    const result = renderWithProviders(
      <Calendar showTabs={false} mode="single" selectedDates={[new Date(2024, 0, 15)]} />,
    );
    const days = getEnabledDayButtons(result.container);
    expect(days.length).toBeGreaterThan(0);
    expect(days[0].getAttribute('data-nested-px')).toBe('32');
    expect(days.every((day) => day.getAttribute('data-nested-px') === '32')).toBe(true);
  });

  // Platform prop boundary: the calendar nav Buttons
  // (CalendarHeader / YearGrid in parts.tsx) previously passed `scaleIcon`,
  // which is not a forms-Button variant — it leaked to the DOM and fired
  // React's unknown-prop console.error on every calendar open, while never
  // sizing any icon. Render → zero leak-class console errors.
  it('renders without leaking non-DOM props (scaleIcon class)', async () => {
    const LEAK = /does not recognize the `.+` prop on a DOM element|non-boolean attribute|Invalid DOM property/i;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = renderWithProviders(<Calendar mode="single" onDatesChange={vi.fn()} />);
      await waitFor(() => {
        expect(getEnabledDayButtons(result.container).length).toBeGreaterThan(0);
      });
      const leaks = errorSpy.mock.calls
        .map((args) => args.map(String).join(' '))
        .filter((message) => LEAK.test(message));
      expect(leaks).toEqual([]);
      expect(result.container.querySelector('[scaleicon]')).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

// Out-of-range / cap must look unavailable. Bento paints aria-disabled
// cells identical to choosable ones; we do not adopt that. Adjacent-month
// dim is 0.45 (parts.tsx day-cell idiom); unavailable dim is 0.5 (Today
// button + disabled trigger Box in the same file). No 'N of N' footer —
// the floating family has no count idiom.
describe('Calendar day-cell unavailable treatment', () => {
  const minDate = new Date(2024, 5, 5);
  const maxDate = new Date(2024, 6, 31);

  (['light', 'dark'] as const).forEach((scheme) => {
    it(`out-of-range current-month day is aria-disabled and dimmed (${scheme})`, () => {
      const onSelect = vi.fn();
      const result = renderWithProviders(
        <Theme name={scheme}>
          <JuneGrid minDate={minDate} maxDate={maxDate} onSelect={onSelect} />
        </Theme>,
      );

      const outOfRange = dayCell(result.container, 2024, 5, 3);
      const available = dayCell(result.container, 2024, 5, 15);
      expect(outOfRange).toBeTruthy();
      expect(available).toBeTruthy();
      expect(outOfRange?.getAttribute('aria-disabled')).toBe('true');
      expect(available?.getAttribute('aria-disabled')).toBeFalsy();
      expect(opacityOf(outOfRange!)).toBe(0.5);
      expect(opacityOf(available!)).toBe(1);

      const classBefore = outOfRange!.className;
      fireEvent.mouseEnter(outOfRange!);
      fireEvent.mouseOver(outOfRange!);
      fireEvent.click(outOfRange!);
      fireEvent.keyDown(outOfRange!, { key: 'Enter' });
      fireEvent.keyDown(outOfRange!, { key: ' ' });
      expect(onSelect).not.toHaveBeenCalled();
      expect(outOfRange!.className).toBe(classBefore);
    });
  });

  it('adjacent-month dimming and out-of-range dimming are distinguishable', () => {
    const result = renderWithProviders(<JuneGrid minDate={minDate} maxDate={maxDate} />);

    const currentOutOfRange = dayCell(result.container, 2024, 5, 3);
    const adjacentInRange = dayCell(result.container, 2024, 6, 2);
    const adjacentOutOfRange = dayCell(result.container, 2024, 4, 28);
    expect(currentOutOfRange).toBeTruthy();
    expect(adjacentInRange).toBeTruthy();
    expect(adjacentOutOfRange).toBeTruthy();

    expect(currentOutOfRange?.getAttribute('aria-disabled')).toBe('true');
    expect(adjacentInRange?.getAttribute('aria-disabled')).toBeFalsy();
    expect(adjacentOutOfRange?.getAttribute('aria-disabled')).toBe('true');

    expect(opacityOf(currentOutOfRange!)).toBe(0.5);
    expect(opacityOf(adjacentInRange!)).toBe(0.45);
    expect(opacityOf(adjacentOutOfRange!)).toBe(0.5);
    expect(opacityOf(currentOutOfRange!)).not.toBe(opacityOf(adjacentInRange!));
  });

  it('at the multiple-mode limit, unselected cells change appearance', async () => {
    const onDatesChange = vi.fn();
    const result = renderWithProviders(
      <Calendar mode="multiple" limit={1} showTabs={false} onDatesChange={onDatesChange} />,
    );
    await waitFor(() => {
      expect(getEnabledDayButtons(result.container).length).toBeGreaterThan(1);
    });

    const first = getEnabledDayButtons(result.container)[0];
    await act(async () => {
      fireEvent.click(first);
    });
    await waitFor(() => {
      expect(onDatesChange.mock.calls.at(-1)?.[0]).toHaveLength(1);
    });

    const picked = onDatesChange.mock.calls.at(-1)?.[0][0] as Date;
    const pickedKey = `${picked.getFullYear()}-${picked.getMonth()}-${picked.getDate()}`;
    const unselected = getDayButtons(result.container).filter(
      (btn) => btn.getAttribute('data-calendar-day') !== pickedKey,
    );
    const selected = getDayButtons(result.container).filter(
      (btn) => btn.getAttribute('data-calendar-day') === pickedKey,
    );
    expect(unselected.length).toBeGreaterThan(0);
    expect(unselected.every((btn) => btn.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(unselected.every((btn) => opacityOf(btn) === 0.5)).toBe(true);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((btn) => btn.getAttribute('aria-disabled') !== 'true')).toBe(true);
    expect(result.container.textContent).not.toMatch(/\b\d+\s+of\s+\d+\b/);
  });

  it('draws no N-of-N footer on the calendar grid', () => {
    const result = renderWithProviders(
      <JuneGrid minDate={minDate} maxDate={maxDate} selectionCapped selected={[new Date(2024, 5, 15)]} />,
    );
    expect(result.container.textContent).not.toMatch(/\b\d+\s+of\s+\d+\b/);
  });
});

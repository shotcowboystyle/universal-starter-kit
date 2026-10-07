import { renderWithProviders } from '@repo/test-utils';
import { formatAbsoluteDate } from '@repo/theme';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTableDateFilter, applyDateFilter, resolveDateFilterRange, useDateFilter } from './index';
import type { DateFilterValue } from './index';

// Test data type
interface TestItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

// Test data
const mockData: TestItem[] = [
  {
    id: '1',
    name: 'Item 1',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-20T10:00:00.000Z',
  },
  {
    id: '2',
    name: 'Item 2',
    createdAt: '2024-01-16T10:00:00.000Z',
  },
  {
    id: '3',
    name: 'Item 3',
    createdAt: '2024-01-17T10:00:00.000Z',
  },
  {
    id: '4',
    name: 'Item 4',
    createdAt: new Date().toISOString(), // Today
  },
  {
    id: '5',
    name: 'Item 5',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
  },
];

describe(DataTableDateFilter, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with placeholder when no value is set', () => {
    renderWithProviders(<DataTableDateFilter placeholder="Select date..." />);

    expect(screen.getByText('Select date...')).toBeInTheDocument();
  });

  it('renders with display value when value is set', () => {
    const value: DateFilterValue = {
      operator: 'is',
      value: '2024-01-15T10:00:00.000Z',
    };

    renderWithProviders(<DataTableDateFilter value={value} />);

    // The trigger renders an instant through the house absolute register
    // (LC-12), which reads it in LOCAL time — so the day it names depends on
    // the ambient zone: this one is Jan 16 at UTC+14. Deriving the label from
    // the same register asserts the register was used, which is the contract;
    // a hard-coded "Jan 15, 2024" asserted the host was at a non-positive
    // offset, which is not.
    const expected = formatAbsoluteDate(value.value, { year: 'always' });
    expect(screen.getByText(`Is ${expected}`)).toBeInTheDocument();
  });

  it('shows different display formats for different operators', () => {
    const testCases = [
      { operator: 'isToday' as const, expected: 'Today' },
      { operator: 'isYesterday' as const, expected: 'Yesterday' },
      { operator: 'isThisWeek' as const, expected: 'This week' },
      { operator: 'isEmpty' as const, expected: 'Is empty' },
      { operator: 'isNotEmpty' as const, expected: 'Is not empty' },
    ];

    testCases.forEach(({ operator, expected }) => {
      const value: DateFilterValue = { operator };
      const { rerender } = renderWithProviders(<DataTableDateFilter value={value} />);

      expect(screen.getByText(expected)).toBeInTheDocument();
      rerender(<DataTableDateFilter />);
    });
  });

  it('is disabled when disabled prop is true', () => {
    renderWithProviders(<DataTableDateFilter disabled />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('DataTableDateFilter - DatePicker integration', () => {
  // Pinned clock (Wed Aug 12 2026, local): day 15/20 exist in the current
  // month, "This Week" spans Sun Aug 9 – Sat Aug 15, all inside August.
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date(2026, 7, 12, 10, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Controlled harness: round-trips value like real consumers do. */
  function ControlledFilter({
    onChangeSpy,
    initialValue,
  }: {
    onChangeSpy: (value: DateFilterValue | undefined) => void;
    initialValue?: DateFilterValue;
  }) {
    const [value, setValue] = React.useState<DateFilterValue | undefined>(initialValue);
    return (
      <DataTableDateFilter
        value={value}
        onChange={(next) => {
          setValue(next);
          onChangeSpy(next);
        }}
      />
    );
  }

  const openPanel = async (triggerText: string | RegExp = 'Filter by date...') => {
    fireEvent.click(screen.getByText(triggerText));
    await screen.findByText('Custom Range');
  };

  /** Enabled in-month day buttons inside a calendar panel. */
  const enabledDayButtons = (scope: ParentNode) =>
    ([...scope.querySelectorAll('button, [role="button"]')] as HTMLElement[]).filter((btn) => {
      const text = btn.textContent?.trim() ?? '';
      const disabled =
        btn.hasAttribute('disabled') ||
        btn.getAttribute('aria-disabled') === 'true' ||
        Object.hasOwn(btn.dataset, 'disabled');
      return /^\d{1,2}$/.test(text) && !disabled;
    });

  /**
   * Open the picker behind `placeholder` and click a day in its calendar.
   * A just-closed picker panel lingers mounted (with live handlers!) until
   * its close timer fires, so first wait until the filter's own panel is the
   * only one mounted — then the day query can safely be global (forms
   * DatePicker spec pattern). Panels portal to the page (MPO-335), so a
   * picker panel is a sibling of the filter panel, not inside it.
   */
  const panels = '[data-testid="floating-panel-viewport"]';
  const pickDay = async (placeholder: string, day: number) => {
    await waitFor(() => {
      expect(document.querySelectorAll(panels)).toHaveLength(1);
    });
    fireEvent.click(screen.getByPlaceholderText(placeholder));
    await waitFor(() => {
      expect(enabledDayButtons(document.body).length).toBeGreaterThan(0);
    });
    const button = enabledDayButtons(document.body).find((btn) => btn.textContent?.trim() === String(day));
    expect(button).toBeDefined();
    fireEvent.click(button!);
  };

  const startInput = () => screen.getByPlaceholderText('Start date');
  const endInput = () => screen.getByPlaceholderText('End date');

  it('imports DatePicker from forms and does not use manual YYYY-MM-DD text inputs', async () => {
    const mod = await import('./index');
    expect(mod.DataTableDateFilter).toBeDefined();

    // Render the component and verify no YYYY-MM-DD placeholders exist anywhere
    const { container } = renderWithProviders(<DataTableDateFilter />);

    // The old implementation had inputs with these exact placeholders.
    // They should be completely absent from the rendered output.
    const allInputs = container.querySelectorAll('input');
    for (const input of allInputs) {
      const placeholder = input.getAttribute('placeholder') ?? '';
      expect(placeholder).not.toContain('YYYY-MM-DD');
    }

    // Verify the component renders (trigger button works)
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('custom-range picks drive filter state live: start pick commits isOnOrAfter, end pick commits isBetween, rows filter, panel stays open', async () => {
    const onChange = vi.fn();
    renderWithProviders(<ControlledFilter onChangeSpy={onChange} />);
    await openPanel();

    // Pick Aug 15 in the From picker → live single-sided commit (LC-21).
    await pickDay('Start date', 15);
    const expectedStart = new Date(2026, 7, 15, 0, 0, 0, 0);
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        operator: 'isOnOrAfter',
        value: expectedStart.toISOString(),
      });
    });
    // Panel remains open while composing (stay-open ruling).
    expect(screen.getByText('Custom Range')).toBeInTheDocument();
    // Round trip: the picker input shows the committed date.
    await waitFor(() => {
      expect(startInput().value).not.toBe('');
    });

    // Pick Aug 20 in the To picker → the pair commits isBetween on day bounds.
    await pickDay('End date', 20);
    const expectedEnd = new Date(2026, 7, 20, 23, 59, 59, 999);
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        operator: 'isBetween',
        values: [expectedStart.toISOString(), expectedEnd.toISOString()],
      });
    });
    expect(screen.getByText('Custom Range')).toBeInTheDocument();

    // The committed range actually filters rows.
    const rows = [
      { id: 'in-range', createdAt: new Date(2026, 7, 16, 12, 0).toISOString() },
      { id: 'in-range-edge', createdAt: new Date(2026, 7, 20, 18, 30).toISOString() },
      { id: 'before', createdAt: new Date(2026, 6, 1).toISOString() },
      { id: 'after', createdAt: new Date(2026, 7, 25).toISOString() },
    ];
    const filtered = applyDateFilter(rows, 'createdAt', onChange.mock.calls.at(-1)?.[0]);
    expect(filtered.map((row) => row.id)).toEqual(['in-range', 'in-range-edge']);
  });

  it("preset selection populates both pickers, and a manual pick keeps the preset's start date", async () => {
    const onChange = vi.fn();
    renderWithProviders(<ControlledFilter onChangeSpy={onChange} />);
    await openPanel();

    // "This Week" (relative operator, no explicit values) → resolved window
    // Sun Aug 9 – Sat Aug 15 populates the pickers.
    fireEvent.click(screen.getByText('This Week'));
    await waitFor(() => {
      expect(startInput().value).toContain('Aug 9');
      expect(endInput().value).toContain('Aug 15');
    });
    expect(onChange).toHaveBeenLastCalledWith({
      operator: 'isThisWeek',
      value: undefined,
      values: undefined,
    });

    // Switching to custom keeps the preset's dates as the starting range:
    // picking a new end commits isBetween from the preset's week start.
    await pickDay('End date', 20);
    const weekStart = new Date(2026, 7, 9, 0, 0, 0, 0);
    const newEnd = new Date(2026, 7, 20, 23, 59, 59, 999);
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        operator: 'isBetween',
        values: [weekStart.toISOString(), newEnd.toISOString()],
      });
    });
    await waitFor(() => {
      expect(startInput().value).toContain('Aug 9');
      expect(endInput().value).toContain('Aug 20');
    });
  });

  it('Clear resets the filter and empties both pickers', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ControlledFilter
        onChangeSpy={onChange}
        initialValue={{
          operator: 'isBetween',
          values: [new Date(2026, 7, 5).toISOString(), new Date(2026, 7, 12).toISOString()],
        }}
      />,
    );
    // With an active isBetween filter the trigger shows the range label.
    await openPanel(/Aug 5, 2026/);

    // Pickers derive from the active isBetween filter.
    expect(startInput().value).toContain('Aug 5');
    expect(endInput().value).toContain('Aug 12');

    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith();
    });
    await waitFor(() => {
      expect(startInput().value).toBe('');
      expect(endInput().value).toBe('');
    });
    // Panel stays open after Clear (LC-21).
    expect(screen.getByText('Custom Range')).toBeInTheDocument();
  });
});

describe(resolveDateFilterRange, () => {
  const now = new Date(2026, 7, 12, 10, 0, 0); // Wed Aug 12 2026

  it('returns nulls for no filter and for windowless operators', () => {
    expect(resolveDateFilterRange(undefined, now)).toEqual({ start: null, end: null });
    expect(resolveDateFilterRange({ operator: 'isEmpty' }, now)).toEqual({
      start: null,
      end: null,
    });
    expect(resolveDateFilterRange({ operator: 'isNotEmpty' }, now)).toEqual({
      start: null,
      end: null,
    });
    expect(resolveDateFilterRange({ operator: 'isNot', value: now.toISOString() }, now)).toEqual({
      start: null,
      end: null,
    });
  });

  it('passes isBetween values through and maps one-sided operators to one side', () => {
    const start = new Date(2026, 7, 1);
    const end = new Date(2026, 7, 10);
    expect(
      resolveDateFilterRange({ operator: 'isBetween', values: [start.toISOString(), end.toISOString()] }, now),
    ).toEqual({ start, end });
    expect(resolveDateFilterRange({ operator: 'isOnOrAfter', value: start.toISOString() }, now)).toEqual({
      start,
      end: null,
    });
    expect(resolveDateFilterRange({ operator: 'isBefore', value: end.toISOString() }, now)).toEqual({
      start: null,
      end,
    });
  });

  it('resolves relative operators to the same windows applyDateFilter matches', () => {
    const today = resolveDateFilterRange({ operator: 'isToday' }, now);
    expect(today.start).toEqual(new Date(2026, 7, 12, 0, 0, 0, 0));
    expect(today.end).toEqual(new Date(2026, 7, 12, 23, 59, 59, 999));

    const thisWeek = resolveDateFilterRange({ operator: 'isThisWeek' }, now);
    expect(thisWeek.start).toEqual(new Date(2026, 7, 9, 0, 0, 0, 0)); // Sunday
    expect(thisWeek.end).toEqual(new Date(2026, 7, 15, 23, 59, 59, 999)); // Saturday

    const thisMonth = resolveDateFilterRange({ operator: 'isThisMonth' }, now);
    expect(thisMonth.start).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(thisMonth.end).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));

    const lastMonth = resolveDateFilterRange({ operator: 'isLastMonth' }, now);
    expect(lastMonth.start).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(lastMonth.end).toEqual(new Date(2026, 6, 31, 23, 59, 59, 999));

    // Window agreement: rows inside the resolved window match applyDateFilter.
    const rows = [
      { id: 'sun', createdAt: new Date(2026, 7, 9, 8, 0).toISOString() },
      { id: 'sat', createdAt: new Date(2026, 7, 15, 20, 0).toISOString() },
      { id: 'out', createdAt: new Date(2026, 7, 16, 0, 1).toISOString() },
    ];
    vi.setSystemTime(now);
    const matched = applyDateFilter(rows, 'createdAt', { operator: 'isThisWeek' });
    vi.useRealTimers();
    expect(matched.map((row) => row.id)).toEqual(['sun', 'sat']);
  });
});

describe(applyDateFilter, () => {
  it('returns original data when no filter is provided', () => {
    const result = applyDateFilter(mockData, 'createdAt');
    expect(result).toEqual(mockData);
  });

  it('filters by exact date match', () => {
    const filter: DateFilterValue = {
      operator: 'is',
      value: '2024-01-15T10:00:00.000Z',
    };

    const result = applyDateFilter(mockData, 'createdAt', filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by date range', () => {
    const filter: DateFilterValue = {
      operator: 'isBetween',
      values: ['2024-01-15T00:00:00.000Z', '2024-01-16T23:59:59.999Z'],
    };

    const result = applyDateFilter(mockData, 'createdAt', filter);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual(['1', '2']);
  });

  it("filters by 'isToday'", () => {
    const filter: DateFilterValue = {
      operator: 'isToday',
    };

    const result = applyDateFilter(mockData, 'createdAt', filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('4');
  });

  it("filters by 'isYesterday'", () => {
    const filter: DateFilterValue = {
      operator: 'isYesterday',
    };

    const result = applyDateFilter(mockData, 'createdAt', filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('5');
  });

  it("filters by 'isBefore'", () => {
    const filter: DateFilterValue = {
      operator: 'isBefore',
      value: '2024-01-16T00:00:00.000Z',
    };

    const result = applyDateFilter(mockData, 'createdAt', filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it("filters by 'isAfter'", () => {
    const filter: DateFilterValue = {
      operator: 'isAfter',
      value: '2024-01-16T00:00:00.000Z',
    };

    const result = applyDateFilter(mockData, 'createdAt', filter);
    expect(result).toHaveLength(4); // Items 2, 3, 4, 5 are after 2024-01-16T00:00:00.000Z
    expect(result.map((item) => item.id)).toEqual(['2', '3', '4', '5']);
  });

  it("filters by 'isThisWeek'", () => {
    // Mock today's date to be in the same week as our test data
    const mockToday = new Date('2024-01-17T10:00:00.000Z');
    vi.setSystemTime(mockToday);

    const filter: DateFilterValue = {
      operator: 'isThisWeek',
    };

    const result = applyDateFilter(mockData, 'createdAt', filter);
    expect(result).toHaveLength(3);
    expect(result.map((item) => item.id)).toEqual(['1', '2', '3']);

    vi.useRealTimers();
  });

  it("filters by 'isEmpty'", () => {
    const filter: DateFilterValue = {
      operator: 'isEmpty',
    };

    const result = applyDateFilter(mockData, 'updatedAt', filter);
    expect(result).toHaveLength(4); // Items 2, 3, 4, 5 have no updatedAt (only item 1 has updatedAt)
    expect(result.map((item) => item.id)).toEqual(['2', '3', '4', '5']);
  });

  it("filters by 'isNotEmpty'", () => {
    const filter: DateFilterValue = {
      operator: 'isNotEmpty',
    };

    const result = applyDateFilter(mockData, 'updatedAt', filter);
    expect(result).toHaveLength(1); // Only item 1 has updatedAt
    expect(result.map((item) => item.id)).toEqual(['1']);
  });

  it('returns empty array for invalid date values', () => {
    const invalidData = [{ id: '1', createdAt: 'invalid-date' }];

    const filter: DateFilterValue = {
      operator: 'is',
      value: '2024-01-15T10:00:00.000Z',
    };

    const result = applyDateFilter(invalidData, 'createdAt', filter);
    expect(result).toHaveLength(0);
  });
});

describe(useDateFilter, () => {
  const TestComponent = ({ children }: { children: (props: any) => React.ReactNode }) => {
    const filterProps = useDateFilter({
      data: mockData,
      columnKey: 'createdAt',
    });

    return <>{children(filterProps)}</>;
  };

  it('initializes with no filter', () => {
    let filterProps: any;

    renderWithProviders(
      <TestComponent>
        {(props) => {
          filterProps = props;
          return null;
        }}
      </TestComponent>,
    );

    expect(filterProps.filterValue).toBeUndefined();
    expect(filterProps.filteredData).toEqual(mockData);
    expect(filterProps.isFiltered).toBe(false);
  });

  it('applies filter when setFilterValue is called', () => {
    let filterProps: any;

    renderWithProviders(
      <TestComponent>
        {(props) => {
          filterProps = props;
          return (
            <button
              type="button"
              onClick={() =>
                props.setFilterValue({
                  operator: 'isToday',
                })
              }>
              Apply Filter
            </button>
          );
        }}
      </TestComponent>,
    );

    fireEvent.click(screen.getByText('Apply Filter'));

    expect(filterProps.filterValue).toEqual({
      operator: 'isToday',
    });
    expect(filterProps.isFiltered).toBe(true);
    expect(filterProps.filteredData).toHaveLength(1);
  });

  it('clears filter when clearFilter is called', () => {
    let filterProps: any;

    renderWithProviders(
      <TestComponent>
        {(props) => {
          filterProps = props;
          return (
            <div>
              <button
                type="button"
                onClick={() => props.setFilterValue({ operator: 'isToday' })}>
                Apply Filter
              </button>
              <button
                type="button"
                onClick={() => props.clearFilter()}>
                Clear Filter
              </button>
            </div>
          );
        }}
      </TestComponent>,
    );

    fireEvent.click(screen.getByText('Apply Filter'));
    expect(filterProps.isFiltered).toBe(true);

    fireEvent.click(screen.getByText('Clear Filter'));
    expect(filterProps.filterValue).toBeUndefined();
    expect(filterProps.isFiltered).toBe(false);
  });

  it('calls onFilterChange callback when filter changes', () => {
    const mockOnChange = vi.fn();

    const TestComponentWithCallback = ({ children }: { children: (props: any) => React.ReactNode }) => {
      const filterProps = useDateFilter({
        data: mockData,
        columnKey: 'createdAt',
        onFilterChange: mockOnChange,
      });

      return <>{children(filterProps)}</>;
    };

    renderWithProviders(
      <TestComponentWithCallback>
        {(props) => (
          <button
            type="button"
            onClick={() =>
              props.setFilterValue({
                operator: 'isToday',
              })
            }>
            Apply Filter
          </button>
        )}
      </TestComponentWithCallback>,
    );

    fireEvent.click(screen.getByText('Apply Filter'));

    expect(mockOnChange).toHaveBeenCalledWith(expect.any(Array), {
      operator: 'isToday',
    });
  });

  it('initializes with initialFilter', () => {
    const initialFilter: DateFilterValue = {
      operator: 'isYesterday',
    };

    const TestComponentWithInitial = ({ children }: { children: (props: any) => React.ReactNode }) => {
      const filterProps = useDateFilter({
        data: mockData,
        columnKey: 'createdAt',
        initialFilter,
      });

      return <>{children(filterProps)}</>;
    };

    let filterProps: any;

    renderWithProviders(
      <TestComponentWithInitial>
        {(props) => {
          filterProps = props;
          return null;
        }}
      </TestComponentWithInitial>,
    );

    expect(filterProps.filterValue).toEqual(initialFilter);
    expect(filterProps.isFiltered).toBe(true);
    expect(filterProps.filteredData).toHaveLength(1);
  });
});

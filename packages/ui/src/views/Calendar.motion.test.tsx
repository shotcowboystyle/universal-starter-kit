import { renderWithProviders } from '@repo/test-utils';
/**
 * Calendar behavior tests: time grid anatomy, honest overflow (Axiom 6),
 * keyboard day/slot focus + Enter (Axiom 12), aria-live announcements,
 * and resize handle wiring. Motion intermediates themselves are covered by
 * the Playwright probes.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Calendar } from './Calendar';
import type { CalendarEvent } from './Calendar';

const getGrid = (container: HTMLElement): HTMLElement => {
  const grid = container.querySelector<HTMLElement>('[data-calendar-body="month"]');
  expect(grid).toBeTruthy();
  return grid!;
};

describe('Calendar.motion suite', () => {
  afterEach(cleanup);

  const march10 = new Date(2026, 2, 10);

  const timedEvents: CalendarEvent[] = [
    {
      id: 'tm-1',
      title: 'Team Standup',
      start: new Date(2026, 2, 10, 9, 0),
      end: new Date(2026, 2, 10, 9, 30),
    },
    {
      id: 'tm-2',
      title: 'Design Sync',
      start: new Date(2026, 2, 10, 9, 15),
      end: new Date(2026, 2, 10, 10, 0),
    },
    {
      id: 'tm-3',
      title: 'Release day',
      start: new Date(2026, 2, 11, 0, 0),
      allDay: true,
    },
  ];

  describe('Calendar time grid', () => {
    it('renders 7 time columns, hour lines, and positioned event blocks in week view', () => {
      const { container } = renderWithProviders(
        <Calendar
          events={timedEvents}
          viewType="week"
          initialDate={march10}
          height={600}
        />,
      );
      const cols = container.querySelectorAll('[data-calendar-timecol]');
      expect(cols).toHaveLength(7);
      expect(screen.getByText('Team Standup')).toBeInTheDocument();
      expect(screen.getByText('Design Sync')).toBeInTheDocument();
      // Untimed events live in the all-day strip, not the grid.
      expect(screen.getByText('Release day')).toBeInTheDocument();
      expect(screen.getByText('All day')).toBeInTheDocument();
    });

    it('gives event blocks full accessible names (title + day + time range)', () => {
      renderWithProviders(
        <Calendar
          events={timedEvents}
          viewType="week"
          initialDate={march10}
          height={600}
        />,
      );
      const block = screen.getByLabelText(/Team Standup, Tuesday, March 10/u);
      expect(block).toBeTruthy();
      expect(block.getAttribute('aria-label')).toMatch(/9:00/u);
      expect(block.getAttribute('aria-label')).toMatch(/9:30/u);
    });

    it('renders resize handles only when onEventResize is provided', () => {
      const { container, unmount } = renderWithProviders(
        <Calendar
          events={timedEvents}
          viewType="week"
          initialDate={march10}
          onEventResize={vi.fn<NonNullable<ComponentProps<typeof Calendar>['onEventResize']>>()}
          height={600}
        />,
      );
      expect(container.querySelectorAll('[data-calendar-resize]').length).toBeGreaterThan(0);
      unmount();
      const { container: without } = renderWithProviders(
        <Calendar
          events={timedEvents}
          viewType="week"
          initialDate={march10}
          height={600}
        />,
      );
      expect(without.querySelectorAll('[data-calendar-resize]')).toHaveLength(0);
    });

    it('renders a single time column in day view', () => {
      const { container } = renderWithProviders(
        <Calendar
          events={timedEvents}
          viewType="day"
          initialDate={march10}
          height={600}
        />,
      );
      expect(container.querySelectorAll('[data-calendar-timecol]')).toHaveLength(1);
    });
  });

  describe('Calendar overflow honesty (Axiom 6)', () => {
    const overflowEvents: CalendarEvent[] = Array.from({ length: 8 }, (_, i) => ({
      id: `of-${i + 1}`,
      title: `Meeting ${i + 1}`,
      start: new Date(2026, 2, 10, 8 + i, 0),
      end: new Date(2026, 2, 10, 8 + i, 30),
    }));

    it('shows three events and an honest "+N more" count', () => {
      const { container } = renderWithProviders(
        <Calendar
          events={overflowEvents}
          viewType="month"
          initialDate={march10}
          height={600}
        />,
      );
      expect(screen.getByText('Meeting 1')).toBeInTheDocument();
      expect(screen.getByText('Meeting 3')).toBeInTheDocument();
      expect(screen.queryByText('Meeting 4')).not.toBeInTheDocument();
      const trigger = container.querySelector<HTMLElement>('[data-calendar-overflow]');
      expect(trigger?.dataset.calendarOverflow).toBe('5');
      expect(screen.getByText('+5 more')).toBeInTheDocument();
    });

    it('does not render an overflow affordance when everything fits', () => {
      const { container } = renderWithProviders(
        <Calendar
          events={overflowEvents.slice(0, 3)}
          viewType="month"
          initialDate={march10}
          height={600}
        />,
      );
      expect(container.querySelector('[data-calendar-overflow]')).toBeNull();
    });
  });

  describe('Calendar keyboard flow (Axiom 12)', () => {
    it('arrows move day focus and Enter selects the focused day', () => {
      const onDateSelect = vi.fn<NonNullable<ComponentProps<typeof Calendar>['onDateSelect']>>();
      const { container } = renderWithProviders(
        <Calendar
          events={[]}
          viewType="month"
          initialDate={march10}
          onDateSelect={onDateSelect}
          height={600}
        />,
      );
      const grid = getGrid(container);
      // First arrow anchors focus on the current date.
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
      fireEvent.keyDown(grid, { key: 'ArrowDown' });
      fireEvent.keyDown(grid, { key: 'Enter' });
      expect(onDateSelect).toHaveBeenCalledOnce();
      expect(onDateSelect.mock.calls[0][0]).toStrictEqual(new Date(2026, 2, 18));
    });

    it('marks the focused cell via aria-activedescendant and aria-selected', () => {
      const { container } = renderWithProviders(
        <Calendar
          events={[]}
          viewType="month"
          initialDate={march10}
          height={600}
        />,
      );
      const grid = getGrid(container);
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
      const active = grid.getAttribute('aria-activedescendant');
      expect(active).toBeTruthy();
      const cell = document.querySelector<HTMLElement>(`[id="${active}"]`);
      expect(cell?.dataset.calendarDay).toBe('2026-03-11');
      expect(cell?.getAttribute('aria-selected')).toBe('true');
    });

    it('navigates the period when focus crosses the visible month', () => {
      const { container } = renderWithProviders(
        <Calendar
          events={[]}
          viewType="month"
          initialDate={new Date(2026, 2, 31)}
          height={600}
        />,
      );
      const grid = getGrid(container);
      // anchor focus on Mar 31
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
      // cross into April
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
      // Title + aria-live region both announce the new period.
      expect(screen.getAllByText(/April 2026/u).length).toBeGreaterThan(0);
    });

    it('announces period changes in the aria-live region', () => {
      const { container } = renderWithProviders(
        <Calendar
          events={[]}
          viewType="month"
          initialDate={march10}
          height={600}
        />,
      );
      const live = container.querySelector('[data-calendar-live]');
      expect(live?.getAttribute('aria-live')).toBe('polite');
      // No announcement before any navigation (mount is not a jump).
      expect(live?.textContent).toBe('');
      fireEvent.click(screen.getByLabelText('Next'));
      expect(live?.textContent).toContain('April 2026');
    });

    it('moves slot focus vertically in week view', () => {
      const onDateSelect = vi.fn<NonNullable<ComponentProps<typeof Calendar>['onDateSelect']>>();
      const { container } = renderWithProviders(
        <Calendar
          events={[]}
          viewType="week"
          initialDate={march10}
          onDateSelect={onDateSelect}
          height={600}
        />,
      );
      const grid = container.querySelector<HTMLElement>('[data-calendar-body="week"]')!;
      // anchor focus (9:00 default)
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
      // 9:30
      fireEvent.keyDown(grid, { key: 'ArrowDown' });
      fireEvent.keyDown(grid, { key: 'Enter' });
      expect(onDateSelect).toHaveBeenCalledOnce();
      expect(onDateSelect.mock.calls[0][0]).toStrictEqual(new Date(2026, 2, 10, 9, 30));
    });
  });
});

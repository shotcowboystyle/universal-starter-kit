import { renderWithProviders } from '@repo/test-utils';
// Regression tests for SB-M-306 (month nav from a day-31 date) and
// SB-M-307 (events keyed by UTC instead of local date).
// The spec pins its own TZ at runtime instead of requiring the runner to
// export TZ=Asia/Kolkata (the old skipIf meant SB-M-307 silently never ran):
// on POSIX, assigning process.env.TZ flushes Node's date cache, and vitest
// isolates spec files per worker, so the pin cannot leak into other specs.
import { cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Calendar } from './Calendar';
import type { CalendarEvent } from './Calendar';

/** The day-number text of the month cell that contains `start` (null when absent or ambiguous). */
const findDayNumber = (start: HTMLElement | null): string | null => {
  let el = start;
  for (let i = 0; i < 12 && el; i += 1) {
    const nums = [...el.querySelectorAll('span')]
      .map((s) => s.textContent?.trim() ?? '')
      .filter((t) => /^\d{1,2}$/u.test(t));
    if (nums.length > 0) {
      return nums.length === 1 ? nums[0] : null;
    }
    el = el.parentElement;
  }
  return null;
};

// After navigation the period name legitimately appears twice: the header
// title and the aria-live announcement (Axiom 12) — assert presence, not
// uniqueness (same pattern as Calendar.motion.test.tsx).
const expectPeriod = (label: string) => {
  expect(screen.getAllByText(label).length).toBeGreaterThan(0);
};

describe('Calendar.timezone suite', () => {
  const ORIGINAL_TZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Kolkata';
  });

  afterEach(cleanup);

  afterAll(() => {
    if (ORIGINAL_TZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = ORIGINAL_TZ;
    }
  });

  describe('Calendar TZ + month-boundary fixes', () => {
    it('SB-M-307: event renders in the LOCAL date cell (Asia/Kolkata)', () => {
      const events: CalendarEvent[] = [
        {
          id: '1',
          title: 'Team Standup',
          start: new Date(2026, 2, 10, 9, 0),
          color: '#3B82F6',
        },
      ];
      renderWithProviders(
        <Calendar
          events={events}
          viewType="month"
          initialDate={new Date(2026, 2, 15)}
          height={600}
        />,
      );
      const badge = screen.getByText('Team Standup');
      // walk up to the day cell and find the day-number text inside it
      expect(findDayNumber(badge.parentElement)).toBe('10');
    });

    it('SB-M-306: prev/next step months by exactly 1 from a day-31 date', () => {
      renderWithProviders(
        <Calendar
          events={[]}
          viewType="month"
          initialDate={new Date(2026, 2, 31)}
          height={600}
        />,
      );
      expectPeriod('March 2026');
      fireEvent.click(screen.getByLabelText('Previous'));
      expectPeriod('February 2026');
      fireEvent.click(screen.getByLabelText('Previous'));
      expectPeriod('January 2026');
      fireEvent.click(screen.getByLabelText('Next'));
      expectPeriod('February 2026');
      fireEvent.click(screen.getByLabelText('Next'));
      expectPeriod('March 2026');
      fireEvent.click(screen.getByLabelText('Next'));
      expect(screen.getAllByText('April 2026').length).toBeGreaterThan(0);
    });
  });
});

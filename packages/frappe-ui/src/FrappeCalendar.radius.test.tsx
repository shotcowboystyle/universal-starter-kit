// @vitest-environment jsdom

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrappeCalendar } from './FrappeCalendar';

interface EventDoc {
  name: string;
  doctype: string;
  starts_on: string;
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- records whatever props FrappeCalendar hands the mocked Calendar
const calendarProps: Record<string, unknown>[] = [];

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the Calendar stub records props and renders nothing; the real module type rejects it in a typed factory
vi.mock('@repo/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- records whatever props FrappeCalendar hands the mocked Calendar
  Calendar: (props: Record<string, unknown>) => {
    calendarProps.push(props);
    return null;
  },
}));
vi.mock(import('./FrappeProvider'), () => ({ useFrappeConfig: () => ({ baseURL: 'http://bench' }) }));
vi.mock(import('./FrappeConnectionIndicator'), () => ({ FrappeConnectionIndicator: () => null }));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the useFrappeRows stub returns a partial result; the real module type rejects it in a typed factory
vi.mock('./use-frappe-rows', () => ({
  // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an unbuilt collection is `undefined` by the hook's contract
  useFrappeRows: () => ({ rows: [], isQueryLoading: false, error: null, collection: undefined }),
}));

const frameRadius = (overrides: Partial<Knobs>) => {
  renderWithProviders(
    <Preset overrides={overrides}>
      <FrappeCalendar<EventDoc>
        doctype="Event"
        dateField="starts_on"
      />
    </Preset>,
  );
  return calendarProps.at(-1)?.borderRadius;
};

describe('FrappeCalendar frame is CONTAINER-CAP (DG-RAD-04, MPO-56)', () => {
  afterEach(() => {
    cleanup();
    calendarProps.length = 0;
  });

  it('caps full at the panel padding', () => {
    expect(frameRadius({ borderRadius: 'full', space: 'medium' })).toBe(18);
  });

  it('caps large at 13 under space small', () => {
    expect(frameRadius({ borderRadius: 'large', space: 'small' })).toBe(13);
  });

  it('keeps the token while it fits, and none is $0', () => {
    expect(frameRadius({ borderRadius: 'medium', space: 'medium' })).toBe('$4');
    expect(frameRadius({ borderRadius: 'none' })).toBe('$0');
  });
});

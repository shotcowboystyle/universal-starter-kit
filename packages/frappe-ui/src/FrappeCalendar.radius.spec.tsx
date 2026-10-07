/**
 * @vitest-environment jsdom
 */

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

const calendarProps: Record<string, unknown>[] = [];

vi.mock(import('@repo/ui'), async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/ui')>()),
  Calendar: (props: Record<string, unknown>) => {
    calendarProps.push(props);
    return null;
  },
}));
vi.mock(import('./FrappeProvider'), () => ({ useFrappeConfig: () => ({ baseURL: 'http://bench' }) }));
vi.mock(import('./FrappeConnectionIndicator'), () => ({ FrappeConnectionIndicator: () => null }));
vi.mock(import('./useFrappeRows'), () => ({
  useFrappeRows: () => ({ rows: [], isQueryLoading: false, error: null, collection: undefined }),
}));

afterEach(() => {
  cleanup();
  calendarProps.length = 0;
});

function frameRadius(overrides: Partial<Knobs>) {
  renderWithProviders(
    <Preset overrides={overrides}>
      <FrappeCalendar<EventDoc>
        doctype="Event"
        dateField="starts_on"
      />
    </Preset>,
  );
  return calendarProps.at(-1)?.borderRadius;
}

describe('FrappeCalendar frame is CONTAINER-CAP (DG-RAD-04, MPO-56)', () => {
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

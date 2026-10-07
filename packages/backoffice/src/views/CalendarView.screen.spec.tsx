import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
// The calendar view (MPO-414): a Calendar View settings doc picks the date
// axis, an event opens its form, the selector writes ?field=, and a day click
// starts a record prefilled with that day only for a session that may create
// (MPO-390).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';
import type { MemoryNavigator } from '../navigation/navigator';

import { CalendarView } from './CalendarView';

const eventMeta = {
  name: 'QaCalEvent',
  doctype: 'DocType',
  module: 'QA',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
    { fieldname: 'created_on', fieldtype: 'Date', label: 'Created On' },
    { fieldname: 'scheduled_at', fieldtype: 'Datetime', label: 'Scheduled At' },
    { fieldname: 'wrap_up_at', fieldtype: 'Datetime', label: 'Wrap Up At' },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

const multiMeta = {
  name: 'QaCalMulti',
  doctype: 'DocType',
  module: 'QA',
  title_field: 'title',
  fields: [
    { fieldname: 'title', fieldtype: 'Data', label: 'Title', in_list_view: 1 },
    { fieldname: 'due_date', fieldtype: 'Date', label: 'Due Date' },
    { fieldname: 'follow_up_on', fieldtype: 'Date', label: 'Follow Up On' },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

const noDateMeta = {
  name: 'QaCalNone',
  doctype: 'DocType',
  module: 'QA',
  fields: [{ fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 }],
  permissions: [{ role: 'All', read: 1 }],
};

const moveMeta = {
  name: 'Poke Move',
  doctype: 'DocType',
  title_field: 'move_name',
  fields: [
    { fieldname: 'move_name', fieldtype: 'Data', label: 'Move Name', in_list_view: 1 },
    { fieldname: 'learned_on', fieldtype: 'Date', label: 'Learned On' },
  ],
  permissions: [
    { role: 'Pokemon Editor', read: 1, write: 1, create: 1, delete: 1 },
    { role: 'Guest', read: 1 },
  ],
};

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const today = dayKey(new Date());

const events = [
  {
    name: 'QCE-001',
    doctype: 'QaCalEvent',
    subject: 'Team sync',
    created_on: '2020-01-01',
    scheduled_at: `${today} 09:00:00`,
    wrap_up_at: `${today} 10:00:00`,
  },
];

const calendarViewDoc = {
  name: 'QaCalEvent Calendar',
  doctype: 'Calendar View',
  reference_doctype: 'QaCalEvent',
  subject_field: 'subject',
  start_date_field: 'scheduled_at',
  end_date_field: 'wrap_up_at',
};

let run = 0;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderFixtureCalendar(doctype: string, dateField?: string): MemoryNavigator {
  run += 1;
  const navigation = createMemoryNavigator('/backoffice');
  renderWithProviders(
    <BackofficeProvider
      frappe={{
        baseURL: `https://calendar-view-${run}.spec.test`,
        fixtures: new InMemoryFixtureProvider({
          DocType: [eventMeta, multiMeta, noDateMeta],
          'Calendar View': [calendarViewDoc],
          QaCalEvent: events,
          QaCalMulti: [],
        }),
      }}
      navigation={navigation}>
      <CalendarView
        doctype={doctype}
        dateField={dateField}
      />
    </BackofficeProvider>,
  );
  return navigation;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function renderBenchCalendar(roles: string[]) {
  run += 1;
  let rolesAnswered = false;
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = url.pathname.replace(/^\/api\/method\//, '');
    if (method === 'frappe.auth.get_logged_user') {
      return json({ message: 'user@pokemon.test' });
    }
    if (method === 'frappe.core.doctype.user.user.get_roles') {
      rolesAnswered = true;
      return json({ message: roles });
    }
    if (method === 'frappe.desk.form.load.getdoctype') {
      return json({ docs: [moveMeta] });
    }
    if (url.pathname === `/api/resource/${encodeURIComponent('Poke Move')}`) {
      return json({
        data: [{ name: 'm1', doctype: 'Poke Move', move_name: 'tackle', learned_on: today }],
      });
    }
    return json({ data: [], message: [] });
  });
  const navigation = createMemoryNavigator('/backoffice');
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://calendar-view-bench-${run}.spec.test` }}
      navigation={navigation}>
      <CalendarView doctype="Poke Move" />
    </BackofficeProvider>,
  );
  return { navigation, rolesAnswered: () => rolesAnswered };
}

async function todayCell(): Promise<HTMLElement> {
  return await waitFor(
    () => {
      const cell = document.querySelector(`[data-calendar-day="${today}"]`);
      expect(cell).toBeTruthy();
      return cell as HTMLElement;
    },
    { timeout: 5000 },
  );
}

function draggable(title: string): boolean {
  let node: HTMLElement | null = screen.getByText(title);
  for (let depth = 0; node && depth < 6; depth += 1) {
    if (node.className.includes('_cur-grab')) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe('<CalendarView />', () => {
  it("lays events on the settings doc's axis and opens the form on press", async () => {
    const navigation = renderFixtureCalendar('QaCalEvent');
    await expect(screen.findByLabelText('Choose calendar date field', {}, { timeout: 5000 })).resolves.toHaveProperty(
      'textContent',
      'Scheduled At',
    );
    fireEvent.click(await screen.findByText('Team sync', {}, { timeout: 5000 }));
    expect(navigation.getLocation().path).toBe('/backoffice/qacalevent/QCE-001');
  });

  it('writes the picked date field into ?field=', async () => {
    const navigation = renderFixtureCalendar('QaCalMulti');
    fireEvent.click(await screen.findByLabelText('Choose calendar date field', {}, { timeout: 5000 }));
    fireEvent.click(await screen.findByText('Follow Up On', {}, { timeout: 5000 }));
    await waitFor(() => {
      expect(navigation.getLocation().params.field).toBe('follow_up_on');
    });
    expect(navigation.getLocation().path).toBe('/backoffice/qacalmulti/view/calendar');
  });

  it('starts a record prefilled with the clicked day', async () => {
    const navigation = renderFixtureCalendar('QaCalMulti');
    fireEvent.click(await todayCell());
    await waitFor(() => {
      expect(navigation.getLocation().path).toBe('/backoffice/qacalmulti/new');
    });
    const prefill = navigation.getLocation().params.d;
    expect(JSON.parse(String(prefill))).toEqual({ due_date: today });
  });

  it('offers the list back when the doctype has no date field', async () => {
    const navigation = renderFixtureCalendar('QaCalNone');
    await expect(screen.findByText('Calendar not available', {}, { timeout: 5000 })).resolves.toBeTruthy();
    fireEvent.click(screen.getByText('Back to list'));
    expect(navigation.getLocation().path).toBe('/backoffice/qacalnone');
  });

  it('lets an editor move events and start a record from a day on a live bench', async () => {
    const bench = renderBenchCalendar(['Pokemon Editor', 'Guest']);
    const cell = await todayCell();
    await screen.findByText('tackle', {}, { timeout: 5000 });
    await waitFor(
      () => {
        expect(bench.rolesAnswered()).toBe(true);
      },
      { timeout: 5000 },
    );
    await waitFor(() => {
      expect(draggable('tackle')).toBe(true);
    });
    fireEvent.click(cell);
    await waitFor(() => {
      expect(bench.navigation.getLocation().path).toBe('/backoffice/poke-move/new');
    });
  });

  it('neither moves events nor starts a record for a reader on a live bench', async () => {
    const bench = renderBenchCalendar(['Guest']);
    const cell = await todayCell();
    await screen.findByText('tackle', {}, { timeout: 5000 });
    await settle();
    expect(draggable('tackle')).toBe(false);
    fireEvent.click(cell);
    await settle(100);
    expect(bench.navigation.getLocation().path).toBe('/backoffice');
    expect(bench.rolesAnswered()).toBe(true);
  });
});

import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { resolveChartPalette } from '@repo/theme';
import { Text } from 'tamagui';

import { FrappeCalendar } from './FrappeCalendar';
import { FrappeProvider } from './FrappeProvider';
import { FrappeStoryProvider } from './frappeStoryTarget';

// hex-escape: Frappe sends column, event and series colours as hex: fixture data, not paint

export default {
  title: 'FrappeUI/FrappeCalendar',
  component: FrappeCalendar,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Calendar over useFrappeCollection / useLiveQuery. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise. Events support pointer drag-and-drop rescheduling (web only): moves persist via collection.update and then fire onEventMove(name, fromDate, toDate). Set enableEventDrag={false} to opt out.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05, closes UX-P18).
//
// Fixture-backed stories previously pointed at https://demo.frappe.cloud. The
// fixture provider serves the *collection*, but DocType meta still resolves
// over HTTP — so those stories fired a real cross-origin request the browser
// rejected with CORS, poisoning the console. MOCK_HOST keeps the same code
// path (real fetch, real meta shape) without leaving the machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappecalendar.mock.test';

function eventMetaRaw(name: string) {
  const isLeave = name === 'LeaveApplication';
  return {
    name,
    module: isLeave ? 'HR' : 'Desk',
    title_field: 'subject',
    fields: isLeave
      ? [
          { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
          { fieldname: 'from_date', fieldtype: 'Date', label: 'From Date', in_list_view: 1 },
          { fieldname: 'to_date', fieldtype: 'Date', label: 'To Date', in_list_view: 1 },
          { fieldname: 'color', fieldtype: 'Color', label: 'Color' },
        ]
      : [
          { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
          { fieldname: 'starts_on', fieldtype: 'Datetime', label: 'Starts On', in_list_view: 1 },
          { fieldname: 'ends_on', fieldtype: 'Datetime', label: 'Ends On' },
          { fieldname: 'color', fieldtype: 'Color', label: 'Color' },
          { fieldname: 'description', fieldtype: 'Small Text', label: 'Description' },
        ],
    permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as Record<string, unknown>;
  if (w.__frappeCalendarMockFetch) {
    return;
  }
  w.__frappeCalendarMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'CalEvent';
        return jsonResponse({ docs: [eventMetaRaw(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: eventMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({
          data: [
            { name: 'CalEvent', module: 'Desk' },
            { name: 'LeaveApplication', module: 'HR' },
          ],
        });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

interface CalEvent {
  name: string;
  doctype: string;
  subject: string;
  starts_on: string;
  ends_on: string;
  color: string;
  description: string;
}

const today = new Date();
// LOCAL parts, matching FrappeCalendar's own `datePart`: a `toISOString()` date
// is UTC, so east of Greenwich the fixture names yesterday for the hour after
// local midnight and no event lands on the view's "today".
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatDate = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

// Fixture doc colors come from the sanctioned categorical palette (chart
// palette precedent) instead of raw brand hexes — Frappe docs store one color
// per event, so fixtures model realistic data with sanctioned solids.
const [identity, blue, orange, green, , pink] = resolveChartPalette({
  scheme: 'light',
}).categorical;

const eventFixtures: CalEvent[] = [
  {
    name: 'EVENT-001',
    doctype: 'CalEvent',
    subject: 'Team Meeting',
    starts_on: `${formatDate(today)} 09:00:00`,
    ends_on: `${formatDate(today)} 10:00:00`,
    color: blue,
    description: 'Weekly team sync',
  },
  {
    name: 'EVENT-002',
    doctype: 'CalEvent',
    subject: 'Client Call',
    starts_on: `${formatDate(today)} 14:00:00`,
    ends_on: `${formatDate(today)} 15:00:00`,
    color: green,
    description: 'Project review with client',
  },
  {
    name: 'EVENT-003',
    doctype: 'CalEvent',
    subject: 'Training Session',
    starts_on: `${formatDate(new Date(today.getTime() + 86_400_000))} 10:00:00`,
    ends_on: `${formatDate(new Date(today.getTime() + 86_400_000))} 12:00:00`,
    color: orange,
    description: 'New employee onboarding',
  },
  {
    name: 'EVENT-004',
    doctype: 'CalEvent',
    subject: 'Product Launch',
    starts_on: `${formatDate(new Date(today.getTime() + 172_800_000))} 09:00:00`,
    ends_on: `${formatDate(new Date(today.getTime() + 172_800_000))} 18:00:00`,
    color: identity,
    description: 'Major release event',
  },
  {
    name: 'EVENT-005',
    doctype: 'CalEvent',
    subject: 'Review Meeting',
    starts_on: `${formatDate(new Date(today.getTime() + 345_600_000))} 15:00:00`,
    ends_on: `${formatDate(new Date(today.getTime() + 345_600_000))} 16:00:00`,
    color: pink,
    description: 'Quarterly review',
  },
];

export const MonthView = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ CalEvent: eventFixtures })}>
    <FrappeCalendar<CalEvent>
      doctype="CalEvent"
      dateField="starts_on"
      endDateField="ends_on"
      titleField="subject"
      descriptionField="description"
      colorField="color"
      defaultView="month"
      onEventClick={action('onEventClick')}
      onDateClick={action('onDateClick')}
      height={600}
    />
  </FrappeProvider>
);
MonthView.parameters = {
  docs: {
    description: {
      story: 'Calendar in month view showing events across multiple days.',
    },
  },
};

MonthView.storyName = 'Main';
export const WeekView = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ CalEvent: eventFixtures })}>
    <FrappeCalendar<CalEvent>
      doctype="CalEvent"
      dateField="starts_on"
      endDateField="ends_on"
      titleField="subject"
      colorField="color"
      defaultView="week"
      onEventClick={action('onEventClick')}
      onDateClick={action('onDateClick')}
      height={600}
    />
  </FrappeProvider>
);
WeekView.parameters = {
  docs: {
    description: {
      story: 'Calendar in week view for detailed scheduling.',
    },
  },
};

export const DayView = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ CalEvent: eventFixtures })}>
    <FrappeCalendar<CalEvent>
      doctype="CalEvent"
      dateField="starts_on"
      endDateField="ends_on"
      titleField="subject"
      descriptionField="description"
      colorField="color"
      defaultView="day"
      onEventClick={action('onEventClick')}
      height={600}
    />
  </FrappeProvider>
);
DayView.parameters = {
  docs: {
    description: {
      story: 'Calendar in day view showing hour-by-hour schedule.',
    },
  },
};

export const WithCustomEventRenderer = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ CalEvent: eventFixtures })}>
    <FrappeCalendar<CalEvent>
      doctype="CalEvent"
      dateField="starts_on"
      endDateField="ends_on"
      titleField="subject"
      colorField="color"
      defaultView="month"
      renderEvent={(event) => (
        <>
          <Text fontWeight="600">{event.subject}</Text>
          <Text
            fontSize="$1"
            color="$gray11">
            {event.description}
          </Text>
        </>
      )}
      onEventClick={action('onEventClick')}
      height={600}
    />
  </FrappeProvider>
);
WithCustomEventRenderer.parameters = {
  docs: {
    description: {
      story: 'Calendar with custom event rendering showing additional details.',
    },
  },
};

export const MondayFirstDay = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ CalEvent: eventFixtures })}>
    <FrappeCalendar<CalEvent>
      doctype="CalEvent"
      dateField="starts_on"
      endDateField="ends_on"
      titleField="subject"
      colorField="color"
      defaultView="month"
      firstDayOfWeek={1}
      onEventClick={action('onEventClick')}
      height={600}
    />
  </FrappeProvider>
);
MondayFirstDay.parameters = {
  docs: {
    description: {
      story: 'Calendar with Monday as the first day of the week.',
    },
  },
};

// ---------------------------------------------------------------------------
// Live bench story — real ToDo doctype (date field) over the live data path
// ---------------------------------------------------------------------------

interface LiveToDo {
  name: string;
  doctype: string;
  description: string;
  status: string;
  date: string;
}

const liveTodoEventFixtures: LiveToDo[] = [
  {
    name: 'TODO-201',
    doctype: 'ToDo',
    description: 'Fixture: sprint review',
    status: 'Open',
    date: formatDate(today),
  },
  {
    name: 'TODO-202',
    doctype: 'ToDo',
    description: 'Fixture: quarterly plan',
    status: 'Open',
    date: formatDate(new Date(today.getTime() + 2 * 86_400_000)),
  },
];

/**
 * Live calendar against the real bench: ToDo docs with a `date` render as
 * month events. External date changes re-slot events between days without a
 * reload; dragging an event chip to another day writes the new date back
 * through the client's optimistic mutation path. Fixture fallback when the
 * bench is unreachable.
 */
export const Live = () => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ ToDo: liveTodoEventFixtures })}>
    <FrappeCalendar<LiveToDo>
      doctype="ToDo"
      dateField="date"
      titleField="description"
      fields={['name', 'description', 'status', 'date']}
      defaultView="month"
      onEventClick={action('onEventClick')}
      onEventMove={action('onEventMove')}
      height={600}
    />
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'Two-way live wiring against the real bench: subscriptions re-slot events as ToDo.date changes externally (updates, creates, doc_deleted); dragging an event to another day persists the date via collection.update (optimistic, journal-backed revert on failure). Fixture fallback when the bench is down.',
    },
  },
};

// ---------------------------------------------------------------------------
// Frappe `Date` fields — date-only wire values, no time component
// ---------------------------------------------------------------------------

interface LeaveRequest {
  name: string;
  doctype: string;
  subject: string;
  from_date: string;
  to_date: string;
  color: string;
}

const dateOnlyFixtures: LeaveRequest[] = [
  {
    name: 'LEAVE-001',
    doctype: 'LeaveApplication',
    subject: 'Annual leave',
    from_date: formatDate(today),
    to_date: formatDate(new Date(today.getTime() + 2 * 86_400_000)),
    color: green,
  },
  {
    name: 'LEAVE-002',
    doctype: 'LeaveApplication',
    subject: 'Conference travel',
    from_date: formatDate(new Date(today.getTime() + 4 * 86_400_000)),
    to_date: formatDate(new Date(today.getTime() + 5 * 86_400_000)),
    color: orange,
  },
];

/**
 * Frappe `Date` fields arrive as bare "YYYY-MM-DD" — a calendar date carrying
 * no timezone, the shape every other fixture story here omits by always
 * sending a time. They parse to LOCAL midnight (`parseCalendarDate`); read as
 * UTC they render a day early in every negative-offset zone, so this is the
 * story that makes that class of regression visible.
 */
export const DateOnlyFields = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ LeaveApplication: dateOnlyFixtures })}>
    <FrappeCalendar<LeaveRequest>
      doctype="LeaveApplication"
      dateField="from_date"
      endDateField="to_date"
      titleField="subject"
      colorField="color"
      defaultView="month"
      onEventClick={action('onEventClick')}
      onDateClick={action('onDateClick')}
      height={600}
    />
  </FrappeProvider>
);
DateOnlyFields.parameters = {
  docs: {
    description: {
      story:
        "Date-only Frappe `Date` fields (no time component). The leave block starts on today's cell in every timezone — read as UTC midnight it would sit on yesterday west of Greenwich.",
    },
  },
};

// ---------------------------------------------------------------------------
// Named Frappe colors (P-15): palette references resolve to sanctioned ramps,
// literals pass through, unknown names fall back to the identity slot
// ---------------------------------------------------------------------------

const namedColorFixtures: CalEvent[] = [
  {
    name: 'NAMED-001',
    doctype: 'CalEvent',
    subject: 'Named blue',
    starts_on: `${formatDate(today)} 09:00:00`,
    ends_on: `${formatDate(today)} 10:00:00`,
    color: 'blue',
    description: 'Frappe palette reference',
  },
  {
    name: 'NAMED-002',
    doctype: 'CalEvent',
    subject: 'Named Red',
    starts_on: `${formatDate(new Date(today.getTime() + 86_400_000))} 09:00:00`,
    ends_on: `${formatDate(new Date(today.getTime() + 86_400_000))} 10:00:00`,
    color: 'Red',
    description: 'Desk-cased palette reference',
  },
  {
    name: 'NAMED-003',
    doctype: 'CalEvent',
    subject: 'Named green',
    starts_on: `${formatDate(new Date(today.getTime() + 172_800_000))} 11:00:00`,
    ends_on: `${formatDate(new Date(today.getTime() + 172_800_000))} 12:00:00`,
    color: 'green',
    description: 'Frappe palette reference',
  },
  {
    name: 'NAMED-004',
    doctype: 'CalEvent',
    subject: 'Named orange',
    starts_on: `${formatDate(new Date(today.getTime() + 259_200_000))} 14:00:00`,
    ends_on: `${formatDate(new Date(today.getTime() + 259_200_000))} 15:00:00`,
    color: 'orange',
    description: 'Frappe palette reference',
  },
  {
    name: 'NAMED-005',
    doctype: 'CalEvent',
    subject: 'Literal hex',
    starts_on: `${formatDate(new Date(today.getTime() + 345_600_000))} 09:00:00`,
    ends_on: `${formatDate(new Date(today.getTime() + 345_600_000))} 10:00:00`,
    color: '#ff0000',
    description: 'User-picked literal passes through (Axiom 11)',
  },
  {
    name: 'NAMED-006',
    doctype: 'CalEvent',
    subject: 'Unknown name',
    starts_on: `${formatDate(new Date(today.getTime() + 432_000_000))} 09:00:00`,
    ends_on: `${formatDate(new Date(today.getTime() + 432_000_000))} 10:00:00`,
    color: 'unknowncolor',
    description: 'Falls back to the identity palette slot',
  },
];

export const NamedColors = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ CalEvent: namedColorFixtures })}>
    <FrappeCalendar<CalEvent>
      doctype="CalEvent"
      dateField="starts_on"
      endDateField="ends_on"
      titleField="subject"
      colorField="color"
      defaultView="month"
      onEventClick={action('onEventClick')}
      height={600}
    />
  </FrappeProvider>
);
NamedColors.parameters = {
  docs: {
    description: {
      story:
        'Frappe named palette values ("blue", "Red") resolve through the FrappeCalendar mapping table to sanctioned scheme-aware Radix step-9 solids; hex/rgb literals pass through untouched (Axiom 11); unknown names fall back to the identity palette slot. Chip text stays luminance-computed (AA).',
    },
  },
};

export const WithEventMove = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ CalEvent: eventFixtures })}>
    <FrappeCalendar<CalEvent>
      doctype="CalEvent"
      dateField="starts_on"
      endDateField="ends_on"
      titleField="subject"
      colorField="color"
      defaultView="month"
      onEventMove={action('onEventMove')}
      onEventClick={action('onEventClick')}
      height={600}
    />
  </FrappeProvider>
);
WithEventMove.parameters = {
  docs: {
    description: {
      story:
        'Drag an event chip onto another day to reschedule it (web only). The move persists to the fixture collection via collection.update, then onEventMove fires with (eventName, fromDate, toDate).',
    },
  },
};

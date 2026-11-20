import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { resolveChartPalette } from '@repo/theme';

import { FrappeStoryProvider } from './frappe-story-target';
import { FrappeGantt } from './FrappeGantt';
import { FrappeProvider } from './FrappeProvider';

export default {
  title: 'FrappeUI/FrappeGantt',
  component: FrappeGantt,
  tags: ['!test'],
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Gantt view over useFrappeCollection / useLiveQuery. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise. Field mapping defaults to Frappe's Gantt settings (exp_start_date / exp_end_date / subject). Bars drag horizontally to reschedule (snapping to whole days): moves persist via collection.update on the date fields and then fire onItemMove(name, start, end). Set enableItemDrag={false} to opt out.",
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
// rejected with CORS. MOCK_HOST keeps the same code path (real fetch, real
// meta shape) without leaving the machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappegantt.mock.test';

const taskMetaRaw = (name: string) => ({
  name,
  module: 'Projects',
  title_field: 'subject',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
    { fieldname: 'exp_start_date', fieldtype: 'Date', label: 'Expected Start Date' },
    { fieldname: 'exp_end_date', fieldtype: 'Date', label: 'Expected End Date' },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nWorking\nCompleted',
      in_list_view: 1,
    },
    { fieldname: 'color', fieldtype: 'Color', label: 'Color' },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- any JSON-serializable mock envelope the stories answer with
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

const requestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof URL) {
    return input.toString();
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates fetch's declared `string | Request` input union
  return typeof input === 'string' ? input : input.url;
};

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  // SAFETY: the flag is an optional property this module alone sets on window
  const w = window as Window & { __frappeGanttMockFetch?: boolean };
  if (w.__frappeGanttMockFetch === true) {
    return;
  }
  w.__frappeGanttMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'Task';
        return jsonResponse({ docs: [taskMetaRaw(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: taskMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'Task', module: 'Projects' }] });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

interface ProjectTask {
  name: string;
  doctype: string;
  subject: string;
  exp_start_date: string;
  exp_end_date: string;
  status: string;
  color: string;
}

const today = new Date();
// LOCAL parts, matching FrappeGantt's own `datePart`: a `toISOString()` date is
// UTC, so east of Greenwich the fixture names yesterday for the hour after
// local midnight and every bar sits a day off the view's "today" marker.
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatDate = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const dayOffset = (days: number) => formatDate(new Date(today.getTime() + days * 86_400_000));

// Fixture doc colors come from the sanctioned categorical palette (LC-27
// precedent) instead of raw brand hexes; one doc carries a named Frappe
// palette reference to demo the mapping-table path.
const [identity, blue, orange, green] = resolveChartPalette({ scheme: 'light' }).categorical;

const taskFixtures: ProjectTask[] = [
  {
    name: 'TASK-001',
    doctype: 'Task',
    subject: 'Discovery & scoping',
    exp_start_date: dayOffset(-9),
    exp_end_date: dayOffset(-5),
    status: 'Completed',
    color: blue,
  },
  {
    name: 'TASK-002',
    doctype: 'Task',
    subject: 'Design review',
    exp_start_date: dayOffset(-4),
    exp_end_date: dayOffset(-1),
    status: 'Working',
    color: orange,
  },
  {
    name: 'TASK-003',
    doctype: 'Task',
    subject: 'Implementation',
    exp_start_date: dayOffset(-2),
    exp_end_date: dayOffset(6),
    status: 'Working',
    color: identity,
  },
  {
    name: 'TASK-004',
    doctype: 'Task',
    subject: 'QA pass',
    exp_start_date: dayOffset(4),
    exp_end_date: dayOffset(9),
    status: 'Open',
    color: 'blue',
  },
  {
    name: 'TASK-005',
    doctype: 'Task',
    subject: 'Launch',
    exp_start_date: dayOffset(12),
    exp_end_date: dayOffset(12),
    status: 'Open',
    color: green,
  },
];

export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ Task: taskFixtures })}>
    <FrappeGantt<ProjectTask>
      doctype="Task"
      colorField="color"
      onItemPress={action('onItemPress')}
      height={420}
    />
  </FrappeProvider>
);
Main.parameters = {
  docs: {
    description: {
      story:
        'Task docs render as gantt bars using the default Frappe Gantt field mapping (exp_start_date / exp_end_date / subject). Named doc colors resolve through the palette mapping table; literals pass through (Axiom 11).',
    },
  },
};

export const MonthZoom = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ Task: taskFixtures })}>
    <FrappeGantt<ProjectTask>
      doctype="Task"
      colorField="color"
      zoom="month"
      onItemPress={action('onItemPress')}
      height={420}
    />
  </FrappeProvider>
);
MonthZoom.parameters = {
  docs: {
    description: {
      story: 'Month zoom fits the whole project window in one viewport.',
    },
  },
};

export const WithItemMove = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ Task: taskFixtures })}>
    <FrappeGantt<ProjectTask>
      doctype="Task"
      colorField="color"
      onItemPress={action('onItemPress')}
      onItemMove={action('onItemMove')}
      height={420}
    />
  </FrappeProvider>
);
WithItemMove.parameters = {
  docs: {
    description: {
      story:
        'Drag a bar horizontally to reschedule it (web pointer; snaps to whole days). The move persists to the fixture collection via collection.update on exp_start_date/exp_end_date, then onItemMove fires with (docName, start, end).',
    },
  },
};

// ---------------------------------------------------------------------------
// Live bench story — real Task doctype over the live data path
// ---------------------------------------------------------------------------

const liveTaskFixtures: ProjectTask[] = [
  {
    name: 'TASK-101',
    doctype: 'Task',
    subject: 'Fixture: sprint delivery',
    exp_start_date: dayOffset(-3),
    exp_end_date: dayOffset(2),
    status: 'Working',
    color: '',
  },
  {
    name: 'TASK-102',
    doctype: 'Task',
    subject: 'Fixture: quarterly plan',
    exp_start_date: dayOffset(1),
    exp_end_date: dayOffset(8),
    status: 'Open',
    color: '',
  },
];

/**
 * Live gantt against the real bench: Task docs with expected start/end dates
 * render as bars. External date changes re-position bars without a reload;
 * dragging a bar writes the new dates back through the client's optimistic
 * mutation path. Fixture fallback when the bench is unreachable.
 */
export const Live = () => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ Task: liveTaskFixtures })}>
    <FrappeGantt<ProjectTask>
      doctype="Task"
      fields={['name', 'subject', 'status', 'exp_start_date', 'exp_end_date']}
      onItemPress={action('onItemPress')}
      onItemMove={action('onItemMove')}
      height={420}
    />
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'Two-way live wiring against the real bench: subscriptions re-position bars as Task.exp_start_date/exp_end_date change externally (updates, creates, doc_deleted); dragging a bar persists the dates via collection.update (optimistic, journal-backed revert on failure). Fixture fallback when the bench is down.',
    },
  },
};

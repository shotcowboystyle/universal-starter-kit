import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { Text, YStack } from 'tamagui';

import { FrappeStoryProvider } from './frappe-story-target';
import { FrappeKanban } from './FrappeKanban';
import type { KanbanColumn } from './FrappeKanban';
import { FrappeProvider } from './FrappeProvider';

// hex-escape: Frappe sends column, event and series colors as hex: fixture data, not paint

export default {
  title: 'FrappeUI/FrappeKanban',
  component: FrappeKanban,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Kanban over useFrappeCollection / useLiveQuery; card moves persist status via collection.update. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise.',
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
// meta shape) without leaving the machine; ERR_HOST is the deliberate
// failure host for the error-state story.
// ---------------------------------------------------------------------------

const IN_PROGRESS = 'In Progress';
const MOCK_HOST = 'https://frappekanban.mock.test';
const ERR_HOST = 'https://forbidden.frappekanban.mock.test';

const todoMetaRaw = (name: string) => ({
  name,
  module: 'Desk',
  title_field: 'description',
  fields: [
    { fieldname: 'description', fieldtype: 'Text', label: 'Description', in_list_view: 1 },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nWorking\nPending Review\nCompleted',
      in_list_view: 1,
      in_standard_filter: 1,
    },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

const bugMetaRaw = (name: string) => ({
  name,
  module: 'QA',
  title_field: 'title',
  fields: [
    { fieldname: 'title', fieldtype: 'Data', label: 'Title', in_list_view: 1 },
    {
      fieldname: 'severity',
      fieldtype: 'Select',
      label: 'Severity',
      options: 'Critical\nHigh\nMedium\nLow',
      in_list_view: 1,
    },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'New\nConfirmed\nIn Progress\nTesting\nClosed',
      in_list_view: 1,
      in_standard_filter: 1,
    },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

const metaFor = (doctype: string) => (doctype === 'Bug' ? bugMetaRaw(doctype) : todoMetaRaw(doctype));

interface MockBody {
  message?: string;
  docs?: unknown[];
  data?: unknown;
}

// Response.json sets the same `application/json` content type the hand-built Response did.
const jsonResponse = (body: MockBody, status = 200): Response => Response.json(body, { status });

const requestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return input;
};

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w: Window & { __frappeKanbanMockFetch?: boolean } = window;
  if (w.__frappeKanbanMockFetch) {
    return;
  }
  w.__frappeKanbanMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'ToDo';
        return jsonResponse({ docs: [metaFor(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: metaFor(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({
          data: [
            { name: 'ToDo', module: 'Desk' },
            { name: 'Bug', module: 'QA' },
          ],
        });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

interface ToDo {
  name: string;
  doctype: string;
  description: string;
  status: string;
}

const todoFixtures: ToDo[] = [
  { name: 'TODO-001', doctype: 'ToDo', description: 'Review documentation', status: 'Open' },
  { name: 'TODO-002', doctype: 'ToDo', description: 'Fix login bug', status: 'Open' },
  { name: 'TODO-003', doctype: 'ToDo', description: 'Update dependencies', status: 'Working' },
  { name: 'TODO-004', doctype: 'ToDo', description: 'Write unit tests', status: 'Working' },
  { name: 'TODO-005', doctype: 'ToDo', description: 'Deploy to staging', status: 'Pending Review' },
  { name: 'TODO-006', doctype: 'ToDo', description: 'Merge PR #42', status: 'Completed' },
];

const todoColumns: KanbanColumn[] = [
  { value: 'Open', title: 'To Do', color: '#6366F1' },
  { value: 'Working', title: IN_PROGRESS, color: '#F59E0B' },
  { value: 'Pending Review', title: 'Review', color: '#8B5CF6' },
  { value: 'Completed', title: 'Done', color: '#10B981' },
];

export const Default = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: todoFixtures })}>
    <FrappeKanban<ToDo>
      doctype="ToDo"
      columns={todoColumns}
      statusField="status"
      titleField="description"
      onCardClick={action('onCardClick')}
      onCardMove={action('onCardMove')}
      minColumnHeight={500}
    />
  </FrappeProvider>
);
Default.parameters = {
  docs: {
    description: {
      story: 'Basic Kanban board connected to a Frappe ToDo doctype.',
    },
  },
};

Default.storyName = 'Main';
export const WithCardCreation = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: todoFixtures })}>
    <FrappeKanban<ToDo>
      doctype="ToDo"
      columns={todoColumns}
      statusField="status"
      titleField="description"
      enableCardCreation
      onCardClick={action('onCardClick')}
      onCardMove={action('onCardMove')}
      onCreateCard={action('onCreateCard')}
      minColumnHeight={500}
    />
  </FrappeProvider>
);
WithCardCreation.parameters = {
  docs: {
    description: {
      story: 'Kanban board with add card buttons on each column.',
    },
  },
};

// ---------------------------------------------------------------------------
// oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype, not a task marker
// Live bench story — real ToDo doctype over the live data path
// ---------------------------------------------------------------------------

interface LiveToDo {
  name: string;
  doctype: string;
  description: string;
  status: string;
}

// oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype, not a task marker
// Stock ToDo status options; colors come from the tokenized palette.
const liveTodoColumns: KanbanColumn[] = [
  { value: 'Open', title: 'Open', color: '$blue9' },
  { value: 'Closed', title: 'Closed', color: '$green9' },
  { value: 'Cancelled', title: 'Cancelled', color: '$red9' },
];

const liveTodoFixtures: LiveToDo[] = [
  { name: 'TODO-101', doctype: 'ToDo', description: 'Fixture: triage inbox', status: 'Open' },
  { name: 'TODO-102', doctype: 'ToDo', description: 'Fixture: ship release', status: 'Open' },
  { name: 'TODO-103', doctype: 'ToDo', description: 'Fixture: archive notes', status: 'Closed' },
  { name: 'TODO-104', doctype: 'ToDo', description: 'Fixture: old spike', status: 'Cancelled' },
];

/* oxlint-disable sonarjs/todo-tag -- the comment names the Frappe doctype, not a task marker */
/**
 * Live board against the real bench (STORYBOOK_FRAPPE_URL, default the local
 * dev bench proxied by the Storybook dev server). Cards are driven by
 * realtime subscriptions: external creates/edits/deletes appear in place, and
 * dragging a card to another column writes the ToDo's status back through the
 * client's optimistic mutation path. Falls back to fixtures when the bench is
 * unreachable.
 */
/* oxlint-enable sonarjs/todo-tag */
export const Live = () => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ ToDo: liveTodoFixtures })}>
    <FrappeKanban<LiveToDo>
      doctype="ToDo"
      columns={liveTodoColumns}
      statusField="status"
      titleField="description"
      fields={['name', 'description', 'status']}
      onCardClick={action('onCardClick')}
      onCardMove={action('onCardMove')}
      minColumnHeight={420}
    />
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'Two-way live wiring against the real bench: subscriptions move cards between columns as ToDo.status changes externally (doc updates, creates, doc_deleted); local drag-drop persists status through collection.update (optimistic, journal-backed revert on failure). Fixture fallback when the bench is down.',
    },
  },
};

interface Bug {
  name: string;
  doctype: string;
  title: string;
  severity: string;
  status: string;
}

const bugFixtures: Bug[] = [
  {
    name: 'BUG-001',
    doctype: 'Bug',
    title: 'Login not working on Safari',
    severity: 'Critical',
    status: 'New',
  },
  {
    name: 'BUG-002',
    doctype: 'Bug',
    title: 'Page layout broken on mobile',
    severity: 'High',
    status: 'Confirmed',
  },
  {
    name: 'BUG-003',
    doctype: 'Bug',
    title: 'Dashboard loading slowly',
    severity: 'Medium',
    status: IN_PROGRESS,
  },
  {
    name: 'BUG-004',
    doctype: 'Bug',
    title: 'Email notifications delayed',
    severity: 'Low',
    status: 'Testing',
  },
  {
    name: 'BUG-005',
    doctype: 'Bug',
    title: 'Fixed typo in footer',
    severity: 'Low',
    status: 'Closed',
  },
];

const bugColumns: KanbanColumn[] = [
  { value: 'New', title: 'New', color: '#EF4444' },
  { value: 'Confirmed', title: 'Confirmed', color: '#F97316' },
  { value: IN_PROGRESS, title: IN_PROGRESS, color: '#3B82F6' },
  { value: 'Testing', title: 'Testing', color: '#8B5CF6' },
  { value: 'Closed', title: 'Closed', color: '#22C55E' },
];

export const BugTracker = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ Bug: bugFixtures })}>
    <FrappeKanban<Bug>
      doctype="Bug"
      columns={bugColumns}
      statusField="status"
      titleField="title"
      descriptionField="severity"
      onCardClick={action('onCardClick')}
      onCardMove={action('onCardMove')}
      minColumnHeight={500}
    />
  </FrappeProvider>
);
BugTracker.parameters = {
  docs: {
    description: {
      story: 'Example of a bug tracking Kanban board with different columns.',
    },
  },
};

// ---------------------------------------------------------------------------
// Honest async states (Axiom 6 / W9): loading ≠ empty ≠ error
// ---------------------------------------------------------------------------

/** Fixture provider whose list fetch never resolves — holds the real collection in loading. */
class PendingFixtureProvider extends InMemoryFixtureProvider {
  // oxlint-disable-next-line eslint/class-methods-use-this -- overrides the FixtureProvider instance method
  async getList(): Promise<never[]> {
    // oxlint-disable-next-line promise/avoid-new, eslint/no-empty-function -- a list fetch that never settles holds the collection in loading
    return await new Promise(() => {});
  }
}

/** Collection stuck syncing with an empty board: the kanban skeleton renders (LC-20 / DG-ST-02). */
export const Loading = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new PendingFixtureProvider()}>
    <FrappeKanban<ToDo>
      doctype="ToDo"
      columns={todoColumns}
      statusField="status"
      titleField="description"
      minColumnHeight={400}
    />
  </FrappeProvider>
);

/** Zero documents, no failure — configured columns render with per-column "No items" (empty ≠ error). */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: [] })}>
    <FrappeKanban<ToDo>
      doctype="ToDo"
      columns={todoColumns}
      statusField="status"
      titleField="description"
      minColumnHeight={400}
    />
  </FrappeProvider>
);

/**
 * Collection that fails with no fixtures: the `error` render prop shows
 * instead of empty board chrome (DG-ST-01 / SB-M-806 pattern). The failure
 * is served hermetically — the in-story mock answers ERR_HOST with 403.
 */
export const LoadError = () => (
  <FrappeProvider baseURL={ERR_HOST}>
    <FrappeKanban<ToDo>
      doctype="ToDo"
      columns={todoColumns}
      statusField="status"
      titleField="description"
      minColumnHeight={200}
      // oxlint-disable-next-line react/no-unstable-nested-components -- `error` is a render prop FrappeKanban calls as a function, not a component
      error={(err) => (
        <YStack
          padding="$4"
          gap="$2">
          <Text color="$red10">Board failed to load</Text>
          <Text color="$color10">{err.message}</Text>
        </YStack>
      )}
    />
  </FrappeProvider>
);

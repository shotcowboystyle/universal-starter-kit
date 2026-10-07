import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';

import { FrappeAssignment } from './FrappeAssignment';
import type { FrappeToDo } from './FrappeAssignment';
import { FrappeProvider } from './FrappeProvider';
import { FrappeStoryProvider } from './frappeStoryTarget';
import type { FrappeUserDoc } from './frappeUsers';

export default {
  title: 'FrappeUI/FrappeAssignment',
  component: FrappeAssignment,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Assignment (ToDo) management for one document: live assignee list from ToDo docs filtered by reference_type/reference_name, add via the backend-searching User combobox, complete (status Closed) and remove (status Cancelled) per row — assign_to parity over plain ToDo CRUD. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta / search_link from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05, closes UX-P18).
//
// Fixture-backed stories previously pointed at https://demo.frappe.cloud. The
// fixture provider serves the *collection*, but DocType meta and the add
// flow's search_link still resolve over HTTP — so those stories fired real
// cross-origin requests the browser rejected with CORS, poisoning the console
// for every automated probe. MOCK_HOST keeps the same code path (real fetch,
// real meta/search shape) without leaving the machine; ERR_HOST is the
// deliberate failure host for the error-state story.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappeassignment.mock.test';
const ERR_HOST = 'https://forbidden.frappeassignment.mock.test';

function assignmentMetaRaw(name: string) {
  if (name === 'User') {
    return {
      name: 'User',
      module: 'Core',
      title_field: 'full_name',
      fields: [
        { fieldname: 'full_name', fieldtype: 'Data', label: 'Full Name', in_list_view: 1 },
        { fieldname: 'user_image', fieldtype: 'Attach Image', label: 'User Image' },
      ],
      permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
    };
  }
  if (name === 'Task') {
    return {
      name: 'Task',
      module: 'Projects',
      title_field: 'subject',
      fields: [{ fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 }],
      permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
    };
  }
  return {
    name: name || 'ToDo',
    module: 'Desk',
    title_field: 'description',
    fields: [
      { fieldname: 'description', fieldtype: 'Text', label: 'Description', in_list_view: 1 },
      {
        fieldname: 'allocated_to',
        fieldtype: 'Link',
        label: 'Allocated To',
        options: 'User',
        in_list_view: 1,
      },
      { fieldname: 'assigned_by', fieldtype: 'Link', label: 'Assigned By', options: 'User' },
      {
        fieldname: 'reference_type',
        fieldtype: 'Link',
        label: 'Reference Type',
        options: 'DocType',
      },
      { fieldname: 'reference_name', fieldtype: 'Dynamic Link', label: 'Reference Name' },
      {
        fieldname: 'status',
        fieldtype: 'Select',
        label: 'Status',
        options: 'Open\nClosed\nCancelled',
        in_list_view: 1,
      },
      {
        fieldname: 'priority',
        fieldtype: 'Select',
        label: 'Priority',
        options: 'Low\nMedium\nHigh',
      },
      { fieldname: 'date', fieldtype: 'Date', label: 'Due Date' },
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

const todoFixtures: FrappeToDo[] = [
  {
    name: 'TODO-001',
    doctype: 'ToDo',
    allocated_to: 'jane@example.com',
    assigned_by: 'Administrator',
    reference_type: 'Task',
    reference_name: 'TASK-001',
    description: 'Assignment for Task TASK-001',
    status: 'Open',
    priority: 'Medium',
    creation: '2026-01-05 10:00:00',
  },
  {
    name: 'TODO-002',
    doctype: 'ToDo',
    allocated_to: 'john@example.com',
    assigned_by: 'Administrator',
    reference_type: 'Task',
    reference_name: 'TASK-001',
    description: 'Assignment for Task TASK-001',
    status: 'Open',
    priority: 'High',
    creation: '2026-01-06 11:00:00',
  },
  {
    name: 'TODO-003',
    doctype: 'ToDo',
    allocated_to: 'maria@example.com',
    assigned_by: 'jane@example.com',
    reference_type: 'Task',
    reference_name: 'TASK-001',
    description: 'Assignment for Task TASK-001',
    status: 'Closed',
    priority: 'Medium',
    creation: '2026-01-04 09:00:00',
  },
  {
    name: 'TODO-004',
    doctype: 'ToDo',
    allocated_to: 'jane@example.com',
    reference_type: 'Task',
    reference_name: 'TASK-999',
    description: 'Assignment for Task TASK-999',
    status: 'Open',
    creation: '2026-01-07 12:00:00',
  },
  {
    name: 'TODO-005',
    doctype: 'ToDo',
    allocated_to: 'ghost@example.com',
    reference_type: 'Task',
    reference_name: 'TASK-001',
    description: 'Assignment for Task TASK-001',
    status: 'Cancelled',
    creation: '2026-01-03 08:00:00',
  },
];

const userFixtures: FrappeUserDoc[] = [
  { name: 'Administrator', doctype: 'User', full_name: 'Administrator' },
  { name: 'jane@example.com', doctype: 'User', full_name: 'Jane Doe' },
  { name: 'john@example.com', doctype: 'User', full_name: 'John Smith' },
  { name: 'maria@example.com', doctype: 'User', full_name: 'Maria Garcia' },
];

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as Record<string, unknown>;
  if (w.__frappeAssignmentMockFetch) {
    return;
  }
  w.__frappeAssignmentMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'ToDo';
        return jsonResponse({ docs: [assignmentMetaRaw(doctype)] });
      }
      if (url.pathname === '/api/method/frappe.desk.search.search_link') {
        const txt = (url.searchParams.get('txt') ?? '').toLowerCase();
        const hits = userFixtures.filter(
          (user) => !txt || user.name.toLowerCase().includes(txt) || (user.full_name ?? '').toLowerCase().includes(txt),
        );
        return jsonResponse({
          message: hits.map((user) => ({
            value: user.name,
            description: user.full_name,
          })),
        });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: assignmentMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({
          data: [
            { name: 'ToDo', module: 'Desk' },
            { name: 'User', module: 'Core' },
            { name: 'Task', module: 'Projects' },
          ],
        });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const doctypeFixtures = [
  { ...assignmentMetaRaw('ToDo'), doctype: 'DocType' },
  { ...assignmentMetaRaw('User'), doctype: 'DocType' },
  { ...assignmentMetaRaw('Task'), doctype: 'DocType' },
];

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    ToDo: todoFixtures,
    User: userFixtures,
    DocType: doctypeFixtures,
  });

/**
 * Two open assignees + one completed. The cancelled ToDo (TODO-005) and the
 * other document's ToDo (TODO-004) must not render. The add flow's user
 * search is served hermetically via the in-story search_link mock; the Live
 * story exercises the real bench search.
 */
export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeAssignment
      doctype="Task"
      name="TASK-001"
      currentUser="Administrator"
      onAssign={action('onAssign')}
      onRemove={action('onRemove')}
      onComplete={action('onComplete')}
    />
  </FrappeProvider>
);
Main.storyName = 'Main';

/** Completed section hidden via showCompleted={false}. */
export const OpenOnly = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeAssignment
      doctype="Task"
      name="TASK-001"
      showCompleted={false}
    />
  </FrappeProvider>
);

/** No assignments match: the compact empty state must show. */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeAssignment
      doctype="Task"
      name="TASK-NO-ASSIGNMENTS"
    />
  </FrappeProvider>
);

/** disabled hides add and per-row mutation affordances. */
export const Disabled = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeAssignment
      doctype="Task"
      name="TASK-001"
      disabled
    />
  </FrappeProvider>
);

/** No FrappeProvider: config undefined, collection never created, empty state (no crash). */
export const WithoutProvider = () => (
  <FrappeAssignment
    doctype="Task"
    name="TASK-001"
  />
);

/** Fixture provider whose list fetch never resolves — holds the ToDo subscription in loading. */
class PendingFixtureProvider extends InMemoryFixtureProvider {
  async getList(): Promise<never[]> {
    return await new Promise(() => {});
  }
}

/**
 * ToDo subscription still syncing — skeleton chrome, never empty chrome
 * (LC-20 / DG-ST-02).
 */
export const Loading = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new PendingFixtureProvider()}>
    <FrappeAssignment
      doctype="Task"
      name="TASK-001"
    />
  </FrappeProvider>
);

/**
 * Collection that fails with no fixtures: error chrome with Retry instead of
 * masquerading as "no one assigned" (DG-ST-01 / Axiom 6). The failure is
 * served hermetically — the in-story mock answers ERR_HOST with 403.
 */
export const LoadError = () => (
  <FrappeProvider baseURL={ERR_HOST}>
    <FrappeAssignment
      doctype="Task"
      name="TASK-001"
    />
  </FrappeProvider>
);

// ---------------------------------------------------------------------------
// Live bench story — real ToDo documents over the live data path
// ---------------------------------------------------------------------------

/**
 * Live assignments against the real bench: subscribes to the ToDo doctype
 * filtered by reference_type/reference_name, so assignments made in the
 * desk (or by other agents) appear in place without a reload. The add flow
 * searches real users via `search_link` through the Storybook proxy.
 * Falls back to fixtures when the bench is down.
 */
export const Live = (args: { doctype?: string; docname?: string }) => (
  <FrappeStoryProvider fixtures={makeFixtures()}>
    <FrappeAssignment
      doctype={args.doctype ?? 'Task'}
      name={args.docname ?? 'TASK-001'}
      onAssign={action('onAssign')}
      onRemove={action('onRemove')}
      onComplete={action('onComplete')}
    />
  </FrappeStoryProvider>
);
Live.args = { doctype: '', docname: '' };
Live.argTypes = { doctype: { control: 'text' }, docname: { control: 'text' } };
Live.parameters = {
  docs: {
    description: {
      story:
        'Live assignment list over the real bench ToDo doctype: realtime list_update events insert/evict rows in place; add/complete/remove mutate real ToDos. Fixture fallback (Task/TASK-001) when the bench is down.',
    },
  },
};

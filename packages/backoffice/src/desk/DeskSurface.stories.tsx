// OWNER: backoffice screens workstream (MPO-189).
// DeskSurface stories: the target→surface switch. One arm per DeskTarget
// kind, so the whole dispatch table is visible in one place, plus the
// override registry (per-kind and per-doctype).
//
// Everything rides fixtures: doctype meta through the fixture provider's
// "DocType" collection (shared/useDoctypeMeta's fixture branch), rows and
// Workspace docs through the same InMemoryFixtureProvider. Query reports
// are the one surface with no fixture branch — they run three desk RPCs —
// so a fetch mock scoped to this story's mock host answers those and keeps
// every arm off the network.
import { Text, YStack } from '@repo/ui';
import { InMemoryFixtureProvider } from '@repo/frappe';
import { sizeRecipeEscape } from '@repo/theme';
import type { ReactNode } from 'react';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { DeskSurface, DeskSurfaceLoading } from './DeskSurface';
import type { DeskSurfaceProps } from './DeskSurface';
import type { DeskTarget } from './target';

const frameHeight = sizeRecipeEscape(560, 'story canvas: a fixed-height frame for a full-height screen to fill');

const meta = {
  title: 'Screens/Backoffice/DeskSurface',
  component: DeskSurface,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "The desk's target→surface switch: a resolved DeskTarget in, one wired screen out (home redirect, workspace page, list, alternate view, create form, document form, query report, not-found). It is pure dispatch — no fetch, no filter construction, no visual values — and the override registry lets a host replace a whole surface per kind, or per doctype under a kind.",
      },
    },
  },
};
export default meta;

const MOCK_HOST = 'https://backoffice-desk-surface.mock.test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TASK_DOCTYPE = 'QaDeskTask';

/** Getdoctype-shaped meta doc for the fixture "DocType" collection. */
const taskMeta = {
  name: TASK_DOCTYPE,
  doctype: 'DocType',
  module: 'QA',
  title_field: 'subject',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1, required: 1 },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nWorking\nDone',
      in_list_view: 1,
    },
    {
      fieldname: 'priority',
      fieldtype: 'Select',
      label: 'Priority',
      options: 'High\nMedium\nLow',
      in_list_view: 1,
    },
    { fieldname: 'owner_name', fieldtype: 'Data', label: 'Owner', in_list_view: 1 },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
};

const statuses = ['Open', 'Working', 'Done'];
const priorities = ['High', 'Medium', 'Low'];
const owners = ['ana', 'bo', 'cyrus', 'dee'];

const firstTaskName = 'QDT-0001';

const taskDocs = Array.from({ length: 12 }, (_, i) => ({
  name: `QDT-${String(i + 1).padStart(4, '0')}`,
  doctype: TASK_DOCTYPE,
  subject: `Task ${i + 1}: ${['triage inbox', 'ship release', 'write docs', 'fix flaky test'][i % 4]}`,
  status: statuses[i % statuses.length],
  priority: priorities[i % priorities.length],
  owner_name: owners[i % owners.length],
}));

const workspaceDocs = [
  {
    name: 'Tools',
    doctype: 'Workspace',
    label: 'Tools',
    title: 'Tools',
    icon: 'tool',
    module: 'Automation',
    parent_page: '',
    public: 1,
    for_user: '',
    sequence_id: 1,
    is_hidden: 0,
    content: JSON.stringify([
      {
        id: 'h1',
        type: 'header',
        data: { text: '<span class="h4"><b>Your Shortcuts</b></span>', col: 12 },
      },
      { id: 's1', type: 'shortcut', data: { shortcut_name: 'Tasks', col: 3 } },
      {
        id: 'p1',
        type: 'paragraph',
        data: { text: 'Everything on this page comes from fixtures.<br>', col: 12 },
      },
    ]),
    shortcuts: [{ name: 'sc1', type: 'DocType', link_to: TASK_DOCTYPE, label: 'Tasks' }],
    links: [],
    charts: [],
    number_cards: [],
    quick_lists: [],
  },
];

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    DocType: [taskMeta],
    Workspace: workspaceDocs,
    'Notification Log': [],
    [TASK_DOCTYPE]: taskDocs,
  });

// ---------------------------------------------------------------------------
// Query-report RPCs. useQueryReport has no fixture branch (it calls
// frappe.client.get, query_report.get_script and query_report.run), so the
// `report` arm needs these three answered. Scoped to MOCK_HOST, installed
// once; stories only run on web. Same precedent as DeskShell.stories.
// ---------------------------------------------------------------------------

const reportColumns = [
  { label: 'Task', fieldname: 'task', fieldtype: 'Data', width: '140' },
  { label: 'Status', fieldname: 'status', fieldtype: 'Data', width: '110' },
  { label: 'Owner', fieldname: 'owner_name', fieldtype: 'Data', width: '120' },
  { label: 'Age (days)', fieldname: 'age', fieldtype: 'Int', width: '100' },
];

const reportRows = taskDocs.map((doc, i) => ({
  task: doc.name,
  status: doc.status,
  owner_name: doc.owner_name,
  age: (i * 3) % 41,
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as Record<string, unknown>;
  if (w.__deskSurfaceMockFetch) {
    return;
  }
  w.__deskSurfaceMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!urlStr.startsWith(MOCK_HOST)) {
      return await realFetch(input as RequestInfo, init);
    }
    const { pathname } = new URL(urlStr);
    if (pathname.endsWith('frappe.desk.query_report.run')) {
      return jsonResponse({ message: { columns: reportColumns, result: reportRows } });
    }
    if (pathname.endsWith('frappe.desk.query_report.get_script')) {
      return jsonResponse({ message: { script: null } });
    }
    if (pathname.endsWith('frappe.client.get')) {
      return jsonResponse({
        message: { name: 'Open Tasks', report_name: 'Open Tasks', ref_doctype: TASK_DOCTYPE },
      });
    }
    // No session against the inert mock host: get_logged_user must answer
    // null, not a truthy docname (BackofficeShell.stories precedent).
    if (pathname.endsWith('frappe.auth.get_logged_user')) {
      return jsonResponse({ message: null });
    }
    return jsonResponse({ data: [], message: [] });
  };
})();

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function Surface({ target, children }: { target?: DeskTarget; children?: ReactNode }) {
  return (
    <BackofficeProvider
      frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
      navigation={createMemoryNavigator('/backoffice')}>
      <YStack
        flex={1}
        height={frameHeight}
        minHeight={0}>
        {children ?? (target ? <DeskSurface target={target} /> : null)}
      </YStack>
    </BackofficeProvider>
  );
}

// ---------------------------------------------------------------------------
// One arm per DeskTarget kind
// ---------------------------------------------------------------------------

/** kind "list" — the doctype list surface, the desk's most-visited screen. */
export const List = () => <Surface target={{ kind: 'list', doctype: TASK_DOCTYPE }} />;
List.storyName = 'Main';

/** kind "home" — the home redirect, resolving the default workspace. */
export const Home = () => <Surface target={{ kind: 'home' }} />;

/** kind "workspace" — a workspace page rendered from its fixture doc. */
export const Workspace = () => <Surface target={{ kind: 'workspace', workspace: 'Tools' }} />;

/** kind "view" — an alternate view; the switch hands off to DoctypeViewScreen. */
export const AlternateView = () => <Surface target={{ kind: 'view', doctype: TASK_DOCTYPE, view: 'kanban' }} />;

/** kind "new" — create mode; `defaults` route through the ONE prefill stash. */
export const NewDocument = () => (
  <Surface
    target={{
      kind: 'new',
      doctype: TASK_DOCTYPE,
      defaults: { status: 'Working', priority: 'High' },
    }}
  />
);

/** kind "form" — an existing document. */
export const Form = () => <Surface target={{ kind: 'form', doctype: TASK_DOCTYPE, name: firstTaskName }} />;

/** kind "report" — a Query/Script Report, served by the scoped RPC mock. */
export const Report = () => <Surface target={{ kind: 'report', reportName: 'Open Tasks' }} />;

/** kind "not-found" — a dead address. */
export const NotFound = () => <Surface target={{ kind: 'not-found', slug: 'no-such-doctype' }} />;

/** The resolving state: an ambiguous slug still in flight against the index. */
export const Loading = () => (
  <Surface>
    <DeskSurfaceLoading />
  </Surface>
);

// ---------------------------------------------------------------------------
// Override registry
// ---------------------------------------------------------------------------

function TargetCard({ target }: DeskSurfaceProps) {
  return (
    <YStack
      flex={1}
      padding="$4"
      gap="$2"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      backgroundColor="$color2">
      <Text>{`host surface for kind "${target.kind}"`}</Text>
      <Text>{JSON.stringify(target)}</Text>
    </YStack>
  );
}

/**
 * Per-kind override: the host replaces the whole list surface. The override
 * receives the target and the readOnly flag — thin enough to wrap the
 * built-in rather than reimplement it.
 */
export const OverrideByKind = () => (
  <Surface>
    <DeskSurface
      target={{ kind: 'list', doctype: TASK_DOCTYPE }}
      overrides={{ list: TargetCard }}
    />
  </Surface>
);

/**
 * Per-doctype override beats per-kind, and a miss falls through to the
 * built-in: the same registry keyed by doctype under one kind.
 */
export const OverrideByDoctype = () => (
  <Surface>
    <DeskSurface
      target={{ kind: 'list', doctype: TASK_DOCTYPE }}
      overrides={{ list: { [TASK_DOCTYPE]: TargetCard } }}
    />
  </Surface>
);

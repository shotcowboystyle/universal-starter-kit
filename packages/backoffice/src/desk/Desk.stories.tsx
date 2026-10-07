// OWNER: backoffice screens workstream (MPO-189).
// <Desk /> stories: the whole desk as one component. One required prop, and
// that prop is nothing — `<Desk />` renders the full desk, and every other
// arm here is a NARROWING of that: a pin, a chrome mode, a fence, a surface
// override.
//
// Everything rides fixtures. Doctype meta comes from the fixture provider's
// "DocType" collection, rows and Workspace docs from the same
// InMemoryFixtureProvider, and a fetch mock scoped to this story's mock host
// keeps the navbar's session probe and the desk's catalog reads off the
// network. Navigation is internal: with no `navigation` prop Desk seeds its
// own MemoryNavigator from the pins, so the host URL never moves.
import { Text, YStack } from '@repo/ui';
import { InMemoryFixtureProvider } from '@repo/frappe';
import { sizeRecipeEscape } from '@repo/theme';
import type { ReactNode } from 'react';

import { Desk } from './Desk';
import type { DeskSurfaceProps } from './DeskSurface';

const frameHeight = sizeRecipeEscape(680, 'story canvas: a fixed-height frame for a full-height screen to fill');

const meta = {
  title: 'Screens/Backoffice/Desk',
  component: Desk,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The embeddable desk: navbar and workspace rail, the resolved surface underneath, and one memory navigator when the host supplies no router. Pins (doctype / name / view / workspace / report / path) set the entry surface and, for a doctype pin, the reachability fence; `chrome` picks full banner + rail, banner only, or no chrome at all; `surfaces` replaces a whole screen per kind or per doctype; `scope` filters are ANDed into every doctype-homed query and cannot be cleared from the filter chrome.',
      },
    },
  },
};
export default meta;

const MOCK_HOST = 'https://backoffice-desk.mock.test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TASK_DOCTYPE = 'QaDeskWorkItem';
const FIRST_TASK = 'QDW-0001';

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
    { fieldname: 'company', fieldtype: 'Data', label: 'Company', in_list_view: 1 },
    { fieldname: 'owner_name', fieldtype: 'Data', label: 'Owner', in_list_view: 1 },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
};

const statuses = ['Open', 'Working', 'Done'];
const priorities = ['High', 'Medium', 'Low'];
const companies = ['Acme', 'Globex'];
const owners = ['ana', 'bo', 'cyrus', 'dee'];

const taskDocs = Array.from({ length: 14 }, (_, i) => ({
  name: `QDW-${String(i + 1).padStart(4, '0')}`,
  doctype: TASK_DOCTYPE,
  subject: `Work item ${i + 1}: ${['triage inbox', 'ship release', 'write docs', 'fix flaky test'][i % 4]}`,
  status: statuses[i % statuses.length],
  priority: priorities[i % priorities.length],
  company: companies[i % companies.length],
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
      { id: 's1', type: 'shortcut', data: { shortcut_name: 'Work Items', col: 3 } },
      {
        id: 'p1',
        type: 'paragraph',
        data: { text: 'This whole desk is served from fixtures.<br>', col: 12 },
      },
    ]),
    shortcuts: [{ name: 'sc1', type: 'DocType', link_to: TASK_DOCTYPE, label: 'Work Items' }],
    links: [],
    charts: [],
    number_cards: [],
    quick_lists: [],
  },
  {
    name: 'Users',
    doctype: 'Workspace',
    label: 'Users',
    title: 'Users',
    icon: 'users',
    module: 'Core',
    parent_page: '',
    public: 1,
    for_user: '',
    sequence_id: 2,
    is_hidden: 0,
    content: JSON.stringify([]),
    shortcuts: [],
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

const frappe = () => ({ baseURL: MOCK_HOST, fixtures: makeFixtures() });

/**
 * Quiet fetch mock for the mock host (navbar session probe, catalog reads),
 * so no arm ever hits the network. The session probe must answer null: the
 * generic `message: []` reads as a truthy user docname and crashes the
 * avatar's initials (BackofficeShell.stories precedent). Web only.
 */
(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as Record<string, unknown>;
  if (w.__deskStoriesMockFetch) {
    return;
  }
  w.__deskStoriesMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!urlStr.startsWith(MOCK_HOST)) {
      return await realFetch(input as RequestInfo, init);
    }
    const body =
      new URL(urlStr).pathname === '/api/method/frappe.auth.get_logged_user'
        ? { message: null }
        : { data: [], message: [] };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
})();

function Frame({ children }: { children: ReactNode }) {
  return (
    <YStack
      height={frameHeight}
      minHeight={0}>
      {children}
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

/**
 * No required props: full chrome (navbar + workspace rail) and the home
 * surface, which lands on the default workspace.
 */
export const FullDesk = () => (
  <Frame>
    <Desk frappe={frappe()} />
  </Frame>
);
FullDesk.storyName = 'Main';

/**
 * A doctype pin. It sets the entry surface (the list) AND the reachability
 * fence, and it flips the chrome default to "content" — the embedded shape a
 * host drops into its own page.
 */
export const PinnedList = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      doctype={TASK_DOCTYPE}
    />
  </Frame>
);

/** doctype + name: the document form, still fenced to that one doctype. */
export const PinnedForm = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      doctype={TASK_DOCTYPE}
      name={FIRST_TASK}
    />
  </Frame>
);

/** doctype + name="new": create mode. */
export const PinnedNewDocument = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      doctype={TASK_DOCTYPE}
      name="new"
    />
  </Frame>
);

/** doctype + view: an alternate view as the entry surface. */
export const PinnedKanban = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      doctype={TASK_DOCTYPE}
      view="kanban"
    />
  </Frame>
);

/** A workspace pin: one page, no rail. */
export const PinnedWorkspace = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      workspace="Tools"
    />
  </Frame>
);

/**
 * chrome="bare": the banner without the workspace rail. The sidebar
 * capability is forced off with it, so nothing can put the rail back.
 */
export const BareChrome = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      doctype={TASK_DOCTYPE}
      chrome="bare"
    />
  </Frame>
);

/** chrome="full" over a pin: the pin picks the surface, the host picks the chrome. */
export const PinnedWithFullChrome = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      doctype={TASK_DOCTYPE}
      chrome="full"
    />
  </Frame>
);

/** `embedded` is sugar for chrome="content": the surface and nothing else. */
export const Embedded = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      workspace="Tools"
      embedded
    />
  </Frame>
);

/**
 * `scope` is the tenant seam: ANDed into every doctype-homed query, invisible
 * to the filter chrome and not removable by the user. Here the desk can only
 * ever see Acme rows, on the list and on every alternate view.
 */
export const ScopedToOneTenant = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      doctype={TASK_DOCTYPE}
      scope={[['company', '=', 'Acme']]}
    />
  </Frame>
);

function HostSurface({ target }: DeskSurfaceProps) {
  return (
    <YStack
      flex={1}
      padding="$4"
      gap="$2"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      backgroundColor="$color2">
      <Text>{`host-rendered surface for kind "${target.kind}"`}</Text>
      <Text>{JSON.stringify(target)}</Text>
    </YStack>
  );
}

/**
 * `surfaces` replaces a whole screen. Overrides are per-Desk by
 * construction, so two desks on one page never see each other's.
 */
export const HostSurfaceOverride = () => (
  <Frame>
    <Desk
      frappe={frappe()}
      doctype={TASK_DOCTYPE}
      surfaces={{ list: HostSurface }}
    />
  </Frame>
);

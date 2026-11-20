import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';

import { FrappeStoryProvider } from './frappe-story-target';
import { FrappeListView } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';

// hex-escape: generated image fixtures are data, not paint

export default {
  title: 'FrappeUI/FrappeListView',
  component: FrappeListView,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Unified list/table view for a Frappe DocType with toolbar, view switcher, search and optional filter sidebar. DocType meta is served by an in-story fetch mock; documents come from InMemoryFixtureProvider.',
      },
    },
  },
  argTypes: {
    defaultViewMode: { control: 'select', options: ['list', 'table'] },
    showToolbar: { control: 'boolean' },
    showFilterSidebar: { control: 'boolean' },
  },
};

// ---------------------------------------------------------------------------
// In-story fetch mock: serves DocType meta from MOCK_HOST, 403s on ERR_HOST.
// Document data itself always comes from fixtures (never fetch).
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://listview.mock.test';
const ERR_HOST = 'https://forbidden.listview.mock.test';
const PENDING_HOST = 'https://pending.listview.mock.test';

const metaRaw = (name: string) => ({
  name,
  module: 'QA',
  title_field: 'description',
  image_field: 'avatar',
  fields: [
    {
      fieldname: 'description',
      fieldtype: 'Data',
      label: 'Description',
      in_list_view: 1,
      required: 1,
    },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nWorking\nCompleted',
      in_list_view: 1,
      in_standard_filter: 1,
    },
    {
      fieldname: 'priority',
      fieldtype: 'Select',
      label: 'Priority',
      options: 'Low\nMedium\nHigh',
      in_list_view: 1,
      in_standard_filter: 1,
    },
    { fieldname: 'due_date', fieldtype: 'Date', label: 'Due Date' },
    { fieldname: 'avatar', fieldtype: 'Attach Image', label: 'Avatar', hidden: 1 },
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
  // SAFETY: the flag is an optional property this module alone sets on window
  const w = window as Window & { __frappeListViewMockFetch?: boolean };
  if (w.__frappeListViewMockFetch === true) {
    return;
  }
  w.__frappeListViewMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(PENDING_HOST)) {
      // oxlint-disable-next-line promise/avoid-new, eslint/no-empty-function -- a fetch that never settles holds the story in its pending state
      return await new Promise<Response>(() => {});
    }
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: metaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'QaTodo', module: 'QA' }] });
      }
      // Anything else (e.g. the guest field-peek): empty
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const svgAvatar = (color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${color}"/></svg>`,
  )}`;

const makeTodos = (doctype: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    name: `${doctype.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
    doctype,
    description: `Task ${i + 1}: ${['Review document', 'Update code', 'Write tests', 'Fix bug', 'Deploy app'][i % 5]}`,
    status: ['Open', 'Working', 'Completed'][i % 3],
    priority: ['Low', 'Medium', 'High'][i % 3],
    due_date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
    // Row 3 carries a deliberately broken image URL.
    avatar: i === 3 ? '/files/broken-avatar.png' : svgAvatar(['#4a90d9', '#2ec27e', '#e5a50a', '#c061cb'][i % 4]),
  }));

const fixturesFor = (doctype: string, count: number) =>
  new InMemoryFixtureProvider({ [doctype]: makeTodos(doctype, count) });

// ---------------------------------------------------------------------------
// Stories (distinct doctypes per story: view mode is persisted per doctype)
// ---------------------------------------------------------------------------

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook controls hand arbitrary arg values straight through to the view
export const Main = (args: Record<string, unknown>) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={fixturesFor('QaTodo', 12)}>
    <FrappeListView
      doctype="QaTodo"
      onItemClick={action('onItemClick')}
      onAdd={action('onAdd')}
      height={600}
      {...args}
    />
  </FrappeProvider>
);
Main.args = { defaultViewMode: 'list', showToolbar: true, showFilterSidebar: false };
Main.storyName = 'Main';

/** Meta fetch never resolves: schema loading state with the themed spinner. */
export const Loading = () => (
  <FrappeProvider baseURL={PENDING_HOST}>
    <FrappeListView
      doctype="QaTodoLoading"
      height={600}
    />
  </FrappeProvider>
);

export const TableMode = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={fixturesFor('QaTodoTable', 12)}>
    <FrappeListView
      doctype="QaTodoTable"
      defaultViewMode="table"
      onItemClick={action('onItemClick')}
      onAdd={action('onAdd')}
      height={600}
    />
  </FrappeProvider>
);

/** Meta present but zero documents: list empty state. */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaTodoEmpty: [] })}>
    <FrappeListView
      doctype="QaTodoEmpty"
      onAdd={action('onAdd')}
      height={400}
    />
  </FrappeProvider>
);

/**
 * Meta present, documents exist, but active filters match nothing —
 * no-results ≠ empty (Axiom 6 HONEST STATE). The fixture provider honors
 * `filters`, so the query really runs and really returns zero rows.
 */
export const NoResults = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={fixturesFor('QaTodoNoResults', 12)}>
    <FrappeListView<{
      name: string;
      doctype: string;
      description: string;
      status: string;
      priority: string;
    }>
      doctype="QaTodoNoResults"
      filters={[['status', '=', 'Archived']]}
      onAdd={action('onAdd')}
      height={400}
    />
  </FrappeProvider>
);

/**
 * Meta endpoint 403s (guest) and the field-peek also fails: the view must
 * fall back to a lone Name column while fixture documents still render.
 */
export const MetaError = () => (
  <FrappeProvider
    baseURL={ERR_HOST}
    fixtures={fixturesFor('QaTodoErr', 6)}>
    <FrappeListView
      doctype="QaTodoErr"
      onItemClick={action('onItemClick')}
      height={400}
    />
  </FrappeProvider>
);

export const WithFilterSidebar = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={fixturesFor('QaTodoFilters', 12)}>
    <FrappeListView
      doctype="QaTodoFilters"
      showFilterSidebar
      onItemClick={action('onItemClick')}
      onAdd={action('onAdd')}
      height={600}
    />
  </FrappeProvider>
);

// ---------------------------------------------------------------------------
// oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype, not a task marker
// Live bench story — real ToDo doctype over the live data path
// ---------------------------------------------------------------------------

const liveListViewFixtures = new InMemoryFixtureProvider({
  ToDo: Array.from({ length: 8 }, (_, i) => ({
    name: `TODO-LV-${String(i + 1).padStart(3, '0')}`,
    doctype: 'ToDo',
    description: `Fixture task ${i + 1}`,
    status: ['Open', 'Closed', 'Cancelled'][i % 3],
    priority: ['Low', 'Medium', 'High'][i % 3],
  })),
});

/* oxlint-disable sonarjs/todo-tag -- the comment names the Frappe doctype, not a task marker */
/**
 * Live unified view against the real bench (STORYBOOK_FRAPPE_URL, default
 * the local dev bench proxied by the Storybook dev server), on the stock
 * ToDo doctype. Both view modes are live: list mode through
 * useFrappePagination and table mode through useFrappeCollection — external
 * creates/edits/deletes update in place in either mode. Falls back to
 * fixtures when the bench is unreachable (meta then fails over to the
 * guest field-peek / Name column path).
 */
/* oxlint-enable sonarjs/todo-tag */
export const Live = () => (
  <FrappeStoryProvider fixtures={liveListViewFixtures}>
    <FrappeListView
      doctype="ToDo"
      onItemClick={action('onItemClick')}
      onAdd={action('onAdd')}
      height={600}
    />
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'Live list/table switcher over the real bench ToDo doctype: realtime events patch rows/items in place in both modes, deletes evict, creates insert. Meta-driven columns come from the bench DocType; fixture fallback when the bench is down.',
    },
  },
};

/** Long field values must truncate in list rows instead of wrapping the layout. */
export const LongContent = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={
      new InMemoryFixtureProvider({
        QaTodoLong: [
          {
            name: 'QATODOLONG-001',
            doctype: 'QaTodoLong',
            description:
              'An extremely long task description that goes on and on describing every conceivable nuance of the work to be done, far exceeding what any list row could reasonably display without truncation',
            status: 'Open',
            priority: 'High',
            due_date: '2026-02-01',
            avatar: svgAvatar('#4a90d9'),
          },
          {
            name: 'QATODOLONG-002',
            doctype: 'QaTodoLong',
            description: '',
            status: '',
            priority: '',
            due_date: '',
            avatar: '',
          },
        ],
      })
    }>
    <FrappeListView
      doctype="QaTodoLong"
      onItemClick={action('onItemClick')}
      height={400}
    />
  </FrappeProvider>
);

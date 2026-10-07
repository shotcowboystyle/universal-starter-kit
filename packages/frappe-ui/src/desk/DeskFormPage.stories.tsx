import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { YStack } from 'tamagui';

import { FrappeProvider } from '../FrappeProvider';

import { DeskFormPage } from './DeskFormPage';

export default {
  title: 'FrappeUI/Desk/DeskFormPage',
  component: DeskFormPage,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Desk form route: DeskShell + breadcrumbs + FrappeForm (schema-driven) in create or edit mode. Meta from an in-story fetch mock; documents from fixtures.',
      },
    },
  },
  argTypes: {
    doctype: { control: 'text' },
    name: { control: 'text' },
  },
};

const MOCK_HOST = 'https://deskformpage.mock.test';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function todoMeta(name: string) {
  return {
    name,
    module: 'Desk',
    title_field: 'description',
    fields: [
      { fieldname: 'main_section', fieldtype: 'Section Break', label: 'Details' },
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
      },
      { fieldname: 'col_break', fieldtype: 'Column Break' },
      {
        fieldname: 'priority',
        fieldtype: 'Select',
        label: 'Priority',
        options: 'Low\nMedium\nHigh',
      },
      { fieldname: 'due_date', fieldtype: 'Date', label: 'Due Date' },
    ],
    permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
  };
}

(() => {
  const w = window as unknown as Record<string, unknown>;
  if (w.__deskFormPageMockFetch) {
    return;
  }
  w.__deskFormPageMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: todoMeta(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'Todo', module: 'Desk' }] });
      }
      if (url.pathname === '/api/method/frappe.utils.global_search.search') {
        return jsonResponse({ message: [] });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const todoDocs = [
  {
    name: 'TODO-001',
    doctype: 'Todo',
    description: 'Review the quarterly report',
    status: 'Working',
    priority: 'High',
    due_date: '2026-02-14',
  },
  {
    name: 'TODO-002',
    doctype: 'Todo',
    description: 'Write the release notes',
    status: 'Open',
    priority: 'Low',
    due_date: '2026-03-01',
  },
];

const makeFixtures = () => new InMemoryFixtureProvider({ Todo: todoDocs });

export const EditMode = (args: { doctype?: string; name?: string }) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <YStack height={720}>
      <DeskFormPage
        doctype={args.doctype ?? 'todo'}
        name={args.name ?? 'TODO-001'}
        onNavigate={action('onNavigate')}
      />
    </YStack>
  </FrappeProvider>
);
EditMode.args = { doctype: 'todo', name: 'TODO-001' };
EditMode.storyName = 'Main';

/** name="new" (or absent) renders the create-mode form with a New breadcrumb. */
export const CreateMode = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <YStack height={720}>
      <DeskFormPage
        doctype="todo"
        name="new"
        onNavigate={action('onNavigate')}
      />
    </YStack>
  </FrappeProvider>
);

/** Document missing from fixtures: FrappeForm not-found panel (SB-M-1707), not an editable empty form. */
export const NotFound = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <YStack height={720}>
      <DeskFormPage
        doctype="todo"
        name="TODO-MISSING"
        onNavigate={action('onNavigate')}
      />
    </YStack>
  </FrappeProvider>
);

/** Empty doctype slug: dedicated "No DocType specified" state. */
export const NoDoctype = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <YStack height={400}>
      <DeskFormPage
        doctype=""
        onNavigate={action('onNavigate')}
      />
    </YStack>
  </FrappeProvider>
);

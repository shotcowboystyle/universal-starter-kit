import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { YStack } from 'tamagui';

import { FrappeProvider } from '../FrappeProvider';

import { DeskListPage } from './DeskListPage';

export default {
  title: 'FrappeUI/Desk/DeskListPage',
  component: DeskListPage,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Desk list route: DeskShell + breadcrumbs + FrappeListView for a doctype slug. Meta and DocType catalog come from an in-story fetch mock; documents from fixtures.',
      },
    },
  },
  argTypes: {
    doctype: { control: 'text' },
  },
};

const MOCK_HOST = 'https://desklistpage.mock.test';
const ERR_HOST = 'https://forbidden.desklistpage.mock.test';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- any JSON-serializable mock payload
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

const todoMeta = (name: string) => ({
  name,
  module: 'Desk',
  title_field: 'description',
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
    },
    { fieldname: 'due_date', fieldtype: 'Date', label: 'Due Date' },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

(() => {
  // Install once per page: a window flag survives story re-renders and HMR.
  if (Object.hasOwn(window, '__deskListPageMockFetch')) {
    return;
  }
  Reflect.set(window, '__deskListPageMockFetch', true);
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input instanceof Request ? input.url : input.toString();
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: todoMeta(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({
          data: [
            { name: 'Todo', module: 'Desk' },
            { name: 'Sales Order', module: 'Selling' },
          ],
        });
      }
      if (url.pathname === '/api/method/frappe.utils.global_search.search') {
        return jsonResponse({ message: [] });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const todoDocs = Array.from({ length: 10 }, (_, i) => ({
  name: `TODO-${String(i + 1).padStart(3, '0')}`,
  doctype: 'Todo',
  description: `Task ${i + 1}: ${['Review document', 'Update code', 'Write tests', 'Fix bug', 'Deploy app'][i % 5]}`,
  status: ['Open', 'Working', 'Completed'][i % 3],
  priority: ['Low', 'Medium', 'High'][i % 3],
  due_date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
}));

export const Main = (args: { doctype?: string }) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ Todo: todoDocs })}>
    <YStack height={640}>
      <DeskListPage
        doctype={args.doctype ?? 'todo'}
        onNavigate={action('onNavigate')}
      />
    </YStack>
  </FrappeProvider>
);
Main.args = { doctype: 'todo' };
Main.storyName = 'Main';

/** Empty doctype slug: dedicated "No DocType specified" state, not a crash. */
export const NoDoctype = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <YStack height={400}>
      <DeskListPage
        doctype=""
        onNavigate={action('onNavigate')}
      />
    </YStack>
  </FrappeProvider>
);

/** Meta present, zero documents: FrappeListView empty state inside the shell. */
export const EmptyList = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ Todo: [] })}>
    <YStack height={640}>
      <DeskListPage
        doctype="todo"
        onNavigate={action('onNavigate')}
      />
    </YStack>
  </FrappeProvider>
);

/** Everything 403s (guest): shell renders, list falls back to Name column with fixture docs. */
export const Unauthenticated = () => (
  <FrappeProvider
    baseURL={ERR_HOST}
    fixtures={new InMemoryFixtureProvider({ Todo: todoDocs })}>
    <YStack height={640}>
      <DeskListPage
        doctype="todo"
        onNavigate={action('onNavigate')}
      />
    </YStack>
  </FrappeProvider>
);

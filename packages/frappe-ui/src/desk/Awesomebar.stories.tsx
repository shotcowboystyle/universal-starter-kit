import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { YStack } from 'tamagui';

import { FrappeProvider } from '../FrappeProvider';

import { Awesomebar } from './awesomebar';

const meta = {
  title: 'FrappeUI/Desk/Awesomebar',
  component: Awesomebar,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "Global desk search: navigation results (DocType catalog), document results (global_search), inline math, and commands. Trigger height comes from the LC-65 size recipe; radius=full is a pill. Backed here by an in-story fetch mock. Try typing 'sales', 'todo', '2+2' or 'settings'.",
      },
    },
  },
  argTypes: {
    basePath: { control: 'text' },
  },
};
export default meta;

const MOCK_HOST = 'https://awesomebar.mock.test';
const ERR_HOST = 'https://forbidden.awesomebar.mock.test';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const doctypeList = [
  { name: 'Todo', module: 'Desk' },
  { name: 'Todo Item', module: 'Desk' },
  { name: 'Sales Order', module: 'Selling' },
  { name: 'Sales Invoice', module: 'Accounts' },
  { name: 'Note', module: 'Desk' },
];

(() => {
  const w = window as unknown as Record<string, unknown>;
  if (w.__awesomebarMockFetch) {
    return;
  }
  w.__awesomebarMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: doctypeList });
      }
      if (url.pathname === '/api/method/frappe.utils.global_search.search') {
        const text = url.searchParams.get('text') ?? '';
        return jsonResponse({
          message: [
            { doctype: 'Todo', name: 'TODO-001', content: `Matches "${text}": buy milk` },
            { doctype: 'Sales Order', name: 'SO-0001', content: `Matches "${text}": ACME order` },
          ],
        });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

export const Main = (args: Record<string, unknown>) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <YStack
      width={560}
      padding="$4">
      <Awesomebar
        onNavigate={action('onNavigate')}
        {...args}
      />
    </YStack>
  </FrappeProvider>
);
Main.args = { basePath: '/desk' };
Main.storyName = 'Main';

/**
 * DocType catalog 403s (guest): typing a query must surface the
 * "Search unavailable -- are you logged in?" empty message, not a
 * misleading "No results".
 */
export const SearchUnavailable = () => (
  <FrappeProvider
    baseURL={ERR_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <YStack
      width={560}
      padding="$4">
      <Awesomebar onNavigate={action('onNavigate')} />
    </YStack>
  </FrappeProvider>
);

/** No provider: math and commands still work locally; remote result groups stay empty. */
export const WithoutProvider = () => (
  <YStack
    width={560}
    padding="$4">
    <Awesomebar onNavigate={action('onNavigate')} />
  </YStack>
);

/** Narrow container: trigger must stay a single truncating line. */
export const Narrow = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <YStack
      width={260}
      padding="$4">
      <Awesomebar onNavigate={action('onNavigate')} />
    </YStack>
  </FrappeProvider>
);

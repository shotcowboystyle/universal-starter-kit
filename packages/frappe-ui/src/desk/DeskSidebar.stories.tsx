import { InMemoryFixtureProvider } from '@repo/frappe';
import { storage } from '@repo/store';
import { action } from '@repo/storybook';
import type React from 'react';
import { YStack } from 'tamagui';

import { FrappeProvider } from '../FrappeProvider';

import { DeskSidebar } from './DeskSidebar';

export default {
  title: 'FrappeUI/Desk/DeskSidebar',
  component: DeskSidebar,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Desk navigation sidebar: Recent + Favorites (shared storage) and Modules (DocType catalog via useDocTypeSearch, mocked here).',
      },
    },
  },
};

const MOCK_HOST = 'https://desksidebar.mock.test';
const ERR_HOST = 'https://forbidden.desksidebar.mock.test';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- any JSON-serializable mock payload
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

const doctypeList = [
  { name: 'Todo', module: 'Desk' },
  { name: 'Todo Item', module: 'Desk' },
  { name: 'Sales Order', module: 'Selling' },
  { name: 'Sales Invoice', module: 'Accounts' },
  { name: 'Note', module: 'Desk' },
  {
    name: 'Very Long Doctype Name That Never Seems To End At All',
    module: 'QA',
  },
];

(() => {
  // Install once per page: a window flag survives story re-renders and HMR.
  if (Object.hasOwn(window, '__deskSidebarMockFetch')) {
    return;
  }
  Reflect.set(window, '__deskSidebarMockFetch', true);
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input instanceof Request ? input.url : input.toString();
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: doctypeList });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const recentKey = 'frappe-desk-recent';
const favoritesKey = 'frappe-desk-favorites';

const seedStorage = (recent: unknown[], favorites: unknown[]) => {
  try {
    void storage.setItem(recentKey, JSON.stringify(recent));
    void storage.setItem(favoritesKey, JSON.stringify(favorites));
  } catch {
    // storage unavailable
  }
};

const clearStorageDecorator = (Story: React.ComponentType) => {
  seedStorage([], []);
  return (
    <YStack
      width={280}
      height={560}
      borderWidth={1}
      borderColor="$borderColor">
      <Story />
    </YStack>
  );
};

export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <DeskSidebar
      onNavigate={action('onNavigate')}
      activePath="/desk/Sales Order"
    />
  </FrappeProvider>
);
Main.storyName = 'Main';
Main.decorators = [clearStorageDecorator];

export const WithRecentAndFavorites = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <DeskSidebar
      onNavigate={action('onNavigate')}
      activePath="/desk/Todo/TODO-001"
    />
  </FrappeProvider>
);
WithRecentAndFavorites.decorators = [
  (Story: React.ComponentType) => {
    seedStorage(
      [
        { label: 'Todo: TODO-001', path: '/desk/Todo/TODO-001' },
        { label: 'Sales Order: SO-0001', path: '/desk/Sales Order/SO-0001' },
        {
          label: 'Note: A very long recent document label that should truncate rather than blow the rail width',
          path: '/desk/Note/NOTE-LONG',
        },
      ],
      [{ label: 'Sales Invoice: INV-0042', path: '/desk/Sales Invoice/INV-0042' }],
    );
    return (
      <YStack
        width={280}
        height={560}
        borderWidth={1}
        borderColor="$borderColor">
        <Story />
      </YStack>
    );
  },
];

/** DocType catalog 403s (guest) and storage is empty: sidebar renders with no sections. */
export const Unauthenticated = () => (
  <FrappeProvider
    baseURL={ERR_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <DeskSidebar onNavigate={action('onNavigate')} />
  </FrappeProvider>
);
Unauthenticated.decorators = [clearStorageDecorator];

/** No provider at all: no modules fetch is attempted; storage sections only. */
export const WithoutProvider = () => <DeskSidebar onNavigate={action('onNavigate')} />;
WithoutProvider.decorators = [clearStorageDecorator];

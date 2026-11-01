import { InMemoryFixtureProvider } from '@repo/frappe';
import { YStack } from 'tamagui';

import { FrappeProvider } from '../FrappeProvider';

import { DeskFormSidebar } from './DeskFormSidebar';

// hex-escape: generated image fixtures are data, not paint

export default {
  title: 'FrappeUI/Desk/DeskFormSidebar',
  component: DeskFormSidebar,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "Live-wired FormSidebar for the Desk form page's supporting pane. Renders nothing until the document arrives. Assigned To comes from open assignment ToDos; Shared With from DocShare; metadata from the doc row.",
      },
    },
  },
};

const MOCK_HOST = 'https://deskformsidebar.mock.test';
const JANE = 'jane@example.com';
const SAM = 'sam@example.com';

/**
 * The document image is an inline data: URI, not "/files/todo.png".
 * `resolveFileUrl` prefixes a "/..." value with baseURL, so a path fixture
 * makes the <img> fetch https://deskformsidebar.mock.test/files/todo.png for
 * real — the story's window.fetch shim only intercepts fetch(), never an
 * image load — and the story prints ERR_TUNNEL_CONNECTION_FAILED. A data: URI
 * goes through resolveFileUrl untouched and paints without a request, which
 * is what G-15 story honesty asks for (MPO-197).
 */
const storyImage = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 24 24">' +
    '<rect width="24" height="24" rx="3" fill="#4c6ef5"/>' +
    '<path d="M6 12.5l3.5 3.5L18 8" fill="none" stroke="#fff" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- any JSON-serializable mock payload
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

const todoMeta = (name: string) => ({
  name,
  module: 'Desk',
  title_field: 'description',
  image_field: 'image',
  fields: [
    { fieldname: 'description', fieldtype: 'Data', label: 'Description', required: 1 },
    { fieldname: 'status', fieldtype: 'Select', label: 'Status' },
    { fieldname: 'image', fieldtype: 'Attach Image', label: 'Image' },
  ],
  permissions: [{ role: 'All', read: 1, write: 1 }],
});

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  // Install once per page: a window flag survives story re-renders and HMR.
  if (Object.hasOwn(window, '__deskFormSidebarMockFetch')) {
    return;
  }
  Reflect.set(window, '__deskFormSidebarMockFetch', true);
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input instanceof Request ? input.url : input.toString();
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: todoMeta(decodeURIComponent(metaMatch[1])) });
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
    owner: JANE,
    modified_by: 'john@example.com',
    creation: '2026-02-01',
    image: storyImage,
    _assign: JSON.stringify([JANE]),
  },
];

const shareDocs = [
  {
    name: 'SHARE-001',
    doctype: 'DocShare',
    user: SAM,
    everyone: 0,
    read: 1,
    write: 1,
    share: 0,
    share_doctype: 'Todo',
    share_name: 'TODO-001',
  },
];

const assignmentDocs = [
  {
    name: 'TODO-ASSIGN-001',
    doctype: 'ToDo',
    allocated_to: JANE,
    status: 'Open',
    reference_type: 'Todo',
    reference_name: 'TODO-001',
  },
];

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    Todo: todoDocs,
    DocShare: shareDocs,
    ToDo: assignmentDocs,
  });

/**
 * Same doc, nothing hanging off it: no `_assign` mirror, no DocShare row, no
 * image. Every section still renders — with its emptyText — so the pane
 * geometry is identical to the populated board.
 */
const bareTodoDocs = [
  {
    name: 'TODO-002',
    doctype: 'Todo',
    description: 'File the expense report',
    status: 'Open',
    owner: SAM,
    modified_by: SAM,
    creation: '2026-02-03',
  },
];

const makeBareFixtures = () =>
  new InMemoryFixtureProvider({
    Todo: bareTodoDocs,
    DocShare: [],
    ToDo: [],
  });

export const Default = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <YStack
      width={320}
      height={520}>
      <DeskFormSidebar
        doctype="Todo"
        name="TODO-001"
      />
    </YStack>
  </FrappeProvider>
);
Default.storyName = 'Main';

export const EmptySections = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeBareFixtures()}>
    <YStack
      width={320}
      height={520}>
      <DeskFormSidebar
        doctype="Todo"
        name="TODO-002"
      />
    </YStack>
  </FrappeProvider>
);
EmptySections.storyName = 'Empty Sections';
EmptySections.parameters = {
  docs: {
    description: {
      story:
        'Doc with no assignees, no shares and no image: Assigned To reads its emptyText (No one assigned), Shared With reads Not shared, and the metadata rows still come from the doc.',
    },
  },
};

export const Loading = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <YStack
      width={320}
      height={200}>
      <DeskFormSidebar
        doctype="Todo"
        name="TODO-MISSING"
      />
    </YStack>
  </FrappeProvider>
);
Loading.parameters = {
  docs: {
    description: {
      story: 'Name that is not in fixtures: the sidebar stays unmounted until a doc arrives.',
    },
  },
};

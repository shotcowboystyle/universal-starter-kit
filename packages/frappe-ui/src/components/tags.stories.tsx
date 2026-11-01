import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';

import { FrappeStoryProvider, LiveToDoGate, LIVE_TODO_NAME } from '../frappe-story-target';
import { FrappeProvider } from '../FrappeProvider';

import { Tags } from './tags';
import type { FrappeTag, FrappeTagLink } from './tags';

export default {
  title: 'FrappeUI/FrappeTags',
  component: Tags,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Frappe bridge for the generic Tags component: Tag Link documents become the assigned tags, all Tag documents become suggestions. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05).
//
// Fixture-backed stories previously pointed at https://demo.frappe.cloud. The
// fixture provider serves Tag / Tag Link *documents*, but collection setup
// still resolves DocType meta over HTTP — so those stories fired a real
// cross-origin request that the browser rejected with a CORS error. MOCK_HOST
// keeps the same code path (real fetch, real meta shape) without leaving the
// machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappetags.mock.test';

const tagMetaRaw = (name: string) => {
  if (name === 'Tag Link') {
    return {
      name: 'Tag Link',
      module: 'Desk',
      fields: [
        { fieldname: 'tag', fieldtype: 'Link', label: 'Tag', options: 'Tag', in_list_view: 1 },
        {
          fieldname: 'document_type',
          fieldtype: 'Link',
          label: 'Document Type',
          options: 'DocType',
          in_list_view: 1,
        },
        {
          fieldname: 'document_name',
          fieldtype: 'Dynamic Link',
          label: 'Document Name',
          options: 'document_type',
          in_list_view: 1,
        },
      ],
      permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
    };
  }
  return {
    name,
    module: 'Desk',
    title_field: 'name',
    fields: [{ fieldname: 'name', fieldtype: 'Data', label: 'Tag', in_list_view: 1 }],
    permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
  };
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- serializes any mock payload; the story owns its shape
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

const urlOf = (input: RequestInfo | URL): string => {
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
  const w: Window & { __frappeTagsMockFetch?: boolean } = window;
  if (w.__frappeTagsMockFetch === true) {
    return;
  }
  w.__frappeTagsMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = urlOf(input);
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'Tag';
        return jsonResponse({ docs: [tagMetaRaw(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: tagMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({
          data: [
            { name: 'Tag', module: 'Desk' },
            { name: 'Tag Link', module: 'Desk' },
          ],
        });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const tagFixtures: FrappeTag[] = [
  { name: 'urgent', doctype: 'Tag' },
  { name: 'follow-up', doctype: 'Tag' },
  { name: 'billing', doctype: 'Tag' },
  { name: 'customer', doctype: 'Tag' },
];

const tagLinkFixtures: FrappeTagLink[] = [
  {
    name: 'TL-001',
    doctype: 'Tag Link',
    tag: 'urgent',
    document_type: 'Task',
    document_name: 'TASK-001',
  },
  {
    name: 'TL-002',
    doctype: 'Tag Link',
    tag: 'follow-up',
    document_type: 'Task',
    document_name: 'TASK-001',
  },
  {
    name: 'TL-003',
    doctype: 'Tag Link',
    tag: 'billing',
    document_type: 'Task',
    document_name: 'TASK-OTHER',
  },
  {
    name: 'TL-LIVE-001',
    doctype: 'Tag Link',
    tag: 'urgent',
    document_type: 'ToDo',
    document_name: LIVE_TODO_NAME,
  },
];

const makeFixtures = () => new InMemoryFixtureProvider({ Tag: tagFixtures, 'Tag Link': tagLinkFixtures });

export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Tags
      doctype="Task"
      docname="TASK-001"
      label="Tags"
      onAdd={action('onAdd')}
      onRemove={action('onRemove')}
      onTagClick={action('onTagClick')}
    />
  </FrappeProvider>
);
Main.storyName = 'Main';

/** Document with no tag links: empty state plus suggestions available via Add. */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Tags
      doctype="Task"
      docname="TASK-NO-TAGS"
      label="Tags"
      onAdd={action('onAdd')}
    />
  </FrappeProvider>
);

/** enableAdd=false must hide the add affordance entirely. */
export const NoAdd = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Tags
      doctype="Task"
      docname="TASK-001"
      label="Tags"
      enableAdd={false}
    />
  </FrappeProvider>
);

/** Without onRemove the chips must not offer a remove affordance. */
export const NoRemove = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Tags
      doctype="Task"
      docname="TASK-001"
      label="Tags"
    />
  </FrappeProvider>
);

/** disabled forwards to the base component. */
export const Disabled = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Tags
      doctype="Task"
      docname="TASK-001"
      label="Tags"
      disabled
      onAdd={action('onAdd')}
      onRemove={action('onRemove')}
    />
  </FrappeProvider>
);

/**
 * Live tags against the real bench (STORYBOOK_FRAPPE_URL, default the local
 * dev bench proxied by the Storybook dev server) on a stock to-do doc. Tag /
 * Tag Link are core doctypes. Falls back to fixtures when the bench is
 * unreachable.
 */
export const Live = () => (
  <FrappeStoryProvider fixtures={makeFixtures()}>
    <LiveToDoGate>
      {(name) => (
        <Tags
          doctype="ToDo"
          docname={name}
          label="Tags"
          onAdd={action('onAdd')}
          onRemove={action('onRemove')}
          onTagClick={action('onTagClick')}
        />
      )}
    </LiveToDoGate>
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'Live Tag / Tag Link collections over a stock ToDo: assigned tags and suggestions come from the bench when STORYBOOK_FRAPPE_URL is reachable; fixture fallback (ToDo/TODO-LIVE-001 + Tag Link) when it is not.',
    },
  },
};

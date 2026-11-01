import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';

import { FrappeStoryProvider } from './frappe-story-target';
import { FrappeProvider } from './FrappeProvider';
import { FrappeTreeView } from './FrappeTreeView';

export default {
  title: 'FrappeUI/FrappeTreeView',
  component: FrappeTreeView,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Tree over useFrappeCollection / useLiveQuery: fixtures (or live REST) feed the full list, then the wrapper builds the parent/child forest client-side. DocType meta is mocked in-story so is_tree gating works offline.',
      },
    },
  },
};

const MOCK_HOST = 'https://tree.mock.test';
const ERRMETA_HOST = 'https://errmeta.tree.mock.test';

interface Region {
  name: string;
  doctype: string;
  region_name: string;
  parent_region: string;
}

/** North → North A / North B; North A → North A1; South & West are leaves. */
const regionDocs: Region[] = [
  { name: 'North', doctype: 'QaRegion', region_name: 'Northern Region', parent_region: '' },
  { name: 'South', doctype: 'QaRegion', region_name: 'Southern Region', parent_region: '' },
  { name: 'West', doctype: 'QaRegion', region_name: 'Western Region', parent_region: '' },
  {
    name: 'North A',
    doctype: 'QaRegion',
    region_name: 'North Sub-Region A',
    parent_region: 'North',
  },
  {
    name: 'North B',
    doctype: 'QaRegion',
    region_name: 'North Sub-Region B',
    parent_region: 'North',
  },
  {
    name: 'North A1',
    doctype: 'QaRegion',
    region_name: 'North Leaf A1',
    parent_region: 'North A',
  },
];

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- any JSON-serialisable mock envelope the stories answer with
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

const requestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof URL) {
    return input.toString();
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates fetch's declared `string | Request` input union
  return typeof input === 'string' ? input : input.url;
};

const regionMeta = (name: string, isTree: boolean) => ({
  name,
  module: 'QA',
  title_field: 'region_name',
  is_tree: isTree ? 1 : 0,
  fields: [
    { fieldname: 'region_name', fieldtype: 'Data', label: 'Region Name', in_list_view: 1 },
    { fieldname: 'parent_region', fieldtype: 'Link', label: 'Parent Region', options: name },
  ],
  permissions: [{ role: 'All', read: 1 }],
});

/** A chart of accounts: no parent field, no is_tree, the name is the path. */
const accountMeta = (name: string) => ({
  name,
  module: 'QA',
  title_field: 'name',
  is_tree: 0,
  fields: [{ fieldname: 'balance', fieldtype: 'Currency', label: 'Balance', in_list_view: 1 }],
  permissions: [{ role: 'All', read: 1 }],
});

const handleMetaRequest = (url: URL): Response | null => {
  const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
  if (!metaMatch) {
    return null;
  }
  const name = decodeURIComponent(metaMatch[1]);
  if (name === 'QaAccount') {
    return jsonResponse({ data: accountMeta(name) });
  }
  return jsonResponse({ data: regionMeta(name, name !== 'QaFlatDoc') });
};

(() => {
  // SAFETY: the flag is an optional property this module alone sets on window
  const w = window as Window & { __frappeTreeViewMockFetch?: boolean };
  if (w.__frappeTreeViewMockFetch === true) {
    return;
  }
  w.__frappeTreeViewMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(ERRMETA_HOST)) {
      return jsonResponse({ message: 'DocType meta unavailable (mock)' }, 500);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const meta = handleMetaRequest(new URL(urlStr));
      if (meta) {
        return meta;
      }
      // List traffic should come from fixtures; return empty if anything slips through.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaRegion: regionDocs })}>
    <FrappeTreeView
      doctype="QaRegion"
      parentField="parent_region"
      titleField="region_name"
      expandByDefault
      display="default"
      onNodeClick={action('onNodeClick')}
    />
  </FrappeProvider>
);
Main.storyName = 'Main';

/** valueField renders a secondary value next to each node label. */
export const WithValueField = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaRegion: regionDocs })}>
    <FrappeTreeView
      doctype="QaRegion"
      parentField="parent_region"
      titleField="region_name"
      valueField="name"
      onNodeClick={action('onNodeClick')}
    />
  </FrappeProvider>
);

/** DocType with is_tree=0: dedicated "does not support tree view" state. */
export const NotATree = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <FrappeTreeView
      doctype="QaFlatDoc"
      parentField="parent_region"
    />
  </FrappeProvider>
);

interface Account {
  name: string;
  doctype: string;
  balance: string;
}

/**
 * Seven rows, and every one of them is a leaf. "Assets", "Assets:Personal"
 * and "Assets:Personal:Bank" are not documents at all.
 */
const accountDocs: Account[] = [
  { name: 'Assets:Personal:Bank:Checking', doctype: 'QaAccount', balance: '4,120.55' },
  { name: 'Assets:Personal:Bank:Savings', doctype: 'QaAccount', balance: '18,300.00' },
  { name: 'Assets:Personal:Cash', doctype: 'QaAccount', balance: '260.00' },
  { name: 'Expenses:Groceries', doctype: 'QaAccount', balance: '612.40' },
  { name: 'Expenses:Utilities:Power', doctype: 'QaAccount', balance: '148.90' },
  { name: 'Income:Salary', doctype: 'QaAccount', balance: '9,000.00' },
  { name: 'Liabilities:Credit Card', doctype: 'QaAccount', balance: '-732.10' },
];

/** Colon-path doctype: is_tree is 0, there is no parent field, tree renders. */
export const ColonPath = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaAccount: accountDocs })}>
    <FrappeTreeView
      doctype="QaAccount"
      pathSeparator=":"
      pathField="name"
      valueField="balance"
      expandByDefault
      onNodeClick={action('onNodeClick')}
      onPathSelect={action('onPathSelect')}
    />
  </FrappeProvider>
);
ColonPath.parameters = {
  docs: {
    description: {
      story:
        "The account IS its path (Assets:Personal:Bank:Checking). Meta reports is_tree 0 and the doctype has no parent field, so the parent-field path would paint the unsupported state instead. pathSeparator synthesises the branches client-side from each row's own key. A synthesised branch carries no document: clicking it fires onPathSelect with the path and no doc, and onNodeClick stays silent. The balances hang off the leaves, which are the only real rows.",
    },
  },
};

/** Tree doctype with zero root nodes: empty message. */
export const EmptyTree = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaRegionEmpty: [] })}>
    <FrappeTreeView
      doctype="QaRegionEmpty"
      parentField="parent_region"
      titleField="region_name"
    />
  </FrappeProvider>
);

/** Meta endpoint 500s without parentField: schema error panel. */
export const MetaError = () => (
  <FrappeProvider
    baseURL={ERRMETA_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <FrappeTreeView doctype="QaRegion" />
  </FrappeProvider>
);

// ---------------------------------------------------------------------------
// Live bench story — real tree doctype over the live data path
// ---------------------------------------------------------------------------

interface LiveTreeNode {
  name: string;
  doctype: string;
  title: string;
  parent_test_tree_node: string;
}

const treeDoctype = 'Test Tree Node';

const liveTreeFixtures: LiveTreeNode[] = [
  { name: 'Root A', doctype: treeDoctype, title: 'Fixture Root A', parent_test_tree_node: '' },
  { name: 'Root B', doctype: treeDoctype, title: 'Fixture Root B', parent_test_tree_node: '' },
  {
    name: 'Child A1',
    doctype: treeDoctype,
    title: 'Fixture Child A1',
    parent_test_tree_node: 'Root A',
  },
  {
    name: 'Leaf A1a',
    doctype: treeDoctype,
    title: 'Fixture Leaf A1a',
    parent_test_tree_node: 'Child A1',
  },
];

/**
 * Live tree against the real bench (STORYBOOK_FRAPPE_URL, default the local
 * dev bench proxied by the Storybook dev server), using the bench's
 * `Test Tree Node` doctype (is_tree). Realtime subscriptions drive the
 * forest: external creates add nodes, doc_update patches labels in place,
 * re-parenting (parent field change) moves the node under its new parent,
 * doc_deleted evicts it. Falls back to fixtures when the bench is
 * unreachable — parentField is explicit so the fixture path never depends
 * on live meta.
 */
export const Live = () => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ 'Test Tree Node': liveTreeFixtures })}>
    <FrappeTreeView
      doctype="Test Tree Node"
      parentField="parent_test_tree_node"
      titleField="title"
      expandByDefault
      onNodeClick={action('onNodeClick')}
    />
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'Live tree over useFrappeCollection + useLiveQuery: realtime node updates including re-parenting (a parent-field change moves the node), creates, and tombstoned deletes. Shows a reconnect pill while the socket is down and an honest error panel on permission/network failure. Fixture fallback when the bench is down.',
    },
  },
};

/**
 * Meta fails but parentField is provided: guest-peek proceeds onto the live
 * collection path. Fixtures still feed useFrappeCollection / useLiveQuery.
 */
export const GuestPeek = () => (
  <FrappeProvider
    baseURL={ERRMETA_HOST}
    fixtures={new InMemoryFixtureProvider({ QaRegion: regionDocs })}>
    <FrappeTreeView
      doctype="QaRegion"
      parentField="parent_region"
      titleField="region_name"
      onNodeClick={action('onNodeClick')}
    />
  </FrappeProvider>
);

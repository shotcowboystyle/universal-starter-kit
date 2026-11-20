import { InMemoryFixtureProvider } from '@repo/frappe';
import { XStack, YStack } from 'tamagui';

import { ChartCard } from './ChartCard';
import { FrappeStoryProvider } from './frappe-story-target';
import { FrappeChartCard } from './FrappeChartCard';
import { FrappeProvider } from './FrappeProvider';

// hex-escape: Frappe sends column, event and series colors as hex: fixture data, not paint

export default {
  title: 'FrappeUI/FrappeChartCard',
  component: ChartCard,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "ChartCard as re-exported by @repo/frappe-ui (the 'Frappe ChartCard' bridge). Same component object as the components-package ChartCard; stories exercise chart modes and series edge cases. The dataSource story is network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise.",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05, closes UX-P18).
//
// The FrappeChartCard dataSource path previously rode FrappeStoryProvider,
// whose offline fallback is https://demo.frappe.cloud. The fixture provider
// serves the *collection*, but DocType meta still resolves over HTTP — so
// native Storybook / Kitchen Sink fired a real cross-origin request the
// browser rejected with CORS. MOCK_HOST keeps the same code path (real
// fetch, real meta shape) without leaving the machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappechartcard.mock.test';

const todoMetaRaw = (name: string) => ({
  name,
  module: 'Desk',
  title_field: 'description',
  fields: [
    { fieldname: 'description', fieldtype: 'Small Text', label: 'Description', in_list_view: 1 },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nClosed\nCancelled',
      in_list_view: 1,
      in_standard_filter: 1,
    },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

interface MockBody {
  message?: string;
  docs?: unknown[];
  data?: unknown;
}

// Response.json sets the same `application/json` content type the hand-built Response did.
const jsonResponse = (body: MockBody, status = 200): Response => Response.json(body, { status });

const requestUrl = (input: RequestInfo | URL): string => {
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
  const w: Window & { __frappeChartCardMockFetch?: boolean } = window;
  if (w.__frappeChartCardMockFetch) {
    return;
  }
  w.__frappeChartCardMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'ToDo';
        return jsonResponse({ docs: [todoMetaRaw(decodeURIComponent(doctype))] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: todoMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'ToDo', module: 'Desk' }] });
      }
      // Everything else (guest field-peek, counts, group_by): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const monthly = [
  { label: 'Jan', value: 12 },
  { label: 'Feb', value: 19 },
  { label: 'Mar', value: 8 },
  { label: 'Apr', value: 24 },
  { label: 'May', value: 15 },
];

export const Main = () => <ChartCard config={{ id: 'bar', title: 'Monthly Sales', type: 'bar', data: monthly }} />;
Main.storyName = 'Main';

export const ChartModes = () => (
  <XStack
    gap="$3"
    flexWrap="wrap">
    <YStack width={340}>
      <ChartCard config={{ id: 'bar2', title: 'Bar', type: 'bar', data: monthly }} />
    </YStack>
    <YStack width={340}>
      <ChartCard config={{ id: 'line', title: 'Line', type: 'line', data: monthly }} />
    </YStack>
    <YStack width={340}>
      <ChartCard config={{ id: 'pie', title: 'Pie', type: 'pie', data: monthly, showLegend: true }} />
    </YStack>
  </XStack>
);

export const EmptySeries = () => <ChartCard config={{ id: 'empty', title: 'Empty Series', type: 'bar', data: [] }} />;

export const MalformedSeries = () => (
  <ChartCard
    config={{
      id: 'malformed',
      title: 'Malformed Series',
      type: 'bar',
      data: [
        { label: 'ok', value: 10 },
        { label: '', value: Number.NaN },
        { label: 'negative', value: -5 },
        { label: 'huge', value: 1e12 },
      ],
    }}
  />
);

export const LargeSeries = () => (
  <ChartCard
    config={{
      id: 'large',
      title: 'Large Series (60 points)',
      type: 'line',
      data: Array.from({ length: 60 }, (_, i) => ({
        label: `P${i + 1}`,
        value: Math.round(50 + 40 * Math.sin(i / 5)),
      })),
    }}
  />
);

export const CustomHeightAndColors = () => (
  <ChartCard
    config={{
      id: 'custom',
      title: 'Custom Height + Colors',
      type: 'bar',
      data: monthly,
      height: 120,
      colors: ['#e91e63'],
      showLabels: true,
    }}
  />
);

// ---------------------------------------------------------------------------
// Hermetic grouped aggregate (FrappeChartCard + dataSource): one data point
// per group, computed from fixtures. Native Storybook / Kitchen Sink show
// this path — never demo.frappe.cloud. Palette is left to the canonical
// tokenized chart palette defaults (LC-27).
// ---------------------------------------------------------------------------

const liveTodoFixtures = [
  { name: 'TD-1', doctype: 'ToDo', description: 'Fixture todo A', status: 'Open' },
  { name: 'TD-2', doctype: 'ToDo', description: 'Fixture todo B', status: 'Open' },
  { name: 'TD-3', doctype: 'ToDo', description: 'Fixture todo C', status: 'Closed' },
];

const todoByStatusChart = (
  <YStack
    width={480}
    testID="live-todo-by-status">
    <FrappeChartCard
      config={{ id: 'todo-by-status', title: 'ToDos by Status', type: 'bar', showLabels: true }}
      dataSource={{ doctype: 'ToDo', groupBy: 'status' }}
    />
  </YStack>
);

export const ToDoByStatus = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: liveTodoFixtures })}>
    {todoByStatusChart}
  </FrappeProvider>
);
ToDoByStatus.parameters = {
  docs: {
    description: {
      story:
        'Hermetic bar chart: count of fixture ToDo documents grouped by status. MOCK_HOST plus the in-story fetch intercept serve DocType meta so native Storybook never hits demo.frappe.cloud.',
    },
  },
};

// ---------------------------------------------------------------------------
// Live grouped aggregate: bench when reachable, fixtures otherwise.
// ---------------------------------------------------------------------------

export const Live = () => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ ToDo: liveTodoFixtures })}>
    {todoByStatusChart}
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'LIVE bar chart: count of ToDo documents grouped by status, aggregated server-side and refetched with a 300ms coalescing window on realtime list_update / doc_update / doc_deleted. Create/close/delete ToDos on the bench and the bars move in place — no reload. Fixture fallback when the bench is unreachable.',
    },
  },
};

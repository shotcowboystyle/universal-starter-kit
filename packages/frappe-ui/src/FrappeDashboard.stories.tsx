import { InMemoryFixtureProvider } from '@repo/frappe';
import { KPICard, ChartCard } from '@repo/ui';
import type { DashboardWidget } from '@repo/ui';
import { Text, YStack } from 'tamagui';

import { FrappeStoryProvider } from './frappe-story-target';
import { FrappeDashboard } from './FrappeDashboard';
import { FrappeProvider } from './FrappeProvider';

const TOTAL_REVENUE = 'Total Revenue';
const NORTH_AMERICA = 'North America';
const TOTAL_REVENUE_ID = 'total-revenue';
const COMPLETION_RATE_ID = 'completion-rate';
const REVENUE_STATUS_ID = 'revenue-status';
const SALES_REGION_ID = 'sales-region';

// hex-escape: Frappe sends column, event and series colours as hex: fixture data, not paint

export default {
  title: 'FrappeUI/FrappeDashboard',
  component: FrappeDashboard,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'A dashboard component with KPI cards and charts for visualizing Frappe data. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05, closes UX-P18).
//
// Fixture-backed stories previously pointed at https://demo.frappe.cloud. The
// fixture provider serves the *collection*, but Frappe still resolves DocType
// meta over HTTP — so those stories fired a real cross-origin request that the
// browser rejected with a CORS error, poisoning the console for every
// automated probe. MOCK_HOST keeps the same code path (real fetch, real meta
// shape) without leaving the machine; ERR_HOST is the deliberate failure host
// for the error-state story.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappedashboard.mock.test';
const ERR_HOST = 'https://forbidden.frappedashboard.mock.test';

const salesOrderMetaRaw = (name: string) => ({
  name,
  module: 'Selling',
  title_field: 'name',
  fields: [
    { fieldname: 'total', fieldtype: 'Currency', label: 'Total', in_list_view: 1 },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Completed\nPending',
      in_list_view: 1,
      in_standard_filter: 1,
    },
    { fieldname: 'region', fieldtype: 'Data', label: 'Region', in_list_view: 1 },
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
  const w: Window & { __frappeDashboardMockFetch?: boolean } = window;
  if (w.__frappeDashboardMockFetch) {
    return;
  }
  w.__frappeDashboardMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'SalesOrder';
        return jsonResponse({ docs: [salesOrderMetaRaw(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: salesOrderMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'SalesOrder', module: 'Selling' }] });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

// KPI Card Stories
export const KPICardDefault = () => (
  <KPICard
    config={{
      id: 'revenue-kpi',
      title: TOTAL_REVENUE,
      value: 125_000,
      format: 'currency',
      currencySymbol: '$',
    }}
  />
);

// Not "Main": the live Sales dashboard export below is `Main` (harness id
// `--main`). Two stories sharing one storyName collide to a single lost-pixel
// shot file, silently untesting one.
KPICardDefault.storyName = 'KPI Card';
// Chart Card Stories
export const BarChart = () => (
  <ChartCard
    config={{
      id: 'monthly-sales',
      title: 'Monthly Sales',
      type: 'bar',
      data: [
        { label: 'Jan', value: 4000 },
        { label: 'Feb', value: 3000 },
        { label: 'Mar', value: 5000 },
        { label: 'Apr', value: 4500 },
        { label: 'May', value: 6000 },
        { label: 'Jun', value: 5500 },
      ],
    }}
    colors={['#3B82F6']}
  />
);
BarChart.parameters = {
  docs: {
    description: {
      story: 'Bar chart for comparing values across categories.',
    },
  },
};

// Dashboard Stories
interface SalesOrder {
  name: string;
  doctype: string;
  total: number;
  status: string;
  region: string;
}

const salesFixtures: SalesOrder[] = [
  {
    name: 'SO-001',
    doctype: 'SalesOrder',
    total: 5000,
    status: 'Completed',
    region: NORTH_AMERICA,
  },
  { name: 'SO-002', doctype: 'SalesOrder', total: 3500, status: 'Pending', region: 'Europe' },
  {
    name: 'SO-003',
    doctype: 'SalesOrder',
    total: 7200,
    status: 'Completed',
    region: 'Asia Pacific',
  },
  {
    name: 'SO-004',
    doctype: 'SalesOrder',
    total: 2800,
    status: 'Completed',
    region: NORTH_AMERICA,
  },
  { name: 'SO-005', doctype: 'SalesOrder', total: 4100, status: 'Pending', region: 'Europe' },
];

const widgets: DashboardWidget[] = [
  {
    id: TOTAL_REVENUE_ID,
    type: 'kpi',
    colSpan: 1,
    kpiConfig: {
      id: TOTAL_REVENUE_ID,
      title: TOTAL_REVENUE,
      value: 22_600,
      previousValue: 18_500,
      format: 'currency',
      currencySymbol: '$',
      trend: 'up',
      goodDirection: 'up',
    },
  },
  {
    id: 'orders',
    type: 'kpi',
    colSpan: 1,
    kpiConfig: {
      id: 'orders',
      title: 'Orders',
      value: 5,
      previousValue: 4,
      format: 'number',
      trend: 'up',
      goodDirection: 'up',
    },
  },
  {
    id: 'avg-order',
    type: 'kpi',
    colSpan: 1,
    kpiConfig: {
      id: 'avg-order',
      title: 'Average Order',
      value: 4520,
      previousValue: 4625,
      format: 'currency',
      currencySymbol: '$',
      trend: 'down',
      goodDirection: 'up',
    },
  },
  {
    id: COMPLETION_RATE_ID,
    type: 'kpi',
    colSpan: 1,
    kpiConfig: {
      id: COMPLETION_RATE_ID,
      title: 'Completion Rate',
      value: 60,
      previousValue: 50,
      format: 'percent',
      trend: 'up',
      goodDirection: 'up',
    },
  },
  {
    id: REVENUE_STATUS_ID,
    type: 'chart',
    colSpan: 2,
    chartConfig: {
      id: REVENUE_STATUS_ID,
      title: 'Revenue by Status',
      type: 'bar',
      data: [
        { label: 'Completed', value: 15_000 },
        { label: 'Pending', value: 7600 },
      ],
    },
  },
  {
    id: SALES_REGION_ID,
    type: 'chart',
    colSpan: 2,
    chartConfig: {
      id: SALES_REGION_ID,
      title: 'Sales by Region',
      type: 'pie',
      data: [
        { label: NORTH_AMERICA, value: 7800, color: '#3B82F6' },
        { label: 'Europe', value: 7600, color: '#10B981' },
        { label: 'Asia Pacific', value: 7200, color: '#F59E0B' },
      ],
      showLegend: true,
    },
  },
];

/** Static widgets only — does not exercise the live dataSource path. */
export const StaticWidgets = () => (
  <FrappeProvider baseURL={MOCK_HOST}>
    <FrappeDashboard
      title="Sales (static)"
      widgets={widgets}
      columns={4}
    />
  </FrappeProvider>
);
StaticWidgets.parameters = {
  docs: {
    description: {
      story:
        'Static KPI/chart widgets with no dataSource. Prefer LiveFromDataSource when demonstrating fixture/live sync.',
    },
  },
};

/**
 * Live path: fixtures feed useFrappeCollection / useLiveQuery via dataSource,
 * then transformData builds widgets. This is the intended Storybook demo for
 * realtime-backed dashboards (not silent static widgets + unused fixtures).
 */
export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ SalesOrder: salesFixtures })}>
    <FrappeDashboard<SalesOrder>
      title="Sales"
      columns={4}
      dataSource={{
        doctype: 'SalesOrder',
        fields: ['name', 'total', 'status', 'region'],
      }}
      transformData={(rows) => {
        const total = rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
        const completed = rows.filter((r) => r.status === 'Completed');
        const pending = rows.filter((r) => r.status === 'Pending');
        const byRegion = new Map<string, number>();
        for (const r of rows) {
          const region = r.region ?? 'Other';
          byRegion.set(region, (byRegion.get(region) ?? 0) + (Number(r.total) || 0));
        }
        return [
          {
            id: TOTAL_REVENUE_ID,
            type: 'kpi',
            colSpan: 1,
            kpiConfig: {
              id: TOTAL_REVENUE_ID,
              title: TOTAL_REVENUE,
              value: total,
              format: 'currency',
              currencySymbol: '$',
            },
          },
          {
            id: 'orders',
            type: 'kpi',
            colSpan: 1,
            kpiConfig: {
              id: 'orders',
              title: 'Orders',
              value: rows.length,
              format: 'number',
            },
          },
          {
            id: 'avg-order',
            type: 'kpi',
            colSpan: 1,
            kpiConfig: {
              id: 'avg-order',
              title: 'Average Order',
              value: rows.length ? Math.round(total / rows.length) : 0,
              format: 'currency',
              currencySymbol: '$',
            },
          },
          {
            id: COMPLETION_RATE_ID,
            type: 'kpi',
            colSpan: 1,
            kpiConfig: {
              id: COMPLETION_RATE_ID,
              title: 'Completion Rate',
              value: rows.length ? Math.round((completed.length / rows.length) * 100) : 0,
              format: 'percent',
            },
          },
          {
            id: REVENUE_STATUS_ID,
            type: 'chart',
            colSpan: 2,
            chartConfig: {
              id: REVENUE_STATUS_ID,
              title: 'Revenue by Status',
              type: 'bar',
              data: [
                {
                  label: 'Completed',
                  value: completed.reduce((s, r) => s + (Number(r.total) || 0), 0),
                },
                {
                  label: 'Pending',
                  value: pending.reduce((s, r) => s + (Number(r.total) || 0), 0),
                },
              ],
            },
          },
          {
            id: SALES_REGION_ID,
            type: 'chart',
            colSpan: 2,
            chartConfig: {
              id: SALES_REGION_ID,
              title: 'Sales by Region',
              type: 'pie',
              data: [...byRegion.entries()].map(([label, value]) => ({ label, value })),
              showLegend: true,
            },
          },
        ] as DashboardWidget[];
      }}
      widgets={widgets}
    />
  </FrappeProvider>
);
Main.parameters = {
  docs: {
    description: {
      story:
        'Live dataSource + transformData over SalesOrder fixtures (useFrappeCollection / useLiveQuery). Refresh remounts the live query.',
    },
  },
};
Main.storyName = 'Main';

/** Fixture provider whose list fetch never resolves — holds the real collection in loading. */
class PendingFixtureProvider extends InMemoryFixtureProvider {
  // oxlint-disable-next-line eslint/class-methods-use-this -- overrides the FixtureProvider instance method
  async getList(): Promise<never[]> {
    // oxlint-disable-next-line promise/avoid-new, eslint/no-empty-function -- a list fetch that never settles holds the collection in loading
    return await new Promise(() => {});
  }
}

/**
 * Collection stuck syncing: the built-in "Loading dashboard..." panel renders
 * (W9 / DG-ST-02). Spinner, not a dashboard skeleton — LC-20 nuance, see
 * p-results/state-triplet-coverage.md.
 */
export const Loading = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new PendingFixtureProvider()}>
    <FrappeDashboard<SalesOrder>
      title="Sales"
      columns={4}
      dataSource={{ doctype: 'SalesOrder', fields: ['name', 'total', 'status', 'region'] }}
      widgets={widgets}
    />
  </FrappeProvider>
);

/** Zero documents and no static widgets — the Dashboard's neutral empty state (empty ≠ error). */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ SalesOrder: [] })}>
    <FrappeDashboard<SalesOrder>
      title="Sales"
      columns={4}
      dataSource={{ doctype: 'SalesOrder', fields: ['name', 'total', 'status', 'region'] }}
      widgets={[]}
    />
  </FrappeProvider>
);

/** Live path with a broken host — exercises the error render prop (SB-M-806). */
export const LoadError = () => (
  <FrappeProvider baseURL={ERR_HOST}>
    <FrappeDashboard<SalesOrder>
      title="Sales"
      columns={4}
      dataSource={{ doctype: 'SalesOrder', fields: ['name', 'total'] }}
      widgets={widgets}
      // oxlint-disable-next-line react/no-unstable-nested-components -- `error` is a render prop FrappeDashboard calls, not a component it mounts
      error={(err) => (
        <YStack
          padding="$4"
          gap="$2">
          <Text color="$red10">Dashboard failed</Text>
          <Text color="$color10">{err.message}</Text>
        </YStack>
      )}
    />
  </FrappeProvider>
);
LoadError.parameters = {
  docs: {
    description: {
      story: 'dataSource against an unreachable host; custom `error` renderer must display.',
    },
  },
};

// ---------------------------------------------------------------------------
// Live bench dashboard: rows stream through useFrappeCollection/useLiveQuery
// from the STORYBOOK_FRAPPE_URL bench; a realtime change on the doctype shows
// a subtle "updating" affordance until the collection reconciles. Fixtures
// fallback when the bench is down.
// ---------------------------------------------------------------------------

interface ToDoRow {
  name: string;
  doctype: string;
  description: string;
  status: string;
  priority: string;
}

const liveTodoFixtures: ToDoRow[] = [
  {
    name: 'TD-1',
    doctype: 'ToDo',
    description: 'live-agg fixture A',
    status: 'Open',
    priority: 'Medium',
  },
  {
    name: 'TD-2',
    doctype: 'ToDo',
    description: 'live-agg fixture B',
    status: 'Open',
    priority: 'High',
  },
];

export const LiveBenchToDos = () => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ ToDo: liveTodoFixtures })}>
    <FrappeDashboard<ToDoRow>
      title="QA ToDos (live)"
      columns={4}
      dataSource={{
        doctype: 'ToDo',
        fields: ['name', 'description', 'status', 'priority'],
        // narrow window: only harness-created docs, so counts stay honest
        filters: [['description', 'like', '%live-agg%']],
      }}
      transformData={(rows) => {
        const open = rows.filter((r) => r.status === 'Open');
        const byPriority = new Map<string, number>();
        for (const r of rows) {
          const p = r.priority ?? 'Medium';
          byPriority.set(p, (byPriority.get(p) ?? 0) + 1);
        }
        return [
          {
            id: 'qa-todo-count',
            type: 'kpi',
            colSpan: 1,
            kpiConfig: {
              id: 'qa-todo-count',
              title: 'QA ToDos',
              value: rows.length,
              format: 'number',
            },
          },
          {
            id: 'qa-todo-open',
            type: 'kpi',
            colSpan: 1,
            kpiConfig: {
              id: 'qa-todo-open',
              title: 'Open',
              value: open.length,
              format: 'number',
            },
          },
          {
            id: 'qa-todo-priority',
            type: 'chart',
            colSpan: 2,
            chartConfig: {
              id: 'qa-todo-priority',
              title: 'By Priority',
              type: 'bar',
              data: [...byPriority.entries()].map(([label, value]) => ({ label, value })),
            },
          },
        ] as DashboardWidget[];
      }}
      widgets={[]}
    />
  </FrappeStoryProvider>
);
LiveBenchToDos.parameters = {
  docs: {
    description: {
      story:
        "LIVE dashboard over the bench's ToDo doctype (filtered to harness-created docs). Rows stream through the sync engine; realtime events show a subtle updating affordance in the header until the data reconciles. Falls back to fixtures when the bench is unreachable.",
    },
  },
};

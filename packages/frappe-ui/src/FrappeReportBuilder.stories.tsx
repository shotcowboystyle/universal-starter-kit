import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';

import { FrappeProvider } from './FrappeProvider';
import { FrappeReportBuilder } from './FrappeReportBuilder';
import { FrappeStoryProvider } from './frappeStoryTarget';

export default {
  title: 'FrappeUI/FrappeReportBuilder',
  component: FrappeReportBuilder,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "A doctype's report view, the one the desk's view=report renders: desk default columns, a per-column filter row, group-by, totals, saved reports, CSV export and paging. Meta from an in-story fetch mock; rows from fixtures.",
      },
    },
  },
  argTypes: {
    showChart: { control: 'boolean' },
  },
};

const MOCK_HOST = 'https://report.mock.test';
const ERR_HOST = 'https://forbidden.report.mock.test';
const GUEST_HOST = 'https://guest.report.mock.test';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function saleMeta(name: string) {
  return {
    name,
    module: 'QA',
    title_field: 'customer',
    fields: [
      { fieldname: 'customer', fieldtype: 'Data', label: 'Customer', in_list_view: 1 },
      { fieldname: 'amount', fieldtype: 'Currency', label: 'Amount', in_list_view: 1 },
      {
        fieldname: 'region',
        fieldtype: 'Select',
        label: 'Region',
        options: 'North\nSouth\nEast\nWest',
        in_list_view: 1,
        in_standard_filter: 1,
      },
      {
        fieldname: 'status',
        fieldtype: 'Select',
        label: 'Status',
        options: 'Draft\nSubmitted\nPaid',
        in_standard_filter: 1,
      },
      { fieldname: 'sale_date', fieldtype: 'Date', label: 'Sale Date' },
      { fieldname: 'layout_break', fieldtype: 'Section Break', label: 'Break' },
    ],
    permissions: [{ role: 'All', read: 1 }],
  };
}

(() => {
  const w = window as unknown as Record<string, unknown>;
  if (w.__frappeReportMockFetch) {
    return;
  }
  w.__frappeReportMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(GUEST_HOST)) {
      const url = new URL(urlStr);
      return url.pathname === '/api/resource/QaSaleGuest'
        ? jsonResponse({ data: makeSales('QaSaleGuest', 1) })
        : jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: saleMeta(decodeURIComponent(metaMatch[1])) });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

function makeSales(doctype: string, count: number) {
  const customers = ['ACME Corp', 'Globex', 'Initech', 'Umbrella', 'Stark Industries'];
  const regions = ['North', 'South', 'East', 'West'];
  const statuses = ['Draft', 'Submitted', 'Paid'];
  return Array.from({ length: count }, (_, i) => ({
    name: `${doctype.toUpperCase()}-${String(i + 1).padStart(4, '0')}`,
    doctype,
    customer: customers[i % customers.length],
    amount: Math.round(((i * 7919) % 100_000) + 500),
    region: regions[i % regions.length],
    status: statuses[i % statuses.length],
    sale_date: `2026-0${(i % 6) + 1}-15`,
  }));
}

const fixturesFor = (doctype: string, count: number) =>
  new InMemoryFixtureProvider({ [doctype]: makeSales(doctype, count) });

export const Main = (args: Record<string, unknown>) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={fixturesFor('QaSale', 15)}>
    <FrappeReportBuilder
      doctype="QaSale"
      onExport={action('onExport')}
      height={640}
      {...args}
    />
  </FrappeProvider>
);
Main.args = { showChart: false };
Main.storyName = 'Main';

export const WithChart = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={fixturesFor('QaSaleChart', 15)}>
    <FrappeReportBuilder
      doctype="QaSaleChart"
      showChart
      initialGroupBy={{ field: 'region', aggregation: 'sum', aggregationField: 'amount' }}
      height={720}
    />
  </FrappeProvider>
);

/** Meta present, zero rows: builder chrome with an empty data grid. */
export const EmptyData = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ QaSaleEmpty: [] })}>
    <FrappeReportBuilder
      doctype="QaSaleEmpty"
      height={480}
    />
  </FrappeProvider>
);

/**
 * Meta endpoint 403s with explicit initialColumns: a reader refused the
 * schema still gets the rows, laid out from those columns, with nothing to
 * save (LC-96).
 */
export const InitialColumnsNoMeta = () => (
  <FrappeProvider
    baseURL={ERR_HOST}
    fixtures={fixturesFor('QaSaleNoMeta', 8)}>
    <FrappeReportBuilder
      doctype="QaSaleNoMeta"
      initialColumns={[
        { fieldname: 'customer', label: 'Customer', fieldtype: 'Data', enabled: true },
        { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', enabled: true },
        { fieldname: 'region', label: 'Region', fieldtype: 'Select', enabled: false },
      ]}
      height={480}
    />
  </FrappeProvider>
);

/**
 * Meta refused, one record readable: the columns come from that record's own
 * fields, labelled from their keys, and there is nothing to save (LC-96).
 */
export const GuestRecordShape = () => (
  <FrappeProvider
    baseURL={GUEST_HOST}
    fixtures={fixturesFor('QaSaleGuest', 8)}>
    <FrappeReportBuilder
      doctype="QaSaleGuest"
      height={480}
    />
  </FrappeProvider>
);

/**
 * Meta and records both refused: a permission state that says what the reader
 * can't do, with no retry (LC-96).
 */
export const GuestRefused = () => (
  <FrappeProvider
    baseURL={ERR_HOST}
    fixtures={fixturesFor('QaSaleRefused', 8)}>
    <FrappeReportBuilder
      doctype="QaSaleRefused"
      height={480}
    />
  </FrappeProvider>
);

// ---------------------------------------------------------------------------
// Live bench report: rows over the bench's ToDo doctype stream through the
// sync engine and refresh in place on realtime events while the chosen
// columns and group-by survive untouched. Fixtures stand in when the bench is
// unreachable.
// ---------------------------------------------------------------------------

const liveTodoFixtures = new InMemoryFixtureProvider({
  ToDo: [
    {
      name: 'TD-1',
      doctype: 'ToDo',
      description: 'Fixture todo A',
      status: 'Open',
      priority: 'Medium',
    },
    {
      name: 'TD-2',
      doctype: 'ToDo',
      description: 'Fixture todo B',
      status: 'Open',
      priority: 'High',
    },
    {
      name: 'TD-3',
      doctype: 'ToDo',
      description: 'Fixture todo C',
      status: 'Closed',
      priority: 'Low',
    },
  ],
});

export const LiveBenchToDos = () => (
  <FrappeStoryProvider fixtures={liveTodoFixtures}>
    <FrappeReportBuilder
      doctype="ToDo"
      initialColumns={[
        { fieldname: 'name', label: 'ID', fieldtype: 'Data', enabled: true },
        { fieldname: 'description', label: 'Description', fieldtype: 'Text', enabled: true },
        { fieldname: 'status', label: 'Status', fieldtype: 'Select', enabled: true },
        { fieldname: 'priority', label: 'Priority', fieldtype: 'Select', enabled: true },
      ]}
      height={560}
    />
  </FrappeStoryProvider>
);
LiveBenchToDos.parameters = {
  docs: {
    description: {
      story:
        "LIVE report over the bench's ToDo doctype. Create/delete ToDos on the bench and the result rows refresh in place (realtime event → sync engine reconcile) without touching the chosen columns or group-by. Falls back to fixtures when the bench is down.",
    },
  },
};

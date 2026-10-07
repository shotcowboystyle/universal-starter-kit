// Catalog Text (G-15 story honesty / D-05).
import { Text } from '@repo/ui';
import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import type { DataTableColumn } from '@repo/table';

import { FrappeProvider } from './FrappeProvider';
import { FrappeStoryProvider } from './frappeStoryTarget';
import { FrappeTable } from './FrappeTable';

export default {
  title: 'FrappeUI/FrappeTable',
  component: FrappeTable,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Table over useFrappeCollection / useLiveQuery (client) or Frappe REST (serverSide). Fixture stories are network-hermetic (G-15/D-05): documents and DocType meta both come from InMemoryFixtureProvider, so nothing leaves the machine. The separately-named Live and ServerSide stories are the live-bench arm — they target STORYBOOK_FRAPPE_URL when reachable and fall back to fixtures otherwise.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05, closes UX-P18).
//
// Fixture-backed stories carry a baseURL the way a generated app does, and
// FrappeTable under a fixture corpus reads DocType meta from the corpus's
// "DocType" entry, never that host (MPO-230). MOCK_HOST still answers
// anything else locally so no stray request leaves the machine; ERR_HOST is
// the deliberate failure host for the error-state story.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappetable.mock.test';
const ERR_HOST = 'https://forbidden.frappetable.mock.test';

function customerMetaRaw(name: string) {
  return {
    name,
    doctype: 'DocType',
    module: 'Selling',
    title_field: 'customer_name',
    fields: [
      { fieldname: 'customer_name', fieldtype: 'Data', label: 'Customer Name', in_list_view: 1 },
      {
        fieldname: 'customer_type',
        fieldtype: 'Select',
        label: 'Customer Type',
        options: 'Company\nIndividual',
        in_list_view: 1,
        in_standard_filter: 1,
      },
      { fieldname: 'territory', fieldtype: 'Data', label: 'Territory', in_list_view: 1 },
      {
        fieldname: 'status',
        fieldtype: 'Select',
        label: 'Status',
        options: 'Active\nInactive\nLead',
        in_list_view: 1,
        in_standard_filter: 1,
      },
      { fieldname: 'creation', fieldtype: 'Date', label: 'Created On' },
    ],
    permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as Record<string, unknown>;
  if (w.__frappeTableMockFetch) {
    return;
  }
  w.__frappeTableMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'Customer', module: 'Selling' }] });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

interface Customer {
  name: string;
  doctype: string;
  customer_name: string;
  customer_type: string;
  territory: string;
  status: string;
  creation: string;
}

const customerFixtures: Customer[] = [
  {
    name: 'CUST-001',
    doctype: 'Customer',
    customer_name: 'Acme Corp',
    customer_type: 'Company',
    territory: 'United States',
    status: 'Active',
    creation: '2025-01-15',
  },
  {
    name: 'CUST-002',
    doctype: 'Customer',
    customer_name: 'Global Tech',
    customer_type: 'Company',
    territory: 'Europe',
    status: 'Active',
    creation: '2025-02-20',
  },
  {
    name: 'CUST-003',
    doctype: 'Customer',
    customer_name: 'John Smith',
    customer_type: 'Individual',
    territory: 'United States',
    status: 'Active',
    creation: '2025-03-10',
  },
  {
    name: 'CUST-004',
    doctype: 'Customer',
    customer_name: 'Jane Doe',
    customer_type: 'Individual',
    territory: 'Asia Pacific',
    status: 'Inactive',
    creation: '2024-12-05',
  },
  {
    name: 'CUST-005',
    doctype: 'Customer',
    customer_name: 'Tech Solutions',
    customer_type: 'Company',
    territory: 'Europe',
    status: 'Lead',
    creation: '2025-04-01',
  },
  {
    name: 'CUST-006',
    doctype: 'Customer',
    customer_name: 'Startup Inc',
    customer_type: 'Company',
    territory: 'United States',
    status: 'Active',
    creation: '2025-05-15',
  },
  {
    name: 'CUST-007',
    doctype: 'Customer',
    customer_name: 'Bob Wilson',
    customer_type: 'Individual',
    territory: 'Europe',
    status: 'Active',
    creation: '2025-06-20',
  },
  {
    name: 'CUST-008',
    doctype: 'Customer',
    customer_name: 'Enterprise Ltd',
    customer_type: 'Company',
    territory: 'Asia Pacific',
    status: 'Inactive',
    creation: '2024-11-30',
  },
];

function customerCorpus(customers: Customer[] = customerFixtures): InMemoryFixtureProvider {
  return new InMemoryFixtureProvider({
    DocType: [customerMetaRaw('Customer')],
    Customer: customers,
  });
}

const customerColumns: DataTableColumn<Partial<Customer>>[] = [
  { id: 'name', header: 'ID', accessorKey: 'name' },
  { id: 'customer_name', header: 'Customer Name', accessorKey: 'customer_name' },
  { id: 'customer_type', header: 'Type', accessorKey: 'customer_type' },
  { id: 'territory', header: 'Territory', accessorKey: 'territory' },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    cell: ({ getValue }) => {
      const status = getValue() as string;
      // Step-11 theme ramps: AA for small bold text where the raw brand
      // hexes (#10B981 etc.) measured under 4.5:1 on light surfaces.
      const colors: Record<string, string> = {
        Active: '$green11',
        Inactive: '$red11',
        Lead: '$yellow11',
      };
      return (
        <Text
          color={colors[status] || '$gray11'}
          fontWeight="500">
          {status}
        </Text>
      );
    },
  },
  { id: 'creation', header: 'Created', accessorKey: 'creation' },
];

export const Default = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={customerCorpus()}>
    <FrappeTable<Customer>
      doctype="Customer"
      columns={customerColumns}
      // Rest mid-page: single-page/first-page rest leaves the footer nav
      // bare-disabled, tripping the `[theme]` guardrail (UX-P19 / DG-ST-03).
      initialState={{ pagination: { pageIndex: 1, pageSize: 3 } }}
      onRowClick={action('onRowClick')}
    />
  </FrappeProvider>
);
Default.parameters = {
  docs: {
    description: {
      story: 'Basic data table connected to a Frappe Customer doctype.',
    },
  },
};

Default.storyName = 'Main';
export const WithPagination = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={customerCorpus()}>
    <FrappeTable<Customer>
      doctype="Customer"
      columns={customerColumns}
      enablePagination
      initialState={{ pagination: { pageIndex: 1, pageSize: 3 } }}
      onRowClick={action('onRowClick')}
    />
  </FrappeProvider>
);
WithPagination.parameters = {
  docs: {
    description: {
      story: 'Table with pagination controls for large datasets.',
    },
  },
};

export const WithSavedFilters = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={customerCorpus()}>
    <FrappeTable<Customer>
      doctype="Customer"
      columns={customerColumns}
      savedFilters
      canCreateGlobalFilters
      userId="admin@example.com"
      onRowClick={action('onRowClick')}
    />
  </FrappeProvider>
);
WithSavedFilters.parameters = {
  docs: {
    description: {
      story: 'Table with saved filters feature for saving and loading filter presets.',
    },
  },
};

interface ToDoRow {
  name: string;
  doctype: string;
  description: string;
  status: string;
  priority: string;
  date: string;
}

const serverSideTodoFixtures: ToDoRow[] = Array.from({ length: 30 }, (_, i) => ({
  name: `TODO-${String(i + 1).padStart(3, '0')}`,
  doctype: 'ToDo',
  description: `Task ${i + 1}: ${['Review document', 'Update code', 'Write tests', 'Fix bug', 'Deploy app'][i % 5]}`,
  status: ['Open', 'Closed', 'Cancelled'][i % 3],
  priority: ['Low', 'Medium', 'High'][i % 3],
  date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
}));

// FrappeTable rows are Partial<T> (only requested `fields` are fetched).
const todoColumns: DataTableColumn<Partial<ToDoRow>>[] = [
  { id: 'name', header: 'ID', accessorKey: 'name' },
  { id: 'description', header: 'Description', accessorKey: 'description' },
  { id: 'status', header: 'Status', accessorKey: 'status' },
  { id: 'priority', header: 'Priority', accessorKey: 'priority' },
  { id: 'date', header: 'Due Date', accessorKey: 'date' },
];

/**
 * Client-mode live table against the real bench (STORYBOOK_FRAPPE_URL,
 * default the local dev bench proxied by the Storybook dev server). Rows are
 * driven by realtime subscriptions: external creates insert per sort,
 * doc_update patches the row in place, doc_deleted evicts it — no reload,
 * and DataTable sort/filter/pagination state survives every event. Falls
 * back to fixtures when the bench is unreachable.
 */
export const Live = () => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ ToDo: serverSideTodoFixtures })}>
    <FrappeTable<ToDoRow>
      doctype="ToDo"
      columns={todoColumns}
      fields={['name', 'description', 'status', 'priority', 'date']}
      // All rows on one page: live inserts are visible wherever the
      // subscription orders them (no server-defined sort on this doctype).
      enablePagination={false}
      onRowClick={action('onRowClick')}
    />
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'Live client-mode table: useFrappeCollection + useLiveQuery with realtime events (doc_update patches in place, doc_deleted evicts, creates insert). Shows a reconnect pill while the socket is down and an honest error panel on permission/network failure. Fixture fallback when the bench is down.',
    },
  },
};

/**
 * Server-side mode uses the Frappe REST API (getDocList) for filtering, sorting, and pagination.
 * Targets the bench selected by STORYBOOK_FRAPPE_URL (default: the local dev bench, proxied by
 * the Storybook dev server) when it is reachable; falls back to fixtures otherwise. Uses the
 * ToDo doctype, which exists on a stock bench.
 */
export const ServerSide = () => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ ToDo: serverSideTodoFixtures })}>
    <FrappeTable<ToDoRow>
      doctype="ToDo"
      columns={todoColumns}
      fields={['name', 'description', 'status', 'priority', 'date']}
      serverSide
      onStateChange={action('onStateChange')}
    />
  </FrappeStoryProvider>
);
ServerSide.parameters = {
  docs: {
    description: {
      story:
        'Server-side filtering, sorting, and pagination. Uses Frappe REST API (limit_start, limit_page_length, order_by, filters) against the live bench when STORYBOOK_FRAPPE_URL (default http://localhost:8000) is reachable; renders from fixtures when it is not.',
    },
  },
};

// ---------------------------------------------------------------------------
// Honest async states (Axiom 6 / W9 / DG-TBL-06): loading ≠ empty ≠ no-results ≠ error
// ---------------------------------------------------------------------------

/** Fixture provider whose list fetch never resolves — holds the real collection in loading. */
class PendingFixtureProvider extends InMemoryFixtureProvider {
  async getList(): Promise<never[]> {
    return await new Promise(() => {});
  }
}

/** Collection stuck syncing: the built-in loading panel renders (W9 / DG-ST-02). */
export const Loading = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new PendingFixtureProvider({ DocType: [customerMetaRaw('Customer')] })}>
    <FrappeTable<Customer>
      doctype="Customer"
      columns={customerColumns}
    />
  </FrappeProvider>
);

/** Zero documents, no filters, no failure — "No Customer records found" (empty ≠ error). */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={customerCorpus([])}>
    <FrappeTable<Customer>
      doctype="Customer"
      columns={customerColumns}
    />
  </FrappeProvider>
);

/**
 * Documents exist but an active filter matches none: the DataTable's
 * "No results found" state with the filter chip still visible — distinct
 * from Empty per DG-TBL-06.
 */
export const NoResults = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={customerCorpus()}>
    <FrappeTable<Customer>
      doctype="Customer"
      columns={customerColumns}
      enableFiltering
      initialState={{
        filters: [
          {
            id: 'no-results-filter',
            columnId: 'customer_name',
            value: { operator: 'contains', value: 'zzz-no-match' },
          },
        ],
      }}
    />
  </FrappeProvider>
);

/**
 * Collection that fails with no fixtures: the built-in error panel renders
 * instead of empty chrome (DG-ST-01). The failure is served hermetically —
 * the in-story mock answers ERR_HOST with 403, so the error state is
 * reproducible offline instead of depending on a DNS miss. Note: no retry
 * affordance exists on this panel — tracked as a component gap in
 * p-results/state-triplet-coverage.md.
 */
export const LoadError = () => (
  <FrappeProvider baseURL={ERR_HOST}>
    <FrappeTable<Customer>
      doctype="Customer"
      columns={customerColumns}
    />
  </FrappeProvider>
);

// ---------------------------------------------------------------------------
// Hidden-field filtering (toolbar Filter surface)
// ---------------------------------------------------------------------------

/** Only ID and Customer Name are visible columns. */
const minimalCustomerColumns: DataTableColumn<Partial<Customer>>[] = [
  { id: 'name', header: 'ID', accessorKey: 'name' },
  { id: 'customer_name', header: 'Customer Name', accessorKey: 'customer_name' },
];

/**
 * Omitted, FrappeTable derives this list from the doctype meta
 * (docFieldsToFilterFields), here the corpus's DocType entry. The story
 * passes the equivalent list explicitly to show the prop — same contract,
 * same UI.
 */
const customerFilterFields = [
  { id: 'territory', label: 'Territory', type: 'text' as const },
  {
    id: 'customer_type',
    label: 'Customer Type',
    type: 'select' as const,
    options: [
      { label: 'Company', value: 'Company' },
      { label: 'Individual', value: 'Individual' },
    ],
  },
  {
    id: 'status',
    label: 'Status',
    type: 'select' as const,
    options: [
      { label: 'Active', value: 'Active' },
      { label: 'Inactive', value: 'Inactive' },
      { label: 'Lead', value: 'Lead' },
    ],
  },
  { id: 'creation', label: 'Created On', type: 'date' as const },
];

/**
 * Owner ask: filter on columns that are NOT visible. Territory, type,
 * status, and creation date have no column here — the toolbar "Filter"
 * surface (searchable field list → live-commit operator/value editor)
 * filters them, and every active filter renders as a removable chip.
 * The anti-pattern this replaces is Frappe desk's cramped stacked
 * field/operator/value dropdown.
 */
export const HiddenFieldFilters = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={customerCorpus()}>
    <FrappeTable<Customer>
      doctype="Customer"
      columns={minimalCustomerColumns}
      filterableFields={customerFilterFields}
      enableFiltering
      enablePagination
    />
  </FrappeProvider>
);
HiddenFieldFilters.parameters = {
  docs: {
    description: {
      story:
        'Filtering on doctype fields that are not visible columns via the toolbar Filter surface. Active filters render as chips (press to edit, X to remove).',
    },
  },
};

// ListSidebar against a stubbed bench (MPO-414): the facet RPCs it sends,
// the rows it draws from them, and the desk toggle semantics a row press
// writes through onFiltersChange.
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import type { BackofficeCapabilities } from '../config/capabilities';
import { createMemoryNavigator } from '../navigation/navigator';
import type { FrappeFilters } from '../shared/types';
import type { DoctypeMeta } from '../shared/use-doctype-meta';

import { ListSidebar } from './ListSidebar';
import type { ListSidebarSection } from './ListSidebar';

const todoMeta: DoctypeMeta = {
  name: 'ToDo',
  fields: [
    { fieldname: 'status', fieldtype: 'Select', label: 'Status', options: 'Open\nClosed' },
    { fieldname: 'description', fieldtype: 'Text Editor', label: 'Description' },
  ],
};

interface FacetCall {
  method: string;
  body: Record<string, string>;
}

let run = 0;
let calls: FacetCall[] = [];
let failFacets = false;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- fixture JSON bodies are arbitrary
const json = (body: unknown, status = 200) => Response.json(body, { status });

const groupBy = new Map<string, { name: string | null; count: number }[]>([
  [
    'assigned_to',
    [
      { name: 'jane@example.com', count: 2 },
      { name: 'Administrator', count: 1 },
      { name: null, count: 3 },
    ],
  ],
  [
    'owner',
    [
      { name: 'joe@example.com', count: 2 },
      { name: 'jane@example.com', count: 1 },
      { name: 'Guest', count: 1 },
    ],
  ],
]);

const columnStats = new Map<string, [string, number][]>([
  [
    '_user_tags',
    [
      ['urgent', 2],
      ['No Tags', 1],
    ],
  ],
  [
    'status',
    [
      ['Closed', 1],
      ['Open', 3],
      ['', 2],
    ],
  ],
]);

const isText = (value: unknown): value is string => typeof value === 'string';

interface SidebarOptions {
  meta?: DoctypeMeta;
  filters?: FrappeFilters;
  hiddenSections?: ListSidebarSection[];
  capabilities?: BackofficeCapabilities;
}

const renderSidebar = ({ meta = todoMeta, filters = [], hiddenSections, capabilities }: SidebarOptions = {}) => {
  const onFiltersChange = vi.fn<(filters: FrappeFilters) => void>();
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://list-sidebar-${run}.spec.test` }}
      navigation={createMemoryNavigator('/backoffice/ToDo')}
      capabilities={capabilities}>
      <ListSidebar
        doctype="ToDo"
        meta={meta}
        filters={filters}
        onFiltersChange={onFiltersChange}
        hiddenSections={hiddenSections}
      />
    </BackofficeProvider>,
  );
  return { onFiltersChange };
};

const facetRow = (label: string) => screen.getByRole('button', { name: label });

describe(ListSidebar, () => {
  beforeEach(() => {
    run += 1;
    calls = [];
    failFacets = false;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const method = url.pathname.replace(/^\/api\/method\//u, '');
      const raw = isText(init?.body) ? init.body : '';
      const body = (raw.startsWith('{') ? JSON.parse(raw) : {}) as Record<string, string>;
      if (method === 'frappe.auth.get_logged_user') {
        return json({ message: 'jane@example.com' });
      }
      if (method.startsWith('frappe.desk.')) {
        calls.push({ method, body });
        if (failFacets) {
          return json({ exc_type: 'PermissionError' }, 403);
        }
      }
      if (method === 'frappe.desk.listview.get_group_by_count') {
        return json({ message: groupBy.get(body.field) ?? [] });
      }
      if (method === 'frappe.desk.reportview.get_sidebar_stats') {
        const [fieldname] = JSON.parse(body.stats) as string[];
        return json({ message: { stats: { [fieldname]: columnStats.get(fieldname) ?? [] } } });
      }
      return json({ data: [], message: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws each facet from the bench, the session user pinned as Me and desk noise scrubbed', async () => {
    renderSidebar();
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Me' })).toHaveLength(2);
    });
    for (const title of ['Assigned To', 'Created By', 'Tags', 'Status']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(facetRow('joe@example.com').textContent).toContain('2');
    expect(facetRow('Open').textContent).toContain('3');
    expect(facetRow('urgent')).toBeTruthy();
    expect(facetRow('No Tags')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Administrator' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guest' })).toBeNull();
  });

  it('counts each facet under every filter but its own', async () => {
    renderSidebar({
      filters: [
        ['status', '=', 'Open'],
        ['owner', '=', 'joe@example.com'],
      ],
    });
    await waitFor(() => {
      expect(calls).toHaveLength(4);
    });
    const owner = calls.find((call) => call.body.field === 'owner');
    expect(owner?.body).toMatchObject({
      doctype: 'ToDo',
      current_filters: JSON.stringify([['status', '=', 'Open']]),
    });
    const status = calls.find((call) => call.body.stats === JSON.stringify(['status']));
    expect(status?.body.filters).toBe(JSON.stringify([['owner', '=', 'joe@example.com']]));
  });

  it("replaces a facet's filter on press and clears it when the active row is pressed", async () => {
    const filters: FrappeFilters = [
      ['owner', '=', 'joe@example.com'],
      ['status', '=', 'Closed'],
    ];
    const { onFiltersChange } = renderSidebar({ filters });
    await waitFor(() => {
      expect(facetRow('Open')).toBeTruthy();
    });
    expect(facetRow('Closed').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(facetRow('Open'));
    expect(onFiltersChange).toHaveBeenLastCalledWith([
      ['owner', '=', 'joe@example.com'],
      ['status', '=', 'Open'],
    ]);
    fireEvent.click(facetRow('Closed'));
    expect(onFiltersChange).toHaveBeenLastCalledWith([['owner', '=', 'joe@example.com']]);
    fireEvent.click(facetRow('No Tags'));
    expect(onFiltersChange).toHaveBeenLastCalledWith([...filters, ['_user_tags', 'not like', '%,%']]);
  });

  it('drops sections hidden by the host or its capabilities, and the status facet without a status field', async () => {
    renderSidebar({
      meta: { name: 'ToDo', fields: [] },
      hiddenSections: ['owner'],
      capabilities: { tags: false },
    });
    await waitFor(() => {
      expect(facetRow('Me')).toBeTruthy();
    });
    expect(screen.getByText('Assigned To')).toBeTruthy();
    for (const title of ['Created By', 'Tags', 'Status']) {
      expect(screen.queryByText(title)).toBeNull();
    }
    expect(calls.some((call) => call.body.stats === JSON.stringify(['status']))).toBe(false);
  });

  it('says the sidebar is unavailable when every facet fails', async () => {
    failFacets = true;
    renderSidebar();
    await expect(screen.findByText('Filters sidebar unavailable')).resolves.toBeTruthy();
  });
});

// The desk Connections tab (MPO-414): meta.links grouped with get_open_count
// badges, rows open the filtered target list, + opens a prefilled new doc,
// and a failed get_open_count falls back to get_count per external link.
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';
import type { DoctypeMeta } from '../shared/use-doctype-meta';

import { FormConnections } from './FormConnections';

type Json = string | number | boolean | null | Json[] | JsonObject;
interface JsonObject {
  [key: string]: Json;
}

const projectMeta: DoctypeMeta = {
  name: 'QA Project',
  fields: [],
  links: [
    { link_doctype: 'Contact', link_fieldname: 'project', group: 'Profile' },
    { link_doctype: 'Blogger', link_fieldname: 'project', group: 'Profile' },
    { link_doctype: 'Access Log', link_fieldname: 'project', group: 'Logs' },
    { link_doctype: 'ToDo', link_fieldname: 'project' },
    { link_doctype: 'Note', link_fieldname: 'project', group: 'Logs', hidden: 1 },
    {
      link_doctype: 'QA Invoice Item',
      link_fieldname: 'qa_invoice',
      parent_doctype: 'QA Invoice',
      table_fieldname: 'items',
      is_child_table: 1,
      group: 'Billing',
    },
  ],
};

const openCount = {
  message: {
    count: {
      external_links_found: [
        { doctype: 'Contact', count: 3, open_count: 1 },
        { doctype: 'Blogger', count: 0, open_count: 0 },
        { doctype: 'Access Log', count: 120, open_count: 0 },
        { doctype: 'ToDo', count: 5, open_count: 2 },
      ],
      internal_links_found: [{ doctype: 'QA Invoice', count: 2, open_count: 0, names: ['QA-INV-001', 'QA-INV-002'] }],
    },
  },
};

let host = 0;
let openCountFails = false;
let requests: URL[] = [];

const json = (body: Json, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });

const renderConnections = (meta: DoctypeMeta = projectMeta) => {
  const navigation = createMemoryNavigator('/backoffice/qa-project/QA-PROJ-0001');
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://connections-${host}.screen.spec.test` }}
      navigation={navigation}>
      <FormConnections
        doctype="QA Project"
        name="QA-PROJ-0001"
        meta={meta}
      />
    </BackofficeProvider>,
  );
  return navigation;
};

const row = (doctype: string): HTMLElement => screen.getByRole('link', { name: doctype });

describe(FormConnections, () => {
  beforeEach(() => {
    host += 1;
    openCountFails = false;
    requests = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      requests.push(url);
      if (url.pathname === '/api/method/frappe.desk.notifications.get_open_count') {
        return openCountFails ? json({ exc_type: 'PermissionError' }, 403) : json(openCount);
      }
      if (url.pathname === '/api/method/frappe.client.get_count') {
        return json({ message: url.searchParams.get('doctype') === 'Contact' ? 4 : 0 });
      }
      return json({ message: null });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('groups visible links and badges their counts', async () => {
    renderConnections();
    await waitFor(() => {
      expect(within(row('Contact')).getByText('3')).toBeTruthy();
    });
    for (const heading of ['Profile', 'Logs', 'Reference', 'Billing']) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
    expect(screen.queryByRole('link', { name: 'Note' })).toBeNull();
    expect(within(row('Contact')).getByText('1')).toBeTruthy();
    expect(within(row('Access Log')).getByText('99+')).toBeTruthy();
    expect(row('Blogger').textContent).toBe('Blogger');
  });

  it('opens the target list filtered to this document', async () => {
    const navigation = renderConnections();
    await waitFor(() => {
      expect(within(row('Contact')).getByText('3')).toBeTruthy();
    });
    fireEvent.click(row('Contact'));
    const location = navigation.getLocation();
    expect(location.path).toBe('/backoffice/contact');
    expect(JSON.parse(String(location.params.f))).toStrictEqual([['project', '=', 'QA-PROJ-0001']]);
    fireEvent.click(row('QA Invoice'));
    expect(JSON.parse(String(navigation.getLocation().params.f))).toStrictEqual([
      ['name', 'in', ['QA-INV-001', 'QA-INV-002']],
    ]);
  });

  it('creates a linked document with the back-reference prefilled', async () => {
    const navigation = renderConnections();
    await waitFor(() => {
      expect(within(row('Contact')).getByText('3')).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText('New Contact'));
    const location = navigation.getLocation();
    expect(location.path).toBe('/backoffice/contact/new');
    expect(JSON.parse(String(location.params.d))).toStrictEqual({ project: 'QA-PROJ-0001' });
  });

  it('falls back to get_count and disables the uncounted internal link', async () => {
    openCountFails = true;
    const navigation = renderConnections();
    await waitFor(
      () => {
        expect(within(row('Contact')).getByText('4')).toBeTruthy();
      },
      {
        timeout: 5000,
      },
    );
    const counted = requests
      .filter((url) => url.pathname === '/api/method/frappe.client.get_count')
      .map((url) => url.searchParams.get('doctype') ?? '')
      .toSorted((a, b) => a.localeCompare(b));
    expect(counted).toStrictEqual(['Access Log', 'Blogger', 'Contact', 'ToDo']);
    fireEvent.click(row('QA Invoice'));
    expect(navigation.getLocation().path).toBe('/backoffice/qa-project/QA-PROJ-0001');
  });

  it('says so when the doctype links nowhere', async () => {
    renderConnections({ name: 'QA Loner', fields: [], links: [] });
    await expect(screen.findByText('No connections')).resolves.toBeTruthy();
    expect(requests).toHaveLength(0);
  });
});

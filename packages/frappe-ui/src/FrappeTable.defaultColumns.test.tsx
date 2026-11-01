/**
 * FrappeTable without `columns` (MPO-15 AC4).
 *
 * The prop used to be required, so the doctype-aware table could not render
 * a doctype unless its caller did the meta work. Omitted now, the columns
 * come from meta through `buildListColumns`, the same derivation the desk
 * list screen calls: title, the in_list_view fields the session may read,
 * the activity cluster, and the `modified` sort key kept hidden. A bench read
 * waits for meta and the roles, then asks once for `listFieldsToFetch`.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { DoctypeMeta } from './formEngine/doctype-meta';
import { buildPermLevelMatrix } from './formEngine/field-permissions';
import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';
import { buildListColumns } from './list/list-columns';
import { listFieldsToFetch } from './list/list-fields';

interface Customer {
  name: string;
  doctype: string;
  customer_name: string;
  status: string;
  territory: string;
  credit_limit: number;
  modified: string;
}

const metaDoc = {
  name: 'Customer',
  doctype: 'DocType',
  module: 'Selling',
  title_field: 'customer_name',
  fields: [
    { fieldname: 'customer_name', fieldtype: 'Data', label: 'Customer Name', in_list_view: 1 },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Active\nLead',
      in_list_view: 1,
    },
    {
      fieldname: 'territory',
      fieldtype: 'Link',
      label: 'Territory',
      options: 'Territory',
      in_list_view: 1,
    },
    {
      fieldname: 'credit_limit',
      fieldtype: 'Currency',
      label: 'Credit Limit',
      in_list_view: 1,
      permlevel: 1,
    },
    { fieldname: 'notes', fieldtype: 'Text', label: 'Notes' },
  ],
  permissions: [
    { role: 'Sales User', permlevel: 0, read: 1, write: 1, create: 1 },
    { role: 'Sales Manager', permlevel: 1, read: 1, write: 1 },
  ],
};
const meta = metaDoc as unknown as DoctypeMeta;

const customers: Customer[] = [
  {
    name: 'CUST-001',
    doctype: 'Customer',
    customer_name: 'Acme Corp',
    status: 'Active',
    territory: 'North',
    credit_limit: 5000,
    modified: '2026-09-20 10:00:00',
  },
  {
    name: 'CUST-002',
    doctype: 'Customer',
    customer_name: 'Globex',
    status: 'Lead',
    territory: 'South',
    credit_limit: 900,
    modified: '2026-09-21 10:00:00',
  },
];

const headerText = (container: HTMLElement): string =>
  container.querySelector('[aria-label="Table headers"]')?.textContent ?? '';

/** The envelope fields the stubbed bench answers with. */
interface BenchReply {
  docs?: unknown[];
  data?: unknown[];
  message?: unknown;
}

const json = (body: BenchReply): Response =>
  Response.json(body, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('FrappeTable without columns', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('FrappeTable without columns, over a fixture corpus', () => {
    it('renders the desk list columns buildListColumns derives from meta', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        throw new Error(`unexpected network request: ${input instanceof Request ? input.url : input.toString()}`);
      });
      const { container } = renderWithProviders(
        <FrappeProvider
          baseURL="https://frappetable-default-columns.spec.test"
          fixtures={new InMemoryFixtureProvider({ DocType: [metaDoc], Customer: customers })}>
          <FrappeTable<Customer>
            doctype="Customer"
            layout="table"
            enablePagination={false}
          />
        </FrappeProvider>,
      );

      await expect(screen.findByText('Acme Corp')).resolves.toBeTruthy();
      await expect(screen.findByText('Lead')).resolves.toBeTruthy();
      expect(screen.getByText('North')).toBeTruthy();

      // Fixtures withhold nothing, so every in_list_view field paints.
      const derived = buildListColumns({ meta, t: (_key, fallback) => fallback });
      const visibleHeaders = derived
        .filter((column) => column.id !== 'modified')
        .map((column) => String(column.header));
      expect(visibleHeaders).toStrictEqual(['Customer Name', 'Status', 'Territory', 'Credit Limit', 'Activity']);
      await waitFor(() => {
        const headers = headerText(container);
        for (const header of visibleHeaders) {
          expect(headers).toContain(header);
        }
      });
      // The modified column is the hidden sort key; its time paints in the
      // activity cluster, not as a second "Last Updated On" column.
      expect(headerText(container)).not.toContain('Last Updated On');
      expect(container.querySelectorAll('[data-testid="list-activity"]')).toHaveLength(2);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falls back to the document name when the corpus has no meta for the doctype', async () => {
      renderWithProviders(
        <FrappeProvider
          baseURL="https://frappetable-default-columns-nometa.spec.test"
          fixtures={new InMemoryFixtureProvider({ Customer: customers })}>
          <FrappeTable<Customer>
            doctype="Customer"
            layout="table"
            enablePagination={false}
          />
        </FrappeProvider>,
      );

      await expect(screen.findByText('CUST-001')).resolves.toBeTruthy();
      await expect(screen.findByText('CUST-002')).resolves.toBeTruthy();
      expect(screen.getByText('ID')).toBeTruthy();
    });
  });

  describe('FrappeTable without columns, serverSide against a bench', () => {
    it('waits for meta and roles, then reads the derived fields once', async () => {
      const calls: string[] = [];
      const listRequests: URL[] = [];
      vi.stubGlobal('fetch', async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const method = url.pathname.replace(/^\/api\/method\//u, '');
        calls.push(method);
        if (method === 'frappe.desk.form.load.getdoctype') {
          return json({ docs: [metaDoc] });
        }
        if (method === 'frappe.auth.get_logged_user') {
          return json({ message: 'clerk@sales.test' });
        }
        if (method === 'frappe.core.doctype.user.user.get_roles') {
          return json({ message: ['Sales User'] });
        }
        if (method === 'frappe.client.get_count') {
          return json({ message: customers.length });
        }
        if (url.pathname === '/api/resource/Customer') {
          listRequests.push(url);
          return json({ data: customers });
        }
        return json({ data: [], message: [] });
      });

      const { container } = renderWithProviders(
        <FrappeProvider
          baseURL="https://frappetable-default-columns-bench.spec.test"
          realtime={false}>
          <FrappeTable<Customer>
            doctype="Customer"
            serverSide
            layout="table"
            initialState={{ pagination: { pageIndex: 0, pageSize: 10 } }}
          />
        </FrappeProvider>,
      );

      await expect(screen.findByText('Acme Corp')).resolves.toBeTruthy();
      // Sales User reads permlevel 0 only: Credit Limit is neither a column
      // nor asked for, the way desk's list prunes it.
      const expected = listFieldsToFetch(meta, buildPermLevelMatrix(meta.permissions, ['Sales User']));
      expect(expected).not.toContain('credit_limit');
      expect(listRequests).toHaveLength(1);
      expect(JSON.parse(listRequests[0].searchParams.get('fields') ?? '[]')).toStrictEqual(expected);
      expect(calls.indexOf('frappe.desk.form.load.getdoctype')).toBeLessThan(calls.indexOf('/api/resource/Customer'));
      await waitFor(() => {
        expect(headerText(container)).toContain('Status');
      });
      expect(headerText(container)).not.toContain('Credit Limit');

      await sleep(300);
      expect(listRequests).toHaveLength(1);
    });
  });
});

/**
 * FrappeTable's two props that read as optional and were not (MPO-230).
 *
 * `filterableFields`: omitted under a provider carrying fixtures, the meta
 * read stays inside the corpus. A fixture host that also carries a baseURL
 * (what a generated app has) used to dial getdoctype on every page and fail
 * CORS; now nothing reaches the network, DocType entry in the corpus or not.
 *
 * `fields`: omitted on a bench read (serverSide, or client mode without
 * fixtures), the request used to ask for `name` alone and every other column
 * rendered blank with no error. Now it asks for the columns' accessor keys,
 * and the derived list is content-keyed so an inline `columns` literal does
 * not refetch every render. Client mode over a corpus still reads whole
 * documents.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import { InMemoryFixtureProvider } from '@repo/frappe';
import type { DataTableColumn } from '@repo/table';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the stubbed fetch answers with arbitrary JSON payloads
const jsonResponse = (body: unknown): Response => Response.json(body);

const requestUrl = (input: RequestInfo | URL): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- picks the string member of fetch's RequestInfo | URL input union
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
};

interface Customer {
  name: string;
  doctype: string;
  customer_name: string;
  status: string;
}

const customers: Customer[] = [
  { name: 'CUST-001', doctype: 'Customer', customer_name: 'Acme Corp', status: 'Active' },
  { name: 'CUST-002', doctype: 'Customer', customer_name: 'Globex', status: 'Lead' },
];

const columns: DataTableColumn<Partial<Customer>>[] = [
  { id: 'name', accessorKey: 'name', header: 'ID' },
  { id: 'customer_name', accessorKey: 'customer_name', header: 'Customer Name' },
  { id: 'status', accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: 'Actions', cell: () => null },
];

const forbidFetch = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    throw new Error(`unexpected network request: ${requestUrl(input)}`);
  });

const pressRows = (container: HTMLElement): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('[data-row-press="true"]'),
];

describe('FrappeTable optional props', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- chained setup on the default instance is i18next's documented API
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('FrappeTable under a fixture corpus with a baseURL and no filterableFields', () => {
    it('issues zero requests when the corpus has no DocType entry', async () => {
      const fetchSpy = forbidFetch();
      const { container } = renderWithProviders(
        <FrappeProvider
          baseURL="https://frappetable-optional.spec.test"
          fixtures={new InMemoryFixtureProvider({ Customer: customers })}>
          <FrappeTable<Customer>
            doctype="Customer"
            columns={columns}
            layout="table"
            enablePagination={false}
            onRowClick={() => {}}
          />
        </FrappeProvider>,
      );

      await expect(screen.findByText('Acme Corp')).resolves.toBeTruthy();
      await expect(screen.findByText('Globex')).resolves.toBeTruthy();
      // No meta: rows fall back to the document name for their label.
      await waitFor(() => {
        expect(pressRows(container).map((row) => row.getAttribute('aria-label'))).toStrictEqual([
          'CUST-001',
          'CUST-002',
        ]);
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('issues zero requests when the corpus carries the DocType, and reads whole documents', async () => {
      const fetchSpy = forbidFetch();
      const { container } = renderWithProviders(
        <FrappeProvider
          baseURL="https://frappetable-optional.spec.test"
          fixtures={
            new InMemoryFixtureProvider({
              DocType: [
                {
                  name: 'Customer',
                  doctype: 'DocType',
                  module: 'Selling',
                  title_field: 'customer_name',
                  fields: [
                    { fieldname: 'customer_name', fieldtype: 'Data', label: 'Customer Name' },
                    { fieldname: 'status', fieldtype: 'Data', label: 'Status' },
                  ],
                  permissions: [],
                },
              ],
              Customer: customers,
            })
          }>
          <FrappeTable<Customer>
            doctype="Customer"
            columns={columns.filter((column) => column.id !== 'customer_name')}
            layout="table"
            enablePagination={false}
            onRowClick={() => {}}
          />
        </FrappeProvider>,
      );

      await expect(screen.findByText('Lead')).resolves.toBeTruthy();
      // The title field is no column: its value labels the rows only because
      // the corpus handed over whole documents.
      await waitFor(() => {
        expect(pressRows(container).map((row) => row.getAttribute('aria-label'))).toStrictEqual([
          'Acme Corp',
          'Globex',
        ]);
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('FrappeTable serverSide with columns and no fields', () => {
    const host = 'https://frappetable-serverfields.spec.test';

    it('requests name plus every column accessor key, once', async () => {
      const listRequests: URL[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const urlStr = requestUrl(input);
        const url = new URL(urlStr);
        if (url.pathname === '/api/method/frappe.client.get_count') {
          return jsonResponse({ message: customers.length });
        }
        if (url.pathname === '/api/resource/Customer') {
          listRequests.push(url);
          return jsonResponse({ data: customers });
        }
        throw new Error(`unexpected network request: ${urlStr}`);
      });

      renderWithProviders(
        <FrappeProvider baseURL={host}>
          <FrappeTable<Customer>
            doctype="Customer"
            columns={[...columns]}
            filterableFields={[{ id: 'status', label: 'Status', type: 'text' }]}
            serverSide
            layout="table"
            initialState={{ pagination: { pageIndex: 0, pageSize: 10 } }}
          />
        </FrappeProvider>,
      );

      await expect(screen.findByText('Acme Corp')).resolves.toBeTruthy();
      await expect(screen.findByText('Lead')).resolves.toBeTruthy();
      expect(listRequests).toHaveLength(1);
      expect(JSON.parse(listRequests[0].searchParams.get('fields') ?? '[]')).toStrictEqual([
        'name',
        'customer_name',
        'status',
      ]);

      // The derived list is content-keyed: the post-load re-renders must not
      // re-key the fetch and refetch.
      await sleep(300);
      expect(listRequests).toHaveLength(1);
    });
  });

  describe('FrappeTable client mode against a bench with columns and no fields', () => {
    const host = 'https://frappetable-clientfields.spec.test';

    it('subscribes with name plus every column accessor key', async () => {
      const listRequests: URL[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const urlStr = requestUrl(input);
        const url = new URL(urlStr);
        if (url.pathname === '/api/resource/Customer') {
          listRequests.push(url);
          const fields: string[] = JSON.parse(url.searchParams.get('fields') ?? '["name"]');
          const projected = customers.map((doc) =>
            // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- projects the fixture doc by the requested field names, like a bench would
            Object.fromEntries(fields.map((field) => [field, (doc as unknown as Record<string, unknown>)[field]])),
          );
          return Response.json({ data: projected });
        }
        throw new Error(`unexpected network request: ${urlStr}`);
      });

      renderWithProviders(
        <FrappeProvider
          baseURL={host}
          realtime={false}>
          <FrappeTable<Customer>
            doctype="Customer"
            columns={columns}
            filterableFields={[{ id: 'status', label: 'Status', type: 'text' }]}
            layout="table"
            enablePagination={false}
          />
        </FrappeProvider>,
      );

      // A bench answers a list read with no `fields` with `name` alone, so
      // these cells render only because the request named the columns.
      await expect(screen.findByText('Acme Corp')).resolves.toBeTruthy();
      await expect(screen.findByText('Lead')).resolves.toBeTruthy();
      expect(listRequests.length).toBeGreaterThan(0);
      const requested: string[] = JSON.parse(listRequests[0].searchParams.get('fields') ?? '[]');
      expect(requested).toStrictEqual(expect.arrayContaining(['name', 'customer_name', 'status']));
      expect(requested).not.toContain('actions');
    });
  });
});

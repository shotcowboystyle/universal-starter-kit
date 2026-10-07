/**
 * A fixture corpus satisfies the connection requirement on its own (MPO-228).
 *
 * `createApp({ frappe: { fixtures } })` mounts a FrappeProvider with NO
 * baseURL, so the collection-backed components must read the corpus instead
 * of demanding a bench URL. These specs pin that: rows render, doctype meta
 * comes from the corpus, and `fetch` is never called — a fixtures-only app
 * runs with no server. The old error still fires when neither is configured.
 */

import { InMemoryFixtureProvider } from '@repo/frappe';
import type { DataTableColumn } from '@repo/table';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FrappeList } from './FrappeList';
import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';

beforeAll(async () => {
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
];

/**
 * Corpus carrying both documents and the getdoctype-shaped meta doc, so the
 * table's `useDocTypeMeta` call is answered locally too (no filterableFields
 * prop, which would skip that path).
 */
function fixtureCorpus() {
  return new InMemoryFixtureProvider({
    DocType: [
      {
        name: 'Customer',
        doctype: 'DocType',
        module: 'Selling',
        fields: [
          { fieldname: 'customer_name', fieldtype: 'Data', label: 'Customer Name' },
          { fieldname: 'status', fieldtype: 'Select', label: 'Status', options: 'Active\nLead' },
        ],
      },
    ],
    Customer: customers,
  });
}

/** Fails the test if anything dials the network. */
function forbidFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    throw new Error(`unexpected network request: ${String(input)}`);
  });
}

describe('FrappeProvider with fixtures and no baseURL', () => {
  it('renders a FrappeTable off the corpus without touching the network', async () => {
    const fetchSpy = forbidFetch();
    renderWithProviders(
      <FrappeProvider fixtures={fixtureCorpus()}>
        <FrappeTable<Customer>
          doctype="Customer"
          columns={columns}
          layout="table"
          enablePagination={false}
        />
      </FrappeProvider>,
    );

    await expect(screen.findByText('Acme Corp')).resolves.toBeTruthy();
    await expect(screen.findByText('Globex')).resolves.toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders a FrappeList off the corpus without touching the network', async () => {
    const fetchSpy = forbidFetch();
    renderWithProviders(
      <FrappeProvider fixtures={fixtureCorpus()}>
        <FrappeList<Customer>
          doctype="Customer"
          fields={['name', 'customer_name']}
          renderItem={(item) => <Text>{item.customer_name}</Text>}
        />
      </FrappeProvider>,
    );

    await expect(screen.findByText('Acme Corp')).resolves.toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('FrappeProvider with neither baseURL nor fixtures', () => {
  it('still names what is missing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      renderWithProviders(
        <FrappeProvider>
          <FrappeTable<Customer>
            doctype="Customer"
            columns={columns}
            layout="table"
          />
        </FrappeProvider>,
      ),
    ).toThrow(/baseURL or fixtures/);
  });
});

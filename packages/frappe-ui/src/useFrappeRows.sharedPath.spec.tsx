/**
 * The shipped doctype views share ONE read (MPO-251 AC3).
 *
 * What this locks:
 *  1. No shipped doctype view assembles useFrappeCollection + useLiveQuery
 *     itself; each reads through useFrappeRows (FrappeList through
 *     useFrappePagination, which reads through useFrappeRows).
 *  2. At runtime FrappeList, FrappeImageView, FrappeDashboard and
 *     FrappeReportBuilder call useFrappeRows and render the rows it returns.
 *  3. FrappeList's permission error still reaches its honest error state
 *     through the shared read.
 *
 * Fixture-hermetic: documents ride InMemoryFixtureProvider.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Text } from 'tamagui';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeDashboard } from './FrappeDashboard';
import { FrappeImageView } from './FrappeImageView';
import { FrappeList } from './FrappeList';
import { FrappeProvider } from './FrappeProvider';
import { FrappeReportBuilder } from './FrappeReportBuilder';
import { useFrappeRows } from './useFrappeRows';

vi.mock(import('./useFrappeRows'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useFrappeRows')>();
  return { ...actual, useFrappeRows: vi.fn(actual.useFrappeRows) };
});

const readSpy = vi.mocked(useFrappeRows);

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

beforeEach(() => {
  readSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Customer {
  name: string;
  doctype: string;
  customer_name: string;
  image: string;
}

const customers: Customer[] = [
  { name: 'CUST-001', doctype: 'Customer', customer_name: 'Acme Corp', image: '' },
  { name: 'CUST-002', doctype: 'Customer', customer_name: 'Globex', image: '' },
];

function fixtureCorpus() {
  return new InMemoryFixtureProvider({
    DocType: [
      {
        name: 'Customer',
        doctype: 'DocType',
        module: 'Selling',
        image_field: 'image',
        title_field: 'customer_name',
        fields: [
          {
            fieldname: 'customer_name',
            fieldtype: 'Data',
            label: 'Customer Name',
            in_list_view: 1,
          },
          { fieldname: 'image', fieldtype: 'Attach Image', label: 'Image' },
        ],
      },
    ],
    Customer: customers,
  });
}

const baseURL = 'https://sharedpath.spec.test';

function readsOf(doctype: string) {
  return readSpy.mock.calls.filter(([, calledDoctype]) => calledDoctype === doctype);
}

function source(file: string) {
  return readFileSync(resolve(process.cwd(), 'src', file), 'utf-8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/\/\/.*$/gm, '');
}

describe('one implementation of the doctype read', () => {
  const readers: [file: string, reader: RegExp][] = [
    ['FrappeTable.tsx', /\buseFrappeRows\s*[<(]/],
    ['FrappeList.tsx', /\buseFrappePagination\s*[<(]/],
    ['useFrappePagination.ts', /\buseFrappeRows\s*[<(]/],
    ['FrappeTreeView.tsx', /\buseFrappeRows\s*[<(]/],
    ['FrappeKanban.tsx', /\buseFrappeRows\s*[<(]/],
    ['FrappeCalendar.tsx', /\buseFrappeRows\s*[<(]/],
    ['FrappeGantt.tsx', /\buseFrappeRows\s*[<(]/],
    ['FrappeImageView.tsx', /\buseFrappeRows\s*[<(]/],
    ['FrappeDashboard.tsx', /\buseFrappeRows\s*[<(]/],
    ['FrappeReportBuilder.tsx', /\buseFrappeRows\s*[<(]/],
  ];

  it.each(readers)('%s reads through the shared hook, not the raw primitives', (file, reader) => {
    const code = source(file);
    expect(code).toMatch(reader);
    expect(code).not.toMatch(/\buseFrappeCollection\s*[<(]/);
    expect(code).not.toMatch(/\buseLiveQuery\s*\(/);
  });
});

describe('the shipped views render rows from useFrappeRows', () => {
  it('FrappeList', async () => {
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
    expect(readsOf('Customer')[0]?.[2]).toMatchObject({
      fields: ['name', 'customer_name'],
      limit: null,
    });
  });

  it('FrappeImageView', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL={baseURL}
        fixtures={fixtureCorpus()}>
        <FrappeImageView<Customer>
          doctype="Customer"
          imageField="image"
          titleField="customer_name"
        />
      </FrappeProvider>,
    );
    await expect(screen.findByText('Globex')).resolves.toBeTruthy();
    expect(readsOf('Customer').length).toBeGreaterThan(0);
  });

  it('FrappeDashboard', async () => {
    const received: Partial<Customer>[][] = [];
    renderWithProviders(
      <FrappeProvider
        baseURL={baseURL}
        fixtures={fixtureCorpus()}>
        <FrappeDashboard<Customer>
          title="Customers"
          widgets={[]}
          dataSource={{ doctype: 'Customer', fields: ['name', 'customer_name'] }}
          transformData={(data) => {
            received.push(data);
            return [];
          }}
        />
      </FrappeProvider>,
    );
    await waitFor(() => {
      expect(received.at(-1)).toHaveLength(2);
    });
    expect(readsOf('Customer').length).toBeGreaterThan(0);
  });

  it('FrappeReportBuilder', async () => {
    renderWithProviders(
      <FrappeProvider fixtures={fixtureCorpus()}>
        <FrappeReportBuilder doctype="Customer" />
      </FrappeProvider>,
    );
    await expect(screen.findByText('Acme Corp')).resolves.toBeTruthy();
    expect(readsOf('Customer').length).toBeGreaterThan(0);
  });
});

describe('FrappeList error plumbing through the shared read', () => {
  it('renders a 403 as a permission error, not an empty list', async () => {
    const fixtures = fixtureCorpus();
    vi.spyOn(fixtures, 'getList').mockRejectedValue(Object.assign(new Error('PermissionError'), { status: 403 }));
    renderWithProviders(
      <FrappeProvider fixtures={fixtures}>
        <FrappeList<Customer>
          doctype="Customer"
          fields={['name', 'customer_name']}
          renderItem={(item) => <Text>{item.customer_name}</Text>}
        />
      </FrappeProvider>,
    );
    await expect(screen.findByText('You do not have permission to view Customer')).resolves.toBeTruthy();
    expect(screen.queryByText('No Customer records found')).toBeNull();
  });
});

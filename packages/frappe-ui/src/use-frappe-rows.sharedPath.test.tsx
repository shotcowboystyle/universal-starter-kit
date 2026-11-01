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
import path from 'node:path';

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
import { useFrappeRows } from './use-frappe-rows';
// oxlint-disable-next-line sonarjs/no-wildcard-import -- types importOriginal as the whole module the partial mock spreads
import type * as RowsModule from './use-frappe-rows';

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the typed import() form rejects a vi.fn over a generic hook (TS2769); this partial mock keeps the real implementation
vi.mock('./use-frappe-rows', async (importOriginal) => {
  const actual = await importOriginal<typeof RowsModule>();
  return { ...actual, useFrappeRows: vi.fn<typeof actual.useFrappeRows>(actual.useFrappeRows) };
});

const readSpy = vi.mocked(useFrappeRows);

// oxlint-disable-next-line vitest/require-top-level-describe -- shared setup/teardown for every describe block in this file
beforeAll(async () => {
  // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

// oxlint-disable-next-line vitest/require-top-level-describe -- shared setup/teardown for every describe block in this file
beforeEach(() => {
  readSpy.mockClear();
});

// oxlint-disable-next-line vitest/require-top-level-describe -- shared setup/teardown for every describe block in this file
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

const fixtureCorpus = () =>
  new InMemoryFixtureProvider({
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

const baseURL = 'https://sharedpath.spec.test';

const readsOf = (doctype: string) => readSpy.mock.calls.filter(([, calledDoctype]) => calledDoctype === doctype);

const source = (file: string) =>
  readFileSync(path.resolve(process.cwd(), 'src', file), 'utf-8')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    // oxlint-disable-next-line sonarjs/super-linear-regex -- scans repo source files in a test, never untrusted input
    .replaceAll(/\/\/.*$/gmu, '');

describe('one implementation of the doctype read', () => {
  const readers: [file: string, reader: RegExp][] = [
    ['FrappeTable.tsx', /\buseFrappeRows\s*[<(]/u],
    ['FrappeList.tsx', /\buseFrappePagination\s*[<(]/u],
    ['use-frappe-pagination.ts', /\buseFrappeRows\s*[<(]/u],
    ['FrappeTreeView.tsx', /\buseFrappeRows\s*[<(]/u],
    ['FrappeKanban.tsx', /\buseFrappeRows\s*[<(]/u],
    ['FrappeCalendar.tsx', /\buseFrappeRows\s*[<(]/u],
    ['FrappeGantt.tsx', /\buseFrappeRows\s*[<(]/u],
    ['FrappeImageView.tsx', /\buseFrappeRows\s*[<(]/u],
    ['FrappeDashboard.tsx', /\buseFrappeRows\s*[<(]/u],
    ['FrappeReportBuilder.tsx', /\buseFrappeRows\s*[<(]/u],
  ];

  it.each(readers)('%s reads through the shared hook, not the raw primitives', (file, reader) => {
    const code = source(file);
    expect(code).toMatch(reader);
    expect(code).not.toMatch(/\buseFrappeCollection\s*[<(]/u);
    expect(code).not.toMatch(/\buseLiveQuery\s*\(/u);
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

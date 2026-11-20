/**
 * MPO-229: FrappeTable must not collapse to a sliver in an auto-height parent.
 *
 * The wrapper YStack used `flex={1}`, which in React Native's flex model is
 * `1 1 0` with a basis of ZERO. A basis-0 chain inside a parent that has no
 * height of its own resolves to 0, so the whole table rendered as a one-row
 * sliver. DataTableRoot's own root already avoids exactly this (grow 1 /
 * shrink 1 / basis auto / minHeight 0, and it carries the note saying why).
 * The FrappeTable wrapper sitting above it reintroduced the trap.
 *
 * Two halves here. The render cases pin the behavior a caller sees: 12 rows
 * in a plain auto-height parent, and the same table in a fixed-height parent.
 * The source cases are the mechanical guard, because happy-dom runs no flex
 * layout, so a basis-0 regression is invisible to a rendered assertion and
 * only the geometry itself can be checked.
 */

import fs from 'node:fs';
import path from 'node:path';

import { InMemoryFixtureProvider } from '@repo/frappe';
import type { DataTableColumn } from '@repo/table';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { YStack } from 'tamagui';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';

interface Customer {
  name: string;
  doctype: string;
  customer_name: string;
}

const customers: Customer[] = Array.from({ length: 12 }, (_, index) => ({
  name: `CUST-${String(index + 1).padStart(3, '0')}`,
  doctype: 'Customer',
  customer_name: `Customer ${index + 1}`,
}));

const columns: DataTableColumn<Partial<Customer>>[] = [
  { id: 'name', accessorKey: 'name', header: 'ID' },
  { id: 'customer_name', accessorKey: 'customer_name', header: 'Customer Name' },
];

// Supplied so the table does not go to useDocTypeMeta for the filter list.
const filterFields = [{ id: 'customer_name', label: 'Customer Name', type: 'text' as const }];

const renderInParent = (parent: React.ReactElement) =>
  renderWithProviders(
    <FrappeProvider
      baseURL="https://frappetable-autoheight.spec.test"
      fixtures={new InMemoryFixtureProvider({ Customer: customers })}>
      {parent}
    </FrappeProvider>,
  );

const table = (
  <FrappeTable<Customer>
    doctype="Customer"
    columns={columns}
    filterableFields={filterFields}
    layout="table"
    enablePagination={false}
  />
);

const srcDir = import.meta.dirname;

const read = (file: string): string => fs.readFileSync(path.resolve(srcDir, file), 'utf-8');

const codeOnly = (source: string): string =>
  // oxlint-disable-next-line sonarjs/super-linear-regex -- scans two repo source files in a test, never untrusted input
  source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '');

describe('FrappeTable in an auto-height parent (MPO-229)', () => {
  beforeAll(async () => {
    if (!i18next.isInitialized) {
      // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
      await i18next.use(initReactI18next).init({
        lng: 'en',
        interpolation: { escapeValue: false },
        resources: { en: { translation: {} } },
      });
    }
  });

  afterEach(() => {
    cleanup();
  });

  it('renders every row inside a plain auto-height YStack', async () => {
    renderInParent(<YStack>{table}</YStack>);
    await screen.findByText('Customer 1');
    for (const customer of customers) {
      expect(screen.getByText(customer.customer_name)).toBeTruthy();
    }
    expect(screen.queryByText(/No Customer records found/iu)).toBeNull();
  });

  it('still renders every row inside a fixed-height parent', async () => {
    renderInParent(<YStack height={400}>{table}</YStack>);
    await screen.findByText('Customer 1');
    for (const customer of customers) {
      expect(screen.getByText(customer.customer_name)).toBeTruthy();
    }
  });

  it('roots grow and shrink on a basis of auto, the same geometry as DataTableRoot', () => {
    const source = codeOnly(read('FrappeTable.tsx'));

    // flex={1} is 1 1 0 in RN. Basis 0 in an auto-height parent resolves to 0
    // and the table collapses to a one-row sliver.
    expect(source).not.toContain('flex={1}');

    const tags = source.match(/<YStack\b[^>]*>/gu) ?? [];
    const roots = tags.filter((tag) => tag.includes('flexBasis'));
    expect(roots).toHaveLength(2);
    for (const root of roots) {
      expect(root).toContain('flexGrow={1}');
      expect(root).toContain('flexShrink={1}');
      expect(root).toContain('flexBasis="auto"');
      expect(root).toContain('minHeight={0}');
    }
  });

  it('DataTableRoot still carries the geometry FrappeTable copies', () => {
    const source = codeOnly(read('../../table/src/components/DataTable/DataTableRoot.tsx'));
    const tags = source.match(/<View\b[^>]*>/gu) ?? [];
    const root = tags.find((tag) => tag.includes('flexBasis'));
    expect(root).toBeTruthy();
    expect(root).toContain('flexGrow={1}');
    expect(root).toContain('flexShrink={1}');
    expect(root).toContain('flexBasis="auto"');
    expect(root).toContain('minHeight={0}');
  });
});

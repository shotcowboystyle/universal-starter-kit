/**
 * FrappeTable row activation — the replacement contract for the deleted
 * per-cell pressable layer (onRowClick → DataTable onRowPress).
 *
 * The public prop stays `onRowClick` (backoffice DoctypeListScreen and
 * other consumers keep their API); inside, the ROW is one pressable unit:
 * a single roving tab stop per row set (LC-49), Enter AND Space activate
 * the focused row (LC-50), inner interactive controls (selection
 * checkboxes) win over the row press, and rows are named by document
 * identity — the doctype title-field value when meta is loaded, else the
 * document name (DG-A11Y-06).
 *
 * Fixture-hermetic: documents ride InMemoryFixtureProvider; the one test
 * that needs doctype meta carries it in the corpus's DocType entry.
 */

import { InMemoryFixtureProvider } from '@repo/frappe';
import type { DataTableColumn } from '@repo/table';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
  { name: 'CUST-002', doctype: 'Customer', customer_name: 'Globex', status: 'Active' },
  { name: 'CUST-003', doctype: 'Customer', customer_name: 'Initech', status: 'Lead' },
];

const columns: DataTableColumn<Partial<Customer>>[] = [
  { id: 'name', accessorKey: 'name', header: 'ID' },
  { id: 'customer_name', accessorKey: 'customer_name', header: 'Customer Name' },
  { id: 'status', accessorKey: 'status', header: 'Status' },
];

// Explicit filterableFields skip the doctype-meta read (same contract
// DoctypeListScreen uses); the title-field test omits them and answers the
// read from the corpus instead.
const filterFields = [{ id: 'status', label: 'Status', type: 'text' as const }];

function pressRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('[data-row-press="true"]')] as HTMLElement[];
}

function renderTable(extraProps: Record<string, unknown> = {}) {
  const onRowClick = vi.fn();
  const result = renderWithProviders(
    <FrappeProvider
      baseURL="https://frappetable.spec.test"
      fixtures={new InMemoryFixtureProvider({ Customer: customers })}>
      <FrappeTable<Customer>
        doctype="Customer"
        columns={columns}
        filterableFields={filterFields}
        layout="table"
        enablePagination={false}
        onRowClick={onRowClick}
        {...extraProps}
      />
    </FrappeProvider>,
  );
  return { ...result, onRowClick };
}

describe('FrappeTable onRowClick → DataTable onRowPress', () => {
  it('activates on mouse click anywhere in the row and on Enter AND Space', async () => {
    const { container, onRowClick } = renderTable();
    await screen.findByText('Acme Corp');
    const rows = pressRows(container);
    expect(rows).toHaveLength(3);

    fireEvent.click(screen.getByText('Globex'));
    expect(onRowClick).toHaveBeenCalledOnce();
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'CUST-002' }));

    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'CUST-001' }));
    fireEvent.keyDown(rows[0], { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(3);
  });

  it('exposes ONE roving tab stop, names rows by doc name, and keeps cells pressable-free', async () => {
    const { container } = renderTable();
    await screen.findByText('Acme Corp');
    const rows = pressRows(container);

    // LC-49: exactly one tab stop across the row set; arrows rove it.
    expect(rows.map((row) => row.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);

    // DG-A11Y-06: rows named by document identity (name — no meta here).
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['CUST-001', 'CUST-002', 'CUST-003']);

    // The per-cell pressable layer is GONE: no cell-level buttons or
    // extra tab stops inside pressable rows (plain text columns).
    for (const row of rows) {
      expect(row.querySelectorAll('[role="button"]')).toHaveLength(0);
      expect(row.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
    }
  });

  it('keeps selection checkboxes working without firing the row press', async () => {
    const { onRowClick } = renderTable({ enableRowSelection: true });
    await screen.findByText('Acme Corp');

    // Selection names ride the same identity channel ("Select row {name}").
    const checkbox = await screen.findByRole('checkbox', { name: 'Select row CUST-001' });
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('labels rows by the doctype title-field value once meta loads', async () => {
    // Meta comes from the corpus's DocType entry: a fixture host never dials
    // getdoctype, whatever baseURL it carries (MPO-230).
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      throw new Error(`unexpected network request: ${String(input)}`);
    });

    const onRowClick = vi.fn();
    const { container } = renderWithProviders(
      <FrappeProvider
        baseURL="https://frappetable-meta.spec.test"
        fixtures={
          new InMemoryFixtureProvider({
            DocType: [
              {
                name: 'Customer',
                doctype: 'DocType',
                module: 'Selling',
                title_field: 'customer_name',
                fields: [
                  {
                    fieldname: 'customer_name',
                    fieldtype: 'Data',
                    label: 'Customer Name',
                    in_list_view: 1,
                  },
                ],
                permissions: [],
              },
            ],
            Customer: customers,
          })
        }>
        <FrappeTable<Customer>
          doctype="Customer"
          columns={columns}
          layout="table"
          enablePagination={false}
          onRowClick={onRowClick}
        />
      </FrappeProvider>,
    );

    await screen.findByText('Acme Corp');
    await waitFor(() => {
      expect(pressRows(container).map((row) => row.getAttribute('aria-label'))).toEqual([
        'Acme Corp',
        'Globex',
        'Initech',
      ]);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('FrappeTable layout forwarding', () => {
  it('passes layout=list through to DataTable document rows', async () => {
    const { container } = renderTable({ layout: 'list' });
    await screen.findByText('Acme Corp');
    expect(container.querySelector('[data-testid="data-table-list"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="data-table-list-row"]')).toHaveLength(customers.length);
    expect(container.querySelector('.is_Table')).toBeNull();
    expect(container.querySelector('[aria-label="Table headers"]')).toBeNull();
  });
});

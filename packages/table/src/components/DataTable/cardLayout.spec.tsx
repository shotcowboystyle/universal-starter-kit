/**
 * Responsive card-layout specs.
 *
 * In the happy-dom test env Tamagui's useMedia resolves { sm: false }
 * (below the `$sm` breakpoint), so layout="auto" renders the card list
 * by default and layout="table" pins the grid — both directions of the
 * breakpoint switch are exercised without resizing a window.
 *
 * Covers: breakpoint/override switching, card anatomy (title slot +
 * classified fields), column visibility, sorting order, global search,
 * column filters, the card sort/filter controls, the SimpleTable layout
 * override, and the Table primitives card layout.
 */

import { Table } from '@repo/table-primitives';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';
import { SimpleTable } from '../SimpleTable';

import { DataTable } from './index';

interface Person {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
  email: string;
}

const sampleData: Person[] = [
  { id: 1, firstName: 'John', lastName: 'Doe', age: 28, email: 'john@example.com' },
  { id: 2, firstName: 'Jane', lastName: 'Smith', age: 32, email: 'jane@example.com' },
  { id: 3, firstName: 'Bob', lastName: 'Johnson', age: 45, email: 'bob@example.com' },
  { id: 4, firstName: 'Alice', lastName: 'Williams', age: 22, email: 'alice@example.com' },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'lastName', header: 'Last Name' },
  { accessorKey: 'age', header: 'Age' },
  { accessorKey: 'email', header: 'Email' },
];

function getCards(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('[data-testid="data-table-card"]')];
}

describe('DataTable card layout', () => {
  describe('layout switching', () => {
    it('renders cards below the sm breakpoint with layout=auto (default)', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn()}
        />,
      );
      expect(container.querySelector('[data-testid="data-table-cards"]')).not.toBeNull();
      expect(container.querySelector('.is_Table')).toBeNull();
      expect(getCards(container)).toHaveLength(sampleData.length);
    });

    it('layout=table pins the grid even below the sm breakpoint', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          layout="table"
          onStateChange={vi.fn()}
        />,
      );
      expect(container.querySelector('[data-testid="data-table-cards"]')).toBeNull();
      expect(container.querySelector('.is_Table')).not.toBeNull();
    });

    it('layout=cards pins the card list', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          layout="cards"
          onStateChange={vi.fn()}
        />,
      );
      expect(container.querySelector('[data-testid="data-table-cards"]')).not.toBeNull();
      expect(container.querySelector('.is_Table')).toBeNull();
    });

    it('layout=list renders document rows, not the grid or cards', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          layout="list"
          onStateChange={vi.fn()}
        />,
      );
      expect(container.querySelector('[data-testid="data-table-list"]')).not.toBeNull();
      expect(container.querySelectorAll('[data-testid="data-table-list-row"]')).toHaveLength(sampleData.length);
      expect(container.querySelector('[data-testid="data-table-cards"]')).toBeNull();
      expect(container.querySelector('.is_Table')).toBeNull();
      expect(container.querySelector('[aria-label="Table headers"]')).toBeNull();
    });

    it('list title slot uses the title-role column, not a leading _liked_by glyph', () => {
      const listColumns: DataTableColumn<Person>[] = [
        { id: '_liked_by', accessorKey: 'id', header: '♥', meta: { label: 'Liked' } },
        { accessorKey: 'firstName', header: 'First Name', meta: { role: 'title' } },
        { accessorKey: 'lastName', header: 'Last Name' },
        { accessorKey: 'email', header: 'Email' },
      ];
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={listColumns}
          layout="list"
          onStateChange={vi.fn()}
        />,
      );
      const titleSlots = container.querySelectorAll('[data-list-slot="title"]');
      expect(titleSlots).toHaveLength(sampleData.length);
      expect(titleSlots[0]?.textContent).toBe('John');
      const metaSlots = container.querySelectorAll('[data-list-slot="meta"]');
      expect([...metaSlots].some((slot) => slot.textContent === 'Doe')).toBe(true);
    });

    it('list rows are a nowrap flex list, not a column grid or labeled cards', () => {
      const listColumns: DataTableColumn<Person>[] = [
        { accessorKey: 'firstName', header: 'Name', meta: { role: 'title' } },
        { accessorKey: 'lastName', header: 'Last Name' },
        { accessorKey: 'email', header: 'Email' },
        { accessorKey: 'age', header: 'Age', meta: { role: 'indicator' } },
      ];
      const { container, queryByText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={listColumns}
          layout="list"
          onStateChange={vi.fn()}
        />,
      );
      const list = container.querySelector('[data-testid="data-table-list"]') as HTMLElement;
      const row = container.querySelector('[data-testid="data-table-list-row"]') as HTMLElement;
      expect(list.dataset.listLayout).toBe('list');
      expect(row.dataset.listWrap).toBe('nowrap');
      expect(getComputedStyle(list).display).not.toBe('grid');
      expect(getComputedStyle(row).flexWrap).toBe('nowrap');
      expect(container.querySelector('[data-list-slot="indicator"]')?.textContent).toBe('28');
      // A list is not a form: column headers do not reprint as labels.
      expect(queryByText('Last Name')).toBeNull();
      expect(queryByText('Email')).toBeNull();
    });
  });

  describe('card anatomy', () => {
    it('renders the first visible column as the card title and classifies the rest', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn()}
        />,
      );
      const [firstCard] = getCards(container);
      expect(firstCard).toBeDefined();

      // Title slot holds the primary column value, without a label row.
      const title = firstCard.querySelector('[data-card-slot="title"]');
      expect(title).not.toBeNull();
      expect(title!.textContent).toContain('John');
      expect(within(firstCard).queryByText('First Name')).toBeNull();

      // A self-naming string goes bare. Its column name still reaches
      // assistive tech, through a hidden node that costs no layout.
      expect(within(firstCard).queryByText('Last Name')).toBeNull();
      expect(within(firstCard).queryByText('Email')).toBeNull();
      expect(firstCard.textContent).toContain('Last Name:');
      expect(firstCard.textContent).toContain('Email:');

      // A figure cannot be read without its name, so that one prints.
      expect(within(firstCard).getByText('Age')).toBeDefined();

      expect(firstCard.textContent).toContain('Doe');
      expect(firstCard.textContent).toContain('28');
    });

    it('names a control from meta.label when the header is a render function', () => {
      const glyphColumns: DataTableColumn<Person>[] = [
        { id: 'firstName', accessorKey: 'firstName', header: 'First Name' },
        {
          id: '_liked_by',
          accessorKey: 'lastName',
          header: () => <span aria-label="Liked">♥</span>,
          meta: { label: 'Liked' },
        },
      ];
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={glyphColumns}
          onStateChange={vi.fn()}
        />,
      );
      const [firstCard] = getCards(container);
      // A leading underscore marks a control: its own row, no printed label.
      expect(within(firstCard).queryByText('Liked')).toBeNull();
      expect(firstCard.textContent).toContain('Liked:');
      expect(firstCard.textContent).not.toContain('_liked_by');
    });

    it('meta.label wins over a string header; a bare function header falls back to the id', () => {
      const mixedColumns: DataTableColumn<Person>[] = [
        { id: 'firstName', accessorKey: 'firstName', header: 'First Name' },
        // Explicit channel beats the display string — a glyph header ("♥")
        // is exactly what meta.label exists to replace in card labels.
        { id: 'age', accessorKey: 'age', header: '♥', meta: { label: 'Age (years)' } },
        // No meta.label + non-string header: the raw id still prints — the
        // fallback stays honest instead of inventing a label.
        { id: 'email_addr', accessorKey: 'email', header: () => <span>Email</span> },
      ];
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={mixedColumns}
          onStateChange={vi.fn()}
        />,
      );
      const [firstCard] = getCards(container);
      // A figure prints its name, a bare string hides it. meta.label wins
      // either way, and the id fallback stays honest.
      expect(within(firstCard).getByText('Age (years)')).toBeDefined();
      expect(within(firstCard).queryByText('♥')).toBeNull();
      expect(firstCard.textContent).toContain('email_addr:');
    });

    it('respects column visibility (hidden columns stay hidden in cards)', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          initialState={{ columnVisibility: { email: false } }}
          onStateChange={vi.fn()}
        />,
      );
      const [firstCard] = getCards(container);
      expect(within(firstCard).queryByText('Email')).toBeNull();
      expect(firstCard.textContent).not.toContain('Email:');
      expect(firstCard.textContent).not.toContain('john@example.com');
    });
  });

  describe('state features in card layout', () => {
    it('initial sorting orders the cards', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          initialState={{ sorting: [{ id: 'age', desc: false }] }}
          onStateChange={vi.fn()}
        />,
      );
      const titles = getCards(container).map((card) => card.querySelector('[data-card-slot="title"]')!.textContent);
      // Ascending age: Alice (22), John (28), Jane (32), Bob (45)
      expect(titles).toEqual(['Alice', 'John', 'Jane', 'Bob']);
    });

    it('sort control cycles column sorting and reorders cards', async () => {
      const { container, getByLabelText, findByLabelText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn()}
        />,
      );
      fireEvent.click(getByLabelText('Sort rows'));
      const ageItem = await findByLabelText('Sort by Age');
      fireEvent.click(ageItem);

      await waitFor(() => {
        const titles = getCards(container).map((card) => card.querySelector('[data-card-slot="title"]')!.textContent);
        expect(titles).toEqual(['Alice', 'John', 'Jane', 'Bob']);
      });

      // Second activation flips to descending.
      fireEvent.click(ageItem);
      await waitFor(() => {
        const titles = getCards(container).map((card) => card.querySelector('[data-card-slot="title"]')!.textContent);
        expect(titles).toEqual(['Bob', 'Jane', 'John', 'Alice']);
      });
    });

    it('global search filters the cards', async () => {
      const { container, getByLabelText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn()}
        />,
      );
      expect(getCards(container)).toHaveLength(4);
      const search = getByLabelText('Search table data');
      fireEvent.change(search, { target: { value: 'Jane' } });
      await waitFor(() => {
        expect(getCards(container)).toHaveLength(1);
        expect(getCards(container)[0].textContent).toContain('Jane');
      });
    });

    it('column filters filter the cards', () => {
      const { container } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          initialState={{
            columnFilters: [{ id: 'firstName', value: { operator: 'contains', value: 'jo' } }],
          }}
          onStateChange={vi.fn()}
        />,
      );
      const titles = getCards(container).map((card) => card.querySelector('[data-card-slot="title"]')!.textContent);
      expect(titles).toEqual(['John']);
    });

    it('renders the canonical Filter in card layout', () => {
      const { getByRole, queryByText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          onStateChange={vi.fn()}
        />,
      );
      expect(getByRole('button', { name: 'Filter' })).toBeDefined();
      expect(queryByText('Add Filter')).toBeNull();
    });

    it('hides sort/filter chrome when sorting and filtering are disabled', () => {
      const { queryByLabelText, queryByText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableSorting={false}
          enableFiltering={false}
          onStateChange={vi.fn()}
        />,
      );
      expect(queryByLabelText('Sort rows')).toBeNull();
      expect(queryByText('Add Filter')).toBeNull();
    });

    it('row selection works in card layout', () => {
      const { container, getAllByLabelText } = renderWithProviders(
        <DataTable
          data={sampleData}
          columns={columns}
          enableRowSelection={true}
          onStateChange={vi.fn()}
        />,
      );
      // Selection toggles are named by ROW IDENTITY (first cell value /
      // rowLabel), not a bare position — "Select row Alice", not "Select
      // row 1" (DG-A11Y-06; selectionSemantics.spec pins the derivation).
      expect(getAllByLabelText(/^Select row .+$/)).toHaveLength(sampleData.length);
      expect(container.querySelector('[data-testid="data-table-cards"]')).not.toBeNull();
    });
  });
});

describe('SimpleTable layout override', () => {
  const simpleColumns = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'value', header: 'Value' },
  ];
  const simpleData = [
    { name: 'Item 1', value: '100' },
    { name: 'Item 2', value: '200' },
  ];

  it('layout=table pins the grid below the sm breakpoint', () => {
    const { container } = renderWithProviders(
      <SimpleTable
        data={simpleData}
        columns={simpleColumns}
        layout="table"
      />,
    );
    expect(container.querySelector('[data-testid="simple-table-cards"]')).toBeNull();
    expect(container.querySelector('.is_Table')).not.toBeNull();
  });

  it('layout=cards pins the card list', () => {
    const { container } = renderWithProviders(
      <SimpleTable
        data={simpleData}
        columns={simpleColumns}
        layout="cards"
      />,
    );
    expect(container.querySelector('[data-testid="simple-table-cards"]')).not.toBeNull();
  });
});

describe('Table primitives card layout', () => {
  function PrimitiveTable({ layout }: { layout?: 'auto' | 'table' | 'cards' }) {
    return (
      <Table layout={layout}>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>Name</Table.HeaderCell>
            <Table.HeaderCell>City</Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>John Doe</Table.Cell>
            <Table.Cell>New York</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>Jane Smith</Table.Cell>
            <Table.Cell>Los Angeles</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    );
  }

  it('defaults to the semantic table (no behavior change for existing consumers)', () => {
    const { container } = renderWithProviders(<PrimitiveTable />);
    expect(container.querySelector('.is_Table')).not.toBeNull();
    expect(container.querySelector('[data-testid="table-cards"]')).toBeNull();
  });

  it('layout=cards renders body rows as label/value cards', () => {
    const { container, getAllByText } = renderWithProviders(<PrimitiveTable layout="cards" />);
    expect(container.querySelector('.is_Table')).toBeNull();
    const cards = container.querySelectorAll('[data-testid="table-card"]');
    expect(cards).toHaveLength(2);
    // Header labels repeat per card as field labels.
    expect(getAllByText('Name')).toHaveLength(2);
    expect(getAllByText('City')).toHaveLength(2);
    expect(cards[0].textContent).toContain('John Doe');
    expect(cards[1].textContent).toContain('Los Angeles');
  });

  it('layout=auto renders cards below the sm breakpoint', () => {
    const { container } = renderWithProviders(<PrimitiveTable layout="auto" />);
    expect(container.querySelector('[data-testid="table-cards"]')).not.toBeNull();
  });
});

/**
 * Hidden-field filtering surface: chips bar, integration-tested through
 * the compound DataTable (context wiring, client-side pre-filter, live
 * state). The toolbar Filter button lives in DataTableFilterButton.spec.tsx.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DataTableColumn, FilterableField, TableFilter } from '../../types';
import { DataTable } from '../DataTable';

interface Person {
  id: number;
  firstName: string;
  age: number;
  email: string;
  department: string;
}

const data: Person[] = [
  { id: 1, firstName: 'Ada', age: 36, email: 'ada@corp.com', department: 'Engineering' },
  { id: 2, firstName: 'Grace', age: 45, email: 'grace@corp.com', department: 'Engineering' },
  { id: 3, firstName: 'Alan', age: 41, email: 'alan@other.org', department: 'Marketing' },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'age', header: 'Age' },
];

const filterableFields: FilterableField[] = [
  { id: 'email', label: 'Email', type: 'text' },
  {
    id: 'department',
    label: 'Department',
    type: 'select',
    options: [
      { label: 'Engineering', value: 'Engineering' },
      { label: 'Marketing', value: 'Marketing' },
    ],
  },
];

function emailFilter(value: string): TableFilter {
  return {
    id: 'flt-email',
    columnId: 'email',
    value: { operator: 'contains', value },
    label: 'Email',
  };
}

function departmentFilter(value: string): TableFilter {
  return {
    id: 'flt-department',
    columnId: 'department',
    value: { operator: 'is', value },
    label: 'Department',
  };
}

function renderTable(initialFilters: TableFilter[] = []) {
  return renderWithProviders(
    <DataTable
      data={data}
      columns={columns as DataTableColumn<Record<string, any>>[]}
      filterableFields={filterableFields}
      enableFiltering
      enableGlobalSearch
      initialState={{ filters: initialFilters }}
      aria-label="People table"
    />,
  );
}

describe('DataTableFilterChips', () => {
  it('renders a chip for a hidden-field filter and filters the rows', async () => {
    renderTable([emailFilter('corp')]);

    // Chip label reads "Field: operator value"
    await expect(screen.findByText('Email: contains corp')).resolves.toBeTruthy();

    // Rows filtered on a field with NO visible column
    await waitFor(() => {
      expect(screen.getByText('Ada')).toBeTruthy();
      expect(screen.getByText('Grace')).toBeTruthy();
      expect(screen.queryByText('Alan')).toBeNull();
    });
  });

  it('removing the chip restores the rows', async () => {
    renderTable([emailFilter('corp')]);

    await expect(screen.findByText('Email: contains corp')).resolves.toBeTruthy();
    expect(screen.queryByText('Alan')).toBeNull();

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('Email: contains corp')).toBeNull();
      expect(screen.getByText('Alan')).toBeTruthy();
    });
  });

  it('shows Clear all at 2+ chips and clears every filter at once', async () => {
    renderTable([emailFilter('corp'), departmentFilter('Engineering')]);

    await expect(screen.findByText('Email: contains corp')).resolves.toBeTruthy();
    // Select chips show the option label
    expect(screen.getByText('Department: is Engineering')).toBeTruthy();

    const clearAll = screen.getByRole('button', { name: 'Clear all' });
    fireEvent.click(clearAll);

    await waitFor(() => {
      expect(screen.queryByText('Email: contains corp')).toBeNull();
      expect(screen.queryByText('Department: is Engineering')).toBeNull();
      expect(screen.getByText('Alan')).toBeTruthy();
    });
  });

  it('does not render a chips bar when no filters are active', () => {
    renderTable([]);
    expect(screen.queryByLabelText('Active filters')).toBeNull();
  });

  it('chip press and dismiss are two focusables (LC-71)', async () => {
    renderTable([emailFilter('corp')]);
    const edit = await screen.findByRole('button', { name: /Edit filter/ });
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(edit.getAttribute('tabindex')).toBe('0');
    expect(remove.getAttribute('tabindex')).toBe('0');
    expect(remove.className).toMatch(/mp-chip-dismiss/);
  });
});

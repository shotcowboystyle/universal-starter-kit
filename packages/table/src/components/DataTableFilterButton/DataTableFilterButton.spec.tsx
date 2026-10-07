/**
 * DataTableFilterButton spec (MPO-113). The button owns the toolbar Filter
 * surface: trigger, searchable field list, live-commit into the shared
 * operator/value editor. Chip rendering belongs to DataTableFilterChips.
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

describe('DataTableFilterButton', () => {
  it('renders the toolbar Filter affordance when filterableFields exist', async () => {
    renderTable([]);
    await expect(screen.findByRole('button', { name: 'Filter' })).resolves.toBeTruthy();
  });

  it('shows the active filter count on the trigger', async () => {
    renderTable([emailFilter('corp')]);
    await expect(screen.findByText('Filter (1)')).resolves.toBeTruthy();
  });

  it('field list is a single-tab-stop listbox (LC-49 / LC-71)', async () => {
    renderTable([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Filter' }));
    const listbox = await screen.findByRole('listbox', { name: 'Filterable fields' });
    expect(listbox.getAttribute('tabindex')).toBe('0');
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('opens a searchable field list with visible columns grouped before hidden fields', async () => {
    renderTable([]);

    fireEvent.click(await screen.findByRole('button', { name: 'Filter' }));

    await expect(screen.findByText('Columns')).resolves.toBeTruthy();
    expect(screen.getByText('More fields')).toBeTruthy();

    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Department')).toBeTruthy();

    const search = screen.getByPlaceholderText('Search fields...');
    fireEvent.change(search, { target: { value: 'dep' } });
    await waitFor(() => {
      expect(screen.queryByText('Email')).toBeNull();
      expect(screen.getByText('Department')).toBeTruthy();
    });
  });

  it('live-commits a hidden-field filter (no Apply button)', async () => {
    renderTable([]);

    fireEvent.click(await screen.findByRole('button', { name: 'Filter' }));
    fireEvent.click(await screen.findByText('Email'));

    await expect(screen.findByText('Condition')).resolves.toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();

    const valueInput = await screen.findByPlaceholderText('Enter value...');
    fireEvent.change(valueInput, { target: { value: 'other' } });

    await waitFor(() => {
      expect(screen.getByText('Email: contains other')).toBeTruthy();
      expect(screen.getByText('Alan')).toBeTruthy();
      expect(screen.queryByText('Ada')).toBeNull();
    });
  });
});

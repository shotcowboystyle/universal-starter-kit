/**
 * keepPreviousData — a refetch must not blank the body.
 *
 * TanStack Query's placeholderData / keepPreviousData, AG Grid's delta
 * row-data, and Frappe Desk's list all keep the last painted rows on
 * screen while the next query is in flight. The only in-flight chrome
 * allowed is a toolbar spinner (aria-busy). Skeleton, empty-state, and
 * a covering overlay are first-load only.
 */

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

interface Person {
  id: number;
  firstName: string;
  age: number;
}

const sampleData: Person[] = [
  { id: 1, firstName: 'John', age: 28 },
  { id: 2, firstName: 'Jane', age: 32 },
];

const columns: DataTableColumn<Person>[] = [
  { id: 'firstName', accessorKey: 'firstName', header: 'First Name' },
  { id: 'age', accessorKey: 'age', header: 'Age' },
];

function renderTable(extra: Record<string, unknown> = {}, data: Person[] = sampleData) {
  return renderWithProviders(
    <DataTable
      data={data}
      columns={columns as DataTableColumn<Record<string, any>>[]}
      layout="table"
      enablePagination={false}
      enableGlobalSearch={false}
      enableFiltering={false}
      onStateChange={vi.fn()}
      {...extra}
    />,
  );
}

describe('DataTable keepPreviousData', () => {
  it('keeps previous rows painted when isFetching arrives with empty data', () => {
    const { rerender, getByText, queryByText } = renderTable({ isFetching: false });
    expect(getByText('John')).toBeDefined();

    rerender(
      <DataTable
        data={[]}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        layout="table"
        enablePagination={false}
        enableGlobalSearch={false}
        enableFiltering={false}
        isFetching
        onStateChange={vi.fn()}
      />,
    );

    expect(getByText('John')).toBeDefined();
    expect(getByText('Jane')).toBeDefined();
    expect(queryByText('No data available')).toBeNull();
    expect(queryByText('No results found')).toBeNull();
  });

  it('keeps previous rows in list layout while isFetching blanks the payload', () => {
    const { rerender, getByText, queryByText, container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        layout="list"
        enablePagination={false}
        enableGlobalSearch={false}
        enableFiltering={false}
        onStateChange={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('[data-testid="data-table-list-row"]')).toHaveLength(2);

    rerender(
      <DataTable
        data={[]}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        layout="list"
        enablePagination={false}
        enableGlobalSearch={false}
        enableFiltering={false}
        isFetching
        onStateChange={vi.fn()}
      />,
    );

    expect(getByText('John')).toBeDefined();
    expect(container.querySelectorAll('[data-testid="data-table-list-row"]')).toHaveLength(2);
    expect(queryByText('No data available')).toBeNull();
  });

  it('does not cover existing rows with a loading overlay when isLoading is set', () => {
    const { getByText, queryByLabelText } = renderTable({ isLoading: true });
    expect(getByText('John')).toBeDefined();
    expect(queryByLabelText('Loading table data')).toBeNull();
  });

  it('does not unmount rows for a skeleton when isLoading arrives after a first paint', () => {
    const { rerender, getByText, queryByLabelText } = renderTable({ isLoading: false });
    expect(getByText('John')).toBeDefined();

    rerender(
      <DataTable
        data={sampleData}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        layout="table"
        enablePagination={false}
        enableGlobalSearch={false}
        enableFiltering={false}
        isLoading
        onStateChange={vi.fn()}
      />,
    );

    expect(getByText('John')).toBeDefined();
    expect(queryByLabelText('Loading table data')).toBeNull();
  });

  it('does not paint the true-empty copy while a first fetch is in flight', () => {
    const { queryByText, container } = renderTable({ isFetching: true }, []);
    expect(queryByText('No data available')).toBeNull();
    expect(queryByText('No results found')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows empty state only after the query settles with zero rows', () => {
    const { getByText } = renderTable({ isFetching: false, isLoading: false }, []);
    expect(getByText('No data available')).toBeDefined();
  });
});

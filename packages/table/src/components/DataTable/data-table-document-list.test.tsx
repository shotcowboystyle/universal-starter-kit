/**
 * DataTableDocumentList specs — the list body's OWN contract.
 *
 * card-layout.test.tsx proves layout=list picks this body over the grid and the
 * cards, that the title slot honours meta.role, and that rows are a nowrap flex
 * list rather than a column grid. What no spec pinned is the SLOT TAXONOMY the
 * list is built on (document-list-slots.ts): which column lands in the trailing
 * indicator cluster, which becomes muted meta, which is dropped outright, and
 * what happens when nothing declares a role at all. Plus the row head
 * (selection) and the two empty-state copies.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableState, TableFilter } from '../../types';

import { DataTable } from './index';
import type { DataTableRootProps } from './index';

interface Task {
  id: number;
  title: string;
  owner: string;
  status: string;
}

const tasks: Task[] = [
  { id: 1, title: 'Ship the card layout', owner: 'Ada', status: 'Open' },
  { id: 2, title: 'Rewire the chips', owner: 'Grace', status: 'Blocked' },
];

const columns: DataTableColumn<Task>[] = [
  { accessorKey: 'title', header: 'Title', meta: { role: 'title' } },
  { accessorKey: 'owner', header: 'Owner' },
  { accessorKey: 'status', header: 'Status', meta: { role: 'indicator' } },
];

const renderList = (props: Partial<DataTableRootProps<Task>> = {}) =>
  renderWithProviders(
    <DataTable
      data={tasks}
      columns={columns}
      layout="list"
      onStateChange={vi.fn<(state: DataTableState) => void>()}
      {...props}
    />,
  );

const slots = (container: HTMLElement, slot: string) =>
  [...container.querySelectorAll(`[data-list-slot="${slot}"]`)].map((n) => n.textContent);

describe('DataTableDocumentList', () => {
  it('renders one row per document inside the list container', () => {
    const { container } = renderList();
    expect(container.querySelector('[data-testid="data-table-list"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="data-table-list-row"]')).toHaveLength(tasks.length);
  });

  it('splits a row into title, muted meta and a trailing indicator', () => {
    const { container } = renderList();
    expect(slots(container, 'title')[0]).toBe('Ship the card layout');
    expect(slots(container, 'meta')).toContain('Ada');
    expect(slots(container, 'indicator')).toContain('Open');
  });

  it('with no roles declared the first content column leads and status still indicates', () => {
    const { container } = renderList({
      columns: [
        { accessorKey: 'title', header: 'Title' },
        { accessorKey: 'owner', header: 'Owner' },
        { accessorKey: 'status', header: 'Status' },
      ],
    });
    expect(slots(container, 'title')[0]).toBe('Ship the card layout');
    expect(slots(container, 'meta')).toContain('Ada');
    // `status` reaches the indicator cluster on its id alone, no meta.role.
    expect(slots(container, 'indicator')).toContain('Open');
  });

  it('an underscore-prefixed column is an action, never muted meta', () => {
    const { container } = renderList({
      columns: [
        { accessorKey: 'title', header: 'Title', meta: { role: 'title' } },
        { id: '_liked_by', accessorKey: 'owner', header: '♥', meta: { label: 'Liked' } },
      ],
    });
    expect(slots(container, 'actions')).toContain('Ada');
    expect(slots(container, 'meta')).not.toContain('Ada');
  });

  it('a hidden-role column is dropped from every slot, not merely styled down', () => {
    const { container } = renderList({
      columns: [
        { accessorKey: 'title', header: 'Title', meta: { role: 'title' } },
        { accessorKey: 'owner', header: 'Owner', meta: { role: 'hidden' } },
      ],
    });
    expect(slots(container, 'title')[0]).toBe('Ship the card layout');
    expect(slots(container, 'meta')).not.toContain('Ada');
    expect(slots(container, 'indicator')).not.toContain('Ada');
    expect(slots(container, 'actions')).not.toContain('Ada');
  });

  it('a list is not a form: column headers never reprint as row labels', () => {
    renderList();
    expect(screen.queryByText('Owner')).toBeNull();
    expect(screen.queryByText('Status')).toBeNull();
  });

  it('selection puts a named checkbox at the head of every row', () => {
    renderList({ enableRowSelection: true });
    expect(screen.getAllByLabelText(/^Select row /u)).toHaveLength(tasks.length);
  });

  it("empty with no filters reads 'No data available'", () => {
    renderWithProviders(
      <DataTable
        data={[]}
        columns={columns}
        layout="list"
        onStateChange={vi.fn<(state: DataTableState) => void>()}
      />,
    );
    expect(screen.getByText('No data available')).toBeTruthy();
  });

  it("empty because a filter matched nothing reads 'No results found'", async () => {
    const noMatch: TableFilter[] = [
      {
        id: 'flt-owner',
        columnId: 'owner',
        value: { operator: 'contains', value: 'zzzz' },
        label: 'Owner',
      },
    ];
    const { container } = renderWithProviders(
      <DataTable
        data={tasks}
        columns={columns}
        layout="list"
        enableFiltering
        filterableFields={[{ id: 'owner', label: 'Owner', type: 'text' }]}
        initialState={{ filters: noMatch }}
        onStateChange={vi.fn<(state: DataTableState) => void>()}
      />,
    );
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="data-table-list-row"]')).toHaveLength(0);
      expect(screen.getByText('No results found')).toBeTruthy();
    });
  });
});

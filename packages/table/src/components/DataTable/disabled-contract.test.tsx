/**
 * UX-011 / Axiom 6 HONEST STATE — the advertised `disabled` prop must
 * actually disable the table (web previously renamed it `_disabled` and
 * dropped it).
 *
 * Covers: root inert + aria-disabled, cell editors rendered disabled,
 * gated data mutation (sort press, cell change, add/delete row,
 * selection), and the card-layout twin (default below `$sm` in the
 * happy-dom env). Enabled twins assert the gates only bite when
 * `disabled` is set.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
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
  { id: 3, firstName: 'Bob', age: 45 },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'age', header: 'Age' },
];

const editableColumns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name', field: 'input' },
  { accessorKey: 'age', header: 'Age', field: 'stepper' },
];

const firstNameOrder = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[role="row"][aria-label^="Row"]')].map(
    (row) => row.querySelector('[role="cell"]')?.textContent?.trim() ?? '',
  );

describe('DataTable disabled contract (grid layout)', () => {
  it('marks the root aria-disabled and inert', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        layout="table"
        disabled
        onStateChange={vi.fn<() => void>()}
      />,
    );
    const root = container.querySelector('[aria-label="Data table"][aria-disabled="true"]');
    expect(root).not.toBeNull();
    expect(root!.hasAttribute('inert')).toBe(true);
  });

  it('enabled twin carries neither aria-disabled nor inert', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        layout="table"
        onStateChange={vi.fn<() => void>()}
      />,
    );
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
    expect(container.querySelector('[inert]')).toBeNull();
  });

  it('renders cell editors disabled (field inputs carry disabled)', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={editableColumns}
        layout="table"
        disabled
        onDataChange={vi.fn<() => void>()}
      />,
    );
    // Cell editors live inside the table region (the toolbar search input is
    // chrome — dimmed + inert via the root, not attribute-disabled).
    const inputs = [...container.querySelectorAll('[role="table"] input')].filter(
      (el) => (el as HTMLInputElement).type !== 'checkbox',
    ) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.disabled || input.getAttribute('aria-disabled') === 'true').toBe(true);
    }
  });

  it('does not commit cell changes while disabled', async () => {
    const onDataChange = vi.fn<() => void>();
    const onCellChange = vi.fn<() => void>();
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={editableColumns}
        layout="table"
        disabled
        onDataChange={onDataChange}
        onCellChange={onCellChange}
      />,
    );
    const input = [...container.querySelectorAll('input')].find((el) => el.type !== 'checkbox')!;
    fireEvent.change(input, { target: { value: 'Changed' } });
    // oxlint-disable-next-line github/no-blur -- dispatches a synthetic blur event to trigger the commit path; no focus is moved
    fireEvent.blur(input);
    await waitFor(() => {
      expect(onDataChange).not.toHaveBeenCalled();
      expect(onCellChange).not.toHaveBeenCalled();
    });
  });

  it('sort header press is inert while disabled (enabled twin sorts)', async () => {
    const enabled = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        layout="table"
        enableSorting
        onStateChange={vi.fn<() => void>()}
      />,
    );
    const enabledHeader = enabled.container.querySelector('#firstName-header')!;
    fireEvent.click(enabledHeader);
    await waitFor(() => {
      expect(enabledHeader.getAttribute('aria-sort')).toBe('ascending');
    });

    const disabledRender = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        layout="table"
        enableSorting
        disabled
        onStateChange={vi.fn<() => void>()}
      />,
    );
    const disabledHeader = disabledRender.container.querySelector('#firstName-header')!;
    fireEvent.click(disabledHeader);
    await waitFor(() => {
      expect(disabledHeader.getAttribute('aria-sort')).toBe('none');
    });
    expect(firstNameOrder(disabledRender.container)).toStrictEqual(['John', 'Jane', 'Bob']);
  });

  it('row selection checkboxes render disabled and do not toggle', async () => {
    const { container, getAllByLabelText } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        layout="table"
        enableRowSelection
        disabled
        onStateChange={vi.fn<() => void>()}
      />,
    );
    // Selection toggles are named by row identity (first cell value).
    const [rowCheckbox] = getAllByLabelText(/^Select row John$/u);
    fireEvent.click(rowCheckbox);
    await waitFor(() => {
      expect(container.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
    });
  });

  it('Add Row button renders disabled', () => {
    const { getByLabelText } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        layout="table"
        showAddRow
        disabled
        onDataChange={vi.fn<() => void>()}
      />,
    );
    const addRow = getByLabelText('Add Row').closest("button, [role='button']")!;
    expect((addRow as HTMLButtonElement).disabled || addRow.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('delete row is gated while disabled', async () => {
    const onDataChange = vi.fn<() => void>();
    const { getAllByLabelText } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        layout="table"
        showDeleteRow
        disabled
        onDataChange={onDataChange}
      />,
    );
    fireEvent.click(getAllByLabelText(/^Delete row 1$/u)[0]);
    await waitFor(() => {
      expect(onDataChange).not.toHaveBeenCalled();
    });
  });
});

describe('DataTable disabled contract (card layout)', () => {
  it('card layout renders with disabled chrome and inert controls', async () => {
    const onDataChange = vi.fn<() => void>();
    const { container, getByLabelText, getAllByLabelText } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        enableRowSelection
        enableSorting
        showDeleteRow
        disabled
        onDataChange={onDataChange}
        onStateChange={vi.fn<() => void>()}
      />,
    );
    // Cards render (default below $sm in the test env) with the root marked.
    expect(container.querySelector('[data-testid="data-table-cards"]')).not.toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();

    // Sort menu trigger renders disabled.
    const sortButton = getByLabelText('Sort rows').closest("button, [role='button']")!;
    expect((sortButton as HTMLButtonElement).disabled || sortButton.getAttribute('aria-disabled') === 'true').toBe(
      true,
    );

    // Row delete is gated.
    fireEvent.click(getAllByLabelText(/^Delete row 1$/u)[0]);
    await waitFor(() => {
      expect(onDataChange).not.toHaveBeenCalled();
    });

    // Selection does not toggle. (Toggles are named by row identity.)
    fireEvent.click(getAllByLabelText(/^Select row John$/u)[0]);
    await waitFor(() => {
      expect(container.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
    });
  });
});

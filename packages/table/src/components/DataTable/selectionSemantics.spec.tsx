/**
 * Row-selection semantics (desk-parity audit fix).
 *
 * The audit finding: list-row selection toggles rendered as anonymous
 * pressables — no role=checkbox, no aria-checked, invisible to AT and
 * automation; the bulk-actions bar was unreachable without a mouse. These
 * specs pin the REAL checkbox contract on the package selection column:
 * every toggle is role="checkbox" with aria-checked (header select-all
 * supports "mixed"), named by row identity ("Select row {name}"), meets
 * the 44px press floor through the control's own box (LC-54), toggles
 * from the keyboard, and keyboard-only selection reaches the bulk bar.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { BulkAction, DataTableColumn } from '../../types';

import { DataTable } from './index';

interface Person {
  id: number;
  firstName: string;
  age: number;
}

const sampleData: Person[] = [
  { id: 1, firstName: 'Alice', age: 30 },
  { id: 2, firstName: 'Bob', age: 40 },
  { id: 3, firstName: 'Carol', age: 20 },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'age', header: 'Age' },
];

function renderSelectionTable(extraProps: Record<string, unknown> = {}) {
  const bulkExecute = vi.fn();
  const bulkActions: BulkAction<Person>[] = [{ id: 'archive', label: 'Archive', onExecute: bulkExecute }];
  const result = renderWithProviders(
    <DataTable
      data={sampleData}
      columns={columns as DataTableColumn<Record<string, any>>[]}
      layout="table"
      enablePagination={false}
      enableRowSelection
      bulkActions={bulkActions as BulkAction<Record<string, any>>[]}
      {...extraProps}
    />,
  );
  return { ...result, bulkExecute };
}

describe('DataTable selection semantics', () => {
  it('row toggles are real checkboxes named by row identity', () => {
    renderSelectionTable();

    const rowCheckboxes = [
      screen.getByRole('checkbox', { name: 'Select row Alice' }),
      screen.getByRole('checkbox', { name: 'Select row Bob' }),
      screen.getByRole('checkbox', { name: 'Select row Carol' }),
    ];
    for (const checkbox of rowCheckboxes) {
      expect(checkbox.getAttribute('aria-checked')).toBe('false');
      // Real disclosure for automation: state is machine-readable, and the
      // toggle is a focusable control (not an anonymous pressable View).
      expect(checkbox.getAttribute('role')).toBe('checkbox');
      expect(checkbox.tagName).toBe('BUTTON');
    }
  });

  it('rowLabel drives the checkbox names when provided', () => {
    renderSelectionTable({
      rowLabel: (row: Person) => `${row.firstName} #${row.id}`,
    });
    expect(screen.getByRole('checkbox', { name: 'Select row Alice #1' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Select row Carol #3' })).toBeDefined();
  });

  it("meets the 44px press floor through the control's own box (LC-54)", () => {
    renderSelectionTable();
    const checkbox = screen.getByRole('checkbox', { name: 'Select row Alice' });
    const style = getComputedStyle(checkbox);
    expect(Number.parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44);
  });

  it('header select-all exposes aria-checked including the mixed state', async () => {
    renderSelectionTable();
    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows on page' });
    expect(selectAll.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Alice' }));
    await waitFor(() => {
      expect(selectAll.getAttribute('aria-checked')).toBe('mixed');
    });

    fireEvent.click(selectAll);
    await waitFor(() => {
      expect(selectAll.getAttribute('aria-checked')).toBe('true');
    });
    for (const name of ['Alice', 'Bob', 'Carol']) {
      expect(screen.getByRole('checkbox', { name: `Select row ${name}` }).getAttribute('aria-checked')).toBe('true');
    }

    fireEvent.click(selectAll);
    await waitFor(() => {
      expect(selectAll.getAttribute('aria-checked')).toBe('false');
    });
  });

  it('keyboard-only selection reaches the bulk-actions bar', async () => {
    const user = userEvent.setup();
    const { bulkExecute } = renderSelectionTable();
    expect(screen.queryByText('1 selected')).toBeNull();

    // Space on the focused checkbox (real keystroke; the role=checkbox
    // frame is a native button, so Space activates it).
    const alice = screen.getByRole('checkbox', { name: 'Select row Alice' });
    alice.focus();
    expect(document.activeElement).toBe(alice);
    await user.keyboard(' ');
    await waitFor(() => {
      expect(alice.getAttribute('aria-checked')).toBe('true');
    });

    // The bulk bar appears with the count and reachable actions.
    await expect(screen.findByText('1 selected')).resolves.toBeDefined();

    const carol = screen.getByRole('checkbox', { name: 'Select row Carol' });
    carol.focus();
    await user.keyboard(' ');
    await expect(screen.findByText('2 selected')).resolves.toBeDefined();

    // The bar's actions are real buttons — Enter activates without a pointer.
    const archive = screen.getByRole('button', { name: 'Archive' });
    archive.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(bulkExecute).toHaveBeenCalledOnce();
    });
    expect(bulkExecute.mock.calls[0][0]).toHaveLength(2);
  });

  it('cards layout carries the same checkbox semantics', () => {
    renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        layout="cards"
        enablePagination={false}
        enableRowSelection
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Select row Bob' });
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toBeDefined();
  });
});

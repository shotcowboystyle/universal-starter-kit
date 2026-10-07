/**
 * LC-71 RING-ANATOMY on table rows and cells.
 *
 * Two channels, never shared: selected = fill; keyboard focus = one inset
 * ring on the perceived control (the row when the row is the tab stop, the
 * cell when Excel-mode keyboard nav is on the cell). Unselected siblings
 * carry neither a selection border nor a ring. Pointer-origin focus paints
 * no ring.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';

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
  { id: 'firstName', accessorKey: 'firstName', header: 'First Name' },
  { id: 'age', accessorKey: 'age', header: 'Age' },
];

function renderGrid(extra: Record<string, unknown> = {}) {
  return renderWithProviders(
    <DataTable
      data={sampleData}
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

describe('DataTable LC-71 row/cell rings', () => {
  it('selected row is fill (data-row-selected), not a ring on every sibling', () => {
    const { container } = renderGrid({ enableRowSelection: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Alice' }));

    const selected = container.querySelectorAll('[data-row-selected="true"]');
    const unselected = container.querySelectorAll('[data-row-selected="false"]');
    expect(selected).toHaveLength(1);
    expect(unselected).toHaveLength(2);
    expect(selected[0]?.getAttribute('aria-selected')).toBe('true');
    for (const row of unselected) {
      expect(row.getAttribute('aria-selected')).not.toBe('true');
      expect(row.dataset.rowKeyboardFocus).not.toBe('true');
    }
  });

  it('keyboard-focused pressable row is the only ring (LC-71)', () => {
    const { container } = renderGrid({ onRowPress: vi.fn() });
    const rows = [...container.querySelectorAll('[data-row-press="true"]')] as HTMLElement[];
    expect(rows).toHaveLength(3);

    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);

    const focused = container.querySelectorAll('[data-row-keyboard-focus="true"]');
    expect(focused).toHaveLength(1);
    expect(focused[0]).toBe(rows[1]);
    expect(rows[0].dataset.rowKeyboardFocus).not.toBe('true');
    expect(rows[2].dataset.rowKeyboardFocus).not.toBe('true');
  });

  it('Excel-mode keyboard nav rings exactly one cell, never every cell', () => {
    const { container } = renderGrid({ enableKeyboardNavigation: true });
    const grid = container.querySelector('[data-table-grid="true"]') as HTMLElement;
    expect(grid).not.toBeNull();

    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    const focusedCells = container.querySelectorAll('[data-cell-keyboard-focus="true"]');
    expect(focusedCells).toHaveLength(1);

    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    const after = container.querySelectorAll('[data-cell-keyboard-focus="true"]');
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(focusedCells[0]);

    const focusedRows = container.querySelectorAll('[data-row-keyboard-focus="true"]');
    expect(focusedRows).toHaveLength(0);
  });

  it('list layout selected row uses the same fill channel', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        layout="list"
        enableRowSelection
        enablePagination={false}
        enableGlobalSearch={false}
        enableFiltering={false}
        onStateChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Alice' }));
    const selected = container.querySelectorAll('[data-testid="data-table-list-row"][data-row-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="data-table-list-row"][data-row-selected="false"]')).toHaveLength(
      2,
    );
  });
});

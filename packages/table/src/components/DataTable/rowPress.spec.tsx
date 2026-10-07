/**
 * onRowPress — first-class row activation (LC-49 ONE-TAB-STOP, LC-50
 * KEY-ACTIVATION, DG-A11Y-06 names).
 *
 * The row is ONE pressable unit: click/tap anywhere activates, Enter AND
 * Space activate from the keyboard, the row set exposes exactly one tab
 * stop (roving tabindex, arrows/Home/End move it), and presses that
 * originate on inner interactive controls (selection checkboxes, buttons)
 * never reach the row handler. Cards (layout="cards") take the same
 * contract with role="button".
 *
 * layout="table" pins the grid below the $sm test-env breakpoint.
 */

import { Button } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'age', header: 'Age' },
];

function pressRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('[data-row-press="true"]')] as HTMLElement[];
}

function renderRowPressTable(extraProps: Record<string, unknown> = {}) {
  const onRowPress = vi.fn();
  const result = renderWithProviders(
    <DataTable
      data={sampleData}
      columns={columns as DataTableColumn<Record<string, any>>[]}
      layout="table"
      enablePagination={false}
      onRowPress={onRowPress}
      {...extraProps}
    />,
  );
  return { ...result, onRowPress };
}

describe('DataTable onRowPress (grid)', () => {
  it('activates on a click anywhere in the row with the row data and index', () => {
    const { container, onRowPress } = renderRowPressTable();
    const rows = pressRows(container);
    expect(rows).toHaveLength(3);

    fireEvent.click(screen.getByText('Bob'));
    expect(onRowPress).toHaveBeenCalledOnce();
    expect(onRowPress).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Bob', id: 2 }), 1);
  });

  it('exposes exactly one tab stop; arrows and Home/End rove it (LC-49)', async () => {
    const { container } = renderRowPressTable();
    const rows = pressRows(container);

    const tabStops = () => rows.map((row) => row.getAttribute('tabindex'));
    expect(tabStops()).toEqual(['0', '-1', '-1']);

    rows[0].focus();
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    // The anchor follows focus: still exactly one tabindex=0.
    await waitFor(() => {
      const stops = pressRows(container).map((row) => row.getAttribute('tabindex'));
      expect(stops).toEqual(['-1', '0', '-1']);
    });

    fireEvent.keyDown(rows[1], { key: 'End' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2], { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: 'ArrowUp' });
    // Clamped at the first row — no wrap.
    expect(document.activeElement).toBe(rows[0]);
  });

  it('activates on Enter AND Space, once per physical key press (LC-50)', () => {
    const { container, onRowPress } = renderRowPressTable();
    const rows = pressRows(container);
    rows[0].focus();

    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(onRowPress).toHaveBeenCalledOnce();
    expect(onRowPress).toHaveBeenLastCalledWith(expect.objectContaining({ firstName: 'Alice' }), 0);

    fireEvent.keyDown(rows[0], { key: ' ' });
    expect(onRowPress).toHaveBeenCalledTimes(2);

    // Key auto-repeat never machine-guns activations.
    fireEvent.keyDown(rows[0], { key: 'Enter', repeat: true });
    expect(onRowPress).toHaveBeenCalledTimes(2);
  });

  it('ignores presses that originate on inner interactive controls', () => {
    const buttonPress = vi.fn();
    const interactiveColumns: DataTableColumn<Person>[] = [
      ...columns,
      {
        id: 'row_actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Button
            size="$2"
            onPress={() => buttonPress(row.original.id)}>
            Edit
          </Button>
        ),
      },
    ];
    const { container, onRowPress } = renderRowPressTable({
      columns: interactiveColumns as DataTableColumn<Record<string, any>>[],
      enableRowSelection: true,
    });

    // Selection checkbox: toggles selection, never fires the row press.
    const rowCheckbox = screen.getByRole('checkbox', { name: 'Select row Alice' });
    fireEvent.click(rowCheckbox);
    expect(rowCheckbox.getAttribute('aria-checked')).toBe('true');
    expect(onRowPress).not.toHaveBeenCalled();

    // Inner button: its own handler fires, the row press does not.
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(buttonPress).toHaveBeenCalledWith(1);
    expect(onRowPress).not.toHaveBeenCalled();

    // A plain cell in the same row still activates the row.
    fireEvent.click(screen.getByText('Alice'));
    expect(onRowPress).toHaveBeenCalledOnce();
    expect(container.querySelectorAll('[data-row-press="true"]')).toHaveLength(3);
  });

  it('names rows: rowLabel accessor wins; first cell value is the fallback', () => {
    const { container, unmount } = renderRowPressTable({
      rowLabel: (row: Person) => `Open ${row.firstName}`,
    });
    expect(pressRows(container).map((row) => row.getAttribute('aria-label'))).toEqual([
      'Open Alice',
      'Open Bob',
      'Open Carol',
    ]);
    unmount();

    const { container: fallbackContainer } = renderRowPressTable();
    expect(pressRows(fallbackContainer)[0].getAttribute('aria-label')).toBe('Alice');
  });
});

describe('DataTable onRowPress (cards layout)', () => {
  it('cards are pressable buttons with the same activation + isolation contract', async () => {
    const onRowPress = vi.fn();
    renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        layout="cards"
        enablePagination={false}
        enableRowSelection
        onRowPress={onRowPress}
        rowLabel={(row) => (row as Person).firstName}
      />,
    );

    const card = screen.getByRole('button', { name: 'Bob' });
    expect(card.dataset.rowPress).toBe('true');

    // Inner selection checkbox stays isolated from the card press.
    const checkbox = screen.getByRole('checkbox', { name: 'Select row Bob' });
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(onRowPress).not.toHaveBeenCalled();

    fireEvent.click(card);
    expect(onRowPress).toHaveBeenCalledOnce();
    expect(onRowPress).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Bob' }), 1);

    // Enter activates the focused card (LC-50).
    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });
    await waitFor(() => {
      expect(onRowPress).toHaveBeenCalledTimes(2);
    });
  });

  it('card list exposes one roving tab stop scoped to the list (LC-49)', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        layout="cards"
        enablePagination={false}
        onRowPress={vi.fn()}
      />,
    );
    const cards = pressRows(container as HTMLElement);
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(
      (container as HTMLElement).querySelector('[data-row-press-scope="true"] [data-row-press="true"]'),
    ).not.toBeNull();

    cards[0].focus();
    fireEvent.keyDown(cards[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cards[1]);
  });
});

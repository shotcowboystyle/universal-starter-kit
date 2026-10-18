/**
 * A row commit re-renders the grid's cells in place (MPO-475). TanStack's
 * flexRender mounts each column's `cell` as a component, so a renderer that
 * changes identity on a commit remounts every cell, and focus that a Tab or
 * Enter just placed in the grid lands on a detached node.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import { useForm } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableData } from '../../types';
import { ChildTable } from '../ChildTable';

import { TableInput } from './index';

interface Line extends DataTableData {
  id: string;
  item: string;
  qty: number;
}

const initial = (): Line[] => [
  { id: 'a', item: 'Bracket', qty: 12 },
  { id: 'b', item: 'Bolts', qty: 3 },
];

const columns: DataTableColumn<Line>[] = [
  { accessorKey: 'item', header: 'Item', field: 'input' },
  { accessorKey: 'qty', header: 'Qty', field: 'stepper', fieldProps: { min: 0 } },
];

const Harness = ({ onChange, freshSchema = false }: { onChange?: (rows: Line[]) => void; freshSchema?: boolean }) => {
  const [rows, setRows] = React.useState(initial);
  return (
    <ChildTable<Line>
      value={rows}
      columns={freshSchema ? columns.map((col) => ({ ...col })) : columns}
      isCellHidden={freshSchema ? () => false : undefined}
      rowDetail
      onChange={(next) => {
        setRows(next);
        onChange?.(next);
      }}
    />
  );
};

const FormHarness = ({ onChange }: { onChange?: (rows: Line[]) => void }) => {
  const form = useForm({ defaultValues: { lines: initial() } });
  return (
    <TableInput<Line>
      form={form as any}
      name="lines"
      columns={columns}
      rowDetail
      onChange={onChange}
    />
  );
};

const cell = (rowIndex: number, label: string) => {
  const row = document.querySelector<HTMLElement>(`[data-child-row-index="${rowIndex}"]`);
  if (!row) {
    throw new Error(`no grid row ${rowIndex}`);
  }
  return within(row).getByLabelText<HTMLInputElement>(label);
};

const gridControls = () => [cell(0, 'Item'), cell(0, 'Qty'), cell(1, 'Item'), cell(1, 'Qty')];

const expectConnected = (nodes: HTMLElement[]) => {
  expect(nodes.map((node) => node.isConnected)).toStrictEqual(nodes.map(() => true));
};

const flushBlurTimer = async () => {
  await act(async () => {
    await sleep(15);
  });
};

describe('TableInput cells survive a row commit (MPO-475)', () => {
  it('Enter commits an edit and focus stays on the same connected input', async () => {
    const onChange = vi.fn<(rows: Line[]) => void>();
    renderWithProviders(<Harness onChange={onChange} />);
    const before = gridControls();
    const item = cell(0, 'Item');

    await userEvent.click(item);
    await userEvent.type(item, 'X');
    fireEvent.keyDown(item, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][0].item).toBe('BracketX');
    expectConnected(before);
    expect(document.activeElement).toBe(item);
  });

  it("Tab after an edit commits and lands on the next cell's connected control", async () => {
    const onChange = vi.fn<(rows: Line[]) => void>();
    renderWithProviders(<Harness onChange={onChange} />);
    const before = gridControls();
    const item = cell(0, 'Item');
    const qty = cell(0, 'Qty');

    await userEvent.click(item);
    await userEvent.type(item, 'X');
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][0].item).toBe('BracketX');
    expectConnected(before);
    expect(document.activeElement).toBe(qty);
  });

  it("Shift+Tab after a Stepper edit commits and lands on the previous cell's connected control", async () => {
    const onChange = vi.fn<(rows: Line[]) => void>();
    renderWithProviders(<Harness onChange={onChange} />);
    const before = gridControls();
    const item = cell(0, 'Item');
    const qty = cell(0, 'Qty');

    await userEvent.click(qty);
    await userEvent.clear(qty);
    await userEvent.type(qty, '7');
    await userEvent.tab({ shift: true });
    await flushBlurTimer();

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][0].qty).toBe(7);
    expectConnected(before);
    expect(document.activeElement).toBe(item);
  });

  it("a commit in one row leaves the other row's cells connected in the form branch", async () => {
    const onChange = vi.fn<(rows: Line[]) => void>();
    renderWithProviders(<FormHarness onChange={onChange} />);
    const before = gridControls();
    const item = cell(1, 'Item');

    await userEvent.click(item);
    await userEvent.type(item, 'X');
    fireEvent.keyDown(item, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][1].item).toBe('BoltsX');
    expectConnected(before);
    expect(document.activeElement).toBe(item);
  });

  it('a caller that rebuilds columns and isCellHidden every render keeps the cells mounted', async () => {
    const onChange = vi.fn<(rows: Line[]) => void>();
    renderWithProviders(
      <Harness
        onChange={onChange}
        freshSchema
      />,
    );
    const before = gridControls();
    const item = cell(0, 'Item');

    await userEvent.click(item);
    await userEvent.type(item, 'X');
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledOnce();
    expectConnected(before);
    expect(document.activeElement).toBe(cell(0, 'Qty'));
  });

  it('a row detail Done leaves the grid mounted and shows the new values in its cells', async () => {
    const onChange = vi.fn<(rows: Line[]) => void>();
    renderWithProviders(<Harness onChange={onChange} />);
    const before = gridControls();

    fireEvent.click(screen.getByRole('button', { name: 'Edit row 2' }));
    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Row 2' }));
    const detailItem = within(dialog).getByLabelText('Item');
    fireEvent.focus(detailItem);
    fireEvent.change(detailItem, { target: { value: 'Hinge' } });
    // oxlint-disable-next-line github/no-blur -- fireEvent.blur dispatches a synthetic blur to commit the draft; it does not call element.blur()
    fireEvent.blur(detailItem);
    const detailQty = within(dialog).getByLabelText('Qty');
    fireEvent.focus(detailQty);
    fireEvent.change(detailQty, { target: { value: '9' } });
    // oxlint-disable-next-line github/no-blur -- fireEvent.blur dispatches a synthetic blur to commit the draft; it does not call element.blur()
    fireEvent.blur(detailQty);
    await flushBlurTimer();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][1]).toMatchObject({ item: 'Hinge', qty: 9 });
    await waitFor(
      () => {
        expect(screen.queryByRole('dialog', { name: 'Row 2' })).toBeNull();
      },
      {
        timeout: 3000,
      },
    );
    expectConnected(before.slice(0, 2));
    expect(cell(1, 'Item').value).toBe('Hinge');
    expect(cell(1, 'Qty').value).toBe('9');
  });
});

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableData } from '../../types';

import { ChildTable } from './index';

interface ItemRow extends DataTableData {
  id: string;
  item: string;
  notes: string;
  uom: string;
}

const columns: DataTableColumn<ItemRow>[] = [{ accessorKey: 'item', header: 'Item', field: 'input' }];

const detailColumns: DataTableColumn<ItemRow>[] = [
  { accessorKey: 'item', header: 'Item', field: 'input' },
  { accessorKey: 'uom', header: 'UOM', field: 'input' },
];

const initial: ItemRow[] = [
  { id: 'a', item: 'Bracket', notes: '', uom: 'Nos' },
  { id: 'b', item: 'Bolts', notes: '', uom: 'Box' },
];

function Harness({ onChange }: { onChange: (rows: ItemRow[]) => void }) {
  const [value, setValue] = React.useState(initial);
  return (
    <ChildTable<ItemRow>
      value={value}
      columns={columns}
      detailColumns={detailColumns}
      rowDetail
      onChange={(rows) => {
        setValue(rows);
        onChange(rows);
      }}
    />
  );
}

async function openRow(trigger: string, row: number) {
  fireEvent.click(screen.getByRole('button', { name: trigger }));
  return await waitFor(() => screen.getByRole('dialog', { name: `Row ${row}` }));
}

function editText(dialog: HTMLElement, label: string, value: string) {
  const input = within(dialog).getByLabelText(label) as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

function pressButton(dialog: HTMLElement, name: string) {
  fireEvent.click(within(dialog).getByRole('button', { name }));
}

async function expectFocusReturn(trigger: string, row: number, close: (dialog: HTMLElement) => void) {
  screen.getByRole('button', { name: trigger }).focus();
  const dialog = await openRow(trigger, row);
  await waitFor(() => {
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
  close(dialog);
  await waitFor(
    () => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: trigger }));
    },
    { timeout: 3000 },
  );
  await waitFor(
    () => {
      expect(screen.queryByRole('dialog', { name: `Row ${row}` })).toBeNull();
    },
    {
      timeout: 3000,
    },
  );
}

describe('ChildTable row detail editor (MPO-22)', () => {
  it('opens a row in a detail editor with fields the grid does not show', async () => {
    renderWithProviders(<Harness onChange={vi.fn()} />);
    expect(screen.queryByLabelText('UOM')).toBeNull();

    const dialog = await openRow('Edit row 2', 2);
    expect(within(dialog).getByLabelText('Item').value).toBe('Bolts');
    expect(within(dialog).getByLabelText('UOM').value).toBe('Box');
  });

  it('Done writes the edited row back once, other rows untouched', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);

    const dialog = await openRow('Edit row 2', 2);
    editText(dialog, 'UOM', 'Pair');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toEqual([initial[0], { id: 'b', item: 'Bolts', notes: '', uom: 'Pair' }]);
  });

  it('Cancel discards the draft', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);

    const dialog = await openRow('Edit row 1', 1);
    editText(dialog, 'Item', 'Hinge');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Row 1' })).toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a read-only table opens the row for viewing with Close only', async () => {
    renderWithProviders(
      <ChildTable<ItemRow>
        value={initial}
        columns={columns}
        detailColumns={detailColumns}
        rowDetail
        readOnly
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Edit row/ })).toBeNull();

    const dialog = await openRow('View row 1', 1);
    expect(within(dialog).getByText('Nos')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Done' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  describe('closing returns focus to the pencil that opened the row (MPO-471)', () => {
    const cases = [
      {
        name: 'Escape',
        commits: 0,
        close: (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' }),
      },
      {
        name: 'Cancel',
        commits: 0,
        close: (dialog: HTMLElement) => {
          pressButton(dialog, 'Cancel');
        },
      },
      {
        name: 'Done after an edit',
        commits: 1,
        close: (dialog: HTMLElement) => {
          editText(dialog, 'UOM', 'Pair');
          pressButton(dialog, 'Done');
        },
      },
    ];

    for (const { name, commits, close } of cases) {
      it(name, async () => {
        const onChange = vi.fn();
        renderWithProviders(<Harness onChange={onChange} />);
        await expectFocusReturn('Edit row 2', 2, close);
        expect(onChange).toHaveBeenCalledTimes(commits);
      });
    }

    it('Close on a read-only row', async () => {
      renderWithProviders(
        <ChildTable<ItemRow>
          value={initial}
          columns={columns}
          detailColumns={detailColumns}
          rowDetail
          readOnly
          onChange={vi.fn()}
        />,
      );
      await expectFocusReturn('View row 1', 1, (dialog) => {
        pressButton(dialog, 'Close');
      });
    });
  });

  it('is opt-in: no detail button without rowDetail', () => {
    renderWithProviders(
      <ChildTable<ItemRow>
        value={initial}
        columns={columns}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Edit row/ })).toBeNull();
  });
});

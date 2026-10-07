import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableData } from '../../types';

import { ChildTable } from './index';

interface SerialRow extends DataTableData {
  id: string;
  item: string;
  serial: string;
  tracked: boolean;
}

const columns: DataTableColumn<SerialRow>[] = [
  { accessorKey: 'item', header: 'Item', field: 'input' },
  { accessorKey: 'serial', header: 'Serial', field: 'input' },
];

const rows: SerialRow[] = [
  { id: 'a', item: 'Drill', serial: 'SN-1', tracked: true },
  { id: 'b', item: 'Screws', serial: 'SN-2', tracked: false },
];

const isCellHidden = (row: SerialRow, columnId: string) => columnId === 'serial' && !row.tracked;

describe('ChildTable isCellHidden (MPO-22)', () => {
  it('blanks the cell on the rows it names and nowhere else', () => {
    renderWithProviders(
      <ChildTable<SerialRow>
        value={rows}
        columns={columns}
        isCellHidden={isCellHidden}
        onChange={vi.fn()}
      />,
    );
    const serials = screen.getAllByLabelText('Serial');
    expect(serials.map((input) => input.value)).toEqual(['SN-1']);
    expect(screen.getAllByLabelText('Item')).toHaveLength(2);
  });

  it("drops the same field from that row's detail editor", async () => {
    renderWithProviders(
      <ChildTable<SerialRow>
        value={rows}
        columns={columns}
        rowDetail
        isCellHidden={isCellHidden}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit row 2' }));
    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Row 2' }));
    expect(within(dialog).getByLabelText('Item')).toBeTruthy();
    expect(within(dialog).queryByLabelText('Serial')).toBeNull();
  });
});

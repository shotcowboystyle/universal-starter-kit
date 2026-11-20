import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import type { DataTableColumn } from '../../types';
import { DataTable } from '../DataTable';

interface Row {
  id: number;
  name: string;
  amount: number;
}
const data: Row[] = [
  { id: 1, name: 'Alpha', amount: 10 },
  { id: 2, name: 'Beta', amount: 20 },
];
const columns: DataTableColumn<Row>[] = [
  { id: 'name', accessorKey: 'name', header: 'Name' },
  {
    id: 'amount',
    accessorKey: 'amount',
    header: 'Amount',
    align: 'right',
    cell: (info: any) => info.getValue(),
  },
];

describe('scratch', () => {
  it('dumps selection checkbox DOM', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={data}
        columns={columns}
        enableRowSelection
        layout="table"
        enablePagination={false}
      />,
    );
    const labeled = container.querySelectorAll('[aria-label^="Select row"]');
    console.log('SELECT-LABELED COUNT:', labeled.length);
    for (const [i, el] of [...labeled].entries()) {
      if (i < 2) {
        console.log('EL', i, el.outerHTML.slice(0, 800));
      }
    }
    const roleCheckbox = container.querySelectorAll('[role="checkbox"]');
    console.log('ROLE CHECKBOX COUNT:', roleCheckbox.length);
    const ariaChecked = container.querySelectorAll('[aria-checked]');
    console.log('ARIA-CHECKED COUNT:', ariaChecked.length);
    const firstCell = container.querySelector('[role="row"][aria-rowindex="1"]');
    console.log('FIRST DATA ROW:', firstCell ? firstCell.outerHTML.slice(0, 500) : 'none');
    expect(container).toBeInstanceOf(HTMLElement);
  });
});

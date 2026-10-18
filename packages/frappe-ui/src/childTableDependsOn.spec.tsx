import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { childCellHidden, childFieldsToDetailColumns } from './fieldRegistry';
import type { ChildTableFieldDef, FieldSchema } from './fieldRegistry';
import { SchemaForm } from './schemaForm';
import type { FormSchema } from './schemaForm';

const childFields: ChildTableFieldDef[] = [
  { fieldname: 'item_code', fieldtype: 'Data', label: 'Item Code', in_list_view: 1 },
  { fieldname: 'has_serial', fieldtype: 'Check', label: 'Has Serial', in_list_view: 1 },
  {
    fieldname: 'serial_no',
    fieldtype: 'Data',
    label: 'Serial No',
    in_list_view: 1,
    depends_on: 'eval:doc.has_serial == 1',
  },
  {
    fieldname: 'warranty',
    fieldtype: 'Data',
    label: 'Warranty',
    depends_on: 'eval:parent.status == "Draft"',
  },
  { fieldname: 'sec', fieldtype: 'Section Break' },
];

function renderOrder(status: string) {
  const fields: FieldSchema[] = [
    { type: 'Data', name: 'status', label: 'Status' },
    { type: 'Table', name: 'items', label: 'Items', options: 'Order Item', fields: childFields },
  ];
  const schema: FormSchema = { fields, sections: [{ columns: [{ fields }] }] };
  return renderWithProviders(
    <SchemaForm
      schema={schema}
      doc={{
        status,
        items: [
          { name: 'r1', item_code: 'SKU-1', has_serial: 1, serial_no: 'SN-1', warranty: '1y' },
          { name: 'r2', item_code: 'SKU-2', has_serial: 0, serial_no: 'SN-2', warranty: '2y' },
        ],
      }}
      setValue={vi.fn()}
    />,
  );
}

describe('child-table per-row depends_on (MPO-22)', () => {
  it('compiles child depends_on against the row, with the parent doc in scope', () => {
    const hidden = childCellHidden(childFields, { status: 'Draft' })!;
    expect(hidden({ has_serial: 1 }, 'serial_no', 0)).toBe(false);
    expect(hidden({ has_serial: 0 }, 'serial_no', 1)).toBe(true);
    expect(hidden({ has_serial: 0 }, 'item_code', 1)).toBe(false);
    expect(hidden({}, 'warranty', 0)).toBe(false);
    expect(childCellHidden(childFields, { status: 'Submitted' })!({}, 'warranty', 0)).toBe(true);
    expect(childCellHidden([{ fieldname: 'a', fieldtype: 'Data' }])).toBeUndefined();
  });

  it('hides the cell on the row whose depends_on is false and keeps it on the other', () => {
    renderOrder('Draft');
    const serials = screen.getAllByLabelText('Serial No');
    expect(serials.map((input) => input.value)).toEqual(['SN-1']);
    expect(screen.getAllByLabelText('Item Code')).toHaveLength(2);
  });

  it('the row detail editor shows every child field and applies the same rule', async () => {
    expect(childFieldsToDetailColumns(childFields).map((c) => c.id)).toEqual([
      'item_code',
      'has_serial',
      'serial_no',
      'warranty',
    ]);

    renderOrder('Submitted');
    fireEvent.click(screen.getByRole('button', { name: 'Edit row 2' }));
    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Row 2' }));
    expect(within(dialog).getByLabelText('Item Code').value).toBe('SKU-2');
    expect(within(dialog).queryByLabelText('Serial No')).toBeNull();
    expect(within(dialog).queryByLabelText('Warranty')).toBeNull();
  });
});

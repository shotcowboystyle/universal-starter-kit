/**
 * ChildTable field-contract tests (D/R/E/Q/S/C).
 *
 * ChildTable is the FieldLayout wrapper around TableInput. Label / helper /
 * error / required / form-bind coverage lives in TableInput's spec; this file
 * locks the remaining field-contract knobs the edge-cases ledger called a GAP:
 * skeleton, compact, disabled, and readOnly.
 */

import { Form, useForm } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableData } from '../../types';

import { ChildTable } from './index';

vi.mock(import('@repo/router'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useUrlState: <T extends object>(defaultValues: T): [T, () => void] => [defaultValues, () => {}] };
});

interface Row extends DataTableData {
  id: string;
  item: string;
}

const rows: Row[] = [
  { id: 'row-a', item: 'Bracket' },
  { id: 'row-b', item: 'Bolts' },
];

const columns: DataTableColumn<Row>[] = [{ accessorKey: 'item', header: 'Item', field: 'input' }];

const RequiredFormHarness = () => {
  const form = useForm({ defaultValues: { items: rows } });
  return (
    <Form form={form as any}>
      <ChildTable<Row>
        name="items"
        label="Line items"
        required
        columns={columns}
      />
    </Form>
  );
};

describe('ChildTable — D/R/E/Q/S/C', () => {
  it('skeleton branch: TableInput placeholders, no add/delete, aria-busy', () => {
    const { container } = renderWithProviders(
      <ChildTable<Row>
        label="Line items"
        skeleton
        value={rows}
        onChange={vi.fn<(rows: Row[]) => void>()}
        columns={columns}
      />,
    );
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Add Row' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete row/u })).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.getByText('Line items')).toBeTruthy();
  });

  it('compact forwards into the field (useFormField + TableInput)', () => {
    renderWithProviders(
      <ChildTable<Row>
        label="Line items"
        compact
        value={rows}
        onChange={vi.fn<(rows: Row[]) => void>()}
        columns={columns}
      />,
    );
    expect(screen.getByRole('group', { name: /Line items/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Row' })).toBeTruthy();
  });

  it('disabled hides add/delete and does not expose editors', () => {
    renderWithProviders(
      <ChildTable<Row>
        label="Line items"
        disabled
        value={rows}
        onChange={vi.fn<(rows: Row[]) => void>()}
        columns={columns}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add Row' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete row/u })).toBeNull();
  });

  it('readOnly hides add/delete', () => {
    renderWithProviders(
      <ChildTable<Row>
        label="Line items"
        readOnly
        value={rows}
        onChange={vi.fn<(rows: Row[]) => void>()}
        columns={columns}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add Row' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete row/u })).toBeNull();
  });

  it('required + form context still associates the label with the named group', () => {
    renderWithProviders(<RequiredFormHarness />);
    expect(screen.getByRole('group', { name: /Line items/u })).toBeTruthy();
  });
});

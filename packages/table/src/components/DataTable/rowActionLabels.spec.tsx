import { renderWithProviders } from '@repo/test-utils';
// DG-A11Y-06: repeated row actions get differentiated accessible names from
// row identity. Before this pass every per-row action carried the identical
// name ("Delete row" xN, unlabeled chip removes); the names now template the
// row number / item identity through the i18n t() pattern. This spec runs
// with an initialized i18next instance (mirroring the packages/i18n keys) so
// it verifies the real interpolated names, not the raw keys.
import { createColumnHelper } from '@tanstack/react-table';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';
import { TableInput } from '../TableInput';

import { DataTable } from './index';

interface Person {
  id: number;
  name: string;
}

const sampleData: Person[] = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
  { id: 3, name: 'Bob' },
];

const columnHelper = createColumnHelper<Person>();
const columns: DataTableColumn<Person>[] = [
  columnHelper.accessor('id', { header: 'ID' }) as DataTableColumn<Person>,
  columnHelper.accessor('name', { header: 'Name' }) as DataTableColumn<Person>,
];

beforeAll(async () => {
  // Same natural-language keys registered in packages/i18n/en/common.json.
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          'Delete row {{row}}': 'Delete row {{row}}',
          'Select row {{row}}': 'Select row {{row}}',
          'Expand row {{row}}': 'Expand row {{row}}',
          'Collapse row {{row}}': 'Collapse row {{row}}',
          'Row {{row}}': 'Row {{row}}',
        },
      },
    },
  });
});

afterEach(cleanup);

describe('row action accessible names (DG-A11Y-06)', () => {
  it('DataTable delete buttons carry unique row-numbered names', () => {
    renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        showDeleteRow
        onDataChange={vi.fn()}
        onStateChange={vi.fn()}
      />,
    );
    const labels = screen.getAllByLabelText(/^Delete row \d+$/).map((el) => el.getAttribute('aria-label'));
    expect(labels).toHaveLength(sampleData.length);
    expect(new Set(labels).size).toBe(sampleData.length);
    expect(labels).toContain('Delete row 1');
    expect(labels).toContain('Delete row 3');
  });

  it('DataTable row selection checkboxes carry unique row-numbered names', () => {
    renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        enableRowSelection
        onStateChange={vi.fn()}
      />,
    );
    const labels = screen.getAllByLabelText(/^Select row \d+$/).map((el) => el.getAttribute('aria-label'));
    expect(labels).toHaveLength(sampleData.length);
    expect(new Set(labels).size).toBe(sampleData.length);
  });

  it('TableInput delete buttons carry unique row-numbered names', () => {
    renderWithProviders(
      <TableInput<Person>
        data={sampleData}
        columns={columns}
        showDeleteRow
        onDataChange={vi.fn()}
      />,
    );
    const labels = screen.getAllByLabelText(/^Delete row \d+$/).map((el) => el.getAttribute('aria-label'));
    expect(labels).toEqual(['Delete row 1', 'Delete row 2', 'Delete row 3']);
  });
});

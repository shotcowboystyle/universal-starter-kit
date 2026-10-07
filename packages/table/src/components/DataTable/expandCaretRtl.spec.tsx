import { renderWithProviders } from '@repo/test-utils';
// RTL directional icons (rtl-audit backlog #1): the row-expansion caret
// encodes the expansion direction (inline-end), so it must mirror under RTL
// via the useDirection glyph swap (CaretRight ⇄ CaretLeft). The storybook
// with-row-expansion story currently renders no expansion column (mid-wave),
// so this spec is the direct evidence for the DataTableRoot caret path.
import { createColumnHelper } from '@tanstack/react-table';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

interface Person {
  id: number;
  name: string;
  subRows?: Person[];
}

const data: Person[] = [
  { id: 1, name: 'John', subRows: [{ id: 11, name: 'John Detail' }] },
  { id: 2, name: 'Jane' },
];

const columnHelper = createColumnHelper<Person>();
const columns: DataTableColumn<Person>[] = [
  columnHelper.accessor('id', { header: 'ID' }) as DataTableColumn<Person>,
  columnHelper.accessor('name', { header: 'Name' }) as DataTableColumn<Person>,
];

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          'Expand row {{row}}': 'Expand row {{row}}',
          'Collapse row {{row}}': 'Collapse row {{row}}',
        },
      },
    },
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('dir');
});

function renderTable() {
  renderWithProviders(
    // layout="table": jsdom media queries report sm=false, which would flip
    // the auto layout to mobile cards (no expansion column there).
    <DataTable
      data={data}
      columns={columns}
      enableRowExpansion
      layout="table"
      onStateChange={vi.fn()}
    />,
  );
  const expandButton = screen.getAllByLabelText(/^Expand row \d+$/)[0];
  const path = expandButton?.querySelector('svg path')?.getAttribute('d');
  return { expandButton, path };
}

describe('DataTable expand caret RTL mirroring', () => {
  it('renders the collapsed caret and mirrors the glyph under RTL', () => {
    const ltr = renderTable();
    expect(ltr.expandButton).toBeTruthy();
    expect(ltr.path).toBeTruthy();
    cleanup();

    document.documentElement.setAttribute('dir', 'rtl');
    const rtl = renderTable();
    expect(rtl.expandButton).toBeTruthy();
    expect(rtl.path).toBeTruthy();

    // Directional pair swapped: CaretRight (LTR) ⇄ CaretLeft (RTL).
    expect(rtl.path).not.toBe(ltr.path);
  });
});

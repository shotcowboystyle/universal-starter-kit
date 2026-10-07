/**
 * Custom-cell alignment (DG-TBL-01 / LC-44 ROW-LINE).
 *
 * Custom `cell` renderers historically LOST the column's `align` on web:
 * in the semantic-table displayMode (columnLayout="auto") `Table.Cell` is
 * `display: table-cell`, where the cell box's own flex `justifyContent` is
 * a no-op — only the built-in DataTableCell self-aligned, and every custom
 * renderer had to hand-roll its own alignment wrapper (the InsightsRowLink
 * class of bug). The fix: DataTable wraps flexRender output in a
 * full-width flex container driven by the resolved column align
 * (`data-cell-align`), in every displayMode, so custom cells align like
 * built-ins with zero consumer code.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { Text } from 'tamagui';
import { describe, expect, it } from 'vitest';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

interface Pokemon {
  id: number;
  name: string;
  xp: number;
  active: boolean;
}

const sampleData: Pokemon[] = [
  { id: 1, name: 'Bulbasaur', xp: 64, active: true },
  { id: 2, name: 'Charmander', xp: 62, active: false },
];

const customColumns: DataTableColumn<Pokemon>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }) => <Text>{String(getValue())}</Text>,
  },
  {
    id: 'xp',
    accessorKey: 'xp',
    header: 'XP',
    align: 'right',
    cell: ({ getValue }) => <Text>{String(getValue())}</Text>,
  },
  {
    id: 'active',
    accessorKey: 'active',
    header: 'Active',
    align: 'center',
    cell: ({ getValue }) => <Text>{getValue() ? 'yes' : 'no'}</Text>,
  },
  // Built-in field path (no custom cell) — must NOT grow a wrapper.
  // (accessor `id`, not `xp`: the custom XP column also paints its value,
  // and duplicated cell text breaks the single-match queries below.)
  { id: 'plain_id', accessorKey: 'id', header: 'Plain ID', field: 'stepper' },
];

function alignContainerOf(el: HTMLElement): HTMLElement | null {
  return el.closest('[data-cell-align]') as HTMLElement | null;
}

function renderTable(columnLayout: 'auto' | 'equal') {
  return renderWithProviders(
    <DataTable
      data={sampleData}
      columns={customColumns as DataTableColumn<Record<string, any>>[]}
      layout="table"
      columnLayout={columnLayout}
      enablePagination={false}
      readOnly
    />,
  );
}

describe.each(['auto', 'equal'] as const)('DataTable custom-cell alignment (columnLayout=%s)', (columnLayout) => {
  it('wraps custom cells in an alignment container driven by the column align', () => {
    renderTable(columnLayout);

    const nameContainer = alignContainerOf(screen.getByText('Bulbasaur'));
    expect(nameContainer).not.toBeNull();
    expect(nameContainer!.dataset.cellAlign).toBe('left');

    // The wrapper is a full-width flex row whose justifyContent follows
    // the resolved align (this is what display:table-cell's dead
    // justifyContent could not do). happy-dom does not resolve tamagui's
    // class-based styles, so computed flex geometry (display:flex,
    // justify-content, shared ink edges ±1px) is pinned in the live
    // browser probe `p-results/table-rowpress/probe.mjs`; here the
    // structural contract is the container + its declared alignment.
    const xpContainer = alignContainerOf(screen.getByText('64'));
    expect(xpContainer).not.toBeNull();
    expect(xpContainer!.dataset.cellAlign).toBe('right');

    const centerContainer = alignContainerOf(screen.getAllByText('yes')[0]);
    expect(centerContainer).not.toBeNull();
    expect(centerContainer!.dataset.cellAlign).toBe('center');
  });

  it('headers carry the same resolved alignment as their cells', () => {
    const { container } = renderTable(columnLayout);
    const xpHeader = container.querySelector('#xp-header');
    expect(xpHeader?.dataset.align).toBe('right');
    const nameHeader = container.querySelector('#name-header');
    expect(nameHeader?.dataset.align).toBe('left');
  });

  it('built-in field cells stay unwrapped (they self-align internally)', () => {
    const { container } = renderTable(columnLayout);
    // Body cells for the plain field column contain no alignment wrapper.
    const bodyCells = [...container.querySelectorAll('[data-align="right"]')] as HTMLElement[];
    const plainFieldCells = bodyCells.filter((cell) => cell.id === '' && !cell.querySelector('[data-cell-align]'));
    expect(plainFieldCells.length).toBeGreaterThan(0);
  });
});

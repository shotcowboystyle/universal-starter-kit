/**
 * Header-click sorting regression specs.
 *
 * Dispatch context: header-click sorting was reported broken in Storybook
 * web for all DataTable stories (2026-08-12, pagination agent). The report
 * did not reproduce against current source — browser probes show the full
 * asc→desc→clear cycle working on every story (see
 * p-results/fix-datefilter-headersort.md). These specs pin the whole path —
 * primitives press wiring → TanStack toggle handler → useTableSorting state
 * → aria-sort/indicator/row render — so a regression at ANY layer fails
 * loudly, plus the keyboard operability added with that dispatch.
 *
 * layout="table" pins the grid below the $sm test-env breakpoint (the
 * card layout has no header cells).
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableState } from '../../types';

import { DataTable } from './index';
import type { DataTableRootProps } from './index';

interface Person {
  id: number;
  firstName: string;
  age: number;
}

// Crafted so original / ascending / descending orders are all distinct.
const sampleData: Person[] = [
  { id: 1, firstName: 'Charlie', age: 30 },
  { id: 2, firstName: 'Alice', age: 40 },
  { id: 3, firstName: 'Bob', age: 20 },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'age', header: 'Age' },
];

const renderTable = (extraProps: Partial<DataTableRootProps<Person>> = {}) => {
  const states: DataTableState[] = [];
  const result = renderWithProviders(
    <DataTable
      data={sampleData}
      columns={columns}
      layout="table"
      enableSorting
      onStateChange={(state) => states.push(state)}
      {...extraProps}
    />,
  );
  const header = () => result.container.querySelector('#firstName-header')!;
  const rowOrder = () =>
    [...result.container.querySelectorAll('.is_TableBody .is_TableRow')]
      .map((row) => ['Alice', 'Bob', 'Charlie'].find((name) => row.textContent?.includes(name)) ?? null)
      .filter((name): name is string => name !== null);
  return { ...result, states, header, rowOrder };
};

describe('DataTable header sorting (web grid)', () => {
  it('cycles asc → desc → clear on header clicks, with aria-sort, row order, and sorting state in lockstep', async () => {
    const { header, rowOrder, states } = renderTable();

    expect(header()).not.toBeNull();
    expect(header().getAttribute('aria-sort')).toBe('none');
    expect(rowOrder()).toStrictEqual(['Charlie', 'Alice', 'Bob']);

    // 1st click: ascending (string column sorts asc first)
    fireEvent.click(header());
    await waitFor(() => {
      expect(header().getAttribute('aria-sort')).toBe('ascending');
    });
    expect(rowOrder()).toStrictEqual(['Alice', 'Bob', 'Charlie']);
    expect(states.at(-1)?.sorting).toStrictEqual([{ id: 'firstName', desc: false }]);

    // 2nd click: descending
    fireEvent.click(header());
    await waitFor(() => {
      expect(header().getAttribute('aria-sort')).toBe('descending');
    });
    expect(rowOrder()).toStrictEqual(['Charlie', 'Bob', 'Alice']);
    expect(states.at(-1)?.sorting).toStrictEqual([{ id: 'firstName', desc: true }]);

    // 3rd click: clear — original order restored
    fireEvent.click(header());
    await waitFor(() => {
      expect(header().getAttribute('aria-sort')).toBe('none');
    });
    expect(rowOrder()).toStrictEqual(['Charlie', 'Alice', 'Bob']);
    expect(states.at(-1)?.sorting).toStrictEqual([]);
  });

  it('only the sorted column advertises a direction; siblings stay aria-sort=none', async () => {
    const { container, header } = renderTable();

    fireEvent.click(header());
    await waitFor(() => {
      expect(header().getAttribute('aria-sort')).toBe('ascending');
    });
    const ageHeader = container.querySelector('#age-header')!;
    expect(ageHeader.getAttribute('aria-sort')).toBe('none');
  });

  it('renders a distinct sort indicator per direction (unsorted / asc / desc icons differ)', async () => {
    const { header } = renderTable();
    const icon = () => header().querySelector('svg')?.outerHTML ?? '';

    const noneIcon = icon();
    expect(noneIcon).not.toBe('');

    fireEvent.click(header());
    await waitFor(() => {
      expect(header().getAttribute('aria-sort')).toBe('ascending');
    });
    const ascIcon = icon();
    expect(ascIcon).not.toBe(noneIcon);

    fireEvent.click(header());
    await waitFor(() => {
      expect(header().getAttribute('aria-sort')).toBe('descending');
    });
    const descIcon = icon();
    expect(descIcon).not.toBe(ascIcon);
  });

  it('sortable headers are keyboard-operable: tab target + Enter/Space toggle (WCAG 2.1.1)', async () => {
    const { header } = renderTable();

    expect(header().getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(header(), { key: 'Enter' });
    await waitFor(() => {
      expect(header().getAttribute('aria-sort')).toBe('ascending');
    });

    fireEvent.keyDown(header(), { key: ' ' });
    await waitFor(() => {
      expect(header().getAttribute('aria-sort')).toBe('descending');
    });

    fireEvent.keyDown(header(), { key: 'Enter' });
    await waitFor(() => {
      expect(header().getAttribute('aria-sort')).toBe('none');
    });
  });

  it('gives Phosphor resolved CSS colors in every sort state', async () => {
    const { header } = renderTable();
    for (const direction of ['none', 'ascending', 'descending']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each click advances the sort cycle; the states must be observed in sequence
      await waitFor(() => {
        expect(header().getAttribute('aria-sort')).toBe(direction);
      });
      const icon = header().querySelector('svg');
      expect(icon).not.toBeNull();
      const ink = icon?.getAttribute('fill') ?? icon?.getAttribute('color') ?? icon?.style.color;
      expect(ink).toBeTruthy();
      expect(ink).not.toMatch(/\$/u);
      fireEvent.click(header());
    }
  });

  it('plain click replaces another column sort and Shift+click adds to it', async () => {
    const { header, container, states } = renderTable();
    const ageHeader = container.querySelector('#age-header')!;
    fireEvent.click(header());
    fireEvent.click(ageHeader);
    await waitFor(() => {
      expect(states.at(-1)?.sorting.map((sort) => sort.id)).toStrictEqual(['age']);
    });
    fireEvent.click(header(), { shiftKey: true });
    await waitFor(() => {
      expect(states.at(-1)?.sorting.map((sort) => sort.id)).toStrictEqual(['age', 'firstName']);
    });
  });

  it('non-sortable headers get no press affordance, no tab stop, and no aria-sort', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={
          [
            { accessorKey: 'firstName', header: 'First Name', enableSorting: false },
            { accessorKey: 'age', header: 'Age' },
          ] satisfies DataTableColumn<Person>[]
        }
        layout="table"
        enableSorting
        onStateChange={vi.fn<(state: DataTableState) => void>()}
      />,
    );
    const header = container.querySelector('#firstName-header')!;
    expect(header.getAttribute('aria-sort')).toBeNull();
    expect(header.getAttribute('tabindex')).toBeNull();

    fireEvent.click(header);
    expect(header.getAttribute('aria-sort')).toBeNull();
  });
});

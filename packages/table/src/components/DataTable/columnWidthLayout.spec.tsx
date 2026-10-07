/**
 * MPO-236 — per-column width under `columnLayout: "equal"`.
 *
 * `equal` is the default, and it flexes every cell to `flexGrow: 1,
 * flexBasis: 0`. A column's `width` / `size` therefore never reaches the cell
 * box: the render comes out identical to one that declared no widths at all,
 * which reads as "the widths ARE applied and are not enough" and sends the
 * reader looking in the wrong place.
 *
 * The default is not changed here — that would move every existing table's
 * render. The combination warns instead, naming `columnLayout` as the reason.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetTableDevWarnSeen, warnColumnWidthIgnored } from '../../shared/devWarn';
import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

vi.mock(import('@tanstack/react-virtual'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) =>
      actual.useVirtualizer({
        ...options,
        initialRect: { width: 800, height: 240 },
        observeElementRect: (_instance, callback) => {
          callback({ width: 800, height: 240 });
          return () => {};
        },
        observeElementOffset: (_instance, callback) => {
          callback(0, false);
          return () => {};
        },
        scrollToFn: () => {},
      }),
  };
});

interface Pokemon {
  id: number;
  name: string;
  xp: number;
}

const sampleData: Pokemon[] = [
  { id: 1, name: 'Bulbasaur', xp: 64 },
  { id: 2, name: 'Charmander', xp: 62 },
];

const plainColumns: DataTableColumn<Pokemon>[] = [
  { id: 'name', accessorKey: 'name', header: 'Name' },
  { id: 'xp', accessorKey: 'xp', header: 'XP' },
];

const widthColumns: DataTableColumn<Pokemon>[] = [
  { id: 'name', accessorKey: 'name', header: 'Name', width: 320 },
  { id: 'xp', accessorKey: 'xp', header: 'XP', width: 80 },
];

let warnings: string[] = [];
let warnSpy: ReturnType<typeof vi.spyOn>;

function startCapture() {
  warnings = [];
  __resetTableDevWarnSeen();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  });
}

function stopCapture() {
  warnSpy.mockRestore();
  __resetTableDevWarnSeen();
}

/** Only this rule's warnings — other table chrome may warn for its own reasons. */
function widthWarnings(): string[] {
  return warnings.filter((line) => line.includes('column-width-ignored'));
}

/**
 * React 19's client `useId` counter is module-global (`_r_<base32>_`), so two
 * renders in one process never share generated ids. Normalize them out before
 * comparing markup.
 */
function stripGeneratedIds(html: string): string {
  return html.replaceAll(/_r_[0-9a-z]+_/g, '_r_id_');
}

/** `columnLayout` omitted on purpose in most calls: "equal" is the default. */
function renderTable(columns: DataTableColumn<Pokemon>[], columnLayout?: 'equal' | 'auto' | 'scroll') {
  return renderWithProviders(
    <DataTable
      data={sampleData}
      columns={columns as DataTableColumn<Record<string, any>>[]}
      layout="table"
      columnLayout={columnLayout}
      enablePagination={false}
      readOnly
    />,
  );
}

describe(warnColumnWidthIgnored, () => {
  let prevEnv: string | undefined;

  beforeEach(() => {
    prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    startCapture();
  });

  afterEach(() => {
    stopCapture();
    process.env.NODE_ENV = prevEnv;
  });

  it('names columnLayout and the offending columns', () => {
    warnColumnWidthIgnored({ columnLayout: 'equal', columns: widthColumns });
    expect(widthWarnings()).toHaveLength(1);
    expect(widthWarnings()[0]).toContain('[table] column-width-ignored');
    expect(widthWarnings()[0]).toContain('columnLayout=equal');
    expect(widthWarnings()[0]).toContain('columns=name,xp');
  });

  it('catches the TanStack `size` spelling too', () => {
    warnColumnWidthIgnored({ columnLayout: 'equal', columns: [{ id: 'avatar', size: 60 }] });
    expect(widthWarnings()).toHaveLength(1);
    expect(widthWarnings()[0]).toContain('columns=avatar');
  });

  it('falls back to accessorKey, then position, for the column name', () => {
    warnColumnWidthIgnored({
      columnLayout: 'equal',
      columns: [{ accessorKey: 'xp', width: 80 }, { size: 60 }],
    });
    expect(widthWarnings()[0]).toContain('columns=xp,#1');
  });

  it('stays quiet when no column declares a width', () => {
    warnColumnWidthIgnored({ columnLayout: 'equal', columns: plainColumns });
    expect(widthWarnings()).toHaveLength(0);
  });

  it.each(['auto', 'scroll'] as const)('stays quiet under columnLayout=%s', (columnLayout) => {
    warnColumnWidthIgnored({ columnLayout, columns: widthColumns });
    expect(widthWarnings()).toHaveLength(0);
  });

  it('stays quiet with enableColumnResizing, where the width does survive', () => {
    warnColumnWidthIgnored({
      columnLayout: 'equal',
      enableColumnResizing: true,
      columns: widthColumns,
    });
    expect(widthWarnings()).toHaveLength(0);
  });

  it('no-ops in production', () => {
    process.env.NODE_ENV = 'production';
    warnColumnWidthIgnored({ columnLayout: 'equal', columns: widthColumns });
    expect(widthWarnings()).toHaveLength(0);
  });

  it('warns once per offending column set, not once per call', () => {
    warnColumnWidthIgnored({ columnLayout: 'equal', columns: widthColumns });
    warnColumnWidthIgnored({ columnLayout: 'equal', columns: widthColumns });
    warnColumnWidthIgnored({ columnLayout: 'equal', columns: widthColumns });
    expect(widthWarnings()).toHaveLength(1);
  });
});

describe('DataTable columnLayout=equal with per-column widths', () => {
  beforeEach(startCapture);
  afterEach(stopCapture);

  it('discards the widths: the markup matches a table that declared none', () => {
    const withWidths = renderTable(widthColumns);
    const widthMarkup = stripGeneratedIds(withWidths.container.innerHTML);
    withWidths.unmount();

    const withoutWidths = renderTable(plainColumns);
    expect(stripGeneratedIds(withoutWidths.container.innerHTML)).toBe(widthMarkup);
  });

  it('warns, so the discard is not silent', () => {
    renderTable(widthColumns);
    expect(widthWarnings()).toHaveLength(1);
    expect(widthWarnings()[0]).toContain('component=DataTable');
  });

  it('warns once per table, not once per render', () => {
    const { rerender } = renderTable(widthColumns);
    rerender(
      <DataTable
        data={[...sampleData, { id: 3, name: 'Squirtle', xp: 63 }]}
        columns={widthColumns as DataTableColumn<Record<string, any>>[]}
        layout="table"
        enablePagination={false}
        readOnly
      />,
    );
    expect(widthWarnings()).toHaveLength(1);
  });

  it('does not warn under columnLayout=auto', () => {
    renderTable(widthColumns, 'auto');
    expect(widthWarnings()).toHaveLength(0);
  });

  it('does not warn for a table with no per-column widths', () => {
    renderTable(plainColumns);
    expect(widthWarnings()).toHaveLength(0);
  });
});

function hasSizingStyle(element: HTMLElement, property: string, value: string, token: string) {
  return element.style.getPropertyValue(property) === value || String(element.className).includes(token);
}

function expectCellWidth(element: HTMLElement | null, width: number) {
  expect(element).not.toBeNull();
  expect(hasSizingStyle(element!, 'width', `${width}px`, `_w-${width}px`)).toBe(true);
}

describe('DataTable declared column sizes', () => {
  beforeEach(startCapture);
  afterEach(stopCapture);

  it.each(['alias', 'canonical'])(
    'applies %s widths to scroll headers, body and footer below the old floor',
    (spelling) => {
      const sizingColumns = plainColumns.map((column, index) => ({
        ...column,
        [spelling === 'alias' ? 'width' : 'size']: index === 0 ? 320 : 48,
        footer: index === 0 ? 'Totals' : '126',
      }));
      const { container } = renderTable(sizingColumns, 'scroll');
      expectCellWidth(container.querySelector('#name-header'), 320);
      expectCellWidth(container.querySelector('#xp-header'), 48);
      const cells = container.querySelectorAll('[aria-label="Table data"] [role="cell"]');
      expect(cells.length).toBeGreaterThanOrEqual(4);
      expectCellWidth(cells[0] as HTMLElement, 320);
      expectCellWidth(cells[1] as HTMLElement, 48);
      expect(hasSizingStyle(cells[1] as HTMLElement, 'min-width', '0px', '_miw-0px')).toBe(true);
      const footer = container.querySelectorAll('tfoot [role="cell"]');
      expect(footer).toHaveLength(2);
      expectCellWidth(footer[0] as HTMLElement, 320);
      expectCellWidth(footer[1] as HTMLElement, 48);
      expect(widthWarnings()).toHaveLength(0);
    },
  );

  it('gives unpinned equal cells the same flex policy for canonical and alias declarations', () => {
    const canonical = plainColumns.map((column, index) => ({
      ...column,
      size: index === 0 ? 320 : 80,
    }));
    const withSizes = renderTable(canonical);
    const sizeMarkup = stripGeneratedIds(withSizes.container.innerHTML);
    withSizes.unmount();
    const withoutSizes = renderTable(plainColumns);
    expect(stripGeneratedIds(withoutSizes.container.innerHTML)).toBe(sizeMarkup);
  });

  it('lets resizing use aliases in equal mode while preserving the fixed flex basis', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={widthColumns}
        columnLayout="equal"
        layout="table"
        enableColumnResizing
        enablePagination={false}
        readOnly
      />,
    );
    const header = container.querySelector('#name-header') as HTMLElement;
    expectCellWidth(header, 320);
    expect(hasSizingStyle(header, 'flex-basis', 'auto', '_fb-auto')).toBe(true);
    expect(hasSizingStyle(header, 'flex-grow', '0', '_fg-0')).toBe(true);
    expect(widthWarnings()).toHaveLength(0);
  });

  it('does not inflate a 48px resizable equal-layout cell with the primitive width floor', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={[{ accessorKey: 'xp', header: 'XP', width: 48 }]}
        columnLayout="equal"
        layout="table"
        enableColumnResizing
        enablePagination={false}
        readOnly
      />,
    );
    const header = container.querySelector('#xp-header') as HTMLElement;
    expectCellWidth(header, 48);
    expect(hasSizingStyle(header, 'min-width', '0px', '_miw-0px')).toBe(true);
  });

  it('passes size inputs to auto layout without changing its table algorithm', () => {
    const { container } = renderTable(widthColumns, 'auto');
    expectCellWidth(container.querySelector('#name-header'), 320);
    expect((container.querySelector('[role="table"]') as HTMLElement).style.tableLayout).toBe('fixed');
  });

  it('resizes an aliased column through the real header handle within its bounds', () => {
    const columns = widthColumns.map((column) => ({ ...column, minWidth: 50, maxWidth: 350 }));
    const { container, getByRole } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        columnLayout="scroll"
        layout="table"
        enableColumnResizing
        enablePagination={false}
        readOnly
      />,
    );
    const handle = getByRole('separator', { name: 'Resize Name column' });
    expect(handle.getAttribute('aria-valuenow')).toBe('320');
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 120 });
    fireEvent.mouseUp(document, { clientX: 120 });
    expectCellWidth(container.querySelector('#name-header'), 340);
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 300 });
    fireEvent.mouseUp(document, { clientX: 300 });
    expectCellWidth(container.querySelector('#name-header'), 350);
    expect(handle.getAttribute('aria-valuenow')).toBe('350');
    const cell = container.querySelector<HTMLElement>('[aria-label="Table data"] [role="cell"]');
    expectCellWidth(cell, 350);
  });

  it('exposes the normalized size to the view-options display on mount', async () => {
    const { getByText } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={widthColumns}
        columnLayout="scroll"
        layout="table"
        enableColumnResizing
        enablePagination={false}
        readOnly>
        <DataTable.ViewOptions
          showColumnResizing
          showColumnVisibility={false}
        />
      </DataTable>,
    );
    await waitFor(() => {
      expect(getByText('320px')).toBeDefined();
    });
    expect(getByText('80px')).toBeDefined();
  });

  it('uses the real virtual row renderer with the same declared widths', async () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={widthColumns}
        columnLayout="scroll"
        layout="table"
        enableVirtualization
        virtualizationHeight={240}
        enablePagination={false}
        readOnly
      />,
    );
    await waitFor(() => {
      const virtualBody = container.querySelector('tbody[role="presentation"] [role="rowgroup"]');
      expect(virtualBody).not.toBeNull();
      expect(virtualBody!.querySelectorAll('[role="row"]')).toHaveLength(2);
      const cells = virtualBody!.querySelectorAll('[role="cell"]');
      expect(cells.length).toBeGreaterThanOrEqual(4);
      expectCellWidth(cells[0] as HTMLElement, 320);
      expectCellWidth(cells[1] as HTMLElement, 80);
    });
    expectCellWidth(container.querySelector('#name-header'), 320);
  });
});

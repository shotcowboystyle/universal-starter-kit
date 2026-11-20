/**
 * Column-pinning scroll/sticky geometry (LTR breakage fix).
 *
 * Sticky resolves against the NEAREST scroll container, so pinning requires
 * ONE horizontal scrollport wrapping header + body: the content View takes
 * `overflow-x: auto`, the Table floors at max-content with overflow visible,
 * and Table.Body drops its flex-variant `overflowY: auto` (which computes
 * overflow-x: auto and made TBODY its own scroller — headers, outside it,
 * never moved with the columns).
 *
 * jsdom/happy-dom can't scroll, so these specs pin the GEOMETRY contract:
 * which element owns overflow, that the intermediate boxes are not scroll
 * containers, that pinned cells are sticky with correct logical insets, and
 * that pinned columns render at exactly getSize() in the flexed equal layout.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableState } from '../../types';

import { DataTable } from './index';
import type { DataTableRootProps } from './index';

interface Person {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
}

const sampleData: Person[] = [
  { id: 1, firstName: 'John', lastName: 'Doe', age: 28 },
  { id: 2, firstName: 'Jane', lastName: 'Smith', age: 32 },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'lastName', header: 'Last Name' },
  { accessorKey: 'age', header: 'Age' },
];

const renderPinned = (extraProps: Partial<DataTableRootProps<Person>> = {}) =>
  renderWithProviders(
    <DataTable
      data={sampleData}
      columns={columns}
      layout="table"
      enableColumnPinning
      onStateChange={vi.fn<(state: DataTableState) => void>()}
      {...extraProps}
    />,
  );

/**
 * Tamagui compiles style props to atomic classes (`_ox-auto`, `_oy-visible`)
 * on web; consumer `style={{…}}` objects stay inline. Accept either channel.
 */
const hasStyle = (el: HTMLElement, inlineKey: keyof CSSStyleDeclaration, value: string, atomicToken: string): boolean =>
  el.style[inlineKey] === value || el.className.includes(atomicToken);

const pinIdColumn = async (utils: ReturnType<typeof renderPinned>) => {
  fireEvent.click(utils.getByLabelText('Pin ID column left'));
  await waitFor(() => {
    expect(utils.getByLabelText('Pin ID column right')).toBeDefined();
  });
};

describe('column pinning geometry', () => {
  it('content View owns horizontal overflow; Table and Body are not scroll containers', () => {
    const { container } = renderPinned();
    const contentView = container.querySelector<HTMLElement>('[aria-label="Data table content"]')!;
    expect(contentView).not.toBeNull();
    expect(hasStyle(contentView, 'overflowX', 'auto', '_ox-auto')).toBe(true);

    const table = container.querySelector<HTMLElement>('[role="table"]')!;
    // minWidth: max-content rides the consumer style object (inline).
    expect(table.style.minWidth).toBe('max-content');
    // overflow visible replaces the scroll-container-creating hidden base.
    expect(hasStyle(table, 'overflow', 'visible', '_ox-visible')).toBe(true);
    expect(table.className).not.toContain('_ox-hidden');

    const body = container.querySelector<HTMLElement>('[aria-label="Table data"]')!;
    expect(hasStyle(body, 'overflowY', 'visible', '_oy-visible')).toBe(true);
    expect(body.className).not.toContain('_oy-auto');
  });

  it('without pinning, the equal layout keeps its original geometry', () => {
    const { container } = renderWithProviders(
      <DataTable
        data={sampleData}
        columns={columns}
        layout="table"
        onStateChange={vi.fn<(state: DataTableState) => void>()}
      />,
    );
    const contentView = container.querySelector<HTMLElement>('[aria-label="Data table content"]')!;
    expect(hasStyle(contentView, 'overflowX', 'auto', '_ox-auto')).toBe(false);
    const table = container.querySelector<HTMLElement>('[role="table"]')!;
    expect(table.style.minWidth).not.toBe('max-content');
  });

  it('pinned header AND body cells are sticky with logical start inset 0', async () => {
    const utils = renderPinned();
    await pinIdColumn(utils);
    const { container } = utils;

    const headerCell = container.querySelector<HTMLElement>('#id-header')!;
    expect(headerCell.style.position).toBe('sticky');
    expect(headerCell.style.insetInlineStart).toBe('0px');
    expect(headerCell.style.zIndex).toBe('2');

    const row1 = container.querySelector('[role="row"][aria-label="Row 1"]')!;
    const firstCell = row1.querySelector<HTMLElement>('[role="cell"], td')!;
    expect(firstCell.style.position).toBe('sticky');
    expect(firstCell.style.insetInlineStart).toBe('0px');
    expect(firstCell.style.zIndex).toBe('2');
  });

  it('pinned columns render at exactly getSize() (clamped) in the flexed equal layout', async () => {
    const utils = renderPinned();
    await pinIdColumn(utils);
    const headerCell = utils.container.querySelector<HTMLElement>('#id-header')!;
    // TanStack default size 150: width/min/max clamp beats any flex resolution
    // so getStickyStyle offsets (summed getSize()) stay true.
    expect(hasStyle(headerCell, 'width', '150px', '_w-150px')).toBe(true);
    expect(hasStyle(headerCell, 'minWidth', '150px', '_miw-150px')).toBe(true);
    expect(hasStyle(headerCell, 'maxWidth', '150px', '_maw-150px')).toBe(true);
    expect(hasStyle(headerCell, 'flexGrow', '0', '_fg-0')).toBe(true);
    expect(hasStyle(headerCell, 'flexShrink', '0', '_fs-0')).toBe(true);
  });

  it('body cells clip their content in the pinning mode (no bleed-through)', () => {
    const { container } = renderPinned();
    const row1 = container.querySelector('[role="row"][aria-label="Row 1"]')!;
    const cells = [...row1.querySelectorAll('[role="cell"], td')] as HTMLElement[];
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(hasStyle(cell, 'overflow', 'hidden', '_ox-hidden')).toBe(true);
    }
  });

  it("second left-pinned column offsets by the first column's getSize()", async () => {
    const utils = renderPinned({ maxPinnedColumns: 3 });
    await pinIdColumn(utils);
    fireEvent.click(utils.getByLabelText('Pin First Name column left'));
    await waitFor(() => {
      const headerCell = utils.container.querySelector<HTMLElement>('#firstName-header')!;
      expect(headerCell.style.position).toBe('sticky');
      expect(headerCell.style.insetInlineStart).toBe('150px');
    });
  });
});

describe('column pinning geometry by direction', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('dir');
  });

  it.each(['ltr', 'rtl'])('keeps declared small pinned boxes and logical offsets aligned in %s', async (direction) => {
    document.documentElement.setAttribute('dir', direction);
    const utils = renderPinned({
      columns: columns.map((column, index) => ({
        ...column,
        footer: String(column.header),
        width: index === 0 ? 48 : 320,
      })),
    });
    await pinIdColumn(utils);
    fireEvent.click(utils.getByLabelText('Pin First Name column left'));
    await waitFor(() => {
      const first = utils.container.querySelector<HTMLElement>('#id-header')!;
      const second = utils.container.querySelector<HTMLElement>('#firstName-header')!;
      expect(hasStyle(first, 'width', '48px', '_w-48px')).toBe(true);
      expect(hasStyle(first, 'minWidth', '48px', '_miw-48px')).toBe(true);
      expect(hasStyle(first, 'maxWidth', '48px', '_maw-48px')).toBe(true);
      expect(second.style.insetInlineStart).toBe('48px');
      const body = utils.container.querySelector('[role="row"][aria-label="Row 1"]')!;
      const cells = body.querySelectorAll('[role="cell"]');
      expect(hasStyle(cells[0] as HTMLElement, 'width', '48px', '_w-48px')).toBe(true);
      expect((cells[1] as HTMLElement).style.insetInlineStart).toBe('48px');
      const footer = utils.container.querySelectorAll('tfoot [role="cell"]');
      expect(hasStyle(footer[0] as HTMLElement, 'width', '48px', '_w-48px')).toBe(true);
      expect((footer[1] as HTMLElement).style.insetInlineStart).toBe('48px');
    });
  });

  it.each(['ltr', 'rtl'])('aligns right-pinned headers, rows and footers in %s', async (direction) => {
    document.documentElement.setAttribute('dir', direction);
    const utils = renderPinned({
      columns: columns.map((column, index) => ({
        ...column,
        footer: String(column.header),
        width: index === 3 ? 76 : 320,
      })),
    });
    for (const label of ['Last Name', 'Age']) {
      fireEvent.click(utils.getByLabelText(`Pin ${label} column left`));
      fireEvent.click(utils.getByLabelText(`Pin ${label} column right`));
    }
    await waitFor(() => {
      const last = utils.container.querySelector<HTMLElement>('#age-header')!;
      const previous = utils.container.querySelector<HTMLElement>('#lastName-header')!;
      expect(hasStyle(last, 'width', '76px', '_w-76px')).toBe(true);
      expect(last.style.insetInlineEnd).toBe('0px');
      expect(previous.style.insetInlineEnd).toBe('76px');
      const body = utils.container.querySelector('[role="row"][aria-label="Row 1"]')!;
      const cells = body.querySelectorAll('[role="cell"]');
      expect(hasStyle(cells[3] as HTMLElement, 'width', '76px', '_w-76px')).toBe(true);
      expect((cells[2] as HTMLElement).style.insetInlineEnd).toBe('76px');
      const footer = utils.container.querySelectorAll('tfoot [role="cell"]');
      expect(hasStyle(footer[3] as HTMLElement, 'width', '76px', '_w-76px')).toBe(true);
      expect((footer[2] as HTMLElement).style.insetInlineEnd).toBe('76px');
    });
  });
});

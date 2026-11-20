/**
 * MPO-336 / LC-10 FRAME-CONTAINMENT at the header grain.
 *
 * A header label wider than its column painted over the next column: the
 * label run would not shrink below its max-content width, so a start-aligned
 * label pushed its sort and filter glyphs into the neighbor and an
 * end-aligned (number) label spilled left over the previous column. The
 * label is now the part that yields: it shrinks to the column and wraps,
 * breaking a long word if it must, while the glyphs keep their size.
 *
 * happy-dom does no layout, so this pins the flex contract that produces the
 * containment. The painted geometry is measured in Storybook by the LC-10
 * probe (`table-datatable--narrow-headers`, scripts/storybook-rubric).
 */

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

interface Row {
  id: string;
  account: string;
  quantity: number;
}

const rows: Row[] = [
  { id: '1', account: 'acme-website', quantity: 142 },
  { id: '2', account: 'tamagui-docs', quantity: 89 },
];

const columns: DataTableColumn<Row>[] = [
  { id: 'account', accessorKey: 'account', header: 'Customer account (input)', width: 96 },
  {
    id: 'quantity',
    accessorKey: 'quantity',
    header: 'Quantity (stepper)',
    align: 'right',
    width: 96,
  },
];

const style = (el: Element, prop: 'flexShrink' | 'minWidth' | 'overflowWrap'): string => {
  const inline = (el as HTMLElement).style[prop];
  return inline || getComputedStyle(el)[prop];
};

const renderNarrow = () =>
  renderWithProviders(
    <DataTable<Row>
      data={rows}
      columns={columns}
      layout="table"
      columnLayout="scroll"
      enableSorting
      enableFiltering
      enablePagination={false}
      readOnly
    />,
  );

describe('DataTable header labels stay inside their column (MPO-336)', () => {
  it.each(['account', 'quantity'])('the %s label shrinks and wraps', (id) => {
    const { container } = renderNarrow();
    const header = container.querySelector(`#${id}-header`)!;
    expect(header).toBeTruthy();
    const label = header.querySelector('[data-header-label]');
    expect(label, 'header label run is marked').not.toBeNull();
    expect(style(label!, 'flexShrink')).toBe('1');
    expect(style(label!, 'minWidth')).toMatch(/^0(?:px)?$/u);
    expect(style(label!, 'overflowWrap')).toBe('anywhere');
    // Every ancestor between the label and the cell yields too, or the
    // label's min-content width comes back through its parent.
    for (let node = label!.parentElement; node && node !== header; node = node.parentElement) {
      if (getComputedStyle(node).display === 'contents') {
        continue;
      }
      expect(style(node, 'minWidth'), 'ancestor min-width').toMatch(/^0(?:px)?$/u);
    }
  });

  it('the sort and filter glyphs keep their size', () => {
    const { container } = renderNarrow();
    const header = container.querySelector('#account-header')!;
    const label = header.querySelector('[data-header-label]')!;
    const glyphs = [...header.querySelectorAll('svg')];
    expect(glyphs.length).toBeGreaterThanOrEqual(2);
    for (const svg of glyphs) {
      let node: Element = svg;
      while (node.parentElement !== null && !node.parentElement.contains(label)) {
        node = node.parentElement;
      }
      expect(style(node, 'flexShrink'), 'glyph slot').toBe('0');
    }
  });
});

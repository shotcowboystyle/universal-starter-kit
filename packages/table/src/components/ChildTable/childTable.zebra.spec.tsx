/**
 * K4 (ruled 2026-09-26): ChildTable is one of the four tables tableZebra
 * reaches. Web renders it through the Table primitive, native through its own
 * FlashList rows, so both are rendered here and must stripe the same rows.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableData } from '../../types';

vi.mock(import('@repo/router'), async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useUrlState: () => [{}, () => {}] };
});

vi.mock(import('@shopify/flash-list'), () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => ReactNode;
    keyExtractor: (item: unknown, index: number) => string;
  }) => (
    <>
      {data.map((item, index) => (
        <Fragment key={keyExtractor(item, index)}>{renderItem({ item, index })}</Fragment>
      ))}
    </>
  ),
}));

const { ChildTable } = await import('./index');
const { TableInput: NativeTableInput } = await import('../TableInput/index.native');

interface Row extends DataTableData {
  id: string;
  item: string;
}

const rows: Row[] = [
  { id: 'row-a', item: 'Bracket' },
  { id: 'row-b', item: 'Bolts' },
  { id: 'row-c', item: 'Washer' },
  { id: 'row-d', item: 'Nut' },
];

const columns: DataTableColumn<Row>[] = [{ accessorKey: 'item', header: 'Item', field: 'input' }];

const fill = (el: Element) => [...el.classList].filter((name) => /^_bg-[a-z]/.test(name));

function web(tableZebra: 'on' | 'off') {
  const { container } = renderWithProviders(
    <Preset overrides={{ tableZebra }}>
      <ChildTable<Row>
        value={rows}
        onChange={vi.fn()}
        columns={columns}
      />
    </Preset>,
  );
  return [...container.querySelectorAll('[data-child-row]')];
}

function native(tableZebra: 'on' | 'off') {
  const { container } = renderWithProviders(
    <Preset overrides={{ tableZebra }}>
      <NativeTableInput<Row>
        data={rows}
        onChange={vi.fn()}
        columns={columns}
      />
    </Preset>,
  );
  return [...container.querySelectorAll('[data-table-zebra]')];
}

describe('ChildTable tableZebra (K4)', () => {
  it('web: off by default, odd rows take $color2 when on', () => {
    const off = web('off');
    expect(off.map((row) => row.dataset.tableZebra)).toEqual(['off', 'off', 'off', 'off']);
    expect(off.map(fill)).toEqual([[], [], [], []]);

    const on = web('on');
    expect(on.map((row) => row.dataset.tableZebra)).toEqual(['even', 'odd', 'even', 'odd']);
    expect(on.map(fill)).toEqual([[], ['_bg-color2'], [], ['_bg-color2']]);
  });

  it('native: stripes the same rows as web', () => {
    const off = native('off');
    expect(off.map((row) => row.dataset.tableZebra)).toEqual(['off', 'off', 'off', 'off']);
    expect(off.map(fill)).toEqual([[], [], [], []]);

    const on = native('on');
    expect(on.map((row) => row.dataset.tableZebra)).toEqual(['even', 'odd', 'even', 'odd']);
    expect(on.map(fill)).toEqual([[], ['_bg-color2'], [], ['_bg-color2']]);
  });
});

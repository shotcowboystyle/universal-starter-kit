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
  const actual = await importOriginal();
  return { ...actual, useUrlState: <T extends object>(defaultValues: T): [T, () => void] => [defaultValues, () => {}] };
});

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the stub FlashList is a function component; the typed import() form demands the real class component type
vi.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
  }: {
    data: Row[];
    renderItem: (info: { item: Row; index: number }) => ReactNode;
    keyExtractor: (item: Row, index: number) => string;
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

const fill = (el: Element) => [...el.classList].filter((name) => /^_bg-[a-z]/u.test(name));

const web = (tableZebra: 'on' | 'off') => {
  const { container } = renderWithProviders(
    <Preset overrides={{ tableZebra }}>
      <ChildTable<Row>
        value={rows}
        onChange={vi.fn<(rows: Row[]) => void>()}
        columns={columns}
      />
    </Preset>,
  );
  return [...container.querySelectorAll<HTMLElement>('[data-child-row]')];
};

const native = (tableZebra: 'on' | 'off') => {
  const { container } = renderWithProviders(
    <Preset overrides={{ tableZebra }}>
      <NativeTableInput<Row>
        data={rows}
        onChange={vi.fn<(rows: Row[]) => void>()}
        columns={columns}
      />
    </Preset>,
  );
  return [...container.querySelectorAll<HTMLElement>('[data-table-zebra]')];
};

describe('ChildTable tableZebra (K4)', () => {
  it('web: off by default, odd rows take $color2 when on', () => {
    const off = web('off');
    expect(off.map((row) => row.dataset.tableZebra)).toStrictEqual(['off', 'off', 'off', 'off']);
    expect(off.map(fill)).toStrictEqual([[], [], [], []]);

    const on = web('on');
    expect(on.map((row) => row.dataset.tableZebra)).toStrictEqual(['even', 'odd', 'even', 'odd']);
    expect(on.map(fill)).toStrictEqual([[], ['_bg-color2'], [], ['_bg-color2']]);
  });

  it('native: stripes the same rows as web', () => {
    const off = native('off');
    expect(off.map((row) => row.dataset.tableZebra)).toStrictEqual(['off', 'off', 'off', 'off']);
    expect(off.map(fill)).toStrictEqual([[], [], [], []]);

    const on = native('on');
    expect(on.map((row) => row.dataset.tableZebra)).toStrictEqual(['even', 'odd', 'even', 'odd']);
    expect(on.map(fill)).toStrictEqual([[], ['_bg-color2'], [], ['_bg-color2']]);
  });
});

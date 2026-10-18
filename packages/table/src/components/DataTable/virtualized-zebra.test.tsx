/**
 * K4 (ruled 2026-09-26): DataTable honours tableZebra in every body mode. The
 * virtual rows used to stripe unconditionally, so a virtualized table showed
 * zebra with the knob off and the paginated grid beside it did not.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

vi.mock(import('@tanstack/react-virtual'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useVirtualizer: <TScrollElement extends Element, TItemElement extends Element>(
      options: Parameters<typeof actual.useVirtualizer<TScrollElement, TItemElement>>[0],
    ) =>
      actual.useVirtualizer<TScrollElement, TItemElement>({
        ...options,
        initialRect: { width: 800, height: 400 },
        observeElementRect: (_instance, onRect) => {
          onRect({ width: 800, height: 400 });
          return () => {};
        },
        observeElementOffset: (_instance, onOffset) => {
          onOffset(0, false);
          return () => {};
        },
        scrollToFn: () => {},
      }),
  };
});

interface Pokemon {
  id: number;
  name: string;
}

const data: Pokemon[] = [
  { id: 1, name: 'Bulbasaur' },
  { id: 2, name: 'Charmander' },
  { id: 3, name: 'Squirtle' },
  { id: 4, name: 'Pikachu' },
];

const columns: DataTableColumn<Pokemon>[] = [{ id: 'name', accessorKey: 'name', header: 'Name' }];

const virtualRows = async (tableZebra: 'on' | 'off') => {
  const { container } = renderWithProviders(
    <Preset overrides={{ tableZebra }}>
      <DataTable
        data={data}
        columns={columns}
        layout="table"
        enableVirtualization
        virtualizationHeight={400}
        enablePagination={false}
        readOnly
      />
    </Preset>,
  );
  let rows: HTMLElement[] = [];
  await waitFor(() => {
    rows = [...container.querySelectorAll<HTMLElement>('tbody[role="presentation"] [role="rowgroup"] [role="row"]')];
    expect(rows).toHaveLength(4);
  });
  return rows.map((row) => ({
    stripe: row.dataset.tableZebra,
    fill: [...row.classList].filter((name) => /^_bg-[a-z]/u.test(name)),
  }));
};

describe('DataTable virtual rows × tableZebra', () => {
  it('leaves every virtual row on $color1 with the knob off', async () => {
    await expect(virtualRows('off')).resolves.toStrictEqual([
      { stripe: 'off', fill: ['_bg-color1'] },
      { stripe: 'off', fill: ['_bg-color1'] },
      { stripe: 'off', fill: ['_bg-color1'] },
      { stripe: 'off', fill: ['_bg-color1'] },
    ]);
  });

  it('stripes odd virtual rows with $color2 with the knob on', async () => {
    await expect(virtualRows('on')).resolves.toStrictEqual([
      { stripe: 'even', fill: ['_bg-color1'] },
      { stripe: 'odd', fill: ['_bg-color2'] },
      { stripe: 'even', fill: ['_bg-color1'] },
      { stripe: 'odd', fill: ['_bg-color2'] },
    ]);
  });
});

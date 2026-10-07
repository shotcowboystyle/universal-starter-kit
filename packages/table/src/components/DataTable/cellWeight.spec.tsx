/**
 * MPO-446 table arm (web): a DataTable custom cell's value takes the
 * fontWeight and bodyFont knobs.
 *
 * `cell: (info) => info.getValue()` returns a primitive, and flexRender
 * dropped it as a bare text node into the cell's alignment View: a div with
 * no text voice, so the value painted the page's 400 under Weight bold. The
 * value now rides house Text (./CellContent.tsx). ./cellWeight.native.spec.tsx
 * is the native arm.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act, cleanup, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Text as RawText } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import type { DataTableColumn } from '../../types';

import { CellContent } from './CellContent';

import { DataTable } from './index';

interface Row {
  id: number;
  name: string;
  status: string;
  amount: string;
}

const rows: Row[] = [{ id: 4461, name: 'Bulbasaur', status: 'sleeping', amount: '12.50' }];

const columns: DataTableColumn<Row>[] = [
  { id: 'id', accessorKey: 'id', header: 'ID', cell: (info) => info.getValue() },
  { id: 'name', accessorKey: 'name', header: 'Name', cell: (info) => info.getValue() },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: (info) => <RawText fontWeight="300">{String(info.getValue())}</RawText>,
  },
  {
    id: 'amount',
    accessorKey: 'amount',
    header: 'Amount',
    field: 'money',
    fieldProps: { currency: 'USD', locale: 'en-US' },
  },
];

const weights = [
  ['regular', '400'],
  ['bold', '700'],
] as const;

afterEach(cleanup);

function classes(el: Element, prefix: string): string[] {
  return String(el.className || '')
    .split(' ')
    .filter((c) => c.startsWith(prefix))
    .sort();
}

/** The class a prop paints, read off a raw node so no house wiring is involved. */
function explicit(prefix: string, props: Record<string, string>): string[] {
  renderWithProviders(<RawText {...props}>probe</RawText>);
  const got = classes(screen.getByText('probe'), prefix);
  cleanup();
  return got;
}

function renderTable(overrides: Record<string, string>) {
  return renderWithProviders(
    <Preset overrides={overrides as never}>
      <DataTable
        data={rows}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        layout="table"
        enablePagination={false}
        readOnly
      />
    </Preset>,
  );
}

describe('DataTable custom cell values follow the text knobs (web, MPO-446)', () => {
  it.each(weights)('string and number values paint the knob weight at %s', (fontWeight, want) => {
    const expected = explicit('_fow-', { fontWeight: want });
    renderTable({ fontWeight });
    for (const text of ['Bulbasaur', '4461']) {
      const node = screen.getByText(text);
      expect(node.closest('[data-cell-align]')).not.toBe(node);
      expect(classes(node, '_fow-'), text).toEqual(expected);
    }
  });

  it('string values take the bodyFont family', () => {
    const expected = explicit('_ff-', { fontFamily: '$mono' });
    renderTable({ bodyFont: 'mono' });
    expect(classes(screen.getByText('Bulbasaur'), '_ff-')).toEqual(expected);
  });

  it.each(weights)('a money value paints the knob weight at %s', (fontWeight, want) => {
    const expected = explicit('_fow-', { fontWeight: want });
    renderTable({ fontWeight });
    expect(classes(screen.getByText(/12\.50/), '_fow-')).toEqual(expected);
  });

  it('a renderer that returns an element keeps its own weight', () => {
    const expected = explicit('_fow-', { fontWeight: '300' });
    renderTable({ fontWeight: 'bold' });
    expect(classes(screen.getByText('sleeping'), '_fow-')).toEqual(expected);
  });
});

describe("CellContent keeps flexRender's component identity per renderer", () => {
  function Counter({ start }: { start: number }): ReactNode {
    const [n, setN] = useState(start);
    return (
      <RawText
        onPress={() => {
          setN((v) => v + 1);
        }}
        data-testid="counter">
        {n}
      </RawText>
    );
  }

  it("a renderer's hook state survives a re-render with the same renderer", () => {
    const render = (ctx: unknown) => <Counter start={(ctx as { start: number }).start} />;
    const { rerender } = renderWithProviders(
      <CellContent
        cellDef={render}
        ctx={{ start: 1 }}
        fontSize="$3"
      />,
    );
    act(() => {
      screen.getByTestId('counter').click();
    });
    expect(screen.getByTestId('counter').textContent).toBe('2');
    rerender(
      <CellContent
        cellDef={render}
        ctx={{ start: 1 }}
        fontSize="$3"
      />,
    );
    expect(screen.getByTestId('counter').textContent).toBe('2');
  });

  it("a new renderer mounts its own hooks instead of reading the old renderer's slots", () => {
    const first = () => {
      const [label] = useState('first renderer');
      return label;
    };
    const second = () => {
      const [label] = useState('second renderer');
      return label;
    };
    const { rerender } = renderWithProviders(
      <CellContent
        cellDef={first}
        ctx={{}}
        fontSize="$3"
      />,
    );
    expect(screen.getByText('first renderer')).toBeInTheDocument();
    rerender(
      <CellContent
        cellDef={second}
        ctx={{}}
        fontSize="$3"
      />,
    );
    expect(screen.getByText('second renderer')).toBeInTheDocument();
  });
});

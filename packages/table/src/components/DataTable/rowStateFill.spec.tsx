/**
 * A DataTable row's hover and press fills step off the fill it rests on
 * (MPO-408).
 *
 * A selected row rested, hovered and pressed on `$color4`, so neither a
 * hover nor a press changed it. Every row now hovers one ramp step above its
 * rest fill (an unselected row keeps `$color3`) and a pressable row presses
 * `tablePressFill` of its hover fill, so rest, hover and press are three
 * fills in the grid, the virtual rows and the document list, zebra on and
 * off, in both schemes and at every elevation. The native root draws its rows
 * with the same `tableRowStateProps`; it is not the module a spec resolves,
 * so the last block reads its source.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { Theme } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';

import { tableRowStateProps } from './rowStateChrome';

import { DataTable } from './index';

vi.mock(import('@tanstack/react-virtual'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) =>
      actual.useVirtualizer({
        ...options,
        initialRect: { width: 800, height: 400 },
        observeElementRect: (_instance, callback) => {
          callback({ width: 800, height: 400 });
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

interface Person {
  id: number;
  firstName: string;
}

const people: Person[] = [
  { id: 1, firstName: 'Alice' },
  { id: 2, firstName: 'Bob' },
  { id: 3, firstName: 'Carol' },
  { id: 4, firstName: 'Dave' },
];

const columns: DataTableColumn<Person>[] = [{ id: 'firstName', accessorKey: 'firstName', header: 'First Name' }];

type Scheme = 'light' | 'dark';
type Elevation = 'none' | 'small' | 'medium' | 'large';
type Body = 'grid' | 'virtual' | 'list';
const schemes: Scheme[] = ['light', 'dark'];
const elevations: Elevation[] = ['none', 'small', 'medium', 'large'];
const zebras = ['off', 'on'] as const;
const bodies: Body[] = ['grid', 'virtual', 'list'];

/** `rest>hover>press` for one row, read off its atomic classes. */
function paint(row: Element): string {
  const classes = [...row.classList];
  const fill = (prefix: string) => classes.find((name) => name.startsWith(prefix))?.slice(prefix.length);
  const rest = classes.find((name) => /^_bg-(?!0)/.test(name))?.slice('_bg-'.length);
  return `${rest}>${fill('_bg-0hover-')}>${fill('_bg-0active-')}`;
}

function bodyProps(body: Body): Record<string, unknown> {
  if (body === 'list') {
    return { layout: 'list' };
  }
  if (body === 'virtual') {
    return { layout: 'table', enableVirtualization: true, virtualizationHeight: 400 };
  }
  return { layout: 'table' };
}

async function paintedRows(body: Body, scheme: Scheme, elevation: Elevation, zebra: 'on' | 'off'): Promise<string[]> {
  const ui: React.ReactElement = (
    <Preset overrides={{ tableZebra: zebra, elevation }}>
      <DataTable
        data={people}
        columns={columns as DataTableColumn<Record<string, any>>[]}
        enableRowSelection
        enablePagination={false}
        enableGlobalSearch={false}
        enableFiltering={false}
        onRowPress={vi.fn()}
        onStateChange={vi.fn()}
        {...bodyProps(body)}
      />
    </Preset>
  );
  const { container, unmount } = renderWithProviders(scheme === 'dark' ? <Theme name="dark">{ui}</Theme> : ui);
  const rows = () => [...container.querySelectorAll('[data-row-selected]')];
  await waitFor(() => {
    expect(rows()).toHaveLength(people.length);
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Alice' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Bob' }));
  await waitFor(() => {
    expect(rows().map((row) => row.dataset.rowSelected)).toEqual(['true', 'true', 'false', 'false']);
  });
  const painted = rows().map(paint);
  unmount();
  return painted;
}

const expected = {
  'zebra-off': ['color4>color5>color6', 'color4>color5>color6', 'color1>color3>color4', 'color1>color3>color4'],
  'zebra-on': ['color4>color5>color6', 'color4>color5>color6', 'color1>color3>color4', 'color2>color3>color4'],
};

describe('DataTable row fills step off the fill the row rests on (MPO-408)', () => {
  describe(tableRowStateProps, () => {
    const cases = [false, true].flatMap((selected) =>
      [false, true].flatMap((zebraOn) => [0, 1].map((index) => ({ selected, zebraOn, index }))),
    );

    it('rest, hover and press are three fills for every selected, zebra and stripe state', () => {
      const collisions = cases.flatMap((opts) => {
        const props = tableRowStateProps({ ...opts, pressable: true }) as {
          backgroundColor: string;
          hoverStyle: { backgroundColor: string };
          pressStyle?: { backgroundColor: string };
        };
        const fills = [props.backgroundColor, props.hoverStyle.backgroundColor, props.pressStyle?.backgroundColor];
        return new Set(fills).size === 3 && !fills.includes(undefined as unknown as string)
          ? []
          : [`${JSON.stringify(opts)}: ${fills.join('>')}`];
      });
      expect(collisions).toEqual([]);
    });

    it('a row that is not pressable carries no press fill', () => {
      for (const opts of cases) {
        expect(tableRowStateProps(opts)).not.toHaveProperty('pressStyle');
      }
    });
  });

  for (const body of bodies) {
    describe(`${body} rows`, () => {
      for (const scheme of schemes) {
        for (const elevation of elevations) {
          for (const zebra of zebras) {
            it(`${scheme} ${elevation} zebra-${zebra}: a selected row hovers and presses off $color4`, async () => {
              await expect(paintedRows(body, scheme, elevation, zebra)).resolves.toEqual(expected[`zebra-${zebra}`]);
            });
          }
        }
      }
    });
  }

  describe('the roots hand a row no press fill of their own', () => {
    const read = (file: string) => readFileSync(resolve(__dirname, file), 'utf-8');

    /** The body of the `getRowPressProps` callback in one root. */
    function rowPressProps(source: string): string {
      const start = source.indexOf('const getRowPressProps = useCallback(');
      const end = source.indexOf('\n  );\n', start);
      return start === -1 || end === -1 ? '' : source.slice(start, end);
    }

    it.each(['DataTableRoot.tsx', 'index.native.tsx'])('%s: getRowPressProps carries no pressStyle', (file) => {
      const body = rowPressProps(read(file));
      expect(body).not.toBe('');
      expect(body).not.toMatch(/pressStyle/);
    });

    it.each(['DataTableRoot.tsx', 'index.native.tsx', 'DataTableVirtualized.tsx', 'DataTableDocumentList.tsx'])(
      '%s: every tableRowStateProps call says whether the row is pressable',
      (file) => {
        const calls = read(file).match(/tableRowStateProps\(\{[^}]*\}\)/g) ?? [];
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
          expect(call).toMatch(/\bpressable\b/);
        }
      },
    );
  });
});

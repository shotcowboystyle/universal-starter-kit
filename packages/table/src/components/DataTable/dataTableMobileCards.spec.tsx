/**
 * DataTableMobileCards specs — the card body's OWN contract.
 *
 * cardLayout.spec.tsx proves the layout switch, the title slot, label/value
 * rows, column visibility, sorting, search and filtering through the compound
 * table. What no spec pinned is the card's header chrome and its empty state:
 * the select-all bar above the stack, the per-card checkbox / row number /
 * delete cluster beside the title, the delete floor at `minRows`, and the two
 * distinct empty-state copies (no data vs no results) — plus the rule that an
 * in-flight refetch paints NO empty state over a momentarily blank body.
 *
 * It also pins `classifyCardField`, which decides whether a field prints its
 * column name at all. In the grid a header is written once for a whole
 * column; on a card it would be written once per value.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { Theme } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, TableFilter } from '../../types';

import { DataTableMobileCards } from './DataTableMobileCards';

import { DataTable } from './index';

interface Person {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
}

const people: Person[] = [
  { id: 1, firstName: 'John', lastName: 'Doe', age: 28 },
  { id: 2, firstName: 'Jane', lastName: 'Smith', age: 32 },
  { id: 3, firstName: 'Bob', lastName: 'Johnson', age: 45 },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'lastName', header: 'Last Name' },
  { accessorKey: 'age', header: 'Age' },
];

function renderCards(props: Record<string, any> = {}) {
  return renderWithProviders(
    <DataTable
      data={people}
      columns={columns}
      layout="cards"
      onStateChange={vi.fn()}
      {...props}
    />,
  );
}

function cards(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('[data-testid="data-table-card"]')];
}

describe(DataTableMobileCards, () => {
  it('renders one card per row inside the card list container', () => {
    const { container } = renderCards();
    expect(container.querySelector('[data-testid="data-table-cards"]')).not.toBeNull();
    expect(cards(container)).toHaveLength(people.length);
  });

  it('the first visible column is the card title, the rest are classified fields', () => {
    const { container } = renderCards();
    const first = cards(container)[0];
    expect(first.querySelector('[data-card-slot="title"]')?.textContent).toBe('John');
    expect(first.textContent).toContain('Last Name');
    expect(first.textContent).toContain('Doe');
  });

  it('a single visible column gives a title and no field rows', () => {
    const { container } = renderCards({
      columns: [{ accessorKey: 'firstName', header: 'First Name' }],
    });
    const first = cards(container)[0];
    expect(first.querySelector('[data-card-slot="title"]')?.textContent).toBe('John');
    expect(first.textContent).not.toContain('Last Name');
  });

  it('a self-naming string goes bare, into one wrapped flow with its name hidden', () => {
    const { container } = renderCards();
    const first = cards(container)[0];
    const meta = first.querySelector('[data-card-slot="meta"]');
    expect(meta).not.toBeNull();
    expect(meta!.textContent).toContain('Doe');
    expect(within(first).queryByText('Last Name')).toBeNull();
    expect(first.textContent).toContain('Last Name:');
  });

  it('a figure keeps its column name, inline beside the value', () => {
    const { container } = renderCards();
    const first = cards(container)[0];
    const figure = first.querySelector('[data-card-slot="figure"]');
    expect(figure).not.toBeNull();
    expect(figure!.textContent).toContain('28');
    expect(within(first).getByText('Age')).toBeDefined();
  });

  it('a field with no value spends no row at all', () => {
    const { container } = renderCards({
      data: [{ id: 1, firstName: 'John', lastName: '', age: 28 }],
    });
    const first = cards(container)[0];
    expect(first.querySelector('[data-card-slot="meta"]')).toBeNull();
    expect(first.textContent).not.toContain('Last Name');
  });

  it('a control keeps a row of its own and prints no label', () => {
    const { container } = renderCards({
      columns: [
        { accessorKey: 'firstName', header: 'First Name' },
        { id: '_actions', accessorKey: 'lastName', header: 'Actions', meta: { role: 'actions' } },
      ],
    });
    const first = cards(container)[0];
    expect(first.querySelector('[data-card-slot="control"]')).not.toBeNull();
    expect(within(first).queryByText('Actions')).toBeNull();
    expect(first.textContent).toContain('Actions:');
  });

  it('selection adds a select-all bar above the stack and a checkbox per card', () => {
    const { container } = renderCards({ enableRowSelection: true });
    expect(screen.getByLabelText('Select all rows')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Select row /)).toHaveLength(people.length);
    expect(cards(container)).toHaveLength(people.length);
  });

  it('without selection there is no select-all bar', () => {
    renderCards();
    expect(screen.queryByLabelText('Select all rows')).toBeNull();
  });

  it("select-all checks every card's checkbox", async () => {
    renderCards({ enableRowSelection: true });
    fireEvent.click(screen.getByLabelText('Select all rows'));
    await waitFor(() => {
      const boxes = screen.getAllByLabelText(/^Select row /);
      for (const box of boxes) {
        expect(box.getAttribute('aria-checked')).toBe('true');
      }
    });
  });

  it('row numbers print in the card header, one-based', () => {
    const { container } = renderCards({ showRowNumbers: true });
    expect(cards(container)[0].textContent).toContain('#1');
    expect(cards(container)[2].textContent).toContain('#3');
  });

  it('delete is offered per card and reports the row removal to the owner', () => {
    const onDataChange = vi.fn();
    renderCards({ showDeleteRow: true, minRows: 1, onDataChange });
    const deletes = screen.getAllByLabelText(/Delete row/i);
    expect(deletes).toHaveLength(people.length);
    fireEvent.click(deletes[0]);
    // The parent owns `data`; the card list asks, it does not splice.
    expect(onDataChange).toHaveBeenCalledOnce();
    expect(onDataChange.mock.calls[0][0]).toEqual(people.slice(1));
  });

  it('delete goes inert at the minRows floor rather than emptying the list', () => {
    const onDataChange = vi.fn();
    renderCards({ showDeleteRow: true, minRows: people.length, onDataChange });
    const deletes = screen.getAllByLabelText(/Delete row/i);
    expect(deletes).toHaveLength(people.length);
    fireEvent.click(deletes[0]);
    expect(onDataChange).not.toHaveBeenCalled();
  });

  it("empty with no filters reads 'No data available'", () => {
    renderWithProviders(
      <DataTable
        data={[]}
        columns={columns}
        layout="cards"
        onStateChange={vi.fn()}
      />,
    );
    expect(screen.getByText('No data available')).toBeTruthy();
  });

  it("empty because a filter matched nothing reads 'No results found'", async () => {
    const noMatch: TableFilter[] = [
      {
        id: 'flt-first',
        columnId: 'firstName',
        value: { operator: 'contains', value: 'zzzz' },
        label: 'First Name',
      },
    ];
    const { container } = renderWithProviders(
      <DataTable
        data={people}
        columns={columns}
        layout="cards"
        enableFiltering
        filterableFields={[{ id: 'firstName', label: 'First Name', type: 'text' }]}
        initialState={{ filters: noMatch }}
        onStateChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(cards(container)).toHaveLength(0);
      expect(screen.getByText('No results found')).toBeTruthy();
    });
  });

  describe('tableZebra stripes a card one step above its own surface (MPO-401)', () => {
    function cardFills(scheme: 'light' | 'dark') {
      const ui = (
        <Preset overrides={{ tableZebra: 'on' }}>
          <DataTable
            data={people}
            columns={columns}
            layout="cards"
            onStateChange={vi.fn()}
          />
        </Preset>
      );
      const { container } = renderWithProviders(scheme === 'dark' ? <Theme name="dark">{ui}</Theme> : ui);
      return cards(container).map((card) => [...card.classList].filter((name) => name.startsWith('_bg-')));
    }

    it("in dark an odd card's background differs from an even card's", () => {
      const [even, odd] = cardFills('dark');
      expect(even).toEqual(['_bg-color2']);
      expect(odd).toEqual(['_bg-color3']);
    });

    it('leaves light on $background and $color2', () => {
      expect(cardFills('light').slice(0, 2)).toEqual([['_bg-background'], ['_bg-color2']]);
    });
  });

  describe('a pressed card steps off the fill it rests on (MPO-404)', () => {
    type Scheme = 'light' | 'dark';
    type Elevation = 'none' | 'small' | 'medium' | 'large';
    const schemes: Scheme[] = ['light', 'dark'];
    const elevations: Elevation[] = ['none', 'small', 'medium', 'large'];
    const zebras = ['off', 'on'] as const;

    /** `rest>press` for one card, read off its atomic classes. */
    function paint(card: Element): string {
      const classes = [...card.classList];
      const rest = classes.find((name) => /^_bg-(?!0)/.test(name))?.slice('_bg-'.length);
      const press = classes.find((name) => name.startsWith('_bg-0active-'))?.slice('_bg-0active-'.length);
      return `${rest}>${press}`;
    }

    function wrap(scheme: Scheme, ui: React.ReactElement) {
      return renderWithProviders(scheme === 'dark' ? <Theme name="dark">{ui}</Theme> : ui);
    }

    function pressedCards(scheme: Scheme, elevation: Elevation, zebra: 'on' | 'off') {
      const { container, unmount } = wrap(
        scheme,
        <Preset overrides={{ tableZebra: zebra, elevation }}>
          <DataTable
            data={people}
            columns={columns}
            layout="cards"
            onRowPress={vi.fn()}
            onStateChange={vi.fn()}
          />
        </Preset>,
      );
      const painted = cards(container).slice(0, 2).map(paint);
      unmount();
      return painted;
    }

    let rendered: Record<string, string[]> | undefined;
    const matrix = () =>
      (rendered ??= Object.fromEntries(
        schemes.flatMap((scheme) =>
          elevations.flatMap((elevation) =>
            zebras.map((zebra) => [`${scheme} ${elevation} zebra-${zebra}`, pressedCards(scheme, elevation, zebra)]),
          ),
        ),
      ));

    it('an even and an odd card change fill on press at every elevation, zebra on and off, both schemes', () => {
      const unchanged = Object.entries(matrix()).flatMap(([cell, pair]) =>
        pair
          .filter((rp) => {
            const [rest, press] = rp.split('>');
            return !press || press === 'undefined' || press === rest;
          })
          .map((rp) => `${cell}: ${rp}`),
      );
      expect(unchanged).toEqual([]);
    });

    it('presses one ramp step above the rest fill, floored at $color4', () => {
      expect(matrix()).toEqual({
        'light none zebra-off': ['background>color4', 'background>color4'],
        'light none zebra-on': ['background>color4', 'color2>color4'],
        'light small zebra-off': ['background>color4', 'background>color4'],
        'light small zebra-on': ['background>color4', 'color2>color4'],
        'light medium zebra-off': ['background>color4', 'background>color4'],
        'light medium zebra-on': ['background>color4', 'color2>color4'],
        'light large zebra-off': ['background>color4', 'background>color4'],
        'light large zebra-on': ['background>color4', 'color2>color4'],
        'dark none zebra-off': ['background>color4', 'background>color4'],
        'dark none zebra-on': ['background>color4', 'color2>color4'],
        'dark small zebra-off': ['color2>color4', 'color2>color4'],
        'dark small zebra-on': ['color2>color4', 'color3>color4'],
        'dark medium zebra-off': ['color3>color4', 'color3>color4'],
        'dark medium zebra-on': ['color3>color4', 'color4>color5'],
        'dark large zebra-off': ['color4>color5', 'color4>color5'],
        'dark large zebra-on': ['color4>color5', 'color5>color6'],
      });
    });

    it("owns its press fill whatever press props a root hands it (the native root's shape)", () => {
      const nativeRootPressProps = () => ({
        onPress: vi.fn(),
        role: 'button',
        'aria-label': 'Row',
        pressStyle: { backgroundColor: '$color4' },
      });
      const rows = people.map((person, index) => ({
        id: String(index),
        original: person,
        getIsSelected: () => false,
        getVisibleCells: () => [
          {
            id: `${index}_firstName`,
            column: { id: 'firstName', columnDef: { header: 'First Name' } },
            getValue: () => person.firstName,
          },
        ],
      }));
      const { container } = wrap(
        'dark',
        <Preset overrides={{ tableZebra: 'on', elevation: 'large' }}>
          <DataTableMobileCards
            tableRows={rows}
            showRowNumbers={false}
            showDeleteRow={false}
            readOnly
            dataLength={rows.length}
            minRows={0}
            hasActiveFilters={false}
            renderCellContent={(cell) => cell.getValue()}
            onDeleteRow={vi.fn()}
            getRowPressProps={nativeRootPressProps}
          />
        </Preset>,
      );
      expect(cards(container).slice(0, 2).map(paint)).toEqual(['color4>color5', 'color5>color6']);
    });
  });
});

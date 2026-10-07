/**
 * SimpleTable tests.
 *
 * Note: In the happy-dom test env, Tamagui's useMedia returns { sm: false }
 * (mobile breakpoint), so the component renders in card mode by default.
 * Grid tests import SimpleTableDesktop; card tests use SimpleTable.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { fireEvent, waitFor } from '@testing-library/react';
import { Theme } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { SimpleTable, SimpleTableDesktop } from './index';
import type { SimpleTableColumn } from './index';

describe(SimpleTable, () => {
  it('renders basic data with column config producing correct cells', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'age', header: 'Age' },
      { accessorKey: 'city', header: 'City' },
    ];

    const data = [
      { name: 'Alice', age: 30, city: 'Portland' },
      { name: 'Bob', age: 25, city: 'Seattle' },
    ];

    const { container } = renderWithProviders(
      <SimpleTableDesktop
        data={data}
        columns={columns}
      />,
    );

    // Verify headers render
    expect(container.textContent).toContain('Name');
    expect(container.textContent).toContain('Age');
    expect(container.textContent).toContain('City');

    // Verify data cells render
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('30');
    expect(container.textContent).toContain('Portland');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).toContain('25');
    expect(container.textContent).toContain('Seattle');

    // Verify table structure (Tamagui renders with class names)
    expect(container.querySelector('.is_Table')).not.toBeNull();
    expect(container.querySelector('.is_TableHead')).not.toBeNull();
    expect(container.querySelector('.is_TableBody')).not.toBeNull();
    expect(container.querySelector('.is_TableRow')).not.toBeNull();
    expect(container.querySelector('.is_TableHeaderCell')).not.toBeNull();
    expect(container.querySelector('.is_TableCell')).not.toBeNull();
  });

  it('applies column alignment prop correctly', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'left', header: 'Left', align: 'left' },
      { accessorKey: 'center', header: 'Center', align: 'center' },
      { accessorKey: 'right', header: 'Right', align: 'right' },
    ];

    const data = [{ left: 'L', center: 'C', right: 'R' }];

    const { container } = renderWithProviders(
      <SimpleTableDesktop
        data={data}
        columns={columns}
      />,
    );

    // Verify all data renders
    expect(container.textContent).toContain('L');
    expect(container.textContent).toContain('C');
    expect(container.textContent).toContain('R');

    // Verify data-align attributes are applied on cells for alignment
    const leftCells = container.querySelectorAll('[data-align="left"]');
    const centerCells = container.querySelectorAll('[data-align="center"]');
    const rightCells = container.querySelectorAll('[data-align="right"]');

    // Each alignment should have a header cell and a data cell = 2 elements
    expect(leftCells.length).toBeGreaterThanOrEqual(2);
    expect(centerCells.length).toBeGreaterThanOrEqual(2);
    expect(rightCells.length).toBeGreaterThanOrEqual(2);

    // Alignment must actually reach the rendered text: cells are real
    // <td>/<th> (display:table-cell — flex justifyContent is inert there),
    // so the cell text is a block with textAlign. Tamagui emits textAlign
    // as an atomic class; resolve it via computed style on the text node.
    const rightCellText = rightCells.at(-1)?.querySelector('span');
    expect(rightCellText).not.toBeNull();
    expect(getComputedStyle(rightCellText as Element).textAlign).toBe('right');
    const centerCellText = centerCells.at(-1)?.querySelector('span');
    expect(getComputedStyle(centerCellText as Element).textAlign).toBe('center');
  });

  it('renders error-themed rows when data objects have _intent property', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'status', header: 'Status' },
    ];

    const data = [
      { name: 'OK Item', status: 'Active' },
      { name: 'Bad Item', status: 'Failed', _intent: 'error' as const },
      { name: 'Warn Item', status: 'Degraded', _intent: 'warning' as const },
      { name: 'Good Item', status: 'Complete', _intent: 'success' as const },
    ];

    const { container: withIntents } = renderWithProviders(
      <SimpleTableDesktop
        data={data}
        columns={columns}
      />,
    );

    const { container: withoutIntents } = renderWithProviders(
      <SimpleTableDesktop
        data={[{ name: 'Normal', status: 'OK' }]}
        columns={columns}
      />,
    );

    // Verify all data renders
    expect(withIntents.textContent).toContain('Bad Item');
    expect(withIntents.textContent).toContain('Warn Item');
    expect(withIntents.textContent).toContain('Good Item');
    expect(withIntents.textContent).toContain('OK Item');

    // Intent rows carry the theme class on the real <tr> itself (a Theme
    // span wrapper between <tbody> and <tr> would be invalid HTML now that
    // the primitives emit real table elements — SSR parsers would foster-
    // parent it out of the table).
    expect(withIntents.querySelector('tr.t_error')).not.toBeNull();
    expect(withIntents.querySelector('tr.t_warning')).not.toBeNull();
    expect(withIntents.querySelector('tr.t_success')).not.toBeNull();
    for (const row of withIntents.querySelectorAll('tr')) {
      expect(row.parentElement?.tagName).toMatch(/THEAD|TBODY/);
    }

    const normalRows = withoutIntents.querySelectorAll('tbody tr');
    for (const row of normalRows) {
      expect(row.classList.contains('t_error')).toBe(false);
    }
  });

  it('renders card-based layout on mobile breakpoint', () => {
    // In test env, useMedia returns { sm: false } (mobile), so SimpleTable
    // renders card layout by default.
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'value', header: 'Value' },
    ];

    const data = [
      { name: 'Item 1', value: '100' },
      { name: 'Item 2', value: '200' },
    ];

    const { container } = renderWithProviders(
      <SimpleTable
        data={data}
        columns={columns}
      />,
    );

    // Verify data renders in mobile card mode
    expect(container.textContent).toContain('Item 1');
    expect(container.textContent).toContain('100');
    expect(container.textContent).toContain('Item 2');
    expect(container.textContent).toContain('200');

    // First column is the card title (no repeated "Name" label); remaining
    // columns render as label/value rows.
    expect(container.textContent).toContain('Value');

    // Card mode should not render table structure
    const hasTableStructure = container.querySelector('.is_Table');
    expect(hasTableStructure).toBeNull();

    // Cards container should be rendered
    const hasCardLayout = container.querySelector('[data-testid="simple-table-cards"]');
    expect(hasCardLayout).not.toBeNull();
  });

  it('spans the empty state across every column', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'age', header: 'Age' },
      { accessorKey: 'city', header: 'City' },
    ];
    const { container } = renderWithProviders(
      <SimpleTableDesktop
        data={[]}
        columns={columns}
        aria-label="Empty"
      />,
    );
    const emptyCell = container.querySelector("tbody td, tbody [role='cell']");
    expect(emptyCell).not.toBeNull();
    expect(emptyCell?.getAttribute('colspan') ?? emptyCell?.getAttribute('colspan')).toBe('3');
    expect(container.textContent).toContain('No data available');
  });

  it('stripes rows when tableZebra is on and defaults off', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'age', header: 'Age' },
    ];
    const data = [
      { name: 'A', age: 1 },
      { name: 'B', age: 2 },
    ];

    const { container: off } = renderWithProviders(
      <Preset overrides={{ tableZebra: 'off' }}>
        <SimpleTableDesktop
          data={data}
          columns={columns}
        />
      </Preset>,
    );
    for (const row of off.querySelectorAll('[data-table-zebra]')) {
      expect(row.dataset.tableZebra).toBe('off');
    }

    const { container: on } = renderWithProviders(
      <Preset overrides={{ tableZebra: 'on' }}>
        <SimpleTableDesktop
          data={data}
          columns={columns}
        />
      </Preset>,
    );
    expect(on.querySelectorAll("[data-table-zebra='even']").length).toBeGreaterThan(0);
    expect(on.querySelectorAll("[data-table-zebra='odd']").length).toBeGreaterThan(0);
  });

  it('stripes an odd card one step above its own surface, so it shows in dark (MPO-401)', () => {
    const columns: SimpleTableColumn[] = [{ accessorKey: 'name', header: 'Name' }];
    const data = [{ name: 'A' }, { name: 'B' }];
    const cardFills = (scheme: 'light' | 'dark') => {
      const ui = (
        <Preset overrides={{ tableZebra: 'on' }}>
          <SimpleTable
            data={data}
            columns={columns}
          />
        </Preset>
      );
      const { container } = renderWithProviders(scheme === 'dark' ? <Theme name="dark">{ui}</Theme> : ui);
      return [...container.querySelectorAll('[data-testid="simple-table-card"]')].map((card) =>
        [...card.classList].filter((name) => /^_bg-(background|color\d+)$/.test(name)),
      );
    };
    expect(cardFills('dark')).toEqual([['_bg-color2'], ['_bg-color3']]);
    expect(cardFills('light')).toEqual([['_bg-background'], ['_bg-color2']]);
  });

  it('renders a custom cell renderer and a visible caption', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      {
        accessorKey: 'age',
        header: 'Age',
        cell: (value) => `age:${value}`,
      },
    ];
    const { container } = renderWithProviders(
      <SimpleTableDesktop
        caption="Crew"
        data={[{ name: 'Ada', age: 36 }]}
        columns={columns}
      />,
    );
    expect(container.textContent).toContain('Crew');
    expect(container.textContent).toContain('age:36');
    expect(container.querySelector('caption')).not.toBeNull();
  });

  it('activates onRowPress with one roving tab stop (LC-49) and keyboard (LC-50)', async () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'city', header: 'City' },
    ];
    const data = [
      { name: 'Alice', city: 'Portland' },
      { name: 'Bob', city: 'Seattle' },
      { name: 'Carol', city: 'Austin' },
    ];
    const onRowPress = vi.fn();
    const { container } = renderWithProviders(
      <SimpleTableDesktop
        data={data}
        columns={columns}
        onRowPress={onRowPress}
        rowLabel={(row) => row.name}
      />,
    );

    const rows = [...container.querySelectorAll('[data-row-press="true"]')] as HTMLElement[];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    fireEvent.click(rows[1]);
    expect(onRowPress).toHaveBeenCalledOnce();
    expect(onRowPress).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bob' }), 1);

    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(onRowPress).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(rows[0], { key: ' ' });
    expect(onRowPress).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(rows[0], { key: 'Enter', repeat: true });
    expect(onRowPress).toHaveBeenCalledTimes(3);

    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    await waitFor(() => {
      expect(rows.map((row) => row.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    });
    fireEvent.keyDown(rows[1], { key: 'End' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2], { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
  });

  it('cards with onRowPress expose one roving tab stop and role=button', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'value', header: 'Value' },
    ];
    const onRowPress = vi.fn();
    const { container } = renderWithProviders(
      <SimpleTable
        data={[
          { name: 'Item 1', value: '100' },
          { name: 'Item 2', value: '200' },
        ]}
        columns={columns}
        onRowPress={onRowPress}
      />,
    );
    const cards = [...container.querySelectorAll('[data-row-press="true"]')] as HTMLElement[];
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('role')).toBe('button');
    expect(cards.map((card) => card.getAttribute('tabindex'))).toEqual(['0', '-1']);
    fireEvent.click(cards[1]);
    expect(onRowPress).toHaveBeenCalledWith(expect.objectContaining({ name: 'Item 2' }), 1);
  });

  it('owns grid rules from the borderWidth knob (LC-18) and keeps cells square', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'age', header: 'Age' },
    ];
    const data = [
      { name: 'A', age: 1 },
      { name: 'B', age: 2 },
    ];

    const { container: none } = renderWithProviders(
      <Preset overrides={{ borderWidth: 'none', borderRadius: 'none' }}>
        <SimpleTableDesktop
          data={data}
          columns={columns}
        />
      </Preset>,
    );
    expect(none.querySelector('[data-simple-table-frame]')?.dataset.borderWidth).toBe('0');
    const noneCells = none.querySelectorAll("td, [role='cell']");
    expect(noneCells.length).toBeGreaterThan(0);
    for (const cell of noneCells) {
      const border = getComputedStyle(cell).borderBottomWidth;
      expect(border === '0px' || border === '').toBe(true);
      const radius = getComputedStyle(cell).borderRadius;
      expect(radius === '0px' || radius === '').toBe(true);
    }

    const { container: large } = renderWithProviders(
      <Preset overrides={{ borderWidth: 'large' }}>
        <SimpleTableDesktop
          data={data}
          columns={columns}
        />
      </Preset>,
    );
    expect(large.querySelector('[data-simple-table-frame]')?.dataset.borderWidth).toBe('2');
    const bodyCells = large.querySelectorAll("tbody td, tbody [role='cell']");
    const firstRowCell = bodyCells[0];
    expect(firstRowCell).toBeTruthy();
    expect(Number.parseFloat(getComputedStyle(firstRowCell as Element).borderBottomWidth)).toBeGreaterThan(0);
  });

  it('uses label type and the fontWeight knob, never weight 600', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'age', header: 'Age' },
    ];
    const { container } = renderWithProviders(
      <Preset overrides={{ fontWeight: 'regular' }}>
        <SimpleTableDesktop
          data={[{ name: 'Ada', age: 36 }]}
          columns={columns}
        />
      </Preset>,
    );
    const texts = [...container.querySelectorAll('span')].filter((node) => /Name|Ada/.test(node.textContent ?? ''));
    expect(texts.length).toBeGreaterThan(0);
    for (const node of texts) {
      const weight = getComputedStyle(node).fontWeight;
      expect(['400', '700', 'normal', 'bold']).toContain(weight);
      expect(weight).not.toBe('600');
    }
  });

  it('drops motion when animation is none and steps cell pad with space', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'age', header: 'Age' },
    ];
    const data = [{ name: 'Ada', age: 36 }];

    const { container: still } = renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <SimpleTableDesktop
          data={data}
          columns={columns}
        />
      </Preset>,
    );
    expect(still.querySelector('[data-simple-table-frame]')?.dataset.animation).toBe('none');

    const { container: small } = renderWithProviders(
      <Preset overrides={{ space: 'small' }}>
        <SimpleTableDesktop
          data={data}
          columns={columns}
        />
      </Preset>,
    );
    const { container: large } = renderWithProviders(
      <Preset overrides={{ space: 'large' }}>
        <SimpleTableDesktop
          data={data}
          columns={columns}
        />
      </Preset>,
    );
    const smallPad = small.querySelector('[data-cell-pad]')?.dataset.cellPad;
    const largePad = large.querySelector('[data-cell-pad]')?.dataset.cellPad;
    expect(smallPad).toBeTruthy();
    expect(largePad).toBeTruthy();
    expect(smallPad).not.toBe(largePad);
  });

  it('disabled rows stay visible, inert, and visually distinct (LC-40)', () => {
    const columns: SimpleTableColumn[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'city', header: 'City' },
    ];
    const onRowPress = vi.fn();
    const { container } = renderWithProviders(
      <SimpleTableDesktop
        disabled
        data={[{ name: 'Ada', city: 'Portland' }]}
        columns={columns}
        onRowPress={onRowPress}
      />,
    );
    const frame = container.querySelector('[data-simple-table-frame]');
    expect(frame?.getAttribute('aria-disabled')).toBe('true');
    expect(container.textContent).toContain('Ada');
    const row = container.querySelector('[data-row-press="true"]');
    expect(row).toBeNull();
    fireEvent.click(container.querySelector("tbody tr, [role='row']") as Element);
    expect(onRowPress).not.toHaveBeenCalled();
  });

  it('survives the animation knob flipping live from none to bouncy (MPO-327)', () => {
    const columns: SimpleTableColumn[] = [{ accessorKey: 'name', header: 'Name' }];
    const data = [{ name: 'Alice' }, { name: 'Bob' }];
    const Flip = ({ animation }: { animation: 'none' | 'bouncy' }) => (
      <Preset overrides={{ animation }}>
        <SimpleTableDesktop
          data={data}
          columns={columns}
          onRowPress={() => {}}
        />
      </Preset>
    );
    const { container, rerender } = renderWithProviders(<Flip animation="none" />);
    expect(container.querySelector('table')?.dataset.animation).toBe('none');

    expect(() => rerender(<Flip animation="bouncy" />)).not.toThrow();
    expect(container.querySelector('table')?.dataset.animation).toBe('on');
    expect(container.textContent).toContain('Bob');
  });
});

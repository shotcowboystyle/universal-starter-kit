/**
 * Table primitives tests — semantic HTML, knobs, data-chrome animation / textAccent.
 *
 * Note: tamagui 2.0.0-rc derives the DOM element from the `render` prop —
 * the primitives emit REAL <table>/<thead>/<tbody>/<tfoot>/<tr>/<th>/<td>/
 * <caption> elements on web (task 8.5 of the table first-principles spec).
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { Theme } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { Table, tablePressFill, tableZebraFill } from './index';

describe('Table Primitives', () => {
  it('renders real semantic HTML elements (table, thead, tbody, tfoot, tr, td, th, caption)', () => {
    const { container } = renderWithProviders(
      <Table>
        <Table.Caption>Test Caption</Table.Caption>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>Header</Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Cell</Table.Cell>
          </Table.Row>
        </Table.Body>
        <Table.Foot>
          <Table.Row>
            <Table.Cell>Footer</Table.Cell>
          </Table.Row>
        </Table.Foot>
      </Table>,
    );

    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('thead')).not.toBeNull();
    expect(container.querySelector('tbody')).not.toBeNull();
    expect(container.querySelector('tfoot')).not.toBeNull();
    expect(container.querySelectorAll('tr').length).toBe(3);
    expect(container.querySelector('td')).not.toBeNull();
    expect(container.querySelector('th')).not.toBeNull();
    expect(container.querySelector('caption')).not.toBeNull();

    // the `render` prop must not leak into the DOM as an attribute
    expect(container.querySelector('[render]')).toBeNull();

    // strict nesting validity (SSR contract): sections/rows/cells directly
    // under their required parents — no wrapper elements in between
    expect(container.querySelector('table > thead > tr > th')).not.toBeNull();
    expect(container.querySelector('table > tbody > tr > td')).not.toBeNull();
    expect(container.querySelector('table > tfoot > tr > td')).not.toBeNull();
    expect(container.querySelector('table > caption')).not.toBeNull();

    // explicit ARIA roles survive display overrides (flex displayMode)
    expect(container.querySelector('table')?.getAttribute('role')).toBe('table');
    expect(container.querySelector('thead')?.getAttribute('role')).toBe('rowgroup');
    expect(container.querySelector('tbody')?.getAttribute('role')).toBe('rowgroup');
    expect(container.querySelector('tfoot')?.getAttribute('role')).toBe('rowgroup');
    expect(container.querySelector('td')?.getAttribute('role')).toBe('cell');
    expect(container.querySelector('th')?.getAttribute('role')).toBe('columnheader');

    expect(container.querySelector('table.is_Table')).not.toBeNull();
    expect(container.querySelector('thead.is_TableHead')).not.toBeNull();
    expect(container.querySelector('tbody.is_TableBody')).not.toBeNull();
    expect(container.querySelector('tfoot.is_TableFoot')).not.toBeNull();
    expect(container.querySelector('tr.is_TableRow')).not.toBeNull();
    expect(container.querySelector('td.is_TableCell')).not.toBeNull();
    expect(container.querySelector('th.is_TableHeaderCell')).not.toBeNull();
    expect(container.querySelector('caption.is_TableCaption')).not.toBeNull();
  });

  it('applies intent props on Table.Row with Theme wrapping', () => {
    const { container: withIntent } = renderWithProviders(
      <Table>
        <Table.Body>
          <Table.Row accent>
            <Table.Cell>Accent row</Table.Cell>
          </Table.Row>
          <Table.Row error>
            <Table.Cell>Error row</Table.Cell>
          </Table.Row>
          <Table.Row warning>
            <Table.Cell>Warning row</Table.Cell>
          </Table.Row>
          <Table.Row success>
            <Table.Cell>Success row</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    );

    const { container: withoutIntent } = renderWithProviders(
      <Table>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Normal row</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    );

    const rows = withIntent.querySelectorAll('tr');
    expect(rows.length).toBe(4);

    expect(withIntent.textContent).toContain('Accent row');
    expect(withIntent.textContent).toContain('Error row');
    expect(withIntent.textContent).toContain('Warning row');
    expect(withIntent.textContent).toContain('Success row');

    // The intent theme class lands on the <tr> itself (scopes the theme CSS
    // variables) — a Theme span wrapper between <tbody> and <tr> would be
    // invalid HTML and break SSR (parsers foster-parent it out of the table).
    expect(withIntent.querySelector('tr.t_accent')).not.toBeNull();
    expect(withIntent.querySelector('tr.t_error')).not.toBeNull();
    expect(withIntent.querySelector('tr.t_warning')).not.toBeNull();
    expect(withIntent.querySelector('tr.t_success')).not.toBeNull();
    for (const row of withIntent.querySelectorAll('tr')) {
      expect(row.parentElement?.tagName).toBe('TBODY');
    }

    const plainRow = withoutIntent.querySelector('tr');
    expect(plainRow?.classList.contains('t_error')).toBe(false);
  });

  it('spreads knobProps from useResolvedKnobs on Table root', () => {
    const { container } = renderWithProviders(
      <Table>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Content</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    );

    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain('Content');

    expect(table?.classList.contains('is_Table')).toBe(true);
  });

  it('renders Table.Caption as a caption element', () => {
    const { container } = renderWithProviders(
      <Table>
        <Table.Caption>Monthly Sales Report</Table.Caption>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Data</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>,
    );

    const caption = container.querySelector('caption');
    expect(caption).not.toBeNull();
    expect(caption?.textContent).toContain('Monthly Sales Report');
    expect(caption?.classList.contains('is_TableCaption')).toBe(true);

    const table = container.querySelector('table');
    expect(table?.querySelector('caption')).not.toBeNull();
  });

  it('exposes compound component API (Head, Body, Row, Cell, HeaderCell, Foot, Caption)', () => {
    expect(Table.Head).toBeDefined();
    expect(Table.Body).toBeDefined();
    expect(Table.Row).toBeDefined();
    expect(Table.Cell).toBeDefined();
    expect(Table.HeaderCell).toBeDefined();
    expect(Table.Foot).toBeDefined();
    expect(Table.Caption).toBeDefined();

    const { getByText } = renderWithProviders(
      <Table>
        <Table.Caption>Caption</Table.Caption>
        <Table.Head>
          <Table.Row>
            <Table.HeaderCell>H1</Table.HeaderCell>
            <Table.HeaderCell>H2</Table.HeaderCell>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <Table.Row>
            <Table.Cell>A1</Table.Cell>
            <Table.Cell>A2</Table.Cell>
          </Table.Row>
        </Table.Body>
        <Table.Foot>
          <Table.Row>
            <Table.Cell>F1</Table.Cell>
            <Table.Cell>F2</Table.Cell>
          </Table.Row>
        </Table.Foot>
      </Table>,
    );

    expect(getByText('Caption')).toBeDefined();
    expect(getByText('H1')).toBeDefined();
    expect(getByText('H2')).toBeDefined();
    expect(getByText('A1')).toBeDefined();
    expect(getByText('A2')).toBeDefined();
    expect(getByText('F1')).toBeDefined();
    expect(getByText('F2')).toBeDefined();
  });

  it('honours animation on the frame, row and cell (data-chrome)', () => {
    const { container: none } = renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>H</Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>C</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </Preset>,
    );
    const { container: bouncy } = renderWithProviders(
      <Preset overrides={{ animation: 'bouncy' }}>
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>H</Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>C</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </Preset>,
    );

    expect(none.querySelector('table')?.getAttribute('data-animation')).toBe('none');
    expect(bouncy.querySelector('table')?.getAttribute('data-animation')).toBe('on');
    expect(none.querySelector('tr')?.getAttribute('data-animation')).toBe('none');
    expect(bouncy.querySelector('tr')?.getAttribute('data-animation')).toBe('on');
    expect(none.querySelector('td')?.getAttribute('data-animation')).toBe('none');
    expect(bouncy.querySelector('td')?.getAttribute('data-animation')).toBe('on');
  });

  it('survives the animation knob flipping live from none to bouncy', () => {
    const Flip = ({ animation }: { animation: 'none' | 'bouncy' }) => (
      <Preset overrides={{ animation }}>
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>H</Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>C</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </Preset>
    );
    const { container, rerender } = renderWithProviders(<Flip animation="none" />);
    expect(container.querySelector('table')?.getAttribute('data-animation')).toBe('none');

    expect(() => {
      rerender(<Flip animation="bouncy" />);
    }).not.toThrow();
    expect(container.querySelector('table')?.getAttribute('data-animation')).toBe('on');
    expect(container.querySelector('tr')?.getAttribute('data-animation')).toBe('on');
    expect(container.querySelector('td')?.getAttribute('data-animation')).toBe('on');
  });

  it('honours textAccent on header labels and leaves body cells as T-VALUE', () => {
    const { container: high } = renderWithProviders(
      <Preset overrides={{ textAccent: 'high' }}>
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>Ada</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </Preset>,
    );
    const { container: low } = renderWithProviders(
      <Preset overrides={{ textAccent: 'low' }}>
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>Ada</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </Preset>,
    );

    const headerHigh = high.querySelector('th [data-text-accent]')?.getAttribute('data-text-accent');
    const headerLow = low.querySelector('th [data-text-accent]')?.getAttribute('data-text-accent');
    expect(headerHigh).toBeTruthy();
    expect(headerLow).toBeTruthy();
    expect(headerHigh).not.toBe(headerLow);
    expect(high.querySelector('td [data-text-accent]')).toBeNull();
    expect(low.querySelector('td [data-text-accent]')).toBeNull();
  });

  function bodyTable(overrides: Record<string, string>, props: Record<string, unknown> = {}) {
    return renderWithProviders(
      <Preset overrides={overrides as any}>
        <Table {...props}>
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>Plain</Table.Cell>
            </Table.Row>
            <Table.Row onPress={() => {}}>
              <Table.Cell>Pressable</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </Preset>,
    ).container;
  }

  // Token values render as atomic classes (`_h-t-size-3`), which jsdom's
  // computed style cannot resolve, so the knob is read off the class list.
  const atomic = (el: Element | null | undefined, prefix: string) =>
    Array.from(el?.classList ?? []).filter((name) => name.startsWith(`_${prefix}-`));

  it('carries the size knob to the row in the table composition, where min-height is inert', () => {
    const heights = (['small', 'medium', 'large'] as const).map((size) => {
      const cell = bodyTable({ size }).querySelector('tbody td');
      const minHeight = atomic(cell, 'mih');
      expect(minHeight).toHaveLength(1);
      expect(atomic(cell, 'h')).toEqual([minHeight[0]?.replace('_mih-', '_h-')]);
      return minHeight[0];
    });
    expect(heights).toEqual(['_mih-t-size-3', '_mih-t-size-4', '_mih-t-size-5']);
  });

  it('floors a pressable row at the 44px press target and leaves a plain row to the size knob', () => {
    const rows = bodyTable({ size: 'small', space: 'small' }).querySelectorAll('tbody tr');
    const [plain, pressable] = Array.from(rows).map((row) => getComputedStyle(row));
    expect(pressable?.height).toBe('44px');
    expect(pressable?.minHeight).toBe('44px');
    expect(plain?.height).toBe('');
  });

  it('gives the flex composition the same floors through min-height alone', () => {
    const container = bodyTable({ size: 'small' }, { displayMode: 'flex' });
    const cell = container.querySelector('tbody td');
    expect(atomic(cell, 'mih')).toEqual(['_mih-t-size-3']);
    expect(atomic(cell, 'h')).toEqual([]);
    const pressable = getComputedStyle(container.querySelectorAll('tbody tr')[1]);
    expect(pressable.minHeight).toBe('44px');
    expect(pressable.height).toBe('');
  });

  it('keeps the frame fill at outlined, the same answer the card list gives (SF-CARD)', () => {
    const frame = (fillStyle: string) => atomic(bodyTable({ fillStyle }).querySelector('table'), 'bg');
    expect(frame('filled')).toEqual(['_bg-background']);
    expect(frame('outlined')).toEqual(frame('filled'));

    const card = (fillStyle: string) =>
      atomic(bodyTable({ fillStyle }, { layout: 'cards' }).querySelector('[data-testid="table-card"]'), 'bg');
    expect(card('filled')).toHaveLength(1);
    expect(card('outlined')).toEqual(card('filled'));
  });

  describe('tableZebra (K4: Table, DataTable, SimpleTable and ChildTable honour it)', () => {
    function zebraTable(tableZebra: 'on' | 'off', body: React.ReactNode, props: Record<string, unknown> = {}) {
      return renderWithProviders(
        <Preset overrides={{ tableZebra }}>
          <Table {...props}>
            <Table.Head>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
              </Table.Row>
            </Table.Head>
            <Table.Body>{body}</Table.Body>
            <Table.Foot>
              <Table.Row>
                <Table.Cell>Total</Table.Cell>
              </Table.Row>
            </Table.Foot>
          </Table>
        </Preset>,
      ).container;
    }

    const names = ['Ada', 'Grace', 'Edsger', 'Barbara'];
    const plainRows = names.map((name) => (
      <Table.Row key={name}>
        <Table.Cell>{name}</Table.Cell>
      </Table.Row>
    ));
    const stripes = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('tbody tr')).map((row) => row.getAttribute('data-table-zebra'));
    const fills = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('tbody tr')).map((row) => atomic(row, 'bg'));

    it('stays off by default and paints no body row', () => {
      const container = zebraTable('off', plainRows);
      expect(stripes(container)).toEqual(['off', 'off', 'off', 'off']);
      expect(fills(container)).toEqual([[], [], [], []]);
    });

    it('fills odd body rows with $color2 and leaves the head and foot rows alone', () => {
      const container = zebraTable('on', plainRows);
      expect(stripes(container)).toEqual(['even', 'odd', 'even', 'odd']);
      expect(fills(container)).toEqual([[], ['_bg-color2'], [], ['_bg-color2']]);
      expect(container.querySelector('thead tr')?.hasAttribute('data-table-zebra')).toBe(false);
      expect(container.querySelector('tfoot tr')?.hasAttribute('data-table-zebra')).toBe(false);
    });

    it('counts rows through arrays and fragments', () => {
      const container = zebraTable(
        'on',
        <>
          {plainRows.slice(0, 1)}
          <>
            {plainRows[1]}
            {plainRows[2]}
          </>
          {plainRows[3]}
        </>,
      );
      expect(stripes(container)).toEqual(['even', 'odd', 'even', 'odd']);
    });

    it("keeps an intent row's tint and a consumer fill, and stripes a consumer's undefined fill", () => {
      const container = zebraTable('on', [
        <Table.Row key="a">
          <Table.Cell>Ada</Table.Cell>
        </Table.Row>,
        <Table.Row key="b" error>
          <Table.Cell>Grace</Table.Cell>
        </Table.Row>,
        <Table.Row key="c">
          <Table.Cell>Edsger</Table.Cell>
        </Table.Row>,
        <Table.Row key="d" backgroundColor="$color4">
          <Table.Cell>Barbara</Table.Cell>
        </Table.Row>,
        <Table.Row key="e">
          <Table.Cell>Alan</Table.Cell>
        </Table.Row>,
        <Table.Row key="f" backgroundColor={undefined}>
          <Table.Cell>Frances</Table.Cell>
        </Table.Row>,
      ]);
      expect(fills(container)).toEqual([[], ['_bg-color3'], [], ['_bg-color4'], [], ['_bg-color2']]);
    });

    it('restarts the count in a table nested in a body cell', () => {
      const container = zebraTable('on', [
        plainRows[0],
        <Table.Row key="nest">
          <Table.Cell>
            <Table>
              <Table.Head>
                <Table.Row>
                  <Table.HeaderCell>Inner</Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>{plainRows.slice(0, 2)}</Table.Body>
            </Table>
          </Table.Cell>
        </Table.Row>,
      ]);
      const inner = container.querySelector('tbody table') as HTMLElement;
      expect(inner.querySelector('thead tr')?.hasAttribute('data-table-zebra')).toBe(false);
      expect(stripes(inner)).toEqual(['even', 'odd']);
    });

    it('gives the flex composition the same stripes (native parity)', () => {
      const container = zebraTable('on', plainRows, { displayMode: 'flex' });
      expect(stripes(container)).toEqual(['even', 'odd', 'even', 'odd']);
      expect(fills(container)).toEqual([[], ['_bg-color2'], [], ['_bg-color2']]);
    });

    it('stripes odd cards in the card layout and leaves intent cards tinted', () => {
      const cards = (tableZebra: 'on' | 'off') =>
        Array.from(
          zebraTable(
            tableZebra,
            [
              ...plainRows,
              <Table.Row key="intent" success>
                <Table.Cell>Alan</Table.Cell>
              </Table.Row>,
              <Table.Row key="last">
                <Table.Cell>Frances</Table.Cell>
              </Table.Row>,
            ],
            { layout: 'cards' },
          ).querySelectorAll('[data-testid="table-card"]'),
        );
      const off = cards('off');
      const on = cards('on');
      expect(off.map((card) => card.getAttribute('data-table-zebra'))).toEqual([
        'off',
        'off',
        'off',
        'off',
        'off',
        'off',
      ]);
      expect(on.map((card) => card.getAttribute('data-table-zebra'))).toEqual([
        'even',
        'odd',
        'even',
        'odd',
        'even',
        'odd',
      ]);
      expect(atomic(on[0], 'bg')).toEqual(atomic(off[0], 'bg'));
      expect(atomic(on[1], 'bg')).toEqual(['_bg-color2']);
      expect(atomic(on[3], 'bg')).toEqual(['_bg-color2']);
      expect(atomic(on[4], 'bg')).toEqual(atomic(off[4], 'bg'));
      expect(atomic(on[5], 'bg')).toEqual(['_bg-color2']);
    });

    describe('the stripe steps one up the ramp from the surface it sits on', () => {
      type Elevation = 'none' | 'small' | 'medium' | 'large';
      function cardFills(scheme: 'light' | 'dark', elevation?: Elevation) {
        const ui = (
          <Preset overrides={{ tableZebra: 'on', ...(elevation ? { elevation } : {}) }}>
            <Table layout="cards">
              <Table.Head>
                <Table.Row>
                  <Table.HeaderCell>Name</Table.HeaderCell>
                </Table.Row>
              </Table.Head>
              <Table.Body>{plainRows}</Table.Body>
            </Table>
          </Preset>
        );
        const { container } = renderWithProviders(scheme === 'dark' ? <Theme name="dark">{ui}</Theme> : ui);
        return Array.from(container.querySelectorAll('[data-testid="table-card"]')).map((card) => atomic(card, 'bg'));
      }

      it("in dark an odd card's background differs from an even card's", () => {
        const [even, odd] = cardFills('dark');
        expect(odd).not.toEqual(even);
      });

      it("takes the card's own elevation tint plus one in dark, at every elevation", () => {
        const pairs = (['none', 'small', 'medium', 'large'] as const).map((elevation) =>
          cardFills('dark', elevation).slice(0, 2),
        );
        expect(pairs).toEqual([
          [['_bg-background'], ['_bg-color2']],
          [['_bg-color2'], ['_bg-color3']],
          [['_bg-color3'], ['_bg-color4']],
          [['_bg-color4'], ['_bg-color5']],
        ]);
      });

      it('leaves light unchanged: cards rest on $background and stripe $color2', () => {
        expect(cardFills('light', 'large').slice(0, 2)).toEqual([['_bg-background'], ['_bg-color2']]);
      });

      it('keeps rows on $color2 in dark, one step up from the frame', () => {
        const { container } = renderWithProviders(
          <Theme name="dark">
            <Preset overrides={{ tableZebra: 'on' }}>
              <Table>
                <Table.Body>{plainRows}</Table.Body>
              </Table>
            </Preset>
          </Theme>,
        );
        expect(fills(container)).toEqual([[], ['_bg-color2'], [], ['_bg-color2']]);
      });

      it('tableZebraFill names the step above a host fill', () => {
        expect(
          ['$background', '$color1', '$color2', '$color4', '$color12', 'transparent', undefined].map(tableZebraFill),
        ).toEqual(['$color2', '$color2', '$color3', '$color5', '$color12', '$color2', '$color2']);
      });
    });
  });

  describe('tablePressFill', () => {
    it('presses one step above the fill it rests on, never below $color4 and never onto that fill', () => {
      expect(
        [
          '$background',
          '$color1',
          '$color2',
          '$color3',
          '$color4',
          '$color5',
          '$color11',
          '$color12',
          'transparent',
          undefined,
        ].map(tablePressFill),
      ).toEqual([
        '$color4',
        '$color4',
        '$color4',
        '$color4',
        '$color5',
        '$color6',
        '$color12',
        '$color11',
        '$color4',
        '$color4',
      ]);
    });
  });
});

import { renderWithProviders } from '@repo/test-utils';
import { formatMonthYear } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MatrixView, type MatrixRow } from './Matrix';
import { generateBuckets, type MatrixCell } from './matrixMath';

afterEach(cleanup);

const rows: MatrixRow[] = [
  { id: 'a', label: 'Checking' },
  { id: 'b', label: 'Savings' },
  { id: 'c', label: 'HSA' },
];

// Checking spans Jan–Mar with two points in January (folded to 10, the grid
// max); Savings carries a real zero in January and an error in March; HSA
// has no point at all.
const cells: MatrixCell[] = [
  { rowId: 'a', date: new Date(2026, 0, 12), value: 4 },
  { rowId: 'a', date: new Date(2026, 0, 20), value: 6 },
  { rowId: 'a', date: new Date(2026, 1, 3), value: 2 },
  { rowId: 'a', date: new Date(2026, 2, 9), value: 10 },
  { rowId: 'b', date: new Date(2026, 0, 5), value: 0 },
  { rowId: 'b', date: new Date(2026, 2, 2), value: 3, intent: 'error' },
];

const cell = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-matrix-cell="${id}"]`) as HTMLElement;

describe('MatrixView', () => {
  it("generates the column axis from the rule over the data's range, one row per subject", () => {
    const { container } = renderWithProviders(<MatrixView rows={rows} cells={cells} rule="month" />);

    const columns = Array.from(container.querySelectorAll('[data-matrix-column]'));
    expect(columns.map((el) => el.getAttribute('data-matrix-column'))).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
    expect(columns[0].textContent).toBe(formatMonthYear(new Date(2026, 0, 1)));
    expect(columns[0].getAttribute('aria-label')).toBe(formatMonthYear(new Date(2026, 0, 1)));
    expect(container.querySelector('[data-matrix-view="month"]')).toBeTruthy();

    const labels = Array.from(container.querySelectorAll('[data-matrix-row-label]'));
    expect(labels.map((el) => el.textContent)).toEqual(['Checking', 'Savings', 'HSA']);
    expect(container.querySelectorAll('[data-matrix-row]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-matrix-cell]')).toHaveLength(9);
    expect(screen.getByText('Subject')).toBeInTheDocument();
  });

  it('regenerates the axis when the rule is switched, nothing re-declared', () => {
    const onRuleChange = vi.fn();
    const { container } = renderWithProviders(
      <MatrixView rows={rows} cells={cells} rule="month" onRuleChange={onRuleChange} />,
    );

    fireEvent.click(screen.getByText('Week'));

    expect(onRuleChange).toHaveBeenCalledWith('week');
    expect(container.querySelector('[data-matrix-view="week"]')).toBeTruthy();
    const expected = generateBuckets({ start: new Date(2026, 0, 5), end: new Date(2026, 2, 10) }, 'week');
    const columns = Array.from(container.querySelectorAll('[data-matrix-column]'));
    expect(columns.map((el) => el.getAttribute('data-matrix-column'))).toEqual(expected.map((b) => b.key));
    expect(columns.length).toBeGreaterThan(3);
  });

  it('snaps an explicit window to bucket boundaries', () => {
    const { container } = renderWithProviders(
      <MatrixView
        rows={rows}
        cells={cells}
        rule="month"
        range={{ start: new Date(2025, 10, 20), end: new Date(2026, 4, 2) }}
      />,
    );
    const columns = Array.from(container.querySelectorAll('[data-matrix-column]'));
    expect(columns.map((el) => el.getAttribute('data-matrix-column'))).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ]);
  });

  it('a cell carries its folded value and a paint strength; an intent rides the theme ramp', () => {
    const { container } = renderWithProviders(<MatrixView rows={rows} cells={cells} rule="month" />);

    const aJan = cell(container, 'a:2026-01-01');
    expect(aJan.textContent).toBe('10');
    expect(aJan.getAttribute('data-matrix-cell-state')).toBe('value');
    expect(aJan.querySelector('[data-matrix-fill]')!.getAttribute('data-matrix-fill')).toBe('1');
    expect(aJan.getAttribute('aria-label')).toBe(`Checking, ${formatMonthYear(new Date(2026, 0, 1))}: 10`);

    const aFeb = cell(container, 'a:2026-02-01');
    expect(aFeb.textContent).toBe('2');
    expect(aFeb.querySelector('[data-matrix-fill]')!.getAttribute('data-matrix-fill')).toBe('0.2');

    const bMar = cell(container, 'b:2026-03-01');
    expect(bMar.getAttribute('data-matrix-cell-intent')).toBe('error');
    expect(cell(container, 'a:2026-03-01').getAttribute('data-matrix-cell-intent')).toBeNull();
  });

  it('an empty bucket is a different state from a zero', () => {
    const { container } = renderWithProviders(<MatrixView rows={rows} cells={cells} rule="month" />);

    const zero = cell(container, 'b:2026-01-01');
    expect(zero.getAttribute('data-matrix-cell-state')).toBe('zero');
    expect(zero.textContent).toBe('0');
    expect(zero.querySelector('[data-matrix-fill]')!.getAttribute('data-matrix-fill')).toBe('0');

    const gap = cell(container, 'c:2026-01-01');
    expect(gap.getAttribute('data-matrix-cell-state')).toBe('empty');
    expect(gap.querySelector('[data-matrix-fill]')).toBeNull();
    expect(gap.textContent).toBe('·');
    expect(gap.getAttribute('aria-label')).toBe(`HSA, ${formatMonthYear(new Date(2026, 0, 1))}: No data`);
    expect(cell(container, 'b:2026-02-01').getAttribute('data-matrix-cell-state')).toBe('empty');
  });

  it("carries a legend naming the empty state and the ramp, plus the caller's entries", () => {
    const { container } = renderWithProviders(
      <MatrixView rows={rows} cells={cells} rule="month" legendItems={[{ label: 'Failed import', intent: 'error' }]} />,
    );
    const legend = container.querySelector('[data-matrix-legend]')!;
    expect(legend).toBeTruthy();
    expect(legend.textContent).toContain('No data');
    expect(legend.textContent).toContain('Less');
    expect(legend.textContent).toContain('More');
    expect(legend.textContent).toContain('Failed import');
    const swatches = Array.from(legend.querySelectorAll('[data-matrix-legend-swatch]')).map((el) =>
      el.getAttribute('data-matrix-legend-swatch'),
    );
    expect(swatches).toEqual(['empty', '0', '0.25', '0.5', '0.75', '1', '1']);

    cleanup();
    const { container: bare } = renderWithProviders(
      <MatrixView rows={rows} cells={cells} rule="month" showLegend={false} />,
    );
    expect(bare.querySelector('[data-matrix-legend]')).toBeNull();
  });

  it('anchors every inset fill to its own swatch or cell, so no fill resolves against the viewport', () => {
    const { container } = renderWithProviders(
      <MatrixView rows={rows} cells={cells} rule="month" legendItems={[{ label: 'Failed import', intent: 'error' }]} />,
    );
    const swatches = Array.from(
      container.querySelectorAll('[data-matrix-legend-swatch]:not([data-matrix-legend-swatch="empty"])'),
    ) as HTMLElement[];
    const cellFills = Array.from(container.querySelectorAll('[data-matrix-fill]')) as HTMLElement[];
    expect(swatches).toHaveLength(6);
    expect(cellFills.length).toBeGreaterThan(0);

    const fills = [...swatches.map((swatch) => swatch.firstElementChild as HTMLElement), ...cellFills];
    for (const fill of fills) {
      expect(getComputedStyle(fill).position).toBe('absolute');
      expect(getComputedStyle(fill.parentElement!).position).toBe('relative');
    }
  });

  it('a cell press reports its row, bucket and summary; an empty bucket presses too', () => {
    const onCellPress = vi.fn();
    const { container } = renderWithProviders(
      <MatrixView rows={rows} cells={cells} rule="month" onCellPress={onCellPress} />,
    );

    const aJan = cell(container, 'a:2026-01-01');
    expect(aJan.getAttribute('role')).toBe('button');
    fireEvent.click(aJan);
    expect(onCellPress).toHaveBeenCalledTimes(1);
    const ref = onCellPress.mock.calls[0][0];
    expect(ref.row.id).toBe('a');
    expect(ref.bucket.key).toBe('2026-01-01');
    expect(ref.bucket.start).toEqual(new Date(2026, 0, 1));
    expect(ref.summary.value).toBe(10);
    expect(ref.summary.count).toBe(2);

    fireEvent.click(cell(container, 'c:2026-02-01'));
    expect(onCellPress).toHaveBeenCalledTimes(2);
    expect(onCellPress.mock.calls[1][0].summary).toBeUndefined();
    expect(onCellPress.mock.calls[1][0].row.id).toBe('c');

    fireEvent.keyDown(aJan, { key: 'Enter' });
    expect(onCellPress).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(aJan, { key: ' ' });
    expect(onCellPress).toHaveBeenCalledTimes(4);
    fireEvent.keyDown(aJan, { key: 'a' });
    expect(onCellPress).toHaveBeenCalledTimes(4);
  });

  it('without onCellPress a cell is not a control', () => {
    const { container } = renderWithProviders(<MatrixView rows={rows} cells={cells} rule="month" />);
    expect(cell(container, 'a:2026-01-01').getAttribute('role')).toBeNull();
    expect(container.querySelectorAll('[data-matrix-cell][role="button"]')).toHaveLength(0);
  });

  it('keeps the header row and subject column outside the grid scrollers, and the header follows the grid scroll', () => {
    const scrolls: { target: HTMLElement; left: number }[] = [];
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scroll');
    Object.defineProperty(HTMLElement.prototype, 'scroll', {
      configurable: true,
      writable: true,
      value(this: HTMLElement, options: { left?: number }) {
        if (typeof options?.left === 'number') {
          scrolls.push({ target: this, left: options.left });
        }
      },
    });
    try {
      const { container } = renderWithProviders(<MatrixView rows={rows} cells={cells} rule="month" />);

      const axisRow = container.querySelector('[data-matrix-axis-row]') as HTMLElement;
      const axis = container.querySelector('[data-matrix-axis]') as HTMLElement;
      const body = container.querySelector('[data-matrix-scroll-body]') as HTMLElement;
      const labels = container.querySelector('[data-matrix-labels]') as HTMLElement;
      const canvas = container.querySelector('[data-matrix-canvas]') as HTMLElement;
      expect(axisRow).toBeTruthy();
      expect(body.contains(axisRow)).toBe(false);
      expect(axisRow.contains(axis)).toBe(true);
      expect(body.contains(labels)).toBe(true);
      expect(body.contains(canvas)).toBe(true);

      let scroller: HTMLElement | null = canvas.parentElement;
      while (scroller && scroller !== body && !scroller.contains(labels)) {
        scroller = scroller.parentElement;
      }
      expect(scroller).toBe(body);

      let node: HTMLElement | null = canvas.parentElement;
      let followed = false;
      while (node && node !== body && !followed) {
        Object.defineProperty(node, 'scrollLeft', { configurable: true, value: 300 });
        fireEvent.scroll(node);
        followed = scrolls.some((call) => call.left === 300 && call.target.contains(axis));
        node = node.parentElement;
      }
      expect(followed).toBe(true);
      expect(scrolls.some((call) => call.target.contains(canvas))).toBe(false);
    } finally {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, 'scroll', original);
      } else {
        delete (HTMLElement.prototype as any).scroll;
      }
    }
  });

  it('shows the matrix skeleton while loading with no rows', () => {
    const { container } = renderWithProviders(<MatrixView rows={[]} cells={[]} isLoading />);
    expect(container.querySelector('[data-async-skeleton="matrix"]')).toBeTruthy();
    expect(container.querySelector('[data-matrix-column]')).toBeNull();
  });

  it('forbids empty chrome when error is set, and shows the empty state otherwise', () => {
    renderWithProviders(<MatrixView rows={[]} cells={[]} emptyTitle="No accounts yet" error="Coverage failed" />);
    expect(screen.queryByText('No accounts yet')).toBeNull();
    expect(screen.getByText('Coverage failed')).toBeInTheDocument();
    cleanup();

    renderWithProviders(<MatrixView rows={[]} cells={[]} emptyTitle="No accounts yet" />);
    expect(screen.getByText('No accounts yet')).toBeInTheDocument();
  });

  it('formatCell overrides the visible text and a point label wins over the number', () => {
    const { container } = renderWithProviders(
      <MatrixView
        rows={rows}
        cells={[...cells, { rowId: 'c', date: new Date(2026, 1, 10), value: 7, label: '7 new' }]}
        rule="month"
        formatCell={(summary) => summary.label ?? `${summary.count}p`}
      />,
    );
    expect(cell(container, 'a:2026-01-01').textContent).toBe('2p');
    expect(cell(container, 'c:2026-02-01').textContent).toBe('7 new');
    cleanup();

    const { container: plain } = renderWithProviders(
      <MatrixView
        rows={rows}
        cells={[...cells, { rowId: 'c', date: new Date(2026, 1, 10), value: 7, label: '7 new' }]}
        rule="month"
      />,
    );
    expect(cell(plain, 'a:2026-01-01').textContent).toBe('10');
    expect(cell(plain, 'c:2026-02-01').textContent).toBe('7 new');
  });

  it('scales intensity against the largest value on screen, not one outside the window or the rows', () => {
    const { container } = renderWithProviders(
      <MatrixView
        rows={rows}
        cells={[
          ...cells,
          { rowId: 'a', date: new Date(2025, 5, 1), value: 1000 },
          { rowId: 'zz', date: new Date(2026, 0, 3), value: 500 },
        ]}
        rule="month"
        range={{ start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) }}
      />,
    );
    const fill = (id: string) =>
      cell(container, id).querySelector('[data-matrix-fill]')!.getAttribute('data-matrix-fill');
    expect(fill('a:2026-01-01')).toBe('1');
    expect(fill('a:2026-02-01')).toBe('0.2');
  });
});

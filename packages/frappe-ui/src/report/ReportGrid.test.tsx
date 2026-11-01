/**
 * ReportGrid row keyboard contract (LC-49 ONE-TAB-STOP, LC-50
 * KEY-ACTIVATION, DG-A11Y-06 names).
 *
 * The data row is ONE pressable unit: click anywhere activates, Enter AND
 * Space activate from the keyboard, the data-row set exposes exactly one
 * tab stop (roving tabindex, arrows/Home/End move it), rows are named by
 * doc identity, presses on inner interactive content (Link cells) never
 * reach the row handler, and there is no per-cell pressable chrome inside
 * body cells. Group header rows are not pressable and hold no tab stop.
 */
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { buildGridRows } from './report-view-model';
import type { ReportColumnDef, ReportRow } from './report-view-model';
import { ReportGrid } from './ReportGrid';
import type { ReportGridProps } from './ReportGrid';

const columns: ReportColumnDef[] = [
  { fieldname: 'name', label: 'ID', fieldtype: 'Data', kind: 'text', width: 160, align: 'left' },
  {
    fieldname: 'status',
    label: 'Status',
    fieldtype: 'Select',
    kind: 'select',
    options: 'Open\nClosed',
    width: 120,
    align: 'left',
  },
  {
    fieldname: 'assigned_by',
    label: 'Assigned By',
    fieldtype: 'Link',
    kind: 'link',
    options: 'User',
    width: 160,
    align: 'left',
  },
];

const dataRows: ReportRow[] = [
  { name: 'TD-0001', status: 'Open', assigned_by: 'alice@example.com' },
  { name: 'TD-0002', status: 'Closed', assigned_by: 'bob@example.com' },
  { name: 'TD-0003', status: 'Open', assigned_by: 'carol@example.com' },
];

const pressRows = (container: HTMLElement): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('[data-report-row="true"]'),
];

const renderGrid = (overrides: Partial<ReportGridProps> = {}) => {
  const onOpenRow = vi.fn<NonNullable<ReportGridProps['onOpenRow']>>();
  const onOpenLink = vi.fn<NonNullable<ReportGridProps['onOpenLink']>>();
  const result = renderWithProviders(
    <ReportGrid
      columns={columns}
      rows={buildGridRows(dataRows, 0, 20)}
      sort={{ field: 'modified', order: 'desc' }}
      onSortChange={vi.fn<NonNullable<ReportGridProps['onSortChange']>>()}
      columnFilters={{}}
      onColumnFilterChange={vi.fn<NonNullable<ReportGridProps['onColumnFilterChange']>>()}
      onOpenRow={onOpenRow}
      onOpenLink={onOpenLink}
      totals={[]}
      {...overrides}
    />,
  );
  return { ...result, onOpenRow, onOpenLink };
};

describe('ReportGrid row activation (LC-50)', () => {
  it("activates on a click anywhere in the row with the row's name", () => {
    const { onOpenRow } = renderGrid();
    fireEvent.click(screen.getByText('Closed'));
    expect(onOpenRow).toHaveBeenCalledExactlyOnceWith('TD-0002');
  });

  it('activates on Enter AND Space, once per physical key press', () => {
    const { container, onOpenRow } = renderGrid();
    const rows = pressRows(container);
    rows[0].focus();

    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(onOpenRow).toHaveBeenCalledOnce();
    expect(onOpenRow).toHaveBeenLastCalledWith('TD-0001');

    fireEvent.keyDown(rows[0], { key: ' ' });
    expect(onOpenRow).toHaveBeenCalledTimes(2);

    // Key auto-repeat never machine-guns activations.
    fireEvent.keyDown(rows[0], { key: 'Enter', repeat: true });
    expect(onOpenRow).toHaveBeenCalledTimes(2);
  });

  it('names each pressable row by doc identity (DG-A11Y-06)', () => {
    const { container } = renderGrid();
    expect(pressRows(container).map((row) => row.getAttribute('aria-label'))).toStrictEqual([
      'TD-0001',
      'TD-0002',
      'TD-0003',
    ]);
  });
});

describe('ReportGrid roving tab stop (LC-49)', () => {
  it('exposes exactly one tab stop; arrows and Home/End rove it', async () => {
    const { container } = renderGrid();
    const rows = pressRows(container);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.getAttribute('tabindex'))).toStrictEqual(['0', '-1', '-1']);

    rows[0].focus();
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    // The anchor follows focus: still exactly one tabindex=0.
    await waitFor(() => {
      const stops = pressRows(container).map((row) => row.getAttribute('tabindex'));
      expect(stops).toStrictEqual(['-1', '0', '-1']);
    });

    fireEvent.keyDown(rows[1], { key: 'End' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2], { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: 'ArrowUp' });
    // Clamped at the first row — no wrap.
    expect(document.activeElement).toBe(rows[0]);
  });

  it('group header rows are not pressable and hold no tab stop', () => {
    const { container } = renderGrid({
      rows: buildGridRows(dataRows, 0, 20, 'status'),
      groupByColumn: columns[1],
    });
    // Three data rows stay pressable; the injected group headers are not.
    expect(pressRows(container)).toHaveLength(3);
    const groupHeaderCells = [...container.querySelectorAll('[role="rowheader"]')];
    expect(groupHeaderCells.length).toBeGreaterThan(0);
    for (const cell of groupHeaderCells) {
      const groupRow = cell.closest<HTMLElement>('[role="row"]')!;
      expect(groupRow.dataset.reportRow).toBeNull();
      expect(groupRow.getAttribute('tabindex')).toBeNull();
    }
  });
});

describe('ReportGrid inner interactive content wins', () => {
  it('a Link cell press opens the linked doc, never the row', () => {
    const { onOpenRow, onOpenLink } = renderGrid();
    fireEvent.click(screen.getByText('alice@example.com'));
    expect(onOpenLink).toHaveBeenCalledExactlyOnceWith('User', 'alice@example.com');
    expect(onOpenRow).not.toHaveBeenCalled();
  });

  it('keys on focused inner content belong to that content, not the row', () => {
    const { onOpenRow } = renderGrid();
    // Keydown dispatched from the link bubbles to the row, where the
    // target !== currentTarget guard hands it back to the inner control.
    fireEvent.keyDown(screen.getByText('alice@example.com'), { key: 'Enter' });
    expect(onOpenRow).not.toHaveBeenCalled();
  });

  it('renders no per-cell pressable chrome inside body cells', () => {
    const { container } = renderGrid();
    const body = container.querySelector('tbody');
    expect(body).not.toBeNull();
    // Link cells are the only sanctioned inner interactive content; no
    // per-cell buttons wrap plain values.
    expect(body!.querySelectorAll('[role="button"], button')).toHaveLength(0);
  });
});

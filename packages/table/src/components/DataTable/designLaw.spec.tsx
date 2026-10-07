/**
 * MPO-60 / living rulebook: DataTable design-law 100%.
 *
 * Pins the Part 3 DataTable contract that was still open on origin/main:
 * intent joins the resolver path (not `intent: undefined`), row `_intent`
 * rides the same `tr.t_*` theme class SimpleTable already uses (no Theme
 * wrapper inside <table>), chrome glyphs follow LC-65 size recipes, and
 * the frame spreads R-OUTER instead of cherry-picking R-SCALE.
 *
 * Rulings: /tmp/cursor-mpo-lanes/RULINGS-2026-08-28.md (campaign file).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { sizeRecipeForToken } from '@repo/theme';
import { createColumnHelper } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

interface Person {
  id: number;
  firstName: string;
  status: string;
  _intent?: 'accent' | 'error' | 'warning' | 'success';
}

const columnHelper = createColumnHelper<Person>();
const columns: DataTableColumn<Person>[] = [
  columnHelper.accessor('firstName', { header: 'First Name' }) as DataTableColumn<Person>,
  columnHelper.accessor('status', { header: 'Status' }) as DataTableColumn<Person>,
];

const here = import.meta.dirname;

function source(name: string): string {
  return readFileSync(join(here, name), 'utf-8');
}

describe('DataTable design-law (intent + recipes)', () => {
  it('paints row _intent on the real tr (SimpleTable dialect, no Theme wrapper)', () => {
    const data: Person[] = [
      { id: 1, firstName: 'Ok', status: 'Active' },
      { id: 2, firstName: 'Bad', status: 'Failed', _intent: 'error' },
      { id: 3, firstName: 'Warn', status: 'Degraded', _intent: 'warning' },
      { id: 4, firstName: 'Good', status: 'Complete', _intent: 'success' },
    ];
    const { container } = renderWithProviders(
      <DataTable
        data={data}
        columns={columns}
        layout="table"
        onStateChange={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('Bad');
    expect(container.querySelector('tr.t_error')).not.toBeNull();
    expect(container.querySelector('tr.t_warning')).not.toBeNull();
    expect(container.querySelector('tr.t_success')).not.toBeNull();
    for (const row of container.querySelectorAll('tr')) {
      expect(row.parentElement?.tagName).toMatch(/THEAD|TBODY|TFOOT/);
    }
  });

  it('expand-caret glyphs use the size recipe icon channel, not a handwritten 14', () => {
    const data: Person[] = [
      {
        id: 1,
        firstName: 'John',
        status: 'Active',
        subRows: [{ id: 11, firstName: 'Kid', status: 'Active' }],
      } as Person,
    ];
    const { getAllByLabelText } = renderWithProviders(
      <DataTable
        data={data}
        columns={columns}
        enableRowExpansion
        layout="table"
        onStateChange={vi.fn()}
      />,
    );
    const expand = getAllByLabelText(/^Expand row \d+$/)[0];
    const svg = expand.querySelector('svg');
    expect(svg).not.toBeNull();
    const expected = sizeRecipeForToken('$4').iconSize;
    expect(Number(svg?.getAttribute('width'))).toBe(expected);
    expect(Number(svg?.getAttribute('width'))).not.toBe(14);
  });

  it('does not force intent: undefined — resolver is opt-in by component key', () => {
    expect(source('DataTableRoot.tsx')).not.toMatch(/intent:\s*undefined/);
    expect(source('index.native.tsx')).not.toMatch(/intent:\s*undefined/);
  });

  it('does not cherry-pick R-SCALE radius onto the R-OUTER frame', () => {
    expect(source('DataTableRoot.tsx')).not.toMatch(/knobProps\.borderRadius\.borderRadius/);
    expect(source('DataTableDocumentList.tsx')).not.toMatch(/knobProps\.borderRadius\.borderRadius/);
  });

  it('does not hardcode caret size 14 or a raw 0.15s transform transition', () => {
    const files = ['DataTableRoot.tsx', 'index.native.tsx', 'DataTableCardControls.tsx', 'DataTableVirtualized.tsx'];
    for (const file of files) {
      const src = source(file);
      expect(src, file).not.toMatch(/size=\{14\}/);
      expect(src, file).not.toMatch(/transform 0\.15s ease/);
      expect(src, file).not.toMatch(/const rowHeightPx = 40/);
    }
  });
});

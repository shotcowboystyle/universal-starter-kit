/**
 * MPO-60 / living rulebook: remaining DataTable chrome design-law 100%.
 *
 * R7 bans 500 and 600 label weights, and that ceiling is all the chrome
 * sources are held to here: whether their labels pin 400 or take the
 * fontWeight knob is unruled (docs/design/knob-laws.md D8, K13). compact is
 * not defaulted into useResolvedKnobs. Glyphs use the LC-65 icon recipe.
 * Overlays spread elevatedSurface (borderWidth=none is zero). Named exports
 * only.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { sizeRecipeForToken } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import { iconSizeForToken } from '../utils/chrome-icons';

import { ColumnHeaderFilter } from './ColumnHeaderFilter';
import { DataTableFacetMenu } from './DataTableFacetMenu';

const here = import.meta.dirname;

const CHROME_INDEX = [
  'ColumnHeaderFilter/index.tsx',
  'DataTableBulkActions/index.tsx',
  'DataTableColumnPinning/index.tsx',
  'DataTableDateFilter/index.tsx',
  'DataTableExport/index.tsx',
  'DataTableFacetMenu/index.tsx',
  'DataTableGrouping/index.tsx',
  'DataTableToolbar/index.tsx',
  'DataTableViewOptions/index.tsx',
];

const source = (relative: string): string => readFileSync(path.join(here, relative), 'utf-8');

describe('table chrome design-law (R7 + compact + recipes)', () => {
  it('does not ship illegal 500/600 label weights in chrome sources', () => {
    for (const file of CHROME_INDEX) {
      const src = source(file);
      expect(src, file).not.toMatch(/fontWeight=["'](?:500|600)["']/u);
    }
  });

  it('does not hardcode Phosphor 14/16 or 1px overlay borders', () => {
    for (const file of CHROME_INDEX) {
      const src = source(file);
      expect(src, file).not.toMatch(/size=\{1[46]\}/u);
      expect(src, file).not.toMatch(/borderWidth=\{1\}/u);
    }
  });

  it('does not pin density compact=false into useResolvedKnobs', () => {
    for (const file of CHROME_INDEX) {
      const src = source(file);
      expect(src, file).not.toMatch(/useResolvedKnobs\(\{\s*compact:\s*true/u);
      expect(src, file).not.toMatch(/compact\s*=\s*false/u);
    }
  });

  it('Fields in Cells stories do not pin compact={false}', () => {
    const src = source('DataTable/FieldsInCells.stories.tsx');
    expect(src).not.toMatch(/compact=\{false\}/u);
    expect(src).toMatch(/fontWeight="400"/u);
  });

  it('iconSizeForToken follows the size recipe, not a handwritten 14', () => {
    const expected = sizeRecipeForToken('$4').iconSize;
    expect(iconSizeForToken('$4')).toBe(expected);
    expect(iconSizeForToken('$4')).not.toBe(14);
  });

  it('ColumnHeaderFilter title is the Filter: column label (R7)', () => {
    const { getByLabelText } = renderWithProviders(
      <ColumnHeaderFilter
        columnId="status"
        columnLabel="Status"
        columnType="text"
        onFilterChange={() => {}}
      />,
    );
    expect(getByLabelText('Filter column Status')).not.toBeNull();
  });

  it('DataTableFacetMenu trigger is a named export with recipe-sized caret', () => {
    const { getByRole } = renderWithProviders(
      <DataTableFacetMenu
        label="Assigned To"
        options={[{ value: 'a', label: 'A', count: 1 }]}
      />,
    );
    const trigger = getByRole('button', { name: 'Assigned To' });
    expect(trigger).toBeDefined();
    const svg = trigger.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(Number(svg?.getAttribute('width'))).toBe(sizeRecipeForToken('$4').iconSize);
  });
});

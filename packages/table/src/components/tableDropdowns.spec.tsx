/**
 * MPO-221: a table dropdown is a FloatingPanel (the cover family, MPO-38),
 * never Tamagui's Popover. Each surface opens the FloatingPanel viewport from
 * its trigger, and no component source under components/ imports Popover.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ColumnHeaderFilter } from './ColumnHeaderFilter';
import { DataTableDateFilter } from './DataTableDateFilter';
import { DataTableExport } from './DataTableExport';
import { DataTableGroupingConfig } from './DataTableGrouping';
import { DataTableSearch } from './DataTableSearch';
import { DataTableToolbar } from './DataTableToolbar';
import { DataTableViewOptions } from './DataTableViewOptions';

const panel = () => document.querySelector('[data-testid="floating-panel-viewport"]');

const rows = [{ name: 'Ada', city: 'London' }];
const columns = [
  { accessorKey: 'name', header: 'Name', id: 'name', searchable: true },
  { accessorKey: 'city', header: 'City', id: 'city', searchable: true },
];

interface Surface {
  name: string;
  ui: ReactElement;
  trigger: () => HTMLElement;
  content: string;
}

const surfaces: Surface[] = [
  {
    name: 'column header filter',
    ui: (
      <ColumnHeaderFilter
        columnId="name"
        columnLabel="Name"
        columnType="text"
        onFilterChange={vi.fn()}
      />
    ),
    trigger: () => screen.getByLabelText('Filter column Name'),
    content: 'Filter: Name',
  },
  {
    name: 'export options',
    ui: (
      <DataTableExport
        data={rows}
        columns={columns}
      />
    ),
    trigger: () => screen.getByRole('button', { name: 'Export options' }),
    content: 'Export Options',
  },
  {
    name: 'grouping',
    ui: (
      <DataTableGroupingConfig
        columns={columns}
        currentConfig={{ columns: [], aggregations: [] }}
        onConfigChange={vi.fn()}
      />
    ),
    trigger: () => screen.getByLabelText('Grouping configuration'),
    content: 'Grouping & Aggregation',
  },
  {
    name: 'date filter',
    ui: <DataTableDateFilter placeholder="Pick a date" />,
    trigger: () => screen.getByText('Pick a date'),
    content: 'Date Filter',
  },
  {
    name: 'search options',
    ui: (
      <DataTableSearch
        data={rows}
        columns={columns}
        onSearchResults={vi.fn()}
      />
    ),
    trigger: () => screen.getByRole('button', { name: 'Search options' }),
    content: 'Search Options',
  },
  {
    name: 'toolbar save-view',
    ui: (
      <DataTableToolbar
        onSaveView={vi.fn()}
        onLoadView={vi.fn()}
        views={[]}
        enableViews
        showViewSelector
      />
    ),
    trigger: () => screen.getByRole('button', { name: 'Save view' }),
    content: '',
  },
  {
    name: 'view options save-view',
    ui: (
      <DataTableViewOptions
        columns={[{ id: 'name', label: 'Name', visible: true, order: 0 }]}
        onSaveView={vi.fn()}
        onLoadView={vi.fn()}
        onResetToDefault={vi.fn()}
        showViewManagement
      />
    ),
    trigger: () => screen.getByText('Save Current View'),
    content: 'Save View',
  },
];

describe('table dropdowns open FloatingPanel (MPO-221)', () => {
  it.each(surfaces)('$name opens the FloatingPanel viewport', async ({ ui, trigger, content }) => {
    renderWithProviders(ui);
    expect(panel()).toBeNull();
    fireEvent.click(trigger());
    await waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    if (content) {
      expect(panel()!.textContent).toContain(content);
    }
    // A compose-class editor declares its dismissal contract (LC-21 VERIFY).
    expect(panel()!.querySelector('[data-dismiss-class="compose"]')).not.toBeNull();
  });

  it.each(surfaces)('$name closes on Escape', async ({ ui, trigger }) => {
    renderWithProviders(ui);
    fireEvent.click(trigger());
    await waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => {
      expect(panel()).toBeNull();
    });
  });

  it('the save-view panel holds the view-name field and its two actions', async () => {
    const onSaveView = vi.fn();
    renderWithProviders(
      <DataTableToolbar
        onSaveView={onSaveView}
        onLoadView={vi.fn()}
        views={[]}
        enableViews
        showViewSelector
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }));
    await waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSaveView).toHaveBeenCalledWith('Mine');
    await waitFor(() => {
      expect(panel()).toBeNull();
    });
  });
});

function componentSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return componentSources(path);
    }
    return /\.tsx?$/.test(entry) && !/\.(spec|stories)\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('no Tamagui Popover in the table (MPO-221)', () => {
  it('no component source imports Popover from tamagui', () => {
    const offenders = componentSources(__dirname).filter((file) =>
      /import\s*{[^}]*\bPopover\b[^}]*}\s*from\s*["']tamagui["']/.test(readFileSync(file, 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });

  it('no component source mounts the components PopoverContent', () => {
    const offenders = componentSources(__dirname).filter((file) =>
      /\bPopoverContent\b/.test(readFileSync(file, 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });
});

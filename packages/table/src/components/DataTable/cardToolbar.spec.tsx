import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, FilterableField } from '../../types';
import { DataTableCardToolbar, DataTableToolbar } from '../DataTableToolbar';

import { DataTableCardSortControl } from './DataTableCardControls';
import { useDataTableState } from './DataTableStateContext';

import { DataTable } from './index';

const filings = [
  { id: 'a', form: 'Alpha', entity: 'personal', year: 2023 },
  { id: 'b', form: 'Beta', entity: 'business', year: 2024 },
  { id: 'c', form: 'Gamma', entity: 'personal', year: 2023 },
];
const columns: DataTableColumn<(typeof filings)[number]>[] = [
  { accessorKey: 'form', header: 'Form' },
  { accessorKey: 'entity', header: 'Entity' },
];
const filterableFields: FilterableField[] = [{ id: 'year', label: 'Year', type: 'number' }];

function Cards(props: Record<string, any>) {
  return (
    <DataTable
      data={filings}
      columns={columns}
      filterableFields={filterableFields}
      layout="cards"
      enableGlobalSearch={false}
      onStateChange={vi.fn()}
      {...props}
    />
  );
}

function cardTitles(container: HTMLElement) {
  return [...container.querySelectorAll('[data-card-slot="title"]')].map((el) => el.textContent);
}

function AllCardActionsToolbar(props: Record<string, any>) {
  const { table } = useDataTableState()!;
  return (
    <DataTableCardToolbar
      {...props}
      enableExport
      enableViews
      isFetching
      customActions={
        <DataTableCardSortControl
          table={table}
          contained
        />
      }
    />
  );
}

describe('default card toolbar', () => {
  it('owns Filter and Sort in one primary row with no duplicate controls', () => {
    const { container } = renderWithProviders(<Cards />);
    const toolbar = screen.getByRole('toolbar', { name: 'Table toolbar' });
    expect(screen.getAllByRole('toolbar')).toHaveLength(1);
    const primary = container.querySelector<HTMLElement>('[data-table-card-primary]')!;
    expect(toolbar.contains(primary)).toBe(true);
    expect(primary.contains(screen.getByRole('button', { name: 'Filter' }))).toBe(true);
    expect(primary.contains(screen.getByLabelText('Sort rows'))).toBe(true);
    expect(screen.queryByText('Add Filter')).toBeNull();
  });

  it('keeps search and secondary view/fetching controls outside the primary pair', () => {
    const { container } = renderWithProviders(
      <Cards
        enableGlobalSearch
        enableViews
        isFetching
      />,
    );
    const primary = container.querySelector<HTMLElement>('[data-table-card-primary]')!;
    const secondary = container.querySelector<HTMLElement>('[data-table-card-secondary]')!;
    expect(primary).not.toBeNull();
    expect(secondary).not.toBeNull();
    expect(primary.contains(screen.getByLabelText('Search table data'))).toBe(false);
    expect(secondary.contains(screen.getByLabelText('Save view'))).toBe(true);
    expect(secondary.querySelector('[data-table-fetching]')).not.toBeNull();
    expect(primary.contains(secondary)).toBe(false);
  });

  it('keeps a sort-only toolbar when search, filtering and views are all off', () => {
    renderWithProviders(
      <Cards
        enableFiltering={false}
        enableViews={false}
      />,
    );
    const toolbar = screen.getByRole('toolbar', { name: 'Table toolbar' });
    expect(within(toolbar).getByLabelText('Sort rows')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Filter' })).toBeNull();
  });

  it('does not create an empty toolbar for unsortable columns', () => {
    renderWithProviders(
      <Cards
        enableFiltering={false}
        columns={columns.map((column) => ({ ...column, enableSorting: false }))}
      />,
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('exposes the full active sorting identity without replacing the button label recipe', () => {
    const longHeader = 'Form with a deliberately long distinguishing classification suffix';
    renderWithProviders(
      <Cards
        columns={[{ accessorKey: 'form', header: longHeader }]}
        initialState={{ sorting: [{ id: 'form', desc: true }] }}
      />,
    );
    const trigger = screen.getByLabelText('Sort rows');
    expect(trigger.getAttribute('aria-description')).toBe(`${longHeader} ↓`);
    expect(trigger.textContent).toContain(`${longHeader} ↓`);
  });

  it('retains hidden Year filtering, chip edit and removal in readOnly cards', async () => {
    const { container } = renderWithProviders(<Cards readOnly />);
    expect(screen.queryByText('Add Filter')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Year' }));
    fireEvent.change(await screen.findByPlaceholderText('Enter value...'), {
      target: { value: '2023' },
    });
    await waitFor(() => {
      expect(cardTitles(container)).toEqual(['Alpha', 'Gamma']);
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Enter value...')).toBeNull();
    });
    fireEvent.click(await screen.findByRole('button', { name: /Edit filter.*Year/ }));
    const value = await screen.findByPlaceholderText('Enter value...');
    expect((value as HTMLInputElement).value).toBe('2023');
    fireEvent.change(value, { target: { value: '2024' } });
    await waitFor(() => {
      expect(cardTitles(container)).toEqual(['Beta']);
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Enter value...')).toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(cardTitles(container)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });
  });

  it('keeps the custom-toolbar fallback and clears its active filter', async () => {
    const { container } = renderWithProviders(
      <Cards
        renderToolbar={() => <div>Custom actions</div>}
        initialState={{
          filters: [{ id: 'f', columnId: 'form', value: { operator: 'contains', value: 'Alpha' } }],
        }}
      />,
    );
    expect(screen.getByText('Custom actions')).toBeTruthy();
    const fallback = screen.getByRole('toolbar', { name: 'Card list controls' });
    expect(within(fallback).getByRole('button', { name: /Add Filter/ })).toBeTruthy();
    expect(cardTitles(container)).toEqual(['Alpha']);
    fireEvent.click(within(fallback).getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      expect(cardTitles(container)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });
    fireEvent.click(within(fallback).getByRole('button', { name: 'Add Filter' }));
    await expect(screen.findByText('Select column')).resolves.toBeTruthy();
  });

  it('leaves an explicitly supplied canonical custom toolbar intact', () => {
    renderWithProviders(<Cards renderToolbar={(props: any) => <DataTableToolbar {...props} />} />);
    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Filter' })).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: 'Card list controls' })).toBeTruthy();
  });

  it('partitions actual export, long saved view, save and fetching from Filter and Sort', () => {
    const name = 'Saved view with a deliberately long distinguishing classification suffix';
    const { container } = renderWithProviders(
      <Cards
        enableGlobalSearch
        initialState={{
          activeViewId: 'long',
          views: [
            {
              id: 'long',
              name,
              columns: {},
              filters: [],
              sorting: [],
              pagination: { pageIndex: 0, pageSize: 10 },
            },
          ],
        }}
        renderToolbar={(props: any) => <AllCardActionsToolbar {...props} />}
      />,
    );
    const primary = container.querySelector<HTMLElement>('[data-table-card-primary]')!;
    const secondary = container.querySelector<HTMLElement>('[data-table-card-secondary]')!;
    expect(within(primary).getByLabelText('Sort rows')).toBeTruthy();
    expect(within(primary).getByRole('button', { name: 'Filter' })).toBeTruthy();
    expect(within(secondary).getByRole('button', { name: /Export as CSV/ })).toBeTruthy();
    expect(within(secondary).getByLabelText('Saved views').textContent).toContain(name);
    expect(within(secondary).getByLabelText('Save view')).toBeTruthy();
    expect(secondary.querySelector('[data-table-fetching]')).not.toBeNull();
    expect(within(primary).queryByLabelText('Saved views')).toBeNull();
    const sort = primary.querySelector('[data-table-card-sort]')!;
    expect(sort.contains(within(primary).getByLabelText('Sort rows'))).toBe(true);
  });

  it('retains hidden filters and sort order when cards change to grid and back', () => {
    const initialState = {
      filters: [{ id: 'year', columnId: 'year', value: { operator: 'is', value: '2023' } }],
      sorting: [{ id: 'form', desc: true }],
    };
    const { container, rerender } = renderWithProviders(<Cards initialState={initialState} />);
    expect(cardTitles(container)).toEqual(['Gamma', 'Alpha']);
    rerender(
      <Cards
        initialState={initialState}
        layout="table"
      />,
    );
    expect(cardTitles(container)).toEqual([]);
    expect(screen.queryByLabelText('Sort rows')).toBeNull();
    expect(screen.getByText('Gamma')).toBeTruthy();
    expect(screen.queryByText('Beta')).toBeNull();
    rerender(<Cards initialState={initialState} />);
    expect(cardTitles(container)).toEqual(['Gamma', 'Alpha']);
    expect(screen.getByLabelText('Sort rows').getAttribute('aria-description')).toBe('Form ↓');
    expect(screen.getAllByRole('button', { name: 'Filter' })).toHaveLength(1);
    expect(screen.queryByPlaceholderText('Enter value...')).toBeNull();
  });

  it('clears hidden and visible advanced filters together without clearing plain column filters', async () => {
    const { container } = renderWithProviders(
      <Cards
        initialState={{
          filters: [
            { id: 'year', columnId: 'year', value: { operator: 'is', value: '2023' } },
            { id: 'form', columnId: 'form', value: { operator: 'contains', value: 'Alpha' } },
          ],
          columnFilters: [{ id: 'entity', value: 'personal' }],
        }}
      />,
    );
    expect(cardTitles(container)).toEqual(['Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => {
      expect(cardTitles(container)).toEqual(['Alpha', 'Gamma']);
    });
    expect(screen.queryByRole('button', { name: /Edit filter/ })).toBeNull();
  });

  it('leaves the public standalone toolbar in its original layout', () => {
    const { container } = renderWithProviders(
      <DataTableToolbar
        enableGlobalSearch
        enableViews
        customActions={<button type="button">Custom action</button>}
      />,
    );
    expect(container.querySelector<HTMLElement>('[data-table-card-primary]')).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-table-card-secondary]')).toBeNull();
    expect(screen.getByLabelText('Search table data')).toBeTruthy();
    expect(screen.getByText('Custom action')).toBeTruthy();
  });
});

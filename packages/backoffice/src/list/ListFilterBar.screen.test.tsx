// ListFilterBar as the list's one filter authority (MPO-414): what each
// control writes through onFiltersChange / onSortChange, the chips row, the
// liked-by heart, the saved-filter source and the compact collapse.
import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';
import type { FrappeFilters } from '../shared/types';
import type { DoctypeMeta } from '../shared/use-doctype-meta';

import { ListFilterBar } from './ListFilterBar';
import type { ListFilterBarProps } from './ListFilterBar';

const todoMeta: DoctypeMeta = {
  name: 'ToDo',
  sort_field: 'modified',
  sort_order: 'DESC',
  fields: [
    {
      fieldname: 'status',
      label: 'Status',
      fieldtype: 'Select',
      options: 'Open\nClosed',
      in_standard_filter: 1,
    },
    { fieldname: 'sender', label: 'Sender', fieldtype: 'Data', in_standard_filter: 1 },
    { fieldname: 'priority', label: 'Priority', fieldtype: 'Select', options: 'High\nLow' },
  ],
};

let run = 0;
let savedFiltersRead: Promise<URL>;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- fixture JSON bodies are arbitrary
const json = (body: unknown, status = 200) => Response.json(body, { status });

type BarProps = Partial<ListFilterBarProps>;

const renderBar = (props: BarProps = {}) => {
  const onFiltersChange = vi.fn<(filters: FrappeFilters) => void>();
  const onSortChange = vi.fn<(field: string, order: 'asc' | 'desc') => void>();
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://list-filter-bar-${run}.spec.test` }}
      navigation={createMemoryNavigator('/backoffice/ToDo')}>
      <ListFilterBar
        doctype="ToDo"
        meta={todoMeta}
        filters={[]}
        onFiltersChange={onFiltersChange}
        onSortChange={onSortChange}
        {...props}
      />
    </BackofficeProvider>,
  );
  return { onFiltersChange, onSortChange };
};

const StatefulBar = ({ onChange }: { onChange: (filters: FrappeFilters) => void }) => {
  const [filters, setFilters] = useState<FrappeFilters>([]);
  return (
    <ListFilterBar
      doctype="ToDo"
      meta={todoMeta}
      filters={filters}
      onFiltersChange={(next) => {
        setFilters(next);
        onChange(next);
      }}
    />
  );
};

describe(ListFilterBar, () => {
  beforeEach(() => {
    run += 1;
    const savedFiltersDeferred = Promise.withResolvers<URL>();
    savedFiltersRead = savedFiltersDeferred.promise;
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname.endsWith('frappe.client.get_list') && url.searchParams.get('doctype') === 'List Filter') {
        savedFiltersDeferred.resolve(url);
      }
      if (url.pathname.endsWith('frappe.auth.get_logged_user')) {
        return json({ message: 'jane@example.com' });
      }
      return json({ data: [], message: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('commits a text standard filter as a like tuple once typing pauses', async () => {
    const onChange = vi.fn<(filters: FrappeFilters) => void>();
    renderWithProviders(
      <BackofficeProvider
        frappe={{ baseURL: `https://list-filter-bar-${run}.spec.test` }}
        navigation={createMemoryNavigator('/backoffice/ToDo')}>
        <StatefulBar onChange={onChange} />
      </BackofficeProvider>,
    );
    const sender = screen.getByLabelText('Sender');
    const input = (sender instanceof HTMLInputElement ? sender : sender.querySelector('input'))!;
    fireEvent.change(input, { target: { value: 'bob' } });
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([['sender', 'like', '%bob%']]);
    });
    await expect(screen.findByText('Sender like %bob%')).resolves.toBeTruthy();
  });

  it('shows each applied filter as a chip that removes its own tuple, or all of them', () => {
    const filters: FrappeFilters = [
      ['status', '=', 'Open'],
      ['priority', 'in', ['High', 'Low']],
    ];
    const { onFiltersChange } = renderBar({ filters });
    expect(screen.getByText('Status = Open')).toBeTruthy();
    expect(screen.getByText('Priority in High, Low')).toBeTruthy();
    expect(screen.getByRole('button', { name: /save filter/iu })).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText('Remove')[1]);
    expect(onFiltersChange).toHaveBeenLastCalledWith([['status', '=', 'Open']]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onFiltersChange).toHaveBeenLastCalledWith([]);
  });

  it('leaves the chips to the host when showChips is false', () => {
    renderBar({ filters: [['status', '=', 'Open']], showChips: false });
    expect(screen.queryByText('Status = Open')).toBeNull();
  });

  it("sorts on meta's default field and flips its order", () => {
    const { onSortChange } = renderBar();
    expect(screen.getByRole('button', { name: 'Sort' }).textContent).toContain('Last Updated On');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sort order (Descending)' }));
    expect(onSortChange).toHaveBeenCalledWith('modified', 'asc');
  });

  it('toggles the liked-by-me filter from the heart', () => {
    const liked: FrappeFilters = [['_liked_by', 'like', '%jane@example.com%']];
    const { onFiltersChange } = renderBar({ likedByUser: 'jane@example.com' });
    const heart = screen.getByRole('button', { name: 'Liked by me' });
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(heart);
    expect(onFiltersChange).toHaveBeenCalledWith(liked);
  });

  it("reads the doctype's saved filters and offers Save Filter only while filters apply", async () => {
    renderBar();
    const read = await savedFiltersRead;
    expect(read.searchParams.get('filters')).toBe(JSON.stringify([['reference_doctype', '=', 'ToDo']]));
    expect(screen.queryByRole('button', { name: /save filter/iu })).toBeNull();
  });

  it('collapses behind one counted Filter button on compact viewports', async () => {
    renderBar({ compact: true, filters: [['status', '=', 'Open']] });
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Filter' }).textContent).toContain('Filter (1)');
    expect(screen.queryByText('Status = Open')).toBeNull();
  });
});

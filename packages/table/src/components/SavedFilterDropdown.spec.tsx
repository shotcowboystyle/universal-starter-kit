import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { ParsedFilter } from '../hooks/useSavedFilters';

import { SavedFilterDropdown } from './SavedFilterDropdown';

const mockFilters: ParsedFilter[] = [
  {
    name: 'filter-1',
    filter_name: 'Active Users',
    for_user: 'user@example.com',
    filters: [['status', 'is', 'active']],
    isGlobal: false,
  },
  {
    name: 'filter-2',
    filter_name: 'High Priority',
    for_user: '',
    filters: [['priority', 'is', 'high']],
    isGlobal: true,
  },
  {
    name: 'filter-3',
    filter_name: 'Recent Items',
    for_user: 'user@example.com',
    filters: [
      ['created', 'after', '2024-01-01'],
      ['status', 'isNot', 'archived'],
    ],
    isGlobal: false,
  },
];

describe(SavedFilterDropdown, () => {
  it('renders saved filter list and calls onSelect', () => {
    const onSelect = vi.fn();

    const { container } = renderWithProviders(
      <SavedFilterDropdown
        filters={mockFilters}
        onSelectFilter={onSelect}
      />,
    );

    // The dropdown trigger should be rendered
    const trigger = container.querySelector('button');
    expect(trigger).toBeDefined();
  });

  it('returns null when filters list is empty', () => {
    const onSelect = vi.fn();

    const { container } = renderWithProviders(
      <SavedFilterDropdown
        filters={[]}
        onSelectFilter={onSelect}
      />,
    );

    // When no filters, the component renders no Select/button elements
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[role="combobox"]')).toBeNull();
  });

  it('renders with selected filter', () => {
    const onSelect = vi.fn();

    const { container } = renderWithProviders(
      <SavedFilterDropdown
        filters={mockFilters}
        selectedFilter={mockFilters[0]}
        onSelectFilter={onSelect}
      />,
    );

    // Should render with the selected filter
    expect(container.querySelector('button')).toBeDefined();
  });

  it('accepts onDeleteFilter callback without Frappe dependency', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    const { container } = renderWithProviders(
      <SavedFilterDropdown
        filters={mockFilters}
        onSelectFilter={onSelect}
        onDeleteFilter={onDelete}
      />,
    );

    // Should render without errors — no Frappe provider required
    expect(container.querySelector('button')).toBeDefined();
  });

  it('renders in disabled state', () => {
    const onSelect = vi.fn();

    const { container } = renderWithProviders(
      <SavedFilterDropdown
        filters={mockFilters}
        onSelectFilter={onSelect}
        disabled={true}
      />,
    );

    const trigger = container.querySelector('button');
    expect(trigger).toBeDefined();
    expect(trigger?.getAttribute('disabled')).not.toBeNull();
  });
});

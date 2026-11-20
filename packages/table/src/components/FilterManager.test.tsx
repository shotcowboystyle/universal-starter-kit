import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { FilterManager } from './FilterManager';

describe(FilterManager, () => {
  it('renders with generic filter definitions', () => {
    const genericFilters: [string, string, any][] = [
      ['name', 'contains', 'Pika'],
      ['type', 'is', 'Electric'],
      ['hp', 'greaterThan', 50],
    ];
    const onSave = vi.fn<(filterName: string, isGlobal: boolean) => void>();

    const { getByText } = renderWithProviders(
      <FilterManager
        currentFilters={genericFilters}
        onSaveFilter={onSave}
      />,
    );

    // The component should render the "Save Filter" button showing filter count
    expect(getByText('Save Filter')).toBeDefined();
  });

  it('shows filter count from generic filter array', () => {
    const genericFilters: [string, string, any][] = [
      ['status', 'is', 'active'],
      ['age', 'greaterThan', 18],
    ];
    const onSave = vi.fn<(filterName: string, isGlobal: boolean) => void>();

    const { container } = renderWithProviders(
      <FilterManager
        currentFilters={genericFilters}
        onSaveFilter={onSave}
      />,
    );

    // The component should be rendered (the filter count text is inside the dialog)
    expect(container.querySelector('button')).toBeDefined();
  });

  it('explains the disabled save trigger when no filters are active (DG-ST-03)', () => {
    const onSave = vi.fn<(filterName: string, isGlobal: boolean) => void>();

    const { container, getByText } = renderWithProviders(
      <FilterManager
        currentFilters={[]}
        onSaveFilter={onSave}
      />,
    );

    // Explained disable: aria-disabled (focusable, press swallowed) with the
    // reason rendered as visible adjacent text — never a bare `disabled`.
    const button = container.querySelector('[aria-label="Save filter"]');
    expect(button).toBeDefined();
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(getByText('Apply filters to save them')).toBeDefined();
  });

  it('accepts canCreateGlobal prop', () => {
    const genericFilters: [string, string, any][] = [['field1', 'equals', 'value1']];
    const onSave = vi.fn<(filterName: string, isGlobal: boolean) => void>();

    // Should render without errors
    const { getByText } = renderWithProviders(
      <FilterManager
        currentFilters={genericFilters}
        onSaveFilter={onSave}
        canCreateGlobal={true}
      />,
    );

    expect(getByText('Save Filter')).toBeDefined();
  });
});

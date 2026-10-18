import '@testing-library/jest-dom';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTableViewOptions } from './index';

// Test columns
const mockColumns = [
  {
    id: 'name',
    label: 'Name',
    visible: true,
    order: 0,
    canHide: true,
    canResize: true,
    canReorder: true,
  },
  {
    id: 'email',
    label: 'Email',
    visible: true,
    order: 1,
    canHide: true,
    canResize: true,
    canReorder: true,
  },
  {
    id: 'status',
    label: 'Status',
    visible: true,
    order: 2,
    canHide: true,
    canResize: true,
    canReorder: true,
  },
  {
    id: 'createdAt',
    label: 'Created At',
    visible: true,
    order: 3,
    canHide: true,
    canResize: true,
    canReorder: true,
  },
];

describe(DataTableViewOptions, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders view options button', () => {
    renderWithProviders(
      <DataTableViewOptions
        columns={mockColumns}
        onColumnVisibilityChange={vi.fn<(columnId: string, visible: boolean) => void>()}
        onColumnOrderChange={vi.fn<(columnOrder: string[]) => void>()}
        onColumnSizingChange={vi.fn<(columnSizing: Record<string, number>) => void>()}
        onSaveView={vi.fn<(name: string) => void>()}
        onLoadView={vi.fn<(viewId: string) => void>()}
        onResetToDefault={vi.fn<() => void>()}
        compact={true}
      />,
    );

    expect(screen.getByText('View')).toBeInTheDocument();
  });

  it('opens popover when clicked', async () => {
    renderWithProviders(
      <DataTableViewOptions
        columns={mockColumns}
        onColumnVisibilityChange={vi.fn<(columnId: string, visible: boolean) => void>()}
        onColumnOrderChange={vi.fn<(columnOrder: string[]) => void>()}
        onColumnSizingChange={vi.fn<(columnSizing: Record<string, number>) => void>()}
        onSaveView={vi.fn<(name: string) => void>()}
        onLoadView={vi.fn<(viewId: string) => void>()}
        onResetToDefault={vi.fn<() => void>()}
        compact={true}
      />,
    );

    const button = screen.getByText('View');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Column Visibility')).toBeInTheDocument();
    });
  });

  it('displays column visibility toggles', async () => {
    renderWithProviders(
      <DataTableViewOptions
        columns={mockColumns}
        onColumnVisibilityChange={vi.fn<(columnId: string, visible: boolean) => void>()}
        onColumnOrderChange={vi.fn<(columnOrder: string[]) => void>()}
        onColumnSizingChange={vi.fn<(columnSizing: Record<string, number>) => void>()}
        onSaveView={vi.fn<(name: string) => void>()}
        onLoadView={vi.fn<(viewId: string) => void>()}
        onResetToDefault={vi.fn<() => void>()}
        compact={true}
      />,
    );

    fireEvent.click(screen.getByText('View'));

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  it('calls onColumnVisibilityChange when column is toggled', async () => {
    const mockOnChange = vi.fn<(columnId: string, visible: boolean) => void>();

    renderWithProviders(
      <DataTableViewOptions
        columns={mockColumns}
        onColumnVisibilityChange={mockOnChange}
        onColumnOrderChange={vi.fn<(columnOrder: string[]) => void>()}
        onColumnSizingChange={vi.fn<(columnSizing: Record<string, number>) => void>()}
        onSaveView={vi.fn<(name: string) => void>()}
        onLoadView={vi.fn<(viewId: string) => void>()}
        onResetToDefault={vi.fn<() => void>()}
        compact={true}
      />,
    );

    fireEvent.click(screen.getByText('View'));

    await waitFor(() => {
      expect(screen.getByText('Column Visibility')).toBeInTheDocument();
    });

    // Compact mode renders the canonical DropdownMenu checkbox rows
    const checkboxItems = screen.getAllByRole('menuitemcheckbox');
    expect(checkboxItems.length).toBeGreaterThan(0);

    // Click the first checkbox row (Name)
    fireEvent.click(checkboxItems[0]);

    expect(mockOnChange).toHaveBeenCalledWith();
  });

  it('handles empty columns array', () => {
    renderWithProviders(
      <DataTableViewOptions
        columns={[]}
        onColumnVisibilityChange={vi.fn<(columnId: string, visible: boolean) => void>()}
        onColumnOrderChange={vi.fn<(columnOrder: string[]) => void>()}
        onColumnSizingChange={vi.fn<(columnSizing: Record<string, number>) => void>()}
        onSaveView={vi.fn<(name: string) => void>()}
        onLoadView={vi.fn<(viewId: string) => void>()}
        onResetToDefault={vi.fn<() => void>()}
        compact={true}
      />,
    );

    expect(screen.getByText('View')).toBeInTheDocument();
  });
});

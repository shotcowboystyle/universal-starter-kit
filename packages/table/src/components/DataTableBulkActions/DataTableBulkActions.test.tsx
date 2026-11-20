import { renderWithProviders } from '@repo/test-utils';
import { getCoreRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { SelectAllScope } from '../../types';
import { DataTableStateContext } from '../DataTable/data-table-state-context';

import { DataTableBulkActions, useRowSelection } from './index';
import type { BulkAction } from './index';

// Test data type
interface TestItem {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

// Mock bulk actions
const mockActions: BulkAction<TestItem>[] = [
  {
    id: 'delete',
    label: 'Delete',
    variant: 'destructive',
    requiresConfirmation: true,
    onExecute: vi.fn<(items: TestItem[], clearSelection: () => void) => void>(),
  },
  {
    id: 'export',
    label: 'Export',
    onExecute: vi.fn<(items: TestItem[], clearSelection: () => void) => void>(),
  },
  {
    id: 'duplicate',
    label: 'Duplicate',
    onExecute: vi.fn<(items: TestItem[], clearSelection: () => void) => void>(),
  },
];

// Test data
const mockData: TestItem[] = [
  { id: '1', name: 'Item 1', status: 'active' },
  { id: '2', name: 'Item 2', status: 'inactive' },
  { id: '3', name: 'Item 3', status: 'active' },
];

describe(DataTableBulkActions, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no items are selected', () => {
    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[]}
        onClearSelection={vi.fn<() => void>()}
        actions={mockActions}
      />,
    );

    expect(screen.queryByText(/selected/u)).not.toBeInTheDocument();
  });

  it('renders selection count and action buttons when items are selected', () => {
    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={mockActions}
      />,
    );

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
  });

  it('hides selection count when showSelectionCount is false', () => {
    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={mockActions}
        showSelectionCount={false}
      />,
    );

    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
  });

  it('calls onClearSelection when clear button is clicked', () => {
    const mockClearSelection = vi.fn<() => void>();

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={mockClearSelection}
        actions={mockActions}
      />,
    );

    fireEvent.click(screen.getByText('Clear'));
    expect(mockClearSelection).toHaveBeenCalledOnce();
  });

  it('executes action immediately when requiresConfirmation is false', async () => {
    const mockExecute = vi.fn<(items: TestItem[], clearSelection: () => void) => void>();
    const exportAction = mockActions.find((a) => a.id === 'export')!;
    exportAction.onExecute = mockExecute;

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[exportAction]}
      />,
    );

    fireEvent.click(screen.getByText('Export'));

    await waitFor(() => {
      expect(mockExecute).toHaveBeenCalledWith([mockData[0]], expect.any(Function));
    });
  });

  it('shows confirmation dialog when action requires confirmation', () => {
    const deleteAction = mockActions.find((a) => a.id === 'delete')!;

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0], mockData[1]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[deleteAction]}
      />,
    );

    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete 2 items?')).toBeInTheDocument();
  });

  it('executes action after confirmation', async () => {
    const mockExecute = vi.fn<(items: TestItem[], clearSelection: () => void) => void>();
    const deleteAction = mockActions.find((a) => a.id === 'delete')!;
    deleteAction.onExecute = mockExecute;

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[deleteAction]}
      />,
    );

    // Click the action button first
    fireEvent.click(screen.getByText('Delete'));

    // Click the confirmation button (there will be two "Delete" buttons now)
    const deleteButtons = screen.getAllByText('Delete');
    // Click the confirmation button
    fireEvent.click(deleteButtons[1]);

    await waitFor(() => {
      expect(mockExecute).toHaveBeenCalledWith([mockData[0]], expect.any(Function));
    });
  });

  it('routes confirmation through the canonical alertdialog gate (LC-16)', () => {
    const deleteAction = mockActions.find((a) => a.id === 'delete')!;

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[deleteAction]}
      />,
    );

    fireEvent.click(screen.getByText('Delete'));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    // Destructive tone flows into the canonical ConfirmDialog.
    expect(dialog).toHaveAttribute('data-tone', 'destructive');
  });

  it('gates destructive actions even without requiresConfirmation (DG-DX-01 bulk severity)', async () => {
    const mockExecute = vi.fn<(items: TestItem[], clearSelection: () => void) => void>();
    const destructiveNoFlag: BulkAction<TestItem> = {
      id: 'purge',
      label: 'Purge',
      variant: 'destructive',
      onExecute: mockExecute,
    };

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[destructiveNoFlag]}
      />,
    );

    fireEvent.click(screen.getByText('Purge'));

    // Not executed yet — the confirm gate intercepts.
    expect(mockExecute).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    const purgeButtons = screen.getAllByText('Purge');
    fireEvent.click(purgeButtons.at(-1)!);

    await waitFor(() => {
      expect(mockExecute).toHaveBeenCalledWith([mockData[0]], expect.any(Function));
    });
  });

  it('cancel dismisses the confirm dialog without executing', async () => {
    const mockExecute = vi.fn<(items: TestItem[], clearSelection: () => void) => void>();
    const deleteAction = { ...mockActions[0], onExecute: mockExecute };

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[deleteAction]}
      />,
    );

    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('shows overflow menu when there are more actions than maxVisibleActions', () => {
    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={mockActions}
        maxVisibleActions={2}
      />,
    );

    // Should show first 2 actions and overflow menu
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.queryByText('Duplicate')).not.toBeInTheDocument();
  });

  it('disables button when action is disabled', () => {
    const disabledAction = { ...mockActions[0], disabled: true };

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[disabledAction]}
      />,
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('explains disabled actions via disabledReason (DG-ST-03)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const explainedAction: BulkAction<TestItem> = {
      id: 'export',
      label: 'Export',
      onExecute: vi.fn<(items: TestItem[], clearSelection: () => void) => void>(),
      disabled: true,
      disabledReason: 'Exports cap at 100 rows',
    };

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[explainedAction]}
      />,
    );

    expect(screen.getByText('Exports cap at 100 rows')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Export' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
    warnSpy.mockRestore();
  });

  it('shows busy state (spinner, not bare-disabled) when action is executing', () => {
    const mockExecute = vi.fn<(items: TestItem[], clearSelection: () => void) => Promise<void>>(async () => {
      // oxlint-disable-next-line promise/avoid-new -- wrapping callback-based setTimeout to keep the action pending
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
    });
    const exportAction = mockActions.find((a) => a.id === 'export')!;
    exportAction.onExecute = mockExecute;

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[exportAction]}
      />,
    );

    fireEvent.click(screen.getByText('Export'));
    // Button switches to the loading affordance: label replaced by the
    // spinner and the control reads disabled while executing.
    expect(screen.queryByText('Export')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-disabled="true"]')).toBeTruthy();
  });

  it('handles action execution errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockExecute = vi.fn<(items: TestItem[], clearSelection: () => void) => Promise<void>>(async () => {
      throw new Error('Test error');
    });
    const exportAction = mockActions.find((a) => a.id === 'export')!;
    exportAction.onExecute = mockExecute;

    renderWithProviders(
      <DataTableBulkActions
        selectedItems={[mockData[0]]}
        onClearSelection={vi.fn<() => void>()}
        actions={[exportAction]}
      />,
    );

    fireEvent.click(screen.getByText('Export'));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Bulk action failed:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });
});

// ---- Context-integration harness (compound DataTable selection model) ----

interface HarnessRow {
  id: string;
  name: string;
  status: string;
}

const harnessRows: HarnessRow[] = [
  { id: 'a', name: 'Alpha', status: 'ready' },
  { id: 'b', name: 'Bravo', status: 'ready' },
  { id: 'c', name: 'Charlie', status: 'ready' },
  { id: 'd', name: 'Delta', status: 'blocked' },
];

const harnessColumns = [
  { id: 'name', accessorKey: 'name', header: 'Name' },
  { id: 'status', accessorKey: 'status', header: 'Status' },
];

const NO_SELECTION: Record<string, boolean> = {};
const NO_FILTERS: { id: string; value: any }[] = [];

const SelectionHarness = ({
  initialSelection = NO_SELECTION,
  columnFilters = NO_FILTERS,
  pageSize = 2,
  selectAllScope = 'page' as SelectAllScope,
  actions,
}: {
  initialSelection?: Record<string, boolean>;
  columnFilters?: { id: string; value: any }[];
  pageSize?: number;
  selectAllScope?: SelectAllScope;
  actions: BulkAction<HarnessRow>[];
}) => {
  const [rowSelection, setRowSelection] = React.useState(initialSelection);
  const table = useReactTable({
    data: harnessRows,
    columns: harnessColumns as any,
    state: {
      rowSelection,
      columnFilters,
      pagination: { pageIndex: 0, pageSize },
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
  });

  const ctxValue = React.useMemo(
    () =>
      ({
        table,
        state: {} as any,
        actions: {} as any,
        computed: {} as any,
        selectAllScope,
      }) as any,
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- table instance is stable; selection/filter changes must still publish a new context value
    [table, rowSelection, columnFilters, selectAllScope],
  );

  return (
    <DataTableStateContext.Provider value={ctxValue}>
      <DataTableBulkActions actions={actions} />
    </DataTableStateContext.Provider>
  );
};

describe('DataTableBulkActions selection contract (context mode)', () => {
  it('actions receive exactly the selected originals', async () => {
    const received: HarnessRow[][] = [];
    const actions: BulkAction<HarnessRow>[] = [
      {
        id: 'tag',
        label: 'Tag',
        onExecute: (items) => {
          received.push(items);
        },
      },
    ];

    renderWithProviders(
      <SelectionHarness
        initialSelection={{ a: true, c: true }}
        actions={actions}
      />,
    );

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tag'));

    await waitFor(() => {
      expect(received).toHaveLength(1);
    });
    expect(received[0].map((r) => r.id)).toStrictEqual(['a', 'c']);
  });

  it("page scope: full page selected offers 'Select all N matching' with the filtered count", () => {
    renderWithProviders(
      <SelectionHarness
        initialSelection={{ a: true, b: true }}
        actions={[
          { id: 'x', label: 'X', onExecute: vi.fn<(items: HarnessRow[], clearSelection: () => void) => void>() },
        ]}
      />,
    );

    // Page (a, b) fully selected; 4 rows match (no filter) → offer scope switch.
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByText('Select all 4')).toBeInTheDocument();
  });

  it('expanding to all-matching keeps the count honest', async () => {
    renderWithProviders(
      <SelectionHarness
        initialSelection={{ a: true, b: true }}
        actions={[
          { id: 'x', label: 'X', onExecute: vi.fn<(items: HarnessRow[], clearSelection: () => void) => void>() },
        ]}
      />,
    );

    fireEvent.click(screen.getByText('Select all 4'));
    await expect(screen.findByText('4 selected')).resolves.toBeInTheDocument();
    expect(screen.queryByText(/Select all \d/u)).toBeNull();
  });

  it('still offers the scope switch when a stale (filtered-out) selection inflates the count', () => {
    // Filter shows a, b, c (page = a, b). Row d is selected but filtered out.
    // selectedItems.length (3: a, b, d) equals matchingCount (3) even though
    // matching row c is NOT selected — the switch must still appear.
    renderWithProviders(
      <SelectionHarness
        initialSelection={{ a: true, b: true, d: true }}
        columnFilters={[{ id: 'status', value: 'ready' }]}
        actions={[
          { id: 'x', label: 'X', onExecute: vi.fn<(items: HarnessRow[], clearSelection: () => void) => void>() },
        ]}
      />,
    );

    expect(screen.getByText('3 selected (+1 filtered out)')).toBeInTheDocument();
    expect(screen.getByText('Select all 3')).toBeInTheDocument();
  });

  it('annotates selected rows hidden by a column filter (D-15 ruling)', () => {
    // TanStack's selected row model derives from the CORE model, so selection
    // survives filter changes. Deliberate flip of the old characterization
    // ("2 selected" with 1 invisible): the count keeps the full selection
    // (agency preserved) and annotates the hidden remainder (view honesty).
    renderWithProviders(
      <SelectionHarness
        initialSelection={{ a: true, d: true }}
        columnFilters={[{ id: 'status', value: 'ready' }]}
        actions={[
          { id: 'x', label: 'X', onExecute: vi.fn<(items: HarnessRow[], clearSelection: () => void) => void>() },
        ]}
      />,
    );

    // d is filtered out: still counted, now annotated.
    expect(screen.getByText('2 selected (+1 filtered out)')).toBeInTheDocument();
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('omits the filtered-out annotation when every selected row is visible', () => {
    renderWithProviders(
      <SelectionHarness
        initialSelection={{ a: true, c: true }}
        columnFilters={[{ id: 'status', value: 'ready' }]}
        actions={[
          { id: 'x', label: 'X', onExecute: vi.fn<(items: HarnessRow[], clearSelection: () => void) => void>() },
        ]}
      />,
    );

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.queryByText(/filtered out/u)).not.toBeInTheDocument();
  });
});

const TestComponent = ({ children }: { children: (props: any) => React.ReactNode }) => {
  const selectionProps = useRowSelection({
    data: mockData,
    selectionKey: 'id',
  });

  return <>{children(selectionProps)}</>;
};

describe(useRowSelection, () => {
  it('initializes with empty selection', () => {
    let selectionProps: any;

    renderWithProviders(
      <TestComponent>
        {(props) => {
          selectionProps = props;
          return null;
        }}
      </TestComponent>,
    );

    expect(selectionProps.selectedItems).toStrictEqual([]);
    expect(selectionProps.selectedIds.size).toBe(0);
    expect(selectionProps.isAllSelected).toBe(false);
    expect(selectionProps.isIndeterminate).toBe(false);
  });

  it('toggles item selection', () => {
    let selectionProps: any;

    renderWithProviders(
      <TestComponent>
        {(props) => {
          selectionProps = props;
          return (
            <button
              type="button"
              onClick={() => props.toggleItem(mockData[0])}>
              Toggle
            </button>
          );
        }}
      </TestComponent>,
    );

    fireEvent.click(screen.getByText('Toggle'));

    expect(selectionProps.selectedItems).toStrictEqual([mockData[0]]);
    expect(selectionProps.isSelected(mockData[0])).toBe(true);
    expect(selectionProps.isSelected(mockData[1])).toBe(false);
  });

  it('toggles all items', () => {
    let selectionProps: any;

    renderWithProviders(
      <TestComponent>
        {(props) => {
          selectionProps = props;
          return (
            <button
              type="button"
              onClick={() => props.toggleAll()}>
              Toggle All
            </button>
          );
        }}
      </TestComponent>,
    );

    fireEvent.click(screen.getByText('Toggle All'));

    expect(selectionProps.selectedItems).toStrictEqual(mockData);
    expect(selectionProps.isAllSelected).toBe(true);
    expect(selectionProps.isIndeterminate).toBe(false);
  });

  it('clears selection', () => {
    let selectionProps: any;

    renderWithProviders(
      <TestComponent>
        {(props) => {
          selectionProps = props;
          return (
            <button
              type="button"
              onClick={() => props.clearSelection()}>
              Clear
            </button>
          );
        }}
      </TestComponent>,
    );

    act(() => {
      selectionProps.selectAll();
    });

    expect(selectionProps.selectedItems).toStrictEqual(mockData);

    fireEvent.click(screen.getByText('Clear'));
    expect(selectionProps.selectedItems).toStrictEqual([]);
  });

  it('selects specific items', () => {
    let selectionProps: any;

    renderWithProviders(
      <TestComponent>
        {(props) => {
          selectionProps = props;
          return (
            <button
              type="button"
              onClick={() => props.selectItems([mockData[1]])}>
              Select
            </button>
          );
        }}
      </TestComponent>,
    );

    fireEvent.click(screen.getByText('Select'));

    expect(selectionProps.selectedItems).toStrictEqual([mockData[1]]);
  });

  it('handles indeterminate state', () => {
    let selectionProps: any;

    renderWithProviders(
      <TestComponent>
        {(props) => {
          selectionProps = props;
          return (
            <button
              type="button"
              onClick={() => props.selectItems([mockData[0]])}>
              Select One
            </button>
          );
        }}
      </TestComponent>,
    );

    fireEvent.click(screen.getByText('Select One'));

    expect(selectionProps.isIndeterminate).toBe(true);
    expect(selectionProps.isAllSelected).toBe(false);
  });

  it('calls onSelectionChange callback', () => {
    const mockOnChange = vi.fn<(items: TestItem[]) => void>();

    const TestComponentWithCallback = ({ children }: { children: (props: any) => React.ReactNode }) => {
      const selectionProps = useRowSelection({
        data: mockData,
        selectionKey: 'id',
        onSelectionChange: mockOnChange,
      });

      return <>{children(selectionProps)}</>;
    };

    renderWithProviders(
      <TestComponentWithCallback>
        {(props) => (
          <button
            type="button"
            onClick={() => props.toggleItem(mockData[0])}>
            Toggle
          </button>
        )}
      </TestComponentWithCallback>,
    );

    fireEvent.click(screen.getByText('Toggle'));

    expect(mockOnChange).toHaveBeenCalledWith([mockData[0]]);
  });
});

// Note: createBulkActions has been removed - users should define their own actions

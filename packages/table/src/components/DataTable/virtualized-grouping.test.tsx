/**
 * Grouped rows inside the virtualized body (grouping × virtualization
 * interplay). A TanStack group row must render as a group header with an
 * expand toggle — not fall through renderRowContent as a fake data row.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { createRef } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DataTableVirtualized } from './DataTableVirtualized';

const makeGroupRow = () => ({
  id: 'region:Electronics',
  depth: 0,
  groupingValue: 'Electronics',
  subRows: [{ id: '1' }, { id: '2' }],
  getIsGrouped: () => true,
  getIsExpanded: vi.fn<() => boolean>(() => false),
  toggleExpanded: vi.fn<() => void>(),
});

const makeDataRow = (id: string) => ({
  id,
  depth: 0,
  getIsGrouped: () => false,
  getVisibleCells: () => [],
  original: { id },
});

const baseProps = {
  totalSize: 80,
  bodyScrollRef: createRef<HTMLDivElement>(),
  virtualizationHeight: 200,
  headerGroups: [],
  showRowNumbers: false,
  enableRowExpansion: false,
  showDeleteRow: false,
  readOnly: false,
  enableKeyboardNavigation: false,
  keyboardNav: {},
  getColSizeProps: () => ({}),
  extraColumnsBefore: 0,
  extraColumnsAfter: 0,
  table: {},
};

describe('DataTableVirtualized × grouping', () => {
  it('renders a group header (not data cells) for grouped rows', () => {
    const groupRow = makeGroupRow();
    const renderRowContent = vi.fn<() => ReactNode>(() => <div data-testid="data-cells" />);

    renderWithProviders(
      <DataTableVirtualized
        {...baseProps}
        virtualItems={[{ index: 0, start: 0, size: 40 }]}
        tableRows={[groupRow]}
        renderRowContent={renderRowContent}
      />,
    );

    // Group header shows value + member count; data-cell renderer untouched.
    expect(screen.getByText('Electronics')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(renderRowContent).not.toHaveBeenCalled();

    // Toggle is keyboard-reachable and announces expansion state.
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(groupRow.toggleExpanded).toHaveBeenCalledOnce();

    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(groupRow.toggleExpanded).toHaveBeenCalledTimes(2);
  });

  it('still renders plain data rows through renderRowContent', () => {
    const dataRow = makeDataRow('42');
    const renderRowContent = vi.fn<() => ReactNode>(() => <div data-testid="data-cells" />);

    renderWithProviders(
      <DataTableVirtualized
        {...baseProps}
        virtualItems={[{ index: 0, start: 0, size: 40 }]}
        tableRows={[dataRow]}
        renderRowContent={renderRowContent}
      />,
    );

    // "div" = virtualized cell element: real <td>s are invalid children of
    // the absolutely-positioned div rows (semantics come from role="cell")
    expect(renderRowContent).toHaveBeenCalledWith(dataRow, 0, true, 'div');
    expect(screen.getByTestId('data-cells')).toBeInTheDocument();
  });
});

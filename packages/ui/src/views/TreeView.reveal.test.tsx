import { renderWithProviders } from '@repo/test-utils';
import type { TreeViewProps as PublicTreeViewProps } from '@repo/ui';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { TreeView, type TreeNode, type TreeViewProps } from './TreeView';

const nodes: TreeNode[] = [
  {
    id: 'folders',
    label: 'Folders',
    children: [
      {
        id: 'archive',
        label: 'Archive',
        children: [{ id: 'item', label: 'Item' }],
      },
    ],
  },
  { id: 'other', label: 'Other', children: [{ id: 'other-item', label: 'Other item' }] },
];

afterEach(cleanup);

describe('TreeView public expansion contract', () => {
  it('exposes the agreed reveal request through TreeViewProps', () => {
    expectTypeOf<PublicTreeViewProps>().toEqualTypeOf<TreeViewProps>();
    expectTypeOf<TreeViewProps['revealRequest']>().toEqualTypeOf<{ id: string; requestId: number } | undefined>();
    expectTypeOf<TreeViewProps['onRevealComplete']>().toEqualTypeOf<
      ((request: { id: string; requestId: number }) => void) | undefined
    >();
    expectTypeOf<TreeViewProps['initialScrollOffset']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<TreeViewProps['onScrollOffsetChange']>().toEqualTypeOf<((offset: number) => void) | undefined>();
    expectTypeOf<TreeViewProps['expandedIds']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<TreeViewProps['onExpandedIdsChange']>().toEqualTypeOf<((ids: string[]) => void) | undefined>();
  });

  it('waits for controlled expansion to be accepted, overriding initial defaults', () => {
    const change = vi.fn();
    const toggle = vi.fn();
    const props = {
      nodes,
      expandedIds: [],
      defaultExpandedIds: ['folders'],
      expandByDefault: true,
      onExpandedIdsChange: change,
      onNodeToggle: toggle,
    };
    const { rerender } = renderWithProviders(<TreeView {...props} />);
    expect(screen.queryByText('Archive')).toBeNull();
    fireEvent.click(screen.getByText('Folders'));
    expect(change).toHaveBeenCalledExactlyOnceWith(['folders']);
    expect(toggle).toHaveBeenCalledExactlyOnceWith(nodes[0]);
    expect(screen.queryByText('Archive')).toBeNull();
    rerender(<TreeView {...props} expandedIds={['folders']} />);
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(change).toHaveBeenCalledTimes(1);
    rerender(<TreeView {...props} expandedIds={[]} />);
    expect(screen.queryByText('Archive')).toBeNull();
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('keeps uncontrolled toggles and their new notification working', () => {
    const change = vi.fn();
    renderWithProviders(<TreeView nodes={nodes} onExpandedIdsChange={change} />);
    fireEvent.click(screen.getByText('Folders'));
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(change).toHaveBeenNthCalledWith(1, ['folders']);
    fireEvent.click(screen.getByText('Folders'));
    expect(screen.queryByText('Archive')).toBeNull();
    expect(change).toHaveBeenNthCalledWith(2, []);
  });

  it('does not expand or select when only selectedId changes', async () => {
    const change = vi.fn();
    const select = vi.fn();
    const { rerender } = renderWithProviders(
      <TreeView nodes={nodes} onExpandedIdsChange={change} onNodeSelect={select} />,
    );
    rerender(<TreeView nodes={nodes} selectedId="item" onExpandedIdsChange={change} onNodeSelect={select} />);
    await act(async () => {});
    expect(screen.queryByText('Item')).toBeNull();
    expect(change).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
});

describe('TreeView reveal expansion', () => {
  it('merges only ancestors, waits for acceptance, and leaves selection and focus alone', async () => {
    const change = vi.fn();
    const select = vi.fn();
    const toggle = vi.fn();
    const props = {
      nodes,
      expandedIds: ['other'],
      selectedId: 'item',
      revealRequest: { id: 'item', requestId: 1 },
      onExpandedIdsChange: change,
      onNodeSelect: select,
      onNodeToggle: toggle,
    };
    const { rerender } = renderWithProviders(<TreeView {...props} />);
    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith(['other', 'folders', 'archive']);
    });
    expect(screen.queryByText('Item')).toBeNull();
    rerender(<TreeView {...props} expandedIds={['other']} />);
    await act(async () => {});
    expect(change).toHaveBeenCalledTimes(1);
    rerender(<TreeView {...props} expandedIds={['other', 'folders', 'archive']} />);
    expect(screen.getByText('Item').closest('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Other item')).toBeInTheDocument();
    expect(select).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
    expect(screen.getByRole('tree')).not.toHaveFocus();
  });

  it('retains a request through missing data and expands after data arrives', async () => {
    const change = vi.fn();
    const props = {
      revealRequest: { id: 'item', requestId: 2 },
      onExpandedIdsChange: change,
    };
    const { rerender } = renderWithProviders(<TreeView {...props} nodes={[]} />);
    await act(async () => {});
    expect(change).not.toHaveBeenCalled();
    rerender(<TreeView {...props} nodes={nodes} />);
    await waitFor(() => {
      expect(screen.getByText('Item')).toBeInTheDocument();
    });
    expect(change).toHaveBeenCalledExactlyOnceWith(['folders', 'archive']);
  });

  it('replaces a missing request before its old data arrives', async () => {
    const change = vi.fn();
    const { rerender } = renderWithProviders(
      <TreeView nodes={[]} revealRequest={{ id: 'item', requestId: 1 }} onExpandedIdsChange={change} />,
    );
    rerender(<TreeView nodes={[]} revealRequest={{ id: 'other-item', requestId: 2 }} onExpandedIdsChange={change} />);
    rerender(
      <TreeView nodes={nodes} revealRequest={{ id: 'other-item', requestId: 2 }} onExpandedIdsChange={change} />,
    );
    await waitFor(() => {
      expect(screen.getByText('Other item')).toBeInTheDocument();
    });
    expect(screen.queryByText('Archive')).toBeNull();
    expect(change).toHaveBeenCalledExactlyOnceWith(['other']);
  });
});

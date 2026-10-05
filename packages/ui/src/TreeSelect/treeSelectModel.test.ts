import { describe, expect, it } from 'vitest';

import type { TreeNode } from '../views/TreeView';

import { descendantCount, filterForest, findNode, findNodePath, flattenVisible } from './treeSelectModel';

const accounts: TreeNode[] = [
  {
    id: 'assets',
    label: 'Assets',
    children: [
      {
        id: 'current',
        label: 'Current Assets',
        children: [
          {
            id: 'bank',
            label: 'Bank Accounts',
            children: [
              { id: 'hdfc', label: 'HDFC Current' },
              { id: 'cash', label: 'Cash' },
            ],
          },
        ],
      },
      { id: 'fixed', label: 'Fixed Assets' },
    ],
  },
  { id: 'liabilities', label: 'Liabilities' },
];

describe('treeSelectModel', () => {
  it('flattenVisible indexes only rendered rows in walk order', () => {
    const rows = flattenVisible(accounts, new Set(['assets', 'current', 'bank']));
    expect(rows.map((r) => r.node.id)).toEqual(['assets', 'current', 'bank', 'hdfc', 'cash', 'fixed', 'liabilities']);
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rows.find((r) => r.node.id === 'hdfc')?.depth).toBe(3);
  });

  it('does not invent a second index — collapsed children are not navigable', () => {
    const rows = flattenVisible(accounts, new Set());
    expect(rows.map((r) => r.node.id)).toEqual(['assets', 'liabilities']);
    expect(rows[0]?.index).toBe(0);
    expect(rows[1]?.index).toBe(1);
  });

  it('filterForest keeps ancestors and expands them; matching parent keeps children', () => {
    const { nodes, expandIds } = filterForest(accounts, 'hdfc');
    expect(nodes.map((n) => n.id)).toEqual(['assets']);
    expect(expandIds.has('assets')).toBe(true);
    expect(expandIds.has('current')).toBe(true);
    expect(expandIds.has('bank')).toBe(true);
    const visible = flattenVisible(nodes, expandIds);
    expect(visible.map((r) => r.node.id)).toEqual(['assets', 'current', 'bank', 'hdfc']);
    expect(visible.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  it('findNode / path / descendantCount', () => {
    expect(findNode(accounts, 'hdfc')?.label).toBe('HDFC Current');
    expect(findNodePath(accounts, 'hdfc')).toEqual(['assets', 'current', 'bank']);
    expect(descendantCount(accounts[0])).toBe(5);
  });
});

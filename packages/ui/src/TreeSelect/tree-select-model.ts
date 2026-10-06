import type { TreeNode } from '../views/TreeView';

/**
 * Flattened visible row. `index` is the navigable index in render order —
 * the same model Combobox uses for group headers (`flatIndex` on selectable
 * rows). Guides and the caret are not rows; ArrowUp/ArrowDown walk this list.
 */
export interface FlatTreeRow<T = unknown> {
  node: TreeNode<T>;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  childCount: number;
  index: number;
}

export function descendantCount<T>(node: TreeNode<T>): number {
  let n = 0;
  const walk = (items?: TreeNode<T>[]) => {
    if (!items) {
      return;
    }
    for (const child of items) {
      n += 1;
      walk(child.children);
    }
  };
  walk(node.children);
  return n;
}

export function flattenVisible<T>(nodes: TreeNode<T>[], expandedIds: Set<string>): FlatTreeRow<T>[] {
  const result: FlatTreeRow<T>[] = [];
  const walk = (items: TreeNode<T>[], depth: number) => {
    for (const node of items) {
      const hasChildren = (node.children?.length ?? 0) > 0;
      const isExpanded = expandedIds.has(node.id);
      result.push({
        node,
        depth,
        hasChildren,
        isExpanded,
        childCount: descendantCount(node),
        index: result.length,
      });
      if (isExpanded && node.children) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(nodes, 0);
  return result;
}

/** Keep matching nodes and their ancestors. Matching parents keep full children. */
export function filterForest<T>(nodes: TreeNode<T>[], query: string): { nodes: TreeNode<T>[]; expandIds: Set<string> } {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { nodes, expandIds: new Set() };
  }
  const expandIds = new Set<string>();

  const walk = (items: TreeNode<T>[]): TreeNode<T>[] => {
    const out: TreeNode<T>[] = [];
    for (const node of items) {
      const selfHit = node.label.toLowerCase().includes(q);
      const childHits = node.children ? walk(node.children) : [];
      if (selfHit) {
        if ((node.children?.length ?? 0) > 0) {
          expandIds.add(node.id);
        }
        out.push(node);
      } else if (childHits.length > 0) {
        expandIds.add(node.id);
        out.push({ ...node, children: childHits });
      }
    }
    return out;
  };

  return { nodes: walk(nodes), expandIds };
}

export function findNode<T>(nodes: TreeNode<T>[], id: string): TreeNode<T> | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children?.length) {
      const found = findNode(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/** Ancestor ids of `id` (root → parent), or null when the node is absent. */
export function findNodePath<T>(items: TreeNode<T>[], id: string, trail: string[] = []): string[] | null {
  for (const node of items) {
    if (node.id === id) {
      return trail;
    }
    if (node.children?.length) {
      const found = findNodePath(node.children, id, [...trail, node.id]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

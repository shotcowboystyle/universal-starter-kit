interface RevealTreeNode {
  id: string;
  children?: readonly RevealTreeNode[];
}

export function treeRevealExpansion(
  nodes: readonly RevealTreeNode[],
  expandedIds: ReadonlySet<string>,
  targetId: string,
): ReadonlySet<string> | undefined {
  const ancestors: string[] = [];
  const find = (items: readonly RevealTreeNode[]): boolean => {
    for (const node of items) {
      if (node.id === targetId) {
        return true;
      }
      if (node.children?.length) {
        ancestors.push(node.id);
        if (find(node.children)) {
          return true;
        }
        ancestors.pop();
      }
    }
    return false;
  };
  if (!find(nodes)) {
    return undefined;
  }
  if (ancestors.every((id) => expandedIds.has(id))) {
    return expandedIds;
  }
  return new Set([...expandedIds, ...ancestors]);
}

export function treeRevealOffset(
  layout: { y: number; height: number },
  offset: number,
  viewportHeight: number,
): number | undefined {
  if (
    ![layout.y, layout.height, offset, viewportHeight].every(Number.isFinite) ||
    viewportHeight <= 0 ||
    layout.height <= 0
  ) {
    return undefined;
  }
  if (layout.height > viewportHeight || layout.y < offset) {
    return Math.max(0, layout.y);
  }
  if (layout.y + layout.height > offset + viewportHeight) {
    return Math.max(0, layout.y + layout.height - viewportHeight);
  }
  return offset;
}

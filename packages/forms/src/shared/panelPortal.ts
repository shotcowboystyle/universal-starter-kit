/**
 * Web floating panels render through a portal, so a panel's DOM is
 * no longer inside the control that opened it. A `Node.contains` check that
 * decides "inside or outside" follows the portal back to that control here,
 * or a press in a cell editor's dropdown reads as a press outside the cell.
 */

export const panelPortalAttribute = 'data-fp-portal';

const anchors = new WeakMap<Element, Element>();

export function registerPanelPortal(portal: Element, anchor: Element): () => void {
  anchors.set(portal, anchor);
  return () => {
    if (anchors.get(portal) === anchor) {
      anchors.delete(portal);
    }
  };
}

/** The element that opened the portaled panel `node` sits in, or null. */
export function panelPortalAnchor(node: Node): Element | null {
  const element = node instanceof Element ? node : node.parentElement;
  const portal = element?.closest(`[${panelPortalAttribute}]`);
  return portal ? (anchors.get(portal) ?? null) : null;
}

/** `root.contains(target)`, where a portaled panel counts as part of its anchor. */
export function containsAcrossPanels(root: Node | null | undefined, target: unknown): boolean {
  if (!root || typeof Node === 'undefined' || !(target instanceof Node)) {
    return false;
  }
  let node: Node | null = target;
  // Each hop climbs out of one portal; nesting is shallow, the cap stops a cycle.
  for (let hop = 0; node && hop < 32; hop++) {
    if (root.contains(node)) {
      return true;
    }
    node = panelPortalAnchor(node);
  }
  return false;
}

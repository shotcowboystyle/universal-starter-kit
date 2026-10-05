/**
 * DEV scan — count action-like elements (buttons / pressables) in a
 * React tree so dialog action rows can enforce the max-2-actions cap.
 *
 * Heuristic, not exhaustive: explicit action markers, press/click handlers,
 * and button roles/tags count; bare `href` links are treated as body copy,
 * not actions.
 */

import { Children, isValidElement, type ReactNode } from 'react';

export function elementLooksLikeAction(node: ReactNode): boolean {
  if (!isValidElement(node)) {
    return false;
  }
  const props = node.props as Record<string, unknown>;
  if (props['data-mp-action-role'] != null || props.actionRole != null) {
    return true;
  }
  if (typeof props.onPress === 'function' || typeof props.onClick === 'function') {
    return true;
  }
  if (props.role === 'button' || node.type === 'button') {
    return true;
  }
  if (props.tag === 'button') {
    return true;
  }
  if (props.accent === true) {
    return true;
  }
  return false;
}

/**
 * Counts action-like elements recursively. Matched actions are not descended
 * into — their children are label content, not further actions.
 */
export function countActionsInTree(nodes: ReactNode): number {
  let count = 0;
  Children.forEach(nodes, (child) => {
    if (elementLooksLikeAction(child)) {
      count += 1;
      return;
    }
    if (isValidElement(child)) {
      const kids = (child.props as { children?: ReactNode }).children;
      if (kids != null) {
        count += countActionsInTree(kids);
      }
    }
  });
  return count;
}

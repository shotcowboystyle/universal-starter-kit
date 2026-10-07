/**
 * DEV scan — count action-like elements (buttons / pressables) in a
 * React tree so dialog action rows can enforce the max-2-actions cap.
 *
 * Heuristic, not exhaustive: explicit action markers, press/click handlers,
 * and button roles/tags count; bare `href` links are treated as body copy,
 * not actions.
 */

import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';

interface ActionProbeProps {
  'data-mp-action-role'?: unknown;
  actionRole?: unknown;
  onPress?: unknown;
  onClick?: unknown;
  role?: unknown;
  tag?: unknown;
  accent?: unknown;
}

export const elementLooksLikeAction = (node: ReactNode): boolean => {
  if (!isValidElement<ActionProbeProps>(node)) {
    return false;
  }
  const { props } = node;
  if (props['data-mp-action-role'] != null || props.actionRole != null) {
    return true;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- heuristic over consumer-supplied, untyped element props
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
};

/**
 * Counts action-like elements recursively. Matched actions are not descended
 * into — their children are label content, not further actions.
 */
export const countActionsInTree = (nodes: ReactNode): number => {
  let count = 0;
  // oxlint-disable-next-line react/no-react-children, github/array-foreach -- Children.forEach is the only walk that handles every ReactNode shape (arrays, iterables, fragments of holes)
  Children.forEach(nodes, (child) => {
    if (elementLooksLikeAction(child)) {
      count += 1;
      return;
    }
    if (isValidElement<{ children?: ReactNode }>(child)) {
      const kids = child.props.children;
      if (kids != null) {
        count += countActionsInTree(kids);
      }
    }
  });
  return count;
};

/**
 * Toolbar group wrapper with trailing separator and visibility control
 */

import type { ReactNode } from 'react';

import { ToolbarGroupFrame, ToolbarSeparatorFrame } from '../styled';

// ===========================================================================
// Types
// ===========================================================================

export interface ToolbarGroupProps {
  /** Group content (toolbar buttons) */
  children: ReactNode;
  /** Whether the group is visible (hides entire group when false) */
  visible?: boolean;
  /** Whether to show the trailing separator (default: true) */
  showSeparator?: boolean;
}

// ===========================================================================
// ToolbarGroup
// ===========================================================================

export const ToolbarGroup = ({ children, visible = true, showSeparator = true }: ToolbarGroupProps) => {
  if (!visible) {
    return null;
  }

  return (
    <>
      <ToolbarGroupFrame>{children}</ToolbarGroupFrame>
      {showSeparator && <ToolbarSeparatorFrame />}
    </>
  );
};

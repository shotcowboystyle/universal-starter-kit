import type { PropsWithChildren } from 'react';
import { YStack, type YStackProps } from 'tamagui';

import type { SafeAreaEdge, SafeAreaMode } from './insets';

export type { SafeAreaEdge, SafeAreaMode } from './insets';

export interface SafeAreaWrapperProps extends YStackProps {
  /**
   * Which edges to apply safe area insets to
   * @default ['top', 'bottom', 'left', 'right']
   */
  edges?: SafeAreaEdge[];
  /**
   * Additional mode for safe area behavior
   * - 'padding': Apply as padding (default)
   * - 'margin': Apply as margin
   */
  mode?: SafeAreaMode;
}

/**
 * SafeAreaWrapper — web passthrough.
 *
 * No owned chrome (SF-TRANSPARENT / R-NONE / E-FLAT). Knobs MUST NOT change
 * inset calculation; web has no safe-area insets, so `edges` / `mode` are
 * accepted for API parity and ignored. Consumer `{...stackProps}` last.
 */
export function SafeAreaWrapper({
  children,
  edges: _edges,
  mode: _mode,
  ...stackProps
}: PropsWithChildren<SafeAreaWrapperProps>) {
  return (
    <YStack data-testid="safe-area-wrapper" data-safe-area="web" flex={1} {...stackProps}>
      {children}
    </YStack>
  );
}

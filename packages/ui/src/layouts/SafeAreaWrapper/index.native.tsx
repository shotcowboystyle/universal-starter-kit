import type { PropsWithChildren } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, type YStackProps } from 'tamagui';

import { applySafeAreaInsets, type SafeAreaEdge, type SafeAreaMode } from './insets';

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
 * SafeAreaWrapper — native insets.
 *
 * Wraps content with device safe-area insets (notch, home indicator).
 * No owned surface — only platform spacing. Consumer `{...stackProps}` last.
 */
export function SafeAreaWrapper({
  children,
  edges = ['top', 'bottom', 'left', 'right'],
  mode = 'padding',
  ...stackProps
}: PropsWithChildren<SafeAreaWrapperProps>) {
  const insets = useSafeAreaInsets();
  const insetStyles = applySafeAreaInsets(insets, edges, mode);

  return (
    <YStack data-testid="safe-area-wrapper" data-safe-area="native" flex={1} style={insetStyles} {...stackProps}>
      {children}
    </YStack>
  );
}

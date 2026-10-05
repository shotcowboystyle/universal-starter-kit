import type { PropsWithChildren } from 'react';
import { YStack, type YStackProps } from 'tamagui';

import type { KeyboardAvoidingBehavior } from './behavior';

export type { KeyboardAvoidingBehavior } from './behavior';

export interface KeyboardAvoidingWrapperProps extends YStackProps {
  /**
   * The behavior for keyboard avoidance
   * - 'padding': Add padding to avoid keyboard (default for iOS)
   * - 'height': Reduce height to avoid keyboard (default for Android)
   * - 'position': Change position to avoid keyboard
   */
  behavior?: KeyboardAvoidingBehavior;
  /**
   * Additional offset to add when keyboard is visible
   */
  keyboardVerticalOffset?: number;
  /**
   * Whether keyboard avoiding behavior is enabled
   * @default true
   */
  enabled?: boolean;
}

/**
 * KeyboardAvoidingWrapper — web passthrough.
 *
 * No owned chrome (SF-TRANSPARENT / R-NONE / E-FLAT). Browsers handle the
 * software keyboard; `behavior` / offset / enabled are accepted for API
 * parity and ignored. Consumer `{...stackProps}` last.
 */
export function KeyboardAvoidingWrapper({
  children,
  behavior: _behavior,
  keyboardVerticalOffset: _offset,
  enabled = true,
  ...stackProps
}: PropsWithChildren<KeyboardAvoidingWrapperProps>) {
  return (
    <YStack
      data-testid="keyboard-avoiding-wrapper"
      data-keyboard-avoiding="web"
      data-enabled={String(enabled)}
      flex={1}
      {...stackProps}>
      {children}
    </YStack>
  );
}

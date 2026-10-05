import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { YStack, type YStackProps } from 'tamagui';

import { resolveKeyboardAvoidingBehavior, type KeyboardAvoidingBehavior } from './behavior';

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
 * KeyboardAvoidingWrapper — native KeyboardAvoidingView.
 *
 * No owned surface — only platform keyboard offset. Consumer `{...stackProps}` last.
 */
export function KeyboardAvoidingWrapper({
  children,
  behavior,
  keyboardVerticalOffset = 0,
  enabled = true,
  ...stackProps
}: PropsWithChildren<KeyboardAvoidingWrapperProps>) {
  const effectiveBehavior = resolveKeyboardAvoidingBehavior(Platform.OS, behavior);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={effectiveBehavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
      enabled={enabled}>
      <YStack
        data-testid="keyboard-avoiding-wrapper"
        data-keyboard-avoiding="native"
        data-enabled={String(enabled)}
        flex={1}
        {...stackProps}>
        {children}
      </YStack>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

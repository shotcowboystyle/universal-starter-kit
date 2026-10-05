export type KeyboardAvoidingBehavior = 'padding' | 'height' | 'position';

/**
 * Native KeyboardAvoidingView default: padding on iOS, height on Android.
 * An explicit `behavior` prop always wins.
 */
export function resolveKeyboardAvoidingBehavior(
  platform: string,
  behavior?: KeyboardAvoidingBehavior,
): KeyboardAvoidingBehavior {
  if (behavior) {
    return behavior;
  }
  return platform === 'ios' ? 'padding' : 'height';
}

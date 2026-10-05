import { isWeb } from 'tamagui';

/**
 * iOS UIPickerView uses UISelectionFeedbackGenerator, not impact. Optional
 * so web / tests / apps without expo-haptics stay silent.
 */
export function fireSelectionHaptic(): void {
  if (isWeb) {
    return;
  }
  try {
    const loaded = require('expo-haptics') as { selectionAsync?: () => Promise<void> };
    void loaded.selectionAsync?.();
  } catch {
    // optional peer
  }
}

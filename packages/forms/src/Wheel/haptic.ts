import { isWeb } from 'tamagui';

/**
 * iOS UIPickerView uses UISelectionFeedbackGenerator, not impact. Optional
 * so web / tests / apps without expo-haptics stay silent.
 */
export const fireSelectionHaptic = (): void => {
  if (isWeb) {
    return;
  }
  try {
    // Metro resolves a `require` inside try/catch as an optional dependency; a dynamic import() would fail the bundle when expo-haptics is absent.
    // oxlint-disable-next-line node/global-require, unicorn/prefer-module, typescript/no-unsafe-assignment -- optional peer dependency loaded lazily; see above
    const loaded: { selectionAsync?: () => Promise<void> } = require('expo-haptics');
    void loaded.selectionAsync?.();
  } catch {
    // optional peer
  }
};

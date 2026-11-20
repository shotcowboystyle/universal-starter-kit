/**
 * Shared context for the rich text editor compound component
 */

import type { FontSizeTokens } from 'tamagui';
import { createStyledContext } from 'tamagui';

export const RichEditorContext = createStyledContext<{
  size: FontSizeTokens;
  compact: boolean;
  disabled: boolean;
}>({
  // SAFETY: '$true' is the default key of every Tamagui font-size scale.
  size: '$true' as FontSizeTokens,
  compact: false,
  disabled: false,
});

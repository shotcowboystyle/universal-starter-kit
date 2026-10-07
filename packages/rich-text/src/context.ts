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
  size: '$true' as FontSizeTokens,
  compact: false,
  disabled: false,
});

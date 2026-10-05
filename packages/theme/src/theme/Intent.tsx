import type { ThemeName } from '@tamagui/web';
import type { PropsWithChildren } from 'react';
import { Theme } from 'tamagui';

import { IntentContext } from './useResolvedKnobs';

export interface IntentProps extends PropsWithChildren {
  /** Intent name. */
  name: 'accent' | 'error' | 'warning' | 'success';
  /** Override the default Tamagui theme for this intent. */
  theme?: ThemeName;
}

/**
 * Wraps children with an intent context and corresponding Tamagui theme.
 *
 * Dual responsibility:
 *   1. Layer 1 (color): Activates Tamagui sub-theme (intent name or explicit theme prop)
 *   2. Layer 2 (structure): Provides intent name via context so useResolvedKnobs can merge overrides
 *
 * If both wrapper and component prop are present, component prop wins.
 * Nesting intents replaces (does not merge) — innermost wins.
 */
export function Intent({ name, theme, children }: IntentProps) {
  const themeName = theme ?? name;
  return (
    <IntentContext.Provider value={name}>
      <Theme name={themeName}>{children}</Theme>
    </IntentContext.Provider>
  );
}

import type { ThemeName } from '@tamagui/web';
import type { PropsWithChildren } from 'react';
import { Theme } from 'tamagui';

import { IntentContext } from './use-resolved-knobs';

type IntentName = keyof { accent: true; error: true; warning: true; success: true };

export interface IntentProps extends PropsWithChildren {
  /** Intent name. */
  name: IntentName;
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
export const Intent = ({ name, theme, children }: IntentProps) => {
  const themeName = theme ?? name;
  return (
    <IntentContext.Provider value={name}>
      <Theme name={themeName}>{children}</Theme>
    </IntentContext.Provider>
  );
};

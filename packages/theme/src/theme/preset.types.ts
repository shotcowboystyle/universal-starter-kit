import type { ThemeName } from '@tamagui/web';

import type { Knobs } from './knobs';

export interface Preset {
  /** Tamagui color theme (accent color). */
  theme: ThemeName;
  /** Base structural knobs. */
  knobs: Knobs;
  /** Intent-specific knob overrides. */
  intents: {
    accent?: IntentOverride;
    error?: IntentOverride;
    warning?: IntentOverride;
    success?: IntentOverride;
  };
  /** Tint sequence for color cycling across nested regions. */
  tints: ThemeName[];
}

export type IntentOverride = Partial<Knobs> & {
  [component: string]: Partial<Knobs> | string | undefined;
};

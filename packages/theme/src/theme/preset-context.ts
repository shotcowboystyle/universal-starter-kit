import type { ThemeName } from '@tamagui/web';
import { createContext, useContext } from 'react';

import type { Knobs } from './knobs';
import type { Preset } from './preset.types';

export interface PresetContextValue {
  preset: Preset;
  overrides?: Partial<Knobs>;
}

export const PresetContext = createContext<PresetContextValue | null>(null);

/**
 * Read the nearest Preset context. Returns null if no <Preset> ancestor exists.
 */
export function usePresetContext(): PresetContextValue | null {
  return useContext(PresetContext);
}

/**
 * Read the tints array from the nearest Preset context.
 * Returns an empty array if no <Preset> ancestor exists.
 */
export function usePresetTints(): ThemeName[] {
  const ctx = useContext(PresetContext);
  return ctx?.preset.tints ?? [];
}

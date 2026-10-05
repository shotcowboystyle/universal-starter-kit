import { useCallback, useState } from 'react';

import { type Knobs, defaultKnobs } from './knobs';
import { getPreset } from './shared';

// ---------------------------------------------------------------------------
// Scheme type (lives here since it's orthogonal to knobs)
// ---------------------------------------------------------------------------

export type ThemeScheme = 'system' | 'dark' | 'light';

// ---------------------------------------------------------------------------
// useTheme hook — knob-aware (native variant uses local state only, no cookies)
// ---------------------------------------------------------------------------

export function useTheme(): [
  Knobs,
  (knobs?: Partial<Knobs>) => void,
  boolean,
  (presetName: string) => void,
  string | undefined,
] {
  const [localKnobs, setLocalKnobs] = useState<Knobs>(() => ({ ...defaultKnobs }));
  const [activePreset, setActivePreset] = useState<string | undefined>(undefined);

  const setKnobs = useCallback((partial?: Partial<Knobs>): void => {
    if (!partial) {
      return;
    }
    setLocalKnobs((prev) => {
      let hasChanges = false;
      const updated = { ...prev };
      for (const key of Object.keys(partial) as Array<keyof Knobs>) {
        const newValue = partial[key];
        if (newValue !== undefined && newValue !== prev[key]) {
          (updated as Record<string, unknown>)[key] = newValue;
          hasChanges = true;
        }
      }
      return hasChanges ? updated : prev;
    });
  }, []);

  const setPresetFn = useCallback((newPresetName: string) => {
    const preset = getPreset(newPresetName);
    const knobs = preset?.knobs ?? defaultKnobs;
    setActivePreset(newPresetName);
    setLocalKnobs(knobs);
  }, []);

  return [localKnobs, setKnobs, false, setPresetFn, activePreset];
}

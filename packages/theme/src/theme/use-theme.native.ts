import { useCallback, useState } from 'react';

import { defaultKnobs } from './knobs';
import type { Knobs } from './knobs';
import { getPreset } from './shared';

// ---------------------------------------------------------------------------
// Scheme type (lives here since it's orthogonal to knobs)
// ---------------------------------------------------------------------------

export type ThemeScheme = 'system' | 'dark' | 'light';

const knobKeysOf = (partial: Partial<Knobs>) =>
  // SAFETY: a Partial<Knobs> only carries keys declared on Knobs.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys widens to string[]
  Object.keys(partial) as (keyof Knobs)[];

const mergeKnobChanges = (current: Knobs, partial: Partial<Knobs>) => {
  let hasChanges = false;
  const updated = { ...current };
  for (const key of knobKeysOf(partial)) {
    const newValue = partial[key];
    if (newValue !== undefined && newValue !== current[key]) {
      Object.assign(updated, { [key]: newValue });
      hasChanges = true;
    }
  }
  return { updated, hasChanges };
};

// ---------------------------------------------------------------------------
// useTheme hook — knob-aware (native variant uses local state only, no cookies)
// ---------------------------------------------------------------------------

export const useTheme = (): [
  Knobs,
  (knobs?: Partial<Knobs>) => void,
  boolean,
  (presetName: string) => void,
  string | undefined,
] => {
  const [localKnobs, setLocalKnobs] = useState<Knobs>(() => ({ ...defaultKnobs }));
  const [activePreset, setActivePreset] = useState<string | undefined>();

  const setKnobs = useCallback((partial?: Partial<Knobs>): void => {
    if (!partial) {
      return;
    }
    setLocalKnobs((prev) => {
      const { updated, hasChanges } = mergeKnobChanges(prev, partial);
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
};

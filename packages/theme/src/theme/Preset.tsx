import type { ThemeName } from '@tamagui/web';
import { type PropsWithChildren, useContext, useMemo } from 'react';
import { Theme as TamaguiTheme } from 'tamagui';

import { defaultKnobs, type Knobs } from './knobs';
import type { Preset as PresetType } from './preset.types';
import { PresetContext, type PresetContextValue } from './PresetContext';
import { getPreset } from './shared';

export interface PresetProps extends PropsWithChildren {
  /** Named preset to apply. Looked up from the preset registry. */
  preset?: string;
  /** Tamagui theme name (e.g. "blue", "red"). Wraps children in <Theme />. */
  theme?: ThemeName;
  /** Partial knob overrides merged on top of the preset's knobs. */
  overrides?: Partial<Knobs>;
  /** When true (default), inherits from parent Preset. When false, replaces entirely. */
  cascade?: boolean;
}

export function Preset({ children, preset: presetName, theme, overrides, cascade = true }: PresetProps) {
  const parentCtx = useContext(PresetContext);

  const ctxValue = useMemo((): PresetContextValue => {
    // 1. Determine base preset
    let base: PresetType;

    if (cascade && parentCtx) {
      // Start from parent's preset
      base = { ...parentCtx.preset };
      // If a preset name is given, overlay it
      if (presetName) {
        const namedPreset = getPreset(presetName);
        if (namedPreset) {
          base = { ...namedPreset };
        }
      }
      // Carry parent overrides forward, then layer ours
      const mergedOverrides: Partial<Knobs> = {
        ...parentCtx.overrides,
        ...overrides,
      };
      return {
        preset: {
          ...base,
          knobs: { ...base.knobs, ...parentCtx.overrides, ...overrides },
        },
        overrides: Object.keys(mergedOverrides).length > 0 ? mergedOverrides : undefined,
      };
    }

    // cascade=false or no parent — start fresh
    const freshDefault: PresetType = {
      theme: '' as ThemeName,
      knobs: { ...defaultKnobs },
      intents: {},
      tints: [],
    };

    if (presetName) {
      base = getPreset(presetName) ?? freshDefault;
    } else if (!cascade) {
      // Explicitly non-cascading: always start from defaults
      base = freshDefault;
    } else {
      // No parent context exists: use defaults
      base = freshDefault;
    }

    if (overrides) {
      return {
        preset: { ...base, knobs: { ...base.knobs, ...overrides } },
        overrides,
      };
    }

    return { preset: base };
  }, [cascade, parentCtx, presetName, overrides]);

  let element = <PresetContext.Provider value={ctxValue}>{children}</PresetContext.Provider>;

  // Wrap with Tamagui <Theme /> when theme is specified
  if (theme) {
    element = <TamaguiTheme name={theme}>{element}</TamaguiTheme>;
  }

  return element;
}

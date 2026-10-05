import type { ThemeName } from '@tamagui/web';
import { type CreateTamaguiProps, createTamagui } from 'tamagui';

import type { Knobs } from './knobs';
import { defaultKnobs } from './knobs';
import type { Preset } from './preset.types';
import type { RecipeFamilies, RecipeInputs } from './recipeInputs';

// ── Preset registry ───────────────────────────────────────────────────────

const presetRegistry = new Map<string, Preset>();

/** Unknown-preset names already warned about, so a render loop doesn't spam. */
const warnedUnknownPresets = new Set<string>();

export function registerPreset(name: string, preset: Preset): void {
  presetRegistry.set(name, preset);
}

/**
 * Look up a registered preset by name.
 *
 * A requested-but-unregistered name is a silent bug otherwise: callers just
 * fall back to the default preset, so e.g. `preset:material` renders
 * byte-identical to `default` with no signal. Warn ONCE per unknown name
 * (empty string and the implicit "default" are legitimate no-ops and stay
 * quiet) so a typo'd or unregistered preset is loud instead of invisible.
 */
export function getPreset(name: string): Preset | undefined {
  const preset = presetRegistry.get(name);
  if (
    process.env.NODE_ENV !== 'production' &&
    !preset &&
    name &&
    name !== 'default' &&
    !warnedUnknownPresets.has(name)
  ) {
    warnedUnknownPresets.add(name);
    const known = getPresetNames();
    console.warn(
      `[@repo/theme] Unknown preset "${name}" is not registered — ` +
        `falling back to the default preset. Registered presets: ${
          known.length ? known.join(', ') : '(none)'
        }. Register it with registerPreset("${name}", …) or pass a known name.`,
    );
  }
  return preset;
}

export function getPresetNames(): string[] {
  return Array.from(presetRegistry.keys());
}

export function clearPresets(): void {
  presetRegistry.clear();
  warnedUnknownPresets.clear();
}

// ── Preset resolution ─────────────────────────────────────────────────────

/**
 * Resolve a `Preset` from a registered preset name, merging knob overrides
 * on top of the base preset's knobs.
 *
 * If the preset name is not found, falls back to a default preset shape
 * using `defaultKnobs`.
 */
export function resolveThemeFromPreset(presetName: string, overrides: Partial<Knobs>): Preset {
  const preset = getPreset(presetName);
  const base: Preset = preset ?? {
    theme: '' as ThemeName,
    knobs: { ...defaultKnobs },
    intents: {},
    tints: [],
  };
  return {
    ...base,
    knobs: { ...base.knobs, ...overrides },
  };
}

// ── Theme config ──────────────────────────────────────────────────────────

export interface ThemeConfig<T extends CreateTamaguiProps = CreateTamaguiProps> {
  tamagui: ReturnType<typeof createTamagui<T>>;
  presets?: Record<string, Preset>;
  defaultPreset?: string;
  /**
   * User-facing color theme names extracted from the raw themes object
   * (e.g. `["blue", "green", "purple", ...]`). Computed at config creation
   * time so consumers don't need to introspect the Tamagui config.
   */
  themeColors: string[];
  /**
   * Size-recipe inputs + generated families. Orthogonal to Tamagui
   * `themes` (those are color palettes from createThemes / theme-builder).
   */
  recipeInputs?: RecipeInputs;
  recipeFamilies?: RecipeFamilies;
}

/**
 * Semantic / internal sub-theme names that should never appear in a
 * user-facing "Theme color" picker.
 */
const excludedThemeNames = new Set(['active', 'alt1', 'alt2', 'warning', 'success', 'error', 'accent']);

/**
 * Derive user-facing color names from a raw themes record.
 * A color "foo" is present when both `light_foo` and `dark_foo` exist as keys,
 * the name is all-lowercase, and it isn't a semantic/state sub-theme.
 */
function extractThemeColors(themes: Record<string, unknown>): string[] {
  const keys = Object.keys(themes);
  const colorSet = new Set<string>();
  for (const key of keys) {
    const match = key.match(/^light_([a-z]+)$/);
    if (match) {
      const color = match[1];
      if (keys.includes(`dark_${color}`) && !excludedThemeNames.has(color)) {
        colorSet.add(color);
      }
    }
  }
  return [...colorSet].sort();
}

export function createThemeConfig<T extends CreateTamaguiProps>(
  tamagui: T,
  options?: {
    presets?: Record<string, Preset>;
    defaultPreset?: string;
    recipeInputs?: RecipeInputs;
    recipeFamilies?: RecipeFamilies;
  },
): ThemeConfig<T> {
  // Extract color names from the raw themes BEFORE createTamagui processes them.
  const themeColors = tamagui.themes ? extractThemeColors(tamagui.themes as Record<string, unknown>) : [];

  const tamaguiConfig = createTamagui({
    ...tamagui,
    settings: {
      disableRootThemeClass: false,
      themeClassNameOnRoot: true,
      ...tamagui.settings,
    },
  }) as ReturnType<typeof createTamagui<T>>;

  if (options?.presets) {
    for (const [name, preset] of Object.entries(options.presets)) {
      registerPreset(name, preset);
    }
  }

  return {
    tamagui: tamaguiConfig,
    presets: options?.presets,
    defaultPreset: options?.defaultPreset,
    themeColors,
    recipeInputs: options?.recipeInputs,
    recipeFamilies: options?.recipeFamilies,
  };
}

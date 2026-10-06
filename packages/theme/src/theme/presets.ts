import type { ThemeName } from '@tamagui/web';

import { defaultIntents } from './intents';
import type { Preset } from './preset.types';

const sansSerif = 'sans-serif';

export const defaultPreset: Preset = {
  // SAFETY: ThemeName is a string alias; '' selects the unnamed base theme.
  theme: '' as ThemeName,
  knobs: {
    fillStyle: 'filled',
    borderRadius: 'medium',
    cornerSmoothing: 'round',
    borderWidth: 'medium',
    elevation: 'small',
    space: 'medium',
    size: 'medium',
    density: 'comfortable',
    textAccent: 'high',
    headingFont: sansSerif,
    bodyFont: sansSerif,
    fontWeight: 'regular',
    pageTitleScale: 'moderate',
    animation: 'quick',
    fieldLabelPlacement: 'top',
    requiredMarking: 'minority',
    tableZebra: 'off',
    bulkBarPlacement: 'top',
    selectAllScope: 'page',
    timestampStyle: 'absolute',
    disabledStyle: 'keepLabel',
    formAutofocus: 'off',
    hover: {},
    press: {},
    focus: {},
    focusVisible: {},
  },
  intents: defaultIntents,
  // SAFETY: every entry is a Radix hue theme name registered by createThemes.
  tints: ['orange', 'blue', 'purple', 'pink'] as ThemeName[],
};

export const boldPreset: Preset = {
  // SAFETY: 'pink' is a Radix hue theme name registered by createThemes.
  theme: 'pink' as ThemeName,
  knobs: {
    fillStyle: 'filled',
    borderRadius: 'full',
    cornerSmoothing: 'round',
    borderWidth: 'none',
    elevation: 'none',
    space: 'small',
    size: 'medium',
    density: 'comfortable',
    textAccent: 'high',
    headingFont: sansSerif,
    bodyFont: sansSerif,
    fontWeight: 'bold',
    pageTitleScale: 'moderate',
    animation: 'bouncy',
    fieldLabelPlacement: 'top',
    requiredMarking: 'minority',
    tableZebra: 'off',
    bulkBarPlacement: 'top',
    selectAllScope: 'page',
    timestampStyle: 'absolute',
    disabledStyle: 'keepLabel',
    formAutofocus: 'off',
    hover: {},
    press: {},
    focus: {},
    focusVisible: {},
  },
  intents: defaultIntents,
  // SAFETY: every entry is a Radix hue theme name registered by createThemes.
  tints: ['pink', 'purple', 'pink', 'purple', 'pink', 'purple', 'pink'] as ThemeName[],
};

/**
 * Marketing / hero surface preset (hero-H1 dial). Identical to `defaultPreset` except the page title returns to
 * the display step ($10 = 64px): product screens are wayfinding and take the
 * moderate step by default, so the loud scale has to be ASKED for.
 *
 * @example Whole marketing app
 * createDefaultThemeConfig({ presets: { default: defaultPreset, hero: heroPreset } })
 *
 * @example One hero region inside a product app (cascades onto the live preset)
 * <Preset overrides={{ pageTitleScale: "display" }}>
 *   <PageHeader title="Ship faster" />
 * </Preset>
 */
export const heroPreset: Preset = {
  ...defaultPreset,
  knobs: { ...defaultPreset.knobs, pageTitleScale: 'display' },
};

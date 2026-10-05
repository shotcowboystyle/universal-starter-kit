import { defaultConfig, mediaQueryDefaultActive } from '@tamagui/config/v5';
import { shorthands } from '@tamagui/shorthands';
import type { CreateTamaguiProps, GenericFont } from 'tamagui';

import { animations } from './animations/index';
import {
  type BaseThemeBuilderDefinition,
  type CreateThemesBuilderOptions,
  type GetThemeProps,
  type ThemeBuilderDefinition,
  createThemesBuilder,
} from './createThemes';
import { defaultAccentTheme } from './defaults/accent';
import { defaultBaseTheme } from './defaults/base';
import { defaultBuilderOptions } from './defaults/builderOptions';
import { defaultFonts } from './defaults/fonts';
import type { Preset } from './preset.types';
import { type SizeRecipeInputs } from './recipeInputs';
import { type ThemeConfig, createThemeConfig } from './shared';
import { getGeneratedSizeRecipes, getSizeRecipeInputs, setSizeRecipeInputs } from './sizeRecipes';
import { type ThemeSubset, subsetThemes } from './subsetThemes';
import { assertResolvableThemeValues } from './themeValue';

/**
 * The Tamagui era this theme config resolves against. Every era-bearing
 * default in this file — the `@tamagui/config/v5` spread, its media map,
 * `mediaQueryDefaultActive` and the non-color token values — resolves on the
 * v5 branch, and the correction rows (interaction ramp, surface addressing,
 * heading weight and body size/leading) re-derive against v5, never against v4 or the legacy root exports. Asserted by the
 * era block in `createDefaultThemeConfig.test.ts`.
 *
 * Tokens come from `defaultConfig` and from nothing else — the legacy
 * `@tamagui/themes` override is gone (measured identical for size/space/
 * radius/zIndex; its only addition was unused Radix color steps).
 */
export const TAMAGUI_ERA = 'v5' as const;
/** Proof-test alias — same pin as `TAMAGUI_ERA`. */
export const tamaguiEra = TAMAGUI_ERA;

export interface CreateDefaultThemeConfigOptions {
  /** Base theme palette (dark/light with optional shadows; defaults to the built-in neutral ramps) */
  base?: BaseThemeBuilderDefinition;
  /** Accent theme palette (defaults to the built-in accent ramps) */
  accent?: ThemeBuilderDefinition;
  /** Map of extra named themes with their palettes */
  additionalThemes?: Record<string, ThemeBuilderDefinition>;
  /** Font definitions (merged over the default heading/body and category fonts) */
  fonts?: Record<string, GenericFont>;
  /** Animation config (defaults to framework reanimated animations) */
  animations?: CreateTamaguiProps['animations'];
  /** Options for the theme builder (grandChildrenThemes, getTheme) */
  builderOptions?: CreateThemesBuilderOptions;
  /** Override tamagui settings */
  settings?: Partial<NonNullable<CreateTamaguiProps['settings']>>;
  /** Override any top-level tamagui config property */
  tamagui?: Partial<CreateTamaguiProps>;
  /** Named theme presets for the preset system */
  presets?: Record<string, Preset>;
  /** Default preset name to use when no `mp.preset` cookie is set */
  defaultPreset?: string;
  /**
   * Size-recipe inputs. Merged over `defaultRecipeInputs`; tables are
   * generated, written into the live aliases Button/Input already import, and
   * attached on ThemeConfig as `recipeInputs` / `recipeFamilies`. Not written
   * into Tamagui `themes` (those stay color palettes from createThemes /
   * theme-builder).
   */
  recipeInputs?: Partial<SizeRecipeInputs>;
  /**
   * Ship only the themes this surface can reach (`10` AC-6). Applied to the
   * built matrix, after `additionalThemes`, so a subset filters which themes
   * exist and never changes what one contains. See `subsetThemes`.
   */
  subset?: ThemeSubset;
}

/**
 * Compose a consumer `getTheme` WITH the framework default instead of
 * replacing it. The default always runs first — it derives the solid ≥3:1
 * `$outlineColor` focus ring, the interaction ramp and the
 * component sub-theme border/outline anchors — then the consumer's result is
 * merged over it per key, so a partial override keeps every derivation it
 * doesn't explicitly change. Consumer entries that resolve to nullish are
 * dropped: a getTheme written against the full base ramp (`theme.color5`
 * etc.) also runs inside narrow component sub-themes where those steps don't
 * exist, and its undefineds must not erase the defaults.
 */
function composeGetTheme(
  custom: CreateThemesBuilderOptions['getTheme'],
): NonNullable<CreateThemesBuilderOptions['getTheme']> {
  const base = defaultBuilderOptions.getTheme as NonNullable<CreateThemesBuilderOptions['getTheme']>;
  if (!custom) {
    return base;
  }
  return (props: GetThemeProps) => {
    const merged: Record<string, string | number | null | undefined> = { ...base(props) };
    const consumer = custom(props);
    // Dropping nullish is not enough: a misspelled
    // colour is not nullish, survives the merge, and resolves to nothing at
    // paint. Fail here, while there is a stack that names the getTheme.
    assertResolvableThemeValues(consumer, props.name);
    for (const [key, value] of Object.entries(consumer)) {
      if (value != null) {
        merged[key] = value;
      }
    }
    return merged;
  };
}

/**
 * Builds a complete Tamagui theme config with batteries included: calling it
 * with zero options yields the framework's polished defaults — the neutral
 * Radix-mauve-curve base ramps, the solid-surface brand accent ramps, Inter
 * heading/body fonts, the category fonts the bodyFont knob resolves, and the
 * interaction-ramp `getTheme` theme builder.
 * Every option overrides its piece independently: `base` and `accent` each
 * replace their default, `fonts` are spread OVER the defaults so a partial
 * font map keeps the default heading/body and category faces, and `builderOptions.getTheme`
 * COMPOSES with the default (consumer keys win; framework derivations like
 * the solid `$outlineColor` focus ring survive partial overrides).
 */
export function createDefaultThemeConfig(options: CreateDefaultThemeConfigOptions = {}): ThemeConfig {
  setSizeRecipeInputs(options.recipeInputs ?? {});
  const base = options.base ?? defaultBaseTheme;
  const accent = options.accent ?? defaultAccentTheme;
  const themesBuilder = createThemesBuilder(base, accent, {
    ...defaultBuilderOptions,
    ...options.builderOptions,
    getTheme: composeGetTheme(options.builderOptions?.getTheme),
  });
  const builtThemes: Record<string, Record<string, string>> = {
    ...themesBuilder.themes(),
  };
  if (options.additionalThemes) {
    for (const [name, palette] of Object.entries(options.additionalThemes)) {
      Object.assign(builtThemes, themesBuilder.addTheme(name, palette));
    }
  }
  // NOTE: Previously this stripped themes in production client builds
  // (TAMAGUI_ENVIRONMENT=client && NODE_ENV=production) assuming CSS-only
  // theming. This optimization breaks builds served outside Tamagui's SSR
  // pipeline (e.g. the Frappe SPA) where runtime JS themes are required.
  // Always keep themes to ensure TamaguiProvider has valid theme data.
  const themes = options.subset ? subsetThemes(builtThemes, options.subset) : builtThemes;
  return createThemeConfig(
    {
      ...defaultConfig,
      animations: options.animations ?? animations,
      disableSSR: false,
      fonts: {
        ...defaultConfig.fonts,
        ...defaultFonts,
        ...options.fonts,
      },
      shorthands,
      shouldAddPrefersColorThemes: true,
      themeClassNameOnRoot: true,
      themes,
      allowedStyleValues: undefined,
      // Tokens come from `defaultConfig` above, and from nothing else — see
      // the `tamaguiEra` note. There is no second token source to disagree
      // with the era pin.
      settings: {
        ...defaultConfig.settings,
        allowedStyleValues: 'somewhat-strict-web',
        defaultFont: 'body',
        fastSchemeChange: true,
        maxDarkLightNesting: 2,
        mediaQueryDefaultActive,
        onlyAllowShorthands: false,
        shouldAddPrefersColorThemes: true,
        themeClassNameOnRoot: true,
        ...options.settings,
      },
      ...options.tamagui,
    },
    {
      presets: options.presets,
      defaultPreset: options.defaultPreset,
      recipeInputs: getSizeRecipeInputs(),
      recipeFamilies: getGeneratedSizeRecipes().families,
    },
  );
}

/**
 * createDefaultThemeConfig specs — the consumer-facing batteries-included
 * factory. Locks down the `builderOptions.getTheme` COMPOSITION contract:
 * a consumer's partial getTheme merges over the framework default instead
 * of replacing it, so the derived solid
 * `$outlineColor` focus ring and the component sub-theme anchors survive,
 * and consumer keys that resolve to undefined inside narrow sub-theme
 * templates never leak the literal string "undefined" into theme values
 * (the t_Button `--backgroundPress: undefined` regression).
 *
 * `createTamagui` is mocked pass-through: these specs pin OUR factory's
 * theme building, not Tamagui's config processing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('tamagui', () => ({
  createTamagui: vi.fn((config: Record<string, unknown>) => config),
}));

// The reanimated animation driver imports react-native, which has no Node
// build; themes are what these specs pin, so stub the driver out.
vi.mock('./animations/index', () => ({ animations: {} }));

import {
  defaultConfig as v5DefaultConfig,
  mediaQueryDefaultActive as v5MediaQueryDefaultActive,
} from '@tamagui/config/v5';
import { tokens as v5Tokens } from '@tamagui/themes/v5';

import { contrastRatio, minContrastRatio, normalizeToHex, relativeLuminance } from './colorRules';
import { TAMAGUI_ERA, createDefaultThemeConfig } from './createDefaultThemeConfig';
import type { GetThemeProps } from './createThemes';
import { setSizeRecipeInputs } from './sizeRecipes';

// Mirrors the shc app theme config: a consumer getTheme written against the
// FULL base ramp (theme.colorN) with no outlineColor of its own. Inside
// component sub-themes (t_Button, ...) every one of these reads undefined.
function consumerGetTheme({ theme }: GetThemeProps): Record<string, string> {
  return {
    backgroundPress: theme.color5,
    backgroundFocus: theme.color6,
    backgroundActive: theme.color4,
    placeholderColor: theme.color10,
    borderColor: theme.color5,
    borderColorHover: theme.color6,
    borderColorFocus: theme.color7,
    borderColorPress: theme.color7,
    textMuted: theme.color10,
    textSubtle: theme.color6,
  };
}

// With createTamagui mocked pass-through, config.tamagui IS the raw config
// object, so .themes is the raw built themes record.
type RawThemes = Record<string, Record<string, string>>;

function buildThemes(): RawThemes {
  const config = createDefaultThemeConfig({
    builderOptions: { getTheme: consumerGetTheme },
  }) as unknown as { tamagui: { themes: RawThemes } };
  return config.tamagui.themes;
}

describe('createDefaultThemeConfig — builderOptions.getTheme composition', () => {
  afterEach(() => {
    setSizeRecipeInputs();
  });
  const themes = buildThemes();

  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: custom getTheme keeps the derived solid ≥3:1 $outlineColor`, () => {
      const theme = themes[scheme];
      expect(theme).toBeTruthy();
      const ring = normalizeToHex(theme.outlineColor);
      const bg1 = normalizeToHex(theme.color1);
      const bg2 = normalizeToHex(theme.color2);
      expect(ring).toBeTruthy();
      expect(bg1).toBeTruthy();
      expect(bg2).toBeTruthy();
      const c1 = contrastRatio(relativeLuminance(ring!), relativeLuminance(bg1!));
      const c2 = contrastRatio(relativeLuminance(ring!), relativeLuminance(bg2!));
      expect(Math.min(c1, c2)).toBeGreaterThanOrEqual(minContrastRatio);
    });
  }

  it('consumer keys win over the default derivation per key', () => {
    // Default getTheme anchors textMuted at color11; the consumer moves it
    // to color10 — composition must keep the consumer's choice.
    for (const scheme of ['light', 'dark'] as const) {
      expect(themes[scheme].textMuted).toBe(themes[scheme].color10);
    }
  });

  it('component sub-themes keep template values instead of literal undefined', () => {
    const subThemeNames = Object.keys(themes).filter((name) => name.endsWith('_Button'));
    expect(subThemeNames.length).toBeGreaterThan(0);
    for (const name of subThemeNames) {
      for (const [key, value] of Object.entries(themes[name])) {
        expect(value, `${name}.${key}`).toBeDefined();
        expect(String(value), `${name}.${key}`).not.toBe('undefined');
      }
    }
  });

  it('component sub-themes still derive a solid outlineColor', () => {
    for (const name of ['light_Button', 'dark_Button']) {
      const subTheme = themes[name];
      expect(subTheme, name).toBeTruthy();
      const ring = subTheme.outlineColor;
      expect(ring, `${name}.outlineColor`).toBeTruthy();
      expect(normalizeToHex(ring), `${name}.outlineColor solid`).toBeTruthy();
    }
  });

  it('no built theme carries an undefined or literal-undefined value', () => {
    for (const [name, theme] of Object.entries(themes)) {
      for (const [key, value] of Object.entries(theme)) {
        expect(value, `${name}.${key}`).not.toBeUndefined();
        expect(value, `${name}.${key}`).not.toBeNull();
        expect(String(value), `${name}.${key}`).not.toBe('undefined');
      }
    }
  });

  it('recipeInputs: { baseHeight: 40 } regenerates the control family on ThemeConfig, not color themes', () => {
    const config = createDefaultThemeConfig({
      recipeInputs: { baseHeight: 40 },
    });
    expect(config.recipeFamilies?.control.boxVariants.$4.height).toBe(40);
    expect(config.recipeFamilies?.control.recipes.$4).toEqual({
      height: 40,
      paddingHorizontal: Math.round(40 * (18 / 44)),
      fontSize: Math.round(40 * (14 / 44)),
      iconSize: Math.round(40 * (16 / 44)),
      gap: Math.round(40 * (9 / 44)),
    });
    expect(config.recipeInputs?.baseHeight).toBe(40);
    const themes = (config.tamagui as unknown as { themes: RawThemes }).themes;
    for (const [name, theme] of Object.entries(themes)) {
      expect(theme, name).not.toHaveProperty('baseHeight');
      expect(theme, name).not.toHaveProperty('radiusPx');
      expect(theme, name).not.toHaveProperty('paddingHorizontal');
      expect(theme, name).not.toHaveProperty('sizeFactors');
    }
  });

  it('zero-options build matches the default getTheme behavior', () => {
    const config = createDefaultThemeConfig();
    const themes = (config.tamagui as unknown as { themes: RawThemes }).themes;
    for (const scheme of ['light', 'dark'] as const) {
      const theme = themes[scheme];
      expect(normalizeToHex(theme.outlineColor)).toBeTruthy();
      expect(theme.textMuted).toBe(theme.color11);
    }
    expect(config.recipeFamilies?.control.boxVariants.$4.height).toBe(44);
  });

  it('registers serif so headingFont can resolve a family without a per-app font map', () => {
    const config = createDefaultThemeConfig() as unknown as {
      tamagui: { fonts: Record<string, { family?: string | { val?: string } }> };
    };
    const serif = config.tamagui.fonts.serif;
    expect(serif, 'serif font').toBeTruthy();
    const family = typeof serif.family === 'string' ? serif.family : serif.family?.val;
    expect(family).toMatch(/Georgia/);
  });

  it('keeps consumer heading/body overrides without dropping the serif category', () => {
    const heading = { family: 'ConsumerHeading' };
    const body = { family: 'ConsumerBody' };
    const config = createDefaultThemeConfig({
      fonts: { heading: heading as never, body: body as never },
    }) as unknown as {
      tamagui: { fonts: Record<string, { family?: string | { val?: string } }> };
    };
    expect(config.tamagui.fonts.heading).toBe(heading);
    expect(config.tamagui.fonts.body).toBe(body);
    const serif = config.tamagui.fonts.serif;
    const family = typeof serif?.family === 'string' ? serif.family : serif?.family?.val;
    expect(family).toMatch(/Georgia/);
  });
});

// ── Tamagui era pin ──
//
// v5 is the authoritative era. These specs assert the RESOLVED config, not
// the imports: a future re-point of createDefaultThemeConfig at another era
// (v4 media/tokens, or the legacy root entry drifting its values) fails here
// even if TAMAGUI_ERA is left saying "v5". The color token group is
// deliberately NOT asserted: v5 moved palettes out of tokens into themes, and
// the legacy palette color tokens ($blue10, …) remain as a compatibility
// surface with live call sites across packages/ — their fate is decided
// separately, not part of the pin.

type TokenValue = { val?: unknown } | string | number;
type RawTokens = Record<string, Record<string, TokenValue>>;

/** Flatten one token group to `{ key(without $): primitive value }`. */
function tokenGroupValues(tokens: RawTokens, group: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tokens[group] ?? {})) {
    const name = key.startsWith('$') ? key.slice(1) : key;
    out[name] = value && typeof value === 'object' && 'val' in value ? (value as { val: unknown }).val : value;
  }
  return out;
}

describe('createDefaultThemeConfig — Tamagui era pin', () => {
  const config = createDefaultThemeConfig() as unknown as {
    tamagui: {
      media: Record<string, unknown>;
      settings: Record<string, unknown>;
      tokens: RawTokens;
    };
  };

  it(`declares the era: ${TAMAGUI_ERA}`, () => {
    expect(TAMAGUI_ERA).toBe('v5');
  });

  it('resolves the v5 media map, and no dead prior-era key survives', () => {
    expect(config.tamagui.media).toEqual(v5DefaultConfig.media);
    // v5 signature: the sm/…/xxl min-width ladder plus the small container steps.
    for (const key of ['xxxs', 'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl']) {
      expect(config.tamagui.media, `media.${key}`).toHaveProperty(key);
    }
    // Dead eras: gtSm/gtXs (v3-era config) and 2xl/2xs/maxSm (v4) must not resolve.
    for (const key of ['gtXs', 'gtSm', 'gtMd', 'gtLg', '2xl', '2xs', 'maxSm', 'max2Xl']) {
      expect(config.tamagui.media, `media.${key}`).not.toHaveProperty(key);
    }
    expect(config.tamagui.settings.mediaQueryDefaultActive).toEqual(v5MediaQueryDefaultActive);
  });

  it('resolves v5 token values exactly for every non-color group', () => {
    const groups = ['size', 'space', 'radius', 'zIndex'] as const;
    for (const group of groups) {
      const resolved = tokenGroupValues(config.tamagui.tokens, group);
      const v5 = tokenGroupValues(v5Tokens as unknown as RawTokens, group);
      expect(Object.keys(v5).length, `${group} group present in v5`).toBeGreaterThan(0);
      expect(resolved, `tokens.${group}`).toEqual(v5);
    }
  });

  it('anchors radius.true at 9, the v5 base radius', () => {
    const radius = tokenGroupValues(config.tamagui.tokens, 'radius');
    expect(radius.true).toBe(9);
    expect(radius['4']).toBe(9);
  });

  it('anchors size.true at 44, the v5 base control height', () => {
    const size = tokenGroupValues(config.tamagui.tokens, 'size');
    expect(size.true).toBe(44);
    expect(size['4']).toBe(44);
  });
});

import * as Colors from '@tamagui/colors';
import { defaultConfig } from '@tamagui/config/v5';
import { describe, expect, it } from 'vitest';

import { normalizeToHex } from '../theme/colorRules';
import { defaultAccentTheme } from '../theme/defaults/accent';
import { defaultBaseTheme } from '../theme/defaults/base';
import { interTrackingPx } from '../theme/defaults/fonts';

import { FIGMA_THEME_MODES, buildFigmaTokens, figmaTokenName } from './figmaTokens';

const fontFamilies = {
  'sans-serif': 'Inter',
  pixel: "'Silkscreen', 'Press Start 2P', monospace",
};

/**
 * The Tamagui theme-builder normalizes palette colors (hex→hsla) and may
 * round interior steps, so source↔built comparisons must be colorimetric.
 * True when the two CSS colors are within `tolerance` per RGB channel.
 */
function sameColor(a: string, b: string, tolerance = 3): boolean {
  const hexA = normalizeToHex(a);
  const hexB = normalizeToHex(b);
  if (!hexA || !hexB) {
    return false;
  }
  for (let i = 1; i < 7; i += 2) {
    const channelA = Number.parseInt(hexA.slice(i, i + 2), 16);
    const channelB = Number.parseInt(hexB.slice(i, i + 2), 16);
    if (Math.abs(channelA - channelB) > tolerance) {
      return false;
    }
  }
  return true;
}

describe('buildFigmaTokens', () => {
  const result = buildFigmaTokens({ fontFamilies });

  it('is deterministic (pure transform, golden-comparable)', () => {
    expect(JSON.stringify(result)).toBe(JSON.stringify(buildFigmaTokens({ fontFamilies })));
  });

  describe('palette', () => {
    it('exports the 9 spec theme modes with 12-step light+dark ramps', () => {
      expect(Object.keys(result.palette.themes)).toEqual([...FIGMA_THEME_MODES]);
      for (const theme of Object.values(result.palette.themes)) {
        expect(theme.light).toHaveLength(12);
        expect(theme.dark).toHaveLength(12);
      }
    });

    it('derives base/accent ramps from the canonical default palettes', () => {
      // The theme-builder rounds/normalizes palette values, so the export
      // reflects the BUILT runtime themes — every step must still be
      // colorimetrically the canonical source step.
      for (const scheme of ['light', 'dark'] as const) {
        const built = result.palette.themes.base[scheme];
        const source = scheme === 'light' ? defaultBaseTheme.lightPalette : defaultBaseTheme.darkPalette;
        for (let i = 0; i < 12; i++) {
          expect(sameColor(built[i], source[i])).toBe(true);
        }
      }
      expect(defaultAccentTheme.lightPalette).toContain(result.palette.themes.accent.light[0]);
      expect(defaultAccentTheme.darkPalette).toContain(result.palette.themes.accent.dark[0]);
    });

    it('derives intent ramps from @tamagui/colors (error=red, success=green, warning=yellow)', () => {
      // Built themes carry hsla-normalized values; compare colorimetrically.
      const includesColor = (ramp: string[], value: string) => ramp.some((step) => sameColor(step, value));
      expect(includesColor(result.palette.themes.error.light, Colors.red.red9)).toBe(true);
      expect(includesColor(result.palette.themes.error.dark, Colors.redDark.red9)).toBe(true);
      expect(includesColor(result.palette.themes.success.light, Colors.green.green9)).toBe(true);
      expect(includesColor(result.palette.themes.warning.light, Colors.yellow.yellow9)).toBe(true);
    });

    it('exports tint ramps with neutralized text tiers (runtime reality, not stock Radix)', () => {
      // neutralizeTintText re-anchors color11/color12 of tint sub-themes to
      // the neutral base scheme.
      expect(result.palette.themes.orange.light[11]).toBe(result.palette.themes.base.light[11]);
      expect(result.palette.themes.purple.dark[10]).toBe(result.palette.themes.base.dark[10]);
      // Non-text steps keep the hue.
      expect(result.palette.themes.orange.light[8]).not.toBe(result.palette.themes.base.light[8]);
    });

    it('exports 6 shadow steps per scheme from the base theme', () => {
      expect(Object.keys(result.palette.shadows.light)).toHaveLength(6);
      expect(result.palette.shadows.light.shadow1).toBe(defaultBaseTheme.lightShadows?.shadow1);
      expect(result.palette.shadows.dark.shadow6).toBe(defaultBaseTheme.darkShadows?.shadow6);
    });
  });

  describe('semantic', () => {
    it('derives the current interaction-ramp aliases (post-knobs rebuild)', () => {
      // The seven pinned ramp steps were deleted from
      // `defaultBuilderOptions.getTheme`, so these aliases are the theme
      // BUILDER's derivation again rather than a local re-anchoring. That is
      // the correction landing, and what this pins is that it landed —
      // borderColor back off color5, the background states no longer forced.
      expect(result.semantic.borderColor?.alias).toBe('color4');
      expect(result.semantic.textMuted?.alias).toBe('color11');
      expect(result.semantic.placeholderColor?.alias).toBe('color10');
      expect(result.semantic.surfaceMuted?.alias).toBe('color10');
      expect(result.semantic.borderStrong?.alias).toBe('color7');
    });

    it('exports the computed focus ring color (outlineColor) with per-scheme values', () => {
      const outline = result.semantic.outlineColor;
      expect(outline).toBeDefined();
      expect(outline?.light).toBeTruthy();
      expect(outline?.dark).toBeTruthy();
    });

    it('derives textAccent knob tiers as text-low/medium/high', () => {
      expect(result.semantic['text-low']?.alias).toBe('color11');
      expect(result.semantic['text-medium']?.alias).toBe('color11');
      expect(result.semantic['text-high']?.alias).toBe('color12');
    });

    it('excludes raw Radix hue steps (amber1, blueA12, ...) from semantic', () => {
      const keys = Object.keys(result.semantic);
      expect(keys.some((key) => /^(amber|blue|red|mauve)A?\d+$/.test(key))).toBe(false);
      // Semantic surface is role tokens only — small, not the 600+ hue dump.
      expect(keys.length).toBeGreaterThan(20);
      expect(keys.length).toBeLessThan(100);
    });

    it('only aliases when light and dark agree; raw entries keep both values', () => {
      for (const entry of Object.values(result.semantic)) {
        if (entry.alias === null) {
          expect(typeof entry.light).toBe('string');
          expect(typeof entry.dark).toBe('string');
        } else {
          expect(entry.alias).toMatch(/^color([1-9]|1[0-2])$/);
        }
      }
    });
  });

  describe('sizing', () => {
    it('mirrors the v5 defaultConfig tokens with figma-safe names', () => {
      // Read against the ERA the package pins, not against a
      // transcribed table: v5 keys carry the `$`, values are raw numbers.
      const size = defaultConfig.tokens.size as Record<string, number>;
      expect(result.sizing['size-true']).toBe(size.$true);
      expect(result.sizing['radius-4']).toBe((defaultConfig.tokens.radius as Record<string, number>)['4']);
      expect(result.sizing['space-1-5']).toBe((defaultConfig.tokens.space as Record<string, number>)['$1.5']);
    });

    it('exports knob-shaped borderWidth values including the 0.5 hairline', () => {
      expect(result.sizing['borderWidth-none']).toBe(0);
      expect(result.sizing['borderWidth-small']).toBe(0.5);
      expect(result.sizing['borderWidth-medium']).toBe(1);
      expect(result.sizing['borderWidth-large']).toBe(2);
    });
  });

  describe('knobs (resolved via resolveKnobs — no copied maps)', () => {
    it('exports current borderRadius modes (medium=$4, not the May-era $3)', () => {
      const { modes, default: def } = result.knobs.borderRadius;
      expect(def).toBe('medium');
      expect(modes.none.token).toBe('$0');
      expect(modes.small.token).toBe('$2');
      expect(modes.medium.token).toBe('$4');
      expect(modes.large.token).toBe('$6');
      expect(modes.full.token).toBe('$12');
      expect(modes.medium.figmaName).toBe('radius-4');
      expect(modes.medium.px).toBe(result.sizing['radius-4']);
      // Outer/nested radius fragment landed with the knobs rebuild.
      expect(modes.full.outerToken).toBe('$5');
    });

    it('exports borderWidth knob modes', () => {
      expect(result.knobs.borderWidth.modes).toEqual({
        none: 0,
        small: 0.5,
        medium: 1,
        large: 2,
      });
    });

    it('exports platform-normalized elevation modes', () => {
      const { modes } = result.knobs.elevation;
      expect(modes.none).toEqual({ sizeToken: null, px: null });
      expect(modes.small).toEqual({ sizeToken: null, px: null });
      expect(modes.medium.sizeToken).toBe('$2');
      expect(modes.large.sizeToken).toBe('$4');
    });

    it('exports fontWeight, space, size and cornerSmoothing modes', () => {
      expect(result.knobs.fontWeight.modes).toEqual({ regular: '400', bold: '700' });
      expect(result.knobs.space.modes.medium.paddingFigmaName).toBe('space-4');
      expect(result.knobs.space.modes.medium.gapFigmaName).toBe('space-4');
      expect(result.knobs.space.modes.medium.gapLgFigmaName).toBe('space-5');
      expect(result.knobs.size.modes).toEqual({
        small: { token: '$3', figmaName: 'size-3' },
        medium: { token: '$4', figmaName: 'size-4' },
        large: { token: '$5', figmaName: 'size-5' },
      });
      expect(result.knobs.cornerSmoothing.modes).toEqual({ round: 0, smooth: 0.6 });
    });

    it('exports density compact stepping for space only (size is uncoupled)', () => {
      expect(result.knobs.density.default).toBe('comfortable');
      expect(result.knobs.density.compact.size).toEqual({
        small: 'small',
        medium: 'medium',
        large: 'large',
      });
      expect(result.knobs.density.compact.space).toEqual({
        small: 'small',
        medium: 'small',
        large: 'medium',
      });
    });
  });

  describe('typography (closes deferred task 10.0)', () => {
    it('exports heading/body size + lineHeight tables from the built default fonts', () => {
      // Heading rides the body scale now, so H1 $10 is 40 at
      // weight 800 rather than 64 at 400, and body $true is v5's 15 with the
      // tapering leading instead of v4's 14 with `size + 10`.
      expect(result.typography.heading.size['10']).toBe(40);
      expect(result.typography.body.size.true).toBe(15);
      expect(result.typography.body.lineHeight.true).toBe(23);
      expect(result.typography.heading.lineHeight['10']).toBe(50);
    });

    it('exports Inter dynamic tracking per size', () => {
      const body = result.typography.body;
      expect(body.letterSpacing.true).toBe(interTrackingPx(15));
      expect(Object.keys(body.letterSpacing).length).toBeGreaterThanOrEqual(16);
    });

    it('exports category stacks with a Figma-usable first family', () => {
      expect(result.typography.categories.pixel.figmaFamily).toBe('Silkscreen');
      expect(result.typography.categories['sans-serif'].figmaFamily).toBe('Inter');
    });
  });

  it('figmaTokenName converts Tamagui token keys to Figma-safe names', () => {
    expect(figmaTokenName('size', '1.5')).toBe('size-1-5');
    expect(figmaTokenName('space', 'true')).toBe('space-true');
    expect(figmaTokenName('space', '-0.25')).toBe('space--0-25');
  });
});

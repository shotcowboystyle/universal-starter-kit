import { describe, expect, it } from 'vitest';

import { contrastRatio, normalizeToHex, relativeLuminance } from './colorRules';
import { createThemesBuilder } from './createThemes';
import { defaultAccentTheme } from './defaults/accent';
import { defaultBaseTheme } from './defaults/base';
import { defaultBuilderOptions } from './defaults/builderOptions';

const themes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

const hex = (raw: string) => {
  const value = normalizeToHex(raw);
  if (!value) {
    throw new Error(`not an opaque colour: ${raw}`);
  }
  return value;
};
const ratio = (a: string, b: string) => contrastRatio(relativeLuminance(hex(a)), relativeLuminance(hex(b)));

describe('the built accent pair holds Axiom 12', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const theme = themes[scheme];

    it(`${scheme} $accentBackground carries AA text with its better anchor and 3:1 on the page`, () => {
      const fill = theme.accentBackground;
      expect(Math.max(ratio(fill, theme.color1), ratio(fill, theme.color12))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(fill, theme.color1)).toBeGreaterThanOrEqual(3);
    });

    it(`${scheme} $accentColor reads at 4.5:1 on $color1 through $color3`, () => {
      for (const surface of [theme.color1, theme.color2, theme.color3]) {
        expect(ratio(theme.accentColor, surface)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("light keeps the builder's pair; dark takes the nearest steps that hold", () => {
    expect(hex(themes.light.accentBackground)).toBe('#634fc4');
    expect(hex(themes.light.accentColor)).toBe('#3d2e8a');
    expect(themes.dark.accentBackground).toBe(themes.dark.accent9);
    expect(themes.dark.accentColor).toBe(themes.dark.accent11);
  });

  it('the intent children carry the corrected pair and the inverse component themes keep theirs', () => {
    for (const name of ['dark_warning', 'dark_error', 'dark_success']) {
      expect(themes[name].accentBackground).toBe(themes.dark.accentBackground);
      expect(themes[name].accentColor).toBe(themes.dark.accentColor);
    }
    expect(hex(themes.dark_Tooltip.accentBackground)).toBe('#46349d');
    expect(hex(themes.dark_Tooltip.accentColor)).toBe('#7766cc');
  });
});

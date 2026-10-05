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

const hues = ['purple', 'green', 'blue', 'orange', 'red'] as const;
const token = (hue: (typeof hues)[number]) => `syntax${hue[0].toUpperCase()}${hue.slice(1)}`;

describe('code syntax ink holds Axiom 12 on the code surface', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const theme = themes[scheme];
    for (const hue of hues) {
      it(`${scheme} $${token(hue)} reads at 4.5:1 on $color3 and on the $${hue}3 wash`, () => {
        expect(ratio(theme[token(hue)], theme.color3)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(theme[token(hue)], theme[`${hue}3`])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('dark keeps step 11; light walks green, blue and orange toward step 12', () => {
    for (const hue of hues) {
      expect(themes.dark[token(hue)]).toBe(hex(themes.dark[`${hue}11`]));
    }
    expect(themes.light.syntaxPurple).toBe(hex(themes.light.purple11));
    expect(themes.light.syntaxRed).toBe(hex(themes.light.red11));
    expect(themes.light.syntaxGreen).toBe('#207c54');
    expect(themes.light.syntaxBlue).toBe('#0d6dc3');
    expect(themes.light.syntaxOrange).toBe('#bb4904');
  });

  it('the tokens ride exactly the themes that carry the hue ramps', () => {
    for (const theme of Object.values(themes)) {
      expect(Boolean(theme.syntaxGreen)).toBe(Boolean(theme.green11 && theme.color3));
    }
  });
});

/**
 * Fields tint their error state with the semantic `error` theme,
 * which the default subset keeps, instead of the decorative `red` it drops.
 * Entered text stays neutral under it (T-VALUE); everything else keeps the hue.
 */

import type { CreateTamaguiProps } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultThemeConfig } from './create-default-theme-config';
import { createThemesBuilder } from './create-themes';
import { defaultAccentTheme } from './defaults/accent';
import { defaultBaseTheme } from './defaults/base';
import { defaultBuilderOptions } from './defaults/builder-options';

// oxlint-disable-next-line vitest/prefer-import-in-mock -- pass-through stand-in for createTamagui cannot satisfy Tamagui's generic return type
vi.mock('tamagui', () => ({
  createTamagui: vi.fn<(config: CreateTamaguiProps) => CreateTamaguiProps>((config) => config),
}));
// oxlint-disable-next-line vitest/prefer-import-in-mock -- empty animation driver stand-in; the real driver type is not constructible here
vi.mock('./animations/index', () => ({ animations: {} }));

type Themes = Record<string, Record<string, string>>;

const built = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes() as Themes;

const schemes = ['light', 'dark'] as const;
const intents = ['error', 'warning', 'success'] as const;
const entryText = ['color', 'colorHover', 'colorPress', 'colorFocus', 'placeholderColor'] as const;

const controls = ['Input', 'TextArea'] as const;

const schemeIntents = schemes.flatMap((scheme) => intents.map((intent) => ({ scheme, intent })));
const schemeIntentControls = schemeIntents.flatMap((row) => controls.map((control) => ({ ...row, control })));

describe('entered text under a semantic intent', () => {
  it.each(schemeIntentControls)(
    '$scheme $intent $control keeps the neutral control value ink and its own hue chrome',
    ({ scheme, intent, control }) => {
      const themed = built[`${scheme}_${intent}_${control}`];
      const neutral = built[`${scheme}_${control}`];
      for (const key of entryText.filter((entryKey) => neutral[entryKey] != null)) {
        expect(themed[key]).toBe(neutral[key]);
      }
      expect(themed.color11).toBe(built[scheme].color11);
      expect(themed.color12).toBe(built[scheme].color12);
      expect(themed.borderColor).not.toBe(neutral.borderColor);
      expect(themed.background).not.toBe(neutral.background);
    },
  );

  it.each(schemeIntents)(
    '$scheme $intent keeps its hue text and takes the neutral placeholder',
    ({ scheme, intent }) => {
      const themed = built[`${scheme}_${intent}`];
      expect(themed.placeholderColor).toBe(built[scheme].placeholderColor);
      expect(themed.color).not.toBe(built[scheme].color);
      expect(themed.color12).not.toBe(built[scheme].color12);
    },
  );

  it.each(schemeIntents)('$scheme $intent Button keeps its on-fill label', ({ scheme, intent }) => {
    expect(built[`${scheme}_${intent}_Button`].color).not.toBe(built[`${scheme}_Button`].color);
  });
});

describe('the default subset keeps the field error tint', () => {
  const defaultTints = ['accent', 'active', 'alt1', 'alt2', 'error', 'success', 'warning'];
  const full = createDefaultThemeConfig().tamagui.themes;
  const subset = createDefaultThemeConfig({
    subset: { components: ['Button', 'Input', 'TextArea'], tints: defaultTints },
  }).tamagui.themes;

  it('builds every theme a field enters in its error state, identical to the full config', () => {
    for (const scheme of schemes) {
      for (const name of [
        `${scheme}_error`,
        `${scheme}_error_Input`,
        `${scheme}_error_TextArea`,
        `${scheme}_error_Button`,
      ]) {
        expect(subset).toHaveProperty(name);
        expect(subset[name]).toStrictEqual(full[name]);
      }
      expect(full).toHaveProperty(`${scheme}_red`);
      expect(subset).not.toHaveProperty(`${scheme}_red`);
    }
  });
});

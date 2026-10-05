/**
 * Fields tint their error state with the semantic `error` theme,
 * which the default subset keeps, instead of the decorative `red` it drops.
 * Entered text stays neutral under it (T-VALUE); everything else keeps the hue.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('tamagui', () => ({
  createTamagui: vi.fn((config: Record<string, unknown>) => config),
}));
vi.mock('./animations/index', () => ({ animations: {} }));

import { createDefaultThemeConfig } from './createDefaultThemeConfig';
import { createThemesBuilder } from './createThemes';
import { defaultAccentTheme } from './defaults/accent';
import { defaultBaseTheme } from './defaults/base';
import { defaultBuilderOptions } from './defaults/builderOptions';

type Themes = Record<string, Record<string, string>>;

const built = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes() as Themes;

const schemes = ['light', 'dark'] as const;
const intents = ['error', 'warning', 'success'] as const;
const entryText = ['color', 'colorHover', 'colorPress', 'colorFocus', 'placeholderColor'] as const;

describe('entered text under a semantic intent', () => {
  for (const scheme of schemes) {
    for (const intent of intents) {
      for (const control of ['Input', 'TextArea'] as const) {
        it(`${scheme}_${intent}_${control} keeps the neutral ${control}'s value ink and its own hue chrome`, () => {
          const themed = built[`${scheme}_${intent}_${control}`];
          const neutral = built[`${scheme}_${control}`];
          for (const key of entryText) {
            if (neutral[key] != null) {
              expect(themed[key], key).toBe(neutral[key]);
            }
          }
          expect(themed.color11).toBe(built[scheme].color11);
          expect(themed.color12).toBe(built[scheme].color12);
          expect(themed.borderColor).not.toBe(neutral.borderColor);
          expect(themed.background).not.toBe(neutral.background);
        });
      }

      it(`${scheme}_${intent} keeps its hue text and takes the neutral placeholder`, () => {
        const themed = built[`${scheme}_${intent}`];
        expect(themed.placeholderColor).toBe(built[scheme].placeholderColor);
        expect(themed.color).not.toBe(built[scheme].color);
        expect(themed.color12).not.toBe(built[scheme].color12);
      });

      it(`${scheme}_${intent}_Button keeps its on-fill label`, () => {
        expect(built[`${scheme}_${intent}_Button`].color).not.toBe(built[`${scheme}_Button`].color);
      });
    }
  }
});

describe('the default subset keeps the field error tint', () => {
  const defaultTints = ['accent', 'active', 'alt1', 'alt2', 'error', 'success', 'warning'];
  const full = createDefaultThemeConfig().tamagui.themes as Record<string, unknown>;
  const subset = createDefaultThemeConfig({
    subset: { components: ['Button', 'Input', 'TextArea'], tints: defaultTints },
  }).tamagui.themes as Record<string, unknown>;

  it('builds every theme a field enters in its error state, identical to the full config', () => {
    for (const scheme of schemes) {
      for (const name of [
        `${scheme}_error`,
        `${scheme}_error_Input`,
        `${scheme}_error_TextArea`,
        `${scheme}_error_Button`,
      ]) {
        expect(subset, name).toHaveProperty(name);
        expect(subset[name]).toEqual(full[name]);
      }
      expect(full).toHaveProperty(`${scheme}_red`);
      expect(subset).not.toHaveProperty(`${scheme}_red`);
    }
  });
});

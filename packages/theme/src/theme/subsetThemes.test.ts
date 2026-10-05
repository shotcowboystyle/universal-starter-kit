/**
 * A narrow surface ships a narrow theme matrix. The filter
 * is pinned twice, once over hand-named themes and once over the matrix the
 * house builder really emits, so a builder rename that stops a component
 * sub-theme matching shows up here rather than as an untinted control.
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
import { type ThemeSubset, subsetThemes } from './subsetThemes';

const narrow: ThemeSubset = {
  components: ['Button', 'Input'],
  tints: ['accent', 'active', 'error'],
};

describe('subsetThemes', () => {
  const names = [
    'light',
    'dark',
    'light_accent',
    'dark_accent_Button',
    'light_Button',
    'light_Input',
    'light_active_Button',
    'light_error',
    'light_blue',
    'dark_blue_Button',
    'light_Tooltip',
    'light_accent_Tooltip',
  ];
  const themes = Object.fromEntries(names.map((name) => [name, { name }]));

  it('keeps the bare schemes and every listed tint x component, and nothing else', () => {
    expect(Object.keys(subsetThemes(themes, narrow))).toEqual([
      'light',
      'dark',
      'light_accent',
      'dark_accent_Button',
      'light_Button',
      'light_Input',
      'light_active_Button',
      'light_error',
    ]);
  });

  it('never rewrites a theme it keeps: filtering is not redefinition', () => {
    const kept = subsetThemes(themes, narrow);
    for (const [name, theme] of Object.entries(kept)) {
      expect(theme).toBe(themes[name]);
    }
  });

  it('keeps only the schemes when the subset is empty', () => {
    expect(Object.keys(subsetThemes(themes, { components: [], tints: [] }))).toEqual(['light', 'dark']);
  });
});

describe('subsetThemes over the house matrix', () => {
  const built = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes() as Record<
    string,
    Record<string, unknown>
  >;

  it('drops the decorative hues and keeps the semantic and state children', () => {
    const kept = subsetThemes(built, {
      components: ['Button'],
      tints: ['accent', 'active', 'alt1', 'alt2', 'error', 'success', 'warning'],
    });
    expect(Object.keys(kept).length).toBeLessThan(Object.keys(built).length / 4);
    for (const name of ['light', 'dark', 'light_accent', 'light_Button', 'dark_error_Button']) {
      expect(kept).toHaveProperty(name);
    }
    for (const name of ['light_blue', 'dark_red', 'light_Tooltip', 'light_accent_Input']) {
      expect(built).toHaveProperty(name);
      expect(kept).not.toHaveProperty(name);
    }
  });

  it('is what createDefaultThemeConfig({ subset }) ships, and omitting it ships everything', () => {
    const full = createDefaultThemeConfig().tamagui.themes as Record<string, unknown>;
    const subset = createDefaultThemeConfig({ subset: narrow }).tamagui.themes as Record<string, unknown>;
    expect(Object.keys(full)).toEqual(Object.keys(built));
    expect(Object.keys(subset)).toEqual(Object.keys(subsetThemes(built, narrow)));
    expect(subset.light).toEqual(full.light);
  });
});

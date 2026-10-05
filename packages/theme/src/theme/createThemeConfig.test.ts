/**
 * createThemeConfig specs — the app-level config factory. Locks down the
 * `themeColors` extraction contract (a color exists only when BOTH
 * light_/dark_ variants exist, semantic/state sub-themes are excluded,
 * output is sorted), the root-theme-class settings defaults, and preset
 * registration through the shared registry.
 *
 * `createTamagui` is mocked pass-through: this spec pins OUR factory's
 * behavior, not Tamagui's config processing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('tamagui', () => ({
  // Identity-ish mock: createThemeConfig only forwards the object and reads
  // nothing back from Tamagui's processing.
  createTamagui: vi.fn((config: Record<string, unknown>) => config),
}));

import type { ThemeName } from '@tamagui/web';
import { createTamagui } from 'tamagui';

import { defaultKnobs } from './knobs';
import type { Preset } from './preset.types';
import { clearPresets, createThemeConfig, getPreset, getPresetNames } from './shared';

const mockedCreateTamagui = vi.mocked(createTamagui);

function makeThemes(names: string[]): Record<string, object> {
  return Object.fromEntries(names.map((name) => [name, {}]));
}

function makePreset(): Preset {
  return {
    theme: 'light' as ThemeName,
    knobs: { ...defaultKnobs },
    intents: {},
    tints: [],
  };
}

beforeEach(() => {
  clearPresets();
  mockedCreateTamagui.mockClear();
});

describe('createThemeConfig — themeColors extraction', () => {
  it('extracts colors that exist in both light and dark variants, sorted', () => {
    const config = createThemeConfig({
      themes: makeThemes(['light_blue', 'dark_blue', 'light_red', 'dark_red', 'light', 'dark']),
    } as never);
    expect(config.themeColors).toEqual(['blue', 'red']);
  });

  it('drops colors missing one scheme', () => {
    const config = createThemeConfig({
      themes: makeThemes(['light_blue', 'dark_blue', 'light_orphan']),
    } as never);
    expect(config.themeColors).toEqual(['blue']);
  });

  it('excludes semantic and state sub-themes from the picker list', () => {
    const config = createThemeConfig({
      themes: makeThemes([
        'light_blue',
        'dark_blue',
        'light_error',
        'dark_error',
        'light_success',
        'dark_success',
        'light_warning',
        'dark_warning',
        'light_accent',
        'dark_accent',
        'light_active',
        'dark_active',
        'light_alt1',
        'dark_alt1',
        'light_alt2',
        'dark_alt2',
      ]),
    } as never);
    expect(config.themeColors).toEqual(['blue']);
  });

  it('ignores mixed-case and nested sub-theme names', () => {
    const config = createThemeConfig({
      themes: makeThemes([
        'light_blue',
        'dark_blue',
        'light_Blue',
        'dark_Blue',
        'light_blue_Button',
        'dark_blue_Button',
      ]),
    } as never);
    expect(config.themeColors).toEqual(['blue']);
  });

  it('returns an empty list when the config carries no themes', () => {
    const config = createThemeConfig({} as never);
    expect(config.themeColors).toEqual([]);
  });
});

describe('createThemeConfig — settings and registration', () => {
  it('defaults the root theme class settings on and keeps user settings override', () => {
    createThemeConfig({ themes: {} } as never);
    const forwarded = mockedCreateTamagui.mock.calls[0][0] as Record<string, any>;
    expect(forwarded.settings.disableRootThemeClass).toBe(false);
    expect(forwarded.settings.themeClassNameOnRoot).toBe(true);

    mockedCreateTamagui.mockClear();
    createThemeConfig({
      themes: {},
      settings: { themeClassNameOnRoot: false },
    } as never);
    const overridden = mockedCreateTamagui.mock.calls[0][0] as Record<string, any>;
    expect(overridden.settings.themeClassNameOnRoot).toBe(false);
  });

  it('registers provided presets in the shared registry', () => {
    const material = makePreset();
    const config = createThemeConfig({ themes: {} } as never, {
      presets: { material },
      defaultPreset: 'material',
    });
    expect(getPresetNames()).toContain('material');
    expect(getPreset('material')).toBe(material);
    expect(config.defaultPreset).toBe('material');
    expect(config.presets).toEqual({ material });
  });

  it('registers nothing without presets', () => {
    createThemeConfig({ themes: {} } as never);
    expect(getPresetNames()).toEqual([]);
  });
});

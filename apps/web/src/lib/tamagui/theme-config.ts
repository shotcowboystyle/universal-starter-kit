import { createDefaultThemeConfig } from '@repo/theme';

/** Tamagui config (themes, tokens, fonts, knob presets) shared by every web screen. */
export const themeConfig = createDefaultThemeConfig({
  // next-themes owns the light/dark choice and the t_light / t_dark class on <html>;
  // Tamagui must not follow the OS scheme or write its own root class, or server
  // and client disagree during hydration.
  settings: { fastSchemeChange: false, addThemeClassName: false },
});

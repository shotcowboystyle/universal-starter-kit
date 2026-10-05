import type { ThemeBuilderDefinition } from '../createThemes';

export const defaultAccentTheme: ThemeBuilderDefinition = {
  darkPalette: [
    'hsla(250, 50%, 35%, 1)',
    'hsla(250, 50%, 38%, 1)',
    'hsla(250, 50%, 41%, 1)',
    'hsla(250, 50%, 43%, 1)',
    'hsla(250, 50%, 46%, 1)',
    'hsla(250, 50%, 49%, 1)',
    'hsla(250, 50%, 52%, 1)',
    'hsla(250, 50%, 54%, 1)',
    'hsla(250, 50%, 57%, 1)',
    'hsla(250, 50%, 60%, 1)',
    'hsla(250, 50%, 90%, 1)',
    'hsla(250, 50%, 95%, 1)',
  ],
  // Mirrors the darkPalette's shape: SOLID brand surfaces across [0..9] with
  // near-white foreground anchors at [10..11]. The theme-builder takes
  // palette[11] as the sub-theme `color` and palette[3] as the Button
  // surface — the old ramp (95%->40%, no light anchor) put 40%-purple text
  // on a 62%-purple button (2.3:1). Solid-with-white matches how tamagui v4
  // ships its accent (bg 9%, color white, 17.9:1); here: button 48%/98%
  // = 7.7:1.
  lightPalette: [
    'hsla(250, 50%, 62%, 1)',
    'hsla(250, 50%, 58%, 1)',
    'hsla(250, 50%, 54%, 1)',
    'hsla(250, 50%, 48%, 1)',
    'hsla(250, 50%, 46%, 1)',
    'hsla(250, 50%, 44%, 1)',
    'hsla(250, 50%, 42%, 1)',
    'hsla(250, 50%, 40%, 1)',
    'hsla(250, 50%, 38%, 1)',
    'hsla(250, 50%, 36%, 1)',
    'hsla(250, 50%, 95%, 1)',
    'hsla(250, 50%, 98%, 1)',
  ],
};

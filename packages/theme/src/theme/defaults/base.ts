import type { BaseThemeBuilderDefinition } from '../createThemes';

export const defaultBaseTheme: BaseThemeBuilderDefinition = {
  // Radix-mauve-shaped neutral ramps with a slight purple tint (hue 270)
  // harmonizing with the hsla(250) accent: near-white surfaces (1-2),
  // component/hover steps (3-5), borders (6-8), solid/muted (9-10),
  // readable text (11-12).
  //
  // Step 10 (muted-ink tier) is the catalog's de-facto "muted text" step —
  // placeholderColor, and ~20 components/stories set `color="$color10"` on
  // hints, captions, counts, subtitles and placeholders (UX-P01/UX-015).
  // At its old lightness (light 52% / dark 48%) it measured 3.76–3.98:1 on
  // color1/color2 — under the AA 4.5:1 floor for normal text (Axiom 12
  // LEGIBLE FLOOR). Re-anchored to light 46% / dark 54%, the lowest change
  // that clears 4.5:1 on BOTH page surfaces in both schemes (light 4.9/4.7,
  // dark 4.8/4.6) while staying a distinct tier above color11. Its non-text
  // roles (boundary rings, spinners, slider thumb — all ≥3:1 targets) only
  // gain contrast, so the shift is one-directional safe.
  darkPalette: [
    'hsla(270, 6%, 8.7%, 1)',
    'hsla(270, 6%, 10.5%, 1)',
    'hsla(270, 6%, 13.5%, 1)',
    'hsla(270, 6%, 16%, 1)',
    'hsla(270, 6%, 18.5%, 1)',
    'hsla(270, 6%, 21.5%, 1)',
    'hsla(270, 6%, 25.5%, 1)',
    'hsla(270, 6%, 32%, 1)',
    'hsla(270, 6%, 43%, 1)',
    'hsla(270, 6%, 54%, 1)',
    'hsla(270, 6%, 62.5%, 1)',
    'hsla(270, 6%, 94%, 1)',
  ],
  lightPalette: [
    'hsla(270, 6%, 99.5%, 1)',
    'hsla(270, 6%, 98.2%, 1)',
    'hsla(270, 6%, 95.2%, 1)',
    'hsla(270, 6%, 92.5%, 1)',
    'hsla(270, 6%, 90%, 1)',
    'hsla(270, 6%, 87%, 1)',
    'hsla(270, 6%, 82.5%, 1)',
    'hsla(270, 6%, 75%, 1)',
    'hsla(270, 6%, 56.5%, 1)',
    'hsla(270, 6%, 46%, 1)',
    'hsla(270, 6%, 40%, 1)',
    'hsla(270, 6%, 14%, 1)',
  ],
  lightShadows: {
    shadow1: 'rgba(0,0,0,0.04)',
    shadow2: 'rgba(0,0,0,0.08)',
    shadow3: 'rgba(0,0,0,0.16)',
    shadow4: 'rgba(0,0,0,0.24)',
    shadow5: 'rgba(0,0,0,0.32)',
    shadow6: 'rgba(0,0,0,0.4)',
  },
  darkShadows: {
    shadow1: 'rgba(0,0,0,0.2)',
    shadow2: 'rgba(0,0,0,0.3)',
    shadow3: 'rgba(0,0,0,0.4)',
    shadow4: 'rgba(0,0,0,0.5)',
    shadow5: 'rgba(0,0,0,0.6)',
    shadow6: 'rgba(0,0,0,0.7)',
  },
};

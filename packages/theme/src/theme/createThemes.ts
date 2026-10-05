import * as Colors from '@tamagui/colors';
import { createThemes as tamaguiCreateThemes, type CreateThemesProps } from '@tamagui/theme-builder';
import { themes as tamaguiThemes } from '@tamagui/themes';

import { aaTextContrastRatio, contrastRatio, minContrastRatio, normalizeToHex, relativeLuminance } from './colorRules';

/**
 * Radix aims a scale's step 11 at the AA text floor against ITS OWN
 * step 1-2, never against a foreign neutral. The theme paints intent ink on the BASE
 * theme's surfaces, and on `$color2` — `#f9f9fa`, the ground 35 catalog
 * surfaces and every gallery board actually paint — light `yellow11`
 * (`#9e6c00`) measures 4.34:1 and light `green11` (`#218358`) 4.48:1, both
 * under `colorRules`' `aaTextContrastRatio` of 4.5. So the stock stop is right
 * upstream and wrong here.
 *
 * Only these two stops move. Light `red11` clears at 4.95:1 and every dark
 * intent stop clears by 8.49:1 or more, measured, so red and both dark ramps
 * stay untouched stock Radix — as does every other step of yellow and green.
 *
 * The replacements are the smallest darkening that clears the floor on the
 * strictest base surface while holding the hue — dE76 1.94 for warning and
 * 0.70 for success, both far under the ~2.3 just-noticeable difference, so
 * neither intent hue visibly shifts.
 *
 * THESE ARE QUANTIZED VALUES, and that is not a detail. `createThemes` stores
 * every palette entry through color2k as `hsla()` with INTEGER degrees and
 * percentages, so the reachable palette is coarser than hex and a hex chosen
 * on paper is not what renders. The first pass here picked `#996800` /
 * `#208156` by minimising CIEDE2000 in hex space; `#208156` quantized to the
 * SAME `hsla(154, 60%, 32%)` as the stock stop and changed nothing at all,
 * while `#996800` landed two hundredths off its predicted ratio. Both values
 * below were searched in the quantized space and confirmed against the built
 * theme, not against the arithmetic.
 *
 * `$color11` is ALSO the solid intent Button's resting fill (`step(10)` in
 * `defaults/builderOptions.ts`), so this shifts that fill by the same
 * imperceptible amount. It improves it: the solid warning Button's
 * luminance-picked on-fill label was itself at 4.48:1 — a second, unpinned AA
 * miss. The `pickReadableForeground` anchor does not flip for either intent,
 * so no label changes colour.
 */
const intentInkFloor = {
  /** stored `hsla(41, 100%, 30%)`; 4.34:1 -> 4.56:1 on the base `$color2` */
  warning: '#996900',
  /** stored `hsla(155, 64%, 31%)`; 4.48:1 -> 4.56:1 on the base `$color2` */
  success: '#1c8257',
} as const;

/**
 * Replace a Radix ramp's step-11 ink stop, leaving all eleven other steps
 * stock. Radix ramps are 12 entries with step N at index N-1; anything else is
 * not a ramp this rule understands, so it passes through untouched rather than
 * writing to a position that means something different.
 */
function withIntentInkFloor(palette: string[], ink: string): string[] {
  if (palette.length !== 12) {
    return palette;
  }
  const stepped = [...palette];
  stepped[10] = ink;
  return stepped;
}

const grayTheme = {
  dark_gray: tamaguiThemes.dark,
  dark_gray_active: tamaguiThemes.dark_active,
  dark_gray_alt1: tamaguiThemes.dark_alt1,
  dark_gray_alt2: tamaguiThemes.dark_alt2,
  light_gray: tamaguiThemes.light,
  light_gray_active: tamaguiThemes.light_active,
  light_gray_alt1: tamaguiThemes.light_alt1,
  light_gray_alt2: tamaguiThemes.light_alt2,
};

export interface Shadows {
  shadow1: string;
  shadow2: string;
  shadow3: string;
  shadow4: string;
  shadow5: string;
  shadow6: string;
}

export interface ThemeBuilderDefinition<
  DarkPalette extends string[] = string[],
  LightPalette extends string[] = string[],
> {
  darkPalette: DarkPalette;
  lightPalette: LightPalette;
}

export interface BaseThemeBuilderDefinition<
  DarkPalette extends string[] = string[],
  LightPalette extends string[] = string[],
  DarkShadows extends Shadows = Shadows,
  LightShadows extends Shadows = Shadows,
> extends ThemeBuilderDefinition<DarkPalette, LightPalette> {
  darkShadows?: DarkShadows;
  lightShadows?: LightShadows;
}

export interface GetThemeProps {
  name: string;
  theme: Record<string, string>;
  scheme?: 'light' | 'dark';
  parentName: string;
  parentNames: string[];
  level: number;
  palette?: string[];
}

export interface CreateThemesBuilderOptions {
  grandChildrenThemes?: CreateThemesProps['grandChildrenThemes'];
  getTheme?: (props: GetThemeProps) => Record<string, string | number | null | undefined>;
}

/**
 * Wrap a `getTheme` so entries whose value is nullish are dropped. Tamagui's
 * ThemeBuilder spreads the result OVER the template-derived theme
 * (`{...theme, ...getTheme(props)}`), so a key that resolves to `undefined`
 * (e.g. a consumer getTheme reading `theme.color5` inside a narrow component
 * sub-theme that has no colorN steps) would otherwise erase the template's
 * real value and reach the CSS variable emitter as the literal string
 * "undefined" — t_Button's `--backgroundPress`/`--borderColorHover` blanked
 * pressed fills and drew phantom currentColor borders.
 */
function sanitizeGetTheme(
  getTheme: NonNullable<CreateThemesBuilderOptions['getTheme']>,
): NonNullable<CreateThemesBuilderOptions['getTheme']> {
  return (props: GetThemeProps) => {
    const out: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(getTheme(props))) {
      if (value != null) {
        out[key] = value;
      }
    }
    return out;
  };
}

// Radix hue names whose sub-themes act as decorative TINTS (Tint.tsx cycling,
// the storybook `color` global). Under a tint,
// surfaces/borders/solids keep the hue but TEXT must stay readable neutral:
// muted/secondary text and user-authored content must never render saturated
// accent. Exported so theme-identity consumers (chart
// palette) share the one tint registry.
export const tintHueNames = new Set([
  'amber',
  'blue',
  'bronze',
  'brown',
  'crimson',
  'cyan',
  'gold',
  'grass',
  'gray',
  'green',
  'indigo',
  'lime',
  'mauve',
  'mint',
  'olive',
  'orange',
  'pink',
  'plum',
  'purple',
  'red',
  'sage',
  'sand',
  'sky',
  'slate',
  'teal',
  'tomato',
  'violet',
  'yellow',
]);

// Text-tier tokens re-anchored to the neutral scheme ramp inside tint themes.
const tintNeutralTextKeys = [
  'color',
  'colorHover',
  'colorPress',
  'colorFocus',
  'color11',
  'color12',
  'placeholderColor',
] as const;

/**
 * Rebuild tint sub-themes (light_purple, dark_red_active, ...) so their
 * text tiers come from the neutral base scheme while backgrounds, borders
 * and solid steps (1-10) keep the hue. Only keys the tint theme already
 * defines are replaced; returns new objects, never mutates inputs.
 */
function neutralizeTintText(themes: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { ...themes };
  for (const [name, theme] of Object.entries(themes)) {
    const parts = name.split('_');
    if (parts.length < 2) {
      continue;
    }
    const scheme = parts[0];
    if (scheme !== 'light' && scheme !== 'dark') {
      continue;
    }
    if (!tintHueNames.has(parts[1])) {
      continue;
    }
    const base = themes[scheme];
    if (!base) {
      continue;
    }
    const patched: Record<string, string> = { ...theme };
    for (const key of tintNeutralTextKeys) {
      if (key in patched && base[key] != null) {
        patched[key] = base[key];
      }
    }
    out[name] = patched;
  }
  return out;
}

const semanticIntentNames = new Set(['error', 'warning', 'success']);
const entryControlNames = new Set(['Input', 'TextArea']);

/**
 * T-VALUE under a semantic intent. Intents are not tints: an Alert
 * reads `$color12` and a solid Button its on-fill `$color` from the hue, so
 * only entered text (an Input or TextArea value, and the placeholder that
 * stands in for it) goes back to the neutral ink.
 */
function neutralizeSemanticEntryText(
  themes: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { ...themes };
  for (const [name, theme] of Object.entries(themes)) {
    const [scheme, intent, component, ...rest] = name.split('_');
    if (rest.length > 0 || (scheme !== 'light' && scheme !== 'dark')) {
      continue;
    }
    if (!intent || !semanticIntentNames.has(intent)) {
      continue;
    }
    const base = themes[scheme];
    if (!base) {
      continue;
    }
    if (component === undefined) {
      if (base.placeholderColor != null) {
        out[name] = { ...theme, placeholderColor: base.placeholderColor };
      }
      continue;
    }
    if (!entryControlNames.has(component)) {
      continue;
    }
    const neutral = { ...base, ...themes[`${scheme}_${component}`] };
    const patched: Record<string, string> = { ...theme };
    for (const key of tintNeutralTextKeys) {
      if (neutral[key] != null) {
        patched[key] = neutral[key];
      }
    }
    out[name] = patched;
  }
  return out;
}

function luminanceOf(color: string | undefined): number | null {
  const hex = color ? normalizeToHex(color) : null;
  return hex ? relativeLuminance(hex) : null;
}

/**
 * The accent step nearest in luminance to `preferred` that passes `holds`,
 * or `preferred` itself when it already passes or nothing does.
 */
function nearestHoldingStep(preferred: string, steps: (string | undefined)[], holds: (lum: number) => boolean): string {
  const preferredLum = luminanceOf(preferred);
  if (preferredLum === null || holds(preferredLum)) {
    return preferred;
  }
  let best = preferred;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const step of steps) {
    const lum = luminanceOf(step);
    if (step === undefined || lum === null || !holds(lum)) {
      continue;
    }
    const distance = Math.abs(lum - preferredLum);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = step;
    }
  }
  return best;
}

/**
 * Axiom 12 LEGIBLE FLOOR on the scheme's accent pair. The
 * theme-builder reads `accentBackground` and `accentColor` off fixed palette
 * slots, and the house dark accent ramp puts both on the wrong side of the
 * floor: the fill (`#7766cc`) carries text at 4.02:1 against either scheme
 * anchor, and the ink (`#46349d`) reads 1.74:1 on the dark page. The fix keeps
 * the channel and frees the step, so each token walks to the nearest accent
 * step that holds its floor and stays put where it already does (light).
 *
 * - `accentBackground` is a text-bearing solid: its better anchor (`$color1`
 *   or `$color12`) clears 4.5:1 on it, and it keeps the 3:1 graphic tier
 *   against the page, because dots, edges and bars paint it bare.
 * - `accentColor` is accent ink: 4.5:1 on the page and the first raised
 *   surface (`$color1`-`$color3`).
 *
 * Every theme of the scheme that inherited the base pair (the intent
 * children) takes the corrected pair; one that set its own (the inverse
 * component themes) keeps it.
 */
function holdAccentFloor(themes: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { ...themes };
  for (const scheme of ['light', 'dark'] as const) {
    const base = themes[scheme];
    if (!base?.accentBackground || !base.accentColor) {
      continue;
    }
    const paper = luminanceOf(base.color1);
    const ink = luminanceOf(base.color12);
    const surfaces = [base.color1, base.color2, base.color3].map(luminanceOf);
    if (paper === null || ink === null || surfaces.some((lum) => lum === null)) {
      continue;
    }
    const steps = Array.from({ length: 12 }, (_, index) => base[`accent${index + 1}`]);
    const fill = nearestHoldingStep(
      base.accentBackground,
      steps.slice(0, 10),
      (lum) =>
        Math.max(contrastRatio(lum, paper), contrastRatio(lum, ink)) >= aaTextContrastRatio &&
        contrastRatio(lum, paper) >= minContrastRatio,
    );
    const accentInk = nearestHoldingStep(base.accentColor, steps, (lum) =>
      surfaces.every((surface) => contrastRatio(lum, surface as number) >= aaTextContrastRatio),
    );
    if (fill === base.accentBackground && accentInk === base.accentColor) {
      continue;
    }
    for (const [name, theme] of Object.entries(themes)) {
      if (name !== scheme && !name.startsWith(`${scheme}_`)) {
        continue;
      }
      const inheritsFill = theme.accentBackground === base.accentBackground;
      const inheritsInk = theme.accentColor === base.accentColor;
      if (!inheritsFill && !inheritsInk) {
        continue;
      }
      out[name] = {
        ...theme,
        ...(inheritsFill ? { accentBackground: fill } : null),
        ...(inheritsInk ? { accentColor: accentInk } : null),
      };
    }
  }
  return out;
}

/** The hues the code syntax palette paints. */
const syntaxInkHues = ['purple', 'green', 'blue', 'orange', 'red'] as const;

function mixHex(from: string, to: string, share: number): string {
  const channel = (offset: number) =>
    Math.round(
      Number.parseInt(from.slice(offset, offset + 2), 16) * (1 - share) +
        Number.parseInt(to.slice(offset, offset + 2), 16) * share,
    )
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/**
 * Axiom 12 LEGIBLE FLOOR on code syntax ink. Radix aims a hue's
 * step 11 at 4.5:1 on its own steps 1-2, but code paints on the raised
 * `$color3`, where light `green11`, `blue11` and `orange11` measure 4.22,
 * 4.27 and 4.04:1. Every theme that carries the hue ramps gets a
 * `syntax<Hue>` ink: step 11, walked toward step 12 in twentieths until it
 * clears 4.5:1 on that theme's `$color3` and on the hue's step-3 wash, which
 * diff lines paint. Dark keeps step 11; a theme where no step holds gets no
 * token and inherits its parent's.
 */
function holdSyntaxFloor(themes: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { ...themes };
  for (const [name, theme] of Object.entries(themes)) {
    const surface = luminanceOf(theme.color3);
    if (surface === null) {
      continue;
    }
    const ink: Record<string, string> = {};
    for (const hue of syntaxInkHues) {
      const from = theme[`${hue}11`] ? normalizeToHex(theme[`${hue}11`]) : null;
      const to = theme[`${hue}12`] ? normalizeToHex(theme[`${hue}12`]) : null;
      const wash = luminanceOf(theme[`${hue}3`]);
      if (!from || !to || wash === null) {
        continue;
      }
      for (let step = 0; step <= 20; step++) {
        const candidate = mixHex(from, to, step / 20);
        const lum = relativeLuminance(candidate);
        if (contrastRatio(lum, surface) >= aaTextContrastRatio && contrastRatio(lum, wash) >= aaTextContrastRatio) {
          ink[`syntax${hue[0].toUpperCase()}${hue.slice(1)}`] = candidate;
          break;
        }
      }
    }
    if (Object.keys(ink).length > 0) {
      out[name] = { ...theme, ...ink };
    }
  }
  return out;
}

const defaultLightShadows: Shadows = {
  shadow1: 'rgba(0,0,0,0.12)',
  shadow2: 'rgba(0,0,0,0.16)',
  shadow3: 'rgba(0,0,0,0.22)',
  shadow4: 'rgba(0,0,0,0.28)',
  shadow5: 'rgba(0,0,0,0.34)',
  shadow6: 'rgba(0,0,0,0.4)',
};

const defaultDarkShadows: Shadows = {
  shadow1: 'rgba(0,0,0,0.2)',
  shadow2: 'rgba(0,0,0,0.3)',
  shadow3: 'rgba(0,0,0,0.4)',
  shadow4: 'rgba(0,0,0,0.5)',
  shadow5: 'rgba(0,0,0,0.6)',
  shadow6: 'rgba(0,0,0,0.7)',
};

export function createThemesBuilder(
  baseTheme: BaseThemeBuilderDefinition,
  accentTheme: ThemeBuilderDefinition,
  options?: CreateThemesBuilderOptions,
) {
  const getTheme = options?.getTheme ? sanitizeGetTheme(options.getTheme) : undefined;
  const base = {
    palette: {
      dark: baseTheme.darkPalette,
      light: baseTheme.lightPalette,
    },
    extra: {
      light: {
        ...Colors.amber,
        ...Colors.amberA,
        ...Colors.blue,
        ...Colors.blueA,
        ...Colors.bronze,
        ...Colors.bronzeA,
        ...Colors.brown,
        ...Colors.brownA,
        ...Colors.crimson,
        ...Colors.crimsonA,
        ...Colors.cyan,
        ...Colors.cyanA,
        ...Colors.gold,
        ...Colors.goldA,
        ...Colors.grass,
        ...Colors.grassA,
        ...Colors.gray,
        ...Colors.grayA,
        ...Colors.green,
        ...Colors.greenA,
        ...Colors.indigo,
        ...Colors.indigoA,
        ...Colors.lime,
        ...Colors.limeA,
        ...Colors.mauve,
        ...Colors.mauveA,
        ...Colors.mint,
        ...Colors.mintA,
        ...Colors.olive,
        ...Colors.oliveA,
        ...Colors.orange,
        ...Colors.orangeA,
        ...Colors.pink,
        ...Colors.pinkA,
        ...Colors.plum,
        ...Colors.plumA,
        ...Colors.purple,
        ...Colors.purpleA,
        ...Colors.red,
        ...Colors.redA,
        ...Colors.sage,
        ...Colors.sageA,
        ...Colors.sand,
        ...Colors.sandA,
        ...Colors.sky,
        ...Colors.skyA,
        ...Colors.slate,
        ...Colors.slateA,
        ...Colors.teal,
        ...Colors.tealA,
        ...Colors.tomato,
        ...Colors.tomatoA,
        ...Colors.violet,
        ...Colors.violetA,
        ...Colors.yellow,
        ...Colors.yellowA,
        ...baseTheme.lightShadows,
        shadowColor: baseTheme.lightShadows?.shadow1 || defaultLightShadows.shadow1,
      },
      dark: {
        ...Colors.amberDark,
        ...Colors.amberDarkA,
        ...Colors.blueDark,
        ...Colors.blueDarkA,
        ...Colors.bronzeDark,
        ...Colors.bronzeDarkA,
        ...Colors.brownDark,
        ...Colors.brownDarkA,
        ...Colors.crimsonDark,
        ...Colors.crimsonDarkA,
        ...Colors.cyanDark,
        ...Colors.cyanDarkA,
        ...Colors.goldDark,
        ...Colors.goldDarkA,
        ...Colors.grassDark,
        ...Colors.grassDarkA,
        ...Colors.grayDark,
        ...Colors.grayDarkA,
        ...Colors.greenDark,
        ...Colors.greenDarkA,
        ...Colors.indigoDark,
        ...Colors.indigoDarkA,
        ...Colors.limeDark,
        ...Colors.limeDarkA,
        ...Colors.mauveDark,
        ...Colors.mauveDarkA,
        ...Colors.mintDark,
        ...Colors.mintDarkA,
        ...Colors.oliveDark,
        ...Colors.oliveDarkA,
        ...Colors.orangeDark,
        ...Colors.orangeDarkA,
        ...Colors.pinkDark,
        ...Colors.pinkDarkA,
        ...Colors.plumDark,
        ...Colors.plumDarkA,
        ...Colors.purpleDark,
        ...Colors.purpleDarkA,
        ...Colors.redDark,
        ...Colors.redDarkA,
        ...Colors.sageDark,
        ...Colors.sageDarkA,
        ...Colors.sandDark,
        ...Colors.sandDarkA,
        ...Colors.skyDark,
        ...Colors.skyDarkA,
        ...Colors.slateDark,
        ...Colors.slateDarkA,
        ...Colors.tealDark,
        ...Colors.tealDarkA,
        ...Colors.tomatoDark,
        ...Colors.tomatoDarkA,
        ...Colors.violetDark,
        ...Colors.violetDarkA,
        ...Colors.yellowDark,
        ...Colors.yellowDarkA,
        ...baseTheme.darkShadows,
        shadowColor: baseTheme.darkShadows?.shadow1 || defaultDarkShadows.shadow1,
      },
    },
  };
  const childrenThemes = {
    warning: {
      palette: {
        dark: Object.values(Colors.yellowDark),
        light: withIntentInkFloor(Object.values(Colors.yellow), intentInkFloor.warning),
      },
    },
    error: {
      palette: {
        dark: Object.values(Colors.redDark),
        light: Object.values(Colors.red),
      },
    },
    success: {
      palette: {
        dark: Object.values(Colors.greenDark),
        light: withIntentInkFloor(Object.values(Colors.green), intentInkFloor.success),
      },
    },
  };
  const createThemesProps: Record<string, unknown> = {
    base,
    childrenThemes,
    accent: {
      palette: {
        dark: accentTheme.darkPalette,
        light: accentTheme.lightPalette,
      },
    },
  };
  if (options?.grandChildrenThemes) {
    createThemesProps.grandChildrenThemes = options.grandChildrenThemes;
  }
  if (getTheme) {
    createThemesProps.getTheme = getTheme;
  }
  const initialTheme = tamaguiCreateThemes(createThemesProps as Parameters<typeof tamaguiCreateThemes>[0]);
  const themes = holdSyntaxFloor(
    holdAccentFloor(
      neutralizeSemanticEntryText(
        neutralizeTintText({
          ...grayTheme,
          ...tamaguiThemes,
          ...initialTheme,
        }),
      ),
    ),
  );
  return {
    themes() {
      return themes;
    },
    addTheme<K extends string>(name: K, theme: ThemeBuilderDefinition) {
      const addThemeProps: Record<string, unknown> = {
        base,
        childrenThemes,
        accent: {
          palette: {
            dark: theme.darkPalette,
            light: theme.lightPalette,
          },
        },
      };
      if (options?.grandChildrenThemes) {
        addThemeProps.grandChildrenThemes = options.grandChildrenThemes;
      }
      if (getTheme) {
        addThemeProps.getTheme = getTheme;
      }
      const createdTheme = tamaguiCreateThemes(addThemeProps as Parameters<typeof tamaguiCreateThemes>[0]);
      return {
        [`dark_${name}`]: createdTheme.dark_accent,
        [`light_${name}`]: createdTheme.light_accent,
      } as Record<`dark_${K}` | `light_${K}`, typeof createdTheme.dark_accent>;
    },
  };
}

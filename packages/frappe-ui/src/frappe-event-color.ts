import { normalizeToHex } from '@repo/theme';
import type { ChartPalette } from '@repo/theme';
import {
  amber,
  amberDark,
  blue,
  blueDark,
  cyan,
  cyanDark,
  grass,
  grassDark,
  gray,
  grayDark,
  green,
  greenDark,
  orange,
  orangeDark,
  pink,
  pinkDark,
  purple,
  purpleDark,
  red,
  redDark,
  teal,
  tealDark,
  violet,
  violetDark,
  yellow,
  yellowDark,
} from '@tamagui/colors';

interface EventColorPair {
  light: string;
  dark: string;
}

/**
 * Frappe named event colors → sanctioned scheme-aware solids (P-15).
 *
 * `colorField` doc values are either REFERENCES into Frappe's named palette
 * ("blue", "green", … — what desk stores) or LITERALS (hex/rgb the user
 * picked). References resolve through this mapping table to the sanctioned
 * Radix step-9 solids (the same scales `resolveChartPalette` draws from), so
 * named colors re-anchor per scheme; literals pass through untouched
 * (Axiom 11 — the literal IS the value). Unknown references fall back to the
 * identity palette slot — never a raw unknown string as a CSS color.
 *
 * Name set grounded in the Frappe bench source:
 * - classic `frappe.ui.color_map` (frappe/public/js/frappe/ui/colors.js):
 *   red, green, blue, dark-green, yellow, gray, purple, pink, orange
 * - espresso palette (frappe/public/scss/espresso/_colors.scss) adds:
 *   amber, cyan, teal, violet
 * - desk calendar semantic aliases (views/calendar/calendar.js color_map):
 *   danger → red, success → green, warning → orange; "default" means "no
 *   specific color" and resolves to the theme identity like an unset field.
 */
const namedEventColors = new Map<string, EventColorPair>([
  ['red', { light: red.red9, dark: redDark.red9 }],
  ['green', { light: green.green9, dark: greenDark.green9 }],
  ['blue', { light: blue.blue9, dark: blueDark.blue9 }],
  // Radix has no "dark green" family; grass is the deeper leaf-green,
  // distinct from green so Frappe's two greens stay tellable-apart.
  ['dark-green', { light: grass.grass9, dark: grassDark.grass9 }],
  ['yellow', { light: yellow.yellow9, dark: yellowDark.yellow9 }],
  ['gray', { light: gray.gray9, dark: grayDark.gray9 }],
  ['purple', { light: purple.purple9, dark: purpleDark.purple9 }],
  ['pink', { light: pink.pink9, dark: pinkDark.pink9 }],
  ['orange', { light: orange.orange9, dark: orangeDark.orange9 }],
  ['amber', { light: amber.amber9, dark: amberDark.amber9 }],
  ['cyan', { light: cyan.cyan9, dark: cyanDark.cyan9 }],
  ['teal', { light: teal.teal9, dark: tealDark.teal9 }],
  ['violet', { light: violet.violet9, dark: violetDark.violet9 }],
]);

/** Spelling/semantic aliases → canonical palette names. */
const namedEventColorAliases = new Map<string, string>([
  ['grey', 'gray'],
  ['danger', 'red'],
  ['success', 'green'],
  ['warning', 'orange'],
]);

const hexLiteralRe = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;
const functionalLiteralRe = /^(?:rgb|rgba|hsl|hsla)\(/iu;

/** True for values that already ARE colors (hex/rgb/hsl) or theme tokens. */
const isColorValue = (value: string): boolean =>
  value.startsWith('$') || hexLiteralRe.test(value) || functionalLiteralRe.test(value);

/**
 * Resolve a Frappe `colorField` value for the active scheme.
 *
 * - named palette reference → sanctioned Radix step-9 solid (scheme pair)
 * - color literal (hex/rgb/hsl) or `$token` → passthrough (Axiom 11)
 * - `"default"` / empty / non-string → `undefined` (theme identity chip)
 * - unknown reference → `palette.single` (identity slot, honest fallback)
 */
export const resolveFrappeEventColor = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- colorField doc values arrive untyped; this function is the parser
  value: unknown,
  palette: Pick<ChartPalette, 'scheme' | 'single'>,
): string | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parses the raw doc value at the boundary; non-strings mean "no color"
  if (typeof value !== 'string') {
    return undefined;
  }
  const raw = value.trim();
  if (raw === '') {
    return undefined;
  }
  if (isColorValue(raw)) {
    return raw;
  }
  // "Dark Green" / "dark_green" / "DARK-GREEN" → "dark-green"
  const name = raw.toLowerCase().replaceAll(/[\s_]+/gu, '-');
  if (name === 'default') {
    return undefined;
  }
  const entry = namedEventColors.get(namedEventColorAliases.get(name) ?? name);
  if (entry !== undefined) {
    return palette.scheme === 'dark' ? entry.dark : entry.light;
  }
  // The live-theme identity can arrive as any CSS color string (hsl in the
  // generated themes); normalize to hex so the calendar's luminance-computed
  // chip text keeps AA (a raw hsl string bypasses the contrast helper).
  return normalizeToHex(palette.single) ?? palette.single;
};

/** Recognized palette names (canonical, without aliases) — for docs/tests. */
export const frappeEventColorNames: readonly string[] = [...namedEventColors.keys()];

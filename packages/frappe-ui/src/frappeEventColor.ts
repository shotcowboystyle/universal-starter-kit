import { normalizeToHex } from '@repo/theme';
import type { ChartPalette } from '@repo/theme';
import * as Colors from '@tamagui/colors';

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
const namedEventColors: Record<string, { light: string; dark: string }> = {
  red: { light: Colors.red.red9, dark: Colors.redDark.red9 },
  green: { light: Colors.green.green9, dark: Colors.greenDark.green9 },
  blue: { light: Colors.blue.blue9, dark: Colors.blueDark.blue9 },
  // Radix has no "dark green" family; grass is the deeper leaf-green,
  // distinct from green so Frappe's two greens stay tellable-apart.
  'dark-green': { light: Colors.grass.grass9, dark: Colors.grassDark.grass9 },
  yellow: { light: Colors.yellow.yellow9, dark: Colors.yellowDark.yellow9 },
  gray: { light: Colors.gray.gray9, dark: Colors.grayDark.gray9 },
  purple: { light: Colors.purple.purple9, dark: Colors.purpleDark.purple9 },
  pink: { light: Colors.pink.pink9, dark: Colors.pinkDark.pink9 },
  orange: { light: Colors.orange.orange9, dark: Colors.orangeDark.orange9 },
  amber: { light: Colors.amber.amber9, dark: Colors.amberDark.amber9 },
  cyan: { light: Colors.cyan.cyan9, dark: Colors.cyanDark.cyan9 },
  teal: { light: Colors.teal.teal9, dark: Colors.tealDark.teal9 },
  violet: { light: Colors.violet.violet9, dark: Colors.violetDark.violet9 },
};

/** Spelling/semantic aliases → canonical palette names. */
const namedEventColorAliases: Record<string, string> = {
  grey: 'gray',
  danger: 'red',
  success: 'green',
  warning: 'orange',
};

const hexLiteralRe = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const functionalLiteralRe = /^(?:rgb|rgba|hsl|hsla)\(/i;

/** True for values that already ARE colors (hex/rgb/hsl) or theme tokens. */
function isColorValue(value: string): boolean {
  return value.startsWith('$') || hexLiteralRe.test(value) || functionalLiteralRe.test(value);
}

/**
 * Resolve a Frappe `colorField` value for the active scheme.
 *
 * - named palette reference → sanctioned Radix step-9 solid (scheme pair)
 * - color literal (hex/rgb/hsl) or `$token` → passthrough (Axiom 11)
 * - `"default"` / empty / non-string → `undefined` (theme identity chip)
 * - unknown reference → `palette.single` (identity slot, honest fallback)
 */
export function resolveFrappeEventColor(
  value: unknown,
  palette: Pick<ChartPalette, 'scheme' | 'single'>,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const raw = value.trim();
  if (!raw) {
    return undefined;
  }
  if (isColorValue(raw)) {
    return raw;
  }
  // "Dark Green" / "dark_green" / "DARK-GREEN" → "dark-green"
  const name = raw.toLowerCase().replaceAll(/[\s_]+/g, '-');
  if (name === 'default') {
    return undefined;
  }
  const entry = namedEventColors[namedEventColorAliases[name] ?? name];
  if (entry) {
    return palette.scheme === 'dark' ? entry.dark : entry.light;
  }
  // The live-theme identity can arrive as any CSS color string (hsl in the
  // generated themes); normalize to hex so the calendar's luminance-computed
  // chip text keeps AA (a raw hsl string bypasses the contrast helper).
  return normalizeToHex(palette.single) ?? palette.single;
}

/** Recognized palette names (canonical, without aliases) — for docs/tests. */
export const frappeEventColorNames: readonly string[] = Object.keys(namedEventColors);

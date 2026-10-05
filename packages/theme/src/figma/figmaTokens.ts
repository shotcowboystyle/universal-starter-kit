/**
 * Figma token export transform — the code→Figma projection.
 *
 * Everything here is DERIVED from the canonical theme sources at call time
 * (no hand-copied values):
 *
 * - Palette ramps + shadows: `createThemesBuilder(defaultBaseTheme,
 *   defaultAccentTheme, defaultBuilderOptions).themes()` — the exact themes
 *   apps run, including tint text neutralization and computed tokens like
 *   `outlineColor`.
 * - Semantic aliases: reverse-matched per scheme against the ramp steps of
 *   the built base themes (a key only becomes a `colorN` alias when light
 *   AND dark agree on the step index; otherwise raw per-scheme values are
 *   exported).
 * - Sizing: `tokens` from `@tamagui/themes` (the tokens
 *   `createDefaultThemeConfig` installs).
 * - Knob outputs: `resolveKnobs()` is executed per knob mode — the export
 *   shows exactly what the runtime resolver produces.
 * - Typography: the built `defaultHeadingFont` / `defaultBodyFont` tables
 *   (size / lineHeight / letterSpacing / weight).
 *
 * The transform is pure and deterministic (no Date, no I/O) so it can be
 * golden-tested; the runner script (`scripts/export-figma-tokens.mts`)
 * stamps `generatedAt` when writing to disk.
 */

import { tokens } from '@tamagui/themes';

import { createThemesBuilder, tintHueNames } from '../theme/createThemes';
import { defaultAccentTheme } from '../theme/defaults/accent';
import { defaultBaseTheme } from '../theme/defaults/base';
import { defaultBuilderOptions } from '../theme/defaults/builderOptions';
import { defaultBodyFont, defaultHeadingFont } from '../theme/defaults/fonts';
import { type Knobs, defaultKnobs } from '../theme/knobs';
import { compactSpaceMap, resolveKnobs } from '../theme/resolveKnobs';

// ── Names / constants ─────────────────────────────────────────

/**
 * Theme modes of the `Palette/Theme` Figma collection (spec.md §Variable
 * Collection Structure): semantic intents take the red/yellow/green slots;
 * the remaining stock tints are manual designer picks. 9 modes — inside
 * Figma Pro's 10-modes-per-collection cap with 1 slot of headroom.
 */
export const FIGMA_THEME_MODES = [
  'base',
  'accent',
  'error',
  'success',
  'warning',
  'orange',
  'blue',
  'purple',
  'pink',
] as const;
export type FigmaThemeMode = (typeof FIGMA_THEME_MODES)[number];

/**
 * Figma's per-node corner-smoothing dial value per `cornerSmoothing` knob.
 * `smooth` = 0.6 ≈ `corner-shape: squircle` ≡ superellipse(2) ≈ Apple's
 * continuous corners (see cornerSmoothing.ts). This is a Figma rendering
 * constant, not a Variable — Figma cannot bind cornerSmoothing to Variables.
 */
export const FIGMA_CORNER_SMOOTHING: Record<string, number> = {
  round: 0,
  smooth: 0.6,
};

/** Tamagui token key (`1.5`, `true`) → Figma-safe variable name segment. */
export function figmaTokenName(prefix: string, key: string): string {
  return `${prefix}-${String(key).replace(/\./g, '-')}`;
}

// ── Output shape ──────────────────────────────────────────────

export interface FigmaPaletteTheme {
  light: string[];
  dark: string[];
}

export interface FigmaShadows {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export type FigmaSemanticEntry =
  | { alias: string; light: string; dark: string }
  | { alias: null; light: string; dark: string };

export interface FigmaRadiusMode {
  /** Tamagui radius token resolveKnobs emits for this knob mode (e.g. `$4`). */
  token: string;
  /** `Sizing` collection variable to alias (e.g. `radius-4`). */
  figmaName: string;
  px: number;
  /** Outer/nested radius fragment (`knobProps.borderRadiusNested`). */
  outerToken: string;
  outerFigmaName: string;
  outerPx: number;
}

export interface FigmaElevationMode {
  /** Tamagui size token backing the elevation shadow scale (null = none). */
  sizeToken: string | null;
  px: number | null;
}

export interface FigmaSpaceMode {
  paddingToken: string;
  paddingFigmaName: string;
  gapToken: string;
  gapFigmaName: string;
  gapLgToken: string;
  gapLgFigmaName: string;
}

export interface FigmaKnobsExport {
  borderRadius: { default: Knobs['borderRadius']; modes: Record<string, FigmaRadiusMode> };
  borderWidth: { default: Knobs['borderWidth']; modes: Record<string, number> };
  elevation: { default: Knobs['elevation']; modes: Record<string, FigmaElevationMode> };
  fontWeight: { default: Knobs['fontWeight']; modes: Record<string, string> };
  space: { default: Knobs['space']; modes: Record<string, FigmaSpaceMode> };
  size: { default: Knobs['size']; modes: Record<string, { token: string; figmaName: string }> };
  cornerSmoothing: { default: string; modes: Record<string, number> };
  density: {
    default: Knobs['density'];
    /** compact steps space only (applyDensity); size is an independent axis. */
    compact: { size: Record<string, string>; space: Record<string, string> };
  };
}

export interface FigmaFontExport {
  family: string;
  size: Record<string, number>;
  lineHeight: Record<string, number>;
  letterSpacing: Record<string, number>;
  weight: Record<string, string>;
}

export interface FigmaTypographyExport {
  heading: FigmaFontExport;
  body: FigmaFontExport;
  /**
   * Category font stacks (the `headingFont`/`bodyFont` knob targets), as
   * supplied by the app config (`packages/config/fonts.ts` in this repo).
   * `figmaFamily` is the first family of the stack — Figma cannot resolve
   * CSS fallback chains.
   */
  categories: Record<string, { stack: string; figmaFamily: string }>;
}

export interface FigmaTokensExport {
  $meta: {
    generator: string;
    spec: string;
    note: string;
  };
  palette: {
    themes: Record<string, FigmaPaletteTheme>;
    shadows: FigmaShadows;
  };
  semantic: Record<string, FigmaSemanticEntry>;
  sizing: Record<string, number>;
  knobs: FigmaKnobsExport;
  typography: FigmaTypographyExport;
}

export interface BuildFigmaTokensOptions {
  /** Category font stacks to export (e.g. `fontFamilies` from app config). */
  fontFamilies?: Record<string, string>;
}

// ── Internals ─────────────────────────────────────────────────

type BuiltThemes = Record<string, Record<string, string | number>>;

function unwrapTokenGroup(group: object | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!group) {
    return out;
  }
  for (const [key, wrapper] of Object.entries(group)) {
    const val =
      wrapper && typeof wrapper === 'object' && 'val' in wrapper ? (wrapper as { val: unknown }).val : wrapper;
    if (typeof val === 'number') {
      out[key] = val;
    }
  }
  return out;
}

function ramp(themes: BuiltThemes, themeName: string, scheme: 'light' | 'dark'): string[] {
  const key = themeName === 'base' ? scheme : `${scheme}_${themeName}`;
  const theme = themes[key];
  if (!theme) {
    throw new Error(`figmaTokens: built themes are missing "${key}"`);
  }
  const steps: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const value = theme[`color${i}`];
    if (typeof value !== 'string') {
      throw new Error(`figmaTokens: theme "${key}" is missing color${i}`);
    }
    steps.push(value);
  }
  return steps;
}

function shadowsOf(themes: BuiltThemes, scheme: 'light' | 'dark'): Record<string, string> {
  const theme = themes[scheme];
  const out: Record<string, string> = {};
  for (let i = 1; i <= 6; i++) {
    const value = theme?.[`shadow${i}`];
    if (typeof value !== 'string') {
      throw new Error(`figmaTokens: base "${scheme}" theme is missing shadow${i}`);
    }
    out[`shadow${i}`] = value;
  }
  return out;
}

const RAMP_STEP_RE = /^color([1-9]|1[0-2])$/;
const SHADOW_RE = /^shadow[1-6]$/;
// Raw Radix hue steps spread into the base themes as extras (amber1,
// blueA12, ...). They are hue scales — Figma gets those via Palette/Theme
// modes — not semantic role tokens.
const HUE_STEP_RE = new RegExp(`^(${[...tintHueNames].join('|')})A?\\d+$`);

/**
 * Reverse-match a semantic value against the ramp of its own theme: returns
 * `colorN` when the value is exactly step N, else null.
 */
function stepAliasFor(theme: Record<string, string | number>, value: string): string | null {
  for (let i = 1; i <= 12; i++) {
    if (theme[`color${i}`] === value) {
      return `color${i}`;
    }
  }
  return null;
}

function deriveSemantic(themes: BuiltThemes): Record<string, FigmaSemanticEntry> {
  const light = themes.light;
  const dark = themes.dark;
  if (!light || !dark) {
    throw new Error('figmaTokens: base light/dark themes missing');
  }
  const out: Record<string, FigmaSemanticEntry> = {};
  const keys = Object.keys(light)
    .filter((key) => !RAMP_STEP_RE.test(key) && !SHADOW_RE.test(key) && !HUE_STEP_RE.test(key))
    .filter((key) => typeof light[key] === 'string' && typeof dark[key] === 'string')
    .sort();
  for (const key of keys) {
    const lightValue = light[key] as string;
    const darkValue = dark[key] as string;
    const lightAlias = stepAliasFor(light, lightValue);
    const darkAlias = stepAliasFor(dark, darkValue);
    const alias = lightAlias !== null && lightAlias === darkAlias ? lightAlias : null;
    out[key] = { alias, light: lightValue, dark: darkValue };
  }
  return out;
}

/**
 * `textAccent` knob → semantic text tier aliases (`text-low/medium/high`),
 * derived by running the resolver and matching its `$token` output against
 * the built base themes.
 */
function textTierEntries(themes: BuiltThemes): Record<string, FigmaSemanticEntry> {
  const light = themes.light;
  const dark = themes.dark;
  const out: Record<string, FigmaSemanticEntry> = {};
  for (const tier of ['low', 'medium', 'high'] as const) {
    const resolved = resolveKnobs({ ...defaultKnobs, textAccent: tier });
    const token = String(resolved.knobProps.textAccentColor).replace(/^\$/, '');
    const lightValue = light[token];
    const darkValue = dark[token];
    if (typeof lightValue !== 'string' || typeof darkValue !== 'string') {
      throw new Error(`figmaTokens: textAccent "${tier}" resolved to unknown token $${token}`);
    }
    const lightAlias = stepAliasFor(light, lightValue);
    const darkAlias = stepAliasFor(dark, darkValue);
    const alias = lightAlias !== null && lightAlias === darkAlias ? lightAlias : null;
    out[`text-${tier}`] = { alias, light: lightValue, dark: darkValue };
  }
  return out;
}

function buildSizing(borderWidthModes: Record<string, number>): Record<string, number> {
  const sizing: Record<string, number> = {};
  const groups: Array<[string, Record<string, number>]> = [
    ['size', unwrapTokenGroup(tokens.size)],
    ['space', unwrapTokenGroup(tokens.space)],
    ['radius', unwrapTokenGroup(tokens.radius)],
    ['zIndex', unwrapTokenGroup((tokens as Record<string, object>).zIndex)],
  ];
  for (const [prefix, group] of groups) {
    if (prefix !== 'zIndex' && Object.keys(group).length === 0) {
      throw new Error(`figmaTokens: @tamagui/themes tokens.${prefix} is empty`);
    }
    for (const [key, val] of Object.entries(group)) {
      sizing[figmaTokenName(prefix, key)] = val;
    }
  }
  // borderWidth-* mirrors the borderWidth KNOB outputs (none/small/medium/
  // large) — the old integer 0..3 scale predates the 0.5 hairline step.
  for (const [mode, px] of Object.entries(borderWidthModes)) {
    sizing[`borderWidth-${mode}`] = px;
  }
  return sizing;
}

const RADIUS_KNOB_MODES: Knobs['borderRadius'][] = ['none', 'small', 'medium', 'large', 'full'];
const BORDER_WIDTH_KNOB_MODES: Knobs['borderWidth'][] = ['none', 'small', 'medium', 'large'];
const ELEVATION_KNOB_MODES: Knobs['elevation'][] = ['none', 'small', 'medium', 'large'];
const FONT_WEIGHT_KNOB_MODES: Knobs['fontWeight'][] = ['regular', 'bold'];
const SPACE_KNOB_MODES: Knobs['space'][] = ['small', 'medium', 'large'];
const SIZE_KNOB_MODES: Knobs['size'][] = ['small', 'medium', 'large'];

function radiusPx(token: string): number {
  const radius = unwrapTokenGroup(tokens.radius);
  const key = token.replace(/^\$/, '');
  const px = radius[key];
  if (typeof px !== 'number') {
    throw new Error(`figmaTokens: unknown radius token ${token}`);
  }
  return px;
}

function tokenToFigma(token: string, prefix: string): string {
  return figmaTokenName(prefix, token.replace(/^\$/, ''));
}

/**
 * Normalize the elevation knob output to `{ sizeToken, px }` regardless of
 * platform branch: resolveKnobs emits Tamagui size-token strings on web and
 * the equivalent raw numbers on native (see elevationMap in resolveKnobs.ts).
 */
function normalizeElevation(value: string | number | undefined): FigmaElevationMode {
  if (value === undefined) {
    return { sizeToken: null, px: null };
  }
  const size = unwrapTokenGroup(tokens.size);
  if (typeof value === 'string') {
    const key = value.replace(/^\$/, '');
    const px = size[key];
    if (typeof px !== 'number') {
      throw new Error(`figmaTokens: unknown size token ${value}`);
    }
    return { sizeToken: value, px };
  }
  const entry = Object.entries(size).find(([key, px]) => px === value && key !== 'true');
  return { sizeToken: entry ? `$${entry[0]}` : null, px: value };
}

function buildKnobs(): FigmaKnobsExport {
  const borderRadius: Record<string, FigmaRadiusMode> = {};
  for (const mode of RADIUS_KNOB_MODES) {
    const { knobProps } = resolveKnobs({ ...defaultKnobs, borderRadius: mode });
    const token = String(knobProps.borderRadius.borderRadius);
    const outerToken = String(knobProps.borderRadiusNested.borderRadius);
    borderRadius[mode] = {
      token,
      figmaName: tokenToFigma(token, 'radius'),
      px: radiusPx(token),
      outerToken,
      outerFigmaName: tokenToFigma(outerToken, 'radius'),
      outerPx: radiusPx(outerToken),
    };
  }

  const borderWidth: Record<string, number> = {};
  for (const mode of BORDER_WIDTH_KNOB_MODES) {
    const { knobProps } = resolveKnobs({ ...defaultKnobs, borderWidth: mode });
    borderWidth[mode] = Number(knobProps.borderRadius.borderWidth);
  }

  const elevation: Record<string, FigmaElevationMode> = {};
  for (const mode of ELEVATION_KNOB_MODES) {
    const { knobProps } = resolveKnobs({ ...defaultKnobs, elevation: mode });
    elevation[mode] = normalizeElevation(knobProps.elevation);
  }

  const fontWeight: Record<string, string> = {};
  for (const mode of FONT_WEIGHT_KNOB_MODES) {
    const { knobProps } = resolveKnobs({ ...defaultKnobs, fontWeight: mode });
    fontWeight[mode] = String(knobProps.textWeight.fontWeight);
  }

  const space: Record<string, FigmaSpaceMode> = {};
  for (const mode of SPACE_KNOB_MODES) {
    const { knobProps } = resolveKnobs({ ...defaultKnobs, space: mode });
    const paddingToken = String(knobProps.panelPadding.padding);
    const gapToken = String(knobProps.gap.gap);
    const gapLgToken = String(knobProps.gapLg.gap);
    space[mode] = {
      paddingToken,
      paddingFigmaName: tokenToFigma(paddingToken, 'space'),
      gapToken,
      gapFigmaName: tokenToFigma(gapToken, 'space'),
      gapLgToken,
      gapLgFigmaName: tokenToFigma(gapLgToken, 'space'),
    };
  }

  const size: Record<string, { token: string; figmaName: string }> = {};
  for (const mode of SIZE_KNOB_MODES) {
    const { knobProps } = resolveKnobs({ ...defaultKnobs, size: mode });
    const token = String(knobProps.sizeToken);
    size[mode] = { token, figmaName: tokenToFigma(token, 'size') };
  }

  return {
    borderRadius: { default: defaultKnobs.borderRadius, modes: borderRadius },
    borderWidth: { default: defaultKnobs.borderWidth, modes: borderWidth },
    elevation: { default: defaultKnobs.elevation, modes: elevation },
    fontWeight: { default: defaultKnobs.fontWeight, modes: fontWeight },
    space: { default: defaultKnobs.space, modes: space },
    size: { default: defaultKnobs.size, modes: size },
    cornerSmoothing: {
      default: defaultKnobs.cornerSmoothing ?? 'round',
      modes: { ...FIGMA_CORNER_SMOOTHING },
    },
    density: {
      default: defaultKnobs.density,
      compact: {
        size: { small: 'small', medium: 'medium', large: 'large' },
        space: { ...compactSpaceMap },
      },
    },
  };
}

interface FontLike {
  family?: unknown;
  size?: Record<string, unknown>;
  lineHeight?: Record<string, unknown>;
  letterSpacing?: Record<string, unknown>;
  weight?: Record<string, unknown>;
}

function numberTable(table: Record<string, unknown> | undefined, label: string) {
  const out: Record<string, number> = {};
  if (!table) {
    throw new Error(`figmaTokens: font is missing ${label} table`);
  }
  for (const [key, value] of Object.entries(table)) {
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num)) {
      out[key] = num;
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`figmaTokens: ${label} table is empty`);
  }
  return out;
}

function exportFont(font: FontLike, label: string): FigmaFontExport {
  const weight: Record<string, string> = {};
  for (const [key, value] of Object.entries(font.weight ?? {})) {
    weight[key] = String(value);
  }
  return {
    family: String(font.family ?? ''),
    size: numberTable(font.size, `${label}.size`),
    lineHeight: numberTable(font.lineHeight, `${label}.lineHeight`),
    letterSpacing: numberTable(font.letterSpacing, `${label}.letterSpacing`),
    weight,
  };
}

function firstFamily(stack: string): string {
  const first = stack.split(',')[0] ?? stack;
  return first.trim().replace(/^['"]|['"]$/g, '');
}

// ── Entry point ───────────────────────────────────────────────

export function buildFigmaTokens(options: BuildFigmaTokensOptions = {}): FigmaTokensExport {
  const themes = createThemesBuilder(
    defaultBaseTheme,
    defaultAccentTheme,
    defaultBuilderOptions,
  ).themes() as BuiltThemes;

  const paletteThemes: Record<string, FigmaPaletteTheme> = {};
  for (const mode of FIGMA_THEME_MODES) {
    paletteThemes[mode] = {
      light: ramp(themes, mode, 'light'),
      dark: ramp(themes, mode, 'dark'),
    };
  }

  const semantic = { ...deriveSemantic(themes), ...textTierEntries(themes) };
  const knobs = buildKnobs();
  const sizing = buildSizing(knobs.borderWidth.modes);

  const categories: FigmaTypographyExport['categories'] = {};
  for (const [category, stack] of Object.entries(options.fontFamilies ?? {})) {
    categories[category] = { stack, figmaFamily: firstFamily(stack) };
  }

  return {
    $meta: {
      generator: 'public/theme/src/figma/figmaTokens.ts (buildFigmaTokens)',
      spec: 'agent-os/specs/2026-05-08-figma-v2-token-migration',
      note: 'Generated projection of the canonical theme/knob system. Do not edit by hand — rerun `pnpm exec tsx scripts/export-figma-tokens.mts`.',
    },
    palette: {
      themes: paletteThemes,
      shadows: {
        light: shadowsOf(themes, 'light'),
        dark: shadowsOf(themes, 'dark'),
      },
    },
    semantic,
    sizing,
    knobs,
    typography: {
      heading: exportFont(defaultHeadingFont as FontLike, 'heading'),
      body: exportFont(defaultBodyFont as FontLike, 'body'),
      categories,
    },
  };
}

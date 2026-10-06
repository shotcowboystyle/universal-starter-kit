/**
 * FontKnobStyles — makes the headingFont/bodyFont knobs retheme EVERY
 * heading/body text on web without per-component wiring.
 *
 * How it works: on web Tamagui renders text with a font-scope class
 * (`font_heading`, `font_body`, …) and resolves `font-family` through the
 * scoped CSS variable `--f-family` (rule: `:root .font_heading { --f-family:
 * Inter, … }`). Overriding that one variable per scope swaps the rendered
 * family of every H1–H6 (`$heading`) and every default/body text (`$body`)
 * at once, keeping the size scale intact.
 *
 * Density: the base lineHeight/letterSpacing tables are tuned for Inter
 * (display leading ~1.16, negative tracking at large sizes). Most other
 * families need looser leading — mono/serif/script glyphs fill more of the
 * em box, so Inter's leading reads squished on them. Each category declares
 * a minimum lineHeight:fontSize ratio in `fontCategoryMetrics`; sizes whose
 * base leading falls below the floor get a scoped `--f-lineHeight-N`
 * override (same var the text classes already consume), and "neutral"
 * tracking categories zero out Inter's tracking-by-size letterSpacing.
 *
 * Components that explicitly set another font token (e.g. `fontFamily="$mono"`
 * code blocks, or `knobProps.heading` consumers) carry a different font class
 * and are untouched.
 *
 * Native has no CSS variables — there, components must consume
 * `knobProps.heading` / `knobProps.body` (see FontKnobStyles.native.tsx no-op).
 */
import { getConfig } from '@tamagui/web';
import { useEffect } from 'react';

import { fontCategoryMetrics, flooredLineHeight } from './font-category-metrics';
import { fontCategoryStacks } from './font-category-stacks';
import type { FontCategory } from './knobs';
import { defaultKnobs } from './knobs';
import { usePresetContext } from './preset-context';

const STYLE_TAG_ID = 'mp-font-knob-styles';

/**
 * Re-exported so `@repo/theme` consumers keep the historical
 * import path. The table itself lives in `font-category-metrics.ts` because
 * `defaults/fonts.ts` bakes the same floors into the registered category
 * fonts and the two must not drift.
 */
export { fontCategoryMetrics } from './font-category-metrics';

// Default leading for font-scoped text that carries no explicit lineHeight
// (e.g. `Text fontFamily="$body" fontSize=…` renders `line-height: normal`
// ≈1.2 — under every category's body floor). Emitted at ZERO specificity
// (`:where()`) so any sized text keeps its per-size table value, while
// unsized text meets the category floor. The minimums keep the
// default scope comfortable even where a category floor is lower.
const DEFAULT_HEADING_LEADING_MIN = 1.25;
const DEFAULT_BODY_LEADING_MIN = 1.5;

/** Zero-specificity default line-height rule for one font scope. */
const defaultLeadingRule = (scope: 'heading' | 'body', category: FontCategory): string => {
  const metrics = fontCategoryMetrics[category] ?? fontCategoryMetrics['sans-serif'];
  const ratio = Math.max(metrics[scope], scope === 'heading' ? DEFAULT_HEADING_LEADING_MIN : DEFAULT_BODY_LEADING_MIN);
  return `:where(:root .font_${scope}) { line-height: ${ratio}; }`;
};

/** Numeric font tables for a purpose font, keyed WITHOUT the `$` prefix. */
export interface FontScopeTables {
  size: Record<string, number>;
  lineHeight: Record<string, number>;
  letterSpacing?: Record<string, number>;
}

type RawFontTable = Record<string, number | { val?: number }>;

interface RawFont {
  family?: string | { val?: string };
  size?: RawFontTable;
  lineHeight?: RawFontTable;
  letterSpacing?: RawFontTable;
}

/**
 * Read a font registered in the Tamagui config (parsed form first, then the raw
 * `fonts` map). Returns undefined outside a configured Tamagui runtime.
 */
const readRawFont = (key: string): RawFont | undefined => {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch {
    return undefined;
  }
  // SAFETY: `fontsParsed` exists on the runtime Tamagui config but is missing from its public type.
  const { fontsParsed } = config as { fontsParsed?: ReturnType<typeof getConfig>['fonts'] };
  // SAFETY: Tamagui font objects carry the `family` / size tables read through RawFont.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Tamagui's font type is wider than the tables this module reads
  return (fontsParsed?.[`$${key}`] ?? config.fonts?.[key]) as RawFont | undefined;
};

const unwrapFontNumber = (value: number | { val?: number }): number | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Tamagui font tables mix bare numbers and `{ val }` Variables
  if (typeof value === 'number') {
    return value;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- untyped runtime config value, validated before use
  return typeof value.val === 'number' ? value.val : undefined;
};

const unwrapFontTable = (table: RawFontTable | undefined): Record<string, number> | undefined => {
  if (table === undefined) {
    return undefined;
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(table)) {
    const num = unwrapFontNumber(value);
    if (num !== undefined) {
      out[key.replace(/^\$/u, '')] = num;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * Resolve the concrete font-family stack registered in the Tamagui config for
 * a font category. Returns undefined when the category font is not registered
 * (the caller then uses `fontCategoryStacks` so the knob still writes
 * `--f-family` — live SHC console had the style tag and skipped the family).
 */
// oxlint-disable-next-line react-doctor/only-export-components -- exported for unit tests and the font-resolver injection point
export const getConfiguredFontFamily = (category: FontCategory): string | undefined => {
  const family = readRawFont(category)?.family;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Tamagui font family is either a string or a Variable-like `{ val }`
  if (typeof family === 'string') {
    return family;
  }
  const value = family?.val;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- untyped runtime config value, validated before use
  return typeof value === 'string' ? value : undefined;
};

/**
 * Read the numeric size/lineHeight/letterSpacing tables of the `$heading` /
 * `$body` purpose font from the Tamagui config, keys normalized without the
 * `$` prefix (matching the emitted `--f-lineHeight-<key>` CSS var names).
 * Returns undefined outside a configured Tamagui runtime (unit tests, SSR
 * before setup) — callers then emit family-only overrides.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- exported for unit tests and the font-resolver injection point
export const getConfiguredFontTables = (scope: 'heading' | 'body'): FontScopeTables | undefined => {
  const font = readRawFont(scope);
  if (font === undefined) {
    return undefined;
  }
  const size = unwrapFontTable(font.size);
  const lineHeight = unwrapFontTable(font.lineHeight);
  if (size === undefined || lineHeight === undefined) {
    return undefined;
  }
  return { size, lineHeight, letterSpacing: unwrapFontTable(font.letterSpacing) };
};

/** Build the full override rule for one font scope (heading or body). */
const buildScopeRule = (
  scope: 'heading' | 'body',
  category: FontCategory,
  family: string,
  tables: FontScopeTables | undefined,
): string => {
  const metrics = fontCategoryMetrics[category];
  const decls = [`--f-family: ${family} !important`];
  if (tables !== undefined && metrics !== undefined) {
    const minRatio = metrics[scope];
    for (const [key, size] of Object.entries(tables.size)) {
      const baseLineHeight: number | undefined = tables.lineHeight[key];
      if (baseLineHeight === undefined) {
        continue;
      }
      const floored = flooredLineHeight(size, baseLineHeight, minRatio);
      if (floored > baseLineHeight) {
        decls.push(`--f-lineHeight-${key}: ${floored}px !important`);
      }
    }
    if (metrics.letterSpacing === 'neutral' && tables.letterSpacing !== undefined) {
      // Inter's tracking-by-size curve (negative display tracking AND
      // positive caption tracking) is Inter-specific: fixed-pitch faces must
      // keep their pitch and connected scripts break when tracked apart, so
      // "neutral" zeroes every non-zero entry.
      for (const [key, tracking] of Object.entries(tables.letterSpacing)) {
        if (tracking !== 0) {
          decls.push(`--f-letterSpacing-${key}: 0px !important`);
        }
      }
    }
  }
  return `:root .font_${scope} { ${decls.join('; ')}; }`;
};

/**
 * Build the CSS override for the current headingFont/bodyFont knob values.
 * Always emits the zero-specificity default-leading rules (unsized scoped
 * text must meet the active category's line-height floor); family
 * and per-size overrides are added for non-default categories. Exported for
 * unit testing.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- exported for unit testing
export const buildFontKnobCss = (
  headingFont: FontCategory,
  bodyFont: FontCategory,
  resolveFamily: (category: FontCategory) => string | undefined = getConfiguredFontFamily,
  resolveTables: (scope: 'heading' | 'body') => FontScopeTables | undefined = getConfiguredFontTables,
): string => {
  const rules: string[] = [defaultLeadingRule('heading', headingFont), defaultLeadingRule('body', bodyFont)];
  if (headingFont !== 'sans-serif') {
    const family = resolveFamily(headingFont) ?? fontCategoryStacks[headingFont];
    if (family !== undefined && family !== '') {
      rules.push(buildScopeRule('heading', headingFont, family, resolveTables('heading')));
    }
  }
  if (bodyFont !== 'sans-serif') {
    const family = resolveFamily(bodyFont) ?? fontCategoryStacks[bodyFont];
    if (family !== undefined && family !== '') {
      rules.push(buildScopeRule('body', bodyFont, family, resolveTables('body')));
    }
  }
  return rules.join('\n');
};

/**
 * Mount ONCE near the root (inside the Preset/PresetContext provider). Reads
 * the active headingFont/bodyFont knobs and syncs a `<style>` override so all
 * `$heading`/`$body` text follows the knobs. Renders nothing.
 */
export const FontKnobStyles = () => {
  const presetCtx = usePresetContext();
  const knobs = presetCtx ? { ...presetCtx.preset.knobs, ...presetCtx.overrides } : defaultKnobs;
  const headingFont = knobs.headingFont ?? defaultKnobs.headingFont;
  const bodyFont = knobs.bodyFont ?? defaultKnobs.bodyFont;

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const css = buildFontKnobCss(headingFont, bodyFont);
    let tag = document.querySelector<HTMLStyleElement>(`#${STYLE_TAG_ID}`);
    if (css === '') {
      tag?.remove();
      return;
    }
    if (tag === null) {
      tag = document.createElement('style');
      tag.id = STYLE_TAG_ID;
      document.head.append(tag);
    }
    if (tag.textContent !== css) {
      tag.textContent = css;
    }
  }, [headingFont, bodyFont]);

  useEffect(
    () => () => {
      if (typeof document !== 'undefined') {
        document.querySelector(`#${STYLE_TAG_ID}`)?.remove();
      }
    },
    [],
  );

  return null;
};

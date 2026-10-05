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

import { fontCategoryMetrics, flooredLineHeight } from './fontCategoryMetrics';
import { fontCategoryStacks } from './fontCategoryStacks';
import type { FontCategory } from './knobs';
import { defaultKnobs } from './knobs';
import { usePresetContext } from './PresetContext';

const STYLE_TAG_ID = 'mp-font-knob-styles';

/**
 * Re-exported so `@repo/theme` consumers keep the historical
 * import path. The table itself lives in `fontCategoryMetrics.ts` because
 * `defaults/fonts.ts` bakes the same floors into the registered category
 * fonts and the two must not drift.
 */
export { fontCategoryMetrics };

// Default leading for font-scoped text that carries no explicit lineHeight
// (e.g. `Text fontFamily="$body" fontSize=…` renders `line-height: normal`
// ≈1.2 — under every category's body floor). Emitted at ZERO specificity
// (`:where()`) so any sized text keeps its per-size table value, while
// unsized text meets the category floor. The minimums keep the
// default scope comfortable even where a category floor is lower.
const DEFAULT_HEADING_LEADING_MIN = 1.25;
const DEFAULT_BODY_LEADING_MIN = 1.5;

/** Zero-specificity default line-height rule for one font scope. */
function defaultLeadingRule(scope: 'heading' | 'body', category: FontCategory): string {
  const metrics = fontCategoryMetrics[category] ?? fontCategoryMetrics['sans-serif'];
  const ratio = Math.max(metrics[scope], scope === 'heading' ? DEFAULT_HEADING_LEADING_MIN : DEFAULT_BODY_LEADING_MIN);
  return `:where(:root .font_${scope}) { line-height: ${ratio}; }`;
}

/** Numeric font tables for a purpose font, keyed WITHOUT the `$` prefix. */
export interface FontScopeTables {
  size: Record<string, number>;
  lineHeight: Record<string, number>;
  letterSpacing?: Record<string, number>;
}

/**
 * Resolve the concrete font-family stack registered in the Tamagui config for
 * a font category. Returns undefined when the category font is not registered
 * (the caller then uses `fontCategoryStacks` so the knob still writes
 * `--f-family` — live SHC console had the style tag and skipped the family).
 */
export function getConfiguredFontFamily(category: FontCategory): string | undefined {
  let config: ReturnType<typeof getConfig> | undefined;
  try {
    config = getConfig();
  } catch {
    return undefined;
  }
  const fontsParsed = (config as { fontsParsed?: Record<string, unknown> }).fontsParsed;
  const font = (fontsParsed?.[`$${category}`] ?? config.fonts?.[category]) as
    | { family?: string | { val?: string } }
    | undefined;
  const family = font?.family;
  if (typeof family === 'string') {
    return family;
  }
  if (family && typeof family.val === 'string') {
    return family.val;
  }
  return undefined;
}

/**
 * Read the numeric size/lineHeight/letterSpacing tables of the `$heading` /
 * `$body` purpose font from the Tamagui config, keys normalized without the
 * `$` prefix (matching the emitted `--f-lineHeight-<key>` CSS var names).
 * Returns undefined outside a configured Tamagui runtime (unit tests, SSR
 * before setup) — callers then emit family-only overrides.
 */
export function getConfiguredFontTables(scope: 'heading' | 'body'): FontScopeTables | undefined {
  let config: ReturnType<typeof getConfig> | undefined;
  try {
    config = getConfig();
  } catch {
    return undefined;
  }
  const fontsParsed = (config as { fontsParsed?: Record<string, unknown> }).fontsParsed;
  const font = (fontsParsed?.[`$${scope}`] ?? config.fonts?.[scope]) as
    | Record<string, Record<string, number | { val?: number }> | undefined>
    | undefined;
  if (!font) {
    return undefined;
  }
  const unwrap = (table: Record<string, number | { val?: number }> | undefined): Record<string, number> | undefined => {
    if (!table) {
      return undefined;
    }
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(table)) {
      const num = typeof value === 'number' ? value : value && typeof value.val === 'number' ? value.val : undefined;
      if (num !== undefined) {
        out[key.replace(/^\$/, '')] = num;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const size = unwrap(font.size);
  const lineHeight = unwrap(font.lineHeight);
  if (!size || !lineHeight) {
    return undefined;
  }
  return { size, lineHeight, letterSpacing: unwrap(font.letterSpacing) };
}

/** Build the full override rule for one font scope (heading or body). */
function buildScopeRule(
  scope: 'heading' | 'body',
  category: FontCategory,
  family: string,
  tables: FontScopeTables | undefined,
): string {
  const metrics = fontCategoryMetrics[category];
  const decls = [`--f-family: ${family} !important`];
  if (tables && metrics) {
    const minRatio = metrics[scope];
    for (const [key, size] of Object.entries(tables.size)) {
      const baseLineHeight = tables.lineHeight[key];
      if (typeof baseLineHeight !== 'number') {
        continue;
      }
      const floored = flooredLineHeight(size, baseLineHeight, minRatio);
      if (floored > baseLineHeight) {
        decls.push(`--f-lineHeight-${key}: ${floored}px !important`);
      }
    }
    if (metrics.letterSpacing === 'neutral' && tables.letterSpacing) {
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
}

/**
 * Build the CSS override for the current headingFont/bodyFont knob values.
 * Always emits the zero-specificity default-leading rules (unsized scoped
 * text must meet the active category's line-height floor); family
 * and per-size overrides are added for non-default categories. Exported for
 * unit testing.
 */
export function buildFontKnobCss(
  headingFont: FontCategory,
  bodyFont: FontCategory,
  resolveFamily: (category: FontCategory) => string | undefined = getConfiguredFontFamily,
  resolveTables: (scope: 'heading' | 'body') => FontScopeTables | undefined = getConfiguredFontTables,
): string {
  const rules: string[] = [defaultLeadingRule('heading', headingFont), defaultLeadingRule('body', bodyFont)];
  if (headingFont !== 'sans-serif') {
    const family = resolveFamily(headingFont) ?? fontCategoryStacks[headingFont];
    if (family) {
      rules.push(buildScopeRule('heading', headingFont, family, resolveTables('heading')));
    }
  }
  if (bodyFont !== 'sans-serif') {
    const family = resolveFamily(bodyFont) ?? fontCategoryStacks[bodyFont];
    if (family) {
      rules.push(buildScopeRule('body', bodyFont, family, resolveTables('body')));
    }
  }
  return rules.join('\n');
}

/**
 * Mount ONCE near the root (inside the Preset/PresetContext provider). Reads
 * the active headingFont/bodyFont knobs and syncs a `<style>` override so all
 * `$heading`/`$body` text follows the knobs. Renders nothing.
 */
export function FontKnobStyles() {
  const presetCtx = usePresetContext();
  const knobs = presetCtx ? { ...presetCtx.preset.knobs, ...presetCtx.overrides } : defaultKnobs;
  const headingFont = knobs.headingFont ?? defaultKnobs.headingFont;
  const bodyFont = knobs.bodyFont ?? defaultKnobs.bodyFont;

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const css = buildFontKnobCss(headingFont, bodyFont);
    let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!css) {
      tag?.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement('style');
      tag.id = STYLE_TAG_ID;
      document.head.appendChild(tag);
    }
    if (tag.textContent !== css) {
      tag.textContent = css;
    }
  }, [headingFont, bodyFont]);

  useEffect(
    () => () => {
      if (typeof document !== 'undefined') {
        document.getElementById(STYLE_TAG_ID)?.remove();
      }
    },
    [],
  );

  return null;
}

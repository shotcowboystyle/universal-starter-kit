import { describe, expect, it } from 'vitest';

import type { FontScopeTables } from './FontKnobStyles';
import { buildFontKnobCss, fontCategoryMetrics } from './FontKnobStyles';
import type { FontCategory } from './knobs';

const FAMILIES: Partial<Record<FontCategory, string>> = {
  slab: "'Roboto Slab', 'Rockwell', 'Courier New', serif",
  mono: 'monospace',
  blackletter: "'UnifrakturCook', 'Fraktur', serif",
};

const resolveFamily = (category: FontCategory) => FAMILIES[category];
const noTables = () => undefined;

// Inter-shaped tables: display sizes tight (~1.16), small sizes loose, and
// negative display tracking — the exact shape the floors exist to correct.
const TABLES: Record<'heading' | 'body', FontScopeTables> = {
  heading: {
    size: { 7: 28, 10: 64 },
    lineHeight: { 7: 38, 10: 74 },
    letterSpacing: { 7: 0, 10: -3 },
  },
  body: {
    size: { 4: 14, 10: 46 },
    lineHeight: { 4: 24, 10: 56 },
    // positive caption tracking (tracking-by-size curve) + negative display
    letterSpacing: { 1: 0.05, 10: -3 },
  },
};
const resolveTables = (scope: 'heading' | 'body') => TABLES[scope];

describe('buildFontKnobCss', () => {
  it('emits only zero-specificity default leading when both knobs are at the sans-serif default', () => {
    const css = buildFontKnobCss('sans-serif', 'sans-serif', resolveFamily, noTables);
    expect(css).toContain(':where(:root .font_heading) { line-height: 1.25; }');
    expect(css).toContain(':where(:root .font_body) { line-height: 1.5; }');
    expect(css).not.toContain('--f-family');
  });

  it('overrides the heading font scope for a non-default headingFont', () => {
    const css = buildFontKnobCss('slab', 'sans-serif', resolveFamily, noTables);
    expect(css).toContain(
      ":root .font_heading { --f-family: 'Roboto Slab', 'Rockwell', 'Courier New', serif !important; }",
    );
  });

  it('overrides the body font scope for a non-default bodyFont', () => {
    const css = buildFontKnobCss('sans-serif', 'mono', resolveFamily, noTables);
    expect(css).toContain(':root .font_body { --f-family: monospace !important; }');
  });

  it('overrides both scopes independently', () => {
    const css = buildFontKnobCss('blackletter', 'mono', resolveFamily, noTables);
    expect(css).toContain("--f-family: 'UnifrakturCook', 'Fraktur', serif !important");
    expect(css).toContain(':root .font_body { --f-family: monospace !important');
  });

  it('emits a fallback --f-family when serif is not registered in Tamagui (live SHC)', () => {
    // Live console 2026-08-29: #mp-font-knob-styles was present but had no
    // --f-family because SHC never registers a `serif` font. The knob still
    // has to write a family, or headingFont/bodyFont are a no-op on painted
    // $heading/$body text. Georgia is a system face — no webfont required.
    const css = buildFontKnobCss('serif', 'sans-serif', resolveFamily, noTables);
    expect(css).toContain(":root .font_heading { --f-family: Georgia, 'Times New Roman', Times, serif !important; }");
    expect(css).toContain(':where(:root .font_heading) { line-height:');
  });

  it('emits a fallback --f-family for other unregistered categories and keeps the category leading', () => {
    const css = buildFontKnobCss('cursive', 'cursive', resolveFamily, noTables);
    expect(css).toContain(':root .font_heading { --f-family:');
    expect(css).toContain('cursive !important');
    // cursive heading floor 1.3 beats the 1.25 minimum; body max(1.5, 1.5)
    expect(css).toContain(':where(:root .font_heading) { line-height: 1.3; }');
    expect(css).toContain(':where(:root .font_body) { line-height: 1.5; }');
  });

  it('lifts heading lineHeight to the category floor only where base leading is tighter', () => {
    // mono heading floor 1.25: $10 base 74/64 = 1.16 -> 80px; $7 base 38/28 = 1.36 -> untouched
    const css = buildFontKnobCss('mono', 'sans-serif', resolveFamily, resolveTables);
    expect(css).toContain('--f-lineHeight-10: 80px !important');
    expect(css).not.toContain('--f-lineHeight-7');
  });

  it('lifts body lineHeight to the body floor for large sizes', () => {
    // mono body floor 1.45: $10 base 56/46 = 1.22 -> 67px; $4 base 24/14 = 1.71 -> untouched
    const css = buildFontKnobCss('sans-serif', 'mono', resolveFamily, resolveTables);
    expect(css).toContain('--f-lineHeight-10: 67px !important');
    expect(css).not.toContain('--f-lineHeight-4');
  });

  it('zeroes all non-zero tracking for neutral-tracking categories only', () => {
    const mono = buildFontKnobCss('mono', 'sans-serif', resolveFamily, resolveTables);
    expect(mono).toContain('--f-letterSpacing-10: 0px !important');
    expect(mono).not.toContain('--f-letterSpacing-7'); // base 0 stays
    // positive caption tracking is also Inter-specific: neutral zeroes it too
    const monoBody = buildFontKnobCss('sans-serif', 'mono', resolveFamily, resolveTables);
    expect(monoBody).toContain('--f-letterSpacing-1: 0px !important');
    expect(monoBody).toContain('--f-letterSpacing-10: 0px !important');
    const slab = buildFontKnobCss('slab', 'sans-serif', resolveFamily, resolveTables);
    expect(slab).not.toContain('--f-letterSpacing'); // "inherit" tracking
  });

  it("keeps every category's heading floor at or above 1.15 and body at or above 1.4", () => {
    for (const metrics of Object.values(fontCategoryMetrics)) {
      expect(metrics.heading).toBeGreaterThanOrEqual(1.15);
      expect(metrics.body).toBeGreaterThanOrEqual(1.4);
    }
  });
});

import { describe, expect, it } from 'vitest';

import { createDefaultFont } from '../../font';
import { flooredLineHeight, fontCategoryMetrics } from '../fontCategoryMetrics';
import { fontCategoryStacks } from '../fontCategoryStacks';
import type { FontCategory } from '../knobs';

import { defaultBodyFont, defaultFonts, defaultHeadingFont, fontFamilyStacks, interTrackingPx } from './fonts';

type NumTable = Record<string, number>;

/** Unwrap a font table whose values may be tamagui Variables. */
function table(font: unknown, key: 'size' | 'lineHeight' | 'letterSpacing'): NumTable {
  const raw = (font as Record<string, Record<string, number | { val: number }>>)[key] ?? {};
  const out: NumTable = {};
  for (const [k, v] of Object.entries(raw)) {
    const num = typeof v === 'number' ? v : v && typeof v.val === 'number' ? v.val : undefined;
    if (num !== undefined) {
      out[k.replace(/^\$/, '')] = num;
    }
  }
  return out;
}

/** Unwrap a font table whose values are strings (weight). */
function strTable(font: unknown, key: 'weight'): Record<string, string> {
  const raw = (font as Record<string, Record<string, string | { val: string }>>)[key] ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const str = typeof v === 'string' ? v : v && typeof v.val === 'string' ? v.val : undefined;
    if (str !== undefined) {
      out[k.replace(/^\$/, '')] = str;
    }
  }
  return out;
}

describe('default heading/body fonts — tracking-by-size (Axiom 15 OPTICS)', () => {
  for (const [name, font] of [
    ['heading', defaultHeadingFont],
    ['body', defaultBodyFont],
  ] as const) {
    describe(`${name} font`, () => {
      const size = table(font, 'size');
      const letterSpacing = table(font, 'letterSpacing');

      it('defines tracking for every size key, computed from the rendered size', () => {
        expect(Object.keys(size).length).toBeGreaterThan(0);
        for (const [key, px] of Object.entries(size)) {
          expect(letterSpacing[key], `letterSpacing[${key}]`).toBe(interTrackingPx(px));
        }
      });

      it('is looser at caption sizes and tighter at display sizes', () => {
        // caption end (≤12px rendered) is neutral-to-loose, never tighter
        for (const [key, px] of Object.entries(size)) {
          if (px <= 12) {
            expect(letterSpacing[key]).toBeGreaterThanOrEqual(0);
          }
          if (px >= 28) {
            expect(letterSpacing[key]).toBeLessThanOrEqual(-0.55);
          }
        }
      });

      it('tracking decreases monotonically as size grows', () => {
        const bySize = Object.entries(size)
          .filter(([key]) => key !== 'true')
          .sort((a, b) => a[1] - b[1]);
        for (let i = 1; i < bySize.length; i++) {
          const [prevKey, prevPx] = bySize[i - 1];
          const [key, px] = bySize[i];
          if (px === prevPx) {
            continue;
          }
          expect(letterSpacing[key], `letterSpacing[${key}]`).toBeLessThan(letterSpacing[prevKey]);
        }
      });
    });
  }

  it('heading H1–H4 land on the expected optical tracking (snapshot)', () => {
    const size = table(defaultHeadingFont, 'size');
    const letterSpacing = table(defaultHeadingFont, 'letterSpacing');
    // Heading rides the body scale now, so H1 $10 = 40px at
    // weight 800 rather than 64px at 400. Tracking follows the rendered
    // size, so every value moves with it — that IS the invariant.
    expect({
      h1: { size: size['10'], tracking: letterSpacing['10'] },
      h2: { size: size['9'], tracking: letterSpacing['9'] },
      h3: { size: size['8'], tracking: letterSpacing['8'] },
      h4: { size: size['7'], tracking: letterSpacing['7'] },
    }).toMatchInlineSnapshot(`
      {
        "h1": {
          "size": 40,
          "tracking": -0.89,
        },
        "h2": {
          "size": 30,
          "tracking": -0.64,
        },
        "h3": {
          "size": 26,
          "tracking": -0.53,
        },
        "h4": {
          "size": 22,
          "tracking": -0.4,
        },
      }
    `);
  });
});

describe('bodyFont category fonts — one ladder, distinct families', () => {
  const bodyStops = ['body', 'serif', 'mono', 'rounded'] as const;
  const firstFamily = (stack: string) => stack.split(',')[0]?.replace(/['"]/g, '').trim();
  const categories = Object.keys(defaultFonts).filter(
    (name) => name !== 'heading' && name !== 'body',
  ) as FontCategory[];
  const bodySize = table(defaultBodyFont, 'size');
  const bodyLineHeight = table(defaultBodyFont, 'lineHeight');

  it('registers every category token the bodyFont knob maps to', () => {
    expect(categories.length).toBe(10);
    for (const key of categories) {
      expect(defaultFonts[key], key).toBeTruthy();
      expect(fontFamily(defaultFonts[key])).toBe(fontCategoryStacks[key]);
    }
    expect(fontFamily(defaultFonts.body)).toContain('Inter');
  });

  it('aliases fontFamilyStacks to the one fontCategoryStacks table', () => {
    expect(fontFamilyStacks).toBe(fontCategoryStacks);
  });

  it('gives the four bodyFont stops four distinct first families', () => {
    const firsts = bodyStops.map((key) => firstFamily(fontFamily(defaultFonts[key])));
    expect(firsts).toEqual(['Inter', 'Georgia', 'ui-monospace', 'Nunito']);
    expect(new Set(firsts).size).toBe(4);
  });

  it('every knob stop has a distinct first family — none is a system fallback', () => {
    const firsts = ['body', ...categories].map((key) =>
      firstFamily(fontFamily(defaultFonts[key as keyof typeof defaultFonts])),
    );
    expect(new Set(firsts).size).toBe(firsts.length);
    expect(firsts).not.toContain('-apple-system');
  });

  it('puts every category font on the $body SIZE ladder — a family knob never resizes', () => {
    for (const name of categories) {
      expect(table(defaultFonts[name], 'size'), `${name}.size`).toEqual(bodySize);
    }
  });

  it('renders 15px/23px at $true and $4 on every stop, body included', () => {
    for (const name of ['body', ...categories] as const) {
      const size = table(defaultFonts[name as keyof typeof defaultFonts], 'size');
      const lineHeight = table(defaultFonts[name as keyof typeof defaultFonts], 'lineHeight');
      expect(size.true, `${name}.size.true`).toBe(15);
      expect(size['4'], `${name}.size.4`).toBe(15);
      expect(lineHeight.true, `${name}.lineHeight.true`).toBe(23);
      expect(lineHeight['4'], `${name}.lineHeight.4`).toBe(23);
    }
  });

  it("takes the era's leading, raised to the category floor and never lowered", () => {
    for (const name of categories) {
      const lineHeight = table(defaultFonts[name], 'lineHeight');
      const minRatio = fontCategoryMetrics[name].body;
      for (const [key, px] of Object.entries(bodySize)) {
        expect(lineHeight[key], `${name}.lineHeight[${key}]`).toBe(
          flooredLineHeight(px, bodyLineHeight[key], minRatio),
        );
        expect(lineHeight[key]).toBeGreaterThanOrEqual(bodyLineHeight[key]);
        expect(lineHeight[key] / px, `${name} ratio at ${key}`).toBeGreaterThanOrEqual(minRatio - 0.034);
      }
    }
  });

  it('meets the body leading floor at every size on every category', () => {
    for (const name of categories) {
      const size = table(defaultFonts[name], 'size');
      const lineHeight = table(defaultFonts[name], 'lineHeight');
      for (const [key, px] of Object.entries(size)) {
        expect(lineHeight[key] / px, `${name} ratio at ${key}`).toBeGreaterThan(1.36);
      }
    }
  });

  it("carries the era's weight, not the legacy 300", () => {
    for (const name of categories) {
      const weight = strTable(defaultFonts[name], 'weight');
      for (const key of Object.keys(bodySize)) {
        expect(weight[key], `${name}.weight[${key}]`).toBe('400');
      }
    }
  });

  it("zeroes tracking on every category face so Inter's curve cannot leak in", () => {
    for (const name of categories) {
      const letterSpacing = table(defaultFonts[name], 'letterSpacing');
      expect(Object.keys(letterSpacing).sort(), `${name}.letterSpacing keys`).toEqual(Object.keys(bodySize).sort());
      for (const key of Object.keys(bodySize)) {
        expect(letterSpacing[key], `${name}.letterSpacing[${key}]`).toBe(0);
      }
    }
  });
});

describe('createDefaultFont — the era body ramp', () => {
  it('includes $true at 15/23 so app category fonts do not collapse to normal', () => {
    const font = createDefaultFont({ family: 'Georgia, serif' });
    const size = table(font, 'size');
    const lineHeight = table(font, 'lineHeight');
    expect(size.true).toBe(15);
    expect(lineHeight.true).toBe(23);
    expect(fontFamily(font)).toBe('Georgia, serif');
  });

  it('lands a consumer font on the same ladder as the built-in category fonts', () => {
    const font = createDefaultFont({ family: 'Georgia, serif' });
    expect(table(font, 'size')).toEqual(table(defaultFonts.serif, 'size'));
    expect(table(font, 'lineHeight')).toEqual(table(defaultFonts.rounded, 'lineHeight'));
  });

  it('defaults to weight 400, never the legacy 300', () => {
    const weight = strTable(createDefaultFont({ family: 'Georgia, serif' }), 'weight');
    expect(weight['4']).toBe('400');
  });
});

function fontFamily(font: unknown): string {
  const family = (font as { family?: string | { val?: string } }).family;
  if (typeof family === 'string') {
    return family;
  }
  if (family && typeof family.val === 'string') {
    return family.val;
  }
  return '';
}

import * as Colors from '@tamagui/colors';
import { themes as stockThemes } from '@tamagui/themes';
import { describe, expect, it } from 'vitest';

import { accentIdentityCandidates, resolveChartPalette } from './chartPalette';
import { contrastRatio, normalizeToHex, relativeLuminance } from './colorRules';
import { tintHueNames } from './createThemes';

// The default accent solid (accentBackground) from defaults/accent.ts.
const lightAccent = 'hsla(250, 50%, 54%, 1)';
const darkAccent = 'hsla(250, 50%, 60%, 1)';
// Tint identity solids as the stock tint sub-themes resolve $color9.
const redTintSolid = 'hsl(358, 75.0%, 59.0%)';
const purpleTintSolid = 'hsl(272, 46.8%, 50.3%)';
const tomatoTintSolid = 'hsl(10, 78.0%, 54.0%)';
const grayTintSolid = 'hsla(270, 6%, 56%, 1)';

function hexToHsl(color: string): { h: number; s: number; l: number } {
  const hex = normalizeToHex(color);
  if (!hex) {
    throw new Error(`unparseable color: ${color}`);
  }
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return { h: 0, s: 0, l };
  }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60;
  } else {
    h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Distinguishability bar for ADJACENT categorical marks. A pair is tellable
 * apart when at least one perceptual channel separates it: hue (≥30° between
 * saturated colors), saturation (neutral vs vivid, delta ≥0.5), or luminance
 * (contrast ≥1.5:1).
 */
function adjacentDistinguishable(a: string, b: string): boolean {
  const ha = hexToHsl(a);
  const hb = hexToHsl(b);
  if (ha.s >= 0.15 && hb.s >= 0.15 && hueDistance(ha.h, hb.h) >= 30) {
    return true;
  }
  if (Math.abs(ha.s - hb.s) >= 0.5) {
    return true;
  }
  const la = relativeLuminance(normalizeToHex(a) as string);
  const lb = relativeLuminance(normalizeToHex(b) as string);
  return contrastRatio(la, lb) >= 1.5;
}

describe('resolveChartPalette', () => {
  it('floors every categorical mark across the registered tint identities', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const cardSurfaces = Object.entries(stockThemes)
        .filter(
          ([name]) =>
            name.startsWith(`${scheme}_`) &&
            name.endsWith('_Card') &&
            tintHueNames.has(name.split('_')[1]) &&
            name.split('_').length === 3,
        )
        .map(([, theme]) => theme.background);
      expect(cardSurfaces.length).toBeGreaterThan(0);
      const surfaces = [
        ...cardSurfaces,
        ...(scheme === 'light'
          ? ['#ffffff', Colors.gray.gray2, Colors.mauve.mauve2]
          : [Colors.grayDark.gray2, Colors.mauveDark.mauve2]),
      ];
      for (const hue of tintHueNames) {
        const ramp = (Colors as unknown as Record<string, Record<string, string>>)[
          scheme === 'dark' ? `${hue}Dark` : hue
        ];
        const palette = resolveChartPalette({
          scheme,
          identitySolid: ramp[`${hue}9`],
          identityCandidates: [ramp[`${hue}10`], ramp[`${hue}11`]],
        });
        for (let i = 0; i < palette.categorical.length; i++) {
          expect(
            adjacentDistinguishable(palette.categorical[i], palette.categorical[(i + 1) % palette.categorical.length]),
            `${scheme}/${hue}: adjacent series ${i}`,
          ).toBe(true);
        }
        for (const paint of [...palette.categorical, ...Object.values(palette.semantic)]) {
          for (const surface of surfaces) {
            const ratio = contrastRatio(
              relativeLuminance(normalizeToHex(paint)!),
              relativeLuminance(normalizeToHex(surface)!),
            );
            expect(ratio, `${scheme}/${hue}: ${paint} on ${surface}`).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  it('retains the dark cycle order while deepening its failing violet slot', () => {
    const palette = resolveChartPalette({ scheme: 'dark', identitySolid: '#aaaaaa' });
    expect(palette.categorical.slice(1)).toEqual([
      Colors.blueDark.blue9,
      Colors.orangeDark.orange9,
      Colors.greenDark.green9,
      Colors.amberDark.amber9,
      Colors.pinkDark.pink9,
      Colors.tealDark.teal9,
      Colors.violetDark.violet10,
      Colors.redDark.red9,
    ]);
  });

  it('keeps the valid default light order and every grass-tint series', () => {
    expect(resolveChartPalette({ scheme: 'light', identitySolid: lightAccent }).categorical).toEqual([
      lightAccent,
      Colors.blue.blue10,
      Colors.orange.orange11,
      Colors.green.green10,
      Colors.amber.amber11,
      Colors.pink.pink9,
      Colors.teal.teal10,
      Colors.red.red9,
    ]);
    const grass = resolveChartPalette({
      scheme: 'light',
      identitySolid: Colors.grass.grass9,
      identityCandidates: [Colors.grass.grass10, Colors.grass.grass11],
    });
    expect(grass.categorical[0]).toBe(Colors.grass.grass10);
    expect([...grass.categorical].sort()).toEqual(
      [
        Colors.grass.grass10,
        Colors.blue.blue10,
        Colors.orange.orange11,
        Colors.amber.amber11,
        Colors.pink.pink9,
        Colors.teal.teal10,
        Colors.violet.violet9,
        Colors.red.red9,
      ].sort(),
    );
  });

  it('uses the first readable identity candidate and retains a readable original', () => {
    expect(
      resolveChartPalette({
        scheme: 'light',
        identitySolid: '#ffffff',
        identityCandidates: ['var(--ink)', '#777777', '#333333'],
      }).single,
    ).toBe('#777777');
    expect(
      resolveChartPalette({
        scheme: 'light',
        identitySolid: lightAccent,
        identityCandidates: ['#333333'],
      }).single,
    ).toBe(lightAccent);
    expect(
      resolveChartPalette({
        scheme: 'light',
        identitySolid: '#ffffff',
        identityCandidates: ['#eeeeee'],
      }).single,
    ).toBe(Colors.violet.violet9);
  });

  it('single-series takes the theme identity solid', () => {
    expect(resolveChartPalette({ scheme: 'light', identitySolid: lightAccent }).single).toBe(lightAccent);
    expect(resolveChartPalette({ scheme: 'dark', identitySolid: darkAccent }).single).toBe(darkAccent);
  });

  it('categorical palette is identity-led', () => {
    const palette = resolveChartPalette({ scheme: 'light', identitySolid: lightAccent });
    expect(palette.categorical[0]).toBe(lightAccent);
  });

  it('drops the cycle hue confusable with the accent identity (violet)', () => {
    const palette = resolveChartPalette({ scheme: 'light', identitySolid: lightAccent });
    expect(palette.categorical).not.toContain(Colors.violet.violet9);
    expect(palette.categorical).toContain(Colors.blue.blue10);
    expect(palette.categorical).toHaveLength(8);
  });

  it('re-anchors under a red tint and drops the red cycle hue', () => {
    const palette = resolveChartPalette({ scheme: 'light', identitySolid: redTintSolid });
    expect(palette.categorical[0]).toBe(redTintSolid);
    expect(palette.categorical).not.toContain(Colors.red.red9);
    expect(palette.categorical).toContain(Colors.violet.violet9);
  });

  it('re-anchors under a purple tint and drops the violet cycle hue', () => {
    const palette = resolveChartPalette({ scheme: 'light', identitySolid: purpleTintSolid });
    expect(palette.categorical[0]).toBe(purpleTintSolid);
    expect(palette.categorical).not.toContain(Colors.violet.violet9);
    expect(palette.categorical).toContain(Colors.red.red9);
  });

  it('drops every cycle hue within the confusable band (tomato drops red, orange and amber)', () => {
    const palette = resolveChartPalette({ scheme: 'light', identitySolid: tomatoTintSolid });
    expect(palette.categorical).not.toContain(Colors.red.red9);
    expect(palette.categorical).not.toContain(Colors.orange.orange11);
    expect(palette.categorical).not.toContain(Colors.amber.amber11);
    expect(palette.categorical).toHaveLength(6);
  });

  it('keeps the full cycle behind a neutral identity (gray tint)', () => {
    const palette = resolveChartPalette({ scheme: 'light', identitySolid: grayTintSolid });
    expect(palette.categorical[0]).toBe(grayTintSolid);
    expect(palette.categorical).toHaveLength(9);
  });

  it('falls back to the violet ramp solid when identity is missing or unparseable', () => {
    const missing = resolveChartPalette({ scheme: 'light' });
    expect(missing.single).toBe(Colors.violet.violet9);
    const unparseable = resolveChartPalette({
      scheme: 'light',
      identitySolid: 'var(--accentBackground)',
    });
    expect(unparseable.single).toBe(Colors.violet.violet9);
    // Fallback identity still dedupes its own hue family from the cycle.
    expect(unparseable.categorical.filter((c) => c === Colors.violet.violet9)).toHaveLength(1);
  });

  it('semantic series come from the sanctioned semantic ramps, scheme-aware', () => {
    const light = resolveChartPalette({ scheme: 'light', identitySolid: lightAccent });
    const dark = resolveChartPalette({ scheme: 'dark', identitySolid: darkAccent });
    expect(light.semantic.error).toBe(Colors.red.red9);
    expect(light.semantic.success).toBe(Colors.green.green10);
    expect(light.semantic.warning).toBe(Colors.yellow.yellow11);
    expect(dark.semantic.error).toBe(Colors.redDark.red9);
    expect(dark.semantic.success).toBe(Colors.greenDark.green9);
    expect(dark.semantic.warning).toBe(Colors.yellowDark.yellow9);
    // Warning adapts per scheme (yellow9 is ~1.3:1 against light surfaces).
    expect(light.semantic.warning).not.toBe(dark.semantic.warning);
  });

  it('keeps adjacent categorical marks distinguishable in light and dark for every identity', () => {
    const identities = [
      lightAccent,
      darkAccent,
      redTintSolid,
      purpleTintSolid,
      tomatoTintSolid,
      grayTintSolid,
      undefined,
    ];
    for (const scheme of ['light', 'dark'] as const) {
      for (const identitySolid of identities) {
        const palette = resolveChartPalette({ scheme, identitySolid });
        for (let i = 0; i < palette.categorical.length - 1; i++) {
          const a = palette.categorical[i];
          const b = palette.categorical[i + 1];
          expect(
            adjacentDistinguishable(a, b),
            `${scheme} identity=${identitySolid ?? '(none)'} pair ${i}: ${a} vs ${b}`,
          ).toBe(true);
        }
      }
    }
  });

  it('is pure and stable for identical input', () => {
    const a = resolveChartPalette({ scheme: 'dark', identitySolid: redTintSolid });
    const b = resolveChartPalette({ scheme: 'dark', identitySolid: redTintSolid });
    expect(a).toEqual(b);
  });
});

describe('chart identity under the held dark accent', () => {
  const darkAccentSolids = [35, 38, 41, 43, 46, 49, 52, 54, 57, 60].map(
    (lightness) => `hsla(250, 50%, ${lightness}%, 1)`,
  );

  it('keeps the accent channel on the neighbouring step when the held fill misses the mark floor', () => {
    const identitySolid = darkAccentSolids[8];
    const palette = resolveChartPalette({
      scheme: 'dark',
      identitySolid,
      identityCandidates: [...accentIdentityCandidates(identitySolid, darkAccentSolids), 'hsla(270, 6%, 54%, 1)'],
    });
    expect(palette.single).toBe(darkAccentSolids[9]);
  });

  it('orders the accent solids nearest-first and skips what does not parse', () => {
    expect(accentIdentityCandidates('#6d5bc8', ['#3c2d86', undefined, '#7766cc', '#634fc4'])).toEqual([
      '#634fc4',
      '#7766cc',
      '#3c2d86',
    ]);
    expect(accentIdentityCandidates(undefined, ['#7766cc'])).toEqual([]);
  });
});

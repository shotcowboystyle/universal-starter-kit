import { describe, expect, it } from 'vitest';

import { contrastRatio, normalizeToHex, relativeLuminance } from './colorRules';
import { resolveAaSolidFill, resolveAccentTintedSurface, resolveLegibleInkOn } from './readableColor';

// The stock accent ramp (defaults/accent.ts) as the theme resolves it.
const lightAccent = [
  'hsla(250, 50%, 62%, 1)',
  'hsla(250, 50%, 58%, 1)',
  'hsla(250, 50%, 54%, 1)',
  'hsla(250, 50%, 48%, 1)',
  'hsla(250, 50%, 46%, 1)',
  'hsla(250, 50%, 44%, 1)',
  'hsla(250, 50%, 42%, 1)',
  'hsla(250, 50%, 40%, 1)',
  'hsla(250, 50%, 38%, 1)',
  'hsla(250, 50%, 36%, 1)',
  'hsla(250, 50%, 95%, 1)',
  'hsla(250, 50%, 98%, 1)',
];
const darkAccent = [
  'hsla(250, 50%, 35%, 1)',
  'hsla(250, 50%, 38%, 1)',
  'hsla(250, 50%, 41%, 1)',
  'hsla(250, 50%, 43%, 1)',
  'hsla(250, 50%, 46%, 1)',
  'hsla(250, 50%, 49%, 1)',
  'hsla(250, 50%, 52%, 1)',
  'hsla(250, 50%, 54%, 1)',
  'hsla(250, 50%, 57%, 1)',
  'hsla(250, 50%, 60%, 1)',
  'hsla(250, 50%, 90%, 1)',
  'hsla(250, 50%, 95%, 1)',
];

const lightPaper = '#ffffff';
const lightInk = '#242226';
const darkPaper = '#161519';
const darkInk = '#f0eff1';

const lum = (raw: string) => relativeLuminance(normalizeToHex(raw)!);

describe('resolveAccentTintedSurface', () => {
  it("takes the ramp's pale surface end in a light scheme", () => {
    const tint = resolveAccentTintedSurface({
      steps: lightAccent,
      paper: lightPaper,
      ink: lightInk,
    });
    expect(tint).toBe(lightAccent[10]);
  });

  it("takes the ramp's deep surface end in a dark scheme", () => {
    const tint = resolveAccentTintedSurface({ steps: darkAccent, paper: darkPaper, ink: darkInk });
    expect(tint).toBe(darkAccent[0]);
  });

  // The bug this rule replaced: keying the pick off a SURFACE token let a tint
  // sub-theme (which re-ramps surfaces) slide the chip a step per tint. Scheme
  // polarity comes from the paper/ink anchors, which a tint leaves alone.
  it('does not drift when surrounding surfaces are re-ramped by a tint', () => {
    const untinted = resolveAccentTintedSurface({
      steps: lightAccent,
      paper: lightPaper,
      ink: lightInk,
    });
    for (const tintedPaper of ['#fffce8', '#fff8f8', '#f2fbf5']) {
      expect(resolveAccentTintedSurface({ steps: lightAccent, paper: tintedPaper, ink: lightInk })).toBe(untinted);
    }
  });

  it('stays a SURFACE tier — never the solid an accent CTA takes', () => {
    // The solid is accentBackground (= the ramp's mid, palette-shape solid).
    const lightSolid = lightAccent[2];
    const darkSolid = darkAccent[9];
    expect(resolveAccentTintedSurface({ steps: lightAccent, paper: lightPaper, ink: lightInk })).not.toBe(lightSolid);
    expect(resolveAccentTintedSurface({ steps: darkAccent, paper: darkPaper, ink: darkInk })).not.toBe(darkSolid);
  });

  it('keeps a luminance-picked label readable on the tint in both schemes', () => {
    const cases = [
      { steps: lightAccent, paper: lightPaper, ink: lightInk },
      { steps: darkAccent, paper: darkPaper, ink: darkInk },
    ];
    for (const c of cases) {
      const tint = resolveAccentTintedSurface(c)!;
      const best = Math.max(contrastRatio(lum(tint), lum(c.paper)), contrastRatio(lum(tint), lum(c.ink)));
      expect(best).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('returns undefined when the accent ramp or an anchor is missing', () => {
    expect(resolveAccentTintedSurface({ steps: [], paper: lightPaper, ink: lightInk })).toBeUndefined();
    expect(resolveAccentTintedSurface({ steps: lightAccent, paper: undefined, ink: lightInk })).toBeUndefined();
    expect(
      resolveAccentTintedSurface({
        steps: Array.from({ length: 12 }, () => 'var(--nope)'),
        paper: lightPaper,
        ink: lightInk,
      }),
    ).toBeUndefined();
  });
});

describe('resolveAaSolidFill', () => {
  it('keeps the preferred solid when it already clears the text floor', () => {
    const solids = lightAccent.slice(0, 10).map((value, i) => ({
      token: `$accent${i + 1}`,
      value,
    }));
    // Stock light accentBackground is the mid solid (step 3, 6.09:1 on paper).
    expect(
      resolveAaSolidFill({
        preferred: { token: '$accentBackground', value: lightAccent[2] },
        solids,
        paper: lightPaper,
        ink: lightInk,
      }),
    ).toBe('$accentBackground');
  });

  it('walks off the dark mid-solid that tops out at 4.02:1', () => {
    const solids = darkAccent.slice(0, 10).map((value, i) => ({
      token: `$accent${i + 1}`,
      value,
    }));
    const token = resolveAaSolidFill({
      preferred: { token: '$accentBackground', value: darkAccent[9] },
      solids,
      paper: darkPaper,
      ink: darkInk,
    });
    expect(token).not.toBe('$accentBackground');
    const picked = solids.find((s) => s.token === token);
    expect(picked?.value).toBeTruthy();
    const fillLum = lum(picked!.value);
    const best = Math.max(contrastRatio(fillLum, lum(darkPaper)), contrastRatio(fillLum, lum(darkInk)));
    expect(best).toBeGreaterThanOrEqual(4.5);
    // Nearest passing solid to the 60% mid is accent9 (57%, 4.60:1).
    expect(token).toBe('$accent9');
  });

  it('returns the preferred token when anchors cannot be parsed', () => {
    expect(
      resolveAaSolidFill({
        preferred: { token: '$accentBackground', value: darkAccent[9] },
        solids: [],
        paper: undefined,
        ink: darkInk,
      }),
    ).toBe('$accentBackground');
  });
});

describe('resolveLegibleInkOn', () => {
  it("keeps the component's ink while it clears AA on the fill", () => {
    expect(
      resolveLegibleInkOn({
        fill: '#eeecf9',
        preferred: '#66606c',
        paper: lightPaper,
        ink: lightInk,
      }),
    ).toBe('#66606c');
  });

  it('hands a muted title on the dark accent tint to the readable anchor (4.05:1)', () => {
    expect(
      resolveLegibleInkOn({
        fill: darkAccent[0],
        preferred: '#a09ba6',
        paper: darkPaper,
        ink: darkInk,
      }),
    ).toBe(darkInk);
  });

  it('falls through the anchors to a pole when neither reads (dark blue chip)', () => {
    const picked = resolveLegibleInkOn({
      fill: '#2870bd',
      preferred: '#c2e6ff',
      paper: darkPaper,
      ink: darkInk,
    });
    expect(picked).toBe('#ffffff');
    expect(contrastRatio(lum(picked!), lum('#2870bd'))).toBeGreaterThanOrEqual(4.5);
  });

  it('returns the preferred ink when there is no fill to read against', () => {
    expect(
      resolveLegibleInkOn({
        fill: undefined,
        preferred: '#a09ba6',
        paper: darkPaper,
        ink: darkInk,
      }),
    ).toBe('#a09ba6');
  });
});

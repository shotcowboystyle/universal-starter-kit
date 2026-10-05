import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { __resetDevWarnSeen, warnOutlineNone, warnPositiveTabIndex } from '../devWarn';
import { compositeFocusRingCss, keyboardFocusRingProps } from '../keyboardFocusRing';

import { contrastRatio, normalizeToHex, relativeLuminance } from './colorRules';
import { createThemesBuilder } from './createThemes';
import { defaultAccentTheme } from './defaults/accent';
import { defaultBaseTheme } from './defaults/base';
import { defaultBuilderOptions } from './defaults/builderOptions';
import {
  ensureFocusVisibleRing,
  focusRingColorMeetsContrast,
  FOCUS_RING_CLIPPED_OFFSET,
  FOCUS_RING_HALO_OFFSET,
  FOCUS_RING_MIN_CONTRAST,
  FOCUS_RING_MIN_WIDTH,
  FOCUS_VISIBLE_RING,
  FOCUS_VISIBLE_RING_HALO,
  FOCUS_VISIBLE_RING_INSET,
  isSanctionedFocusRingOffset,
  SANCTIONED_FOCUS_RING_OFFSETS,
  STATE_LAYER_HOVER,
  STATE_LAYER_PRESS,
  withDefaultStateLayer,
} from './focusState';
import { defaultKnobs } from './knobs';
import { resolveKnobs } from './resolveKnobs';

describe('focusState tokens', () => {
  it('FOCUS_VISIBLE_RING meets ≥2px solid outline contract at offset 0 (F1)', () => {
    expect(FOCUS_VISIBLE_RING.outlineWidth).toBeGreaterThanOrEqual(FOCUS_RING_MIN_WIDTH);
    expect(FOCUS_VISIBLE_RING.outlineStyle).toBe('solid');
    expect(FOCUS_VISIBLE_RING.outlineColor).toBe('$outlineColor');
    // Board verify pass F1: offset 0 — not −2 (band inside the fill, where it
    // measured 1.17–1.31:1 on solid intents) and not +2 (a gapped halo).
    expect(FOCUS_VISIBLE_RING.outlineOffset).toBe(0);
    expect(FOCUS_RING_MIN_CONTRAST).toBeGreaterThanOrEqual(3);
  });

  it('ensureFocusVisibleRing always emits a ≥2px solid ring', () => {
    expect(ensureFocusVisibleRing()).toMatchObject(FOCUS_VISIBLE_RING);
    expect(ensureFocusVisibleRing({})).toMatchObject(FOCUS_VISIBLE_RING);
  });

  it('ensureFocusVisibleRing clamps outlineWidth < 2 and rejects outline:none', () => {
    const clamped = ensureFocusVisibleRing({
      outlineWidth: 0,
      outlineStyle: 'none',
      outlineColor: 'transparent',
      borderWidth: 1,
    });
    expect(clamped.outlineWidth).toBe(FOCUS_RING_MIN_WIDTH);
    expect(clamped.outlineStyle).toBe('solid');
    expect(clamped.outlineColor).toBe('$outlineColor');
    expect(clamped.borderWidth).toBe(1);
  });

  it('ensureFocusVisibleRing allows thicker rings and preserves extras', () => {
    const thick = ensureFocusVisibleRing({
      outlineWidth: 4,
      borderColor: '$borderColorFocus',
    } as { outlineWidth: number; borderColor: string });
    expect(thick.outlineWidth).toBe(4);
    expect(thick.borderColor).toBe('$borderColorFocus');
  });

  it('ensureFocusVisibleRing reverts alpha-carrying ring colors', () => {
    // The stock Tamagui ring (20%-alpha ink) can't guarantee ≥3:1.
    for (const outlineColor of ['rgba(36, 34, 38, 0.2)', 'hsla(270, 6%, 14%, 0.2)', '#2422260a']) {
      expect(ensureFocusVisibleRing({ outlineColor } as { outlineColor: string }).outlineColor).toBe(
        FOCUS_VISIBLE_RING.outlineColor,
      );
    }
    // A solid override is respected.
    expect(ensureFocusVisibleRing({ outlineColor: '#5b5563' } as { outlineColor: string }).outlineColor).toBe(
      '#5b5563',
    );
  });

  it('focusRingColorMeetsContrast enforces the ≥3:1 color floor', () => {
    expect(focusRingColorMeetsContrast('#767085', '#ffffff')).toBe(true);
    expect(focusRingColorMeetsContrast('#e6e4e7', '#ffffff')).toBe(false);
    // Alpha colors can't be reduced to a single hue → treated as failing.
    expect(focusRingColorMeetsContrast('rgba(36,34,38,0.2)', '#ffffff')).toBe(false);
  });

  it('withDefaultStateLayer fills background when unset; knob wins when set', () => {
    expect(withDefaultStateLayer({}, STATE_LAYER_HOVER)).toEqual(STATE_LAYER_HOVER);
    expect(withDefaultStateLayer({ borderWidth: 2 }, STATE_LAYER_PRESS)).toEqual({
      backgroundColor: '$backgroundPress',
      borderWidth: 2,
    });
    expect(withDefaultStateLayer({ backgroundColor: 'transparent' }, STATE_LAYER_HOVER)).toEqual({
      backgroundColor: 'transparent',
    });
  });
});

describe('$outlineColor token contrast', () => {
  const themes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme} $outlineColor clears ≥3:1 against color1 and color2`, () => {
      const theme = themes[scheme];
      expect(theme).toBeTruthy();
      const ring = normalizeToHex(theme.outlineColor);
      const bg1 = normalizeToHex(theme.color1);
      const bg2 = normalizeToHex(theme.color2);
      expect(ring).toBeTruthy();
      expect(bg1).toBeTruthy();
      expect(bg2).toBeTruthy();
      const c1 = contrastRatio(relativeLuminance(ring!), relativeLuminance(bg1!));
      const c2 = contrastRatio(relativeLuminance(ring!), relativeLuminance(bg2!));
      expect(Math.min(c1, c2)).toBeGreaterThanOrEqual(FOCUS_RING_MIN_CONTRAST);
    });
  }

  // Assert the RATIO on the surface the band actually draws on, not
  // just the declaration. At offset 0 the band paints OUTSIDE the border box,
  // on the page ground behind the control; intent Buttons pin the parent-scope
  // `$outlineColor` literal on the ring, so the pair that must clear
  // the floor is base `outlineColor` × base ground — for accent and error
  // controls alike, in both schemes.
  for (const scheme of ['light', 'dark'] as const) {
    for (const intent of ['accent', 'error'] as const) {
      it(`${scheme} ${intent}: offset-0 ring clears ≥3:1 on the page ground it draws on`, () => {
        const base = themes[scheme];
        expect(themes[`${scheme}_${intent}`]).toBeTruthy();
        const ring = normalizeToHex(base.outlineColor);
        const ground = normalizeToHex(base.color1);
        expect(ring).toBeTruthy();
        expect(ground).toBeTruthy();
        expect(contrastRatio(relativeLuminance(ring!), relativeLuminance(ground!))).toBeGreaterThanOrEqual(
          FOCUS_RING_MIN_CONTRAST,
        );
      });
    }
  }

  it('the retired flat inset failed the floor over the solid intent fills (why offset is 0)', () => {
    // The failures that forced the flip: a −2 band paints
    // INSIDE the control, so it had to contrast against the solid intent fill.
    //
    // Provenance, because the two numbers are easy to conflate. The headline
    // figures — light accent 1.27:1, light error 1.17:1, dark error 1.31:1 —
    // are RENDERED measurements off the action-and-feedback board at DPR 2,
    // ring node against the Button's painted background. This test computes a
    // DIFFERENT pair: the base `outlineColor` against the intent sub-theme's
    // `color9` ink step (1.67 / 1.55 / 1.44 in this build). Same verdict, same
    // reason, different surfaces — the board's error fills (#ce2c31 / #ff9794)
    // are not in these default sub-theme ramps at all, so the fill side is the
    // board's to own and not this package's.
    //
    // What this assertion IS: no sub-theme ink step the inset band could land
    // on clears the floor, which keeps the offset-0 geometry load-bearing. If
    // the ramps ever lighten past 3:1 this test goes stale, not wrong.
    for (const [scheme, intent] of [
      ['light', 'accent'],
      ['light', 'error'],
      ['dark', 'error'],
    ] as const) {
      const ring = normalizeToHex(themes[scheme].outlineColor);
      const fill = normalizeToHex(themes[`${scheme}_${intent}`].color9);
      expect(ring).toBeTruthy();
      expect(fill).toBeTruthy();
      expect(contrastRatio(relativeLuminance(ring!), relativeLuminance(fill!))).toBeLessThan(FOCUS_RING_MIN_CONTRAST);
    }
  });
});

describe('the ring still paints inside a clipped / fused group (inset carve-out)', () => {
  it('FOCUS_VISIBLE_RING_INSET is the same ring pulled fully inside the border box', () => {
    expect(FOCUS_VISIBLE_RING_INSET).toMatchObject({
      outlineWidth: FOCUS_RING_MIN_WIDTH,
      outlineStyle: 'solid',
      outlineColor: '$outlineColor',
      outlineOffset: -2,
    });
    // The band spans [outlineOffset, outlineOffset + outlineWidth] from the
    // border edge. Outer edge ≤ 0 means a clipping ancestor (fused group
    // clipped at the group radius, menu overlay, table frame) cannot sever any part of it.
    expect(FOCUS_VISIBLE_RING_INSET.outlineOffset + FOCUS_VISIBLE_RING_INSET.outlineWidth).toBeLessThanOrEqual(0);
  });

  it('keyboardFocusRingProps — the manual ring for roving-focus composites — pins the inset', () => {
    expect(keyboardFocusRingProps).toEqual(FOCUS_VISIBLE_RING_INSET);
  });

  it('ensureFocusVisibleRing honors the explicit per-call-site inset and defaults to 0', () => {
    expect(ensureFocusVisibleRing({ outlineOffset: -2 }).outlineOffset).toBe(-2);
    expect(ensureFocusVisibleRing({ outlineWidth: 3 }).outlineOffset).toBe(0);
    expect(ensureFocusVisibleRing().outlineOffset).toBe(0);
  });
});

describe('keyboard-only; measure the ring / text node, not the frame', () => {
  it("standalone ring paints a 2px band on the ring-carrying node's box at offset 0", () => {
    // Measure the node that paints the outline (the ring carrier / text node),
    // never an ancestor Frame. Band = [offset, offset + width] from THAT box.
    const { outlineOffset, outlineWidth } = FOCUS_VISIBLE_RING;
    expect(outlineWidth).toBe(2);
    expect(outlineOffset).toBe(0);
    expect(outlineOffset + outlineWidth).toBe(2);
  });

  it('chip dismiss rings the glyph node, not the 44px hit-box frame', () => {
    const frameRule = compositeFocusRingCss.match(/\.mp-chip-dismiss:focus-visible\s*\{([^}]+)\}/);
    const ringRule = compositeFocusRingCss.match(
      /\.mp-chip-dismiss:focus-visible \.mp-chip-dismiss-ring\s*\{([^}]+)\}/,
    );
    expect(frameRule?.[1]).toMatch(/outline:\s*none/);
    expect(ringRule?.[1]).toMatch(/outline:\s*2px\s+solid/);
    expect(ringRule?.[1]).toMatch(/outline-offset:\s*0/);
    expect(ringRule?.[1]).not.toMatch(/outline-offset:\s*2px/);
  });

  it('non-text composites ring on :focus-visible only; text-entry keeps the any-focus carve-out', () => {
    expect(compositeFocusRingCss).toMatch(/\.mp-composite-ring:focus-visible/);
    expect(compositeFocusRingCss).toMatch(/\.mp-composite-ring-deep:has\(:focus-visible\)/);
    expect(compositeFocusRingCss).toMatch(/\.mp-chip-dismiss:focus-visible/);
    // Text-entry carve-out: focusing an input means typing.
    expect(compositeFocusRingCss).toMatch(/:has\(input:focus\)/);
    expect(compositeFocusRingCss).toMatch(/:has\(textarea:focus\)/);
  });
});

describe('resolveKnobs control recipes (W12)', () => {
  it('always emits hover/press state layers and focus-visible ring', () => {
    const { control } = resolveKnobs(defaultKnobs);
    expect(control.hoverKnobProps).toEqual(STATE_LAYER_HOVER);
    expect(control.pressKnobProps).toEqual(STATE_LAYER_PRESS);
    expect(control.focusVisibleKnobProps).toMatchObject(FOCUS_VISIBLE_RING);
    expect(control.focusVisibleKnobProps?.outlineWidth).toBeGreaterThanOrEqual(2);
  });

  it('merges knob overrides without removing the focus-visible ring', () => {
    const { control } = resolveKnobs({
      ...defaultKnobs,
      focusVisible: { borderWidth: 'large', borderRadius: 'full' },
      hover: { borderWidth: 'large' },
      press: { fillStyle: 'outlined' },
    });
    expect(control.focusVisibleKnobProps).toMatchObject({
      ...FOCUS_VISIBLE_RING,
      borderWidth: 2,
      borderRadius: '$12',
    });
    expect(control.hoverKnobProps).toMatchObject({
      backgroundColor: '$backgroundHover',
      borderWidth: 2,
    });
    expect(control.pressKnobProps?.backgroundColor).toBe('transparent');
  });
});

describe('theme DEV warn (outline-none / positive-tabindex)', () => {
  afterEach(() => {
    __resetDevWarnSeen();
    vi.restoreAllMocks();
  });

  it('warnOutlineNone fires once for outline:none / width 0', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnOutlineNone({ outlineStyle: 'none' }, { component: 'Test' });
    warnOutlineNone({ outlineStyle: 'none' }, { component: 'Test' });
    warnOutlineNone({ outlineWidth: 0 }, { component: 'Other' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('outline-none'));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('warnOutlineNone ignores healthy focus rings', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnOutlineNone(FOCUS_VISIBLE_RING, { component: 'Test' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('warnPositiveTabIndex fires for tabIndex > 0 only', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnPositiveTabIndex({ value: 0, component: 'Test' });
    warnPositiveTabIndex({ value: -1, component: 'Test' });
    warnPositiveTabIndex({ value: undefined, component: 'Test' });
    expect(spy).not.toHaveBeenCalled();
    warnPositiveTabIndex({ value: 2, component: 'Test' });
    warnPositiveTabIndex({ value: 2, component: 'Test' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('positive-tabindex'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('value=2'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

/**
 * The offset set is CLOSED, and a tenth site cannot open it.
 *
 * Two layers. The unit layer pins the three sanctioned numbers and the halo's
 * geometry. The source layer is the one that actually bites: it walks every
 * package's `src` and fails on any `outlineOffset` literal outside the set, so
 * a new call site that invents `outlineOffset: 3` fails here rather than
 * shipping and being found in a later audit.
 */
describe('the sanctioned focus-ring offset set is closed', () => {
  it('is exactly three offsets — clipping inset, default, shape halo', () => {
    expect([...SANCTIONED_FOCUS_RING_OFFSETS]).toEqual([-2, 0, 2]);
    expect(FOCUS_RING_CLIPPED_OFFSET).toBe(-2);
    expect(FOCUS_VISIBLE_RING.outlineOffset).toBe(0);
    expect(FOCUS_RING_HALO_OFFSET).toBe(2);
  });

  it('isSanctionedFocusRingOffset accepts the three and rejects everything else', () => {
    for (const offset of SANCTIONED_FOCUS_RING_OFFSETS) {
      expect(isSanctionedFocusRingOffset(offset)).toBe(true);
    }
    for (const offset of [-4, -3, -1, 1, 3, 4, 8]) {
      expect(isSanctionedFocusRingOffset(offset)).toBe(false);
    }
  });

  it('FOCUS_VISIBLE_RING_HALO is the same ring, pushed wholly outside the border box', () => {
    expect(FOCUS_VISIBLE_RING_HALO).toMatchObject({
      outlineWidth: FOCUS_RING_MIN_WIDTH,
      outlineStyle: 'solid',
      outlineColor: '$outlineColor',
      outlineOffset: FOCUS_RING_HALO_OFFSET,
    });
    // The band spans [outlineOffset, outlineOffset + outlineWidth] from the
    // border edge — here [2, 4]. Inner edge ≥ 0 means it paints entirely on the
    // surface BEHIND the control, exactly like the default offset 0, so it
    // measures against the page ground and cannot reproduce the 1.17–1.31:1
    // inside-the-fill failure that was retired.
    expect(FOCUS_VISIBLE_RING_HALO.outlineOffset).toBeGreaterThanOrEqual(0);
    expect(ensureFocusVisibleRing({ outlineOffset: FOCUS_RING_HALO_OFFSET }).outlineOffset).toBe(2);
  });

  it('no source file paints an outlineOffset outside the sanctioned set', () => {
    // Scoped to the JS/TS object form (`outlineOffset:`), numeric or "Npx"
    // string — that is the form every focus ring in the repo goes through, via
    // FOCUS_VISIBLE_RING* / ensureFocusVisibleRing / keyboardFocusRingProps.
    // Raw `outline-offset:` inside CSS template strings is deliberately out of
    // scope: it also carries non-focus decoration (the forced-colors skeleton
    // hairline at -1px), so folding it in would assert a rule §4 does not make.
    const packagesDir = path.resolve(__dirname, '../../..');
    const skipDirs = new Set(['node_modules', 'dist', 'build', '.turbo', 'types', '__snapshots__']);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (skipDirs.has(entry.name)) {
            continue;
          }
          walk(path.join(dir, entry.name));
          continue;
        }
        const name = entry.name;
        if (!/\.tsx?$/.test(name)) {
          continue;
        }
        if (/\.(spec|test|stories)\./.test(name)) {
          continue;
        }
        if (name.endsWith('.d.ts')) {
          continue;
        }
        files.push(path.join(dir, name));
      }
    };
    walk(packagesDir);
    expect(files.length).toBeGreaterThan(200);

    const violations: string[] = [];
    const literal = /outlineOffset\s*:\s*(?:"(-?\d+)px"|'(-?\d+)px'|(-?\d+))\b/;
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
          return;
        }
        const match = literal.exec(line);
        if (!match) {
          return;
        }
        const value = Number.parseInt(match[1] ?? match[2] ?? match[3], 10);
        if (isSanctionedFocusRingOffset(value)) {
          return;
        }
        violations.push(`${path.relative(packagesDir, file)}:${index + 1} paints outlineOffset ${value}`);
      });
    }
    expect(
      violations,
      `unsanctioned focus-ring offsets (LC-71 §4 closes the set at -2/0/2):\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});

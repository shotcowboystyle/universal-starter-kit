/**
 * PROOF — the layer-3 correction ledger, asserted.
 *
 * Same job as `mpo13Proof.test.ts` and the same shape: pin the RELATIONSHIP
 * that produces a value, not only the value, so a correction cannot quietly
 * regress into the thing it corrected. Where that file pinned geometry against
 * measured numbers, this pins the theme against STOCK TAMAGUI — each row a
 * place the theme differed with no improvement argument written down
 * (corrections outrank additions, and you never design around a
 * contradiction).
 *
 * The strongest assertions here are the ones that read upstream directly.
 * The type-scale tests do not compare the font tables to transcribed numbers, they compare
 * them to `defaultConfig.fonts` — so the test fails if the tables drift from
 * the era pin in EITHER direction, which a literal snapshot cannot do.
 *
 * Not covered here, deliberately: scoped marketing text tint, state layers
 * composing with elevation, and a spring motion driver. Those are held for a
 * ruling, because the refused list and the corrections-outrank-additions rule
 * disagree about them and neither side should implement until that is
 * settled.
 */

import { defaultConfig } from '@tamagui/config/v5';
import { describe, expect, it } from 'vitest';

import { animationConfig } from './animations/css';
import { tamaguiEra } from './createDefaultThemeConfig';
import { defaultBuilderOptions } from './defaults/builderOptions';
import { defaultBodyFont, defaultHeadingFont } from './defaults/fonts';
import { FOCUS_RING_CLIPPED_OFFSET, FOCUS_VISIBLE_RING, ensureFocusVisibleRing } from './focusState';
import { defaultKnobs } from './knobs';
import { layoutBreakpoints, OVERLAY_BREAKPOINT } from './layoutTokens';
import { resolveKnobs } from './resolveKnobs';

/** A font table's numbers/strings, Variables unwrapped and `$` stripped. */
function table(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
    const v = value && typeof value === 'object' && 'val' in value ? (value as { val?: unknown }).val : value;
    if (v !== undefined) {
      out[key.replace(/^\$/, '')] = v;
    }
  }
  return out;
}

const knobProps = (over: Partial<typeof defaultKnobs> = {}) => resolveKnobs({ ...defaultKnobs, ...over }).knobProps;

describe('one Tamagui era, and it is load-bearing', () => {
  it('the era is pinned, and pinned to v5', () => {
    expect(tamaguiEra).toBe('v5');
  });

  it("the config's tokens come from the pinned era and from nothing else", async () => {
    // The legacy `@tamagui/themes` tokens used to override `defaultConfig`'s.
    // Measured identical for every group the config actually uses, which is
    // why nothing broke and why nobody noticed for a year.
    const legacy = await import('@tamagui/themes');
    for (const group of ['size', 'space', 'radius', 'zIndex'] as const) {
      expect(table(defaultConfig.tokens[group]), `tokens.${group}`).toEqual(
        table((legacy.tokens as Record<string, unknown>)[group]),
      );
    }
  });
});

describe("the type scale IS the era's, not a copy of it", () => {
  it('body and heading tables are read from defaultConfig, not transcribed', () => {
    // The relationship, not the literals: re-point the era and the whole
    // scale follows. A transcribed table would pass a literal snapshot and
    // fail this.
    for (const [name, ours, theirs] of [
      ['body', defaultBodyFont, defaultConfig.fonts.body],
      ['heading', defaultHeadingFont, defaultConfig.fonts.heading],
    ] as const) {
      expect(table(ours.size), `${name}.size`).toEqual(table(theirs.size));
      expect(table(ours.lineHeight), `${name}.lineHeight`).toEqual(table(theirs.lineHeight));
      expect(table(ours.weight), `${name}.weight`).toEqual(table(theirs.weight));
    }
  });

  it("body $true is v5's 15, not v4's 14", () => {
    expect(table(defaultBodyFont.size).true).toBe(15);
  });

  it('body leading is the taper, so the ratio falls as the size grows', () => {
    const size = table(defaultBodyFont.size) as Record<string, number>;
    const lineHeight = table(defaultBodyFont.lineHeight) as Record<string, number>;
    // `size + 10` was never a ratio: 1.91 at 11px and 1.22 at 46px. The taper
    // holds ~1.5 at text sizes and eases toward ~1.42 at display sizes.
    const ratioAt = (key: string) => lineHeight[key] / size[key];
    expect(ratioAt('4')).toBeGreaterThan(1.45);
    expect(ratioAt('4')).toBeLessThan(1.56);
    expect(ratioAt('10')).toBeLessThan(ratioAt('4'));
    expect(ratioAt('10')).toBeGreaterThan(1.38);
  });

  it('heading rides the body size scale — there is no 1.4x fork', () => {
    expect(table(defaultHeadingFont.size)).toEqual(table(defaultBodyFont.size));
  });

  it('heading weight is the sparse 600/700/800 ramp, so bold still means something', () => {
    const weight = table(defaultHeadingFont.weight) as Record<string, string>;
    expect(weight['1']).toBe('600');
    expect(weight['6']).toBe('700');
    expect(weight['9']).toBe('800');
    // H1 is $10: compact and heavy, where mpo used to draw 64px at 400.
    expect(table(defaultHeadingFont.size)['10']).toBe(40);
    expect(weight['10']).toBe('800');
  });

  it('every declared weight has a face, so nothing is synthesised', () => {
    const face = defaultHeadingFont.face as Record<string, unknown> | undefined;
    for (const w of new Set(Object.values(table(defaultHeadingFont.weight)))) {
      expect(face?.[String(w)], `face[${w}]`).toBeDefined();
    }
  });
});

describe("a filled control's border is transparent, not $borderColor", () => {
  it('filled paints no visible border; outlined does', () => {
    const props = knobProps();
    expect(props.controlBorderFilled.borderColor).toBe('transparent');
    expect(props.controlBorderOutlined.borderColor).toBe('$borderColor');
  });

  it('both keep the same width, so switching fill style never moves a layout', () => {
    const props = knobProps();
    expect(props.controlBorderFilled.borderWidth).toBe(props.controlBorderOutlined.borderWidth);
  });

  it('the width resolves through the borderWidth knob, not a literal', () => {
    expect(knobProps({ borderWidth: 'none' }).controlBorderFilled.borderWidth).toBe(0);
    expect(knobProps({ borderWidth: 'small' }).controlBorderFilled.borderWidth).toBe(0.5);
    expect(knobProps({ borderWidth: 'medium' }).controlBorderFilled.borderWidth).toBe(1);
    expect(knobProps({ borderWidth: 'large' }).controlBorderFilled.borderWidth).toBe(2);
    // Outlined is the one that clamps: the outline IS the affordance, so it
    // never disappears entirely.
    expect(knobProps({ borderWidth: 'none' }).controlBorderOutlined.borderWidth).toBe(1);
  });
});

describe("the interaction ramp is the template's again", () => {
  const derived = defaultBuilderOptions.getTheme?.({
    name: 'light',
    theme: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`color${i + 1}`, `#${String(i + 1).padStart(6, '0')}`]),
    ),
  } as never) as Record<string, string>;

  it('none of the seven pinned ramp steps is emitted any more', () => {
    for (const key of [
      'backgroundPress',
      'backgroundFocus',
      'backgroundActive',
      'borderColor',
      'borderColorHover',
      'borderColorFocus',
      'borderColorPress',
    ]) {
      expect(derived, `getTheme still pins ${key}`).not.toHaveProperty(key);
    }
  });

  it('the additive keys stay — they name slots Tamagui has no token for', () => {
    // M5's focus ring is an improvement (stock is rgba(ink, 0.2), measured
    // 1.36:1), and the semantic aliases contradict nothing.
    expect(derived).toHaveProperty('outlineColor');
    expect(derived).toHaveProperty('placeholderColor');
    for (const alias of ['textMuted', 'textSubtle', 'borderStrong', 'surfaceStrong']) {
      expect(derived, `alias ${alias}`).toHaveProperty(alias);
    }
  });
});

describe('surfaces address semantic tokens, so sub-themes work', () => {
  it('every surface fragment paints $background, never a raw ramp step', () => {
    const props = knobProps();
    for (const key of ['surface', 'cardSurface', 'elevatedSurface', 'featureSurface'] as const) {
      expect((props[key] as { backgroundColor: string }).backgroundColor, `${key}.backgroundColor`).toBe('$background');
    }
  });

  it('a raw ramp step is inert inside surface1/surface2, which is the whole point', () => {
    // Structural, not chromatic: `$background` resolves to `$color1` under the
    // default template so the rendered colour did not change. What changed is
    // that `<Theme name="surface1">` can now move it.
    const painted = Object.values(knobProps())
      .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
      .map((fragment) => fragment.backgroundColor)
      .filter((v): v is string => typeof v === 'string');
    expect(painted).not.toContain('$color1');
    expect(painted).not.toContain('$color2');
  });
});

describe('the focus ring is inset only where a clip demands it', () => {
  it('the default sits on the border-box edge, as Tamagui paints it', () => {
    expect(FOCUS_VISIBLE_RING.outlineOffset).toBe(0);
    expect(ensureFocusVisibleRing().outlineOffset).toBe(0);
  });

  it('the ring shape itself is unchanged — 2px solid, non-removable', () => {
    const ring = ensureFocusVisibleRing({ outlineWidth: 0, outlineColor: 'transparent' });
    expect(ring.outlineWidth).toBe(2);
    expect(ring.outlineStyle).toBe('solid');
    expect(ring.outlineColor).toBe('$outlineColor');
  });

  it('a clipped call site names the inset instead of typing -2', () => {
    expect(FOCUS_RING_CLIPPED_OFFSET).toBe(-2);
    expect(ensureFocusVisibleRing({ outlineOffset: FOCUS_RING_CLIPPED_OFFSET }).outlineOffset).toBe(-2);
  });
});

describe('a shared animation name means the shared thing', () => {
  it('medium is the stock ease and duration', () => {
    expect(animationConfig.medium).toBe('ease-in 300ms');
  });

  it('every other shared name already matched, and still does', () => {
    expect(animationConfig.bouncy).toBe('ease-in 200ms');
    expect(animationConfig.lazy).toBe('ease-in 600ms');
    expect(animationConfig.slow).toBe('ease-in 500ms');
    expect(animationConfig.quick).toBe('ease-in 100ms');
  });
});

describe("the breakpoint vocabulary covers Tamagui's", () => {
  it("names Tamagui uses carry Tamagui's numbers", () => {
    expect(layoutBreakpoints.xxs).toBe(340);
    expect(layoutBreakpoints.xs).toBe(460);
    expect(layoutBreakpoints.medium).toBe(640);
    expect(layoutBreakpoints.md).toBe(768);
    expect(layoutBreakpoints.large).toBe(1024);
    expect(layoutBreakpoints.xl).toBe(1280);
    expect(layoutBreakpoints.xxl).toBe(1536);
  });

  it('expanded 860 survives as the additive pane class, still not a pivot', () => {
    // The 860 threshold has an argument behind it (M3 expanded, two panes).
    // Whether the overlay pivot should MOVE to md 768 is still open, so this
    // pins the status quo rather than pre-empting it.
    expect(layoutBreakpoints.expanded).toBe(860);
    expect(OVERLAY_BREAKPOINT).toBe(layoutBreakpoints.medium);
    expect(OVERLAY_BREAKPOINT).not.toBe(layoutBreakpoints.expanded);
  });
});

describe('the nested radius is named for what it resolves to', () => {
  it('it is never LARGER than the frame it sits inside', () => {
    const radiusPx: Record<string, number> = {
      $0: 0,
      $2: 5,
      $3: 7,
      $4: 9,
      $5: 10,
      $6: 16,
      $12: 50,
    };
    for (const knob of ['none', 'small', 'medium', 'large', 'full'] as const) {
      const props = knobProps({ borderRadius: knob });
      const outer = radiusPx[props.borderRadius.borderRadius];
      const nested = radiusPx[props.borderRadiusNested.borderRadius];
      expect(nested, `borderRadius: ${knob}`).toBeLessThanOrEqual(outer);
    }
  });

  it('the old name is the SAME object, so the two cannot drift while both exist', () => {
    const props = knobProps();
    expect(props.borderRadiusOuter).toBe(props.borderRadiusNested);
  });
});

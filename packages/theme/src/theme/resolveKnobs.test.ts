import { tokens } from '@tamagui/themes';
import { describe, expect, it, vi } from 'vitest';

import { normalizeToHex, relativeLuminance, contrastRatio, findReadableStep, semanticGroups } from './colorRules';
import { cornerSmoothClassName } from './cornerSmoothing';
import {
  defaultKnobs,
  emptyStateKnobs,
  FillStyle,
  Space,
  Size,
  Density,
  CornerSmoothing,
  FieldLabelPlacement,
  RequiredMarking,
  TableZebra,
  BulkBarPlacement,
  SelectAllScope,
  TimestampStyle,
  DisabledStyle,
  FormAutofocus,
} from './knobs';
import type { Knobs } from './knobs';
import { defaultPreset, boldPreset, heroPreset } from './presets';
import type { KnobProps } from './recipes';
import {
  applyDensity,
  capContainerRadius,
  containerCapProps,
  resolveKnobs,
  resolvePageTitleScale,
} from './resolveKnobs';

function knobsWith(overrides: Partial<Knobs>): Knobs {
  return { ...defaultKnobs, ...overrides };
}

const expectedKnobPropKeys: (keyof KnobProps)[] = [
  'borderRadius',
  'borderRadiusNested',
  'borderRadiusOuter',
  'containerRadius',
  'elevation',
  'overlayElevation',
  'elevationChrome',
  'scheme',
  'surface',
  'cardSurface',
  'elevatedSurface',
  'featureSurface',
  'inputSurface',
  'panelPadding',
  'gap',
  'gapLg',
  'sizeToken',
  'label',
  'nestedControl',
  'control',
  'controlType',
  'controlIcon',
  'heading',
  'pageTitle',
  'body',
  'textWeight',
  'transition',
  'outlined',
  'pointy',
  'textAccent',
  'textAccentColor',
  'inputBackground',
  'space',
  'size',
  'density',
  'fieldLabelPlacement',
  'requiredMarking',
  'tableZebra',
  'bulkBarPlacement',
  'selectAllScope',
  'timestampStyle',
  'disabledStyle',
  'formAutofocus',
];

// ── colorRules unit tests ────────────────────────────────────

describe('colorRules', () => {
  describe('luminance utilities', () => {
    it('normalizeToHex handles hex, short hex, hsl, and named colors', () => {
      expect(normalizeToHex('#626262')).toBe('#626262');
      expect(normalizeToHex('#fff')).toBe('#ffffff');
      expect(normalizeToHex('white')).toBe('#ffffff');
      expect(normalizeToHex('black')).toBe('#000000');
      expect(normalizeToHex('hsl(0, 0%, 50%)')).toBe('#808080');
    });

    it('contrastRatio of black vs white ≈ 21', () => {
      const lBlack = relativeLuminance('#000000');
      const lWhite = relativeLuminance('#ffffff');
      expect(contrastRatio(lBlack, lWhite)).toBeCloseTo(21, 0);
    });

    it('findReadableStep picks a step meeting MIN_CONTRAST_RATIO', () => {
      const grayDark = [
        '#050505',
        '#151515',
        '#191919',
        '#232323',
        '#282828',
        '#323232',
        '#424242',
        '#494949',
        '#545454',
        '#626262',
        '#a5a5a5',
        '#ffffff',
      ];
      const bg = relativeLuminance(grayDark[9]);
      const fg = relativeLuminance(grayDark[5]);
      expect(contrastRatio(bg, fg)).toBeLessThan(3);

      const readable = findReadableStep(grayDark, 10, 6, -1);
      const readableLum = relativeLuminance(grayDark[readable - 1]);
      expect(contrastRatio(bg, readableLum)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('semantic groups', () => {
    it('covers all 12 steps without gaps', () => {
      const covered = new Set<number>();
      for (const g of semanticGroups) {
        for (let s = g.from; s <= g.to; s++) {
          covered.add(s);
        }
      }
      for (let i = 1; i <= 12; i++) {
        expect(covered.has(i)).toBe(true);
      }
    });
  });
});

// ── resolveKnobs tests ───────────────────────────────────────

describe('resolveKnobs', () => {
  it('produces all knobProps keys from defaultKnobs', () => {
    const { knobProps } = resolveKnobs(defaultKnobs);
    for (const key of expectedKnobPropKeys) {
      expect(knobProps).toHaveProperty(key);
    }
  });

  it('is deterministic (same input → same output)', () => {
    const a = resolveKnobs(defaultKnobs);
    const b = resolveKnobs(defaultKnobs);
    expect(a).toEqual(b);
  });

  it('matches snapshot for defaultKnobs', () => {
    const resolved = resolveKnobs(defaultKnobs);
    expect(resolved).toMatchSnapshot();
  });

  // ── T1.1g — expectedKnobPropKeys includes "size" ────────
  it('expectedKnobPropKeys includes "size"', () => {
    expect(expectedKnobPropKeys).toContain('size');
  });

  // ── borderRadius ──────────────────────────────────────────

  describe('borderRadius knob', () => {
    it('maps "none" → "$0"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'none' }));
      expect(knobProps.borderRadius.borderRadius).toBe('$0');
    });

    it('maps "small" → "$2"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'small' }));
      expect(knobProps.borderRadius.borderRadius).toBe('$2');
    });

    it('maps "medium" → "$4"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'medium' }));
      expect(knobProps.borderRadius.borderRadius).toBe('$4');
    });

    it('maps "large" → "$6"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'large' }));
      expect(knobProps.borderRadius.borderRadius).toBe('$6');
    });

    it('maps "full" → "$12"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'full' }));
      expect(knobProps.borderRadius.borderRadius).toBe('$12');
    });
  });

  // ── borderWidth ───────────────────────────────────────────

  describe('borderWidth knob', () => {
    it('maps "none" → 0', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderWidth: 'none' }));
      expect(knobProps.borderRadius.borderWidth).toBe(0);
    });

    it('maps "large" → 2', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderWidth: 'large' }));
      expect(knobProps.borderRadius.borderWidth).toBe(2);
    });

    it('propagates to surface', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderWidth: 'large' }));
      expect(knobProps.surface.borderWidth).toBe(2);
    });
  });

  // ── elevation ──────────────────────────────────────────────

  describe('elevation knob', () => {
    it('maps "none" → undefined', () => {
      expect(resolveKnobs(knobsWith({ elevation: 'none' })).knobProps.elevation).toBeUndefined();
    });

    it('maps "small" → undefined: controls paint no resting shadow at the default', () => {
      const { knobProps } = resolveKnobs(knobsWith({ elevation: 'small' }));
      expect(knobProps.elevation).toBeUndefined();
      expect(knobProps.elevationChrome).toEqual({});
    });

    it('overlay elevation at small is $2, not the control $1 token', () => {
      const { knobProps } = resolveKnobs(knobsWith({ elevation: 'small' }));
      expect(knobProps.overlayElevation).toBe('$2');
      expect(knobProps.elevatedSurface.elevation).toBe('$2');
      expect(knobProps.elevatedSurface.elevation).not.toBe(knobProps.elevation);
    });

    it('maps "medium" → "$2"', () => {
      expect(resolveKnobs(knobsWith({ elevation: 'medium' })).knobProps.elevation).toBe('$2');
    });

    it('maps "large" → "$4"', () => {
      expect(resolveKnobs(knobsWith({ elevation: 'large' })).knobProps.elevation).toBe('$4');
    });

    it('light scheme keeps overlay fill at $background and paints a black shadow', () => {
      const { knobProps } = resolveKnobs(knobsWith({ elevation: 'large' }), undefined, 'light');
      expect(knobProps.scheme).toBe('light');
      expect(knobProps.elevatedSurface.backgroundColor).toBe('$background');
      expect(knobProps.cardSurface.backgroundColor).toBe('$background');
      expect(knobProps.inputBackground).toBe('$background');
      expect(knobProps.elevatedSurface.shadowColor).toBe('#000');
      expect(knobProps.elevatedSurface.shadowOpacity).toBe(0.12);
      expect(knobProps.elevationChrome.elevation).toBe(8);
    });

    it('dark scheme tints overlay/card/input up the existing ramp', () => {
      const none = resolveKnobs(knobsWith({ elevation: 'none' }), undefined, 'dark');
      const small = resolveKnobs(knobsWith({ elevation: 'small' }), undefined, 'dark');
      const large = resolveKnobs(knobsWith({ elevation: 'large' }), undefined, 'dark');
      expect(none.knobProps.elevatedSurface.backgroundColor).toBe('$background');
      expect(small.knobProps.elevatedSurface.backgroundColor).toBe('$color2');
      expect(large.knobProps.elevatedSurface.backgroundColor).toBe('$color4');
      expect(large.knobProps.cardSurface.backgroundColor).toBe('$color4');
      expect(large.knobProps.inputBackground).toBe('$color5');
      expect(large.knobProps.elevatedSurface.shadowColor).toBe('$color12');
      expect(large.knobProps.elevatedSurface.shadowOpacity).toBe(0.12);
      expect(none.knobProps.elevationChrome).toEqual({});
    });

    it('dark outlined inputs stay transparent — tint is for filled surfaces', () => {
      const { knobProps } = resolveKnobs(knobsWith({ elevation: 'large', fillStyle: 'outlined' }), undefined, 'dark');
      expect(knobProps.inputBackground).toBe('transparent');
      expect(knobProps.elevatedSurface.backgroundColor).toBe('$color4');
    });
  });

  // ── elevation on NATIVE (SB-N-04) ──────────────────────────
  // Android's RCTView `elevation` prop is a Double; a token string reaching a
  // plain RN View kills the ReactHost. Native must emit the numeric
  // tokens.size values Tamagui would resolve those tokens to.

  describe('elevation knob (native)', () => {
    it('emits RN-safe numbers, never token strings', async () => {
      vi.resetModules();
      vi.doMock('@repo/platform', () => ({
        isWeb: false,
        isTouchable: false,
        isWebTouchable: false,
      }));
      const { resolveKnobs: resolveNative } = await import('./resolveKnobs');
      try {
        expect(resolveNative(knobsWith({ elevation: 'none' })).knobProps.elevation).toBeUndefined();
        const small = resolveNative(knobsWith({ elevation: 'small', hover: { elevation: 'medium' } }));
        expect(small.knobProps.elevation).toBeUndefined();
        expect(small.knobProps.elevationChrome).toEqual({});
        expect(small.knobProps.overlayElevation).toBe(28);
        expect(small.knobProps.elevatedSurface.elevation).toBe(28);
        expect(small.knobProps.elevatedSurface.elevation).not.toBe(small.knobProps.elevation);
        expect(small.elevation.hoverKnobProps?.elevation).toBe(28);
        expect(resolveNative(knobsWith({ elevation: 'medium' })).knobProps.elevation).toBe(28);
        expect(resolveNative(knobsWith({ elevation: 'large' })).knobProps.elevation).toBe(44);
        expect(resolveNative(knobsWith({ elevation: 'large' })).knobProps.elevationChrome.elevation).toBe(8);
      } finally {
        vi.doUnmock('@repo/platform');
        vi.resetModules();
      }
    });
  });

  describe('overlay elevation ladder', () => {
    const paint = (elevation: 'small' | 'medium' | 'large', scheme: 'light' | 'dark') =>
      resolveKnobs(knobsWith({ elevation }), undefined, scheme).knobProps;

    it('overlay medium and large paint the reference popper and dialog shadows', () => {
      expect(paint('medium', 'light').overlayElevation).toBe('$3');
      expect(paint('medium', 'light').elevatedSurface.style?.boxShadow).toBe(
        '0 4px 8px rgba(0,0,0,0.10), 0 12px 32px rgba(0,0,0,0.08)',
      );
      expect(paint('large', 'light').overlayElevation).toBe('$5');
      expect(paint('large', 'light').elevatedSurface.style?.boxShadow).toBe('0 12px 24px rgba(0,0,0,0.12)');
    });

    it('overlay medium and large differ from control medium and large, in both schemes', () => {
      for (const scheme of ['light', 'dark'] as const) {
        for (const stop of ['medium', 'large'] as const) {
          const knobProps = paint(stop, scheme);
          expect(knobProps.elevatedSurface.style?.boxShadow).toBeTruthy();
          expect(knobProps.elevationChrome.style?.boxShadow).toBeTruthy();
          expect(knobProps.elevatedSurface.style?.boxShadow).not.toBe(knobProps.elevationChrome.style?.boxShadow);
        }
      }
    });

    it("dark keeps each overlay stop's geometry and inverts the hue", () => {
      expect(paint('medium', 'dark').elevatedSurface.style?.boxShadow).toBe(
        '0 4px 8px rgba(255,255,255,0.10), 0 12px 32px rgba(255,255,255,0.08)',
      );
      expect(paint('large', 'dark').elevatedSurface.style?.boxShadow).toBe('0 12px 24px rgba(255,255,255,0.12)');
    });

    it('overlays keep a shadow at the default stop while controls go flat', () => {
      const knobProps = paint('small', 'light');
      expect(knobProps.elevationChrome).toEqual({});
      expect(knobProps.elevatedSurface.style?.boxShadow).toBe('0 3px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.10)');
    });
  });

  // ── interaction state overrides ──────────────────────────────

  describe('interaction state overrides', () => {
    it('hover.elevation maps to elevation.hoverKnobProps.elevation', () => {
      const { elevation } = resolveKnobs(knobsWith({ hover: { elevation: 'medium' } }));
      expect(elevation.hoverKnobProps?.elevation).toBe('$2');
    });

    it('press.elevation maps to elevation.pressKnobProps.elevation', () => {
      const { elevation } = resolveKnobs(knobsWith({ press: { elevation: 'large' } }));
      expect(elevation.pressKnobProps?.elevation).toBe('$4');
    });

    it('hover.borderWidth maps to control.hoverKnobProps.borderWidth', () => {
      const { control } = resolveKnobs(knobsWith({ hover: { borderWidth: 'large' } }));
      expect(control.hoverKnobProps?.borderWidth).toBe(2);
    });

    it('hover.borderRadius maps to control.hoverKnobProps.borderRadius', () => {
      const { control } = resolveKnobs(knobsWith({ hover: { borderRadius: 'full' } }));
      expect(control.hoverKnobProps?.borderRadius).toBe('$12');
    });

    it('empty state knobs still emit default hover/press layers + focus ring (W12)', () => {
      const { control } = resolveKnobs(defaultKnobs);
      expect(control.hoverKnobProps).toEqual({ backgroundColor: '$backgroundHover' });
      expect(control.pressKnobProps).toEqual({ backgroundColor: '$backgroundPress' });
      expect(control.focusKnobProps).toBeUndefined();
      expect(control.focusVisibleKnobProps).toMatchObject({
        outlineWidth: 2,
        outlineStyle: 'solid',
        outlineColor: '$outlineColor',
      });
    });

    it('focus.elevation maps to elevation.focusKnobProps.elevation', () => {
      const { elevation } = resolveKnobs(knobsWith({ focus: { elevation: 'large' } }));
      expect(elevation.focusKnobProps?.elevation).toBe('$4');
    });

    it('focusVisible.borderWidth maps to control.focusVisibleKnobProps.borderWidth', () => {
      const { control } = resolveKnobs(knobsWith({ focusVisible: { borderWidth: 'medium' } }));
      expect(control.focusVisibleKnobProps?.borderWidth).toBe(1);
    });
  });

  // ── space ──────────────────────────────────────────────

  describe('space knob', () => {
    it('maps panelPadding "small" → "$3"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ space: 'small' }));
      expect(knobProps.panelPadding.padding).toBe('$3');
    });

    it('maps gap "large" → "$5"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ space: 'large' }));
      expect(knobProps.gap.gap).toBe('$5');
    });

    it('passes space value through to knobProps', () => {
      const { knobProps } = resolveKnobs(knobsWith({ space: 'large' }));
      expect(knobProps.space).toBe('large');
    });

    // T2.1a — space "large" no longer changes sizeToken
    it('space does not affect sizeToken', () => {
      const { knobProps } = resolveKnobs(knobsWith({ space: 'large', size: 'medium' }));
      expect(knobProps.sizeToken).toBe('$4');
    });

    // T2.1b — space "small" still maps panelPadding regardless of size
    it('space "small" maps panelPadding → "$3" regardless of size', () => {
      const { knobProps } = resolveKnobs(knobsWith({ space: 'small', size: 'large' }));
      expect(knobProps.panelPadding.padding).toBe('$3');
    });

    // T2.1c — space "large" still maps gapLg → "$6" regardless of size
    it('space "large" maps gapLg → "$6" regardless of size', () => {
      const { knobProps } = resolveKnobs(knobsWith({ space: 'large', size: 'small' }));
      expect(knobProps.gapLg.gap).toBe('$6');
    });
  });

  // ── size ──────────────────────────────────────────────────

  describe('size knob', () => {
    // T1.1b — size "large" maps sizeToken → "$5"
    it('maps sizeToken "large" → "$5"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ size: 'large' }));
      expect(knobProps.sizeToken).toBe('$5');
    });

    // T1.1c — size "small" maps sizeToken → "$3"
    it('maps sizeToken "small" → "$3"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ size: 'small' }));
      expect(knobProps.sizeToken).toBe('$3');
    });

    // T1.1e — knobProps.size passthrough
    it('passes size value through to knobProps', () => {
      for (const val of Object.values(Size)) {
        const { knobProps } = resolveKnobs(knobsWith({ size: val }));
        expect(knobProps.size).toBe(val);
      }
    });

    // T1.1f — independent axes: size "large" + space "small"
    it('size "large" + space "small" → sizeToken "$5" AND gap "$2"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ size: 'large', space: 'small' }));
      expect(knobProps.sizeToken).toBe('$5');
      expect(knobProps.gap.gap).toBe('$2');
    });

    // T2.1e — changing size does NOT affect panelPadding, gap, or gapLg
    it('changing size does not affect panelPadding, gap, or gapLg', () => {
      const baseline = resolveKnobs(knobsWith({ size: 'medium', space: 'medium' }));
      for (const sizeVal of Object.values(Size)) {
        const { knobProps } = resolveKnobs(knobsWith({ size: sizeVal, space: 'medium' }));
        expect(knobProps.panelPadding).toEqual(baseline.knobProps.panelPadding);
        expect(knobProps.gap).toEqual(baseline.knobProps.gap);
        expect(knobProps.gapLg).toEqual(baseline.knobProps.gapLg);
      }
    });

    // T2.1f — default knobs produce identical output to prior default
    it('default knobs (size+space both medium) produce consistent output', () => {
      const resolved = resolveKnobs(defaultKnobs);
      expect(resolved.knobProps.sizeToken).toBe('$4');
      expect(resolved.knobProps.gap.gap).toBe('$4');
      expect(resolved.knobProps.panelPadding.padding).toBe('$4');
      expect(resolved.knobProps.gapLg.gap).toBe('$5');
    });

    it('fills control / controlType / controlIcon from the size recipe', () => {
      const { knobProps } = resolveKnobs(defaultKnobs);
      expect(knobProps.control).toEqual({
        height: 44,
        paddingHorizontal: 18,
        gap: 9,
      });
      expect(knobProps.controlType).toEqual({ fontSize: 14 });
      expect(knobProps.controlIcon).toEqual({ width: 16, height: 16 });
      expect(knobProps.control).not.toHaveProperty('borderRadius');
      expect(knobProps.controlType).not.toHaveProperty('borderRadius');
      expect(knobProps.controlIcon).not.toHaveProperty('borderRadius');
    });

    it('small and large share the same borderRadius fragment', () => {
      const small = resolveKnobs(knobsWith({ size: 'small' }));
      const large = resolveKnobs(knobsWith({ size: 'large' }));
      expect(small.knobProps.control.height).toBe(36);
      expect(large.knobProps.control.height).toBe(52);
      expect(small.knobProps.borderRadius).toEqual(large.knobProps.borderRadius);
    });
  });

  // ── surface tiers ─────────────────────────────────────────

  describe('surface tier recipes', () => {
    it('cardSurface = bg + radius + panelPadding, no border/shadow', () => {
      const { knobProps } = resolveKnobs(defaultKnobs);
      expect(knobProps.cardSurface).toEqual({
        backgroundColor: '$background',
        borderRadius: '$4',
        padding: '$4',
      });
      expect(knobProps.cardSurface).not.toHaveProperty('borderWidth');
      expect(knobProps.cardSurface).not.toHaveProperty('elevation');
    });

    it('cardSurface tracks borderRadius and space knobs (cap bites: large radius 16px > small padding 13px)', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'large', space: 'small' }));
      expect(knobProps.cardSurface.borderRadius).toBe(13);
      expect(knobProps.cardSurface.padding).toBe('$3');
    });

    it('cardSurface keeps the radius token while it fits the padding', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'large', space: 'medium' }));
      expect(knobProps.cardSurface.borderRadius).toBe('$6');
    });

    it('elevatedSurface = surface + radius + overlay elevation + paint', () => {
      const { knobProps } = resolveKnobs(defaultKnobs);
      expect(knobProps.elevatedSurface.elevation).toBe(knobProps.overlayElevation);
      expect(knobProps.elevatedSurface.elevation).not.toBe(knobProps.elevation);
      expect(knobProps.elevatedSurface.backgroundColor).toBe(knobProps.surface.backgroundColor);
      expect(knobProps.elevatedSurface.borderColor).toBe(knobProps.surface.borderColor);
      expect(knobProps.elevatedSurface.borderWidth).toBe(knobProps.surface.borderWidth);
      expect(knobProps.elevatedSurface.borderRadius).toBe(knobProps.borderRadius.borderRadius);
    });

    it('overlay elevation token differs from the control elevation token', () => {
      for (const elevation of ['small', 'medium', 'large'] as const) {
        const { knobProps } = resolveKnobs(knobsWith({ elevation }));
        expect(knobProps.overlayElevation, elevation).toBeDefined();
        expect(knobProps.overlayElevation, elevation).not.toBe(knobProps.elevation);
        expect(knobProps.elevatedSurface.elevation, elevation).toBe(knobProps.overlayElevation);
      }
      const none = resolveKnobs(knobsWith({ elevation: 'none' }));
      expect(none.knobProps.elevation).toBeUndefined();
      expect(none.knobProps.overlayElevation).toBeUndefined();
      expect(none.knobProps.elevatedSurface.elevation).toBeUndefined();
    });

    it('featureSurface uses big radius, $6 padding, and an ultra-soft shadow', () => {
      const { knobProps } = resolveKnobs(defaultKnobs);
      expect(knobProps.featureSurface.borderRadius).toBe('$10');
      expect(knobProps.featureSurface.padding).toBe('$6');
      expect(knobProps.featureSurface.shadowOffset).toEqual({ width: 0, height: 9 });
      expect(knobProps.featureSurface.shadowRadius).toBe(12);
      expect(knobProps.featureSurface).not.toHaveProperty('borderWidth');
    });

    it('featureSurface keeps $10 / $6 at the default knobs and every other stop moves them', () => {
      expect(defaultKnobs.borderRadius).toBe('medium');
      expect(defaultKnobs.space).toBe('medium');
      for (const borderRadius of ['none', 'small', 'large', 'full'] as const) {
        expect(resolveKnobs(knobsWith({ borderRadius })).knobProps.featureSurface.borderRadius, borderRadius).not.toBe(
          '$10',
        );
      }
      for (const space of ['small', 'large'] as const) {
        expect(resolveKnobs(knobsWith({ space })).knobProps.featureSurface.padding, space).not.toBe('$6');
      }
    });

    it('featureSurface radius follows the radius knob, one token per stop around $10, uncapped by space', () => {
      const expected = {
        none: '$0',
        small: '$9',
        medium: '$10',
        large: '$11',
        full: '$12',
      } as const;
      for (const [borderRadius, token] of Object.entries(expected)) {
        for (const space of ['small', 'medium', 'large'] as const) {
          expect(
            resolveKnobs(knobsWith({ borderRadius: borderRadius as Knobs['borderRadius'], space })).knobProps
              .featureSurface.borderRadius,
            `${borderRadius}/${space}`,
          ).toBe(token);
        }
      }
    });

    it('featureSurface padding follows the space knob, one token per stop around $6', () => {
      const expected = { small: '$5', medium: '$6', large: '$7' } as const;
      for (const [space, token] of Object.entries(expected)) {
        for (const borderRadius of ['none', 'small', 'medium', 'large', 'full'] as const) {
          expect(
            resolveKnobs(knobsWith({ borderRadius, space: space as Knobs['space'] })).knobProps.featureSurface.padding,
            `${borderRadius}/${space}`,
          ).toBe(token);
        }
      }
    });

    it('compact density steps featureSurface padding through the space knob', () => {
      const { knobProps } = resolveKnobs(applyDensity(knobsWith({ density: 'compact' })));
      expect(knobProps.featureSurface.padding).toBe('$5');
      expect(knobProps.featureSurface.borderRadius).toBe('$10');
    });

    it('featureSurface never clips a child at its inset: padding >= radius x (1 - 1/sqrt 2) at every stop pair', () => {
      for (const borderRadius of ['none', 'small', 'medium', 'large', 'full'] as const) {
        for (const space of ['small', 'medium', 'large'] as const) {
          const { featureSurface } = resolveKnobs(knobsWith({ borderRadius, space })).knobProps;
          const radiusPx = (tokens.radius as any)[featureSurface.borderRadius.slice(1)].val as number;
          const paddingPx = (tokens.space as any)[featureSurface.padding.slice(1)].val as number;
          expect(paddingPx, `${borderRadius}/${space}`).toBeGreaterThanOrEqual(radiusPx * (1 - Math.SQRT1_2));
        }
      }
    });
  });

  // ── container radius cap (Axiom 1 CLIP) ──────────────────

  describe('containerRadius (Axiom 1 child-clip cap)', () => {
    it('default knobs are untouched (radius $4 = 9px fits medium padding 18px)', () => {
      const { knobProps } = resolveKnobs(defaultKnobs);
      expect(knobProps.containerRadius).toEqual({ borderRadius: '$4' });
      expect(knobProps.cardSurface.borderRadius).toBe('$4');
    });

    it('caps full radius at the padding px for every space', () => {
      expect(
        resolveKnobs(knobsWith({ borderRadius: 'full', space: 'small' })).knobProps.containerRadius.borderRadius,
      ).toBe(13);
      expect(
        resolveKnobs(knobsWith({ borderRadius: 'full', space: 'medium' })).knobProps.containerRadius.borderRadius,
      ).toBe(18);
      expect(
        resolveKnobs(knobsWith({ borderRadius: 'full', space: 'large' })).knobProps.containerRadius.borderRadius,
      ).toBe(32);
    });

    it('only bites at large/full: none/small/medium keep their token at every space', () => {
      for (const space of Object.values(Space)) {
        for (const [radius, token] of [
          ['none', '$0'],
          ['small', '$2'],
          ['medium', '$4'],
        ] as const) {
          const { knobProps } = resolveKnobs(knobsWith({ borderRadius: radius, space }));
          expect(knobProps.containerRadius.borderRadius).toBe(token);
        }
      }
    });

    it('large radius caps only under small space (16px > 13px)', () => {
      expect(
        resolveKnobs(knobsWith({ borderRadius: 'large', space: 'small' })).knobProps.containerRadius.borderRadius,
      ).toBe(13);
      expect(
        resolveKnobs(knobsWith({ borderRadius: 'large', space: 'medium' })).knobProps.containerRadius.borderRadius,
      ).toBe('$6');
      expect(
        resolveKnobs(knobsWith({ borderRadius: 'large', space: 'large' })).knobProps.containerRadius.borderRadius,
      ).toBe('$6');
    });

    it('mirrored px values agree with the live @tamagui/themes tokens (drift guard)', () => {
      const radiusTokenByKnob = {
        none: '$0',
        small: '$2',
        medium: '$4',
        large: '$6',
        full: '$12',
      } as const;
      const paddingTokenByKnob = { small: '$3', medium: '$4', large: '$6' } as const;
      for (const [radiusKnob, radiusToken] of Object.entries(radiusTokenByKnob)) {
        for (const [spaceKnob, paddingToken] of Object.entries(paddingTokenByKnob)) {
          const radiusPx = (tokens.radius as any)[radiusToken.slice(1)].val as number;
          const paddingPx = (tokens.space as any)[paddingToken.slice(1)].val as number;
          const expected = radiusPx > paddingPx ? paddingPx : radiusToken;
          expect(
            capContainerRadius(radiusKnob as Knobs['borderRadius'], spaceKnob as Knobs['space']),
            `radius=${radiusKnob} space=${spaceKnob}`,
          ).toBe(expected);
        }
      }
    });
  });

  // ── cornerSmoothing (Axiom 15 OPTICS) ─────────────────────

  describe('cornerSmoothing knob', () => {
    const radiusFragments = [
      'borderRadius',
      'borderRadiusNested',
      'containerRadius',
      'cardSurface',
      'elevatedSurface',
      'featureSurface',
    ] as const;

    it('defaults to "round" and emits no class on any fragment', () => {
      expect(defaultKnobs.cornerSmoothing).toBe(CornerSmoothing.Round);
      const { knobProps } = resolveKnobs(defaultKnobs);
      for (const fragment of radiusFragments) {
        expect(knobProps[fragment], fragment).not.toHaveProperty('className');
      }
    });

    it('treats an absent knob as "round" (optional key, older presets)', () => {
      const { cornerSmoothing: _omit, ...withoutKnob } = defaultKnobs;
      const { knobProps } = resolveKnobs(withoutKnob as Knobs);
      for (const fragment of radiusFragments) {
        expect(knobProps[fragment], fragment).not.toHaveProperty('className');
      }
    });

    it('smooth × arc classes (small/medium/large): every radius-bearing fragment carries the class', () => {
      for (const radius of ['small', 'medium', 'large'] as const) {
        const { knobProps } = resolveKnobs(knobsWith({ cornerSmoothing: 'smooth', borderRadius: radius }));
        for (const fragment of radiusFragments) {
          expect(knobProps[fragment].className, `${radius}/${fragment}`).toBe(cornerSmoothClassName);
        }
      }
    });

    it('smooth × none: nothing to smooth, featureSurface included', () => {
      const { knobProps } = resolveKnobs(knobsWith({ cornerSmoothing: 'smooth', borderRadius: 'none' }));
      // $0 corners have no arc — square world stays square (Axiom 3 NULL).
      expect(knobProps.borderRadius).not.toHaveProperty('className');
      expect(knobProps.borderRadiusNested).not.toHaveProperty('className');
      expect(knobProps.containerRadius).not.toHaveProperty('className');
      expect(knobProps.cardSurface).not.toHaveProperty('className');
      expect(knobProps.elevatedSurface).not.toHaveProperty('className');
      expect(knobProps.featureSurface).not.toHaveProperty('className');
    });

    it('smooth × full: pill/circle identity fragments ignore smoothing (R-BINARY/R-PILL)', () => {
      const { knobProps } = resolveKnobs(knobsWith({ cornerSmoothing: 'smooth', borderRadius: 'full' }));
      // Uncapped $12 turns control-tier parts into capsules/circles —
      // identity shapes that squircle ends would distort.
      expect(knobProps.borderRadius).not.toHaveProperty('className');
      expect(knobProps.elevatedSurface).not.toHaveProperty('className');
      // Capped/outer fragments stay plain arcs (cap = padding px, outer ≤ $5)
      // and keep smoothing.
      expect(knobProps.borderRadiusNested.className).toBe(cornerSmoothClassName);
      expect(knobProps.containerRadius.className).toBe(cornerSmoothClassName);
      expect(knobProps.cardSurface.className).toBe(cornerSmoothClassName);
      expect(knobProps.featureSurface.className).toBe(cornerSmoothClassName);
    });

    it('smooth keeps the Axiom 1 container cap (clamped radii keep their caps)', () => {
      const smooth = resolveKnobs(knobsWith({ cornerSmoothing: 'smooth', borderRadius: 'full', space: 'small' }));
      const round = resolveKnobs(knobsWith({ borderRadius: 'full', space: 'small' }));
      expect(smooth.knobProps.containerRadius.borderRadius).toBe(13);
      expect(round.knobProps.containerRadius.borderRadius).toBe(13);
      expect(smooth.knobProps.cardSurface.borderRadius).toBe(13);
      expect(smooth.knobProps.containerRadius.className).toBe(cornerSmoothClassName);
    });

    it('smooth changes nothing but the class (radius/border/padding identical to round)', () => {
      const round = resolveKnobs(knobsWith({ cornerSmoothing: 'round' }));
      const smooth = resolveKnobs(knobsWith({ cornerSmoothing: 'smooth' }));
      for (const fragment of radiusFragments) {
        const { className: _cls, ...smoothRest } = smooth.knobProps[fragment];
        expect(smoothRest, fragment).toEqual(round.knobProps[fragment]);
      }
    });

    it('never leaks onto non-radius fragments', () => {
      const { knobProps } = resolveKnobs(knobsWith({ cornerSmoothing: 'smooth' }));
      expect(knobProps.surface).not.toHaveProperty('className');
      expect(knobProps.inputSurface).not.toHaveProperty('className');
      expect(knobProps.panelPadding).not.toHaveProperty('className');
      expect(knobProps.gap).not.toHaveProperty('className');
    });

    it('shipped presets pin the house default (round)', () => {
      expect(defaultPreset.knobs.cornerSmoothing).toBe('round');
      expect(boldPreset.knobs.cornerSmoothing).toBe('round');
    });

    // Native resolves to `round` for now (SquircleView adoption is phase 2) —
    // no className may reach RN views regardless of the knob.
    it('native emits no class for either value', async () => {
      vi.resetModules();
      vi.doMock('@repo/platform', () => ({
        isWeb: false,
        isTouchable: false,
        isWebTouchable: false,
      }));
      const { resolveKnobs: resolveNative } = await import('./resolveKnobs');
      try {
        for (const cornerSmoothing of ['round', 'smooth'] as const) {
          const { knobProps } = resolveNative(knobsWith({ cornerSmoothing }));
          for (const fragment of radiusFragments) {
            expect(knobProps[fragment], `${cornerSmoothing}/${fragment}`).not.toHaveProperty('className');
          }
        }
      } finally {
        vi.doUnmock('@repo/platform');
        vi.resetModules();
      }
    });
  });

  // ── fillStyle ─────────────────────────────────────────────

  describe('fillStyle knob', () => {
    it('filled → outlined is false', () => {
      const { knobProps } = resolveKnobs(knobsWith({ fillStyle: 'filled' }));
      expect(knobProps.outlined).toBe(false);
    });

    it('outlined → outlined is true', () => {
      const { knobProps } = resolveKnobs(knobsWith({ fillStyle: 'outlined' }));
      expect(knobProps.outlined).toBe(true);
    });

    it('union is filled | outlined only', () => {
      expect(Object.values(FillStyle)).toEqual(['filled', 'outlined']);
      expect(Object.values(FillStyle)).toHaveLength(2);
    });
  });

  describe('separator weight is not a knob', () => {
    it('Knobs has no separatorWeight channel', () => {
      expect('separatorWeight' in defaultKnobs).toBe(false);
      expect(Object.keys(defaultKnobs)).not.toContain('separatorWeight');
    });
  });

  describe('fillStyle × borderWidth (OUTLINED-HAIRLINE)', () => {
    it('filled + none is chromeless (width 0)', () => {
      const { knobProps } = resolveKnobs(knobsWith({ fillStyle: 'filled', borderWidth: 'none' }));
      expect(knobProps.borderRadius.borderWidth).toBe(0);
      expect(knobProps.surface.borderWidth).toBe(0);
      expect(knobProps.elevatedSurface.borderWidth).toBe(0);
      expect(knobProps.inputSurface.borderWidth).toBe(0);
    });

    it('outlined + none still draws the hairline (small stop, 0.5)', () => {
      const { knobProps } = resolveKnobs(knobsWith({ fillStyle: 'outlined', borderWidth: 'none' }));
      expect(knobProps.borderRadius.borderWidth).toBe(0.5);
      expect(knobProps.surface.borderWidth).toBe(0.5);
      expect(knobProps.elevatedSurface.borderWidth).toBe(0.5);
      expect(knobProps.inputSurface.borderWidth).toBe(0.5);
    });

    it('outlined + small stays at the hairline, not a hidden 1px floor', () => {
      const { knobProps } = resolveKnobs(knobsWith({ fillStyle: 'outlined', borderWidth: 'small' }));
      expect(knobProps.borderRadius.borderWidth).toBe(0.5);
    });

    it('outlined + medium/large keep the requested width', () => {
      expect(
        resolveKnobs(knobsWith({ fillStyle: 'outlined', borderWidth: 'medium' })).knobProps.borderRadius.borderWidth,
      ).toBe(1);
      expect(
        resolveKnobs(knobsWith({ fillStyle: 'outlined', borderWidth: 'large' })).knobProps.borderRadius.borderWidth,
      ).toBe(2);
    });
  });

  // ── pointy ────────────────────────────────────────────────

  describe('pointy derivation', () => {
    it('is true when borderRadius is "none"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'none' }));
      expect(knobProps.pointy).toBe(true);
    });

    it('is false when borderRadius is "small"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'small' }));
      expect(knobProps.pointy).toBe(false);
    });

    it('is false when borderRadius is "medium"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'medium' }));
      expect(knobProps.pointy).toBe(false);
    });

    it('is false when borderRadius is "full"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ borderRadius: 'full' }));
      expect(knobProps.pointy).toBe(false);
    });

    it('is false for default knobs', () => {
      const { knobProps } = resolveKnobs(defaultKnobs);
      expect(knobProps.pointy).toBe(false);
    });
  });

  // ── textAccent ────────────────────────────────────────────

  describe('textAccent knob', () => {
    it('passes through to knobProps', () => {
      const high = resolveKnobs(knobsWith({ textAccent: 'high' }));
      expect(high.knobProps.textAccent).toBe('high');

      const medium = resolveKnobs(knobsWith({ textAccent: 'medium' }));
      expect(medium.knobProps.textAccent).toBe('medium');

      const low = resolveKnobs(knobsWith({ textAccent: 'low' }));
      expect(low.knobProps.textAccent).toBe('low');
    });
  });

  // ── typography knobs ────────────────────────────────────────

  describe('typography knobs', () => {
    it('heading font maps correctly', () => {
      expect(resolveKnobs(knobsWith({ headingFont: 'sans-serif' })).knobProps.heading.fontFamily).toBe('$heading');
      expect(resolveKnobs(knobsWith({ headingFont: 'serif' })).knobProps.heading.fontFamily).toBe('$serif');
      expect(resolveKnobs(knobsWith({ headingFont: 'mono' })).knobProps.heading.fontFamily).toBe('$mono');
      expect(resolveKnobs(knobsWith({ headingFont: 'slab' })).knobProps.heading.fontFamily).toBe('$slab');
      expect(resolveKnobs(knobsWith({ headingFont: 'pixel' })).knobProps.heading.fontFamily).toBe('$pixel');
    });

    it('body font maps correctly', () => {
      expect(resolveKnobs(knobsWith({ bodyFont: 'sans-serif' })).knobProps.body.fontFamily).toBe('$body');
      expect(resolveKnobs(knobsWith({ bodyFont: 'serif' })).knobProps.body.fontFamily).toBe('$serif');
      expect(resolveKnobs(knobsWith({ bodyFont: 'mono' })).knobProps.body.fontFamily).toBe('$mono');
      expect(resolveKnobs(knobsWith({ bodyFont: 'slab' })).knobProps.body.fontFamily).toBe('$slab');
      expect(resolveKnobs(knobsWith({ bodyFont: 'pixel' })).knobProps.body.fontFamily).toBe('$pixel');
    });

    it('fontWeight maps correctly', () => {
      expect(resolveKnobs(knobsWith({ fontWeight: 'regular' })).knobProps.heading.fontWeight).toBe('400');
      expect(resolveKnobs(knobsWith({ fontWeight: 'bold' })).knobProps.heading.fontWeight).toBe('700');
    });
  });

  // ── pageTitleScale (hero-H1 dial) ──────────────────────

  describe('pageTitleScale knob', () => {
    it('defaults to the moderate page-title step ($8 = 32px)', () => {
      expect(resolveKnobs(defaultKnobs).knobProps.pageTitle).toEqual({ size: '$8' });
    });

    it('"display" re-opens the hero step ($10 = 64px)', () => {
      expect(resolveKnobs(knobsWith({ pageTitleScale: 'display' })).knobProps.pageTitle).toEqual({
        size: '$10',
      });
    });

    it('an omitted knob still resolves moderate (preset constructions predate the dial)', () => {
      const { pageTitleScale: _omitted, ...withoutDial } = defaultKnobs;
      expect(resolveKnobs(withoutDial as Knobs).knobProps.pageTitle).toEqual({ size: '$8' });
    });

    it('resolvePageTitleScale is the one table both channels read', () => {
      expect(resolvePageTitleScale('moderate')).toEqual({ size: '$8' });
      expect(resolvePageTitleScale('display')).toEqual({ size: '$10' });
    });

    it('product presets ship moderate; `hero` is the only display opt-in', () => {
      expect(defaultPreset.knobs.pageTitleScale).toBe('moderate');
      expect(boldPreset.knobs.pageTitleScale).toBe('moderate');
      expect(heroPreset.knobs.pageTitleScale).toBe('display');
      expect(resolveKnobs(heroPreset.knobs).knobProps.pageTitle).toEqual({ size: '$10' });
    });

    it('`hero` differs from the default preset in nothing but the title step', () => {
      const { pageTitleScale: _hero, ...heroRest } = heroPreset.knobs;
      const { pageTitleScale: _default, ...defaultRest } = defaultPreset.knobs;
      expect(heroRest).toEqual(defaultRest);
      expect(heroPreset.theme).toBe(defaultPreset.theme);
    });
  });

  // ── animation ─────────────────────────────────────────────

  describe('animation knob', () => {
    it('"none" → transition is undefined', () => {
      const { knobProps } = resolveKnobs(knobsWith({ animation: 'none' }));
      expect(knobProps.transition).toBeUndefined();
    });

    it('"bouncy" → transition is "bouncy"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ animation: 'bouncy' }));
      expect(knobProps.transition).toBe('bouncy');
    });

    it('"quick" → transition is "quick"', () => {
      const { knobProps } = resolveKnobs(knobsWith({ animation: 'quick' }));
      expect(knobProps.transition).toBe('quick');
    });
  });

  // ── override callback ─────────────────────────────────────

  describe('override callback', () => {
    it('merges partial knobProps overrides on top', () => {
      const { knobProps } = resolveKnobs(defaultKnobs, () => ({
        elevation: '$4',
      }));
      expect(knobProps.elevation).toBe('$4');
    });

    it('does not mutate original knobProps', () => {
      const baseline = resolveKnobs(defaultKnobs);
      const overridden = resolveKnobs(defaultKnobs, () => ({
        elevation: '$4',
      }));
      expect(baseline.knobProps.elevation).toBeUndefined();
      expect(overridden.knobProps.elevation).toBe('$4');
    });

    // T4.1g — override callback receives knobProps with both size and space
    it('override callback receives knobProps with both size and space', () => {
      let receivedProps: KnobProps | undefined;
      resolveKnobs(knobsWith({ size: 'large', space: 'small' }), (props) => {
        receivedProps = props;
        return {};
      });
      expect(receivedProps).toBeDefined();
      expect(receivedProps!.size).toBe('large');
      expect(receivedProps!.space).toBe('small');
    });
  });

  // ── Group 4: Gap review tests ─────────────────────────────

  describe('gap review', () => {
    const sizeTokenMap: Record<string, string> = {
      small: '$3',
      medium: '$4',
      large: '$5',
    };

    const gapMap: Record<string, string> = {
      small: '$2',
      medium: '$4',
      large: '$5',
    };

    const panelPaddingMap: Record<string, string> = {
      small: '$3',
      medium: '$4',
      large: '$6',
    };

    const gapLgMap: Record<string, string> = {
      small: '$3',
      medium: '$5',
      large: '$6',
    };

    // T4.1a — every Size enum value produces a valid sizeToken
    it('every Size enum value produces a valid sizeToken', () => {
      for (const sizeVal of Object.values(Size)) {
        const { knobProps } = resolveKnobs(knobsWith({ size: sizeVal }));
        expect(knobProps.sizeToken).toBe(sizeTokenMap[sizeVal]);
      }
    });

    // T4.1b — every Space enum value produces valid panelPadding, gap, gapLg
    it('every Space enum value produces valid panelPadding, gap, gapLg', () => {
      for (const spaceVal of Object.values(Space)) {
        const { knobProps } = resolveKnobs(knobsWith({ space: spaceVal }));
        expect(knobProps.panelPadding.padding).toBe(panelPaddingMap[spaceVal]);
        expect(knobProps.gap.gap).toBe(gapMap[spaceVal]);
        expect(knobProps.gapLg.gap).toBe(gapLgMap[spaceVal]);
      }
    });

    // T4.1c — all 9 combinations of size × space
    it('all 9 size × space combinations produce expected sizeToken and gap pairs', () => {
      for (const sizeVal of Object.values(Size)) {
        for (const spaceVal of Object.values(Space)) {
          const { knobProps } = resolveKnobs(knobsWith({ size: sizeVal, space: spaceVal }));
          expect(knobProps.sizeToken).toBe(sizeTokenMap[sizeVal]);
          expect(knobProps.gap.gap).toBe(gapMap[spaceVal]);
          expect(knobProps.panelPadding.padding).toBe(panelPaddingMap[spaceVal]);
          expect(knobProps.gapLg.gap).toBe(gapLgMap[spaceVal]);
        }
      }
    });

    // T4.1e — knobProps.space still equals knobs.space
    it('knobProps.space equals knobs.space', () => {
      for (const spaceVal of Object.values(Space)) {
        const { knobProps } = resolveKnobs(knobsWith({ space: spaceVal }));
        expect(knobProps.space).toBe(spaceVal);
      }
    });

    // T4.1f — knobProps.size equals knobs.size
    it('knobProps.size equals knobs.size', () => {
      for (const sizeVal of Object.values(Size)) {
        const { knobProps } = resolveKnobs(knobsWith({ size: sizeVal }));
        expect(knobProps.size).toBe(sizeVal);
      }
    });

    // T4.1h — defaultKnobs has both size and space set to "medium"
    it('defaultKnobs has both size and space set to "medium"', () => {
      expect(defaultKnobs.size).toBe('medium');
      expect(defaultKnobs.space).toBe('medium');
    });

    // T4.1i — emptyStateKnobs is still valid (W12: default hover layer remains)
    it('emptyStateKnobs is still valid (no required size field breaks it)', () => {
      const knobs = knobsWith({ hover: emptyStateKnobs });
      const { control } = resolveKnobs(knobs);
      expect(control.hoverKnobProps).toEqual({ backgroundColor: '$backgroundHover' });
    });

    // T4.1j — size "large" does not change borderRadius
    it('size "large" does not change borderRadius', () => {
      const baseline = resolveKnobs(knobsWith({ size: 'medium' }));
      const large = resolveKnobs(knobsWith({ size: 'large' }));
      expect(large.knobProps.borderRadius).toEqual(baseline.knobProps.borderRadius);
    });
  });
});

// ── Density ─────────────────────────────────

describe('applyDensity', () => {
  it('defaultKnobs.density is "comfortable"', () => {
    expect(defaultKnobs.density).toBe(Density.Comfortable);
  });

  it('comfortable density leaves size and space unchanged', () => {
    const knobs = knobsWith({ size: 'large', space: 'large', density: 'comfortable' });
    const applied = applyDensity(knobs);
    expect(applied.size).toBe('large');
    expect(applied.space).toBe('large');
    expect(applied.density).toBe('comfortable');
  });

  it('compact density steps space down one level and leaves size unchanged', () => {
    expect(applyDensity(knobsWith({ size: 'large', space: 'large', density: 'compact' }))).toMatchObject({
      size: 'large',
      space: 'medium',
      density: 'compact',
    });
    expect(applyDensity(knobsWith({ size: 'medium', space: 'medium', density: 'compact' }))).toMatchObject({
      size: 'medium',
      space: 'small',
      density: 'compact',
    });
    expect(applyDensity(knobsWith({ size: 'small', space: 'small', density: 'compact' }))).toMatchObject({
      size: 'small',
      space: 'small',
      density: 'compact',
    });
  });

  it('compact:true override wins over comfortable density knob without changing size', () => {
    const applied = applyDensity(knobsWith({ size: 'medium', space: 'medium', density: 'comfortable' }), true);
    expect(applied).toMatchObject({ size: 'medium', space: 'small', density: 'compact' });
  });

  it('compact:false override wins over compact density knob', () => {
    const applied = applyDensity(knobsWith({ size: 'medium', space: 'medium', density: 'compact' }), false);
    expect(applied).toMatchObject({ size: 'medium', space: 'medium', density: 'comfortable' });
  });

  it('resolveKnobs exposes density on knobProps', () => {
    expect(resolveKnobs(defaultKnobs).knobProps.density).toBe('comfortable');
    expect(resolveKnobs(knobsWith({ density: 'compact' })).knobProps.density).toBe('compact');
  });

  it('compact and comfortable differ in padX while height stays 44', () => {
    const comfortable = resolveKnobs(knobsWith({ density: 'comfortable' }));
    const compact = resolveKnobs(knobsWith({ density: 'compact' }));
    expect(comfortable.knobProps.control.height).toBe(44);
    expect(compact.knobProps.control.height).toBe(44);
    expect(comfortable.knobProps.sizeToken).toBe('$4');
    expect(compact.knobProps.sizeToken).toBe('$4');
    expect(compact.knobProps.control.paddingHorizontal).not.toBe(comfortable.knobProps.control.paddingHorizontal);
    expect(comfortable.knobProps.control.paddingHorizontal).toBe(18);
    expect(compact.knobProps.control.paddingHorizontal).toBe(16);
  });

  it('names which gap density moves: the LAYOUT gap, never the recipe gap', () => {
    // `control.gap` retains the size-table grouping across density and shape.
    // The gap a reader sees tighten is `knobProps.gap`, the
    // space-ramp one, and it only moves once `applyDensity` has stepped
    // `space` — `resolveKnobs` alone is a pure token mapper.
    const comfortable = resolveKnobs(applyDensity(knobsWith({ space: 'medium' })));
    const compact = resolveKnobs(applyDensity(knobsWith({ space: 'medium', density: 'compact' })));
    expect(compact.knobProps.control.gap).toBe(comfortable.knobProps.control.gap);
    expect(compact.knobProps.gap).not.toEqual(comfortable.knobProps.gap);
    expect(compact.knobProps.panelPadding).not.toEqual(comfortable.knobProps.panelPadding);
    expect(compact.knobProps.control.height).toBe(44);
    expect(comfortable.knobProps.control.height).toBe(44);
  });

  it('compact density produces the same sizeToken and a smaller gap than comfortable', () => {
    const comfortable = resolveKnobs(applyDensity(knobsWith({ size: 'medium', space: 'medium' })));
    const compact = resolveKnobs(applyDensity(knobsWith({ size: 'medium', space: 'medium', density: 'compact' })));
    expect(comfortable.knobProps.sizeToken).toBe('$4');
    expect(compact.knobProps.sizeToken).toBe('$4');
    expect(compact.knobProps.control.height).toBe(comfortable.knobProps.control.height);
    expect(comfortable.knobProps.gap).toEqual({ gap: '$4' });
    expect(compact.knobProps.gap).toEqual({ gap: '$2' });
  });

  it('pairs label type to size — never the control-height sizeToken', () => {
    expect(resolveKnobs(knobsWith({ size: 'small' })).knobProps.label.fontSize).toBe('$2');
    expect(resolveKnobs(knobsWith({ size: 'medium' })).knobProps.label.fontSize).toBe('$3');
    expect(resolveKnobs(knobsWith({ size: 'large' })).knobProps.label.fontSize).toBe('$4');
    expect(resolveKnobs(defaultKnobs).knobProps.label.fontSize).not.toBe(
      resolveKnobs(defaultKnobs).knobProps.sizeToken,
    );
  });

  it('nestedControl paints below the 44px floor and restores press with hitSlop', () => {
    const medium = resolveKnobs(knobsWith({ size: 'medium' })).knobProps.nestedControl;
    expect(medium.px).toBe(32);
    expect(medium.width).toBe(32);
    expect(medium.maxWidth).toBe(32);
    expect(medium.hitSlop).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });

    const compact = resolveKnobs(applyDensity(knobsWith({ size: 'medium', density: 'compact' }))).knobProps
      .nestedControl;
    // Compact steps space only — nestedControl follows size, so
    // medium+compact stays on the medium nested box.
    expect(compact.px).toBe(32);
    expect(compact.hitSlop).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });
  });

  it('compact density preserves house-decision knobs', () => {
    const knobs = knobsWith({
      density: 'compact',
      fieldLabelPlacement: 'side',
      requiredMarking: 'asterisk',
      tableZebra: 'on',
      bulkBarPlacement: 'bottom',
      selectAllScope: 'filtered',
      timestampStyle: 'relative',
      disabledStyle: 'dimWhole',
      formAutofocus: 'on',
    });
    const applied = applyDensity(knobs);
    expect(applied).toMatchObject({
      density: 'compact',
      fieldLabelPlacement: 'side',
      requiredMarking: 'asterisk',
      tableZebra: 'on',
      bulkBarPlacement: 'bottom',
      selectAllScope: 'filtered',
      timestampStyle: 'relative',
      disabledStyle: 'dimWhole',
      formAutofocus: 'on',
    });
  });
});

// ── House decisions (design-guidelines.md) ────────────────────

describe('house decision knobs', () => {
  it('defaultKnobs use recommended house defaults', () => {
    expect(defaultKnobs.fieldLabelPlacement).toBe(FieldLabelPlacement.Top);
    expect(defaultKnobs.requiredMarking).toBe(RequiredMarking.Minority);
    expect(defaultKnobs.tableZebra).toBe(TableZebra.Off);
    expect(defaultKnobs.bulkBarPlacement).toBe(BulkBarPlacement.Top);
    expect(defaultKnobs.selectAllScope).toBe(SelectAllScope.Page);
    expect(defaultKnobs.timestampStyle).toBe(TimestampStyle.Absolute);
    expect(defaultKnobs.disabledStyle).toBe(DisabledStyle.KeepLabel);
    expect(defaultKnobs.formAutofocus).toBe(FormAutofocus.Off);
  });

  it('resolveKnobs exposes house knobs on knobProps (pass-through)', () => {
    const { knobProps } = resolveKnobs(defaultKnobs);
    expect(knobProps.fieldLabelPlacement).toBe('top');
    expect(knobProps.requiredMarking).toBe('minority');
    expect(knobProps.tableZebra).toBe('off');
    expect(knobProps.bulkBarPlacement).toBe('top');
    expect(knobProps.selectAllScope).toBe('page');
    expect(knobProps.timestampStyle).toBe('absolute');
    expect(knobProps.disabledStyle).toBe('keepLabel');
    expect(knobProps.formAutofocus).toBe('off');
  });

  it('resolveKnobs reflects house knob overrides', () => {
    const { knobProps } = resolveKnobs(
      knobsWith({
        fieldLabelPlacement: 'floating',
        requiredMarking: 'optional',
        tableZebra: 'on',
        bulkBarPlacement: 'bottom',
        selectAllScope: 'filtered',
        timestampStyle: 'relative',
        disabledStyle: 'dimWhole',
        formAutofocus: 'on',
      }),
    );
    expect(knobProps.fieldLabelPlacement).toBe('floating');
    expect(knobProps.requiredMarking).toBe('optional');
    expect(knobProps.tableZebra).toBe('on');
    expect(knobProps.bulkBarPlacement).toBe('bottom');
    expect(knobProps.selectAllScope).toBe('filtered');
    expect(knobProps.timestampStyle).toBe('relative');
    expect(knobProps.disabledStyle).toBe('dimWhole');
    expect(knobProps.formAutofocus).toBe('on');
  });

  it('house knobs do not alter structural token resolution', () => {
    const baseline = resolveKnobs(defaultKnobs);
    const housey = resolveKnobs(
      knobsWith({
        fieldLabelPlacement: 'side',
        tableZebra: 'on',
        formAutofocus: 'on',
      }),
    );
    expect(housey.knobProps.sizeToken).toBe(baseline.knobProps.sizeToken);
    expect(housey.knobProps.gap).toEqual(baseline.knobProps.gap);
    expect(housey.knobProps.borderRadius).toEqual(baseline.knobProps.borderRadius);
    expect(housey.knobProps.density).toBe(baseline.knobProps.density);
  });
});

// ── Disabled treatment recipe (disabled stays visible) ────────

describe('disabledState recipe', () => {
  it('keepLabel (default) resolves a VISIBLE chrome treatment — not a no-op', () => {
    const { disabledState } = resolveKnobs(defaultKnobs);
    expect(disabledState.style).toBe('keepLabel');
    // Text-bearing chrome: fill/border wash to muted ramp steps, no opacity
    // (inner text keeps its own alpha so it can hold >= AA).
    expect(disabledState.surfaceKnobProps).toEqual({
      backgroundColor: '$color3',
      borderColor: '$color6',
      cursor: 'not-allowed',
    });
    expect(disabledState.surfaceKnobProps).not.toHaveProperty('opacity');
    // Selected-while-disabled tier: one wash step stronger than the plain
    // wash so the chosen segment stays visibly chosen (Axiom 6).
    expect(disabledState.selectedSurfaceKnobProps).toEqual({
      backgroundColor: '$color5',
      borderColor: '$color8',
      cursor: 'not-allowed',
    });
    // Text-free chrome: opacity dim.
    expect(disabledState.chromeKnobProps).toEqual({ opacity: 0.5, cursor: 'not-allowed' });
    // Inner text re-anchors to the documented lowest AA step ($color11).
    expect(disabledState.textKnobProps).toEqual({ color: '$color11' });
    // keepLabel never dims the assembly (label/helper stay fully readable).
    expect(disabledState.assemblyKnobProps).toEqual({});
  });

  it('dimWhole dims the assembly once — control fragments carry only the affordance', () => {
    const { disabledState } = resolveKnobs(knobsWith({ disabledStyle: 'dimWhole' }));
    expect(disabledState.style).toBe('dimWhole');
    expect(disabledState.assemblyKnobProps).toEqual({ opacity: 0.5 });
    // No chrome-level opacity: the assembly owner applies the single dim.
    expect(disabledState.surfaceKnobProps).toEqual({ cursor: 'not-allowed' });
    expect(disabledState.chromeKnobProps).toEqual({ cursor: 'not-allowed' });
    expect(disabledState.textKnobProps).toEqual({});
    // Exception: the selected tier still washes — consumers drop the live
    // active fill when disabled, so the assembly dim alone cannot show
    // which option is chosen.
    expect(disabledState.selectedSurfaceKnobProps).toEqual({
      backgroundColor: '$color5',
      borderColor: '$color8',
      cursor: 'not-allowed',
    });
  });

  it('both values expose complete fragments for every anatomy slot', () => {
    for (const disabledStyle of ['keepLabel', 'dimWhole'] as const) {
      const { disabledState } = resolveKnobs(knobsWith({ disabledStyle }));
      expect(disabledState).toHaveProperty('surfaceKnobProps');
      expect(disabledState).toHaveProperty('selectedSurfaceKnobProps');
      expect(disabledState).toHaveProperty('chromeKnobProps');
      expect(disabledState).toHaveProperty('textKnobProps');
      expect(disabledState).toHaveProperty('assemblyKnobProps');
      // The not-allowed affordance rides the control chrome under both values.
      expect(disabledState.surfaceKnobProps.cursor).toBe('not-allowed');
      expect(disabledState.selectedSurfaceKnobProps.cursor).toBe('not-allowed');
      expect(disabledState.chromeKnobProps.cursor).toBe('not-allowed');
      // Selected tier is visibly distinct from the plain wash in both models.
      expect(disabledState.selectedSurfaceKnobProps.backgroundColor).not.toBe(
        disabledState.surfaceKnobProps.backgroundColor,
      );
    }
  });

  it('disabled tiers are theme-relative ramp steps (no hex, works under intents)', () => {
    const { disabledState } = resolveKnobs(defaultKnobs);
    for (const value of [
      disabledState.surfaceKnobProps.backgroundColor,
      disabledState.surfaceKnobProps.borderColor,
      disabledState.selectedSurfaceKnobProps.backgroundColor,
      disabledState.selectedSurfaceKnobProps.borderColor,
      disabledState.textKnobProps.color,
    ]) {
      expect(value).toMatch(/^\$color\d+$/);
    }
  });
});

describe('touch height floor via resolveKnobs', () => {
  it('paints control.height >= 44 when isTouchable', async () => {
    vi.resetModules();
    vi.doMock('@repo/platform', () => ({
      isWeb: true,
      isTouchable: true,
      isWebTouchable: true,
    }));
    const { resolveKnobs: resolveTouch } = await import('./resolveKnobs');
    try {
      const small = resolveTouch(knobsWith({ size: 'small' }));
      const medium = resolveTouch(knobsWith({ size: 'medium' }));
      expect(small.knobProps.control.height).toBeGreaterThanOrEqual(44);
      expect(medium.knobProps.control.height).toBeGreaterThanOrEqual(44);
      expect(medium.knobProps.control.height).toBeGreaterThan(small.knobProps.control.height);
    } finally {
      vi.doUnmock('@repo/platform');
      vi.resetModules();
    }
  });
});

describe('containerCapProps provenance', () => {
  it('names the knob stop a borderRadiusMap token came from', () => {
    expect(containerCapProps('PageSection', '$12', 'small')).toEqual({
      'data-constraint-container': 'PageSection',
      'data-radius-knob': 'full',
      'data-space-knob': 'small',
    });
  });

  it('makes no claim for a radius that did not come from the knob', () => {
    expect(containerCapProps('TextArea', 13, 'small')).toBeUndefined();
    expect(containerCapProps('TextArea', '$5', 'small')).toBeUndefined();
    expect(containerCapProps('TextArea', '$12', 'roomy')).toBeUndefined();
  });
});

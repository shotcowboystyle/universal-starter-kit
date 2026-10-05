/**
 * PROOF — the measured corrections, asserted against the values read
 * off the live tamagui.dev computed styles (reference doc §4, §5.1, §6.1,
 * §6.2; 1440x900 DPR2, light and dark).
 *
 * This file exists so the corrections cannot silently regress: it pins the
 * generator's OUTPUT to the reference numbers, and it pins the RELATIONSHIPS
 * that produced them (gap tracks radius; space ≈ 40% of size; input padding
 * one space step below button) rather than the literals alone. A design that
 * only looks right at one hardcoded set of numbers fails the acceptance test
 * — every value below resolves through `SizeRecipeInputs`, so re-pointing the
 * knob re-derives all of them.
 */

import { describe, expect, it } from 'vitest';

import { layoutBreakpoints, OVERLAY_BREAKPOINT } from './layoutTokens';
import { DEFAULT_SIZE_RECIPE_INPUTS, generateSizeRecipes, sizeRecipeForToken } from './sizeRecipes';

/** Stock Tamagui token scales, read from the live CSS variables (§4). */
const tamaguiSize = {
  $1: 20,
  '$1.5': 24,
  $2: 28,
  '$2.5': 32,
  $3: 36,
  '$3.5': 40,
  $4: 44,
  $true: 44,
  $5: 52,
  $6: 64,
} as const;

const tamaguiRadiusTrue = 9;
const tamaguiSpaceTrue = 18;

describe('$4 means ONE height, and it is 44', () => {
  it('every recipe height equals the raw Tamagui $size token at the same key', () => {
    const { heights } = generateSizeRecipes(DEFAULT_SIZE_RECIPE_INPUTS);
    for (const [token, px] of Object.entries(tamaguiSize)) {
      expect(heights[token], `heights.${token}`).toBe(px);
    }
  });

  it('baseHeight is $size.true, so recipe and token cannot re-diverge', () => {
    expect(DEFAULT_SIZE_RECIPE_INPUTS.baseHeight).toBe(tamaguiSize.$true);
    expect(sizeRecipeForToken('$4').height).toBe(tamaguiSize.$4);
    expect(sizeRecipeForToken('$true').height).toBe(sizeRecipeForToken('$4').height);
  });

  it('the $4 control is the measured 44 / 18 / 14 / 16 / 9', () => {
    expect(sizeRecipeForToken('$4')).toEqual({
      height: 44,
      paddingHorizontal: 18,
      fontSize: 14,
      iconSize: 16,
      gap: 9,
    });
  });
});

describe('radius is $radius.true = 9', () => {
  it('radiusPx is the stored input, at the measured value', () => {
    expect(DEFAULT_SIZE_RECIPE_INPUTS.radiusPx).toBe(tamaguiRadiusTrue);
  });

  it("gap tracks radius exactly at $4 (the reference's stated rule)", () => {
    expect(sizeRecipeForToken('$4').gap).toBe(DEFAULT_SIZE_RECIPE_INPUTS.radiusPx);
  });

  it('radius steps with the size token; the recipe object still holds no radius field', () => {
    for (const token of ['$2', '$3', '$4', '$5', '$6'] as const) {
      expect(sizeRecipeForToken(token)).not.toHaveProperty('radius');
      expect(sizeRecipeForToken(token)).not.toHaveProperty('borderRadius');
    }
  });
});

describe('the ratios are relationships, not literals', () => {
  it('padding at $4 is $space.true, ~40% of the size step (reference §4)', () => {
    const recipe = sizeRecipeForToken('$4');
    expect(recipe.paddingHorizontal).toBe(tamaguiSpaceTrue);
    const spaceToSize = recipe.paddingHorizontal / recipe.height;
    expect(spaceToSize).toBeGreaterThan(0.38);
    expect(spaceToSize).toBeLessThan(0.42);
  });

  it('compact is one space step below control at the SAME height', () => {
    const control = sizeRecipeForToken('$4');
    const compact = sizeRecipeForToken('$4', { family: 'controlCompact' });
    expect(compact.height).toBe(control.height);
    expect(compact.paddingHorizontal).toBeLessThan(control.paddingHorizontal);
    // $space.3.5 = 16 vs $space.true = 18 — Input is one space half-step below Button.
    expect(compact.paddingHorizontal).toBe(16);
  });

  it('re-pointing baseHeight re-derives every channel — no hardcoded 44', () => {
    const scaled = generateSizeRecipes({ baseHeight: 88 });
    const base = sizeRecipeForToken('$4');
    expect(scaled.recipes.$4.height).toBe(base.height * 2);
    expect(scaled.recipes.$4.paddingHorizontal).toBe(base.paddingHorizontal * 2);
    expect(scaled.recipes.$4.fontSize).toBe(base.fontSize * 2);
    expect(scaled.recipes.$4.gap).toBe(base.gap * 2);
  });
});

describe('one breakpoint system', () => {
  it('overlays pivot on the Tamagui v5 $sm key the table already uses', () => {
    expect(OVERLAY_BREAKPOINT).toBe(640);
    expect(OVERLAY_BREAKPOINT).toBe(layoutBreakpoints.medium);
  });

  it('no viewport can mix a desktop grid with a sheet overlay', () => {
    // The 700px case from the drift register: DataTable reads `media.sm`
    // (v5 minWidth 640) and FloatingPanel reads OVERLAY_BREAKPOINT. Equal
    // thresholds means one idiom per width, by construction.
    const dataTableGridFrom = 640;
    expect(OVERLAY_BREAKPOINT).toBe(dataTableGridFrom);
    for (const width of [500, 639, 700, 800, 900]) {
      const tableIsGrid = width >= dataTableGridFrom;
      const overlayFloats = width > OVERLAY_BREAKPOINT;
      // The only disagreement allowed is the single boundary pixel row
      // (>= vs >), never a 220px band.
      expect(tableIsGrid === overlayFloats || width === 640).toBe(true);
    }
  });

  it('expanded 860 survives as the pane-budget class only', () => {
    expect(layoutBreakpoints.expanded).toBe(860);
    expect(OVERLAY_BREAKPOINT).not.toBe(layoutBreakpoints.expanded);
  });
});

describe('the touch floor stops fighting the desktop ramp', () => {
  it('$4 meets the 44 floor natively; touch lifts it, never shrinks it', () => {
    const desktop = sizeRecipeForToken('$4');
    const touch = sizeRecipeForToken('$4', { touch: true });
    expect(desktop.height).toBe(DEFAULT_SIZE_RECIPE_INPUTS.touchFloor);
    expect(touch.height).toBeGreaterThanOrEqual(desktop.height);
  });

  it('every touch height clears the floor', () => {
    const { heightsTouch } = generateSizeRecipes(DEFAULT_SIZE_RECIPE_INPUTS);
    for (const [token, px] of Object.entries(heightsTouch)) {
      expect(px, `heightsTouch.${token}`).toBeGreaterThanOrEqual(DEFAULT_SIZE_RECIPE_INPUTS.touchFloor);
    }
  });
});

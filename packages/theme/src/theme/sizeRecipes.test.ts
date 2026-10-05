import { afterEach, describe, expect, it } from 'vitest';

import { defaultKnobs } from './knobs';
import type { Knobs } from './knobs';
import { resolveKnobs } from './resolveKnobs';
import {
  DEFAULT_SIZE_RECIPE_INPUTS,
  SIZE_RECIPE_COMPACT_RATIOS,
  SIZE_RECIPE_HEIGHTS,
  SIZE_RECIPE_HEIGHTS_TOUCH,
  SIZE_RECIPE_RADII,
  SIZE_RECIPE_RATIOS,
  applyTouchFloor,
  defaultRecipeInputs,
  generateSizeRecipeTables,
  generateSizeRecipes,
  getSizeRecipeFamily,
  recipeFamilies,
  setSizeRecipeInputs,
  sizeRecipeBoxVariants,
  sizeRecipeEscape,
  sizeRecipeForToken,
  sizeRecipeFromHeight,
  sizeRecipeIconVariants,
  sizeRecipes,
  sizeRecipeTypeVariants,
  textFieldInset,
  type SizeRecipe,
} from './sizeRecipes';

function knobsWith(overrides: Partial<Knobs>): Knobs {
  return { ...defaultKnobs, ...overrides };
}

const RECIPE_KEYS = ['$1', '$1.5', '$2', '$2.5', '$3', '$3.5', '$4', '$true', '$5', '$6'] as const;

function expectNoRadius(value: object) {
  expect(value).not.toHaveProperty('radius');
  expect(value).not.toHaveProperty('borderRadius');
}

describe('size recipes', () => {
  it('medium / $4 matches the measured tamagui.dev 44/18/14/16/9 reference', () => {
    const recipe = sizeRecipes.$4;
    expect(recipe).toEqual({
      height: 44,
      paddingHorizontal: 18,
      fontSize: 14,
      iconSize: 16,
      gap: 9,
    });
    expect(sizeRecipeFromHeight(44)).toEqual(recipe);
    expect(sizeRecipeForToken('$4')).toEqual(recipe);
    expect(SIZE_RECIPE_HEIGHTS.$4).toBe(44);
    expect(SIZE_RECIPE_RATIOS).toEqual({
      padX: 18 / 44,
      font: 14 / 44,
      icon: 16 / 44,
      gap: 9 / 44,
    });
  });

  it('$true equals $4', () => {
    expect(sizeRecipes.$true).toEqual(sizeRecipes.$4);
    expect(SIZE_RECIPE_HEIGHTS.$true).toBe(SIZE_RECIPE_HEIGHTS.$4);
    expect(sizeRecipeForToken('$true')).toEqual(sizeRecipeForToken('$4'));
  });

  it('radius is not on the recipe or any variant object', () => {
    expectNoRadius(sizeRecipes.$4);
    expectNoRadius(sizeRecipeFromHeight(44));
    expectNoRadius(sizeRecipeForToken('$4'));
    for (const token of RECIPE_KEYS) {
      expectNoRadius(sizeRecipes[token]);
      expectNoRadius(sizeRecipeBoxVariants[token]);
      expectNoRadius(sizeRecipeTypeVariants[token]);
      expectNoRadius(sizeRecipeIconVariants[token]);
    }
  });

  it('static variants match the generated table for every token', () => {
    for (const token of RECIPE_KEYS) {
      const recipe = sizeRecipes[token];
      expect(sizeRecipeBoxVariants[token]).toEqual({
        height: recipe.height,
        paddingHorizontal: recipe.paddingHorizontal,
        gap: recipe.gap,
      });
      expect(sizeRecipeTypeVariants[token]).toEqual({ fontSize: recipe.fontSize });
      expect(sizeRecipeIconVariants[token]).toEqual({
        width: recipe.iconSize,
        height: recipe.iconSize,
      });
    }
    expect(sizeRecipeFromHeight(44)).toEqual(sizeRecipes.$4);
  });

  it('sizeRecipeForToken falls back to $4', () => {
    expect(sizeRecipeForToken('nope')).toEqual(sizeRecipes.$4);
    expect(sizeRecipeForToken('')).toEqual(sizeRecipes.$4);
  });

  it('small vs large: height/padX/font/icon/gap all change; borderRadius stays identical', () => {
    const small = resolveKnobs(knobsWith({ size: 'small' }));
    const large = resolveKnobs(knobsWith({ size: 'large' }));
    const smallRecipe = sizeRecipeForToken(small.knobProps.sizeToken);
    const largeRecipe = sizeRecipeForToken(large.knobProps.sizeToken);

    expect(small.knobProps.sizeToken).toBe('$3');
    expect(large.knobProps.sizeToken).toBe('$5');
    expect(smallRecipe.height).not.toBe(largeRecipe.height);
    expect(smallRecipe.paddingHorizontal).not.toBe(largeRecipe.paddingHorizontal);
    expect(smallRecipe.fontSize).not.toBe(largeRecipe.fontSize);
    expect(smallRecipe.iconSize).not.toBe(largeRecipe.iconSize);
    expect(smallRecipe.gap).not.toBe(largeRecipe.gap);

    expect(small.knobProps.control).toEqual({
      height: smallRecipe.height,
      paddingHorizontal: smallRecipe.paddingHorizontal,
      gap: smallRecipe.gap,
    });
    expect(large.knobProps.control).toEqual({
      height: largeRecipe.height,
      paddingHorizontal: largeRecipe.paddingHorizontal,
      gap: largeRecipe.gap,
    });
    expect(small.knobProps.controlType).toEqual({ fontSize: smallRecipe.fontSize });
    expect(large.knobProps.controlType).toEqual({ fontSize: largeRecipe.fontSize });
    expect(small.knobProps.controlIcon).toEqual({
      width: smallRecipe.iconSize,
      height: smallRecipe.iconSize,
    });
    expect(large.knobProps.controlIcon).toEqual({
      width: largeRecipe.iconSize,
      height: largeRecipe.iconSize,
    });

    expect(small.knobProps.borderRadius).toEqual(large.knobProps.borderRadius);
  });

  it('layout gap still follows the space knob independently of size (T2.1a)', () => {
    const { knobProps } = resolveKnobs(knobsWith({ space: 'large', size: 'medium' }));
    expect(knobProps.sizeToken).toBe('$4');
    expect(knobProps.gap.gap).toBe('$5');
    expect(knobProps.control.gap).toBe(sizeRecipes.$4.gap);
  });
  it('touch heights floor at 44 and still differentiate size steps', () => {
    const desktop = sizeRecipeForToken('$4');
    expect(desktop).toEqual(sizeRecipes.$4);
    expect(applyTouchFloor(desktop, false).height).toBe(44);
    expect(applyTouchFloor(desktop, true)).toEqual(sizeRecipeFromHeight(48));
    expect(sizeRecipeForToken('$4', { touch: true })).toEqual(sizeRecipeFromHeight(48));
    expect(sizeRecipeForToken('$3', { touch: true }).height).toBe(44);
    expect(sizeRecipeForToken('$5', { touch: true }).height).toBe(56);
    expect(sizeRecipeForToken('$6', { touch: true }).height).toBe(68);
    expect(sizeRecipeBoxVariants.$4.height).toBe(44);
    expectNoRadius(applyTouchFloor(desktop, true));
  });
});

describe('SizeRecipe shape', () => {
  it('has no radius field on the type-level contract', () => {
    const recipe: SizeRecipe = sizeRecipes.$4;
    const keys = Object.keys(recipe).sort();
    expect(keys).toEqual(['fontSize', 'gap', 'height', 'iconSize', 'paddingHorizontal']);
  });
});

describe('generateSizeRecipes', () => {
  afterEach(() => {
    setSizeRecipeInputs();
  });

  it('DEFAULT $4 is the measured 44/18/14/16/9 with no radius', () => {
    const generated = generateSizeRecipes(DEFAULT_SIZE_RECIPE_INPUTS);
    expect(generated.recipes.$4).toEqual({
      height: 44,
      paddingHorizontal: 18,
      fontSize: 14,
      iconSize: 16,
      gap: 9,
    });
    expectNoRadius(generated.recipes.$4);
    expectNoRadius(generated.boxVariants.$4);
    expect(generated.inputs.radiusPx).toBe(9);
    expect(generated.heights).toEqual({
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
    });
    expect(generated.heightsTouch).toEqual({
      $1: 44,
      '$1.5': 44,
      $2: 44,
      '$2.5': 44,
      $3: 44,
      '$3.5': 44,
      $4: 48,
      $true: 48,
      $5: 56,
      $6: 68,
    });
    expect(generateSizeRecipeTables(defaultRecipeInputs).touchHeights).toEqual(generated.heightsTouch);
    expect(SIZE_RECIPE_HEIGHTS_TOUCH.$4).toBe(48);
  });

  it('baseHeight: 40 without tokenHeights regenerates $4 and keeps $5 distinct', () => {
    const generated = generateSizeRecipes({ baseHeight: 40 });
    expect(generated.inputs.tokenHeights).toBeUndefined();
    expect(generated.heights.$4).toBe(40);
    expect(generated.recipes.$4).toEqual({
      height: 40,
      paddingHorizontal: Math.round(40 * (18 / 44)),
      fontSize: Math.round(40 * (14 / 44)),
      iconSize: Math.round(40 * (16 / 44)),
      gap: Math.round(40 * (9 / 44)),
    });
    expect(generated.heights.$5).not.toBe(generated.heights.$4);
    expectNoRadius(generated.recipes.$4);
  });

  it('controlCompact padX is tighter than control at the same $4 height', () => {
    const generated = generateSizeRecipes(DEFAULT_SIZE_RECIPE_INPUTS);
    expect(generated.families.control.recipes.$4.height).toBe(44);
    expect(generated.families.controlCompact.recipes.$4.height).toBe(44);
    expect(generated.families.control.recipes.$4.paddingHorizontal).toBe(18);
    expect(generated.families.controlCompact.recipes.$4.paddingHorizontal).toBe(16);
    expect(generated.families.controlCompact.recipes.$4.paddingHorizontal).toBeLessThan(
      generated.families.control.recipes.$4.paddingHorizontal,
    );
  });

  it('radiusPx stays on inputs, never on recipes or variants', () => {
    const generated = generateSizeRecipes({ radiusPx: 10 });
    expect(generated.inputs.radiusPx).toBe(10);
    expectNoRadius(generated.recipes.$4);
    expectNoRadius(generated.recipesTouch.$4);
    expectNoRadius(generated.boxVariants.$4);
    expectNoRadius(generated.families.controlCompact.recipes.$4);
  });

  it('setSizeRecipeInputs({ baseHeight }) regenerates live tables from stepRatio', () => {
    setSizeRecipeInputs({ baseHeight: 36 });
    expect(SIZE_RECIPE_HEIGHTS.$4).toBe(36);
    expect(sizeRecipes.$4.height).toBe(36);
    expect(sizeRecipeForToken('$4').height).toBe(36);
    expect(sizeRecipeBoxVariants.$4.height).toBe(36);
    expect(recipeFamilies.control.heightVariants.$4.height).toBe(36);
  });

  it('aliases are the generated control family', () => {
    expect(sizeRecipeBoxVariants).toBe(recipeFamilies.control.boxVariants);
    expect(sizeRecipes).toBe(recipeFamilies.control.recipes);
    expect(sizeRecipeTypeVariants).toBe(recipeFamilies.control.typeVariants);
    expect(sizeRecipeIconVariants).toBe(recipeFamilies.control.iconVariants);
    expect(SIZE_RECIPE_HEIGHTS).toBe(recipeFamilies.control.heights);
    expect(SIZE_RECIPE_RADII).toBe(recipeFamilies.control.radii);
  });

  it('sizeRecipeEscape is identity', () => {
    expect(sizeRecipeEscape(32)).toBe(32);
    expect(sizeRecipeEscape('keep')).toBe('keep');
  });

  it('textFieldInset is min(padX, floor((height-fontSize)/2)) — $4 → 15', () => {
    expect(textFieldInset(sizeRecipes.$4)).toBe(15);
    expect(textFieldInset({ height: 44, paddingHorizontal: 18, fontSize: 14 })).toBe(15);
    expect(textFieldInset({ height: 32, paddingHorizontal: 12, fontSize: 14 })).toBe(9);
    expect(textFieldInset({ height: 48, paddingHorizontal: 8, fontSize: 14 })).toBe(8);
    expect(textFieldInset(sizeRecipes.$4)).toBeLessThanOrEqual(
      Math.floor((sizeRecipes.$4.height - sizeRecipes.$4.fontSize) / 2),
    );
  });
});

describe('size recipe families', () => {
  it('control family matches the sizeRecipeBoxVariants default', () => {
    const control = generateSizeRecipes().families.control;
    expect(getSizeRecipeFamily('control')).toEqual(control);
    for (const token of RECIPE_KEYS) {
      expect(control.boxVariants[token]).toEqual(sizeRecipeBoxVariants[token]);
      expect(control.heightVariants[token]).toEqual({ height: SIZE_RECIPE_HEIGHTS[token] });
    }
    expect(control.boxVariants.$4).toEqual({
      height: 44,
      paddingHorizontal: 18,
      gap: 9,
    });
  });

  it('controlCompact keeps height and tightens padX', () => {
    const compact = getSizeRecipeFamily('controlCompact');
    const control = getSizeRecipeFamily('control');
    expect(compact.ratios).toEqual(SIZE_RECIPE_COMPACT_RATIOS);
    expect(compact.boxVariants.$4.height).toBe(control.boxVariants.$4.height);
    expect(compact.boxVariants.$4.paddingHorizontal).toBeLessThan(control.boxVariants.$4.paddingHorizontal);
    expect(compact.boxVariants.$4.paddingHorizontal).toBe(16);
    expect(compact.boxVariants.$4.gap).toBe(9);
    expect(sizeRecipeForToken('$4', { family: 'controlCompact' })).toEqual(compact.recipes.$4);
  });
});

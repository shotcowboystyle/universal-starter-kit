/**
 * The size ladder is the measured Tamagui v5 table
 * (a real TABLE, no escape). padX / label / icon / radius at $2/$3/$4/$6
 * come from tamagui-rendered-reference.md §6.1; Input padX is §6.2
 * (one space half-step below the button). Default gap equals size-table
 * radius; borderRadius shape overrides preserve that internal spacing.
 */

import { describe, expect, it } from 'vitest';

import {
  SIZE_RECIPE_RADII,
  SIZE_RECIPE_RADIUS_STOPS,
  TAMAGUI_CONTROL_SIZE_TABLE,
  TAMAGUI_INPUT_PADX,
  applyRadiusStop,
  generateSizeRecipes,
  recipeFamilies,
  resolveControlRadius,
  sizeRecipeForToken,
  sizeRecipes,
  type SizeRecipeRadiusStop,
} from './sizeRecipes';

const MEASURED = {
  $2: { paddingHorizontal: 7, fontSize: 12, iconSize: 12, radius: 5 },
  $3: { paddingHorizontal: 13, fontSize: 13, iconSize: 14, radius: 7 },
  $4: { paddingHorizontal: 18, fontSize: 14, iconSize: 16, radius: 9 },
  $6: { paddingHorizontal: 32, fontSize: 18, iconSize: 20, radius: 16 },
} as const;

describe('size ladder — measured table, not a ratio', () => {
  it('padX, label, icon and radius at $2/$3/$4/$6 match the Tamagui v5 reference', () => {
    for (const token of ['$2', '$3', '$4', '$6'] as const) {
      const recipe = sizeRecipeForToken(token);
      const row = MEASURED[token];
      expect(recipe.paddingHorizontal, `${token} padX`).toBe(row.paddingHorizontal);
      expect(recipe.fontSize, `${token} label`).toBe(row.fontSize);
      expect(recipe.iconSize, `${token} icon`).toBe(row.iconSize);
      expect(SIZE_RECIPE_RADII[token], `${token} radius`).toBe(row.radius);
      expect(TAMAGUI_CONTROL_SIZE_TABLE[token]).toEqual(row);
    }
  });

  it('does not ship the linear-ratio $2 defects (padX 11, label 9, flat radius 9)', () => {
    const two = sizeRecipeForToken('$2');
    expect(two.paddingHorizontal).not.toBe(11);
    expect(two.fontSize).not.toBe(9);
    expect(SIZE_RECIPE_RADII.$2).not.toBe(9);
    expect(SIZE_RECIPE_RADII.$2).not.toBe(SIZE_RECIPE_RADII.$6);
  });

  it('Button / Select trigger / ListItem $4 is 44 / padX 18 / radius 9; Input padX is 16', () => {
    const button = sizeRecipes.$4;
    expect(button.height).toBe(44);
    expect(button.paddingHorizontal).toBe(18);
    expect(SIZE_RECIPE_RADII.$4).toBe(9);
    expect(TAMAGUI_INPUT_PADX.$4).toBe(16);
    expect(recipeFamilies.controlCompact.recipes.$4.paddingHorizontal).toBe(16);
    expect(recipeFamilies.controlCompact.recipes.$4.height).toBe(44);
    expect(recipeFamilies.controlCompact.radii.$4).toBe(9);
  });
});

describe('default size-table gap and explicit recipe transformation', () => {
  it('holds at every size step', () => {
    const generated = generateSizeRecipes();
    for (const token of Object.keys(generated.recipes)) {
      expect(generated.recipes[token].gap, `control ${token}`).toBe(generated.radii[token]);
      expect(generated.families.controlCompact.recipes[token].gap, `compact ${token}`).toBe(
        generated.families.controlCompact.radii[token],
      );
    }
  });

  it('can explicitly retarget an authored recipe gap to a radius stop', () => {
    const stops = Object.keys(SIZE_RECIPE_RADIUS_STOPS) as SizeRecipeRadiusStop[];
    for (const token of ['$2', '$3', '$4', '$5', '$6'] as const) {
      const recipe = sizeRecipeForToken(token);
      for (const stop of stops) {
        const next = applyRadiusStop(recipe, stop);
        expect(next.gap, `${token} @ ${stop}`).toBe(SIZE_RECIPE_RADIUS_STOPS[stop]);
      }
    }
  });
});

describe('resolveControlRadius', () => {
  it('default medium follows the size table, not the 9px knob', () => {
    const two = resolveControlRadius(sizeRecipeForToken('$2'), 'medium');
    expect(two.radius).toBe(5);
    expect(two.gap).toBe(5);
    const six = resolveControlRadius(sizeRecipeForToken('$6'), 'medium');
    expect(six.radius).toBe(16);
    expect(six.gap).toBe(16);
  });

  it("corner shape preserves the size recipe's icon-label grouping", () => {
    for (const family of ['control', 'controlCompact'] as const) {
      for (const token of ['$2', '$3', '$4', '$6']) {
        const recipe = sizeRecipeForToken(token, { family });
        for (const stop of Object.keys(SIZE_RECIPE_RADIUS_STOPS) as SizeRecipeRadiusStop[]) {
          const resolved = resolveControlRadius(recipe, stop);
          expect(resolved.gap, `${family} ${token} ${stop}`).toBe(recipe.gap);
          expect(resolved.gap).toBeGreaterThan(0);
          expect(resolved.gap).toBeLessThanOrEqual(recipe.iconSize);
          expect(resolved.radius).toBe(stop === 'medium' ? recipe.gap : SIZE_RECIPE_RADIUS_STOPS[stop]);
        }
      }
    }
  });
});

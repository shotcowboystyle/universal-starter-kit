/**
 * Coordinated control-size recipes (SIZE-RECIPE, RECIPE-INPUTS).
 *
 * The default ladder is the measured Tamagui v5 table in recipeInputs
 * (padX / font / icon / radius per size token). Default gap equals the
 * size-table radius; corner shape overrides leave that spacing intact.
 * A linear ratio is only the `{ baseHeight }` fallback — not a
 * documented divergence.
 *
 * Tables are GENERATED from `defaultRecipeInputs` at module eval (Tamagui
 * 2.0.0-rc.41 flattens `styled(View, { variants: { size: tables } })` when
 * the second arg is an object literal and generate ran at module eval).
 * Do NOT pass a function as styled()'s second argument. Functional
 * `"...size": (val) =>` stays runtime unless JSX flattens a static size —
 * reserve it for non-enumerable values only. Do NOT put recipe tables on a
 * `createStyledContext` primitive (`neverFlatten`).
 *
 * Reference md ($4 / $true): height 44, padX 18, font 14, icon 16, radius 9,
 * gap 9 (the measured tamagui.dev $4 control).
 * `sizeToken` remains the recipe KEY (string "$4") so styled() variants
 * can switch; it is not a height scalar.
 *
 * Families: `control` reads `inputs.tokenTable`. `controlCompact` reads
 * `compactTokenTable` at the SAME heights (Input padX, tighter type).
 *
 * On touch, `applyTouchFloor` / `sizeRecipeForToken(token, { touch: true })`
 * lift painted height to ≥ 44. Static `sizeRecipe*Variants` stay on the
 * desktop table — runtime fragments carry the floor; consumers spread
 * `knobProps.control` after `size`.
 */

export {
  DEFAULT_SIZE_RECIPE_INPUTS,
  SIZE_RECIPE_RADIUS_STOPS,
  SIZE_RECIPE_TOKENS,
  SIZE_TOKEN_EXPONENTS,
  TAMAGUI_COMPACT_SIZE_TABLE,
  TAMAGUI_CONTROL_SIZE_TABLE,
  TAMAGUI_INPUT_PADX,
  TOUCH_HEIGHT_FLOOR,
  applyRadiusStop,
  SIZE_RECIPE_RADIUS_TOKEN_TO_STOP,
  cloneSizeRecipeInputs,
  resolveControlRadius,
  createRecipeFamilies,
  defaultRecipeInputs,
  defaultSizeFactors,
  generateSizeRecipeTables,
  generateSizeRecipes,
  mergeRecipeInputs,
  recipeFromTokenChannels,
  resolveSizeRecipeInputs,
} from './recipeInputs';
export type {
  GeneratedSizeRecipes,
  RecipeFamilies,
  RecipeFamilyName,
  RecipeInputs,
  SizeRecipe,
  SizeRecipeBoxVariant,
  SizeRecipeFamily,
  SizeRecipeFamilyName,
  SizeRecipeIconVariant,
  SizeRecipeInputs,
  SizeRecipeRadiusStop,
  SizeRecipeRatios,
  SizeRecipeTables,
  SizeRecipeToken,
  SizeRecipeTokenChannels,
  SizeRecipeTokenTable,
  SizeRecipeTypeVariant,
} from './recipeInputs';

import {
  cloneSizeRecipeInputs,
  defaultRecipeInputs,
  generateSizeRecipes,
  sizeRecipeFromHeight as recipeFromHeight,
  type GeneratedSizeRecipes,
  type RecipeFamilyName,
  type RecipeInputs,
  type SizeRecipe,
  type SizeRecipeFamily,
  type SizeRecipeToken,
} from './recipeInputs';

function replaceRecord(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(source, key)) {
      delete target[key];
    }
  }
  Object.assign(target, source);
}

function adoptFamily(target: SizeRecipeFamily, source: SizeRecipeFamily): void {
  Object.assign(target.ratios, source.ratios);
  target.inputs = { ...source.inputs, ratios: target.ratios };
  replaceRecord(target.heights, source.heights);
  replaceRecord(target.touchHeights, source.touchHeights);
  replaceRecord(target.recipes, source.recipes);
  replaceRecord(target.recipesTouch, source.recipesTouch);
  replaceRecord(target.boxVariants, source.boxVariants);
  replaceRecord(target.typeVariants, source.typeVariants);
  replaceRecord(target.iconVariants, source.iconVariants);
  replaceRecord(target.heightVariants, source.heightVariants);
  replaceRecord(target.radii, source.radii);
}

const initial = generateSizeRecipes(defaultRecipeInputs);
let current: GeneratedSizeRecipes = initial;

/**
 * Module-eval default families. `styled()` variants MUST spread these
 * objects (or `sizeRecipeBoxVariants`) — not a function — so rc.41 can flatten.
 */
export const recipeFamilies = initial.families;

/** Back-compat aliases of `recipeFamilies.control` (generated, not handwritten). */
export const sizeRecipes = recipeFamilies.control.recipes;
export const sizeRecipeBoxVariants = recipeFamilies.control.boxVariants;
export const sizeRecipeTypeVariants = recipeFamilies.control.typeVariants;
export const sizeRecipeIconVariants = recipeFamilies.control.iconVariants;
export const SIZE_RECIPE_HEIGHTS = recipeFamilies.control.heights;
export const SIZE_RECIPE_HEIGHTS_TOUCH = recipeFamilies.control.touchHeights;
export const SIZE_RECIPE_RADII = recipeFamilies.control.radii;
export const SIZE_RECIPE_RATIOS = recipeFamilies.control.ratios;
export const SIZE_RECIPE_COMPACT_RATIOS = recipeFamilies.controlCompact.ratios;

export const SIZE_RECIPE_FAMILY_NAMES = ['control', 'controlCompact'] as const;

/**
 * Live tile-size ladder — generated from `inputs.tile` over the
 * measured defaults, adopted in place on `setSizeRecipeInputs` like every
 * other live table. Never handwrite rungs; restyle through inputs.
 */
export const tileSizeLadder = initial.tiles;

export function getTileSizeLadder(): typeof tileSizeLadder {
  return tileSizeLadder;
}

function adoptGenerated(next: GeneratedSizeRecipes): GeneratedSizeRecipes {
  adoptFamily(recipeFamilies.control, next.families.control);
  adoptFamily(recipeFamilies.controlCompact, next.families.controlCompact);
  replaceRecord(tileSizeLadder as unknown as Record<string, unknown>, next.tiles as unknown as Record<string, unknown>);
  current = {
    ...next,
    tiles: tileSizeLadder,
    heights: SIZE_RECIPE_HEIGHTS,
    heightsTouch: SIZE_RECIPE_HEIGHTS_TOUCH,
    recipes: sizeRecipes,
    recipesTouch: recipeFamilies.control.recipesTouch,
    boxVariants: sizeRecipeBoxVariants,
    typeVariants: sizeRecipeTypeVariants,
    iconVariants: sizeRecipeIconVariants,
    radii: SIZE_RECIPE_RADII,
    families: recipeFamilies,
  };
  return current;
}

/** Merge `partial` over defaultRecipeInputs (not the previous override) and rewrite live tables. */
export function setSizeRecipeInputs(partial: Partial<RecipeInputs> = {}): GeneratedSizeRecipes {
  return adoptGenerated(generateSizeRecipes(partial));
}

export function getSizeRecipeInputs(): RecipeInputs {
  return cloneSizeRecipeInputs(current.inputs);
}

export function getGeneratedSizeRecipes(): GeneratedSizeRecipes {
  return current;
}

export function getSizeRecipeFamily(name: RecipeFamilyName = 'control'): SizeRecipeFamily {
  return recipeFamilies[name] ?? recipeFamilies.control;
}

export function sizeRecipeFromHeight(
  height: number,
  ratios: RecipeInputs['ratios'] = current.inputs.ratios,
): SizeRecipe {
  return recipeFromHeight(height, ratios);
}

function resolveFamily(family?: RecipeFamilyName | SizeRecipeFamily): SizeRecipeFamily {
  if (family && typeof family === 'object') {
    return family;
  }
  return recipeFamilies[family ?? 'control'] ?? recipeFamilies.control;
}

export function applyTouchFloor(
  recipe: SizeRecipe,
  touch: boolean,
  family?: RecipeFamilyName | SizeRecipeFamily,
): SizeRecipe {
  if (!touch) {
    return recipe;
  }
  const tables = resolveFamily(family);
  const token = (Object.keys(tables.heights) as SizeRecipeToken[]).find((key) => tables.heights[key] === recipe.height);
  if (token && tables.recipesTouch[token]) {
    return tables.recipesTouch[token];
  }
  return recipeFromHeight(Math.max(recipe.height, tables.inputs.touchFloor), tables.ratios);
}

export function sizeRecipeForToken(
  token: string,
  options?: { touch?: boolean; family?: RecipeFamilyName | SizeRecipeFamily },
): SizeRecipe {
  const tables = resolveFamily(options?.family);
  const table = options?.touch ? tables.recipesTouch : tables.recipes;
  if (Object.hasOwn(table, token)) {
    return table[token as SizeRecipeToken];
  }
  return table.$4;
}

/**
 * Identity helper for the SIZE-RECIPE ESCAPE lint
 * (`scripts/lint-conventions.mjs`). Wrap a numeric height / minHeight /
 * paddingHorizontal / fontSize that must stay a literal, and say why:
 *
 *   height={sizeRecipeEscape(20, "toolbar chrome match")}
 *
 * Or write the same reason in a `size-recipe-escape:` line comment on the
 * previous line or same statement. Pilot: Button/, InputParts/,
 * fields/Select/. Either way the file and the reason must be a row in
 * `docs/theme-propagation-spec.md` `## Size-recipe escapes`; an undeclared
 * escape fails `lint-conventions`.
 */
export function sizeRecipeEscape<T>(value: T, _reason?: string): T {
  return value;
}

/**
 * TEXT-INSET — optical vertical inset of a text field, never larger
 * than the recipe padX. Extra horizontal space is legal only when an icon
 * well occupies that side, not as empty-field padX.
 *
 *   min(paddingHorizontal, floor((height − fontSize) / 2))
 *
 * `$4` (44 / 18 / 14) → 15. Button ladders keep recipe.paddingHorizontal (18).
 */
export function textFieldInset(recipe: Pick<SizeRecipe, 'height' | 'paddingHorizontal' | 'fontSize'>): number {
  return Math.min(recipe.paddingHorizontal, Math.floor((recipe.height - recipe.fontSize) / 2));
}

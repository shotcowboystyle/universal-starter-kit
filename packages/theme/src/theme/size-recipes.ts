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

import {
  SIZE_RECIPE_TOKENS,
  cloneSizeRecipeInputs,
  defaultRecipeInputs,
  generateSizeRecipes,
  sizeRecipeFromHeight as recipeFromHeight,
} from './recipe-inputs';
import type {
  GeneratedSizeRecipes,
  SizeRecipe,
  SizeRecipeFamily,
  SizeRecipeFamilyName,
  SizeRecipeInputs,
  SizeRecipeToken,
} from './recipe-inputs';

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
} from './recipe-inputs';
export type {
  GeneratedSizeRecipes,
  RecipeFamilies,
  // oxlint-disable-next-line typescript/no-deprecated -- re-exported for back-compat consumers
  RecipeFamilyName,
  // oxlint-disable-next-line typescript/no-deprecated -- re-exported for back-compat consumers
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
} from './recipe-inputs';

const replaceRecord = <T extends object>(target: T, source: T): void => {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(source, key)) {
      Reflect.deleteProperty(target, key);
    }
  }
  Object.assign(target, source);
};

const adoptFamily = (target: SizeRecipeFamily, source: SizeRecipeFamily): void => {
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
};

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

export const getTileSizeLadder = (): typeof tileSizeLadder => tileSizeLadder;

const adoptGenerated = (next: GeneratedSizeRecipes): GeneratedSizeRecipes => {
  adoptFamily(recipeFamilies.control, next.families.control);
  adoptFamily(recipeFamilies.controlCompact, next.families.controlCompact);
  replaceRecord(tileSizeLadder, next.tiles);
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
};

/** Merge `partial` over defaultRecipeInputs (not the previous override) and rewrite live tables. */
export const setSizeRecipeInputs = (partial: Partial<SizeRecipeInputs> = {}): GeneratedSizeRecipes =>
  adoptGenerated(generateSizeRecipes(partial));

export const getSizeRecipeInputs = (): SizeRecipeInputs => cloneSizeRecipeInputs(current.inputs);

export const getGeneratedSizeRecipes = (): GeneratedSizeRecipes => current;

export const getSizeRecipeFamily = (name: SizeRecipeFamilyName = 'control'): SizeRecipeFamily =>
  recipeFamilies[name] ?? recipeFamilies.control;

export const sizeRecipeFromHeight = (
  height: number,
  ratios: SizeRecipeInputs['ratios'] = current.inputs.ratios,
): SizeRecipe => recipeFromHeight(height, ratios);

const resolveFamily = (family?: SizeRecipeFamilyName | SizeRecipeFamily): SizeRecipeFamily => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- public API accepts either a family name or a family object
  if (family !== undefined && typeof family === 'object') {
    return family;
  }
  return recipeFamilies[family ?? 'control'] ?? recipeFamilies.control;
};

export const applyTouchFloor = (
  recipe: SizeRecipe,
  touch: boolean,
  family?: SizeRecipeFamilyName | SizeRecipeFamily,
): SizeRecipe => {
  if (!touch) {
    return recipe;
  }
  const tables = resolveFamily(family);
  const token = SIZE_RECIPE_TOKENS.find((key) => tables.heights[key] === recipe.height);
  if (token !== undefined && Object.hasOwn(tables.recipesTouch, token)) {
    return tables.recipesTouch[token];
  }
  return recipeFromHeight(Math.max(recipe.height, tables.inputs.touchFloor), tables.ratios);
};

const hasKey = (table: Record<SizeRecipeToken, SizeRecipe>, key: string): key is SizeRecipeToken =>
  Object.hasOwn(table, key);

export const sizeRecipeForToken = (
  token: string,
  options?: { touch?: boolean; family?: SizeRecipeFamilyName | SizeRecipeFamily },
): SizeRecipe => {
  const tables = resolveFamily(options?.family);
  const table = options?.touch === true ? tables.recipesTouch : tables.recipes;
  if (hasKey(table, token)) {
    return table[token];
  }
  return table.$4;
};

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
export const sizeRecipeEscape = <T>(value: T, _reason?: string): T => value;

/**
 * TEXT-INSET — optical vertical inset of a text field, never larger
 * than the recipe padX. Extra horizontal space is legal only when an icon
 * well occupies that side, not as empty-field padX.
 *
 *   min(paddingHorizontal, floor((height − fontSize) / 2))
 *
 * `$4` (44 / 18 / 14) → 15. Button ladders keep recipe.paddingHorizontal (18).
 */
export const textFieldInset = (recipe: Pick<SizeRecipe, 'height' | 'paddingHorizontal' | 'fontSize'>): number =>
  Math.min(recipe.paddingHorizontal, Math.floor((recipe.height - recipe.fontSize) / 2));

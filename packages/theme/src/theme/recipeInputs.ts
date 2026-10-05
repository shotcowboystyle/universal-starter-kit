/**
 * Size-recipe INPUTS (RECIPE-INPUTS).
 *
 * Stored numbers are the source of truth. Derived projections (heights,
 * recipes, box/type/icon variants, touch heights, radii) are never
 * handwritten at a call site. The DEFAULT ladder is the measured Tamagui
 * v5 table (`tokenTable`): padX / font / icon / radius per size token,
 * gap == radius at every stop. A linear ratio is only the fallback when
 * a theme sets `{ baseHeight }` and drops the table — it is not the
 * default ladder and is not a signed-off divergence.
 *
 * Radius steps with the size token. The borderRadius knob overrides the
 * painted corners while internal gap stays on the size recipe. `radiusPx`
 * on inputs is the $4 / medium default (9).
 *
 * Tamagui `createThemes` / theme-builder still emits COLOR palettes only.
 * Do not stuff recipe keys into `getTheme()` / `themes`.
 */

import {
  cloneTileSizeInputs,
  generateTileSizeLadder,
  resolveTileSizeInputs,
  type TileSizeInputs,
  type TileSizeLadder,
} from './tileSizes';

export const SIZE_RECIPE_TOKENS = ['$1', '$1.5', '$2', '$2.5', '$3', '$3.5', '$4', '$true', '$5', '$6'] as const;

export type SizeRecipeToken = (typeof SIZE_RECIPE_TOKENS)[number];

export type SizeRecipeFamilyName = 'control' | 'controlCompact';
/** @deprecated Use `SizeRecipeFamilyName`. */
export type RecipeFamilyName = SizeRecipeFamilyName;

export interface SizeRecipeRatios {
  padX: number;
  font: number;
  icon: number;
  gap: number;
}

/** Per-token channels on the measured ladder. Gap is not stored — it equals `radius`. */
export interface SizeRecipeTokenChannels {
  paddingHorizontal: number;
  fontSize: number;
  iconSize: number;
  radius: number;
}

export type SizeRecipeTokenTable = Partial<Record<SizeRecipeToken, SizeRecipeTokenChannels>>;

/**
 * borderRadius knob stops (px). Mirrors the v5 radius tokens the knob
 * already resolves ($0/$2/$4/$6/$12 = 0/5/9/16/50). These shape overrides
 * do not retarget the control's internal gap.
 */
export const SIZE_RECIPE_RADIUS_STOPS = {
  none: 0,
  small: 5,
  medium: 9,
  large: 16,
  full: 50,
} as const;

export type SizeRecipeRadiusStop = keyof typeof SIZE_RECIPE_RADIUS_STOPS;

export interface SizeRecipeInputs {
  baseHeight: number;
  stepRatio: number;
  tokenSteps: Record<string, number>;
  /** Absolute desktop px. When omitted, heights come from baseHeight * stepRatio ** step (or sizeFactors). */
  tokenHeights?: Record<string, number>;
  /**
   * Optional per-token scale relative to `baseHeight`. Used only when
   * `tokenHeights` is omitted. Factors are `stepRatio ** exponent` otherwise.
   */
  sizeFactors?: Partial<Record<SizeRecipeToken, number>>;
  /**
   * Measured per-token channels (padX / font / icon / radius). When
   * present, enumerable recipes read this table and set gap = radius.
   * `{ baseHeight }` without an explicit tokenTable drops it so the
   * geometric fallback can run.
   */
  tokenTable?: SizeRecipeTokenTable;
  /** Same-height tighter family (Chip / `recipeFamily="controlCompact"`). */
  compactTokenTable?: SizeRecipeTokenTable;
  /**
   * Input padX (one space half-step below the button at the same token).
   * $4 = 16 vs the button's 18. Stored on inputs so the generator remains
   * the single writer; Input consumes this, not a second handwritten map.
   */
  inputPadX?: Partial<Record<SizeRecipeToken, number>>;
  ratios: SizeRecipeRatios;
  compactRatios: SizeRecipeRatios;
  radiusPx: number;
  touchFloor: number;
  /**
   * Tile-size ladder inputs. Merged over `defaultTileSizeInputs`;
   * the ladder table derives from these the way every other table does.
   */
  tile?: Partial<TileSizeInputs>;
}

/** @deprecated Use `SizeRecipeInputs`. */
export type RecipeInputs = SizeRecipeInputs;

export interface SizeRecipe {
  height: number;
  paddingHorizontal: number;
  fontSize: number;
  iconSize: number;
  gap: number;
}

export interface SizeRecipeBoxVariant {
  height: number;
  paddingHorizontal: number;
  gap: number;
}

export interface SizeRecipeTypeVariant {
  fontSize: number;
}
export interface SizeRecipeIconVariant {
  width: number;
  height: number;
}

export interface SizeRecipeTables {
  inputs: SizeRecipeInputs;
  ratios: SizeRecipeRatios;
  heights: Record<string, number>;
  touchHeights: Record<string, number>;
  recipes: Record<string, SizeRecipe>;
  recipesTouch: Record<string, SizeRecipe>;
  boxVariants: Record<string, SizeRecipeBoxVariant>;
  typeVariants: Record<string, SizeRecipeTypeVariant>;
  iconVariants: Record<string, SizeRecipeIconVariant>;
  heightVariants: Record<string, { height: number }>;
  /** Size-stepped radius (px). Gap on the matching recipe equals this value. */
  radii: Record<string, number>;
}

export type SizeRecipeFamily = SizeRecipeTables & { name: SizeRecipeFamilyName };

export type RecipeFamilies = Record<SizeRecipeFamilyName, SizeRecipeFamily>;

export interface GeneratedSizeRecipes {
  inputs: SizeRecipeInputs;
  heights: Record<string, number>;
  heightsTouch: Record<string, number>;
  recipes: Record<string, SizeRecipe>;
  recipesTouch: Record<string, SizeRecipe>;
  boxVariants: Record<string, SizeRecipeBoxVariant>;
  typeVariants: Record<string, SizeRecipeTypeVariant>;
  iconVariants: Record<string, SizeRecipeIconVariant>;
  radii: Record<string, number>;
  families: RecipeFamilies;
  /** Tile-size ladder — derived from `inputs.tile` over the measured defaults. */
  tiles: TileSizeLadder;
}

export const SIZE_TOKEN_EXPONENTS: Record<SizeRecipeToken, number> = {
  $1: -3,
  '$1.5': -2.5,
  $2: -2,
  '$2.5': -1.5,
  $3: -1,
  '$3.5': -0.5,
  $4: 0,
  $true: 0,
  $5: 1,
  $6: 2,
};

// Stock Tamagui `$size` px as measured from the live tamagui.dev CSS vars:
// $1:20 $1.5:24 $2:28 $2.5:32 $3:36 $3.5:40
// $4/$true:44 $5:52 $6:64. The recipe key "$4" and the raw Tamagui token
// `$size.4` resolve to the SAME height — the C1 split (recipe 32 vs token
// 44) is gone.
const DEFAULT_TOKEN_HEIGHTS: Record<string, number> = {
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
};

/** Lossless relative table: the stock Tamagui 20/24/28/32/36/40/44/52/64 ramp at baseHeight 44. */
export const defaultSizeFactors: Record<SizeRecipeToken, number> = {
  $1: 20 / 44,
  '$1.5': 24 / 44,
  $2: 28 / 44,
  '$2.5': 32 / 44,
  $3: 36 / 44,
  '$3.5': 40 / 44,
  $4: 1,
  $true: 1,
  $5: 52 / 44,
  $6: 64 / 44,
};

/**
 * Measured Tamagui v5 Button ladder (rendered reference §6.1) plus the
 * integer token-scale fills for stops the site did not photograph.
 *
 * padX = `$space` at the same key (2/4/7/10/13/16/18/24/32).
 * radius = `$radius` at the same key (3/5/7/9/10/16); half-steps sit
 * halfway on that scale (4/6/8) because v5 has no $1.5/$2.5/$3.5 radius.
 * font = Inter body at the same key (11/12/13/14/16/18); half-steps take
 * the next integer stop.
 * icon steps with size and keeps the existing $4 = 16 contract.
 * $2/$3/$4/$6 padX / font / radius are the photographed values (7/13/18/32,
 * 12/13/14/18, 5/7/9/16).
 */
export const TAMAGUI_CONTROL_SIZE_TABLE: Record<SizeRecipeToken, SizeRecipeTokenChannels> = {
  $1: { paddingHorizontal: 2, fontSize: 11, iconSize: 10, radius: 3 },
  '$1.5': { paddingHorizontal: 4, fontSize: 12, iconSize: 11, radius: 4 },
  $2: { paddingHorizontal: 7, fontSize: 12, iconSize: 12, radius: 5 },
  '$2.5': { paddingHorizontal: 10, fontSize: 13, iconSize: 14, radius: 6 },
  $3: { paddingHorizontal: 13, fontSize: 13, iconSize: 14, radius: 7 },
  '$3.5': { paddingHorizontal: 16, fontSize: 14, iconSize: 15, radius: 8 },
  $4: { paddingHorizontal: 18, fontSize: 14, iconSize: 16, radius: 9 },
  $true: { paddingHorizontal: 18, fontSize: 14, iconSize: 16, radius: 9 },
  $5: { paddingHorizontal: 24, fontSize: 16, iconSize: 18, radius: 10 },
  $6: { paddingHorizontal: 32, fontSize: 18, iconSize: 20, radius: 16 },
};

/**
 * Input padX — `getSpace(val, { shift: -1 })` on the v5 space scale
 * (rendered reference §6.2). $2/$3/$4 are the photographed 4/10/16;
 * $4 is 16 against the button's 18.
 */
export const TAMAGUI_INPUT_PADX: Record<SizeRecipeToken, number> = {
  $1: 1,
  '$1.5': 2,
  $2: 4,
  '$2.5': 7,
  $3: 10,
  '$3.5': 13,
  $4: 16,
  $true: 16,
  $5: 21,
  $6: 24,
};

/**
 * controlCompact: same height / radius (so gap == radius) as control;
 * padX is the Input table (one space half-step tighter); font/icon sit
 * one type step below the control table.
 */
export const TAMAGUI_COMPACT_SIZE_TABLE: Record<SizeRecipeToken, SizeRecipeTokenChannels> = {
  $1: { paddingHorizontal: 1, fontSize: 10, iconSize: 9, radius: 3 },
  '$1.5': { paddingHorizontal: 2, fontSize: 11, iconSize: 10, radius: 4 },
  $2: { paddingHorizontal: 4, fontSize: 11, iconSize: 11, radius: 5 },
  '$2.5': { paddingHorizontal: 7, fontSize: 12, iconSize: 12, radius: 6 },
  $3: { paddingHorizontal: 10, fontSize: 12, iconSize: 13, radius: 7 },
  '$3.5': { paddingHorizontal: 13, fontSize: 13, iconSize: 14, radius: 8 },
  $4: { paddingHorizontal: 16, fontSize: 13, iconSize: 14, radius: 9 },
  $true: { paddingHorizontal: 16, fontSize: 13, iconSize: 14, radius: 9 },
  $5: { paddingHorizontal: 21, fontSize: 14, iconSize: 16, radius: 10 },
  $6: { paddingHorizontal: 24, fontSize: 16, iconSize: 18, radius: 16 },
};

// Geometric fallback only — used when `{ baseHeight }` drops tokenTable.
// Anchored at the measured $4 so a doubled baseHeight still doubles $4.
const FALLBACK_RATIOS: SizeRecipeRatios = {
  padX: 18 / 44,
  font: 14 / 44,
  icon: 16 / 44,
  gap: 9 / 44,
};

const FALLBACK_COMPACT_RATIOS: SizeRecipeRatios = {
  padX: 16 / 44,
  font: 13 / 44,
  icon: 14 / 44,
  gap: 9 / 44,
};

export const DEFAULT_SIZE_RECIPE_INPUTS: SizeRecipeInputs = {
  // Tamagui `$size.true` = 44 — the iOS touch minimum, measured on every
  // tamagui.dev button and input.
  baseHeight: 44,
  stepRatio: 1.25,
  tokenSteps: { ...SIZE_TOKEN_EXPONENTS },
  tokenHeights: { ...DEFAULT_TOKEN_HEIGHTS },
  sizeFactors: { ...defaultSizeFactors },
  tokenTable: { ...TAMAGUI_CONTROL_SIZE_TABLE },
  compactTokenTable: { ...TAMAGUI_COMPACT_SIZE_TABLE },
  inputPadX: { ...TAMAGUI_INPUT_PADX },
  ratios: { ...FALLBACK_RATIOS },
  compactRatios: { ...FALLBACK_COMPACT_RATIOS },
  // Tamagui `$radius.true` = 9 — the $4 / medium default. Per-token
  // radii live on tokenTable; this is the knob's medium stop and the
  // $4 table row, not a flat radius for every size.
  radiusPx: 9,
  touchFloor: 44,
};

export const defaultRecipeInputs = DEFAULT_SIZE_RECIPE_INPUTS;

export const TOUCH_HEIGHT_FLOOR = DEFAULT_SIZE_RECIPE_INPUTS.touchFloor;

const MD_TOUCH_MIN = 48;

function cloneTokenTable(table?: SizeRecipeTokenTable): SizeRecipeTokenTable | undefined {
  if (!table) {
    return undefined;
  }
  const next: SizeRecipeTokenTable = {};
  for (const token of SIZE_RECIPE_TOKENS) {
    const row = table[token];
    if (row) {
      next[token] = { ...row };
    }
  }
  return next;
}

function clonePadX(
  table?: Partial<Record<SizeRecipeToken, number>>,
): Partial<Record<SizeRecipeToken, number>> | undefined {
  return table ? { ...table } : undefined;
}

export function cloneSizeRecipeInputs(inputs: SizeRecipeInputs): SizeRecipeInputs {
  return {
    ...inputs,
    tokenSteps: { ...inputs.tokenSteps },
    tokenHeights: inputs.tokenHeights ? { ...inputs.tokenHeights } : undefined,
    sizeFactors: inputs.sizeFactors ? { ...inputs.sizeFactors } : undefined,
    tokenTable: cloneTokenTable(inputs.tokenTable),
    compactTokenTable: cloneTokenTable(inputs.compactTokenTable),
    inputPadX: clonePadX(inputs.inputPadX),
    ratios: { ...inputs.ratios },
    compactRatios: { ...inputs.compactRatios },
    tile: inputs.tile ? cloneTileSizeInputs(inputs.tile) : undefined,
  };
}

/**
 * Fill defaults. `{ baseHeight: 36 }` drops handwritten tokenHeights /
 * sizeFactors / token tables so every token regenerates from stepRatio.
 */
export function resolveSizeRecipeInputs(partial: Partial<SizeRecipeInputs> = {}): SizeRecipeInputs {
  const scalingOverride = partial.baseHeight != null || partial.stepRatio != null || partial.tokenSteps != null;
  const hasTokenHeights = Object.hasOwn(partial, 'tokenHeights');
  const hasSizeFactors = Object.hasOwn(partial, 'sizeFactors');
  const hasTokenTable = Object.hasOwn(partial, 'tokenTable');
  const hasCompactTable = Object.hasOwn(partial, 'compactTokenTable');
  const hasInputPadX = Object.hasOwn(partial, 'inputPadX');

  const resolved: SizeRecipeInputs = {
    baseHeight: partial.baseHeight ?? DEFAULT_SIZE_RECIPE_INPUTS.baseHeight,
    stepRatio: partial.stepRatio ?? DEFAULT_SIZE_RECIPE_INPUTS.stepRatio,
    tokenSteps: { ...DEFAULT_SIZE_RECIPE_INPUTS.tokenSteps, ...partial.tokenSteps },
    ratios: { ...DEFAULT_SIZE_RECIPE_INPUTS.ratios, ...partial.ratios },
    compactRatios: { ...DEFAULT_SIZE_RECIPE_INPUTS.compactRatios, ...partial.compactRatios },
    radiusPx: partial.radiusPx ?? DEFAULT_SIZE_RECIPE_INPUTS.radiusPx,
    touchFloor: partial.touchFloor ?? DEFAULT_SIZE_RECIPE_INPUTS.touchFloor,
  };

  if (partial.tile !== undefined) {
    resolved.tile = partial.tile ? resolveTileSizeInputs(partial.tile) : undefined;
  }

  if (hasTokenHeights) {
    resolved.tokenHeights = partial.tokenHeights ? { ...partial.tokenHeights } : undefined;
    if (hasSizeFactors) {
      resolved.sizeFactors = partial.sizeFactors ? { ...partial.sizeFactors } : undefined;
    }
  } else if (hasSizeFactors) {
    resolved.sizeFactors = partial.sizeFactors ? { ...partial.sizeFactors } : undefined;
  } else if (!scalingOverride) {
    resolved.tokenHeights = { ...DEFAULT_SIZE_RECIPE_INPUTS.tokenHeights };
    resolved.sizeFactors = { ...DEFAULT_SIZE_RECIPE_INPUTS.sizeFactors };
  }

  if (hasTokenTable) {
    resolved.tokenTable = partial.tokenTable ? cloneTokenTable(partial.tokenTable) : undefined;
  } else if (!scalingOverride) {
    resolved.tokenTable = cloneTokenTable(DEFAULT_SIZE_RECIPE_INPUTS.tokenTable);
  }

  if (hasCompactTable) {
    resolved.compactTokenTable = partial.compactTokenTable ? cloneTokenTable(partial.compactTokenTable) : undefined;
  } else if (!scalingOverride) {
    resolved.compactTokenTable = cloneTokenTable(DEFAULT_SIZE_RECIPE_INPUTS.compactTokenTable);
  }

  if (hasInputPadX) {
    resolved.inputPadX = partial.inputPadX ? clonePadX(partial.inputPadX) : undefined;
  } else if (!scalingOverride) {
    resolved.inputPadX = clonePadX(DEFAULT_SIZE_RECIPE_INPUTS.inputPadX);
  }

  return resolved;
}

export const mergeRecipeInputs = resolveSizeRecipeInputs;

function clampHeight(value: number): number {
  return Math.max(1, Math.round(value));
}

function heightForToken(token: string, inputs: SizeRecipeInputs): number {
  const explicitPx = inputs.tokenHeights?.[token];
  if (explicitPx != null) {
    return clampHeight(explicitPx);
  }
  const factor = inputs.sizeFactors?.[token as SizeRecipeToken];
  if (factor != null) {
    return clampHeight(inputs.baseHeight * factor);
  }
  const step = inputs.tokenSteps[token] ?? 0;
  return clampHeight(inputs.baseHeight * inputs.stepRatio ** step);
}

export function sizeRecipeFromHeight(
  height: number,
  ratios: SizeRecipeRatios = DEFAULT_SIZE_RECIPE_INPUTS.ratios,
): SizeRecipe {
  const gap = Math.round(height * ratios.gap);
  return {
    height,
    paddingHorizontal: Math.round(height * ratios.padX),
    fontSize: Math.round(height * ratios.font),
    iconSize: Math.round(height * ratios.icon),
    gap,
  };
}

export function recipeFromTokenChannels(height: number, channels: SizeRecipeTokenChannels): SizeRecipe {
  return {
    height,
    paddingHorizontal: channels.paddingHorizontal,
    fontSize: channels.fontSize,
    iconSize: channels.iconSize,
    gap: channels.radius,
  };
}

/** Explicit recipe transformation; ordinary control shape changes use resolveControlRadius. */
export function applyRadiusStop<T extends { gap: number }>(recipe: T, stop: SizeRecipeRadiusStop): T {
  return { ...recipe, gap: SIZE_RECIPE_RADIUS_STOPS[stop] };
}

/** Knob fragment token → stop name. Default medium is `$4`. */
export const SIZE_RECIPE_RADIUS_TOKEN_TO_STOP = {
  $0: 'none',
  $2: 'small',
  $4: 'medium',
  $6: 'large',
  $12: 'full',
} as const;

/**
 * Painted control radius + inner gap.
 *
 * Default `medium` follows the size table (gap == radius at that token).
 * Other borderRadius stops override the corners only. Internal spacing
 * continues to group the icon and label at the recipe's size.
 */
export function resolveControlRadius(
  recipe: SizeRecipe,
  stop: SizeRecipeRadiusStop = 'medium',
): { radius: number; gap: number } {
  if (stop === 'medium') {
    return { radius: recipe.gap, gap: recipe.gap };
  }
  const px = SIZE_RECIPE_RADIUS_STOPS[stop];
  return { radius: px, gap: recipe.gap };
}

function generateTouchHeights(
  heights: Record<string, number>,
  inputs: SizeRecipeInputs,
  tokens: readonly string[],
): Record<string, number> {
  const { touchFloor, tokenSteps } = inputs;
  const mdDesktop = heights.$4 ?? inputs.baseHeight;
  const floored: Record<string, number> = {};
  for (const token of tokens) {
    floored[token] = Math.max(heights[token], touchFloor);
  }

  let mdTouch = Math.max(floored.$4 ?? touchFloor, MD_TOUCH_MIN);
  const below = tokens.filter((token) => (tokenSteps[token] ?? 0) < 0);
  const maxBelow = below.length > 0 ? Math.max(...below.map((token) => floored[token])) : touchFloor;
  if (mdTouch <= maxBelow) {
    const nextSmaller = heights.$3 ?? mdDesktop;
    mdTouch = maxBelow + Math.max(mdDesktop - nextSmaller, 1);
  }

  const heightsTouch: Record<string, number> = {};
  for (const token of tokens) {
    const step = tokenSteps[token] ?? 0;
    if (step < 0) {
      heightsTouch[token] = floored[token];
    } else if (step === 0) {
      heightsTouch[token] = mdTouch;
    } else {
      heightsTouch[token] = Math.max(floored[token], mdTouch + (heights[token] - mdDesktop));
    }
  }
  return heightsTouch;
}

function channelsForToken(token: string, table: SizeRecipeTokenTable | undefined): SizeRecipeTokenChannels | undefined {
  if (!table) {
    return undefined;
  }
  return table[token as SizeRecipeToken] ?? (token === '$true' ? table.$4 : undefined);
}

export function generateSizeRecipeTables(
  inputs: SizeRecipeInputs,
  ratios: SizeRecipeRatios = inputs.ratios,
  table: SizeRecipeTokenTable | undefined = inputs.tokenTable,
): SizeRecipeTables {
  const tokens = SIZE_RECIPE_TOKENS;
  const heights: Record<string, number> = {};
  for (const token of tokens) {
    heights[token] = heightForToken(token, inputs);
  }
  if (inputs.tokenHeights?.$true == null) {
    heights.$true = heights.$4;
  }

  const touchHeights = generateTouchHeights(heights, inputs, tokens);
  const recipes: Record<string, SizeRecipe> = {};
  const recipesTouch: Record<string, SizeRecipe> = {};
  const boxVariants: Record<string, SizeRecipeBoxVariant> = {};
  const typeVariants: Record<string, SizeRecipeTypeVariant> = {};
  const iconVariants: Record<string, SizeRecipeIconVariant> = {};
  const heightVariants: Record<string, { height: number }> = {};
  const radii: Record<string, number> = {};

  for (const token of tokens) {
    const channels = channelsForToken(token, table);
    const recipe = channels
      ? recipeFromTokenChannels(heights[token], channels)
      : sizeRecipeFromHeight(heights[token], ratios);
    const radius = channels ? channels.radius : recipe.gap;
    recipes[token] = recipe;
    recipesTouch[token] = sizeRecipeFromHeight(touchHeights[token], ratios);
    radii[token] = radius;
    boxVariants[token] = {
      height: recipe.height,
      paddingHorizontal: recipe.paddingHorizontal,
      gap: recipe.gap,
    };
    typeVariants[token] = { fontSize: recipe.fontSize };
    iconVariants[token] = { width: recipe.iconSize, height: recipe.iconSize };
    heightVariants[token] = { height: recipe.height };
  }

  return {
    inputs,
    ratios: { ...ratios },
    heights,
    touchHeights,
    recipes,
    recipesTouch,
    boxVariants,
    typeVariants,
    iconVariants,
    heightVariants,
    radii,
  };
}

export function createRecipeFamilies(inputs: SizeRecipeInputs | Partial<SizeRecipeInputs> = {}): RecipeFamilies {
  const resolved = cloneSizeRecipeInputs(resolveSizeRecipeInputs(inputs));
  const control = generateSizeRecipeTables(resolved, resolved.ratios, resolved.tokenTable);
  const controlCompact = generateSizeRecipeTables(resolved, resolved.compactRatios, resolved.compactTokenTable);
  return {
    control: { ...control, name: 'control' },
    controlCompact: { ...controlCompact, name: 'controlCompact' },
  };
}

export function generateSizeRecipes(partial: Partial<SizeRecipeInputs> = {}): GeneratedSizeRecipes {
  const inputs = cloneSizeRecipeInputs(resolveSizeRecipeInputs(partial));
  const families = createRecipeFamilies(inputs);
  const control = families.control;
  return {
    inputs,
    heights: control.heights,
    heightsTouch: control.touchHeights,
    recipes: control.recipes,
    recipesTouch: control.recipesTouch,
    boxVariants: control.boxVariants,
    typeVariants: control.typeVariants,
    iconVariants: control.iconVariants,
    radii: control.radii,
    families,
    tiles: generateTileSizeLadder(resolveTileSizeInputs(inputs.tile ?? {})),
  };
}

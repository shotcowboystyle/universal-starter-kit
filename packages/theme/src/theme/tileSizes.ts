/**
 * Tile-size ladder + media-aspect vocabulary.
 *
 * Every tile wall needs the same two decisions: HOW BIG is a tile (a small
 * named ladder a person can pick from — the user-facing S/M/L/XL control)
 * and WHAT SHAPE is its media (so the loading skeleton is the same shape as
 * the image that replaces it). Before this module both were app-invented:
 * the console's `launcherGeometry.ts` and
 * Lookout's private `TILE_SIZES` were the same gap twice.
 *
 * Like the control-size recipes (RECIPE-INPUTS), STORED INPUTS are the
 * source of truth and the ladder table is DERIVED — never handwritten at a
 * call site. The default rung values are the MEASURED ladders from the two
 * real consumers, not invented numbers:
 *
 * | rung | minWidth | maxWidth | measured from                                  |
 * |------|----------|----------|------------------------------------------------|
 * | xs   | 104      | 143      | launcher icon-plate track `minmax(104px,1fr)`  |
 * | sm   | 220      | 300      | Lookout `TILE_SIZES.s` / SPA `TILE_MIN.s`      |
 * | md   | 320      | 440      | Lookout `TILE_SIZES.m` / SPA `TILE_MIN.m`      |
 * | lg   | 480      | 720      | Lookout `TILE_SIZES.l` / SPA `TILE_MIN.l`      |
 * | xl   | 720      | 1400     | Lookout `TILE_SIZES.xl` / SPA `TILE_MIN.xl`    |
 *
 * `{ baseWidth: 280 }` (no rungWidths / widthFactors) regenerates the whole
 * ladder geometrically from `baseWidth * stepRatio ** step`, the same
 * override contract `resolveSizeRecipeInputs` gives `baseHeight`.
 *
 * OWNERSHIP (12-one-design.md Part B): the RUNGS are universal — generated
 * here, restyled only through recipe inputs
 * (`setSizeRecipeInputs({ tile })` / `createDefaultThemeConfig({ recipeInputs:
 * { tile } })`). WHICH rung a surface shows is per-app (a prop, often
 * persisted per user). Tile gutters stay on the space knob and tile rounding
 * on the borderRadius knob — this module never emits a gap or a radius.
 *
 * DENSITY: density moves SPACE only. A compact density steps the
 * gutters between tiles (via the space knob) and must never re-rung the
 * ladder — tile magnitude is content scale, not chrome scale, so nothing
 * here reads the density knob.
 */

// ── Rungs ─────────────────────────────────────────────────────

export const tileSizeRungs = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export type TileSizeRung = (typeof tileSizeRungs)[number];

/** One rung: the narrowest a tile may render, and the widest. */
export interface TileSizeStop {
  minWidth: number;
  maxWidth: number;
}

export type TileSizeLadder = Record<TileSizeRung, TileSizeStop>;

// ── Inputs ────────────────────────────────────────────────────

export interface TileSizeInputs {
  /** Desktop px min-width of the `md` rung. */
  baseWidth: number;
  /** Rung-to-rung ratio when regenerating geometrically. */
  stepRatio: number;
  /** Exponent of each rung relative to `md` (0). */
  rungSteps: Record<TileSizeRung, number>;
  /**
   * Absolute desktop px min-widths. When omitted, min-widths come from
   * `baseWidth * stepRatio ** step` (or `widthFactors`).
   */
  rungWidths?: Partial<Record<TileSizeRung, number>>;
  /**
   * Optional per-rung scale relative to `baseWidth`. Used only when
   * `rungWidths` is omitted. Factors are `stepRatio ** exponent` otherwise.
   */
  widthFactors?: Partial<Record<TileSizeRung, number>>;
  /** maxWidth = minWidth * maxRatio for any rung `rungMaxWidths` does not pin. */
  maxRatio: number;
  /** Absolute desktop px max-widths (measured pins win over `maxRatio`). */
  rungMaxWidths?: Partial<Record<TileSizeRung, number>>;
}

export const tileSizeStepExponents: Record<TileSizeRung, number> = {
  xs: -2,
  sm: -1,
  md: 0,
  lg: 1,
  xl: 2,
};

// Measured min-widths: xs is the launcher/springboard icon-plate grid track
// (`minmax(104px,1fr)` — launcherGeometry.ts / traefik menu.go); sm..xl are
// Lookout's `TILE_SIZES` basis values, identical in the production SPA's
// `TILE_MIN` map. Kept explicit so adopting the ladder is a rendered no-op
// for both consumers.
const measuredRungWidths: Record<TileSizeRung, number> = {
  xs: 104,
  sm: 220,
  md: 320,
  lg: 480,
  xl: 720,
};

/** Lossless relative table: the measured 104/220/320/480/720 ramp at baseWidth 320. */
export const defaultWidthFactors: Record<TileSizeRung, number> = {
  xs: 104 / 320,
  sm: 220 / 320,
  md: 1,
  lg: 480 / 320,
  xl: 720 / 320,
};

// Measured max-widths (Lookout `TILE_SIZES` max). xl's 1.94x is the
// deliberate "one huge tile" rung; xs has no measured max (the launcher caps
// tiles by column count), so it derives from `maxRatio`.
const measuredRungMaxWidths: Partial<Record<TileSizeRung, number>> = {
  sm: 300,
  md: 440,
  lg: 720,
  xl: 1400,
};

export const defaultTileSizeInputs: TileSizeInputs = {
  baseWidth: 320,
  stepRatio: 1.5,
  rungSteps: { ...tileSizeStepExponents },
  rungWidths: { ...measuredRungWidths },
  widthFactors: { ...defaultWidthFactors },
  // Lookout md: 440/320. The measured sm (1.36) and lg (1.5) bracket it.
  maxRatio: 440 / 320,
  rungMaxWidths: { ...measuredRungMaxWidths },
};

/**
 * Deep copy that PRESERVES partiality: keys the caller never set stay
 * unset, so a later `resolveTileSizeInputs` still sees them as defaults
 * rather than explicit undefineds.
 */
export function cloneTileSizeInputs<T extends Partial<TileSizeInputs>>(inputs: T): T {
  const clone = { ...inputs };
  if (inputs.rungSteps) {
    clone.rungSteps = { ...inputs.rungSteps };
  }
  if (inputs.rungWidths) {
    clone.rungWidths = { ...inputs.rungWidths };
  }
  if (inputs.widthFactors) {
    clone.widthFactors = { ...inputs.widthFactors };
  }
  if (inputs.rungMaxWidths) {
    clone.rungMaxWidths = { ...inputs.rungMaxWidths };
  }
  return clone;
}

/**
 * Fill defaults. `{ baseWidth: 280 }` (any scaling override without explicit
 * tables) drops the measured rungWidths/widthFactors/rungMaxWidths so every
 * rung regenerates from `stepRatio` — the `resolveSizeRecipeInputs` contract.
 */
export function resolveTileSizeInputs(partial: Partial<TileSizeInputs> = {}): TileSizeInputs {
  const scalingOverride = partial.baseWidth != null || partial.stepRatio != null || partial.rungSteps != null;
  const hasRungWidths = Object.hasOwn(partial, 'rungWidths');
  const hasWidthFactors = Object.hasOwn(partial, 'widthFactors');
  const hasRungMaxWidths = Object.hasOwn(partial, 'rungMaxWidths');

  const resolved: TileSizeInputs = {
    baseWidth: partial.baseWidth ?? defaultTileSizeInputs.baseWidth,
    stepRatio: partial.stepRatio ?? defaultTileSizeInputs.stepRatio,
    rungSteps: { ...defaultTileSizeInputs.rungSteps, ...partial.rungSteps },
    maxRatio: partial.maxRatio ?? defaultTileSizeInputs.maxRatio,
  };

  if (hasRungWidths) {
    resolved.rungWidths = partial.rungWidths ? { ...partial.rungWidths } : undefined;
    if (hasWidthFactors) {
      resolved.widthFactors = partial.widthFactors ? { ...partial.widthFactors } : undefined;
    }
  } else if (hasWidthFactors) {
    resolved.widthFactors = partial.widthFactors ? { ...partial.widthFactors } : undefined;
  } else if (!scalingOverride) {
    resolved.rungWidths = { ...defaultTileSizeInputs.rungWidths };
    resolved.widthFactors = { ...defaultTileSizeInputs.widthFactors };
  }

  if (hasRungMaxWidths) {
    resolved.rungMaxWidths = partial.rungMaxWidths ? { ...partial.rungMaxWidths } : undefined;
  } else if (!scalingOverride && !hasRungWidths && !hasWidthFactors) {
    resolved.rungMaxWidths = { ...defaultTileSizeInputs.rungMaxWidths };
  }

  return resolved;
}

// ── Generation ────────────────────────────────────────────────

function clampWidth(value: number): number {
  return Math.max(1, Math.round(value));
}

function minWidthForRung(rung: TileSizeRung, inputs: TileSizeInputs): number {
  const explicitPx = inputs.rungWidths?.[rung];
  if (explicitPx != null) {
    return clampWidth(explicitPx);
  }
  const factor = inputs.widthFactors?.[rung];
  if (factor != null) {
    return clampWidth(inputs.baseWidth * factor);
  }
  const step = inputs.rungSteps[rung] ?? 0;
  return clampWidth(inputs.baseWidth * inputs.stepRatio ** step);
}

/** Derive the full ladder from resolved inputs. Tables are generated, never handwritten. */
export function generateTileSizeLadder(inputs: TileSizeInputs): TileSizeLadder {
  const ladder = {} as TileSizeLadder;
  for (const rung of tileSizeRungs) {
    const minWidth = minWidthForRung(rung, inputs);
    const pinnedMax = inputs.rungMaxWidths?.[rung];
    const maxWidth = Math.max(
      minWidth,
      pinnedMax != null ? clampWidth(pinnedMax) : clampWidth(minWidth * inputs.maxRatio),
    );
    ladder[rung] = { minWidth, maxWidth };
  }
  return ladder;
}

// ── Consumption helpers ───────────────────────────────────────

export interface TileRungFlexProps {
  flexGrow: number;
  flexBasis: number;
  minWidth: number;
  maxWidth: number;
}

/**
 * Style fragment for a tile in a wrapping flex wall (the Lookout idiom:
 * tiles grow from `minWidth` and stop at `maxWidth`). Spread it on the tile
 * surface; gutters stay on the container's space-knob gap.
 */
export function tileRungFlexProps(stop: TileSizeStop): TileRungFlexProps {
  return {
    flexGrow: 1,
    flexBasis: stop.minWidth,
    minWidth: stop.minWidth,
    maxWidth: stop.maxWidth,
  };
}

/**
 * Column count for a fixed-column tile grid (the ImageGrid / springboard
 * idiom): as many columns as fit at the rung's minWidth. `gutter` is the
 * inter-column gap (the space knob's value), never baked into the rung.
 *
 * The count is min-driven on purpose: adding a column to honor `maxWidth`
 * would, by construction of the fit, drop every cell below `minWidth`
 * (`(fit+1)` cells at minWidth already overflow the width). `maxWidth`
 * binds in the wrapping-flex idiom (`tileRungFlexProps`), where a tile can
 * stop growing without forcing a new column.
 *
 * At the springboard's own numbers this reproduces the launcher's split:
 * `xs` (104) with the 8px launcher gutter yields 6 columns at the 700px
 * wide-breakpoint and 4 in the phone band.
 */
export function tileColumnsForWidth(width: number, stop: TileSizeStop, gutter = 0): number {
  if (!Number.isFinite(width) || width <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor((width + gutter) / (stop.minWidth + gutter)));
}

// ── Media aspect (H2) ─────────────────────────────────────────

/**
 * Named media aspect ratios (width / height). A skeleton twin drawn at the
 * wrong aspect produces the exact layout jump it exists to prevent
 * (ImageGrid hardcoded 1; Lookout frames are 16:10).
 */
export const mediaAspectRatios = {
  /** Album art, avatars, icon plates. */
  square: 1,
  /** Stills cameras, 4:3. */
  photo: 4 / 3,
  /** Desktop screen captures, 16:10 — the Lookout frame shape. */
  screen: 16 / 10,
  /** Video stills, 16:9. */
  video: 16 / 9,
  /** Portrait media, 3:4. */
  portrait: 3 / 4,
} as const;

export type MediaAspectName = keyof typeof mediaAspectRatios;

/** A named aspect or an explicit width/height number. */
export type MediaAspect = MediaAspectName | number;

/** Resolve a name or number to a positive width/height ratio (default `square`). */
export function resolveMediaAspect(aspect?: MediaAspect | null): number {
  if (typeof aspect === 'number') {
    return Number.isFinite(aspect) && aspect > 0 ? aspect : mediaAspectRatios.square;
  }
  if (aspect != null && aspect in mediaAspectRatios) {
    return mediaAspectRatios[aspect];
  }
  return mediaAspectRatios.square;
}

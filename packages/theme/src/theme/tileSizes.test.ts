import { afterEach, describe, expect, it } from 'vitest';

import { generateSizeRecipes } from './recipeInputs';
import { getSizeRecipeInputs, setSizeRecipeInputs, tileSizeLadder } from './sizeRecipes';
import {
  defaultTileSizeInputs,
  generateTileSizeLadder,
  mediaAspectRatios,
  resolveMediaAspect,
  resolveTileSizeInputs,
  tileColumnsForWidth,
  tileRungFlexProps,
  tileSizeRungs,
} from './tileSizes';

afterEach(() => {
  setSizeRecipeInputs();
});

describe('tile-size ladder', () => {
  it('defaults to the measured consumer ladders, not invented numbers', () => {
    const ladder = generateTileSizeLadder(resolveTileSizeInputs());
    // sm..xl are Lookout's TILE_SIZES basis/max (identical to the SPA's
    // TILE_MIN); xs is the launcher icon-plate minmax(104px,1fr) track.
    expect(ladder.sm).toEqual({ minWidth: 220, maxWidth: 300 });
    expect(ladder.md).toEqual({ minWidth: 320, maxWidth: 440 });
    expect(ladder.lg).toEqual({ minWidth: 480, maxWidth: 720 });
    expect(ladder.xl).toEqual({ minWidth: 720, maxWidth: 1400 });
    expect(ladder.xs.minWidth).toBe(104);
    // xs has no measured max; it derives from maxRatio (440/320).
    expect(ladder.xs.maxWidth).toBe(Math.round(104 * defaultTileSizeInputs.maxRatio));
  });

  it('is a generated table: rungs are monotonic and max >= min on every rung', () => {
    const ladder = generateTileSizeLadder(resolveTileSizeInputs());
    for (let i = 0; i < tileSizeRungs.length; i++) {
      const stop = ladder[tileSizeRungs[i]];
      expect(stop.maxWidth).toBeGreaterThanOrEqual(stop.minWidth);
      if (i > 0) {
        expect(stop.minWidth).toBeGreaterThan(ladder[tileSizeRungs[i - 1]].minWidth);
      }
    }
  });

  it('a bare baseWidth override regenerates the whole ladder geometrically', () => {
    const inputs = resolveTileSizeInputs({ baseWidth: 280 });
    // Scaling override drops the measured pins (the resolveSizeRecipeInputs contract).
    expect(inputs.rungWidths).toBeUndefined();
    expect(inputs.widthFactors).toBeUndefined();
    expect(inputs.rungMaxWidths).toBeUndefined();
    const ladder = generateTileSizeLadder(inputs);
    expect(ladder.md.minWidth).toBe(280);
    expect(ladder.lg.minWidth).toBe(Math.round(280 * 1.5));
    expect(ladder.xl.minWidth).toBe(Math.round(280 * 1.5 ** 2));
    expect(ladder.sm.minWidth).toBe(Math.round(280 / 1.5));
    expect(ladder.xs.minWidth).toBe(Math.round(280 / 1.5 ** 2));
    for (const rung of tileSizeRungs) {
      expect(ladder[rung].maxWidth).toBe(Math.round(ladder[rung].minWidth * defaultTileSizeInputs.maxRatio));
    }
  });

  it('explicit rungMaxWidths pin maxes; maxRatio covers the rest', () => {
    const ladder = generateTileSizeLadder(
      resolveTileSizeInputs({ baseWidth: 300, maxRatio: 2, rungMaxWidths: { md: 555 } }),
    );
    expect(ladder.md).toEqual({ minWidth: 300, maxWidth: 555 });
    expect(ladder.lg.maxWidth).toBe(ladder.lg.minWidth * 2);
  });

  it('tileRungFlexProps is the wrapping-flex tile fragment (the Lookout idiom)', () => {
    const ladder = generateTileSizeLadder(resolveTileSizeInputs());
    expect(tileRungFlexProps(ladder.md)).toEqual({
      flexGrow: 1,
      flexBasis: 320,
      minWidth: 320,
      maxWidth: 440,
    });
  });

  it('tileColumnsForWidth derives fixed-column counts from the rung and the gutter', () => {
    const ladder = generateTileSizeLadder(resolveTileSizeInputs());
    // A 1024 window at md with a 12px gutter fits 3 columns.
    expect(tileColumnsForWidth(1024, ladder.md, 12)).toBe(3);
    // xs at the launcher's own 8px gutter reproduces the springboard split:
    // 6 columns at the 700px wide-breakpoint, 4 in the phone band.
    expect(tileColumnsForWidth(700, ladder.xs, 8)).toBe(6);
    expect(tileColumnsForWidth(500, ladder.xs, 8)).toBe(4);
    // Never fewer than one column.
    expect(tileColumnsForWidth(80, ladder.md)).toBe(1);
    expect(tileColumnsForWidth(0, ladder.md)).toBe(1);
    expect(tileColumnsForWidth(Number.NaN, ladder.md)).toBe(1);
  });

  it('rides recipeInputs: generateSizeRecipes carries tiles and setSizeRecipeInputs rewrites the live ladder in place', () => {
    expect(generateSizeRecipes().tiles.md).toEqual({ minWidth: 320, maxWidth: 440 });

    const live = tileSizeLadder;
    expect(live.md.minWidth).toBe(320);
    setSizeRecipeInputs({ tile: { baseWidth: 280 } });
    // Same object identity (styled()-spread safety), new generated rows.
    expect(tileSizeLadder).toBe(live);
    expect(tileSizeLadder.md.minWidth).toBe(280);
    expect(tileSizeLadder.lg.minWidth).toBe(420);
    // The stored inputs round-trip through getSizeRecipeInputs.
    expect(getSizeRecipeInputs().tile?.baseWidth).toBe(280);

    setSizeRecipeInputs();
    expect(tileSizeLadder.md).toEqual({ minWidth: 320, maxWidth: 440 });
    expect(tileSizeLadder.sm).toEqual({ minWidth: 220, maxWidth: 300 });
  });
});

describe('media aspect vocabulary', () => {
  it('names resolve to their measured ratios', () => {
    expect(resolveMediaAspect('square')).toBe(1);
    expect(resolveMediaAspect('photo')).toBeCloseTo(4 / 3);
    // The Lookout frame shape — desktop screen captures at 16:10.
    expect(resolveMediaAspect('screen')).toBeCloseTo(1.6);
    expect(resolveMediaAspect('video')).toBeCloseTo(16 / 9);
    expect(resolveMediaAspect('portrait')).toBeCloseTo(3 / 4);
    expect(Object.keys(mediaAspectRatios)).toEqual(['square', 'photo', 'screen', 'video', 'portrait']);
  });

  it('numbers pass through; nullish and junk fall back to square', () => {
    expect(resolveMediaAspect(1.6)).toBe(1.6);
    expect(resolveMediaAspect()).toBe(1);
    expect(resolveMediaAspect(null)).toBe(1);
    expect(resolveMediaAspect(0)).toBe(1);
    expect(resolveMediaAspect(-2)).toBe(1);
    expect(resolveMediaAspect(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

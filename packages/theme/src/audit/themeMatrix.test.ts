import { describe, expect, it } from 'vitest';

import { generateSizeRecipes } from '../theme/recipeInputs';
import type { SizeRecipeInputs } from '../theme/recipeInputs';

import {
  captureMatrixSnapshot,
  diffGeometry,
  evaluateNoBreakage,
  evaluateIconContrast,
  evaluateChartProof,
  type MatrixChartSample,
  type MatrixIconSample,
  type IconUnmeasurableReason,
  evaluateTextContrast,
  type MatrixSnapshot,
  type MatrixTextSample,
} from './themeMatrix';

/**
 * Renders a size-recipe table into the geometry shape the matrix runner
 * captures from the DOM, so the invariance diff can be held against the
 * ONE banned coupling: recipe inputs consuming a theme option.
 * A control's height/padding/font per size token is exactly what the
 * generated recipes pin, so any theme-dependence of the inputs shows up
 * here the same way it would on screen.
 */
function snapshotFromRecipeInputs(inputs: Partial<SizeRecipeInputs>): MatrixSnapshot {
  const generated = generateSizeRecipes(inputs);
  const geometry = Object.entries(generated.recipes).map(([token, recipe]) => ({
    key: `button:${token}`,
    tag: 'button',
    rect: { x: 0, y: 0, w: recipe.paddingHorizontal * 2 + 80, h: recipe.height },
    props: {
      paddingLeft: `${recipe.paddingHorizontal}px`,
      paddingRight: `${recipe.paddingHorizontal}px`,
      fontSize: `${recipe.fontSize}px`,
      rowGap: `${recipe.gap}px`,
    },
  }));
  return {
    storyRendered: true,
    geometry,
    textSamples: [],
    iconSamples: [],
    chartSamples: [],
    svgRootCount: 0,
  };
}

describe('declared chart proof keeps uncertainty visible', () => {
  const sample = (overrides: Partial<MatrixChartSample> = {}): MatrixChartSample => ({
    key: 'chart:0',
    kind: 'pie',
    context: 'Revenue',
    label: 'Revenue by region',
    background: '#111111',
    backgroundResolved: true,
    marks: [
      { key: 'slice:0', label: 'North', paint: '#bbbbbb', background: '#111111' },
      { key: 'slice:1', label: 'South', paint: '#dddddd', background: '#111111' },
    ],
    labels: [],
    separation: { declared: false },
    datumText: { declared: true, expected: 2, observed: 2, complete: true },
    ...overrides,
  });

  it('names adjacent slice contrast and does not accept a boolean gap claim', () => {
    const result = evaluateChartProof([sample({ separation: { declared: true } })]);
    expect(result.ok).toBe(false);
    expect(result.violations.some((item) => item.rule === 'adjacent-pair')).toBe(true);
    expect(result.unverified.some((item) => item.reason === 'unverified-separation')).toBe(true);
  });

  it('requires two measured physical pixels between bars', () => {
    const separated = sample({
      kind: 'bar',
      separation: { declared: true, method: 'rect-bounds', minimumGapPx: 2 },
    });
    expect(evaluateChartProof([separated]).ok).toBe(true);
    expect(
      evaluateChartProof([{ ...separated, separation: { declared: true, method: 'rect-bounds', minimumGapPx: 1.99 } }])
        .ok,
    ).toBe(false);
  });

  it('does not round a below-floor paint pair green', () => {
    const result = evaluateChartProof([
      sample({
        marks: [{ key: 'almost', label: 'Almost', paint: '#000000', background: '#595959' }],
      }),
    ]);
    const violation = result.violations.find((item) => item.rule === 'mark-backdrop');
    expect(violation?.ratio).toBeGreaterThan(2.995);
    expect(violation?.ratio).toBeLessThan(3);
  });

  it('never treats a rect certificate as proof of pie center separation', () => {
    expect(
      evaluateChartProof([sample({ separation: { declared: true, method: 'rect-bounds', minimumGapPx: 8 } })]).ok,
    ).toBe(false);
  });

  it.each(['unknown-kind', 'no-marks', 'unsupported-paint'] as const)('keeps %s named and red', (reason) => {
    const input =
      reason === 'unknown-kind'
        ? sample({ kind: 'radar' })
        : reason === 'no-marks'
          ? sample({ marks: [] })
          : sample({
              marks: [
                {
                  key: 'gradient',
                  label: 'North',
                  background: '#111111',
                  unmeasurable: 'unsupported-paint',
                },
              ],
            });
    expect(evaluateChartProof([input]).unverified.some((item) => item.reason === reason)).toBe(true);
  });

  it('requires a root label, readable axis text and a complete datum alternative', () => {
    const result = evaluateChartProof([
      sample({
        label: '',
        labels: [{ key: 'tick', label: 'May', paint: '#333333', background: '#111111' }],
        datumText: { declared: true, expected: 13, observed: 12, complete: false },
      }),
    ]);
    expect(result.violations.map((item) => item.rule)).toEqual(expect.arrayContaining(['missing-label', 'axis-text']));
    expect(result.unverified.some((item) => item.reason === 'incomplete-datum-text')).toBe(true);
  });
});

describe('theme-axis geometry invariance (tripwire)', () => {
  it('identical recipe inputs across theme colours keep the diff clean', () => {
    const base = snapshotFromRecipeInputs({});
    const blue = snapshotFromRecipeInputs({});
    const diff = diffGeometry(base, blue);
    expect(diff.identical).toBe(true);
    expect(diff.moves).toHaveLength(0);
  });

  it('deliberately feeding a theme option into recipeInputs FAILS the invariance diff', () => {
    // The banned coupling: a size recipe input derived from the active
    // theme colour. Geometry becomes a function of theme and the theme
    // axis is no longer paint-only.
    const inputsForTheme = (theme: string): Partial<SizeRecipeInputs> => (theme === 'blue' ? { baseHeight: 48 } : {});

    const defaultCell = snapshotFromRecipeInputs(inputsForTheme(''));
    const blueCell = snapshotFromRecipeInputs(inputsForTheme('blue'));

    const diff = diffGeometry(defaultCell, blueCell);
    expect(diff.identical).toBe(false);
    expect(diff.moves.length).toBeGreaterThan(0);
    // The moved properties are the generated recipe outputs, named per element.
    const movedProps = new Set(diff.moves.map((m) => m.property));
    expect(movedProps.has('rect')).toBe(true);
    expect(movedProps.has('fontSize')).toBe(true);
  });

  it('reports structural drift (added/removed elements) as non-identical', () => {
    const base = snapshotFromRecipeInputs({});
    const mutated: MatrixSnapshot = {
      ...base,
      geometry: base.geometry.slice(1),
    };
    const diff = diffGeometry(base, mutated);
    expect(diff.identical).toBe(false);
    expect(diff.removedKeys).toHaveLength(1);
  });

  it('absorbs sub-pixel rect jitter only within the explicit epsilon', () => {
    const base = snapshotFromRecipeInputs({});
    const jittered: MatrixSnapshot = {
      ...base,
      geometry: base.geometry.map((g) => ({
        ...g,
        rect: { ...g.rect, x: g.rect.x + 0.25 },
      })),
    };
    expect(diffGeometry(base, jittered, { epsilonPx: 0.25 }).identical).toBe(true);
    expect(diffGeometry(base, jittered, { epsilonPx: 0 }).identical).toBe(false);
  });
});

const cleanIcons = evaluateIconContrast([]);

describe('preset-axis no-breakage (two assertions, never one)', () => {
  const cleanContrast = { measured: 10, unmeasurable: 0, violations: [] };

  it('does NOT flag moved geometry — boldPreset is EXPECTED to move pixels', () => {
    // A preset cell whose geometry differs wildly from the default cell
    // still passes no-breakage as long as nothing broke. Geometry equality
    // belongs exclusively to the theme axis.
    const defaultCell = snapshotFromRecipeInputs({});
    const boldCell = snapshotFromRecipeInputs({ baseHeight: 52, radiusPx: 50 });
    expect(diffGeometry(defaultCell, boldCell).identical).toBe(false);

    const result = evaluateNoBreakage({
      icons: cleanIcons,
      baselineIcons: cleanIcons,
      storyRendered: true,
      offScaleViolations: 0,
      baselineOffScaleViolations: 0,
      contrast: cleanContrast,
      baselineContrastViolations: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('FAILS when a preset cell falls off the knob scales beyond the default cell', () => {
    const result = evaluateNoBreakage({
      icons: cleanIcons,
      baselineIcons: cleanIcons,
      storyRendered: true,
      offScaleViolations: 3,
      baselineOffScaleViolations: 1,
      contrast: cleanContrast,
      baselineContrastViolations: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain('off-scale');
  });

  it('FAILS when a preset cell loses contrast the default cell had', () => {
    const result = evaluateNoBreakage({
      icons: cleanIcons,
      baselineIcons: cleanIcons,
      storyRendered: true,
      offScaleViolations: 0,
      baselineOffScaleViolations: 0,
      contrast: {
        measured: 10,
        unmeasurable: 0,
        violations: [
          {
            key: 'button:$4',
            text: 'Save',
            color: '#aaaaaa',
            background: '#ffffff',
            ratio: 2.32,
            required: 4.5,
          },
        ],
      },
      baselineContrastViolations: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain('contrast');
  });

  it('FAILS when the story does not render at all', () => {
    const result = evaluateNoBreakage({
      icons: cleanIcons,
      baselineIcons: cleanIcons,
      storyRendered: false,
      offScaleViolations: 0,
      baselineOffScaleViolations: 0,
      contrast: cleanContrast,
      baselineContrastViolations: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain('render');
  });

  it('names a replacement structural failure even when the count stays equal or falls', () => {
    const input = {
      storyRendered: true,
      offScaleViolations: 1,
      baselineOffScaleViolations: 1,
      offScaleSignatures: ['new control :: borderRadius: 15px is off-scale'],
      baselineOffScaleSignatures: ['old control :: borderRadius: 14px is off-scale'],
      contrast: cleanContrast,
      baselineContrastViolations: 0,
    };
    for (const baselineOffScaleViolations of [1, 2]) {
      const result = evaluateNoBreakage({ ...input, baselineOffScaleViolations });
      expect(result.ok).toBe(false);
      expect(result.failures[0]).toContain('new control');
      expect(result.failures[0]).not.toContain('old control');
    }
    expect(evaluateNoBreakage({ ...input, offScaleSignatures: input.baselineOffScaleSignatures }).ok).toBe(true);
  });

  it('names replacement text failures regardless of count and preserves repeated identities', () => {
    const old = {
      key: 'old text',
      text: 'Old',
      color: '#aaaaaa',
      background: '#ffffff',
      ratio: 2.32,
      required: 4.5,
    };
    const replacement = { ...old, key: 'new text', text: 'New' };
    const input = {
      storyRendered: true,
      offScaleViolations: 0,
      baselineOffScaleViolations: 0,
      contrast: { ...cleanContrast, violations: [replacement] },
      baselineContrastViolations: 1,
      baselineContrast: { ...cleanContrast, violations: [old] },
    };
    for (const baseline of [[old], [old, old]]) {
      const result = evaluateNoBreakage({
        ...input,
        baselineContrastViolations: baseline.length,
        baselineContrast: { ...cleanContrast, violations: baseline },
      });
      expect(result.ok).toBe(false);
      expect(result.failures[0]).toContain('new text');
    }
    expect(evaluateNoBreakage({ ...input, contrast: input.baselineContrast }).ok).toBe(true);
    expect(evaluateNoBreakage({ ...input, contrast: { ...cleanContrast, violations: [old, old] } }).ok).toBe(false);
  });
});

describe('evaluateTextContrast (the assertion downstream repos call)', () => {
  const sample = (overrides: Partial<MatrixTextSample>): MatrixTextSample => ({
    key: 'p:0',
    text: 'body text',
    color: '#000000',
    background: '#ffffff',
    backgroundResolved: true,
    overImage: false,
    fontSizePx: 14,
    fontWeightNum: 400,
    rect: { x: 0, y: 0, w: 100, h: 20 },
    ...overrides,
  });

  it('passes black-on-white body text', () => {
    const result = evaluateTextContrast([sample({})]);
    expect(result.measured).toBe(1);
    expect(result.violations).toHaveLength(0);
  });

  it('fails low-contrast body text against the 4.5:1 AA floor', () => {
    const result = evaluateTextContrast([sample({ color: '#999999' })]);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].required).toBe(4.5);
  });

  it('keeps a just-below-AA text sample in the violations', () => {
    const result = evaluateTextContrast([sample({ color: '#77767c' })]);
    expect(result.measured).toBe(1);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].ratio).toBeGreaterThan(4.495);
    expect(result.violations[0].ratio).toBeLessThan(4.5);
  });

  it('holds large text (>=24px, or >=18.66px bold) to the 3:1 floor instead', () => {
    // #949494 on white is ~3.5:1 — fails body text, clears large text.
    const failing = evaluateTextContrast([sample({ color: '#949494' })]);
    expect(failing.violations).toHaveLength(1);
    const heading = evaluateTextContrast([sample({ color: '#949494', fontSizePx: 24 })]);
    expect(heading.violations).toHaveLength(0);
    const boldLead = evaluateTextContrast([sample({ color: '#949494', fontSizePx: 19, fontWeightNum: 700 })]);
    expect(boldLead.violations).toHaveLength(0);
  });

  it('counts unresolved backdrops instead of silently dropping them', () => {
    const result = evaluateTextContrast([sample({ backgroundResolved: false })]);
    expect(result.measured).toBe(0);
    expect(result.unmeasurable).toBe(1);
  });

  it('fails the old storefront accent-on-white pair (1.17:1) that lived in shc contrast.spec.ts', () => {
    // rgb(238,236,249) on white — the pair the SHC spec measured at 1.17:1
    // from accent.ts's then-lightPalette[0]. Re-introducing that wash as
    // body ink must fail the theme assertion, not a consumer-local spec.
    const result = evaluateTextContrast([sample({ color: '#eeecf9', background: '#ffffff' })]);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].ratio).toBeLessThan(2);
    expect(result.violations[0].required).toBe(4.5);
  });

  it('counts unparseable colours as unmeasurable (measureContrast throws, never skips silently)', () => {
    const result = evaluateTextContrast([sample({ color: 'potato' })]);
    expect(result.measured).toBe(0);
    expect(result.unmeasurable).toBe(1);
    expect(result.violations).toHaveLength(0);
  });
});

describe('captureMatrixSnapshot keys survive the theme axis', () => {
  /**
   * The measured artefact this locks down. Tamagui's `<Theme>` emits a
   * boxless `display: contents` passthrough when the requested theme is
   * already the active one and a REAL theme host when it differs, so the
   * wrapper count is a function of the colour global. Keying on it made
   * every coloured cell of dogfood--settings report `+N/-M elements` with
   * ZERO moves: 158 nodes at the default colour, 151 with `color:blue`, 142
   * with `color:gray`, against 130 in every cell once the boxless wrappers
   * are hoisted through.
   */
  function mount(html: string): void {
    document.body.innerHTML = `<div id="mpo-matrix-root">${html}</div>`;
  }

  const card = '<div class="card"><span class="label">Name</span></div>';

  it('hoists through a display:contents wrapper so the key set is identical', () => {
    mount(card);
    const bare = captureMatrixSnapshot();
    mount(`<span style="display: contents">${card}</span>`);
    const wrapped = captureMatrixSnapshot();

    expect(bare.geometry.map((g) => g.key)).toEqual(wrapped.geometry.map((g) => g.key));
    const diff = diffGeometry(bare, wrapped);
    expect(diff.addedKeys).toEqual([]);
    expect(diff.removedKeys).toEqual([]);
  });

  it('stays stable when the wrapper count differs the way the colour axis makes it differ', () => {
    mount(`<span style="display: contents"><span style="display: contents">${card}</span></span>`);
    const twoWrappers = captureMatrixSnapshot();
    mount(card);
    const noWrapper = captureMatrixSnapshot();
    expect(diffGeometry(noWrapper, twoWrappers).identical).toBe(true);
  });

  it('still counts a real boxed wrapper as structural drift', () => {
    mount(card);
    const bare = captureMatrixSnapshot();
    mount(`<span style="display: block">${card}</span>`);
    const boxed = captureMatrixSnapshot();
    const diff = diffGeometry(bare, boxed);
    expect(diff.identical).toBe(false);
    expect(diff.addedKeys.length + diff.removedKeys.length).toBeGreaterThan(0);
  });

  it('reports an empty story root as not rendered', () => {
    document.body.innerHTML = '<div id="mpo-matrix-root"></div>';
    expect(captureMatrixSnapshot().storyRendered).toBe(false);
  });
});

describe('icon contrast keeps unsupported conveying paint unverified', () => {
  const sample = (overrides: Partial<MatrixIconSample> = {}): MatrixIconSample => ({
    key: 'button:0/svg:0',
    context: 'Open',
    status: 'conveying',
    paint: '#ffffff',
    background: '#111111',
    backgroundResolved: true,
    overImage: false,
    shapeCount: 1,
    distinctPaints: 1,
    paintKinds: ['fill'],
    rect: { x: 0, y: 0, w: 24, h: 24 },
    ...overrides,
  });

  it('holds real glyph paint to exactly 3:1 regardless of text rules', () => {
    expect(evaluateIconContrast([sample()]).ok).toBe(true);
    const result = evaluateIconContrast([sample({ paint: '#222222' })]);
    expect(result.ok).toBe(false);
    expect(result.measured).toBe(1);
    expect(result.violations[0].required).toBe(3);
    expect(result.violations[0].context).toBe('Open');
  });

  it('keeps a just-below-3 icon sample in the violations', () => {
    const result = evaluateIconContrast([sample({ paint: '#000000', background: '#595959' })]);
    expect(result.ok).toBe(false);
    expect(result.measured).toBe(1);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].ratio).toBeGreaterThan(2.995);
    expect(result.violations[0].ratio).toBeLessThan(3);
  });

  it.each<IconUnmeasurableReason>([
    'unresolved-backdrop',
    'masked-or-filtered',
    'use-indirection',
    'unsupported-paint',
    'unsupported-compositing',
    'multicolor',
    'no-paint',
  ])('does not pass a candidate with %s', (reason) => {
    const result = evaluateIconContrast([sample({ unmeasurable: reason })]);
    expect(result.ok).toBe(false);
    expect(result.measured).toBe(0);
    expect(result.candidates).toBe(1);
    expect(result.unverified).toEqual([{ key: 'button:0/svg:0', context: 'Open', reason }]);
  });

  it('accounts for every candidate and exclusion, including invalid color', () => {
    const result = evaluateIconContrast([
      sample(),
      sample({ paint: 'not-a-color' }),
      sample({ status: 'disabled-control' }),
      sample({ status: 'decorative-standalone' }),
      sample({ status: 'hidden' }),
    ]);
    expect(result.candidates).toBe(result.measured + result.unverified.length);
    expect(result.candidates + result.excludedDisabled + result.excludedDecorative + result.excludedHidden).toBe(5);
    expect(result.ok).toBe(false);
    expect(evaluateIconContrast([]).ok).toBe(true);
  });

  it('names a replacement icon failure even when total findings stay equal', () => {
    const baselineIcons = evaluateIconContrast([sample({ context: 'Old', paint: '#222222' })]);
    const icons = evaluateIconContrast([sample({ context: 'New', paint: '#222222' })]);
    const result = evaluateNoBreakage({
      storyRendered: true,
      offScaleViolations: 0,
      baselineOffScaleViolations: 0,
      contrast: { measured: 1, unmeasurable: 0, violations: [] },
      baselineContrastViolations: 0,
      icons,
      baselineIcons,
    });
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain('New');
    expect(result.failures[0]).not.toContain('Old');
    const sameDebt = evaluateNoBreakage({
      storyRendered: true,
      offScaleViolations: 0,
      baselineOffScaleViolations: 0,
      contrast: { measured: 1, unmeasurable: 0, violations: [] },
      baselineContrastViolations: 0,
      icons: baselineIcons,
      baselineIcons,
    });
    expect(sameDebt.ok).toBe(true); // Attribution only. Absolute icons.ok still fails.
    expect(baselineIcons.ok).toBe(false);
  });

  it('preserves legacy text-only calls but rejects an incomplete icon pair', () => {
    const textOnly = {
      storyRendered: true,
      offScaleViolations: 0,
      baselineOffScaleViolations: 0,
      contrast: { measured: 1, unmeasurable: 0, violations: [] },
      baselineContrastViolations: 0,
    };
    expect(evaluateNoBreakage(textOnly).ok).toBe(true);
    expect(evaluateNoBreakage({ ...textOnly, icons: cleanIcons }).ok).toBe(false);
    expect(evaluateNoBreakage({ ...textOnly, baselineIcons: cleanIcons }).ok).toBe(false);
  });
});

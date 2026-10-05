import { describe, expect, it } from 'vitest';

import {
  aaTextContrastRatio,
  assertContrast,
  contrastRatio,
  findReadableStep,
  holdInkFloor,
  measureContrast,
  minContrastRatio,
  normalizeColorScale,
  normalizeToHex,
  relativeLuminance,
  resolveThemeContrast,
  $color,
  semanticGroups,
  type ContrastPair,
} from './colorRules';
import { createThemesBuilder } from './createThemes';
import { defaultAccentTheme } from './defaults/accent';
import { defaultBaseTheme } from './defaults/base';
import { defaultBuilderOptions } from './defaults/builderOptions';

describe('normalizeToHex', () => {
  it('normalizes "white" to #ffffff', () => {
    expect(normalizeToHex('white')).toBe('#ffffff');
  });

  it('normalizes "black" to #000000', () => {
    expect(normalizeToHex('black')).toBe('#000000');
  });

  it('normalizes shorthand hex #fff', () => {
    expect(normalizeToHex('#fff')).toBe('#ffffff');
  });

  it('normalizes shorthand hex #abc', () => {
    expect(normalizeToHex('#abc')).toBe('#aabbcc');
  });

  it('passes through 6-digit hex', () => {
    expect(normalizeToHex('#1a2b3c')).toBe('#1a2b3c');
  });

  it('handles #000 shorthand', () => {
    expect(normalizeToHex('#000')).toBe('#000000');
  });

  it('handles #FFF case-insensitive', () => {
    expect(normalizeToHex('#FFF')).toBe('#ffffff');
  });

  it('normalizes HSL values', () => {
    const result = normalizeToHex('hsl(0, 100%, 50%)');
    expect(result).toBe('#ff0000');
  });

  it('normalizes HSL blue', () => {
    const result = normalizeToHex('hsl(240, 100%, 50%)');
    expect(result).toBe('#0000ff');
  });

  it('normalizes HSL green', () => {
    const result = normalizeToHex('hsl(120, 100%, 50%)');
    expect(result).toBe('#00ff00');
  });

  it('returns null for unrecognized color strings', () => {
    expect(normalizeToHex('rgb(255, 0, 0)')).toBeNull();
    expect(normalizeToHex('transparent')).toBeNull();
    expect(normalizeToHex('potato')).toBeNull();
  });

  it('handles whitespace', () => {
    expect(normalizeToHex('  #abc  ')).toBe('#aabbcc');
  });
});

describe('relativeLuminance', () => {
  it('returns 1 for white', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 4);
  });

  it('returns 0 for black', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 4);
  });

  it('returns intermediate value for mid-gray', () => {
    const lum = relativeLuminance('#808080');
    expect(lum).toBeGreaterThan(0.1);
    expect(lum).toBeLessThan(0.5);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black vs white', () => {
    const lBlack = relativeLuminance('#000000');
    const lWhite = relativeLuminance('#ffffff');
    expect(contrastRatio(lBlack, lWhite)).toBeCloseTo(21, 0);
  });

  it('returns 1 for identical luminances', () => {
    const lum = relativeLuminance('#808080');
    expect(contrastRatio(lum, lum)).toBeCloseTo(1, 4);
  });

  it("is commutative (order doesn't matter)", () => {
    const l1 = relativeLuminance('#ff0000');
    const l2 = relativeLuminance('#0000ff');
    expect(contrastRatio(l1, l2)).toBeCloseTo(contrastRatio(l2, l1), 4);
  });

  it('is always >= 1', () => {
    const l1 = relativeLuminance('#123456');
    const l2 = relativeLuminance('#654321');
    expect(contrastRatio(l1, l2)).toBeGreaterThanOrEqual(1);
  });
});

describe('findReadableStep', () => {
  const lightScale = [
    '#fafafa',
    '#f5f5f5',
    '#eeeeee',
    '#e0e0e0',
    '#bdbdbd',
    '#9e9e9e',
    '#757575',
    '#616161',
    '#424242',
    '#333333',
    '#212121',
    '#111111',
  ];

  it('returns startStep if it already meets contrast', () => {
    const step = findReadableStep(lightScale, 1, 12, 1);
    expect(step).toBe(12);
  });

  it('searches in preferred direction when startStep is too low contrast', () => {
    const step = findReadableStep(lightScale, 1, 3, 1);
    expect(step).toBeGreaterThan(3);
  });

  it('falls back to highest-contrast step if nothing meets threshold', () => {
    const flatScale = Array(12).fill('#808080');
    const step = findReadableStep(flatScale, 1, 6, 1);
    expect(step).toBe(1);
  });
});

describe('normalizeColorScale', () => {
  it('normalizes a valid 12-color hex scale', () => {
    const input = Array(12).fill('#abc');
    const result = normalizeColorScale(input);
    expect(result).toHaveLength(12);
    expect(result![0]).toBe('#aabbcc');
  });

  it('returns null for wrong length', () => {
    expect(normalizeColorScale(['#000', '#fff'])).toBeNull();
  });

  it('returns null if any color fails to parse', () => {
    const input = Array(12).fill('#abc');
    input[5] = 'not-a-color';
    expect(normalizeColorScale(input)).toBeNull();
  });

  it('normalizes mixed formats', () => {
    const input = ['white', '#000', '#112233', '#abc', 'black', '#fff', '#123', '#456', '#789', '#aaa', '#bbb', '#ccc'];
    const result = normalizeColorScale(input);
    expect(result).not.toBeNull();
    expect(result![0]).toBe('#ffffff');
    expect(result![1]).toBe('#000000');
  });
});

describe('$color', () => {
  it('returns $color{step} token string', () => {
    expect($color(1)).toBe('$color1');
    expect($color(12)).toBe('$color12');
    expect($color(5)).toBe('$color5');
  });
});

describe('semanticGroups', () => {
  it('has 5 groups covering steps 1-12', () => {
    expect(semanticGroups).toHaveLength(5);
    expect(semanticGroups[0].from).toBe(1);
    expect(semanticGroups[semanticGroups.length - 1].to).toBe(12);
  });
});

describe('measureContrast', () => {
  it('reports 21:1 for black on white and passes the AA floor', () => {
    const report = measureContrast({ foreground: '#000000', background: '#ffffff' });
    expect(report).toMatchObject({
      foreground: '#000000',
      background: '#ffffff',
      ratio: 21,
      floor: aaTextContrastRatio,
      pass: true,
    });
  });

  it("defaults the label to 'foreground on background'", () => {
    expect(measureContrast({ foreground: 'black', background: 'white' }).label).toBe('black on white');
  });

  it('keeps a custom label and normalizes named/shorthand colors', () => {
    const report = measureContrast({
      foreground: 'black',
      background: '#fff',
      label: 'ink on paper',
    });
    expect(report.label).toBe('ink on paper');
    expect(report.foreground).toBe('#000000');
    expect(report.background).toBe('#ffffff');
  });

  it('fails the dark accent toast pill (1.94:1)', () => {
    const report = measureContrast({
      foreground: '#46349d',
      background: '#161519',
      label: 'MPO-48 dark accent toast action',
    });
    expect(report.ratio).toBeCloseTo(1.94, 2);
    expect(report.floor).toBe(aaTextContrastRatio);
    expect(report.pass).toBe(false);
  });

  it.each([
    { foreground: '#000000', background: '#595959', floor: 3 },
    { foreground: '#77767c', background: '#ffffff', floor: 4.5 },
  ])('does not round a below-$floor pair into a pass', (pair) => {
    const report = measureContrast(pair);
    expect(report.ratio).toBeGreaterThan(pair.floor - 0.005);
    expect(report.ratio).toBeLessThan(pair.floor);
    expect(report.pass).toBe(false);
    expect(() => assertContrast(pair)).toThrow(/contrast floor missed/);
  });

  it('passes the exact measured floor and fails a higher floor', () => {
    const pair = { foreground: '#77767c', background: '#ffffff' };
    const floor = contrastRatio(relativeLuminance(pair.foreground), relativeLuminance(pair.background));
    expect(measureContrast({ ...pair, floor }).pass).toBe(true);
    expect(measureContrast({ ...pair, floor: floor - 0.00001 }).pass).toBe(true);
    expect(measureContrast({ ...pair, floor: floor + 0.00001 }).pass).toBe(false);
  });

  it('uses the actual ratio for the verdict', () => {
    // #808080 on white is 3.9489…, reported 3.95 — pass at 3, miss at 4.5.
    const at3 = measureContrast({
      foreground: '#808080',
      background: '#ffffff',
      floor: minContrastRatio,
    });
    const atAa = measureContrast({ foreground: '#808080', background: '#ffffff' });
    expect(at3.ratio).toBeCloseTo(3.95, 2);
    expect(at3.pass).toBe(true);
    expect(atAa.ratio).toBeCloseTo(3.95, 2);
    expect(atAa.pass).toBe(false);
  });

  it('throws on an unparseable foreground — never a skip', () => {
    expect(() => measureContrast({ foreground: 'potato', background: '#ffffff' })).toThrow(
      /foreground is not an opaque color: potato/,
    );
  });

  it('throws on an alpha background — never a skip', () => {
    expect(() => measureContrast({ foreground: '#000000', background: 'hsla(0, 0%, 100%, 0.2)' })).toThrow(
      /background is not an opaque color/,
    );
  });
});

describe('assertContrast', () => {
  it('returns the reports when every pair clears its floor', () => {
    const reports = assertContrast({ foreground: 'black', background: 'white' });
    expect(reports).toHaveLength(1);
    expect(reports[0].pass).toBe(true);
    expect(reports[0].ratio).toBe(21);
  });

  it('throws ONE error naming every miss, not the first', () => {
    expect(() =>
      assertContrast([
        { foreground: 'black', background: 'white', label: 'ok' },
        { foreground: '#46349d', background: '#161519', label: 'toast pill' },
        { foreground: '#808080', background: '#ffffff', label: 'gray' },
      ]),
    ).toThrow(
      /contrast floor missed \(2 of 3 pairs\):[\s\S]*toast pill: #46349d on #161519 = 1\.937[0-9]+:1[\s\S]*gray: #808080 on #ffffff = 3\.949[0-9]+:1/,
    );
  });
});

describe('resolveThemeContrast', () => {
  it('addresses a pair by theme name and keys', () => {
    expect(
      resolveThemeContrast(
        { light: { color: '#242226', background: '#ffffff' } },
        { theme: 'light', foreground: 'color', background: 'background' },
      ),
    ).toEqual({
      foreground: '#242226',
      background: '#ffffff',
      floor: undefined,
      label: 'light: color on background',
    });
  });

  it('carries an optional floor through to the pair', () => {
    expect(
      resolveThemeContrast(
        { light: { color: '#fff', background: '#000' } },
        { theme: 'light', foreground: 'color', background: 'background', floor: minContrastRatio },
      ).floor,
    ).toBe(minContrastRatio);
  });

  it('throws on a missing theme rather than skipping', () => {
    expect(() => resolveThemeContrast({}, { theme: 'nope', foreground: 'color', background: 'background' })).toThrow(
      'no such theme: nope',
    );
  });

  it('throws on a missing key rather than skipping', () => {
    expect(() =>
      resolveThemeContrast(
        { light: { color: '#000' } },
        { theme: 'light', foreground: 'color', background: 'background' },
      ),
    ).toThrow('light has no background');
  });
});

describe('contrast floor on built themes', () => {
  const themes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

  it('base text tiers clear AA on page surfaces in both schemes', () => {
    const pairs: ContrastPair[] = [];
    for (const scheme of ['light', 'dark'] as const) {
      for (const foreground of ['color', 'color11', 'color12']) {
        for (const background of ['background', 'color1', 'color2']) {
          pairs.push(resolveThemeContrast(themes, { theme: scheme, foreground, background }));
        }
      }
    }
    const reports = assertContrast(pairs);
    expect(reports.every((report) => report.pass)).toBe(true);
    expect(reports).toHaveLength(18);
  });

  it('accent Button color-on-background clears AA in both schemes', () => {
    const reports = assertContrast(
      (['light_accent_Button', 'dark_accent_Button'] as const).map((theme) =>
        resolveThemeContrast(themes, { theme, foreground: 'color', background: 'background' }),
      ),
    );
    expect(reports.map((report) => report.ratio)).toEqual([expect.closeTo(7.31, 2), expect.closeTo(7.61, 2)]);
  });

  it('a colour pair below the floor FAILS', () => {
    // The dark accent toast action pill, measured on the page ground.
    // Built: dark_accent.backgroundHover is #46349d; dark.background is #161519.
    expect(() =>
      assertContrast({
        foreground: themes.dark_accent.backgroundHover,
        background: themes.dark.background,
        label: 'MPO-48 dark accent toast action',
      }),
    ).toThrow(/MPO-48 dark accent toast action: #46349d on #161519 = 1\.937[0-9]+:1/);

    // The warning-on-its-own-color1 arm used to sit here as the second
    // negative control at 4.44:1. The `intentInkFloor` step closed it — the
    // same pair now measures 4.71:1 — so it can no longer prove the trip-wire
    // bites, and it moved to the passing assertion below rather than being
    // deleted. The toast pill above is still a live miss and still carries this test.
  });

  it('the warning ink now clears the floor on its own color1 too', () => {
    // The pair that used to be the negative control. The palette step was
    // computed against the BASE color2 (#f9f9fa, the strictest ground), and
    // this checks the intent's own surface came along with it. Was 4.44.
    const [report] = assertContrast(
      resolveThemeContrast(themes, {
        theme: 'light_warning',
        foreground: 'color11',
        background: 'color1',
      }),
    );
    expect(report.ratio).toBeCloseTo(4.66, 2);
  });

  it('current light_accent color-on-background clears the 3:1 non-text floor', () => {
    // Parent accent is 3.96:1 — under AA, over the large-text/UI floor. The
    // Button pair (asserted above) is the AA text contract; this pair is the
    // trip-wire's control so the old pale-lavender step is the thing that fails.
    const reports = assertContrast(
      resolveThemeContrast(themes, {
        theme: 'light_accent',
        foreground: 'color',
        background: 'background',
        floor: minContrastRatio,
      }),
    );
    expect(reports[0].ratio).toBeCloseTo(3.96, 2);
    expect(reports[0].pass).toBe(true);
  });

  it('re-introducing the old accent lightPalette[0] fails the test', () => {
    // The pale-lavender step that shipped a ~1.17:1 CTA. Swapping only [0]
    // leaves Button (palette[3]) alone and drops light_accent.background.
    const broken = createThemesBuilder(
      defaultBaseTheme,
      {
        ...defaultAccentTheme,
        lightPalette: ['hsla(250, 50%, 95%, 1)', ...defaultAccentTheme.lightPalette.slice(1)],
      },
      defaultBuilderOptions,
    ).themes();

    expect(() =>
      assertContrast(
        resolveThemeContrast(broken, {
          theme: 'light_accent',
          foreground: 'color',
          background: 'background',
          floor: minContrastRatio,
        }),
      ),
    ).toThrow(/light_accent: color on background: #f9f8fc on #eeecf9 = 1\.103[0-9]+:1/);
  });
});

describe('intent color11 on the base page surfaces', () => {
  const themes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

  const schemes = ['light', 'dark'] as const;
  const intents = ['error', 'warning', 'success'] as const;
  // The surfaces an outlined control's TRANSPARENT frame can sit on. The
  // intent sub-theme supplies the ink; the page behind it supplies the
  // ground, so the pair is cross-theme and `resolveThemeContrast` (one
  // theme) cannot address it.
  const surfaces = ['background', 'color1', 'color2'] as const;

  const intentInkPairs = schemes.flatMap((scheme) =>
    intents.flatMap((intent) =>
      surfaces.map((surface) => ({
        foreground: themes[`${scheme}_${intent}`].color11,
        background: themes[scheme][surface],
        label: `${scheme}_${intent}: color11 on ${scheme}.${surface}`,
      })),
    ),
  );

  /**
   * The outlined intent label was measured on the gallery harness ground
   * and recorded warning 4.34:1 and success 4.48:1. That ground is the BASE
   * theme's `color2` (#f9f9fa) — NOT `background`/`color1`, which are both
   * #ffffff and where the same two pairs cleared the floor even unfixed. The
   * miss was therefore surface-specific: an outlined warning or success Button
   * only went unreadable once it sat on a color2 surface (a card, a striped
   * row, the gallery ground). Measuring against the plain page is exactly how
   * a check reports a pass on a control that is failing.
   *
   * Both are CLOSED by the `intentInkFloor` step in `createThemes.ts`, which
   * darkens light `yellow11` and `green11` to the nearest hue-holding value
   * that clears the floor on `color2`. The exemption table that used to stand
   * here retired itself exactly as designed: the step moved, its pinned ratios
   * stopped matching, and the entries had to come out. There is now no
   * exemption to rot.
   */
  it('sweeps every intent x base surface x scheme — 18 pairs, none dropped', () => {
    expect(intentInkPairs).toHaveLength(18);
  });

  it('clears AA on every intent x base surface x scheme pair, with no exemptions', () => {
    const misses = intentInkPairs
      .map(measureContrast)
      .filter((report) => !report.pass)
      .map((report) => [report.label, report.ratio] as const);
    expect(Object.fromEntries(misses)).toEqual({});
  });

  it('pins the two warning/success stops on color2, the ground they used to fail', () => {
    // The regression guard proper: color2 is the STRICTEST base surface, so a
    // future palette move that quietly re-lightens either stop lands here
    // first. Was 4.34 / 4.48 against a 4.5 floor.
    const reports = assertContrast(
      (['warning', 'success'] as const).map((intent) => ({
        foreground: themes[`light_${intent}`].color11,
        background: themes.light.color2,
        label: `light_${intent}: color11 on light.color2`,
      })),
    );
    expect(reports.map((report) => report.ratio)).toEqual([expect.closeTo(4.56, 2), expect.closeTo(4.55, 2)]);
  });

  it('the same warning/success ink still clears the floor on background and color1', () => {
    // Locks the surface-specificity so a future change cannot be signed off by
    // re-measuring against the white page. Was 4.57 / 4.72.
    const reports = assertContrast(
      (['warning', 'success'] as const).flatMap((intent) =>
        (['background', 'color1'] as const).map((surface) => ({
          foreground: themes[`light_${intent}`].color11,
          background: themes.light[surface],
          label: `light_${intent}: color11 on light.${surface}`,
        })),
      ),
    );
    expect(reports.map((report) => report.ratio)).toEqual([
      expect.closeTo(4.8, 2),
      expect.closeTo(4.8, 2),
      expect.closeTo(4.79, 2),
      expect.closeTo(4.79, 2),
    ]);
  });
});

describe('holdInkFloor', () => {
  const onFill = (ink: string, fill: string) =>
    contrastRatio(relativeLuminance(normalizeToHex(ink)!), relativeLuminance(normalizeToHex(fill)!));

  it('keeps an ink that already clears the floor', () => {
    expect(holdInkFloor('#6d5bc8', '#f0eff1')).toBe('#f0eff1');
  });

  it('hands a literal bar the pole when both dark anchors miss (#cc4e00: 4.03 / 3.93)', () => {
    const ink = holdInkFloor('#cc4e00', '#161519');
    expect(ink).toBe('#000000');
    expect(onFill(ink, '#cc4e00')).toBeGreaterThanOrEqual(aaTextContrastRatio);
  });

  it('hands a dark step-8 chip the white pole over its step-12 ink (3.88:1)', () => {
    const ink = holdInkFloor('#2870bd', '#c2e6ff');
    expect(ink).toBe('#ffffff');
    expect(onFill(ink, '#2870bd')).toBeGreaterThanOrEqual(aaTextContrastRatio);
  });

  it('returns the ink untouched when a colour cannot be parsed', () => {
    expect(holdInkFloor('var(--x)', '#161519')).toBe('#161519');
  });
});

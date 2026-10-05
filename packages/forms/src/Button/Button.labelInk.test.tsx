/**
 * @vitest-environment jsdom
 *
 * Outlined error/warning/success labels
 * re-anchor to `$color11` on the LABEL TEXT NODE. The harness passed this
 * defect for months by reading the frame (`color` inherits) while
 * SizableText re-resolved `$color` — the on-fill foreground (measured
 * ~1.03:1 on the page).
 *
 * jsdom cannot cascade Tamagui CSS, so the DOM arm reads the atomic
 * classes the text node emits (`_col-color11`, `_fow-400`). Contrast is
 * the theme-table arm: intent `$color11` against EVERY page surface the
 * house theme paints, in both schemes — `$background`/`$color1` (white)
 * and `$color2` (#f9f9fa, what the gallery boards are shot on).
 */

import {
  aaTextContrastRatio,
  createDefaultThemeConfig,
  createThemesBuilder,
  defaultAccentTheme,
  defaultBaseTheme,
  defaultBuilderOptions,
  measureContrast,
} from '@repo/theme';
import { render, cleanup, screen } from '@testing-library/react';
import { TamaguiProvider, YStack } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './index';

afterEach(cleanup);

const houseConfig = createDefaultThemeConfig();
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();

const INTENTS = ['error', 'warning', 'success'] as const;
const SCHEMES = ['light', 'dark'] as const;
/**
 * The house theme has THREE page surfaces and they are not interchangeable:
 * `$background` and `$color1` are pure white, `$color2` is #f9f9fa. Every
 * gallery board paints `$color2` (actionFeedbackMain.tsx board root), so a
 * contrast arm that only reads `$background` certifies on a surface the
 * boards never shoot — the same shape of hole as measuring the FRAME
 * instead of the text node. All three are measured here.
 */
const WHITE_PAGE_SURFACES = ['background', 'color1'] as const;

function houseRender(ui: React.ReactElement, theme: 'light' | 'dark' = 'light') {
  return render(
    <TamaguiProvider config={houseConfig.tamagui} defaultTheme={theme} disableInjectCSS>
      <YStack backgroundColor="$background">{ui}</YStack>
    </TamaguiProvider>,
  );
}

function labelNode(text: string): HTMLElement {
  return screen.getByText(text);
}

/**
 * Use the canonical unrounded measurement so a below-floor pair cannot
 * pass through display rounding.
 */
function pageRatio(ink: string, ground: string, label: string): number {
  return measureContrast({ foreground: ink, background: ground, label }).ratio;
}

describe('Button outlined intent label ink', () => {
  it.each(SCHEMES)('%s: outlined intent labels emit $color11 on the TEXT NODE, never the on-fill $color', (scheme) => {
    houseRender(
      <>
        {INTENTS.map((intent) => (
          <Button key={`o-${intent}`} outlined {...{ [intent]: true }}>
            {`Outlined-${intent}`}
          </Button>
        ))}
        {INTENTS.map((intent) => (
          <Button key={`s-${intent}`} {...{ [intent]: true }}>
            {`Solid-${intent}`}
          </Button>
        ))}
      </>,
      scheme,
    );

    for (const intent of INTENTS) {
      const outlined = labelNode(`Outlined-${intent}`);
      const solid = labelNode(`Solid-${intent}`);
      // TEXT NODE — not the frame. The frame already carried $color11
      // and hid this defect.
      expect(outlined.tagName).not.toBe('BUTTON');
      expect(outlined.className).toMatch(/_col-color11\b/);
      expect(outlined.className).not.toMatch(/_col-color\b/);
      expect(solid.className).toMatch(/_col-color\b/);
      expect(solid.className).not.toMatch(/_col-color11\b/);
    }
  });

  it.each(SCHEMES)('%s: label TEXT NODE weight is 400, never 500/600', (scheme) => {
    houseRender(
      <>
        <Button>Filled-label</Button>
        <Button outlined>Outlined-label</Button>
        <Button outlined error>
          Outlined-error-label
        </Button>
        <Button error>Solid-error-label</Button>
      </>,
      scheme,
    );

    for (const text of ['Filled-label', 'Outlined-label', 'Outlined-error-label', 'Solid-error-label']) {
      const node = labelNode(text);
      expect(node.className).toMatch(/_fow-400\b/);
      expect(node.className).not.toMatch(/_fow-500\b/);
      expect(node.className).not.toMatch(/_fow-600\b/);
    }
  });

  it('intent $color11 clears 4.5:1 on the white page surfaces in both schemes; on-fill $color never does', () => {
    for (const scheme of SCHEMES) {
      for (const intent of INTENTS) {
        const ink = houseThemes[`${scheme}_${intent}`].color11;
        for (const surface of WHITE_PAGE_SURFACES) {
          const ground = houseThemes[scheme][surface];
          const label = `${scheme}_${intent}.color11 ${ink} on ${scheme}.${surface} ${ground}`;
          expect(pageRatio(ink, ground, label), label).toBeGreaterThanOrEqual(aaTextContrastRatio);
        }

        const onFill = houseThemes[`${scheme}_${intent}_Button`].color;
        const ground = houseThemes[scheme].background;
        expect(
          pageRatio(onFill, ground, `${scheme}_${intent}_Button.color`),
          `${scheme}_${intent}_Button.color is the on-fill foreground`,
        ).toBeLessThan(2);
      }
    }
  });

  it('dark intent $color11 clears 4.5:1 on the $color2 page surface too', () => {
    for (const intent of INTENTS) {
      const ink = houseThemes[`dark_${intent}`].color11;
      const ground = houseThemes.dark.color2;
      const label = `dark_${intent}.color11 ${ink} on dark.color2 ${ground}`;
      expect(pageRatio(ink, ground, label), label).toBeGreaterThanOrEqual(aaTextContrastRatio);
    }
  });

  // CLOSED — the secondary finding, fixed by the palette step.
  //
  // Fixing the plumbing (the arm above) was necessary, not sufficient. On
  // $color2 — the surface every gallery board is shot on — light warning
  // and success $color11 sat UNDER mpo's own floor at 4.34 and 4.48, and
  // those were exactly the numbers button-anatomy printed for its CONTRACT
  // row. This block used to assert the miss, and said in as many words that
  // stepping the palette should break it rather than be re-baselined away.
  //
  // The palette stepped: `intentInkFloor` in theme/createThemes.ts darkens
  // light yellow-11 (#9e6c00 -> #996900) and green-11 (#218358 -> #1c8257)
  // by the smallest hue-holding amount that clears the floor here. So the
  // assertion is inverted rather than deleted — the ground and the exact
  // ratios stay pinned, because $color2 is the STRICTEST base surface and a
  // future re-lightening has to fail somewhere loud.
  it('light warning/success $color11 now clear 4.5:1 on the $color2 page surface', () => {
    const ground = houseThemes.light.color2;
    const measured = Object.fromEntries(
      INTENTS.map((intent): [string, number] => [
        intent,
        pageRatio(houseThemes[`light_${intent}`].color11, ground, `light_${intent}.color11 on light.color2`),
      ]),
    );
    const displayed = Object.fromEntries(
      Object.entries(measured).map(([intent, ratio]) => [intent, Math.round(ratio * 100) / 100]),
    );
    expect(displayed, `light.color2 is ${ground}`).toEqual({
      error: 4.95,
      warning: 4.56,
      success: 4.55,
    });
    for (const intent of INTENTS) {
      expect(measured[intent], `light_${intent} on light.color2`).toBeGreaterThanOrEqual(aaTextContrastRatio);
    }
  });
});

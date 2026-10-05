/**
 * @vitest-environment jsdom
 *
 * The seeded knob fuzz for the Button frame's radius, judged in
 * jsdom against the Button radius law (default,
 * outlined): honour at none/small/large/full, remap at medium to the
 * size-recipe radius. The combos come from a fixed seed, painted in both
 * schemes at $2/$3/$4/$6.
 */

import { renderWithProviders } from '@repo/test-utils';
import { type Knobs, Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { Theme } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './index';

afterEach(cleanup);

const STOP_PX = { none: 0, small: 5, medium: 9, large: 16, full: 50 } as const;
const RECIPE_RADIUS = { $2: 5, $3: 7, $4: 9, $6: 16 } as const;
const SCHEMES = ['light', 'dark'] as const;
const TOKENS = ['$2', '$3', '$4', '$6'] as const;

type Stop = keyof typeof STOP_PX;
type Token = keyof typeof RECIPE_RADIUS;
type Combo = Partial<Knobs> & { borderRadius: Stop };

const COMBOS: Combo[] = [
  {
    fillStyle: 'filled',
    borderRadius: 'none',
    borderWidth: 'large',
    elevation: 'none',
    space: 'medium',
    size: 'large',
    textAccent: 'high',
    headingFont: 'pixel',
    bodyFont: 'mono',
    fontWeight: 'regular',
    animation: 'lazy',
  },
  {
    fillStyle: 'filled',
    borderRadius: 'small',
    borderWidth: 'none',
    elevation: 'large',
    space: 'large',
    size: 'small',
    textAccent: 'low',
    headingFont: 'cursive',
    bodyFont: 'serif',
    fontWeight: 'bold',
    animation: 'snappy',
  },
  {
    fillStyle: 'outlined',
    borderRadius: 'full',
    borderWidth: 'none',
    elevation: 'medium',
    space: 'small',
    size: 'small',
    textAccent: 'medium',
    headingFont: 'condensed',
    bodyFont: 'handwriting',
    fontWeight: 'bold',
    animation: 'medium',
  },
  {
    fillStyle: 'outlined',
    borderRadius: 'medium',
    borderWidth: 'none',
    elevation: 'small',
    space: 'medium',
    size: 'large',
    textAccent: 'medium',
    headingFont: 'pixel',
    bodyFont: 'pixel',
    fontWeight: 'regular',
    animation: 'lazy',
  },
  {
    fillStyle: 'outlined',
    borderRadius: 'large',
    borderWidth: 'small',
    elevation: 'small',
    space: 'large',
    size: 'medium',
    textAccent: 'low',
    headingFont: 'slab',
    bodyFont: 'pixel',
    fontWeight: 'regular',
    animation: 'medium',
  },
];

function lawRadius(stop: Stop, token: Token): number {
  return stop === 'medium' ? RECIPE_RADIUS[token] : STOP_PX[stop];
}

const RADIUS_TOKEN_PX: Record<string, number> = {
  '0': 0,
  '2': 5,
  '3': 7,
  '4': 9,
  '5': 10,
  '6': 16,
  '12': 50,
};

function radiusPx(el: HTMLElement): number | null {
  let found: number | null = null;
  for (const c of String(el.className || '').split(/\s+/)) {
    const px = c.match(/^_btlr-(\d+)px$/);
    if (px) {
      found = Number(px[1]);
    }
    const tok = c.match(/^_btlr-t-radius-(\d+)$/);
    if (tok) {
      found = RADIUS_TOKEN_PX[tok[1]] ?? found;
    }
  }
  return found;
}

function paint(combo: Combo, scheme: (typeof SCHEMES)[number], token: Token): number | null {
  renderWithProviders(
    <Theme name={scheme}>
      <Preset overrides={combo}>
        <Button size={token} icon={<span>i</span>}>
          Restart
        </Button>
      </Preset>
    </Theme>,
  );
  const px = radiusPx(screen.getByRole('button'));
  cleanup();
  return px;
}

describe('Button frame radius: seeded fuzz against the Button radius law', () => {
  for (const [i, combo] of COMBOS.entries()) {
    const expected =
      combo.borderRadius === 'medium'
        ? 'the size-recipe radius 5/7/9/16'
        : `${STOP_PX[combo.borderRadius]}px at every size`;
    for (const scheme of SCHEMES) {
      it(`combo ${i + 1} ${scheme}: borderRadius ${combo.borderRadius} paints ${expected}`, () => {
        for (const token of TOKENS) {
          expect(paint(combo, scheme, token), `${token} ${scheme}`).toBe(lawRadius(combo.borderRadius, token));
        }
      });
    }
  }
});

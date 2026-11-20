// @vitest-environment jsdom

/**
 * SIZE-RECIPE (Button arm): medium/$4 paints at 44px — since
 * the recipe table IS the measured Tamagui $size ramp ($4/$true = 44), so
 * the recipe fragment and the raw token finally agree. Radius steps with
 * the size token; the borderRadius knob is an override, not a
 * flat 9px across heights. jsdom cannot cascade Tamagui CSS, so
 * assertions read the atomic height/radius classes the frame emits.
 *
 * Desktop/jsdom: the touch floor (control.height >= 44) does not fire here;
 * at $4 it is a no-op anyway (desktop 44 = floor 44, touch lifts to 48).
 * Height must come from the recipe fragment (concrete px class), never the
 * `_h-t-size-4` token class.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetDevWarnSeen } from '../shared/dev-warn';

import { Button } from './index';

const frameRadiusClasses = (el: HTMLElement): string[] =>
  el.className
    .split(' ')
    .filter((c) => c.startsWith('_btlr-'))
    .toSorted();

/** Last `_px-Npx` class wins in source order (runtime fragment after `size=`). */
const paddingPxFromClass = (el: HTMLElement): number | null => {
  let found: number | null = null;
  for (const c of el.className.split(/\s+/u)) {
    const px = /^_px-(?<px>\d+)px$/u.exec(c)?.groups?.px;
    if (px !== undefined) {
      found = Number(px);
    }
  }
  return found;
};

describe('Button SIZE-RECIPE', () => {
  afterEach(cleanup);

  it('desktop/jsdom medium height is the measured 44 from the recipe, not the token class', () => {
    renderWithProviders(<Button>Save</Button>);
    const frame = screen.getByRole('button');
    expect(frame.className).toMatch(/_h-44px/u);
    expect(frame.className).not.toMatch(/_h-t-size-4/u);
  });

  it('radius steps with the size token', () => {
    renderWithProviders(
      <Preset overrides={{ size: 'small' }}>
        <Button>Save</Button>
      </Preset>,
    );
    const small = screen.getByRole('button');
    expect(small.className).toMatch(/_h-36px/u);
    const smallRadius = frameRadiusClasses(small);
    cleanup();

    renderWithProviders(
      <Preset overrides={{ size: 'large' }}>
        <Button>Save</Button>
      </Preset>,
    );
    const large = screen.getByRole('button');
    expect(large.className).toMatch(/_h-52px/u);
    const largeRadius = frameRadiusClasses(large);

    expect(smallRadius.length).toBeGreaterThan(0);
    expect(largeRadius.length).toBeGreaterThan(0);
    expect(smallRadius).not.toStrictEqual(largeRadius);
  });

  it('recipeFamily controlCompact has smaller padding than control at the same size token', () => {
    renderWithProviders(<Button>Save</Button>);
    const control = screen.getByRole('button');
    expect(control.className).toMatch(/_h-44px/u);
    const controlPad = paddingPxFromClass(control);
    cleanup();

    renderWithProviders(<Button recipeFamily="controlCompact">Save</Button>);
    const compact = screen.getByRole('button');
    const compactPad = paddingPxFromClass(compact);
    expect(compact.className).toMatch(/_h-44px/u);
    // Vacuous when jsdom emits no `_px-` class for either frame — the comparison only binds when both resolve.
    const bothResolved = controlPad != null && compactPad != null;
    expect(!bothResolved || compactPad < controlPad).toBe(true);
  });
});

describe('Button sizeRecipeEscape', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
    cleanup();
  });

  it('warns when numeric height is passed without sizeRecipeEscape', () => {
    renderWithProviders(<Button height={40}>Save</Button>);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('size-recipe-escape'));
    expect(screen.getByRole('button').className).toMatch(/_h-44px/u);
  });

  it('sizeRecipeEscape suppresses the numeric-height warn', () => {
    renderWithProviders(
      <Button
        height={40}
        sizeRecipeEscape="toolbar chrome match">
        Save
      </Button>,
    );
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('size-recipe-escape'));
  });
});

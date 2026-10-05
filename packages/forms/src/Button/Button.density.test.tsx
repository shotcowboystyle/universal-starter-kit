/**
 * @vitest-environment jsdom
 *
 * The density knob and the `compact` PROP must land the
 * SAME padX. Height stays 44 at both stops — density moves space, not size.
 *
 * The internals come from the size recipe, so density picks
 * the recipe FAMILY (`control` -> `controlCompact`) and never subtracts a
 * hand-set delta. The delta drifted from the generated table at every token
 * but `$4`, and at `$2` it INVERTED — `max(8, 7 - 2)` painted a compact
 * Button 8px wider than the comfortable 7px one.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset, recipeFamilies } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button, buttonDensityFamily, resolveButtonSizeRecipe } from './index';

afterEach(cleanup);

const sizes = ['$2', '$3', '$4'] as const;

/** Last `_pl-Npx` / `_pr-Npx` class wins (paddingHorizontal expands to both). */
function paddingPxFromClass(el: HTMLElement): number | null {
  let found: number | null = null;
  for (const c of String(el.className || '').split(/\s+/)) {
    const m = c.match(/^_p[lr]-(\d+)px$/);
    if (m) {
      found = Number(m[1]);
    }
  }
  return found;
}

function gapPxFromClass(el: HTMLElement): number | null {
  for (const c of String(el.className || '').split(/\s+/)) {
    const m = c.match(/^_gap-(\d+)px$/);
    if (m) {
      return Number(m[1]);
    }
  }
  return null;
}

function renderProp(size: (typeof sizes)[number]) {
  renderWithProviders(
    <Button compact size={size} icon={<span>i</span>}>
      Save
    </Button>,
  );
  return screen.getByRole('button');
}

function renderKnob(size: (typeof sizes)[number]) {
  renderWithProviders(
    <Preset overrides={{ density: 'compact' }}>
      <Button size={size} icon={<span>i</span>}>
        Save
      </Button>
    </Preset>,
  );
  return screen.getByRole('button');
}

function renderComfortable(size: (typeof sizes)[number]) {
  renderWithProviders(
    <Button size={size} icon={<span>i</span>}>
      Save
    </Button>,
  );
  return screen.getByRole('button');
}

describe('Button density knob = compact PROP', () => {
  it('compact PROP and density:compact knob land the SAME padX', () => {
    const viaProp = renderProp('$4');
    const propPad = paddingPxFromClass(viaProp);
    expect(viaProp.getAttribute('data-mp-density')).toBe('compact');
    expect(propPad).toBe(16);
    cleanup();

    const viaKnob = renderKnob('$4');
    expect(viaKnob.getAttribute('data-mp-density')).toBe('compact');
    expect(paddingPxFromClass(viaKnob)).toBe(propPad);
    expect(paddingPxFromClass(viaKnob)).toBe(16);
  });

  it('both channels land the SAME padX at every size step, not just $4', () => {
    for (const size of sizes) {
      const viaProp = paddingPxFromClass(renderProp(size));
      cleanup();
      const viaKnob = paddingPxFromClass(renderKnob(size));
      cleanup();
      expect(viaKnob, `padX at ${size}`).toBe(viaProp);
    }
  });

  it('height stays 44 at comfortable and compact density stops', () => {
    const comfortable = renderComfortable('$4');
    expect(comfortable.getAttribute('data-mp-button-height')).toBe('44');
    expect(comfortable.className).toMatch(/_h-44px/);
    expect(paddingPxFromClass(comfortable)).toBe(18);
    cleanup();

    const viaKnob = renderKnob('$4');
    expect(viaKnob.getAttribute('data-mp-button-height')).toBe('44');
    expect(viaKnob.className).toMatch(/_h-44px/);
    cleanup();

    const viaProp = renderProp('$4');
    expect(viaProp.getAttribute('data-mp-button-height')).toBe('44');
    expect(viaProp.className).toMatch(/_h-44px/);
  });

  it('density never changes the painted height at any size step', () => {
    for (const size of sizes) {
      const relaxed = renderComfortable(size).getAttribute('data-mp-button-height');
      cleanup();
      const tight = renderKnob(size).getAttribute('data-mp-button-height');
      cleanup();
      expect(tight, `height at ${size}`).toBe(relaxed);
    }
  });
});

describe('Button density comes from the recipe family', () => {
  it('density picks the family, it does not subtract from the recipe', () => {
    expect(buttonDensityFamily('control', true)).toBe('controlCompact');
    expect(buttonDensityFamily('control', false)).toBe('control');
    // An explicit controlCompact consumer (Chip) does not tighten twice.
    expect(buttonDensityFamily('controlCompact', true)).toBe('controlCompact');
  });

  it('compact padX is the generated controlCompact table, at every size', () => {
    for (const size of sizes) {
      const expected = resolveButtonSizeRecipe(size, 'controlCompact').paddingHorizontal;
      const viaKnob = paddingPxFromClass(renderKnob(size));
      cleanup();
      expect(viaKnob, `padX at ${size}`).toBe(expected);
    }
  });

  it('compact is never WIDER than comfortable — the $2 inversion stays fixed', () => {
    for (const size of sizes) {
      const relaxed = paddingPxFromClass(renderComfortable(size)) ?? 0;
      cleanup();
      const tight = paddingPxFromClass(renderKnob(size)) ?? 0;
      cleanup();
      expect(tight, `padX at ${size}`).toBeLessThan(relaxed);
    }
  });

  it('the inner gap stays the recipe gap — gap == radius at both stops', () => {
    for (const size of sizes) {
      const radius = recipeFamilies.controlCompact.radii[size];
      const relaxed = gapPxFromClass(renderComfortable(size));
      cleanup();
      const tight = gapPxFromClass(renderKnob(size));
      cleanup();
      expect(tight, `gap at ${size}`).toBe(resolveButtonSizeRecipe(size, 'controlCompact').gap);
      expect(tight, `gap == radius at ${size}`).toBe(radius);
      expect(relaxed, `comfortable gap at ${size}`).toBe(resolveButtonSizeRecipe(size, 'control').gap);
    }
  });
});

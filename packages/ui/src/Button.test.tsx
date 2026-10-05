/**
 * House Button shadow (KNOB-TOTALITY, curated surface).
 *
 * The curated ./tamagui.ts used to re-export `Button` raw, so every
 * components-imported Button was knob-dead (9px radius survivors at
 * `borderRadius: none`). The bare
 * name now rides ./Button.tsx (thin prop-compat shim over the knob-correct
 * forms Button). This spec locks:
 *
 *  1. knob fragments reach the frame through the components export —
 *     radius none → 0 token / full → 12 token, elevation none → flat —
 *     for default + chromeless, while `circular` stays the consumer SHAPE
 *     eject (keeps its 100000px circle at `none`, owner ruling 2026-08-13);
 *  2. raw-tamagui prop-compat: `variant="outlined"` renders identically to
 *     the house `outlined` prop (pre-shadow consumers keep their look);
 *  3. pass-through sanity: consumer props still eject last, presses fire,
 *     and the Button.Text / Button.Icon statics stay available.
 *
 * happy-dom cannot cascade tamagui's class CSS, so assertions read the
 * atomic classes the knob emits (`_btlr-*` radius, `_bxsh-*` shadow,
 * `_h-t-size-*` height) — the Button.radiusKnob.test.tsx technique.
 */
import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Button as TamaguiButton } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

import * as pkg from './index';

afterEach(cleanup);

function frameRadiusClasses(): string[] {
  const frame = screen.getByRole('button');
  return String(frame.className || '')
    .split(' ')
    .filter((c) => c.startsWith('_btlr-'));
}

describe('components Button export identity', () => {
  it('the barrel serves the house shadow, not the raw tamagui primitive', () => {
    expect(pkg.Button).toBe(Button);
    expect(pkg.Button).not.toBe(TamaguiButton);
    expect(pkg.TamaguiButton).toBe(TamaguiButton);
  });

  it('keeps the Button.Text / Button.Icon statics', () => {
    expect(Button.Text).toBeDefined();
    expect(Button.Icon).toBeDefined();
  });
});

describe('components Button — borderRadius knob reaches the frame', () => {
  it('default squares at none and follows the scale to full', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(frameRadiusClasses()).toEqual(['_btlr-t-radius-0']);
    expect(screen.getByRole('button').getAttribute('data-radius-class')).toBeNull();
    cleanup();

    renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(frameRadiusClasses()).toEqual(['_btlr-t-radius-12']);
  });

  it('chromeless squares at none (chrome removed, knobs still tracked)', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Button chromeless>Save</Button>
      </Preset>,
    );
    expect(frameRadiusClasses()).toEqual(['_btlr-t-radius-0']);
  });

  it('circular stays the consumer shape eject: round even at none, no inline override', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Button circular icon={<span>x</span>} aria-label="favorite" />
      </Preset>,
    );
    const frame = screen.getByRole('button');
    expect(frameRadiusClasses()).toEqual(['_btlr-100000px']);
    expect(frame.style.borderRadius).toBe('');
    expect(frame.getAttribute('data-radius-class')).toBe('R-IDENTITY');
    expect(frame.getAttribute('data-radius-part')).toBe('circular Button');
  });

  it('consumer borderRadius prop wins last over the knob fragment', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Button borderRadius="$6">Save</Button>
      </Preset>,
    );
    expect(frameRadiusClasses()).toEqual(['_btlr-t-radius-6']);
  });
});

describe('components Button — elevation and size knobs reach the frame', () => {
  it('elevation none renders flat; large casts a shadow', () => {
    renderWithProviders(
      <Preset overrides={{ elevation: 'none' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(screen.getByRole('button').className).not.toMatch(/_bxsh-/);
    cleanup();

    renderWithProviders(
      <Preset overrides={{ elevation: 'large' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(screen.getByRole('button').className).toMatch(/_bxsh-/);
  });

  it('size knob drives the frame height', () => {
    // The generated size recipes resolve a control height to a concrete px
    // atom, not a `$size` token class — asserting `_h-t-size-N` tested the
    // pre-recipe emission shape, not the knob. Read the height back instead:
    // small/medium/large must be three distinct, ascending heights.
    const heightOf = () => {
      const atom = screen
        .getByRole('button')
        .className.split(' ')
        .find((c) => /^_h-\d+px$/.test(c));
      expect(atom).toBeDefined();
      return Number(atom!.replace(/^_h-|px$/g, ''));
    };

    const heights: number[] = [];
    for (const size of ['small', 'medium', 'large'] as const) {
      renderWithProviders(
        <Preset overrides={{ size }}>
          <Button>Save</Button>
        </Preset>,
      );
      heights.push(heightOf());
      cleanup();
    }
    expect(heights[0]).toBeLessThan(heights[1]);
    expect(heights[1]).toBeLessThan(heights[2]);
  });
});

describe('components Button — raw-tamagui prop-compat', () => {
  it('variant="outlined" renders the same frame as the house outlined prop', () => {
    renderWithProviders(<Button variant="outlined">Compat</Button>);
    const viaVariant = screen.getByRole('button').className;
    cleanup();

    renderWithProviders(<Button outlined>Compat</Button>);
    const viaHouse = screen.getByRole('button').className;
    expect(viaVariant).toBe(viaHouse);
  });

  it('an explicit outlined={false} beats variant (explicit house prop wins)', () => {
    renderWithProviders(
      <Button variant="outlined" outlined={false}>
        Compat
      </Button>,
    );
    const withEject = screen.getByRole('button').className;
    cleanup();

    renderWithProviders(<Button>Compat</Button>);
    expect(withEject).toBe(screen.getByRole('button').className);
  });

  it('presses fire through the shim', () => {
    const onPress = vi.fn();
    renderWithProviders(<Button onPress={onPress}>Go</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('testID and aria pass through to the frame', () => {
    renderWithProviders(
      <Button testID="shadow-btn" aria-label="shadow">
        Go
      </Button>,
    );
    const frame = screen.getByRole('button');
    expect(frame.getAttribute('data-testid')).toBe('shadow-btn');
    expect(frame.getAttribute('aria-label')).toBe('shadow');
  });
});

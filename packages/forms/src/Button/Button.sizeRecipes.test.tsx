/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button, buttonDensityFamily, buttonSizeRecipes, resolveButtonSizeRecipe } from './index';

afterEach(cleanup);

describe('Button size recipes', () => {
  it('medium is the measured 44 / 18 / 14 / 16 / 9 (tamagui.dev $4)', () => {
    // Generated from recipeFamilies.control: fontSize is the recipe's
    // px number (md 14), no longer a drifted font token ("$3" = 13).
    expect(buttonSizeRecipes.$4).toStrictEqual({
      height: 44,
      paddingHorizontal: 18,
      fontSize: 14,
      iconSize: 16,
      gap: 9,
    });
    expect(resolveButtonSizeRecipe('$true').height).toBe(44);
    expect(resolveButtonSizeRecipe('$3').height).toBe(36);
    expect(resolveButtonSizeRecipe('$5').height).toBe(52);
  });

  it('medium meets the 44 floor natively — no slop, no minHeight', () => {
    renderWithProviders(<Button>Save</Button>);
    const frame = screen.getByRole('button');
    expect(frame.dataset.mpButtonHeight).toBe('44');
    expect(frame.dataset.mpPressSlop).toBeNull();
    expect(frame.style.minHeight).not.toBe('44px');
  });

  it('sub-44 sizes restore the floor with slop, not minHeight', () => {
    renderWithProviders(<Button size="$2">Save</Button>);
    const frame = screen.getByRole('button');
    expect(frame.dataset.mpButtonHeight).toBe('28');
    expect(frame.dataset.mpPressSlop).toBe('8');
    expect(frame.style.minHeight).not.toBe('44px');
  });

  it('large paints 52 — already past the floor, no slop', () => {
    renderWithProviders(<Button size="$5">Save</Button>);
    const frame = screen.getByRole('button');
    expect(frame.dataset.mpButtonHeight).toBe('52');
    expect(frame.dataset.mpPressSlop).toBeNull();
  });
});

describe('Button density ≠ size', () => {
  it('compact tightens pad without shrinking recipe height', () => {
    // Density picks the FAMILY; it never subtracts from the recipe.
    expect(buttonDensityFamily('control', true)).toBe('controlCompact');
    expect(buttonDensityFamily('control', false)).toBe('control');
    expect(resolveButtonSizeRecipe('$4', 'controlCompact').paddingHorizontal).toBeLessThan(
      resolveButtonSizeRecipe('$4', 'control').paddingHorizontal,
    );
    expect(resolveButtonSizeRecipe('$4', 'controlCompact').height).toBe(
      resolveButtonSizeRecipe('$4', 'control').height,
    );
    renderWithProviders(
      <Button
        compact
        size="$4">
        Save
      </Button>,
    );
    const frame = screen.getByRole('button');
    expect(frame.dataset.mpButtonHeight).toBe('44');
    expect(frame.dataset.mpDensity).toBe('compact');
  });

  it('size large + compact density stays large chrome', () => {
    renderWithProviders(
      <Preset overrides={{ size: 'large' }}>
        <Button compact>Save</Button>
      </Preset>,
    );
    expect(screen.getByRole('button').dataset.mpButtonHeight).toBe('52');
  });
});

describe('Button nested scale', () => {
  it('paints nestedControl and does not grow circular chrome to 44', () => {
    renderWithProviders(
      <Button
        nested
        circular
        aria-label="day">
        12
      </Button>,
    );
    const frame = screen.getByRole('button');
    expect(frame.dataset.nestedPx).toBe('32');
    expect(frame.dataset.mpButtonHeight).toBe('32');
    expect(frame.dataset.mpPressSlop).toBe('6');
    expect(frame.getAttribute('style') ?? '').not.toMatch(/width:\s*44px/u);
  });

  it('pads a nested circle 0, so its label fits the 32px box', () => {
    renderWithProviders(
      <>
        <Button
          nested
          circular
          aria-label="day">
          12
        </Button>
        <Button nested>Nested</Button>
      </>,
    );
    const [circle, pill] = screen.getAllByRole('button');
    const circleAtoms = (circle.getAttribute('class') ?? '').split(/\s+/u);
    expect(circleAtoms).toStrictEqual(expect.arrayContaining(['_w-32px', '_h-32px', '_btlr-100000px']));
    expect(circleAtoms).toStrictEqual(expect.arrayContaining(['_pl-0px', '_pr-0px']));
    expect(circleAtoms).not.toContain('_pl-18px');
    expect((pill.getAttribute('class') ?? '').split(/\s+/u)).toContain('_pl-18px');
  });
});

describe('Button RING-ANATOMY + selected fill', () => {
  it('selected is fill (aria-pressed) not an extra outline', () => {
    renderWithProviders(
      <Button
        outlined
        selected>
        On
      </Button>,
    );
    const frame = screen.getByRole('button');
    expect(frame.getAttribute('aria-pressed')).toBe('true');
    expect(frame.dataset.mpSelected).toBe('true');
    expect(frame.style.outlineWidth || '').not.toMatch(/[1-9]/u);
  });

  it('unselected outlined does not carry aria-pressed', () => {
    renderWithProviders(<Button outlined>Off</Button>);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBeNull();
  });

  it('keyboard activation still fires on the whole frame', () => {
    const onPress = vi.fn();
    renderWithProviders(<Button onPress={onPress}>Save</Button>);
    const frame = screen.getByRole('button');
    fireEvent.keyDown(frame, { key: 'Enter' });
    expect(onPress).toHaveBeenCalledOnce();
  });
});

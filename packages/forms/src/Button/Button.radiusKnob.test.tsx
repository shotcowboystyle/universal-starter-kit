// @vitest-environment jsdom

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './index';

/**
 * KNOB-TOTALITY (Button arm): the borderRadius knob fragment must reach
 * the rendered frame — one radius flip restyles every default/outlined Button
 * — while `circular` stays an explicit consumer SHAPE eject that keeps its
 * circle even at `borderRadius: none` (owner ruling 2026-08-13, supersedes
 * the inline squaring), and consumer `{...props}` stay the last
 * word (STD-EJECT-LAST).
 *
 * jsdom's getComputedStyle cannot cascade Tamagui's class-based CSS, so the
 * assertions read the atomic border-radius/box-shadow/height classes the
 * knob emits (same technique as the Timeline SB-M-301 spec). `_btlr-*` is
 * the top-left radius atom: `t-radius-0` is the `none` token, `t-radius-12`
 * is `full`, and the tamagui `circular` variant renders a literal
 * `_btlr-100000px`.
 */

const frameRadiusClasses = (): string[] => {
  const frame = screen.getByRole('button');
  return frame.className.split(' ').filter((c) => c.startsWith('_btlr-'));
};

describe('Button KNOB-TOTALITY — borderRadius knob', () => {
  afterEach(cleanup);

  it('default variant squares at borderRadius none and follows the scale', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(frameRadiusClasses()).toStrictEqual(['_btlr-t-radius-0']);
    cleanup();

    renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(frameRadiusClasses()).toStrictEqual(['_btlr-t-radius-12']);
  });

  it('outlined variant squares at borderRadius none', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Button outlined>Save</Button>
      </Preset>,
    );
    expect(frameRadiusClasses()).toStrictEqual(['_btlr-t-radius-0']);
  });

  it('circular ignores the radius knob and keeps its circle at none', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Button
          circular
          icon={<span>x</span>}
          aria-label="Favorite"
        />
      </Preset>,
    );
    const frame = screen.getByRole('button');
    expect(frameRadiusClasses()).toStrictEqual(['_btlr-100000px']);
    // The old implementation squared circles with an inline style eject —
    // the shape eject must not be re-overridden by the knob channel.
    expect(frame.style.borderRadius).toBe('');
    // The circle is licensed by the spec registry, not inferred.
    expect(frame.dataset.radiusClass).toBe('R-IDENTITY');
    expect(frame.dataset.radiusPart).toBe('circular Button');
  });

  it('default frames do not declare identity (they square at none)', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Button>Save</Button>
      </Preset>,
    );
    const frame = screen.getByRole('button');
    expect(frame.dataset.radiusClass).toBeUndefined();
    expect(frame.dataset.radiusPart).toBeUndefined();
  });

  it('consumer borderRadius prop wins last over the knob fragment', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Button borderRadius="$6">Save</Button>
      </Preset>,
    );
    expect(frameRadiusClasses()).toStrictEqual(['_btlr-t-radius-6']);
  });
});

describe('Button KNOB-TOTALITY — size and elevation fragments', () => {
  afterEach(cleanup);

  it('size knob drives the recipe height (not the Tamagui token box)', () => {
    renderWithProviders(
      <Preset overrides={{ size: 'small' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(screen.getByRole('button').dataset.mpButtonHeight).toBe('36');
    cleanup();

    renderWithProviders(
      <Preset overrides={{ size: 'large' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(screen.getByRole('button').dataset.mpButtonHeight).toBe('52');
  });

  it('elevation knob reaches the frame (was dropped: styled(View) had no elevation variant)', () => {
    renderWithProviders(
      <Preset overrides={{ elevation: 'none' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(screen.getByRole('button').className).not.toMatch(/_bxsh-/u);
    cleanup();

    renderWithProviders(
      <Preset overrides={{ elevation: 'large' }}>
        <Button>Save</Button>
      </Preset>,
    );
    expect(screen.getByRole('button').className).toMatch(/_bxsh-/u);
  });
});

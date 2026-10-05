/**
 * @vitest-environment jsdom
 *
 * The borderWidth knob reaches an outlined Button. The frame's
 * `outlined` styled variant used to hard-set `borderWidth: 1`, which beat
 * `borderWidth={resolvedBorderWidth}` on Tamagui prop order and pinned every
 * outlined Button at 1px while a filled one walked 0 / 0.5 / 1 / 2. The
 * resolver owns the floor: `none` under `fillStyle: outlined`
 * is the 0.5 hairline, and `large` is 2 for filled and outlined alike, so the
 * two keep the box parity the frame's comment promises.
 *
 * jsdom cannot cascade Tamagui CSS — assertions read the atomic border-width
 * class the FRAME emits, the same idiom as Button.filledBorder.test.tsx.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './index';

afterEach(cleanup);

const STOPS = ['none', 'small', 'medium', 'large'] as const;

function widthAtoms(): string[] {
  return String(screen.getByRole('button').className || '')
    .split(/\s+/)
    .filter((c) => c.startsWith('_btw-'))
    .sort();
}

function renderAt(stop: (typeof STOPS)[number], outlined: boolean): string[] {
  renderWithProviders(
    <Preset overrides={{ fillStyle: outlined ? 'outlined' : 'filled', borderWidth: stop }}>
      <Button>Restart</Button>
    </Preset>,
  );
  const atoms = widthAtoms();
  cleanup();
  return atoms;
}

describe('Button borderWidth ladder', () => {
  it('outlined walks the ladder: hairline at none and small, 1 at medium, 2 at large', () => {
    expect(renderAt('none', true)).toEqual(['_btw-0--5px']);
    expect(renderAt('small', true)).toEqual(['_btw-0--5px']);
    expect(renderAt('medium', true)).toEqual(['_btw-1px']);
    expect(renderAt('large', true)).toEqual(['_btw-2px']);
  });

  it('outlined at none and at large no longer emit the same edge', () => {
    expect(renderAt('none', true)).not.toEqual(renderAt('large', true));
  });

  it('filled walks the same ladder, chromeless at none', () => {
    expect(renderAt('none', false)).toEqual(['_btw-0px']);
    expect(renderAt('small', false)).toEqual(['_btw-0--5px']);
    expect(renderAt('medium', false)).toEqual(['_btw-1px']);
    expect(renderAt('large', false)).toEqual(['_btw-2px']);
  });

  it('the outlined prop and a filled sibling share one width at every stop', () => {
    for (const stop of STOPS) {
      renderWithProviders(
        <Preset overrides={{ borderWidth: stop }}>
          <Button outlined>Save draft</Button>
        </Preset>,
      );
      const outlined = widthAtoms();
      cleanup();
      renderWithProviders(
        <Preset overrides={{ borderWidth: stop }}>
          <Button>Publish</Button>
        </Preset>,
      );
      const filled = widthAtoms();
      cleanup();
      expect(outlined, stop).toEqual(filled);
    }
  });
});

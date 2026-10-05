/**
 * The story-backed Chip (`Components/Chip`) spreads the resolver's
 * borderWidth as-is. The knob spec used to describe the frame as an ignore pinned
 * at 1, and the sweep measured 1 / 1 / 1 / 2 while a local `Math.max(…, 1)`
 * floor was in place; that floor has since been removed, so the real ladder is
 * the resolver's, and the box moves with it. This pins the declared edge at
 * every stop so the doc row cannot drift from the component again.
 *
 * Assertions read the atomic border-width class the FRAME emits.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Chip } from './index';

afterEach(cleanup);

const STOPS = ['none', 'small', 'medium', 'large'] as const;

function renderAt(stop: (typeof STOPS)[number], outlined = false): string[] {
  const result = renderWithProviders(
    <Preset overrides={{ fillStyle: outlined ? 'outlined' : 'filled', borderWidth: stop }}>
      <Chip variant="outlined" onPress={() => {}}>
        Fire
      </Chip>
    </Preset>,
  );
  const frame = result.container.querySelector('[data-chip]') as HTMLElement;
  const atoms = String(frame.className || '')
    .split(/\s+/)
    .filter((c) => c.startsWith('_btw-'))
    .sort();
  cleanup();
  return atoms;
}

describe('Chip borderWidth ladder', () => {
  it("the frame honours the resolver's edge: 0 / 0.5 / 1 / 2", () => {
    expect(renderAt('none')).toEqual(['_btw-0px']);
    expect(renderAt('small')).toEqual(['_btw-0--5px']);
    expect(renderAt('medium')).toEqual(['_btw-1px']);
    expect(renderAt('large')).toEqual(['_btw-2px']);
  });

  it('medium and large differ, so the chip box moves with the stop', () => {
    expect(renderAt('medium')).not.toEqual(renderAt('large'));
  });

  it("none under fillStyle:outlined is the resolver's hairline, not a local floor", () => {
    expect(renderAt('none', true)).toEqual(['_btw-0--5px']);
  });
});

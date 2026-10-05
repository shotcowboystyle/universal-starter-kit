/**
 * The pressable Chip body takes the press-slop channel on the
 * vertical axis only, pitch-limited so a wrapped chip row's target never
 * reaches the next row's. Rows wrap at `$2` = 7px, so each row may
 * reach 3px past its painted box; the channel's pseudo-element sits on the
 * padding box, so the outset carries the frame's border width on top.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Chip } from './index';

afterEach(cleanup);

type Stop = 'none' | 'small' | 'medium' | 'large';

function frameAt(borderWidth: Stop, props: { onPress?: () => void; disabled?: boolean } = { onPress: () => {} }) {
  const result = renderWithProviders(
    <Preset overrides={{ borderWidth }}>
      <Chip variant="outlined" {...props}>
        Fire
      </Chip>
    </Preset>,
  );
  return result.container.querySelector('[data-chip]') as HTMLElement;
}

describe('Chip pressable body slop', () => {
  it('reaches half the chip-row gap past the painted box, vertically only', () => {
    const frame = frameAt('none');
    expect(frame.getAttribute('role')).toBe('button');
    expect(frame.getAttribute('data-mp-press-slop')).toBe('3');
    expect(frame.getAttribute('data-mp-press-axis')).toBe('vertical');
  });

  it("adds the frame's border back, so the reach past the box is the same at every stop", () => {
    expect(frameAt('small').getAttribute('data-mp-press-slop')).toBe('4');
    expect(frameAt('medium').getAttribute('data-mp-press-slop')).toBe('4');
    expect(frameAt('large').getAttribute('data-mp-press-slop')).toBe('5');
  });

  it('a chip with no press handler has no target, so no slop', () => {
    const frame = frameAt('medium', {});
    expect(frame.getAttribute('role')).toBeNull();
    expect(frame.getAttribute('data-mp-press-slop')).toBeNull();
  });

  it('a disabled chip gates its target and drops the slop', () => {
    const frame = frameAt('medium', { onPress: () => {}, disabled: true });
    expect(frame.getAttribute('data-mp-press-slop')).toBeNull();
  });
});

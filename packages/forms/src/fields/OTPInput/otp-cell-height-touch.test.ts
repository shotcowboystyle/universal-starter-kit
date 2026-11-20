import { resolveRadiusClass } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import { getVariableValue } from 'tamagui';
import type { SizeTokens } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { getFieldHeight } from '../../shared/utils';

import { otpCellHeightPx } from './index';

/**
 * The touch arm of the CIRCULAR-AT-FULL radius check for the OTP cell, in its own file because the
 * surface probe is module-level state: `getFieldHeight` reads `isTouchSurface()`
 * on every call, and a desktop run cannot tell the painted token from the recipe
 * height (they are the same number there). Only on a touch surface do the two
 * ladders separate — 28/36/44/64 painted against 44/44/48/68 recipe — which is
 * where a resolver fed the wrong one hands the circle back to the engine clamp.
 */
vi.mock(import('@repo/theme'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isTouchSurface: () => true };
});

const tokens = ['$2', '$3', '$4', '$6'] as const satisfies readonly SizeTokens[];

describe('OTP cell geometry on a touch surface', () => {
  it('the two ladders really do separate, or this file proves nothing', () => {
    for (const token of tokens) {
      const painted = Number(getVariableValue(getSize(token)));
      expect(getFieldHeight(token), `recipe height @ ${token}`).not.toBe(painted);
    }
  });

  it('the cell resolves against the height it paints, not the recipe height', () => {
    for (const token of tokens) {
      const painted = Number(getVariableValue(getSize(token)));
      expect(otpCellHeightPx(token), `painted height @ ${token}`).toBe(painted);
      expect(
        resolveRadiusClass('CIRCULAR-AT-FULL', 'full', { heightPx: otpCellHeightPx(token) }),
        `full @ ${token}`,
      ).toBe(painted / 2);
    }
  });
});

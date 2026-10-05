import { describe, expect, it, vi } from 'vitest';

/**
 * The touch arm of the CIRCULAR-AT-FULL radius check for the OTP cell, in its own file because the
 * surface probe is module-level state: `getFieldHeight` reads `isTouchSurface()`
 * on every call, and a desktop run cannot tell the painted token from the recipe
 * height (they are the same number there). Only on a touch surface do the two
 * ladders separate — 28/36/44/64 painted against 44/44/48/68 recipe — which is
 * where a resolver fed the wrong one hands the circle back to the engine clamp.
 */
vi.mock('@repo/theme', async () => {
  const actual = await vi.importActual<typeof import('@repo/theme')>('@repo/theme');
  return { ...actual, isTouchSurface: () => true };
});

import { resolveRadiusClass } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import { getVariableValue, type SizeTokens } from 'tamagui';

import { getFieldHeight } from '../../shared/utils';

import { otpCellHeightPx } from './index';

const tokens = ['$2', '$3', '$4', '$6'] as const;

describe('OTP cell geometry on a touch surface', () => {
  it('the two ladders really do separate, or this file proves nothing', () => {
    for (const token of tokens) {
      const painted = getVariableValue(getSize(token as SizeTokens)) as number;
      expect(getFieldHeight(token as SizeTokens), `recipe height @ ${token}`).not.toBe(painted);
    }
  });

  it('the cell resolves against the height it paints, not the recipe height', () => {
    for (const token of tokens) {
      const painted = getVariableValue(getSize(token as SizeTokens)) as number;
      expect(otpCellHeightPx(token), `painted height @ ${token}`).toBe(painted);
      expect(
        resolveRadiusClass('CIRCULAR-AT-FULL', 'full', { heightPx: otpCellHeightPx(token) }),
        `full @ ${token}`,
      ).toBe(painted / 2);
    }
  });
});

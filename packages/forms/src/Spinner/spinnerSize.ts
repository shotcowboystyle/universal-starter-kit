import { getSize } from '@tamagui/get-token';
import type { SizeTokens } from 'tamagui';
import { getVariableValue } from 'tamagui';

export type SpinnerSize = 'small' | 'large';

export interface SpinnerProps {
  size?: SpinnerSize;
  color?: string;
  [key: string]: unknown;
}

/**
 * Map the Tamagui binary size prop onto the shared size-token scale.
 * Unspecified size follows the size knob (`knobProps.sizeToken`) so one
 * knob flip restyles the glyph. Explicit small/large stay the
 * button-safe aliases ($1 / $3) used across the catalog.
 */
export function spinnerSizeToken(size: SpinnerSize | undefined, sizeToken: string): SizeTokens {
  if (size === 'small') {
    return '$1';
  }
  if (size === 'large') {
    return '$3';
  }
  return sizeToken as SizeTokens;
}

export function spinnerSizePx(token: SizeTokens): number {
  return getVariableValue(getSize(token)) as number;
}

import { MIN_PRESS_TARGET } from '@repo/theme';

import { pressSlopProps } from './pressSlopProps';

/** Recipes own paint; this contract declares the remaining effective target. */
export function pickerTriggerContract(height: number) {
  const belowFloor = height < MIN_PRESS_TARGET;
  return {
    minWidth: MIN_PRESS_TARGET,
    'data-visual-height': String(height),
    'data-press-floor': belowFloor ? 'slop' : 'box',
    ...pressSlopProps(height, belowFloor, 'vertical'),
  } as const;
}

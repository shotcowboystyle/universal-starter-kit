import { type PropsWithChildren, createContext, useContext } from 'react';
import { Theme } from 'tamagui';

import { usePresetTints } from './PresetContext';

const TintDepthContext = createContext(0);

export interface TintProps extends PropsWithChildren {
  /** Extra offset beyond the normal +1 nesting increment. Default 0. */
  alt?: number;
  /** Disable tinting (renders children without a Theme wrapper). */
  disable?: boolean;
}

/**
 * Depth-based tint component. Each nesting level increments the depth
 * and selects a tint from the preset's tints array via
 * `tints[(depth - 1) % length]` so the first Tint is `tints[0]`.
 *
 * Applies a tint sub-theme based on nesting depth.
 */
export function Tint({ children, alt = 0, disable, ...props }: TintProps) {
  const parentDepth = useContext(TintDepthContext);
  const depth = parentDepth + 1 + alt;
  const tints = usePresetTints();
  const tint = tints.length > 0 ? tints[(depth - 1) % tints.length] : undefined;

  return (
    <TintDepthContext.Provider value={depth}>
      {disable || !tint ? (
        children
      ) : (
        <Theme name={tint} {...props}>
          {children}
        </Theme>
      )}
    </TintDepthContext.Provider>
  );
}

/**
 * Read the current tint depth from context.
 */
export function useTintDepth(): number {
  return useContext(TintDepthContext);
}

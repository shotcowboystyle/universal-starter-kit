import type { ReactNode } from 'react';

import { clampSurfaceDensity, clampSurfaceSize, normalizeSurfaceSize, SurfaceContext } from './surface-context';
import type { SurfaceDensity, SurfaceSizeIntent } from './surface-context';

/**
 * Declares size/density INTENT for a subtree. Nested Surfaces clamp step-down
 * only — never raw gap tokens. Accepts sm/md/lg aliases.
 */
export const Surface = ({
  size,
  density,
  children,
}: {
  size?: SurfaceSizeIntent;
  density?: SurfaceDensity;
  children?: ReactNode;
}) => {
  const parent = SurfaceContext.useStyledContext();
  const nextSize = clampSurfaceSize(size ? normalizeSurfaceSize(size) : 'unset', parent.size);
  const nextDensity = clampSurfaceDensity(density ?? 'unset', parent.density);
  return (
    <SurfaceContext.Provider
      size={nextSize}
      density={nextDensity}>
      {children}
    </SurfaceContext.Provider>
  );
};

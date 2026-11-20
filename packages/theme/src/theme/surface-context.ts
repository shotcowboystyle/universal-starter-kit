import { createStyledContext } from 'tamagui';

export type SurfaceSize = 'small' | 'medium' | 'large';
export type SurfaceSizeIntent = SurfaceSize | 'sm' | 'md' | 'lg';
export type SurfaceDensity = 'compact' | 'comfortable';
export interface SurfaceIntent {
  size: SurfaceSize | 'unset';
  density: SurfaceDensity | 'unset';
}

const SIZE_INTENT_ALIASES: Record<SurfaceSizeIntent, SurfaceSize> = {
  sm: 'small',
  small: 'small',
  md: 'medium',
  medium: 'medium',
  lg: 'large',
  large: 'large',
};

export const normalizeSurfaceSize = (size: SurfaceSizeIntent): SurfaceSize => SIZE_INTENT_ALIASES[size];

export const SurfaceContext = createStyledContext<SurfaceIntent>({
  size: 'unset',
  density: 'unset',
});

export const SURFACE_SIZE_RANK = { unset: 99, small: 0, medium: 1, large: 2 } as const;
export const SURFACE_DENSITY_RANK = { unset: 99, compact: 0, comfortable: 1 } as const;

/**
 * Nested surfaces/controls may inherit or go tighter (lower rank), never larger
 * than the parent. `unset` parent = no ceiling. `unset` requested = inherit.
 */
export const clampSurfaceSize = (
  requested: SurfaceSize | 'unset',
  parent: SurfaceSize | 'unset',
): SurfaceSize | 'unset' => {
  if (parent === 'unset') {
    return requested;
  }
  if (requested === 'unset') {
    return parent;
  }
  return SURFACE_SIZE_RANK[requested] <= SURFACE_SIZE_RANK[parent] ? requested : parent;
};

export const clampSurfaceDensity = (
  requested: SurfaceDensity | 'unset',
  parent: SurfaceDensity | 'unset',
): SurfaceDensity | 'unset' => {
  if (parent === 'unset') {
    return requested;
  }
  if (requested === 'unset') {
    return parent;
  }
  return SURFACE_DENSITY_RANK[requested] <= SURFACE_DENSITY_RANK[parent] ? requested : parent;
};

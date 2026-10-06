/**
 * Shared contract for the platform-split Geolocation map surface
 * (`GeolocationMap.tsx` web / `GeolocationMap.native.tsx`). Lives in its own
 * file (Video `types.ts` pattern) so the twins cannot drift apart.
 */
export interface GeolocationMapSurfaceProps {
  lat: number;
  lng: number;
  /**
   * Half-size of the visible viewport in degrees. Both platform surfaces
   * derive an equivalent tile zoom from it.
   */
  delta?: number;
  /** Minimum pixel height of the map surface (expanded view). */
  minHeight?: number;
  /** Accessible title of the surface. */
  title?: string;
  /**
   * Commits a picked coordinate (tap / long-press on native). The parent
   * routes this through the field's canonical onChange path.
   */
  onChange?: (lat: number, lng: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  /**
   * When false the surface has no value marker (empty field). Omitted /
   * true keeps the marker so platform twins and existing callers match.
   */
  hasValue?: boolean;
}

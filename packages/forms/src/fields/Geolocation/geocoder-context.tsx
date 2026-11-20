import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import type { Geocoder } from './geocoder';
import { formatPlace } from './geocoder';

const GeocoderContext = createContext<Geocoder | null>(null);

/**
 * Hands one geocoder to every Geolocation field below it, including fields a
 * registry or a table renders where the app cannot reach props. A field's own
 * `geocode` / `reverseGeocode` / `geocoder` props win, and `geocoder={null}`
 * opts a field out. Create the geocoder once (module scope or `useMemo`), not
 * per render.
 */
export const GeocoderProvider = ({ geocoder, children }: { geocoder: Geocoder | null; children?: ReactNode }) => (
  <GeocoderContext.Provider value={geocoder}>{children}</GeocoderContext.Provider>
);

export const useGeocoder = (): Geocoder | null => useContext(GeocoderContext);

/**
 * The provider's address for a pair, or null while it resolves, when no
 * provider is mounted, when nothing is near, or when the lookup fails. A
 * read-only face shows the pair until this answers.
 */
export const useReverseGeocodedLabel = (pair: { lat: number; lng: number } | null): string | null => {
  const geocoder = useGeocoder();
  const lat = pair?.lat;
  const lng = pair?.lng;
  const key = lat === undefined || lng === undefined ? null : `${lat},${lng}`;
  const [resolved, setResolved] = useState<{ key: string; label: string } | null>(null);
  useEffect(() => {
    let live = true;
    const lookup = async (active: Geocoder, point: { lat: number; lng: number }, pointKey: string) => {
      try {
        const result = await active.reverseGeocode(point);
        if (live) {
          setResolved(result ? { key: pointKey, label: formatPlace(result) } : null);
        }
      } catch {
        // Safe to continue: a failed lookup leaves the coordinate pair as the label.
        if (live) {
          setResolved(null);
        }
      }
    };
    if (geocoder && lat !== undefined && lng !== undefined && key !== null) {
      void lookup(geocoder, { lat, lng }, key);
    }
    return () => {
      live = false;
    };
  }, [geocoder, key, lat, lng]);
  return resolved && resolved.key === key ? resolved.label : null;
};

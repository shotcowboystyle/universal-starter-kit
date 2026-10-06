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
export function GeocoderProvider({ geocoder, children }: { geocoder: Geocoder | null; children?: ReactNode }) {
  return <GeocoderContext.Provider value={geocoder}>{children}</GeocoderContext.Provider>;
}

export function useGeocoder(): Geocoder | null {
  return useContext(GeocoderContext);
}

/**
 * The provider's address for a pair, or null while it resolves, when no
 * provider is mounted, when nothing is near, or when the lookup fails. A
 * read-only face shows the pair until this answers.
 */
export function useReverseGeocodedLabel(pair: { lat: number; lng: number } | null): string | null {
  const geocoder = useGeocoder();
  const lat = pair?.lat;
  const lng = pair?.lng;
  const key = lat === undefined || lng === undefined ? null : `${lat},${lng}`;
  const [resolved, setResolved] = useState<{ key: string; label: string } | null>(null);
  useEffect(() => {
    if (!geocoder || lat === undefined || lng === undefined || key === null) {
      return;
    }
    let live = true;
    geocoder.reverseGeocode({ lat, lng }).then(
      (result) => {
        if (live) {
          setResolved(result ? { key, label: formatPlace(result) } : null);
        }
      },
      () => {
        if (live) {
          setResolved(null);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [geocoder, key, lat, lng]);
  return resolved && resolved.key === key ? resolved.label : null;
}

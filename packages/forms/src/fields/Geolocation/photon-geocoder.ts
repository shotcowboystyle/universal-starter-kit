import { isFiniteNumber } from './geo-value';
import type { GeocodeResult, Geocoder } from './geocoder';
import { formatPlace } from './geocoder';

/**
 * Keyless geocoder over Photon (https://github.com/komoot/photon), the
 * OpenStreetMap geocoder built for search-as-you-type. Opt-in: the field never
 * constructs it. An app passes it to `GeocoderProvider` or the field's
 * `geocoder` prop.
 *
 * `baseUrl` defaults to komoot's public instance, which asks for fair use and
 * promises no availability. Production apps point `baseUrl` at their own
 * Photon or a proxy, read from runtime config so the endpoint can move
 * without a release.
 */
/** The slice of `fetch` the adapter needs, so a test double or a wrapped fetch fits. */
export type PhotonFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface PhotonGeocoderOptions {
  baseUrl?: string;
  /** Photon result language: `"default"` (local names), `"en"`, `"de"` or `"fr"`. */
  lang?: string;
  /** Forward results per query. */
  limit?: number;
  /** A request slower than this rejects, and the field shows its error state. */
  timeoutMs?: number;
  /** Cached queries and reverse lookups kept per geocoder. */
  cacheSize?: number;
  fetch?: PhotonFetch;
}

interface PhotonProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  district?: string;
  locality?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface PhotonFeature {
  geometry?: { type?: string; coordinates?: unknown[] };
  properties?: PhotonProperties;
}

const photonPublicUrl = 'https://photon.komoot.io';

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const streetLine = (props: PhotonProperties): string | undefined => {
  if (!hasText(props.street)) {
    return undefined;
  }
  return hasText(props.housenumber) ? `${props.street} ${props.housenumber}` : props.street;
};

const toLatLng = (coordinates: unknown[] | undefined): { lat: number; lng: number } | null => {
  if (!Array.isArray(coordinates)) {
    return null;
  }
  const [lng, lat] = coordinates;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return null;
  }
  return { lat, lng };
};

/** The address parts after the label, skipping blanks and anything the label already says. */
const descriptionParts = (props: PhotonProperties, street: string | undefined, label: string): string[] => {
  const seen = new Set([label]);
  const parts: string[] = [];
  for (const part of [
    hasText(props.name) ? street : undefined,
    props.district ?? props.locality,
    props.city ?? props.county,
    props.state,
    props.country,
  ]) {
    if (hasText(part) && !seen.has(part)) {
      seen.add(part);
      parts.push(part);
    }
  }
  return parts;
};

export const photonFeatureToResult = (feature: PhotonFeature): GeocodeResult | null => {
  const position = toLatLng(feature.geometry?.coordinates);
  if (position === null) {
    return null;
  }
  const props = feature.properties ?? {};
  const street = streetLine(props);
  const area = props.city ?? props.county ?? props.state ?? props.country;
  const label = props.name ?? street ?? area;
  if (!hasText(label)) {
    return null;
  }
  const parts = descriptionParts(props, street, label);
  return parts.length > 0 ? { ...position, label, description: parts.join(', ') } : { ...position, label };
};

const isPhotonFeature = (candidate: unknown): candidate is PhotonFeature => candidate instanceof Object;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JSON boundary: the response body is validated here before anything reads it
const toResults = (body: unknown): GeocodeResult[] => {
  const features = body instanceof Object && 'features' in body ? body.features : undefined;
  if (!Array.isArray(features)) {
    throw new TypeError('Photon returned no feature collection');
  }
  const candidates: readonly unknown[] = features;
  const seen = new Set<string>();
  const results: GeocodeResult[] = [];
  for (const candidate of candidates) {
    const result = isPhotonFeature(candidate) ? photonFeatureToResult(candidate) : null;
    const key = result === null ? null : formatPlace(result);
    if (result !== null && key !== null && !seen.has(key)) {
      seen.add(key);
      results.push(result);
    }
  }
  return results;
};

const trimTrailingSlashes = (url: string): string => {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') {
    end -= 1;
  }
  return url.slice(0, end);
};

const query = (params: Record<string, string | number | undefined>): string =>
  Object.entries(params)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

export const createPhotonGeocoder = (options: PhotonGeocoderOptions = {}): Geocoder => {
  const baseUrl = trimTrailingSlashes(options.baseUrl ?? photonPublicUrl);
  const { lang } = options;
  const limit = options.limit ?? 5;
  const timeoutMs = options.timeoutMs ?? 8000;
  const cacheSize = options.cacheSize ?? 100;
  const doFetch: PhotonFetch = options.fetch ?? (async (input, init) => await fetch(input, init));
  const cache = new Map<string, Promise<GeocodeResult[]>>();

  const request = async (url: string): Promise<GeocodeResult[]> => {
    const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
    const timer = controller
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : undefined;
    try {
      const response = await doFetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
      });
      if (!response.ok) {
        throw new Error(`Photon answered ${response.status}`);
      }
      return toResults(await response.json());
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };

  const load = async (url: string): Promise<GeocodeResult[]> => {
    const hit = cache.get(url);
    if (hit) {
      return await hit;
    }
    const pending = request(url);
    cache.set(url, pending);
    if (cache.size > cacheSize) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.delete(oldest);
      }
    }
    try {
      return await pending;
    } catch (error) {
      // A failed lookup must not be served from the cache next time.
      cache.delete(url);
      throw error;
    }
  };

  return {
    geocode: async ({ query: text }) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return [];
      }
      return await load(`${baseUrl}/api/?${query({ q: trimmed, limit, lang })}`);
    },
    reverseGeocode: async ({ lat, lng }) => {
      const results = await load(
        `${baseUrl}/reverse?${query({ lat: lat.toFixed(5), lon: lng.toFixed(5), limit: 1, lang })}`,
      );
      return results[0] ?? null;
    },
  };
};

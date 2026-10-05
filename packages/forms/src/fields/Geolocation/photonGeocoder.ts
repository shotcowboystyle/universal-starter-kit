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
  fetch?: typeof fetch;
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
  geometry?: { type?: string; coordinates?: unknown };
  properties?: PhotonProperties;
}

const photonPublicUrl = 'https://photon.komoot.io';

function streetLine(props: PhotonProperties): string | undefined {
  if (!props.street) {
    return undefined;
  }
  return props.housenumber ? `${props.street} ${props.housenumber}` : props.street;
}

export function photonFeatureToResult(feature: PhotonFeature): GeocodeResult | null {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates)) {
    return null;
  }
  const [lng, lat] = coordinates as [unknown, unknown];
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const props = feature.properties ?? {};
  const street = streetLine(props);
  const label = props.name ?? street ?? props.city ?? props.county ?? props.state ?? props.country;
  if (!label) {
    return null;
  }
  const seen = new Set([label]);
  const parts: string[] = [];
  for (const part of [
    props.name ? street : undefined,
    props.district ?? props.locality,
    props.city ?? props.county,
    props.state,
    props.country,
  ]) {
    if (!part || seen.has(part)) {
      continue;
    }
    seen.add(part);
    parts.push(part);
  }
  return parts.length > 0 ? { lat, lng, label, description: parts.join(', ') } : { lat, lng, label };
}

function toResults(body: unknown): GeocodeResult[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) {
    throw new Error('Photon returned no feature collection');
  }
  const seen = new Set<string>();
  const results: GeocodeResult[] = [];
  for (const feature of features) {
    const result = photonFeatureToResult(feature as PhotonFeature);
    if (!result) {
      continue;
    }
    const key = formatPlace(result);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(result);
  }
  return results;
}

function query(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

export function createPhotonGeocoder(options: PhotonGeocoderOptions = {}): Geocoder {
  const baseUrl = (options.baseUrl ?? photonPublicUrl).replace(/\/+$/, '');
  const lang = options.lang;
  const limit = options.limit ?? 5;
  const timeoutMs = options.timeoutMs ?? 8000;
  const cacheSize = options.cacheSize ?? 100;
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const cache = new Map<string, Promise<GeocodeResult[]>>();

  const load = (url: string): Promise<GeocodeResult[]> => {
    const hit = cache.get(url);
    if (hit) {
      return hit;
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = controller
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : undefined;
    const pending = doFetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Photon answered ${response.status}`);
        }
        return toResults(await response.json());
      })
      .finally(() => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      });
    cache.set(url, pending);
    if (cache.size > cacheSize) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.delete(oldest);
      }
    }
    pending.catch(() => cache.delete(url));
    return pending;
  };

  return {
    geocode: ({ query: text }) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return Promise.resolve([]);
      }
      return load(`${baseUrl}/api/?${query({ q: trimmed, limit, lang })}`);
    },
    reverseGeocode: async ({ lat, lng }) => {
      const results = await load(
        `${baseUrl}/reverse?${query({ lat: lat.toFixed(5), lon: lng.toFixed(5), limit: 1, lang })}`,
      );
      return results[0] ?? null;
    },
  };
}

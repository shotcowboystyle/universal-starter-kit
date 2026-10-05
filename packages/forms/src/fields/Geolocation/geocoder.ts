/**
 * Geolocation geocoder seam.
 *
 * The field never holds provider credentials and never wires a default
 * network provider. Consumers inject `geocode` / `reverseGeocode` (or a
 * `Geocoder` object) and the field calls only what it was handed. With no
 * geocoder injected, search is disabled and the map / locate / coordinate
 * paths stay intact — the package never reaches a third party the consumer
 * did not choose.
 *
 * This file is the seam and nothing else: no provider, no endpoint, no
 * transport. A provider is whatever a consumer writes against `Geocoder` —
 * an offline gazetteer, their own backend proxy holding a commercial key, or
 * a self-hosted geocoder. See `geocoderSeam.test.tsx` for both shapes.
 */

import type { GeoValue } from './geoValue';

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Primary line — the place name. */
  label: string;
  /** Secondary line — locality / region. Omitted for a bare coordinate. */
  description?: string;
}

export interface GeocodeQuery {
  query: string;
}

export interface ReverseGeocodeQuery {
  lat: number;
  lng: number;
}

export type GeocodeFn = (query: GeocodeQuery) => Promise<GeocodeResult[]>;
export type ReverseGeocodeFn = (query: ReverseGeocodeQuery) => Promise<GeocodeResult | null>;

export interface Geocoder {
  geocode: GeocodeFn;
  reverseGeocode: ReverseGeocodeFn;
}

const LAT_LNG_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

export function clampLat(val: number): number {
  return Math.max(-90, Math.min(90, val));
}

export function clampLng(val: number): number {
  return Math.max(-180, Math.min(180, val));
}

/** Quiet mono disclosure / cell fallback — five decimals, board media-13. */
export function formatCoordPair(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Expert path through the same search input: a typed `lat, lng` pair. */
export function parseLatLngPair(text: string): GeoValue | null {
  const match = LAT_LNG_PAIR.exec(text);
  if (!match) {
    return null;
  }
  const lat = Number.parseFloat(match[1]);
  const lng = Number.parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

export function formatPlace(result: Pick<GeocodeResult, 'label' | 'description'>): string {
  return result.description ? `${result.label}, ${result.description}` : result.label;
}

export function resolveGeocoder(input: {
  geocode?: GeocodeFn;
  reverseGeocode?: ReverseGeocodeFn;
  geocoder?: Geocoder;
}): { geocode?: GeocodeFn; reverseGeocode?: ReverseGeocodeFn } {
  return {
    geocode: input.geocode ?? input.geocoder?.geocode,
    reverseGeocode: input.reverseGeocode ?? input.geocoder?.reverseGeocode,
  };
}

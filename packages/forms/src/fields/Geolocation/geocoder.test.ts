import { describe, expect, it, vi } from 'vitest';

import { clampLat, clampLng, formatCoordPair, formatPlace, parseLatLngPair, resolveGeocoder } from './geocoder';
import { parseGeoValue, formatGeoValue } from './geoValue';

describe('geocoder seam helpers', () => {
  it('parses and serializes the lat/lng JSON value', () => {
    expect(parseGeoValue(undefined)).toBeNull();
    expect(parseGeoValue('')).toBeNull();
    expect(parseGeoValue('{')).toBeNull();
    expect(parseGeoValue(JSON.stringify({ lat: 60.16952, lng: 24.93545 }))).toEqual({
      lat: 60.16952,
      lng: 24.93545,
    });
    expect(formatGeoValue({ lat: clampLat(91), lng: clampLng(200) }, 'latlng')).toBe(
      JSON.stringify({ lat: 90, lng: 180 }),
    );
  });

  it('formats the subordinate pair at five decimals', () => {
    expect(formatCoordPair(60.16952, 24.93545)).toBe('60.16952, 24.93545');
  });

  it('parses a typed lat, lng pair and rejects out-of-range', () => {
    expect(parseLatLngPair('60.169, 24.935')).toEqual({ lat: 60.169, lng: 24.935 });
    expect(parseLatLngPair('  -33.8,  151.2 ')).toEqual({ lat: -33.8, lng: 151.2 });
    expect(parseLatLngPair('mannerheim')).toBeNull();
    expect(parseLatLngPair('91, 0')).toBeNull();
    expect(parseLatLngPair('0, 200')).toBeNull();
  });

  it('clamps latitude and longitude', () => {
    expect(clampLat(100)).toBe(90);
    expect(clampLng(-200)).toBe(-180);
  });

  it('joins a described place for the input face', () => {
    expect(formatPlace({ label: 'Mannerheimintie 3', description: '00100 Helsinki' })).toBe(
      'Mannerheimintie 3, 00100 Helsinki',
    );
  });

  it('resolveGeocoder prefers explicit props over a geocoder object', () => {
    const geocode = vi.fn();
    const reverseGeocode = vi.fn();
    const other = { geocode: vi.fn(), reverseGeocode: vi.fn() };
    const resolved = resolveGeocoder({ geocode, reverseGeocode, geocoder: other });
    expect(resolved.geocode).toBe(geocode);
    expect(resolved.reverseGeocode).toBe(reverseGeocode);
    expect(resolveGeocoder({}).geocode).toBeUndefined();
  });
});

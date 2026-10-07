import { describe, expect, it } from 'vitest';

import { detectGeoFormat, formatGeoValue, parseGeoValue } from './geo-value';

/**
 * Recorded stock-Frappe value: what `JSON.stringify(editableLayers.toGeoJSON())`
 * writes for a single circle marker dropped at 37.7749,-122.4194. Leaflet emits
 * GeoJSON order, so coordinates are [lng, lat].
 */
const stockFrappeFeature = {
  type: 'Feature',
  properties: { point_type: 'circle', radius: 10 },
  geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
};

const stockFrappePoint = JSON.stringify({
  type: 'FeatureCollection',
  features: [stockFrappeFeature],
});

const nativePoint = JSON.stringify({ lat: 37.7749, lng: -122.4194 });

describe(parseGeoValue, () => {
  it('reads the repo-native {lat,lng} shape', () => {
    expect(parseGeoValue(nativePoint)).toStrictEqual({ lat: 37.7749, lng: -122.4194 });
  });

  it('reads a stock Frappe FeatureCollection and yields the SAME coordinates', () => {
    expect(parseGeoValue(stockFrappePoint)).toStrictEqual(parseGeoValue(nativePoint));
  });

  it('does not swap lat/lng — GeoJSON stores [lng, lat]', () => {
    const parsed = parseGeoValue(stockFrappePoint);
    expect(parsed?.lat).toBeCloseTo(37.7749, 10);
    expect(parsed?.lng).toBeCloseTo(-122.4194, 10);
  });

  it('round-trips a stock value through JSON.parse/stringify unchanged', () => {
    const reserialized = JSON.stringify(JSON.parse(stockFrappePoint));
    expect(parseGeoValue(reserialized)).toStrictEqual({ lat: 37.7749, lng: -122.4194 });
  });

  it('picks the first Point when Frappe also stored drawn shapes', () => {
    const mixed = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { point_type: 'marker' },
          geometry: { type: 'Point', coordinates: [12.4924, 41.8902] },
        },
      ],
    });
    expect(parseGeoValue(mixed)).toStrictEqual({ lat: 41.8902, lng: 12.4924 });
  });

  it("returns null for an empty FeatureCollection (Frappe's cleared value)", () => {
    expect(parseGeoValue(JSON.stringify({ type: 'FeatureCollection', features: [] }))).toBeNull();
  });

  it('returns null for empty, blank, malformed, and non-finite values', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required, so an explicit undefined is the case under test
    expect(parseGeoValue(undefined)).toBeNull();
    expect(parseGeoValue('')).toBeNull();
    expect(parseGeoValue('   ')).toBeNull();
    expect(parseGeoValue('{not json')).toBeNull();
    expect(parseGeoValue(JSON.stringify({ lat: '37.7', lng: -122 }))).toBeNull();
    expect(parseGeoValue(JSON.stringify({ lat: Number.NaN, lng: -122 }))).toBeNull();
  });
});

describe(detectGeoFormat, () => {
  it('reports featurecollection for a stock Frappe value', () => {
    expect(detectGeoFormat(stockFrappePoint)).toBe('featurecollection');
  });

  it('reports latlng for the repo-native value and for unreadable input', () => {
    expect(detectGeoFormat(nativePoint)).toBe('latlng');
    expect(detectGeoFormat('')).toBe('latlng');
    expect(detectGeoFormat('{not json')).toBe('latlng');
  });
});

describe(formatGeoValue, () => {
  it('keeps the repo-native shape for a doc that arrived native', () => {
    expect(formatGeoValue({ lat: 1.5, lng: -2.5 }, 'latlng', nativePoint)).toBe(
      JSON.stringify({ lat: 1.5, lng: -2.5 }),
    );
  });

  it('writes a FeatureCollection back when the doc arrived from stock Frappe', () => {
    const written: unknown = JSON.parse(formatGeoValue({ lat: 1.5, lng: -2.5 }, 'featurecollection', stockFrappePoint));
    expect(written).toMatchObject({
      type: 'FeatureCollection',
      features: [{ geometry: { type: 'Point', coordinates: [-2.5, 1.5] } }],
    });
  });

  it("emits [lng, lat] so stock Frappe's parser reads the edit back", () => {
    const written = formatGeoValue({ lat: 1.5, lng: -2.5 }, 'featurecollection', stockFrappePoint);
    expect(parseGeoValue(written)).toStrictEqual({ lat: 1.5, lng: -2.5 });
  });

  it('preserves the feature properties Frappe wrote (point_type/radius)', () => {
    const written: unknown = JSON.parse(formatGeoValue({ lat: 1.5, lng: -2.5 }, 'featurecollection', stockFrappePoint));
    expect(written).toMatchObject({ features: [{ properties: { point_type: 'circle', radius: 10 } }] });
  });

  it('does not destroy a drawn Polygon sibling when the point moves', () => {
    const polygon = {
      type: 'Feature',
      properties: { name: 'zone' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    };
    const previous = JSON.stringify({
      type: 'FeatureCollection',
      features: [polygon, stockFrappeFeature],
    });
    const written: unknown = JSON.parse(formatGeoValue({ lat: 9, lng: 8 }, 'featurecollection', previous));
    expect(written).toMatchObject({
      features: [polygon, { geometry: { coordinates: [8, 9] } }],
    });
  });

  it('appends a plain marker when the collection had no Point to move', () => {
    const previous = JSON.stringify({ type: 'FeatureCollection', features: [] });
    const written: unknown = JSON.parse(formatGeoValue({ lat: 9, lng: 8 }, 'featurecollection', previous));
    expect(written).toStrictEqual({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [8, 9] } }],
    });
  });

  it('round-trips: parse a stock value, write it back, parse again', () => {
    const read = parseGeoValue(stockFrappePoint);
    expect(read).toStrictEqual({ lat: 37.7749, lng: -122.4194 });
    if (read === null) {
      throw new Error('stock Frappe value must parse');
    }
    const written = formatGeoValue(read, detectGeoFormat(stockFrappePoint), stockFrappePoint);
    expect(JSON.parse(written)).toStrictEqual(JSON.parse(stockFrappePoint));
  });
});

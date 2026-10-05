import { describe, expect, it } from 'vitest';

import { detectGeoShape, formatGeoValue, parseGeoValue } from './geoValue';

/**
 * Recorded stock-Frappe value: what `JSON.stringify(editableLayers.toGeoJSON())`
 * writes for a single circle marker dropped at 37.7749,-122.4194. Leaflet emits
 * GeoJSON order, so coordinates are [lng, lat].
 */
const stockFrappePoint = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { point_type: 'circle', radius: 10 },
      geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
    },
  ],
});

const nativePoint = JSON.stringify({ lat: 37.7749, lng: -122.4194 });

describe('parseGeoValue', () => {
  it('reads the repo-native {lat,lng} shape', () => {
    expect(parseGeoValue(nativePoint)).toEqual({ lat: 37.7749, lng: -122.4194 });
  });

  it('reads a stock Frappe FeatureCollection and yields the SAME coordinates', () => {
    expect(parseGeoValue(stockFrappePoint)).toEqual(parseGeoValue(nativePoint));
  });

  it('does not swap lat/lng — GeoJSON stores [lng, lat]', () => {
    const parsed = parseGeoValue(stockFrappePoint);
    expect(parsed?.lat).toBeCloseTo(37.7749, 10);
    expect(parsed?.lng).toBeCloseTo(-122.4194, 10);
  });

  it('round-trips a stock value through JSON.parse/stringify unchanged', () => {
    const reserialized = JSON.stringify(JSON.parse(stockFrappePoint));
    expect(parseGeoValue(reserialized)).toEqual({ lat: 37.7749, lng: -122.4194 });
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
    expect(parseGeoValue(mixed)).toEqual({ lat: 41.8902, lng: 12.4924 });
  });

  it("returns null for an empty FeatureCollection (Frappe's cleared value)", () => {
    expect(parseGeoValue(JSON.stringify({ type: 'FeatureCollection', features: [] }))).toBeNull();
  });

  it('returns null for empty, blank, malformed, and non-finite values', () => {
    expect(parseGeoValue(undefined)).toBeNull();
    expect(parseGeoValue('')).toBeNull();
    expect(parseGeoValue('   ')).toBeNull();
    expect(parseGeoValue('{not json')).toBeNull();
    expect(parseGeoValue(JSON.stringify({ lat: '37.7', lng: -122 }))).toBeNull();
    expect(parseGeoValue(JSON.stringify({ lat: Number.NaN, lng: -122 }))).toBeNull();
  });
});

describe('detectGeoShape', () => {
  it('reports featurecollection for a stock Frappe value', () => {
    expect(detectGeoShape(stockFrappePoint)).toBe('featurecollection');
  });

  it('reports latlng for the repo-native value and for unreadable input', () => {
    expect(detectGeoShape(nativePoint)).toBe('latlng');
    expect(detectGeoShape('')).toBe('latlng');
    expect(detectGeoShape('{not json')).toBe('latlng');
  });
});

describe('formatGeoValue', () => {
  it('keeps the repo-native shape for a doc that arrived native', () => {
    expect(formatGeoValue({ lat: 1.5, lng: -2.5 }, 'latlng', nativePoint)).toBe(
      JSON.stringify({ lat: 1.5, lng: -2.5 }),
    );
  });

  it('writes a FeatureCollection back when the doc arrived from stock Frappe', () => {
    const written = JSON.parse(formatGeoValue({ lat: 1.5, lng: -2.5 }, 'featurecollection', stockFrappePoint));
    expect(written.type).toBe('FeatureCollection');
    expect(written.features).toHaveLength(1);
    expect(written.features[0].geometry).toEqual({ type: 'Point', coordinates: [-2.5, 1.5] });
  });

  it("emits [lng, lat] so stock Frappe's parser reads the edit back", () => {
    const written = formatGeoValue({ lat: 1.5, lng: -2.5 }, 'featurecollection', stockFrappePoint);
    expect(parseGeoValue(written)).toEqual({ lat: 1.5, lng: -2.5 });
  });

  it('preserves the feature properties Frappe wrote (point_type/radius)', () => {
    const written = JSON.parse(formatGeoValue({ lat: 1.5, lng: -2.5 }, 'featurecollection', stockFrappePoint));
    expect(written.features[0].properties).toEqual({ point_type: 'circle', radius: 10 });
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
      features: [polygon, JSON.parse(stockFrappePoint).features[0]],
    });
    const written = JSON.parse(formatGeoValue({ lat: 9, lng: 8 }, 'featurecollection', previous));
    expect(written.features).toHaveLength(2);
    expect(written.features[0]).toEqual(polygon);
    expect(written.features[1].geometry.coordinates).toEqual([8, 9]);
  });

  it('appends a plain marker when the collection had no Point to move', () => {
    const previous = JSON.stringify({ type: 'FeatureCollection', features: [] });
    const written = JSON.parse(formatGeoValue({ lat: 9, lng: 8 }, 'featurecollection', previous));
    expect(written.features).toEqual([
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [8, 9] } },
    ]);
  });

  it('round-trips: parse a stock value, write it back, parse again', () => {
    const read = parseGeoValue(stockFrappePoint);
    expect(read).toEqual({ lat: 37.7749, lng: -122.4194 });
    const written = formatGeoValue(
      read as { lat: number; lng: number },
      detectGeoShape(stockFrappePoint),
      stockFrappePoint,
    );
    expect(JSON.parse(written)).toEqual(JSON.parse(stockFrappePoint));
  });
});

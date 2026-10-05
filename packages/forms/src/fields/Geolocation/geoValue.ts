/**
 * Geolocation value shapes.
 *
 * Stock Frappe stores the Geolocation fieldtype as a GeoJSON FeatureCollection
 * STRING — `geolocation.js` does
 * `set_value(JSON.stringify(this.editableLayers.toGeoJSON()))`, where Leaflet's
 * `toGeoJSON()` emits `[lng, lat]` coordinate pairs.
 *
 * This repo's field stores the compact `{"lat":n,"lng":n}` object. Both are read
 * here so a doc created in stock Frappe renders instead of coming up empty.
 * `detectGeoShape` reports which shape a stored value used, so the write path
 * can persist back in the shape the doc arrived in.
 */

export interface GeoValue {
  lat: number;
  lng: number;
}

/** Which on-disk shape a stored Geolocation value used. */
export type GeoShape = 'latlng' | 'featurecollection';

interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function parseJson(value: string | undefined): unknown {
  if (!value || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Pull the first Point geometry out of a stock Frappe FeatureCollection.
 * Frappe also stores Polygon/LineString features (drawn shapes); those carry no
 * single coordinate for our lat/lng field, so they are skipped rather than
 * approximated.
 */
function firstPoint(parsed: unknown): GeoJsonPoint | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const collection = parsed as { type?: unknown; features?: unknown };
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return null;
  }
  for (const feature of collection.features) {
    if (!feature || typeof feature !== 'object') {
      continue;
    }
    const geometry = (feature as { geometry?: unknown }).geometry as
      | { type?: unknown; coordinates?: unknown }
      | undefined;
    if (!geometry || geometry.type !== 'Point') {
      continue;
    }
    const coordinates = geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      continue;
    }
    const [lng, lat] = coordinates;
    if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) {
      continue;
    }
    return { type: 'Point', coordinates: [lng, lat] };
  }
  return null;
}

/**
 * Read a stored Geolocation value in EITHER shape. Returns null when the value
 * is empty, unparseable, or carries no usable point.
 */
export function parseGeoValue(value: string | undefined): GeoValue | null {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const native = parsed as Record<string, unknown>;
  if (isFiniteNumber(native.lat) && isFiniteNumber(native.lng)) {
    return { lat: native.lat, lng: native.lng };
  }

  const point = firstPoint(parsed);
  if (point) {
    const [lng, lat] = point.coordinates;
    return { lat, lng };
  }
  return null;
}

/**
 * Report which shape a stored value used, so an edit can be written back in the
 * same shape. Unreadable values report the repo-native shape.
 */
export function detectGeoShape(value: string | undefined): GeoShape {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object') {
    return 'latlng';
  }
  if ((parsed as { type?: unknown }).type === 'FeatureCollection') {
    return 'featurecollection';
  }
  return 'latlng';
}

interface GeoJsonFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type?: unknown; coordinates?: unknown } | null;
}

function asFeatures(parsed: unknown): GeoJsonFeature[] {
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }
  const collection = parsed as { type?: unknown; features?: unknown };
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return [];
  }
  return collection.features.filter((feature): feature is GeoJsonFeature => !!feature && typeof feature === 'object');
}

function isPointFeature(feature: GeoJsonFeature): boolean {
  return !!feature.geometry && (feature.geometry as { type?: unknown }).type === 'Point';
}

/**
 * Serialise coordinates back to disk in the shape the document arrived in.
 *
 * `latlng` emits this repo's compact `{"lat":n,"lng":n}`. `featurecollection`
 * emits a stock-Frappe GeoJSON FeatureCollection with `[lng, lat]` ordering, so
 * `geolocation.js` reads the edit back.
 *
 * `previous` (the value being replaced) is preserved as far as it can be: the
 * first Point feature is moved in place and keeps its `properties` (Frappe
 * writes `point_type`/`radius` there for circles), and any Polygon/LineString
 * features the user drew in Frappe survive a coordinate edit untouched. With no
 * Point feature to move, one is appended with the empty `properties` a plain
 * `L.marker` serialises to.
 */
export function formatGeoValue(coordinates: GeoValue, shape: GeoShape, previous?: string): string {
  if (shape !== 'featurecollection') {
    return JSON.stringify(coordinates);
  }

  const point = {
    type: 'Point' as const,
    coordinates: [coordinates.lng, coordinates.lat] as [number, number],
  };
  const existing = asFeatures(parseJson(previous));
  let moved = false;
  const features = existing.map((feature) => {
    if (moved || !isPointFeature(feature)) {
      return feature;
    }
    moved = true;
    return { ...feature, geometry: point };
  });
  if (!moved) {
    features.push({ type: 'Feature', properties: {}, geometry: point });
  }
  return JSON.stringify({ type: 'FeatureCollection', features });
}

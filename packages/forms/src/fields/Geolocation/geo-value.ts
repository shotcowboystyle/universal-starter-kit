/**
 * Geolocation value formats.
 *
 * Stock Frappe stores the Geolocation fieldtype as a GeoJSON FeatureCollection
 * STRING — `geolocation.js` does
 * `set_value(JSON.stringify(this.editableLayers.toGeoJSON()))`, where Leaflet's
 * `toGeoJSON()` emits `[lng, lat]` coordinate pairs.
 *
 * This repo's field stores the compact `{"lat":n,"lng":n}` object. Both are read
 * here so a doc created in stock Frappe renders instead of coming up empty.
 * `detectGeoFormat` reports which format a stored value used, so the write path
 * can persist back in the format the doc arrived in.
 */

export interface GeoValue {
  lat: number;
  lng: number;
}

/** Which on-disk format a stored Geolocation value used. */
export type GeoStorageFormat = 'latlng' | 'featurecollection';

interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

interface GeoJsonGeometry {
  type?: unknown;
  coordinates?: unknown;
}

interface GeoJsonFeature {
  type?: unknown;
  properties?: unknown;
  geometry?: GeoJsonGeometry | null;
}

/** A parsed stored value, typed just far enough to read either format's fields. */
type JsonLeaf = string | number | boolean | object | null;

interface StoredGeo {
  lat?: JsonLeaf;
  lng?: JsonLeaf;
  type?: unknown;
  features?: unknown;
}

export const isFiniteNumber = <T>(n: T): n is T & number => typeof n === 'number' && Number.isFinite(n);

const parseStored = (value: string | undefined): StoredGeo | null => {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    // Safe to continue: an unparseable stored value reads as empty.
    return null;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- JSON boundary: only objects can carry geo fields
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  return parsed;
};

const asFeatures = (parsed: StoredGeo | null): GeoJsonFeature[] => {
  if (parsed?.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    return [];
  }
  const features: readonly unknown[] = parsed.features;
  return features.filter((feature): feature is GeoJsonFeature => typeof feature === 'object' && feature !== null);
};

const pointCoordinates = (feature: GeoJsonFeature): [number, number] | null => {
  const { geometry } = feature;
  if (geometry?.type !== 'Point') {
    return null;
  }
  const { coordinates } = geometry;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }
  const pair: readonly unknown[] = coordinates;
  const [lng, lat] = pair;
  return isFiniteNumber(lng) && isFiniteNumber(lat) ? [lng, lat] : null;
};

/**
 * Pull the first Point geometry out of a stock Frappe FeatureCollection.
 * Frappe also stores Polygon/LineString features (drawn shapes); those carry no
 * single coordinate for our lat/lng field, so they are skipped rather than
 * approximated.
 */
const firstPoint = (parsed: StoredGeo): GeoJsonPoint | null => {
  for (const feature of asFeatures(parsed)) {
    const coordinates = pointCoordinates(feature);
    if (coordinates !== null) {
      return { type: 'Point', coordinates };
    }
  }
  return null;
};

/**
 * Read a stored Geolocation value in EITHER format. Returns null when the value
 * is empty, unparseable, or carries no usable point.
 */
export const parseGeoValue = (value: string | undefined): GeoValue | null => {
  const parsed = parseStored(value);
  if (parsed === null) {
    return null;
  }

  if (isFiniteNumber(parsed.lat) && isFiniteNumber(parsed.lng)) {
    return { lat: parsed.lat, lng: parsed.lng };
  }

  const point = firstPoint(parsed);
  if (point) {
    const [lng, lat] = point.coordinates;
    return { lat, lng };
  }
  return null;
};

/**
 * Report which format a stored value used, so an edit can be written back in the
 * same format. Unreadable values report the repo-native format.
 */
export const detectGeoFormat = (value: string | undefined): GeoStorageFormat =>
  parseStored(value)?.type === 'FeatureCollection' ? 'featurecollection' : 'latlng';

const isPointFeature = (feature: GeoJsonFeature): boolean => feature.geometry?.type === 'Point';

/**
 * Serialize coordinates back to disk in the format the document arrived in.
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
 * `L.marker` serializes to.
 */
export const formatGeoValue = (coordinates: GeoValue, format: GeoStorageFormat, previous?: string): string => {
  if (format !== 'featurecollection') {
    return JSON.stringify(coordinates);
  }

  const point: GeoJsonPoint = {
    type: 'Point',
    coordinates: [coordinates.lng, coordinates.lat],
  };
  const existing = asFeatures(parseStored(previous));
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
};

/** OSM slippy-map tile size in CSS pixels. */
export const OSM_TILE_SIZE = 256;

/**
 * Viewport half-size in degrees → tile zoom. Shared by the web tile surface
 * and the native expo-maps camera (360° spans zoom 0, halving per level).
 */
export function zoomFromDelta(delta: number): number {
  const clamped = Math.min(Math.max(delta, 0.0005), 45);
  return Math.max(1, Math.min(19, Math.round(Math.log2(360 / (clamped * 2)))));
}

export function lngToTile(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 2 ** zoom;
}

export function latToTile(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

export function tileToLng(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180;
}

export function tileToLat(y: number, zoom: number): number {
  const rad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom)));
  return (rad * 180) / Math.PI;
}

export function wrapTileX(x: number, zoom: number): number {
  const n = 2 ** zoom;
  return ((x % n) + n) % n;
}

export interface MapClickArgs {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  lat: number;
  lng: number;
  zoom: number;
}

/** Convert a click in the map box to WGS84, matching the centered-tile view. */
export function latLngFromMapClick(args: MapClickArgs): { lat: number; lng: number } {
  const { offsetX, offsetY, width, height, lat, lng, zoom } = args;
  const worldX = lngToTile(lng, zoom) + (offsetX - width / 2) / OSM_TILE_SIZE;
  const worldY = latToTile(lat, zoom) + (offsetY - height / 2) / OSM_TILE_SIZE;
  return { lat: tileToLat(worldY, zoom), lng: tileToLng(worldX, zoom) };
}

export interface MapTile {
  tx: number;
  ty: number;
  left: number;
  top: number;
}

/** Tiles covering a pixel box centered on `lat`/`lng` at `zoom`. */
export function tilesForView(args: {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
}): MapTile[] {
  const { lat, lng, zoom, width, height } = args;
  if (width < 1 || height < 1) {
    return [];
  }
  const n = 2 ** zoom;
  const cx = lngToTile(lng, zoom);
  const cy = latToTile(lat, zoom);
  const minTx = Math.floor(cx - width / 2 / OSM_TILE_SIZE);
  const maxTx = Math.ceil(cx + width / 2 / OSM_TILE_SIZE);
  const minTy = Math.max(0, Math.floor(cy - height / 2 / OSM_TILE_SIZE));
  const maxTy = Math.min(n - 1, Math.ceil(cy + height / 2 / OSM_TILE_SIZE));
  const tiles: MapTile[] = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      tiles.push({
        tx: wrapTileX(tx, zoom),
        ty,
        left: (tx - cx) * OSM_TILE_SIZE + width / 2,
        top: (ty - cy) * OSM_TILE_SIZE + height / 2,
      });
    }
  }
  return tiles;
}

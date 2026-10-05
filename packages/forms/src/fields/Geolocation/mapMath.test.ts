import { describe, expect, it } from 'vitest';

import { latLngFromMapClick, latToTile, lngToTile, tileToLat, tileToLng, tilesForView, zoomFromDelta } from './mapMath';

describe('mapMath', () => {
  it('zoomFromDelta(0.02) matches the native camera zoom (13)', () => {
    expect(zoomFromDelta(0.02)).toBe(13);
  });

  it('tile projection round-trips the equator', () => {
    const zoom = 8;
    const x = lngToTile(0, zoom);
    const y = latToTile(0, zoom);
    expect(tileToLng(x, zoom)).toBeCloseTo(0, 8);
    expect(tileToLat(y, zoom)).toBeCloseTo(0, 8);
  });

  it('a center click returns the view center', () => {
    const next = latLngFromMapClick({
      offsetX: 100,
      offsetY: 80,
      width: 200,
      height: 160,
      lat: 37.7749,
      lng: -122.4194,
      zoom: 13,
    });
    expect(next.lat).toBeCloseTo(37.7749, 5);
    expect(next.lng).toBeCloseTo(-122.4194, 5);
  });

  it('a click east of center increases longitude', () => {
    const next = latLngFromMapClick({
      offsetX: 180,
      offsetY: 100,
      width: 200,
      height: 200,
      lat: 0,
      lng: 0,
      zoom: 8,
    });
    expect(next.lng).toBeGreaterThan(0);
    expect(next.lat).toBeCloseTo(0, 5);
  });

  it('tilesForView covers the box and skips empty layout', () => {
    expect(tilesForView({ lat: 0, lng: 0, zoom: 2, width: 0, height: 200 })).toEqual([]);
    const tiles = tilesForView({ lat: 0, lng: 0, zoom: 2, width: 256, height: 256 });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((tile) => tile.tx >= 0 && tile.ty >= 0)).toBe(true);
  });
});

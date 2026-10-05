import { describe, expect, it, vi } from 'vitest';

import { createPhotonGeocoder, photonFeatureToResult } from './photonGeocoder';

// Recorded from https://photon.komoot.io on 2026-09-26 (trimmed to the fields
// the adapter reads). Photon returns one feature per OSM way, so a long street
// arrives as several segments with the same name.
const mannerheimSearch = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        osm_key: 'highway',
        type: 'street',
        name: 'Mannerheimintie',
        locality: 'Keskusta',
        district: 'Kluuvi',
        city: 'Helsinki',
        state: 'Uusimaa',
        country: 'Suomi',
      },
      geometry: { type: 'Point', coordinates: [24.9374103, 60.1707623] },
    },
    {
      type: 'Feature',
      properties: {
        osm_key: 'highway',
        type: 'street',
        name: 'Mannerheimintie',
        locality: 'Keskusta',
        district: 'Kluuvi',
        city: 'Helsinki',
        state: 'Uusimaa',
        country: 'Suomi',
      },
      geometry: { type: 'Point', coordinates: [24.9413811, 60.1681296] },
    },
  ],
};

const kamppiReverse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        type: 'house',
        name: 'P-Simonkenttä',
        street: 'Narinkkatori',
        district: 'Kamppi',
        city: 'Helsinki',
        state: 'Uusimaa',
        country: 'Suomi',
      },
      geometry: { type: 'Point', coordinates: [24.9356429, 60.1694307] },
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createPhotonGeocoder', () => {
  it('searches the public instance and maps features to place rows', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(mannerheimSearch));
    const geocoder = createPhotonGeocoder({ fetch });
    const results = await geocoder.geocode({ query: ' mannerheimintie ' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://photon.komoot.io/api/?q=mannerheimintie&limit=5');
    expect(results).toEqual([
      {
        lat: 60.1707623,
        lng: 24.9374103,
        label: 'Mannerheimintie',
        description: 'Kluuvi, Helsinki, Uusimaa, Suomi',
      },
    ]);
  });

  it('reverse geocodes a pair to its nearest place', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(kamppiReverse));
    const geocoder = createPhotonGeocoder({ fetch });
    const result = await geocoder.reverseGeocode({ lat: 60.16952, lng: 24.93545 });
    expect(fetch.mock.calls[0][0]).toBe('https://photon.komoot.io/reverse?lat=60.16952&lon=24.93545&limit=1');
    expect(result).toEqual({
      lat: 60.1694307,
      lng: 24.9356429,
      label: 'P-Simonkenttä',
      description: 'Narinkkatori, Kamppi, Helsinki, Uusimaa, Suomi',
    });
  });

  it('answers null when nothing is near the pair', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ type: 'FeatureCollection', features: [] }));
    const geocoder = createPhotonGeocoder({ fetch });
    await expect(geocoder.reverseGeocode({ lat: 0, lng: -160 })).resolves.toBeNull();
  });

  it('takes a self-hosted base URL and a language', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(mannerheimSearch));
    const geocoder = createPhotonGeocoder({
      fetch,
      baseUrl: 'https://geo.example.test/photon/',
      lang: 'en',
      limit: 3,
    });
    await geocoder.geocode({ query: 'Café & Bar' });
    expect(fetch.mock.calls[0][0]).toBe('https://geo.example.test/photon/api/?q=Caf%C3%A9%20%26%20Bar&limit=3&lang=en');
  });

  it('never calls out for a blank query', async () => {
    const fetch = vi.fn();
    const geocoder = createPhotonGeocoder({ fetch });
    await expect(geocoder.geocode({ query: '   ' })).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serves a repeated query and a repeated pair from its cache', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        jsonResponse(url.includes('/reverse') ? kamppiReverse : mannerheimSearch),
      );
    const geocoder = createPhotonGeocoder({ fetch });
    await geocoder.geocode({ query: 'mannerheimintie' });
    await geocoder.geocode({ query: 'mannerheimintie' });
    await Promise.all([
      geocoder.reverseGeocode({ lat: 60.16952, lng: 24.93545 }),
      geocoder.reverseGeocode({ lat: 60.16952, lng: 24.93545 }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects on an HTTP error and retries it on the next call', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'busy' }, 503))
      .mockResolvedValueOnce(jsonResponse(mannerheimSearch));
    const geocoder = createPhotonGeocoder({ fetch });
    await expect(geocoder.geocode({ query: 'mannerheimintie' })).rejects.toThrow('Photon answered 503');
    await expect(geocoder.geocode({ query: 'mannerheimintie' })).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a body that is not a feature collection', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad request' }));
    const geocoder = createPhotonGeocoder({ fetch });
    await expect(geocoder.geocode({ query: 'x' })).rejects.toThrow('no feature collection');
  });

  it('aborts a request that outlives timeoutMs', async () => {
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const geocoder = createPhotonGeocoder({
      fetch: fetch as typeof globalThis.fetch,
      timeoutMs: 20,
    });
    await expect(geocoder.geocode({ query: 'slow' })).rejects.toThrow('aborted');
  });
});

describe('photonFeatureToResult', () => {
  it('labels an unnamed house by street and number', () => {
    expect(
      photonFeatureToResult({
        geometry: { type: 'Point', coordinates: [24.93545, 60.16952] },
        properties: {
          street: 'Mannerheimintie',
          housenumber: '3',
          district: 'Kamppi',
          city: 'Helsinki',
          country: 'Finland',
        },
      }),
    ).toEqual({
      lat: 60.16952,
      lng: 24.93545,
      label: 'Mannerheimintie 3',
      description: 'Kamppi, Helsinki, Finland',
    });
  });

  it('drops a feature without a point or a name', () => {
    expect(photonFeatureToResult({ properties: { name: 'Nowhere' } })).toBeNull();
    expect(photonFeatureToResult({ geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} })).toBeNull();
  });

  it('gives a country alone no description', () => {
    expect(
      photonFeatureToResult({
        geometry: { type: 'Point', coordinates: [25.9, 64.9] },
        properties: { name: 'Suomi', country: 'Suomi' },
      }),
    ).toEqual({ lat: 64.9, lng: 25.9, label: 'Suomi' });
  });
});

/**
 * Candidate A evidence — the seam alone is sufficient.
 *
 * Nothing here imports `createNominatimGeocoder`. Every provider in this file
 * is written by hand the way a consumer would write one, typed only against
 * the exported `Geocoder` / `GeocodeFn` / `ReverseGeocodeFn` contract. If this
 * file is green with the adapter deleted from the package, candidate A ships.
 *
 * The two shapes a real consumer actually has:
 *   1. a static/offline provider (no network at all)
 *   2. a backend-proxy provider (the key lives on the consumer's server and
 *      never reaches the client — the only shape a KEYED provider can take
 *      in a component that must not hold credentials)
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GeocodeResult, Geocoder } from './geocoder';

import { Geolocation } from './index';

const HELSINKI = JSON.stringify({ lat: 60.16952, lng: 24.93545 });
const SYDNEY = JSON.stringify({ lat: -33.8688, lng: 151.2093 });

const searchInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>("[data-testid='geolocation-search']") ??
  container.querySelector<HTMLInputElement>("[aria-label='Search for a location']");

const typeSearch = (container: HTMLElement, text: string) => {
  const input = searchInput(container);
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { value: text } });
};

/**
 * Consumer provider #1 — offline gazetteer. No network, no key, no adapter.
 * This is the whole implementation; it is what candidate A asks a consumer to
 * write, and it is 14 lines.
 */
const gazetteer: GeocodeResult[] = [
  { lat: 60.16952, lng: 24.93545, label: 'Mannerheimintie 3', description: 'Kamppi, Helsinki' },
  { lat: -33.8688, lng: 151.2093, label: 'Sydney', description: 'New South Wales, Australia' },
];

const offlineGeocoder = {
  geocode: async ({ query }) =>
    gazetteer.filter((place) => place.label.toLowerCase().includes(query.trim().toLowerCase())),
  reverseGeocode: async ({ lat, lng }) =>
    gazetteer.find((place) => Math.abs(place.lat - lat) < 0.01 && Math.abs(place.lng - lng) < 0.01) ?? null,
} satisfies Geocoder;

/**
 * Consumer provider #2 — backend proxy. The consumer's own server holds the
 * provider key; the component sees only `fetch`. This is the shape a keyed
 * provider must take, and the reason the seam is the load-bearing half
 * under BOTH candidates.
 */
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const createProxyGeocoder = (options: { endpoint: string; fetch: FetchFn }): Geocoder => {
  const call = async <T,>(path: string, params: Record<string, string>): Promise<T> => {
    const url = new URL(path, options.endpoint);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const response = await options.fetch(url.toString());
    if (!response.ok) {
      throw new Error(`proxy geocoder failed (${response.status})`);
    }
    return (await response.json()) as T;
  };
  return {
    geocode: async ({ query }) => await call<GeocodeResult[]>('search', { q: query }),
    reverseGeocode: async ({ lat, lng }) =>
      await call<GeocodeResult | null>('reverse', { lat: String(lat), lng: String(lng) }),
  };
};

describe('candidate A — a consumer-authored geocoder satisfies the seam', () => {
  it('type-level: a hand-written object satisfies Geocoder with no package adapter', () => {
    // `satisfies Geocoder` above is the compile-time assertion; this asserts the
    // same contract at runtime so the evidence is not purely structural.
    expect(offlineGeocoder.geocode).toBeTypeOf('function');
    expect(offlineGeocoder.reverseGeocode).toBeTypeOf('function');
    const proxy = createProxyGeocoder({
      endpoint: 'https://app.example/geo/',
      fetch: vi.fn<FetchFn>(),
    });
    expect(proxy.geocode).toBeTypeOf('function');
    expect(proxy.reverseGeocode).toBeTypeOf('function');
  });

  it('offline provider drives the whole field: search, pick, value, address', async () => {
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <Geolocation
        label="Location"
        geocoder={offlineGeocoder}
        onChange={onChange}
      />,
    );

    typeSearch(result.container, 'sydney');
    await waitFor(() => {
      expect(document.querySelector("[data-testid='geolocation-results']")).not.toBeNull();
      expect(document.body.textContent).toContain('Sydney');
      expect(document.body.textContent).toContain('New South Wales, Australia');
    });

    fireEvent.click(document.querySelector("[data-testid='geolocation-result-0']")!);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(SYDNEY);
    });
    expect(searchInput(result.container)?.value).toBe('Sydney, New South Wales, Australia');
  });

  it('offline provider reverse-geocodes a set value into the address face', async () => {
    const result = renderWithProviders(
      <Geolocation
        label="Location"
        value={HELSINKI}
        geocoder={offlineGeocoder}
      />,
    );
    await waitFor(() => {
      expect(searchInput(result.container)?.value).toBe('Mannerheimintie 3, Kamppi, Helsinki');
    });
    expect(result.container.textContent).toContain('60.16952, 24.93545');
  });

  it('backend-proxy provider drives the same field through injected fetch only', async () => {
    const fetchImpl = vi.fn<FetchFn>(async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/search')) {
        return Response.json([
          {
            lat: 60.16952,
            lng: 24.93545,
            label: 'Mannerheimintie 3',
            description: 'Kamppi, Helsinki',
          },
        ]);
      }
      return Response.json(null);
    });
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <Geolocation
        label="Location"
        geocoder={createProxyGeocoder({
          endpoint: 'https://app.example/geo/',
          fetch: fetchImpl,
        })}
        onChange={onChange}
      />,
    );

    typeSearch(result.container, 'manner');
    await waitFor(() => {
      expect(document.body.textContent).toContain('Mannerheimintie 3');
    });
    fireEvent.click(document.querySelector("[data-testid='geolocation-result-0']")!);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(HELSINKI);
    });
    // No credential ever reaches the component: it only ever saw a fetch.
    const calledUrl = fetchImpl.mock.calls[0]?.[0];
    expect(calledUrl).toContain('app.example');
    expect(calledUrl).not.toContain('nominatim');
  });

  it('swapping providers is a prop change — the component is untouched', async () => {
    const first = renderWithProviders(
      <Geolocation
        label="Location"
        value={HELSINKI}
        geocoder={offlineGeocoder}
      />,
    );
    await waitFor(() => {
      expect(searchInput(first.container)?.value).toBe('Mannerheimintie 3, Kamppi, Helsinki');
    });

    const renamed: Geocoder = {
      geocode: offlineGeocoder.geocode,
      reverseGeocode: async () => ({ lat: 60.16952, lng: 24.93545, label: 'HQ' }),
    };
    const second = renderWithProviders(
      <Geolocation
        label="Location"
        value={HELSINKI}
        geocoder={renamed}
      />,
    );
    await waitFor(() => {
      expect(searchInput(second.container)?.value).toBe('HQ');
    });
  });

  it('a failing consumer provider degrades honestly — map and pair survive', async () => {
    const broken: Geocoder = {
      geocode: async () => {
        throw new Error('consumer provider down');
      },
      reverseGeocode: async () => {
        throw new Error('consumer provider down');
      },
    };
    const result = renderWithProviders(
      <Geolocation
        label="Location"
        value={HELSINKI}
        geocoder={broken}
      />,
    );
    typeSearch(result.container, 'manner');
    await waitFor(() => {
      expect(result.container.querySelector("[data-testid='geolocation-map']")).not.toBeNull();
    });
    expect(result.container.querySelector("[data-testid='geolocation-coordline']")).not.toBeNull();
    expect(result.container.textContent).toContain('60.16952, 24.93545');
  });
});

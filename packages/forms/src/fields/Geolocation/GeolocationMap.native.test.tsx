import { renderWithProviders } from '@repo/test-utils';
import React, { useImperativeHandle } from 'react';
import type { ReactElement, Ref } from 'react';
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadExpoMaps } from './expo-maps-loader';
import { GeolocationMap } from './GeolocationMap.native';

import { Geolocation } from './index';

// The optional-peer loader is the mock seam: on-device it try/catch-requires
// `expo-maps` (Metro optional dependency); here we swap the module wholesale.
vi.mock(import('./expo-maps-loader'), () => ({
  loadExpoMaps: vi.fn<typeof loadExpoMaps>(() => null),
}));

const loadExpoMapsMock = vi.mocked(loadExpoMaps);

interface CameraPosition {
  coordinates: { latitude: number; longitude: number };
  zoom: number;
}

const setCameraPosition = vi.fn<(position: CameraPosition) => void>();

interface MapClickEvent {
  coordinates?: { latitude?: number; longitude?: number };
}

interface MapViewProps {
  ref?: Ref<{ setCameraPosition: typeof setCameraPosition }>;
  markers?: unknown[];
  cameraPosition?: unknown;
  onMapClick?: (event: MapClickEvent) => void;
  onMapLongClick?: (event: MapClickEvent) => void;
}

const AppleView = vi.fn<(props: MapViewProps) => ReactElement>((props) => {
  useImperativeHandle(props.ref, () => ({ setCameraPosition }));
  return React.createElement('div', { 'data-testid': 'apple-maps-view' });
});
const GoogleView = vi.fn<(props: MapViewProps) => ReactElement>((props) => {
  useImperativeHandle(props.ref, () => ({ setCameraPosition }));
  return React.createElement('div', { 'data-testid': 'google-maps-view' });
});

/** Props of the most recent render, or undefined when the view never rendered. */
const appleProps = () => AppleView.mock.lastCall?.[0];
const googleProps = () => GoogleView.mock.lastCall?.[0];

const createMapsMock = () =>
  ({
    AppleMaps: { View: AppleView },
    GoogleMaps: { View: GoogleView },
  }) as unknown as NonNullable<ReturnType<typeof loadExpoMaps>>;

const setPlatformOS = (os: string) => {
  Object.defineProperty(Platform, 'OS', { value: os, writable: true, configurable: true });
};

describe('GeolocationMap (native)', () => {
  beforeEach(() => {
    AppleView.mockClear();
    GoogleView.mockClear();
    setCameraPosition.mockClear();
    loadExpoMapsMock.mockReset();
    loadExpoMapsMock.mockReturnValue(null);
  });

  afterEach(() => {
    setPlatformOS('web');
  });

  it('renders the Apple map with the value marker on iOS', () => {
    setPlatformOS('ios');
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn<(lat: number, lng: number) => void>();
    const result = renderWithProviders(
      <GeolocationMap
        lat={51.5}
        lng={-0.12}
        onChange={onChange}
      />,
    );
    expect(result.getByTestId('apple-maps-view')).toBeTruthy();
    expect(result.container.querySelector("[data-testid='geolocation-native-map']")).not.toBeNull();
    expect(appleProps()?.markers).toStrictEqual([
      expect.objectContaining({ coordinates: { latitude: 51.5, longitude: -0.12 } }),
    ]);
    expect(appleProps()?.cameraPosition).toStrictEqual({
      coordinates: { latitude: 51.5, longitude: -0.12 },
      zoom: 13,
    });
  });

  it('tap on the Apple map commits picked coordinates through onChange', () => {
    setPlatformOS('ios');
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn<(lat: number, lng: number) => void>();
    renderWithProviders(
      <GeolocationMap
        lat={10}
        lng={20}
        onChange={onChange}
      />,
    );
    appleProps()?.onMapClick?.({ coordinates: { latitude: 12.5, longitude: 99.25 } });
    expect(onChange).toHaveBeenCalledWith(12.5, 99.25);
    // Apple has no long-press pick in expo-maps SDK 55 — tap only.
    expect(appleProps()?.onMapLongClick).toBeUndefined();
  });

  it('renders the Google map on Android with tap and long-press pick', () => {
    setPlatformOS('android');
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn<(lat: number, lng: number) => void>();
    const result = renderWithProviders(
      <GeolocationMap
        lat={10}
        lng={20}
        onChange={onChange}
      />,
    );
    expect(result.getByTestId('google-maps-view')).toBeTruthy();
    expect(googleProps()?.markers).toStrictEqual([
      expect.objectContaining({ coordinates: { latitude: 10, longitude: 20 } }),
    ]);
    googleProps()?.onMapClick?.({ coordinates: { latitude: 1.5, longitude: 2.5 } });
    expect(onChange).toHaveBeenCalledWith(1.5, 2.5);
    googleProps()?.onMapLongClick?.({ coordinates: { latitude: -3, longitude: -4 } });
    expect(onChange).toHaveBeenCalledWith(-3, -4);
  });

  it('does not attach pick handlers when disabled or readOnly', () => {
    setPlatformOS('ios');
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn<(lat: number, lng: number) => void>();

    renderWithProviders(
      <GeolocationMap
        lat={10}
        lng={20}
        onChange={onChange}
        disabled
      />,
    );
    expect(appleProps()?.onMapClick).toBeUndefined();

    AppleView.mockClear();
    renderWithProviders(
      <GeolocationMap
        lat={10}
        lng={20}
        onChange={onChange}
        readOnly
      />,
    );
    expect(appleProps()?.onMapClick).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('omits the value marker when hasValue is false', () => {
    setPlatformOS('ios');
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    renderWithProviders(
      <GeolocationMap
        lat={0}
        lng={0}
        hasValue={false}
        onChange={vi.fn<(lat: number, lng: number) => void>()}
      />,
    );
    expect(appleProps()?.markers).toStrictEqual([]);
  });

  it('ignores click events without numeric coordinates', () => {
    setPlatformOS('ios');
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn<(lat: number, lng: number) => void>();
    renderWithProviders(
      <GeolocationMap
        lat={10}
        lng={20}
        onChange={onChange}
      />,
    );
    appleProps()?.onMapClick?.({ coordinates: {} });
    appleProps()?.onMapClick?.({});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('recenters the camera when the bound value changes after mount', () => {
    setPlatformOS('ios');
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn<(lat: number, lng: number) => void>();
    const result = renderWithProviders(
      <GeolocationMap
        lat={10}
        lng={20}
        onChange={onChange}
      />,
    );
    // Initial mount uses the declarative cameraPosition — no imperative call.
    expect(setCameraPosition).not.toHaveBeenCalled();
    result.rerender(
      <GeolocationMap
        lat={11}
        lng={21}
        onChange={onChange}
      />,
    );
    expect(setCameraPosition).toHaveBeenCalledWith({
      coordinates: { latitude: 11, longitude: 21 },
      zoom: 13,
    });
  });

  it('falls back to the placeholder when expo-maps is absent', () => {
    setPlatformOS('ios');
    loadExpoMapsMock.mockReturnValue(null);
    const result = renderWithProviders(
      <GeolocationMap
        lat={51.5}
        lng={-0.12}
      />,
    );
    const fallback = result.container.querySelector("[data-testid='geolocation-map-fallback']");
    expect(fallback).not.toBeNull();
    expect(result.container.textContent).toContain('Map preview unavailable');
    expect(result.container.textContent).toContain('51.5000, -0.1200');
    expect(result.container.querySelector("[data-testid='apple-maps-view']")).toBeNull();
  });

  it('falls back to the placeholder on platforms without a native map', () => {
    // Platform.OS stays "web" (react-native-web default in this environment).
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const result = renderWithProviders(
      <GeolocationMap
        lat={1}
        lng={2}
      />,
    );
    expect(result.container.querySelector("[data-testid='geolocation-map-fallback']")).not.toBeNull();
    expect(AppleView).not.toHaveBeenCalled();
    expect(GoogleView).not.toHaveBeenCalled();
  });
});

describe('Geolocation field map wiring', () => {
  it("map picks commit through the field's existing onChange path (clamped JSON)", () => {
    const onChange = vi.fn<(value: string) => void>();
    // renderMap receives the same onChange handler the built-in platform map
    // uses (makeHandlers.onMapChange) — proves pick → commit wiring.
    let mapProps: { onChange: (lat: number, lng: number) => void } | null = null;
    renderWithProviders(
      <Geolocation
        label="Location"
        name="loc"
        locationIcon=<span data-testid="location-icon" />
        value={JSON.stringify({ lat: 10, lng: 20 })}
        onChange={onChange}
        renderMap={(props) => {
          mapProps = props;
          return null;
        }}
      />,
    );
    mapProps!.onChange(12.5, 99.25);
    expect(onChange).toHaveBeenCalledWith(JSON.stringify({ lat: 12.5, lng: 99.25 }));
    mapProps!.onChange(1234, -5678);
    expect(onChange).toHaveBeenCalledWith(JSON.stringify({ lat: 90, lng: -180 }));
  });
});

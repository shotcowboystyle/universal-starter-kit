import { renderWithProviders } from '@repo/test-utils';
import React, { useImperativeHandle } from 'react';
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadExpoMaps } from './expoMapsLoader';
import { GeolocationMap } from './GeolocationMap.native';

import { Geolocation } from './index';

// The optional-peer loader is the mock seam: on-device it try/catch-requires
// `expo-maps` (Metro optional dependency); here we swap the module wholesale.
vi.mock('./expoMapsLoader', () => ({
  loadExpoMaps: vi.fn(() => null),
}));

const loadExpoMapsMock = vi.mocked(loadExpoMaps);

type AnyProps = Record<string, any>;

let appleProps: AnyProps | null = null;
let googleProps: AnyProps | null = null;
const setCameraPosition = vi.fn();

/** Reset captured props inside a function so TS flow analysis can't narrow the lets to `null`. */
function resetCapturedProps() {
  appleProps = null;
  googleProps = null;
}

function createMapsMock() {
  function AppleView(props: AnyProps) {
    appleProps = props;
    useImperativeHandle(props.ref, () => ({ setCameraPosition }));
    return React.createElement('div', { 'data-testid': 'apple-maps-view' });
  }
  function GoogleView(props: AnyProps) {
    googleProps = props;
    useImperativeHandle(props.ref, () => ({ setCameraPosition }));
    return React.createElement('div', { 'data-testid': 'google-maps-view' });
  }
  return {
    AppleMaps: { View: AppleView },
    GoogleMaps: { View: GoogleView },
  } as unknown as NonNullable<ReturnType<typeof loadExpoMaps>>;
}

describe('GeolocationMap (native)', () => {
  beforeEach(() => {
    appleProps = null;
    googleProps = null;
    setCameraPosition.mockClear();
    loadExpoMapsMock.mockReset();
    loadExpoMapsMock.mockReturnValue(null);
  });

  afterEach(() => {
    (Platform as AnyProps).OS = 'web';
  });

  it('renders the Apple map with the value marker on iOS', () => {
    (Platform as AnyProps).OS = 'ios';
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn();
    const result = renderWithProviders(<GeolocationMap lat={51.5} lng={-0.12} onChange={onChange} />);
    expect(result.getByTestId('apple-maps-view')).toBeTruthy();
    expect(result.container.querySelector("[data-testid='geolocation-native-map']")).not.toBeNull();
    expect(appleProps?.markers).toEqual([
      expect.objectContaining({ coordinates: { latitude: 51.5, longitude: -0.12 } }),
    ]);
    expect(appleProps?.cameraPosition).toEqual({
      coordinates: { latitude: 51.5, longitude: -0.12 },
      zoom: 13,
    });
  });

  it('tap on the Apple map commits picked coordinates through onChange', () => {
    (Platform as AnyProps).OS = 'ios';
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn();
    renderWithProviders(<GeolocationMap lat={10} lng={20} onChange={onChange} />);
    appleProps?.onMapClick?.({ coordinates: { latitude: 12.5, longitude: 99.25 } });
    expect(onChange).toHaveBeenCalledWith(12.5, 99.25);
    // Apple has no long-press pick in expo-maps SDK 55 — tap only.
    expect(appleProps?.onMapLongClick).toBeUndefined();
  });

  it('renders the Google map on Android with tap and long-press pick', () => {
    (Platform as AnyProps).OS = 'android';
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn();
    const result = renderWithProviders(<GeolocationMap lat={10} lng={20} onChange={onChange} />);
    expect(result.getByTestId('google-maps-view')).toBeTruthy();
    expect(googleProps?.markers).toEqual([expect.objectContaining({ coordinates: { latitude: 10, longitude: 20 } })]);
    googleProps?.onMapClick?.({ coordinates: { latitude: 1.5, longitude: 2.5 } });
    expect(onChange).toHaveBeenCalledWith(1.5, 2.5);
    googleProps?.onMapLongClick?.({ coordinates: { latitude: -3, longitude: -4 } });
    expect(onChange).toHaveBeenCalledWith(-3, -4);
  });

  it('does not attach pick handlers when disabled or readOnly', () => {
    (Platform as AnyProps).OS = 'ios';
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn();

    renderWithProviders(<GeolocationMap lat={10} lng={20} onChange={onChange} disabled />);
    expect(appleProps?.onMapClick).toBeUndefined();

    resetCapturedProps();
    renderWithProviders(<GeolocationMap lat={10} lng={20} onChange={onChange} readOnly />);
    expect(appleProps?.onMapClick).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('omits the value marker when hasValue is false', () => {
    (Platform as AnyProps).OS = 'ios';
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    renderWithProviders(<GeolocationMap lat={0} lng={0} hasValue={false} onChange={vi.fn()} />);
    expect(appleProps?.markers).toEqual([]);
  });

  it('ignores click events without numeric coordinates', () => {
    (Platform as AnyProps).OS = 'ios';
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn();
    renderWithProviders(<GeolocationMap lat={10} lng={20} onChange={onChange} />);
    appleProps?.onMapClick?.({ coordinates: {} });
    appleProps?.onMapClick?.({});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('recenters the camera when the bound value changes after mount', () => {
    (Platform as AnyProps).OS = 'ios';
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const onChange = vi.fn();
    const result = renderWithProviders(<GeolocationMap lat={10} lng={20} onChange={onChange} />);
    // Initial mount uses the declarative cameraPosition — no imperative call.
    expect(setCameraPosition).not.toHaveBeenCalled();
    result.rerender(<GeolocationMap lat={11} lng={21} onChange={onChange} />);
    expect(setCameraPosition).toHaveBeenCalledWith({
      coordinates: { latitude: 11, longitude: 21 },
      zoom: 13,
    });
  });

  it('falls back to the placeholder when expo-maps is absent', () => {
    (Platform as AnyProps).OS = 'ios';
    loadExpoMapsMock.mockReturnValue(null);
    const result = renderWithProviders(<GeolocationMap lat={51.5} lng={-0.12} />);
    const fallback = result.container.querySelector("[data-testid='geolocation-map-fallback']");
    expect(fallback).not.toBeNull();
    expect(result.container.textContent).toContain('Map preview unavailable');
    expect(result.container.textContent).toContain('51.5000, -0.1200');
    expect(result.container.querySelector("[data-testid='apple-maps-view']")).toBeNull();
  });

  it('falls back to the placeholder on platforms without a native map', () => {
    // Platform.OS stays "web" (react-native-web default in this environment).
    loadExpoMapsMock.mockReturnValue(createMapsMock());
    const result = renderWithProviders(<GeolocationMap lat={1} lng={2} />);
    expect(result.container.querySelector("[data-testid='geolocation-map-fallback']")).not.toBeNull();
    expect(appleProps).toBeNull();
    expect(googleProps).toBeNull();
  });
});

describe('Geolocation field map wiring', () => {
  it("map picks commit through the field's existing onChange path (clamped JSON)", () => {
    const onChange = vi.fn();
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

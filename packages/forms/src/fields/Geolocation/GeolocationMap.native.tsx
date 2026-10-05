// Type-only imports are erased at runtime — the value module loads through
// `loadExpoMaps` so the peer stays optional (Video / expo-video precedent).
import type { AppleMaps as AppleMapsNS, GoogleMaps as GoogleMapsNS } from 'expo-maps';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Text, YStack } from 'tamagui';

import { t } from '../../shared/t';

import { loadExpoMaps } from './expoMapsLoader';
import { zoomFromDelta } from './mapMath';
import type { GeolocationMapSurfaceProps } from './mapTypes';

interface MapClickEvent {
  coordinates?: { latitude?: number; longitude?: number };
}

/**
 * Placeholder when no native map can render (module absent — e.g. Expo Go or
 * a consumer that skipped the optional peer — or an unsupported platform).
 */
function MapFallback({
  lat,
  lng,
  minHeight,
  hasValue,
}: {
  lat: number;
  lng: number;
  minHeight?: number;
  hasValue?: boolean;
}) {
  return (
    <YStack
      testID="geolocation-map-fallback"
      flex={1}
      minHeight={minHeight}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$backgroundHover"
      gap="$1">
      <Text color="$color11" fontSize="$2">
        {t('Map preview unavailable — requires expo-maps')}
      </Text>
      <Text color="$color11" fontSize="$1">
        {hasValue === false ? t('No location set') : `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
      </Text>
    </YStack>
  );
}

/**
 * Native map surface — a real map through the optional `expo-maps` peer
 * (SDK 55+): Apple Maps on iOS, Google Maps on Android (mirrors the
 * components Video / expo-video split). The marker mirrors the bound value;
 * tap (and long-press on Android) picks a coordinate and commits through the
 * field's existing onChange path. When the module is missing the surface
 * degrades to the placeholder instead of crashing — `loadExpoMaps` requires
 * it as a Metro optional dependency.
 *
 * Output surface of the search-first field. Search and the
 * coordinate disclosure live in the parent.
 */
export function GeolocationMap({
  lat,
  lng,
  delta = 0.02,
  minHeight,
  onChange,
  disabled,
  readOnly,
  hasValue = true,
}: GeolocationMapSurfaceProps) {
  const maps = loadExpoMaps();
  const appleRef = useRef<AppleMapsNS.MapView | null>(null);
  const googleRef = useRef<GoogleMapsNS.MapView | null>(null);
  const mountedRef = useRef(false);
  const zoom = zoomFromDelta(delta);

  // `cameraPosition` is initial-only in expo-maps: follow later value changes
  // (Locate, coordinates panel, pick) so the marker never leaves the viewport.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const view = appleRef.current ?? googleRef.current;
    view?.setCameraPosition({ coordinates: { latitude: lat, longitude: lng }, zoom });
  }, [lat, lng, zoom]);

  if (!maps || (Platform.OS !== 'ios' && Platform.OS !== 'android')) {
    return <MapFallback lat={lat} lng={lng} minHeight={minHeight} hasValue={hasValue} />;
  }

  const interactive = !disabled && !readOnly && typeof onChange === 'function';
  const handlePick = interactive
    ? (event: MapClickEvent) => {
        const { latitude, longitude } = event?.coordinates ?? {};
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
          return;
        }
        onChange?.(latitude, longitude);
      }
    : undefined;

  const cameraPosition = { coordinates: { latitude: lat, longitude: lng }, zoom };
  const markers = hasValue
    ? [
        {
          id: 'geolocation-value',
          coordinates: { latitude: lat, longitude: lng },
          title: t('Selected location'),
        },
      ]
    : [];

  if (Platform.OS === 'ios') {
    const AppleMapsView = maps.AppleMaps.View;
    return (
      <YStack testID="geolocation-native-map" flex={1} minHeight={minHeight}>
        <AppleMapsView
          ref={appleRef}
          style={{ flex: 1 }}
          cameraPosition={cameraPosition}
          markers={markers}
          onMapClick={handlePick}
        />
      </YStack>
    );
  }

  const GoogleMapsView = maps.GoogleMaps.View;
  return (
    <YStack testID="geolocation-native-map" flex={1} minHeight={minHeight}>
      <GoogleMapsView
        ref={googleRef}
        style={{ flex: 1 }}
        cameraPosition={cameraPosition}
        markers={markers}
        onMapClick={handlePick}
        onMapLongClick={handlePick}
      />
    </YStack>
  );
}

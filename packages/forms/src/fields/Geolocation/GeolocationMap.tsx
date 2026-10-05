import { MapPinIcon } from '@phosphor-icons/react';
import { useCallback, useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Text, View, YStack } from 'tamagui';

import { formCommonColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';

import { OSM_TILE_SIZE, latLngFromMapClick, tilesForView, zoomFromDelta } from './mapMath';
import type { GeolocationMapSurfaceProps } from './mapTypes';

function tileSrc(zoom: number, x: number, y: number) {
  if (typeof process !== 'undefined' && process.env.VITEST) {
    return '';
  }
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

/**
 * Web map surface — OSM tiles we own the projection of, so click-to-pick
 * (Frappe Desk / Leaflet, Google/Apple compact pickers) can commit through
 * the field's onChange path. The iframe embed could not report clicks.
 * Native interactive maps live in `GeolocationMap.native.tsx`.
 *
 * This surface is the OUTPUT of the search-first field. Search,
 * geocoding, and the coordinate disclosure live in the parent — nothing
 * here is an input pasted over the tiles.
 */
export function GeolocationMap({
  lat,
  lng,
  delta = 0.02,
  minHeight,
  title = t('Location preview'),
  onChange,
  disabled,
  readOnly,
  hasValue = true,
}: GeolocationMapSurfaceProps) {
  const zoom = zoomFromDelta(delta);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const interactive = !disabled && !readOnly && typeof onChange === 'function';

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const tiles = useMemo(
    () => tilesForView({ lat, lng, zoom, width: box.width, height: box.height }),
    [lat, lng, zoom, box.width, box.height],
  );

  const handlePick = useCallback(
    (clientX: number, clientY: number, target: { getBoundingClientRect: () => DOMRect }) => {
      if (!interactive) {
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        return;
      }
      const next = latLngFromMapClick({
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top,
        width: rect.width,
        height: rect.height,
        lat,
        lng,
        zoom,
      });
      onChange?.(next.lat, next.lng);
    },
    [interactive, lat, lng, zoom, onChange],
  );

  return (
    <YStack
      testID="geolocation-web-map"
      flex={1}
      minHeight={minHeight}
      height="100%"
      overflow="hidden"
      position="relative"
      backgroundColor="$backgroundHover"
      onLayout={onLayout}
      aria-label={title}>
      {typeof process !== 'undefined' && process.env.VITEST
        ? null
        : tiles.map((tile) => (
            <img
              key={`${zoom}-${tile.tx}-${tile.ty}-${Math.round(tile.left)}-${Math.round(tile.top)}`}
              alt=""
              draggable={false}
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden';
              }}
              src={tileSrc(zoom, tile.tx, tile.ty)}
              width={OSM_TILE_SIZE}
              height={OSM_TILE_SIZE}
              style={{
                position: 'absolute',
                left: tile.left,
                top: tile.top,
                width: OSM_TILE_SIZE,
                height: OSM_TILE_SIZE,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          ))}

      {hasValue ? (
        <View
          testID="geolocation-map-pin"
          position="absolute"
          top="50%"
          left="50%"
          x={-14}
          y={-28}
          pointerEvents="none"
          zIndex={1}
          // `color` tints the phosphor pin via currentColor; Tamagui applies it
          // on web Views though the RN-flavored View type omits it.
          {...({ color: '$red10' } as Record<string, unknown>)}>
          <MapPinIcon size={28} weight="fill" />
        </View>
      ) : null}

      {interactive ? (
        <YStack
          testID="geolocation-map-pick"
          position="absolute"
          top={0}
          right={0}
          bottom={0}
          left={0}
          zIndex={1}
          cursor="crosshair"
          {...{
            onClick: (event: {
              clientX: number;
              clientY: number;
              currentTarget: { getBoundingClientRect: () => DOMRect };
            }) => {
              handlePick(event.clientX, event.clientY, event.currentTarget);
            },
          }}
        />
      ) : null}

      <Text
        position="absolute"
        bottom="$1"
        insetInlineStart="$2"
        fontSize={10}
        color={formCommonColors.muted}
        pointerEvents="none"
        zIndex={1}>
        {t('© OpenStreetMap')}
      </Text>
    </YStack>
  );
}

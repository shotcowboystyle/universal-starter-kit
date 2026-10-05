import { MagnifyingGlassIcon, MapPinIcon, NavigationArrowIcon, XIcon } from '@phosphor-icons/react';
import {
  ensureFocusVisibleRing,
  pressTargetHitSlop,
  useResolvedKnobs,
  useGlyphColor,
  useTouchSurface,
  type KnobProps,
} from '@repo/theme';
import type { KeyboardEvent, MutableRefObject, ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { ScrollView, Spinner, Text, View, XStack, YStack, isWeb } from 'tamagui';

import { AdaptivePopup } from '../../AdaptivePopup';
import { Button } from '../../Button';
import { Field, FieldLayout } from '../../fieldLayout';
import { FloatingPanel, useViewportGtSm } from '../../FloatingPanel';
import { Input as InputParts } from '../../InputParts';
import { queryPermissionState, type CapabilityPreflightResult } from '../../shared/capabilityPreflight';
import { formCommonColors, formInputColors } from '../../shared/colorRamps';
import { pressSlopProps } from '../../shared/pressSlopProps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/tableCellContext';
import {
  clampRadiusForLargeComponent,
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { zIndex } from '../../shared/zIndex';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

import type { GeocodeFn, GeocodeResult, Geocoder, ReverseGeocodeFn } from './geocoder';
import { clampLat, clampLng, formatCoordPair, formatPlace, parseLatLngPair, resolveGeocoder } from './geocoder';
import { useGeocoder } from './geocoderContext';
import { GeolocationMap } from './GeolocationMap';
import { detectGeoShape, formatGeoValue, parseGeoValue } from './geoValue';
import { createNativeSearchFocus } from './nativeSearchFocus';

export type {
  GeocodeFn,
  GeocodeQuery,
  GeocodeResult,
  Geocoder,
  ReverseGeocodeFn,
  ReverseGeocodeQuery,
} from './geocoder';
export { clampLat, clampLng, formatCoordPair, formatPlace, parseLatLngPair, resolveGeocoder } from './geocoder';

type LocatePhase = 'idle' | 'locating' | 'error';
type SearchStatus = 'idle' | 'searching' | 'results' | 'empty' | 'error';
interface ResolvedAddress {
  key: string;
  label: string;
}

function coordinateKey({ lat, lng }: { lat: number; lng: number }): string {
  return `${lat},${lng}`;
}

const SEARCH_DEBOUNCE_MS = 300;
const COORD_LINE_HEIGHT = 28;
const RESULTS_PANEL_SHADOW = '0px 8px 28px rgba(0,0,0,0.12), 0px 2px 6px rgba(0,0,0,0.04)';

/**
 * Geolocation capability pre-flight. Runs BEFORE
 * the locate surface / permission prompt is presented: checks secure context,
 * geolocation API support, and that permission is not hard-denied. A `prompt`
 * permission state passes — the prompt happens inside the stable locate
 * surface, never as a locating-flash-then-fail flicker.
 */
export async function preflightGeolocation(): Promise<CapabilityPreflightResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    const insecure = typeof window !== 'undefined' && !window.isSecureContext;
    return {
      ok: false,
      reason: insecure
        ? t('Geolocation unavailable: insecure context (HTTPS required).')
        : t('Geolocation unavailable: not supported in this browser.'),
    };
  }
  const permission = await queryPermissionState('geolocation');
  if (permission === 'denied') {
    return {
      ok: false,
      reason: t('Geolocation unavailable: permission denied. Allow location access in browser settings.'),
    };
  }
  return { ok: true };
}

function mapGeolocationError(err: GeolocationPositionError | { message?: string; code?: number }): string {
  const code = 'code' in err ? err.code : undefined;
  if (code === 1) {
    return t('Location permission denied. Please allow location access.');
  }
  if (code === 2) {
    return t('Location unavailable. Try again or enter coordinates manually.');
  }
  if (code === 3) {
    return t('Location request timed out. Try again.');
  }
  return err.message || t('Failed to get location');
}

/**
 * Parse a coordinate draft. Returns undefined while the user is mid-keystroke
 * (empty, lone minus, trailing decimal) so we don't clobber the bound value.
 */
function tryParseCoord(text: string, clamp: (n: number) => number): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
    return undefined;
  }
  if (trimmed.endsWith('.')) {
    return undefined;
  }
  const n = Number.parseFloat(trimmed);
  if (Number.isNaN(n)) {
    return undefined;
  }
  return clamp(n);
}

/**
 * Draft Lat/Lng editor hosted inside FloatingPanel.
 * Valid parses commit live — no Apply/Done. Outside/Escape closes the panel;
 * parent flushes any remaining draft via `flushRef` on dismiss.
 */
function CoordinatesPanel({
  lat,
  lng,
  onCommit,
  flushRef,
  knobProps,
  required,
  hasError,
}: {
  lat: number;
  lng: number;
  onCommit: (lat: number, lng: number) => void;
  flushRef: MutableRefObject<(() => void) | null>;
  knobProps: KnobProps;
  required?: boolean;
  hasError?: boolean;
}) {
  const [latText, setLatText] = useState(String(lat));
  const [lngText, setLngText] = useState(String(lng));
  const latTextRef = useRef(latText);
  const lngTextRef = useRef(lngText);
  const committedRef = useRef({ lat, lng });

  useEffect(() => {
    setLatText(String(lat));
    setLngText(String(lng));
    latTextRef.current = String(lat);
    lngTextRef.current = String(lng);
    committedRef.current = { lat, lng };
  }, [lat, lng]);

  const commitPair = useCallback(
    (nextLat: number, nextLng: number) => {
      if (nextLat === committedRef.current.lat && nextLng === committedRef.current.lng) {
        return;
      }
      committedRef.current = { lat: nextLat, lng: nextLng };
      onCommit(nextLat, nextLng);
    },
    [onCommit],
  );

  const flushDraft = useCallback(() => {
    const rawLat = Number.parseFloat(latTextRef.current);
    const rawLng = Number.parseFloat(lngTextRef.current);
    const nextLat = Number.isNaN(rawLat) ? committedRef.current.lat : clampLat(rawLat);
    const nextLng = Number.isNaN(rawLng) ? committedRef.current.lng : clampLng(rawLng);
    commitPair(nextLat, nextLng);
  }, [commitPair]);

  useEffect(() => {
    flushRef.current = flushDraft;
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, flushDraft]);

  const handleLatChange = (text: string) => {
    setLatText(text);
    latTextRef.current = text;
    const parsed = tryParseCoord(text, clampLat);
    if (parsed !== undefined) {
      commitPair(parsed, committedRef.current.lng);
    }
  };

  const handleLngChange = (text: string) => {
    setLngText(text);
    lngTextRef.current = text;
    const parsed = tryParseCoord(text, clampLng);
    if (parsed !== undefined) {
      commitPair(committedRef.current.lat, parsed);
    }
  };

  return (
    <YStack testID="geolocation-coords-panel" gap="$3" minWidth={260} {...knobProps.panelPadding}>
      <YStack gap="$1">
        <Text fontSize="$1" {...knobProps.body} color={formCommonColors.muted}>
          {t('Lat')}
        </Text>
        <InputParts size={knobProps.sizeToken}>
          <InputParts.Box>
            <InputParts.Area
              value={latText}
              onChangeText={handleLatChange}
              onBlur={flushDraft}
              placeholder={t('-90 to 90')}
              inputMode="decimal"
              aria-label={t('Latitude')}
              aria-required={required || undefined}
              aria-invalid={hasError || undefined}
            />
          </InputParts.Box>
        </InputParts>
      </YStack>
      <YStack gap="$1">
        <Text fontSize="$1" {...knobProps.body} color={formCommonColors.muted}>
          {t('Lng')}
        </Text>
        <InputParts size={knobProps.sizeToken}>
          <InputParts.Box>
            <InputParts.Area
              value={lngText}
              onChangeText={handleLngChange}
              onBlur={flushDraft}
              placeholder={t('-180 to 180')}
              inputMode="decimal"
              aria-label={t('Longitude')}
              aria-required={required || undefined}
              aria-invalid={hasError || undefined}
            />
          </InputParts.Box>
        </InputParts>
      </YStack>
    </YStack>
  );
}

function ExpandedMapView({
  lat,
  lng,
  onChange,
  disabled,
  readOnly,
  hasValue,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  disabled: boolean;
  readOnly?: boolean;
  hasValue: boolean;
}) {
  const { knobProps } = useResolvedKnobs();

  return (
    <YStack flex={1} minHeight={400} borderRadius={knobProps.borderRadius.borderRadius} overflow="hidden">
      <GeolocationMap
        lat={lat}
        lng={lng}
        delta={hasValue ? 0.05 : 40}
        minHeight={400}
        title={t('Location selection')}
        onChange={onChange}
        disabled={disabled}
        readOnly={readOnly}
        hasValue={hasValue}
      />
    </YStack>
  );
}

export interface GeolocationMapProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  disabled: boolean;
  knobProps: KnobProps;
}

/** The map frame and the coordinate line take a 2px ring at offset 0 (media-13). */
const overlayFocusRing = ensureFocusVisibleRing({ outlineOffset: 0 });

function ResultRow({
  testID,
  label,
  description,
  onPress,
  disabled,
}: {
  testID?: string;
  label: string;
  description?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <YStack
      testID={testID}
      role="option"
      aria-selected={false}
      aria-disabled={disabled || undefined}
      {...(isWeb
        ? {
            tabIndex: disabled ? -1 : 0,
            onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
              if (disabled) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onPress();
              } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const rows = [
                  ...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                    "[role='option']:not([aria-disabled='true'])",
                  ) ?? []),
                ];
                const index = rows.indexOf(event.currentTarget);
                rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
              }
            },
          }
        : {})}
      minHeight={description ? 62 : 44}
      justifyContent="center"
      paddingHorizontal="$3"
      paddingVertical={description ? '$2' : 0}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      hoverStyle={disabled ? undefined : { backgroundColor: '$color3' }}
      pressStyle={disabled ? undefined : { backgroundColor: '$color3' }}
      onPress={disabled ? undefined : onPress}
      opacity={disabled ? 0.5 : 1}>
      <Text fontSize="$4" lineHeight={25} color="$color12">
        {label}
      </Text>
      {description ? (
        <Text fontSize="$3" lineHeight={24} color={formCommonColors.muted}>
          {description}
        </Text>
      ) : null}
    </YStack>
  );
}

function StatusRow({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <XStack testID={testID} minHeight={44} alignItems="center" paddingHorizontal="$3" role="status">
      <Text fontSize="$4" lineHeight={25} color={formCommonColors.muted}>
        {children}
      </Text>
    </XStack>
  );
}

function SearchResultsList({
  listId,
  status,
  query,
  results,
  pair,
  onLocate,
  onPick,
  onPickPair,
  locateDisabled,
}: {
  listId: string;
  status: SearchStatus;
  query: string;
  results: GeocodeResult[];
  pair: { lat: number; lng: number } | null;
  onLocate: () => void;
  onPick: (result: GeocodeResult) => void;
  onPickPair: (lat: number, lng: number) => void;
  locateDisabled?: boolean;
}) {
  const showLocate = status === 'idle' || status === 'results' || pair != null;
  return (
    <YStack
      testID="geolocation-results"
      id={listId}
      overflow="hidden"
      {...(isWeb
        ? // role="listbox" is a valid ARIA role but outside RN's `Role` union;
          // this web-only bag forwards it to the DOM node (house Record cast).
          ({ role: 'listbox' } as Record<string, unknown>)
        : undefined)}>
      {showLocate ? (
        <ResultRow
          testID="geolocation-use-location"
          label={t('Use my current location')}
          onPress={onLocate}
          disabled={locateDisabled}
        />
      ) : null}
      {status === 'searching' ? <StatusRow testID="geolocation-search-status">{t('Searching…')}</StatusRow> : null}
      {status === 'error' ? (
        <StatusRow testID="geolocation-search-status">{t('Search is unavailable — check your connection')}</StatusRow>
      ) : null}
      {status === 'empty' && !pair ? (
        <StatusRow testID="geolocation-search-status">{t('No places match "{{query}}"', { query })}</StatusRow>
      ) : null}
      {pair ? (
        <ResultRow
          testID="geolocation-coord-result"
          label={t('Go to {{pair}}', { pair: formatCoordPair(pair.lat, pair.lng) })}
          description={t('Exact coordinates — no address')}
          onPress={() => {
            onPickPair(pair.lat, pair.lng);
          }}
        />
      ) : null}
      {status === 'results'
        ? results.map((result, index) => (
            <ResultRow
              key={`${result.lat},${result.lng},${index}`}
              testID={`geolocation-result-${index}`}
              label={result.label}
              description={result.description}
              onPress={() => {
                onPick(result);
              }}
            />
          ))
        : null}
    </YStack>
  );
}

function GeoMapSurface({
  id,
  coordinates,
  onCommitCoordinates,
  onUseMyLocation,
  onRetryLocate,
  onCloseLocate,
  onMapChange,
  disabled,
  readOnly,
  locatePhase,
  locateError,
  knobProps,
  locationIcon,
  expandIcon,
  renderMap,
  required,
  hasError,
  mapHeight,
}: {
  id?: string;
  coordinates: { lat: number; lng: number } | null;
  onCommitCoordinates: (lat: number, lng: number) => void;
  onUseMyLocation: () => void;
  onRetryLocate: () => void;
  onCloseLocate: () => void;
  onMapChange: (lat: number, lng: number) => void;
  disabled: boolean;
  readOnly?: boolean;
  locatePhase: LocatePhase;
  locateError: string | null;
  knobProps: KnobProps;
  locationIcon: ReactNode;
  expandIcon?: ReactNode;
  renderMap?: (props: GeolocationMapProps) => ReactNode;
  required?: boolean;
  hasError?: boolean;
  mapHeight: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [coordsOpen, setCoordsOpen] = useState(false);
  const coordsFlushRef = useRef<(() => void) | null>(null);
  const locating = locatePhase === 'locating';
  const locateErrorOpen = locatePhase === 'error';
  const hasValue = coordinates != null;
  const mapLat = coordinates?.lat ?? 0;
  const mapLng = coordinates?.lng ?? 0;
  const interactive = !disabled && !readOnly;
  const cappedRadius = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius);

  const handleExpand = expandIcon ? () => !disabled && setExpanded(true) : undefined;

  const handleCoordsOpenChange = (open: boolean) => {
    if (!open) {
      coordsFlushRef.current?.();
    }
    setCoordsOpen(open);
  };

  const handleMapKeyDown = (event: KeyboardEvent) => {
    if (!interactive) {
      return;
    }
    if (event.key === 'Enter' && hasValue) {
      event.preventDefault();
      setCoordsOpen(true);
      return;
    }
    if (!coordinates) {
      return;
    }
    const step = event.shiftKey ? 0.01 : 0.001;
    let nextLat = coordinates.lat;
    let nextLng = coordinates.lng;
    if (event.key === 'ArrowUp') {
      nextLat = clampLat(nextLat + step);
    } else if (event.key === 'ArrowDown') {
      nextLat = clampLat(nextLat - step);
    } else if (event.key === 'ArrowLeft') {
      nextLng = clampLng(nextLng - step);
    } else if (event.key === 'ArrowRight') {
      nextLng = clampLng(nextLng + step);
    } else {
      return;
    }
    event.preventDefault();
    onMapChange(nextLat, nextLng);
  };

  const customMap = renderMap
    ? renderMap({
        lat: mapLat,
        lng: mapLng,
        onChange: onMapChange,
        disabled,
        knobProps,
      })
    : null;

  const coordLine =
    readOnly || disabled ? (
      <XStack
        testID="geolocation-coordline"
        alignItems="center"
        minHeight={COORD_LINE_HEIGHT}
        paddingHorizontal="$2"
        hitSlop={pressTargetHitSlop(COORD_LINE_HEIGHT)}>
        <Text fontFamily="$mono" fontSize={12} lineHeight={22} color={formCommonColors.muted}>
          {hasValue ? formatCoordPair(mapLat, mapLng) : t('Enter coordinates')}
        </Text>
      </XStack>
    ) : (
      <FloatingPanel
        open={coordsOpen}
        onOpenChange={handleCoordsOpenChange}
        disabled={disabled}
        fitContent={false}
        sizing="fill"
        contentPadding="none"
        trigger={
          <XStack
            testID="geolocation-coordline"
            alignItems="center"
            minHeight={COORD_LINE_HEIGHT}
            paddingHorizontal="$2"
            cursor="pointer"
            {...pressSlopProps(COORD_LINE_HEIGHT, true)}
            hoverStyle={{ backgroundColor: '$color3' }}
            focusVisibleStyle={overlayFocusRing}
            {...(isWeb
              ? {
                  tabIndex: 0,
                  role: 'button',
                  'aria-label': t('Edit coordinates'),
                  onKeyDown: (event: KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setCoordsOpen(true);
                    }
                  },
                }
              : {})}>
            <Text fontFamily="$mono" fontSize={12} lineHeight={22} color={formCommonColors.muted}>
              {hasValue ? formatCoordPair(mapLat, mapLng) : t('Enter coordinates')}
            </Text>
          </XStack>
        }>
        <CoordinatesPanel
          lat={mapLat}
          lng={mapLng}
          knobProps={knobProps}
          required={required}
          hasError={hasError}
          flushRef={coordsFlushRef}
          onCommit={onCommitCoordinates}
        />
      </FloatingPanel>
    );

  return (
    <YStack gap="$2">
      <YStack
        testID="geolocation-map"
        id={id}
        {...knobProps.borderRadius}
        {...knobProps.inputSurface}
        borderRadius={cappedRadius}
        borderColor={hasError ? formCommonColors.error : formInputColors.border.base}
        overflow="hidden"
        height={mapHeight}
        position="relative"
        outlineWidth={0}
        focusStyle={{ outlineWidth: 0 }}
        focusVisibleStyle={interactive ? overlayFocusRing : { outlineWidth: 0 }}
        {...(interactive && isWeb
          ? {
              tabIndex: 0,
              role: 'application',
              'aria-label': t('Location map'),
              'aria-valuetext': hasValue ? formatCoordPair(mapLat, mapLng) : t('No location set'),
              onKeyDown: handleMapKeyDown,
            }
          : {})}>
        {customMap ?? (
          <GeolocationMap
            lat={mapLat}
            lng={mapLng}
            delta={hasValue ? 0.02 : 40}
            onChange={onMapChange}
            disabled={disabled}
            readOnly={readOnly}
            hasValue={hasValue}
          />
        )}

        {!hasValue ? (
          <YStack
            testID="geolocation-empty"
            position="absolute"
            top={0}
            right={0}
            bottom={0}
            left={0}
            zIndex={2}
            alignItems="center"
            justifyContent="center"
            pointerEvents="none">
            <Text {...knobProps.body} color={formCommonColors.muted}>
              {t('No location set')}
            </Text>
          </YStack>
        ) : null}
      </YStack>

      {locateErrorOpen ? (
        <YStack
          testID="geolocation-locate-panel"
          role="alert"
          {...knobProps.borderRadius}
          {...knobProps.inputSurface}
          borderColor={formInputColors.border.base}
          padding="$3"
          gap="$2"
          alignItems="center">
          <Text {...knobProps.body} color={formCommonColors.error} textAlign="center">
            {locateError}
          </Text>
          <XStack gap="$2">
            <Button size="$2" onPress={onRetryLocate} aria-label={t('Retry location')}>
              {t('Retry')}
            </Button>
            <Button size="$2" onPress={onCloseLocate} aria-label={t('Close location')}>
              {t('Close')}
            </Button>
          </XStack>
        </YStack>
      ) : null}

      <XStack testID="geolocation-map-footer" alignItems="center" flexWrap="wrap" gap="$2">
        <YStack flexGrow={1} flexShrink={1} flexBasis={0} minWidth={160}>
          {coordLine}
        </YStack>
        {!readOnly && !locateErrorOpen ? (
          <Button
            size="$2"
            disabled={disabled || locating}
            onPress={onUseMyLocation}
            icon={locating ? <Spinner size="small" /> : locationIcon}
            testID={hasValue ? 'geolocation-locate' : 'geolocation-empty-locate'}
            aria-label={hasValue ? t('Locate') : t('Use my current location')}
            aria-busy={locating || undefined}
            hitSlop={pressTargetHitSlop(32)}>
            <Button.Text>{hasValue ? t('Locate') : t('Use my current location')}</Button.Text>
          </Button>
        ) : null}
        {handleExpand && expandIcon ? (
          <Button
            size="$2"
            disabled={disabled}
            onPress={handleExpand}
            icon={expandIcon}
            aria-label={t('Expand map')}
            hitSlop={pressTargetHitSlop(32)}>
            <Button.Text>{t('Expand')}</Button.Text>
          </Button>
        ) : null}
      </XStack>

      {expandIcon && (
        <AdaptivePopup open={expanded} onOpenChange={setExpanded} title={t('Select Location')} size="lg">
          <ExpandedMapView
            lat={mapLat}
            lng={mapLng}
            onChange={onMapChange}
            disabled={disabled}
            readOnly={readOnly}
            hasValue={hasValue}
          />
        </AdaptivePopup>
      )}
    </YStack>
  );
}

export interface GeolocationProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  size?: SizeTokens;
  id?: string;
  /** JSON string: compact lat/lng or a stock Frappe FeatureCollection. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (...args: any[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  /**
   * Icon for the locate button. Optional — bare use falls back to the package
   * navigation-arrow glyph (Phosphor, the house icon set) so the locate
   * affordance renders without icon wiring (Axiom 13 ONE BODY).
   */
  locationIcon?: ReactNode;
  /** Icon for the expand/fullscreen button. If provided, enables fullscreen map view. */
  expandIcon?: ReactNode;
  /** Custom map component. Receives lat/lng and an onChange callback for pick-on-map. */
  renderMap?: (props: GeolocationMapProps) => ReactNode;
  /** When true, renders a skeleton placeholder instead of the geolocation field */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
  /**
   * Forward geocode. Injected — the field never ships a default provider.
   * Without this, search is disabled and the map / locate / coordinate
   * paths stay intact.
   */
  geocode?: GeocodeFn;
  /** Reverse geocode for a set pin. Injected; the pair is the fallback face. */
  reverseGeocode?: ReverseGeocodeFn;
  /**
   * Convenience bag for `geocode` + `reverseGeocode`. Explicit props win.
   * Any object satisfying `Geocoder` works. No provider is constructed for you.
   * Omitted, the nearest `GeocoderProvider` supplies one; `null` opts out.
   */
  geocoder?: Geocoder | null;
}

function CellFace({
  address,
  coordinates,
  onOpen,
}: {
  address: string | null;
  onOpen?: () => void;
  coordinates: { lat: number; lng: number } | null;
}) {
  const glyphColor = useGlyphColor();
  const text = address
    ? address
    : coordinates
      ? formatCoordPair(coordinates.lat, coordinates.lng)
      : t('No location set');
  return (
    <XStack
      testID="geolocation-cell-face"
      {...(isWeb && onOpen
        ? {
            tabIndex: 0,
            role: 'button',
            'aria-label': t('Edit location'),
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen();
              }
            },
          }
        : {})}
      alignItems="center"
      gap="$2"
      minHeight={44}
      minWidth={0}
      flex={1}>
      <MapPinIcon size={14} color={glyphColor} />
      <Text fontSize="$3" lineHeight={24} color="$color12" numberOfLines={1} flex={1} minWidth={0}>
        {text}
      </Text>
    </XStack>
  );
}

export function Geolocation({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  size,
  id: idProp,
  value,
  defaultValue,
  onChange,
  onBlur,
  disabled,
  readOnly,
  locationIcon,
  expandIcon,
  renderMap,
  skeleton,
  compact,
  geocode: geocodeProp,
  reverseGeocode: reverseGeocodeProp,
  geocoder,
}: GeolocationProps) {
  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, id } = useFormField({ form: formProp, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const glyphColor = useGlyphColor();
  const resolvedLocationIcon =
    locationIcon === undefined ? <NavigationArrowIcon size={16} color={glyphColor} /> : locationIcon;
  const inTableCell = useIsInTableCell();
  const viewportGtSm = useViewportGtSm();
  const shouldUseSheet = !isWeb || !viewportGtSm;
  const contextGeocoder = useGeocoder();
  const { geocode, reverseGeocode } = resolveGeocoder({
    geocode: geocodeProp,
    reverseGeocode: reverseGeocodeProp,
    geocoder: geocoder === undefined ? (contextGeocoder ?? undefined) : (geocoder ?? undefined),
  });
  const searchEnabled = Boolean(geocode) && !disabled && !readOnly;
  const listId = useId();

  const [locatePhase, setLocatePhase] = useState<LocatePhase>('idle');
  const [locateError, setLocateError] = useState<string | null>(null);
  const [preflightError, setPreflightError] = useState<string | undefined>();
  const [address, setAddress] = useState<ResolvedAddress | null>(null);
  const [query, setQuery] = useState('');
  const [resultsOpen, setResultsOpen] = useState(false);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [cellOpen, setCellOpen] = useState(false);
  const preflightingRef = useRef(false);
  const onValueChangeRef = useRef<(value: string) => void>(() => {});
  // The value being replaced, so an async locate writes back in the
  // shape the doc arrived in instead of forcing this repo's compact shape.
  const currentValueRef = useRef<string>('');
  const searchGenRef = useRef(0);
  const reverseGenRef = useRef(0);
  const searchRootRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sheetSearchInputRef = useRef<HTMLInputElement | null>(null);
  const closingSearchRef = useRef(false);
  const [nativeSearchFocus] = useState(createNativeSearchFocus);
  // The input owns return focus. FloatingPanel's delayed restore would run
  // onFocus after dismissal and reopen its own results sheet.
  const skipResultsReturnFocusRef = useRef(true);
  const closeSearch = useCallback(
    (restoreFocus = true) => {
      if (!isWeb) {
        nativeSearchFocus.dismiss();
      }
      closingSearchRef.current = true;
      setResultsOpen(false);
      if (isWeb && restoreFocus) {
        searchInputRef.current?.focus({ preventScroll: true });
      }
      closingSearchRef.current = false;
    },
    [nativeSearchFocus],
  );
  const queryIsAddressRef = useRef(true);
  const selectedPlaceRef = useRef<{ key: string; place: GeocodeResult } | null>(null);
  const locateGenRef = useRef(0);
  const interactiveRef = useRef(!disabled && !readOnly);
  interactiveRef.current = !disabled && !readOnly;
  const cancelLocate = useCallback(() => {
    ++locateGenRef.current;
    setLocatePhase('idle');
    setLocateError(null);
  }, []);
  useEffect(() => {
    if (disabled || readOnly) {
      cancelLocate();
    }
  }, [disabled, readOnly, cancelLocate]);
  useEffect(
    () => () => {
      ++locateGenRef.current;
      ++reverseGenRef.current;
      ++searchGenRef.current;
    },
    [],
  );

  const applyAddress = useCallback((next: ResolvedAddress | null, intoQuery: boolean) => {
    setAddress(next);
    if (intoQuery) {
      queryIsAddressRef.current = true;
      setQuery(next?.label ?? '');
    }
  }, []);

  const requestPosition = useCallback(() => {
    if (!interactiveRef.current) {
      return;
    }
    const gen = ++locateGenRef.current;
    if (!navigator?.geolocation) {
      setLocateError(t('Geolocation unavailable: not supported in this browser.'));
      setLocatePhase('error');
      return;
    }
    setLocatePhase('locating');
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (gen !== locateGenRef.current || !interactiveRef.current) {
          return;
        }
        selectedPlaceRef.current = null;
        queryIsAddressRef.current = true;
        const lat = clampLat(position.coords.latitude);
        const lng = clampLng(position.coords.longitude);
        const previous = currentValueRef.current;
        onValueChangeRef.current(formatGeoValue({ lat, lng }, detectGeoShape(previous), previous));
        setLocatePhase('idle');
        setLocateError(null);
        closeSearch();
        setCellOpen(false);
      },
      (err) => {
        if (gen !== locateGenRef.current || !interactiveRef.current) {
          return;
        }
        setLocateError(mapGeolocationError(err));
        setLocatePhase('error');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [closeSearch]);

  const startLocate = useCallback(async () => {
    if (disabled || readOnly) {
      return;
    }
    if (preflightingRef.current || locatePhase === 'locating') {
      return;
    }
    preflightingRef.current = true;
    const gen = ++locateGenRef.current;
    try {
      const result = await preflightGeolocation();
      if (gen !== locateGenRef.current || !interactiveRef.current) {
        return;
      }
      if (result.ok) {
        setPreflightError(undefined);
        requestPosition();
      } else {
        setPreflightError(result.reason);
        setLocatePhase('idle');
        setLocateError(null);
      }
    } finally {
      preflightingRef.current = false;
    }
  }, [disabled, readOnly, locatePhase, requestPosition]);

  const runReverse = useCallback(
    async (lat?: number, lng?: number) => {
      const gen = ++reverseGenRef.current;
      if (lat === undefined || lng === undefined) {
        selectedPlaceRef.current = null;
        applyAddress(null, queryIsAddressRef.current);
        return;
      }
      const key = coordinateKey({ lat, lng });
      const selected = selectedPlaceRef.current;
      if (selected?.key === key) {
        applyAddress({ key, label: formatPlace(selected.place) }, queryIsAddressRef.current);
        return;
      }
      // A new bound pair must not inherit the old address while it resolves.
      // An independent typed query remains a draft across this transition.
      applyAddress(null, queryIsAddressRef.current);
      if (!reverseGeocode) {
        return;
      }
      try {
        const result = await reverseGeocode({ lat, lng });
        if (gen !== reverseGenRef.current) {
          return;
        }
        applyAddress(result ? { key, label: formatPlace(result) } : null, queryIsAddressRef.current);
      } catch {
        if (gen !== reverseGenRef.current) {
          return;
        }
        applyAddress(null, queryIsAddressRef.current);
      }
    },
    [reverseGeocode, applyAddress],
  );

  const runSearch = useCallback(
    async (text: string) => {
      if (!geocode) {
        return;
      }
      const gen = ++searchGenRef.current;
      setSearchStatus('searching');
      try {
        const next = await geocode({ query: text });
        if (gen !== searchGenRef.current) {
          return;
        }
        setResults(next);
        setSearchStatus(next.length > 0 ? 'results' : 'empty');
      } catch {
        if (gen !== searchGenRef.current) {
          return;
        }
        setResults([]);
        setSearchStatus('error');
      }
    },
    [geocode],
  );

  useEffect(() => {
    ++searchGenRef.current;
    if (!searchEnabled || !resultsOpen) {
      return;
    }
    const trimmed = query.trim();
    if (queryIsAddressRef.current) {
      return;
    }
    if (!trimmed) {
      setSearchStatus('idle');
      setResults([]);
      return;
    }
    if (parseLatLngPair(trimmed)) {
      setSearchStatus('idle');
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      void runSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
      ++searchGenRef.current;
    };
  }, [query, resultsOpen, searchEnabled, runSearch]);

  useEffect(() => {
    if (!resultsOpen || shouldUseSheet) {
      return;
    }
    const onDoc = (event: MouseEvent) => {
      const root = searchRootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      closeSearch(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSearch();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [resultsOpen, shouldUseSheet, closeSearch]);

  const makeHandlers = useCallback(
    (currentValue: string, onValueChange: (value: string) => void) => {
      onValueChangeRef.current = onValueChange;
      currentValueRef.current = currentValue;
      const coordinates = parseGeoValue(currentValue);
      const shape = detectGeoShape(currentValue);
      const write = (lat: number, lng: number) => {
        cancelLocate();
        onValueChange(formatGeoValue({ lat: clampLat(lat), lng: clampLng(lng) }, shape, currentValue));
      };
      return {
        coordinates,
        onCommitCoordinates: (lat: number, lng: number) => {
          write(lat, lng);
          selectedPlaceRef.current = null;
          queryIsAddressRef.current = true;
        },
        onMapChange: (lat: number, lng: number) => {
          write(lat, lng);
          selectedPlaceRef.current = null;
          queryIsAddressRef.current = true;
        },
        onUseMyLocation: () => {
          void startLocate();
        },
        onRetryLocate: () => {
          requestPosition();
        },
        onCloseLocate: cancelLocate,
        onPick: (result: GeocodeResult) => {
          ++reverseGenRef.current;
          const place = { ...result, lat: clampLat(result.lat), lng: clampLng(result.lng) };
          selectedPlaceRef.current = { key: coordinateKey(place), place };
          write(result.lat, result.lng);
          // A controlled parent may reject or defer the proposal. Keep its
          // label as a query/candidate until the bound pair actually matches.
          queryIsAddressRef.current = true;
          setQuery(formatPlace(result));
          closeSearch();
          setCellOpen(false);
          setSearchStatus('idle');
        },
        onPickPair: (lat: number, lng: number) => {
          write(lat, lng);
          selectedPlaceRef.current = null;
          queryIsAddressRef.current = true;
          closeSearch();
          setCellOpen(false);
          setSearchStatus('idle');
        },
        onClear: () => {
          cancelLocate();
          ++searchGenRef.current;
          ++reverseGenRef.current;
          selectedPlaceRef.current = null;
          onValueChange('');
          applyAddress(null, true);
          setQuery('');
          setResults([]);
          setSearchStatus('idle');
        },
      };
    },
    [startLocate, requestPosition, cancelLocate, applyAddress, closeSearch],
  );

  const mapHeight = getFieldHeight((size ?? knobProps.sizeToken) as SizeTokens, compact ? 4 : 5, hydrationTouch);
  const displayError = error || preflightError;

  const renderSearch = (
    handlers: ReturnType<typeof makeHandlers>,
    opts: { sheetHeader?: boolean; editingCell?: boolean } = {},
  ) => {
    const showClear = Boolean(query) && !disabled && !readOnly;
    const inputRef = opts.sheetHeader ? sheetSearchInputRef : searchInputRef;
    const activateNativeSearch = (focusInput = false) => {
      nativeSearchFocus.activate();
      if (!searchEnabled || opts.editingCell) {
        return;
      }
      const nativeInput = inputRef.current as unknown as {
        isFocused?: () => boolean;
        focus: () => void;
      } | null;
      // Let first focus open the keyboard before mounting the modal. A restored
      // input is already focused, so a deliberate new press must open directly.
      if (nativeInput?.isFocused?.()) {
        setResultsOpen(true);
      } else if (focusInput) {
        nativeInput?.focus();
      }
    };
    const clearSearch = () => {
      handlers.onClear();
      closingSearchRef.current = true;
      if (isWeb) {
        inputRef.current?.focus({ preventScroll: true });
      }
      closingSearchRef.current = false;
    };
    return (
      <InputParts size={size || knobProps.sizeToken}>
        <InputParts.Box
          disabled={disabled || !searchEnabled}
          // Keep the square Clear target pressable across the frame's border.
          style={{ overflow: 'visible' }}
          {...(opts.sheetHeader
            ? {
                borderWidth: 0,
                borderBottomWidth: 1,
                borderRadius: 0,
              }
            : {})}>
          <InputParts.Section>
            <InputParts.Icon adornment="leading">
              <MagnifyingGlassIcon size={16} />
            </InputParts.Icon>
          </InputParts.Section>
          <InputParts.Section>
            <InputParts.Area
              ref={inputRef as never}
              value={query}
              disabled={disabled || !searchEnabled}
              placeholder={t('Search address or place')}
              aria-label={t('Search for a location')}
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={resultsOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              data-testid="geolocation-search"
              onChangeText={(text: string) => {
                if (!isWeb) {
                  nativeSearchFocus.activate();
                }
                ++searchGenRef.current;
                queryIsAddressRef.current = false;
                setResults([]);
                setSearchStatus('idle');
                setQuery(text);
                if (searchEnabled) {
                  setResultsOpen(true);
                }
              }}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === 'ArrowDown') {
                  if (searchEnabled) {
                    setResultsOpen(true);
                  }
                  event.preventDefault();
                  document
                    .getElementById(listId)
                    ?.querySelector<HTMLElement>("[role='option']:not([aria-disabled='true'])")
                    ?.focus();
                }
              }}
              onClick={() => {
                if (searchEnabled) {
                  setResultsOpen(true);
                }
              }}
              {...(!isWeb
                ? {
                    onPressIn: () => {
                      activateNativeSearch();
                    },
                    onAccessibilityTap: () => {
                      activateNativeSearch(true);
                    },
                    onBlur: () => {
                      nativeSearchFocus.blur(!!opts.sheetHeader, resultsOpen);
                    },
                  }
                : {})}
              onFocus={() => {
                // Web opens on a press, typing or ArrowDown only: a panel
                // that moves focus in on open (a cell editor, a sheet) must
                // not drop the idle results over the map.
                if (
                  !isWeb &&
                  searchEnabled &&
                  !opts.editingCell &&
                  !closingSearchRef.current &&
                  nativeSearchFocus.canOpen(!!opts.sheetHeader)
                ) {
                  setResultsOpen(true);
                }
              }}
            />
          </InputParts.Section>
          {showClear ? (
            <InputParts.Section>
              <InputParts.Button
                glyphRing
                onPress={clearSearch}
                onKeyDown={(event: KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    clearSearch();
                  }
                }}
                aria-label={t('Clear location')}
                testID="geolocation-search-clear">
                <InputParts.Icon>
                  <XIcon size={14} />
                </InputParts.Icon>
              </InputParts.Button>
            </InputParts.Section>
          ) : null}
        </InputParts.Box>
      </InputParts>
    );
  };

  const renderResults = (handlers: ReturnType<typeof makeHandlers>) => (
    <SearchResultsList
      listId={listId}
      status={searchStatus}
      query={query.trim()}
      results={results}
      pair={parseLatLngPair(query)}
      onLocate={handlers.onUseMyLocation}
      onPick={handlers.onPick}
      onPickPair={handlers.onPickPair}
      locateDisabled={disabled || locatePhase === 'locating'}
    />
  );

  const renderFormBody = (
    currentValue: string,
    onValueChange: (v: string) => void,
    editingCell = false,
    resolvedError: string | boolean | undefined = displayError,
  ): ReactNode => {
    const handlers = makeHandlers(currentValue, onValueChange);
    const coordinates = handlers.coordinates;
    const key = coordinates ? coordinateKey(coordinates) : null;
    const selected = selectedPlaceRef.current;
    const displayAddress =
      (selected?.key === key ? formatPlace(selected.place) : null) ??
      (address?.key === key ? address.label : null) ??
      (coordinates ? formatCoordPair(coordinates.lat, coordinates.lng) : null);

    if (inTableCell && !editingCell) {
      const face = (
        <CellFace
          address={displayAddress}
          coordinates={coordinates}
          onOpen={
            !disabled && !readOnly
              ? () => {
                  setCellOpen(true);
                }
              : undefined
          }
        />
      );
      if (readOnly || disabled) {
        return face;
      }
      return (
        <FloatingPanel
          open={cellOpen}
          onOpenChange={setCellOpen}
          disabled={disabled}
          fitContent={false}
          contentPadding="none"
          trigger={face}>
          <YStack minWidth={260} maxWidth={420}>
            {renderFormBody(currentValue, onValueChange, true, resolvedError)}
          </YStack>
        </FloatingPanel>
      );
    }

    if (readOnly) {
      return (
        <YStack gap="$2">
          <XStack testID="geolocation-readonly-address" alignItems="center" gap="$2" minHeight={25}>
            <MapPinIcon size={14} color={glyphColor} />
            <Text fontSize="$4" lineHeight={25} color="$color12">
              {displayAddress ?? t('No location set')}
            </Text>
          </XStack>
          <GeoMapSurface
            id={id}
            coordinates={coordinates}
            onCommitCoordinates={handlers.onCommitCoordinates}
            onUseMyLocation={handlers.onUseMyLocation}
            onRetryLocate={handlers.onRetryLocate}
            onCloseLocate={handlers.onCloseLocate}
            onMapChange={handlers.onMapChange}
            disabled={!!disabled}
            readOnly
            locatePhase={locatePhase}
            locateError={locateError}
            knobProps={knobProps}
            locationIcon={resolvedLocationIcon}
            expandIcon={expandIcon}
            renderMap={renderMap}
            required={required}
            hasError={!!resolvedError}
            mapHeight={mapHeight}
          />
        </YStack>
      );
    }

    const resultsPanel =
      resultsOpen && searchEnabled ? (
        shouldUseSheet ? (
          <FloatingPanel
            open={resultsOpen}
            onOpenChange={(open) => {
              open ? setResultsOpen(true) : closeSearch();
            }}
            onNativeShow={() => sheetSearchInputRef.current?.focus()}
            skipReturnFocusRef={skipResultsReturnFocusRef}
            sheet
            sheetFill
            scrollable
            contentPadding="none"
            header={renderSearch(handlers, { sheetHeader: true })}
            trigger=<View testID="geolocation-sheet-trigger" height={1} width="100%" />>
            <YStack testID="geolocation-results-sheet">{renderResults(handlers)}</YStack>
          </FloatingPanel>
        ) : (
          <YStack
            position="absolute"
            top="100%"
            left={0}
            right={0}
            zIndex={zIndex.dropdown}
            backgroundColor="$color1"
            borderWidth={1}
            borderColor={formInputColors.border.base}
            borderRadius={knobProps.borderRadius.borderRadius}
            overflow="hidden"
            style={{ boxShadow: RESULTS_PANEL_SHADOW }}>
            <ScrollView keyboardShouldPersistTaps="handled" maxHeight={mapHeight * 1.5}>
              {renderResults(handlers)}
            </ScrollView>
          </YStack>
        )
      ) : null;

    return (
      <YStack gap="$2">
        <YStack
          ref={searchRootRef as never}
          position="relative"
          testID="geolocation-search-anchor"
          data-sheet={shouldUseSheet ? 'true' : 'false'}>
          {renderSearch(handlers, { editingCell })}
          {resultsPanel}
        </YStack>
        <GeoMapSurface
          id={id}
          coordinates={coordinates}
          onCommitCoordinates={handlers.onCommitCoordinates}
          onUseMyLocation={handlers.onUseMyLocation}
          onRetryLocate={handlers.onRetryLocate}
          onCloseLocate={handlers.onCloseLocate}
          onMapChange={handlers.onMapChange}
          disabled={!!disabled}
          readOnly={!!readOnly}
          locatePhase={locatePhase}
          locateError={locateError}
          knobProps={knobProps}
          locationIcon={resolvedLocationIcon}
          expandIcon={expandIcon}
          renderMap={renderMap}
          required={required}
          hasError={!!resolvedError}
          mapHeight={mapHeight}
        />
      </YStack>
    );
  };

  if (skeleton) {
    return (
      <FieldLayout id={id} label={label} size={size} knobProps={knobProps}>
        <YStack gap="$2">
          <Skeleton variant="rounded" width="100%" height={44} />
          <Skeleton variant="rounded" width="100%" height={mapHeight} />
        </YStack>
      </FieldLayout>
    );
  }

  const wrap = (
    currentValue: string,
    onValueChange: (v: string) => void,
    resolvedError?: string | boolean,
    fieldBlur?: (...args: any[]) => void,
  ) => {
    const coordinates = parseGeoValue(currentValue);
    const taughtHelper =
      helperText ?? (!coordinates && !readOnly ? t('Search, tap the map, or use your location.') : undefined);
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={resolvedError ?? displayError}
        helperText={inTableCell ? undefined : taughtHelper}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={fieldBlur ?? onBlur}
        disabled={disabled}>
        <GeolocationValueSync value={currentValue} runReverse={runReverse} />
        {renderFormBody(currentValue, onValueChange, false, resolvedError)}
      </FieldLayout>
    );
  };

  if (!resolvedForm || !name) {
    return wrap(value || '', (v) => onChange?.(v));
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, displayError);
        return wrap(
          field.state.value || '',
          (v) => {
            field.handleChange(v as never);
            onChange?.(v);
          },
          resolvedError,
          mergeFieldHandler(field, 'handleBlur', onBlur),
        );
      }}
    </Field>
  );
}

function GeolocationValueSync({
  value,
  runReverse,
}: {
  value: string;
  runReverse: (lat?: number, lng?: number) => void;
}) {
  const coords = parseGeoValue(value);
  const key = coords ? coordinateKey(coords) : '';
  useEffect(() => {
    const next = parseGeoValue(value);
    runReverse(next?.lat, next?.lng);
  }, [key, value, runReverse]);
  return null;
}

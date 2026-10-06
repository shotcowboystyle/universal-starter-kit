import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { formCommonColors, formInputColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';

import type { BarcodeScannerProps, CameraPreflightResult } from './scanner-types';
import { resolveNativeBarcodeTypes, scannerViewportHeight } from './scanner-types';

/**
 * Camera capability pre-flight, native mirror.
 * Checks the expo-camera permission BEFORE the scanner surface is presented.
 * Hard-denied (denied + !canAskAgain) fails pre-flight → the field shows an
 * inline error and the surface never presents. An askable `undetermined` /
 * `denied but canAskAgain` state passes — the system prompt happens over the
 * stable scanner surface, never as a present-fail-dismiss flash.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- the pre-flight is part of the scanner's public contract; the web module exports the same name
export const preflightCamera = async (): Promise<CameraPreflightResult> => {
  try {
    const status = await Camera.getCameraPermissionsAsync();
    if (!status.granted && !status.canAskAgain) {
      return {
        ok: false,
        reason: t('Camera unavailable: permission denied. Enable camera access in system settings.'),
      };
    }
  } catch {
    // Permission module unavailable — the surface reports the failure inline.
  }
  return { ok: true };
};

/** Nothing to tear down when the effect has no work to do. */
const noopCleanup = () => {
  // Intentionally empty: the effect only registers cleanup once a request is in flight.
};

/**
 * Native barcode scanner — `expo-camera`'s `CameraView` with built-in barcode
 * scanning (bundled in Expo Go SDK 55). Replaces the web `html5-qrcode`, so no
 * `getUserMedia` / DOM browser code reaches the Hermes bundle.
 *
 * Only mounts after a passing `preflightCamera()`.
 * While the permission prompt is pending the surface shows a stable
 * "Requesting camera…" state; a denial renders the error INSIDE the still-open
 * surface with Retry + Close — it never self-dismisses on error.
 *
 * Note: the iOS simulator has no camera, so live scanning can only be verified
 * on a physical device; in the simulator the camera surface renders empty.
 */
export const BarcodeScanner = ({
  active,
  onScan,
  onError,
  onClose,
  knobProps,
  formats,
  compact,
}: BarcodeScannerProps) => {
  const barcodeTypes = resolveNativeBarcodeTypes(formats);
  const viewportPx = scannerViewportHeight(compact);
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);
  const [denied, setDenied] = useState(false);
  const hasPermissionInfo = permission !== null;
  const granted = permission?.granted;
  // Effects restart only on `active` / permission changes; the latest callbacks are read through this ref.
  const latestRef = useRef({ onError, requestPermission });
  useLayoutEffect(() => {
    latestRef.current = { onError, requestPermission };
  });

  // oxlint-disable-next-line react-doctor/no-reset-all-state-on-prop-change -- the scanner stays mounted across sessions, so each activation must reset its handled/denied state
  useEffect(() => {
    if (!active) {
      return;
    }
    handledRef.current = false;
    // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-adjust-state-on-prop-change -- resets per-session state when the scanner is switched on
    setDenied(false);
    latestRef.current.onError(null);
  }, [active]);

  useEffect(() => {
    if (!active || !hasPermissionInfo || granted) {
      return noopCleanup;
    }
    let stale = false;
    const askForPermission = async () => {
      const res = await latestRef.current.requestPermission();
      // Surface stays OPEN on denial: error renders inside with Retry + Close.
      if (!stale && !res.granted) {
        setDenied(true);
      }
    };
    void askForPermission();
    return () => {
      stale = true;
    };
  }, [active, hasPermissionInfo, granted]);

  const retryPermission = async () => {
    setDenied(false);
    const res = await requestPermission();
    if (!res.granted) {
      setDenied(true);
    }
  };

  if (!active) {
    return null;
  }

  let body: ReactNode;
  if (denied) {
    body = (
      <YStack
        padding="$4"
        gap="$3"
        alignItems="center"
        minHeight={120}
        justifyContent="center">
        <Text
          {...knobProps.body}
          color={formCommonColors.error}
          textAlign="center">
          {t('Camera permission denied. Please allow camera access.')}
        </Text>
        <XStack gap="$2">
          <Button
            size={knobProps.sizeToken}
            onPress={() => {
              void retryPermission();
            }}
            aria-label={t('Retry camera')}>
            {t('Retry')}
          </Button>
          <Button
            size={knobProps.sizeToken}
            onPress={onClose}
            aria-label={t('Close scanner')}>
            {t('Close')}
          </Button>
        </XStack>
      </YStack>
    );
  } else if (granted) {
    body = (
      <View
        width="100%"
        height={viewportPx}
        maxHeight={320}
        overflow="hidden">
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...barcodeTypes] }}
          onBarcodeScanned={({ data }) => {
            if (handledRef.current) {
              return;
            }
            handledRef.current = true;
            onScan(data);
            onClose();
          }}
        />
      </View>
    );
  } else {
    body = (
      <Text
        {...knobProps.body}
        padding="$3"
        textAlign="center"
        opacity={0.7}>
        {t('Requesting camera…')}
      </Text>
    );
  }

  return (
    <YStack
      testID="barcode-scanner-popup"
      {...knobProps.borderRadius}
      {...knobProps.inputSurface}
      borderColor={formInputColors.border.base}
      overflow="hidden">
      {body}
    </YStack>
  );
};

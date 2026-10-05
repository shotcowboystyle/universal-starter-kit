import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { formCommonColors, formInputColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';

import type { BarcodeScannerProps, CameraPreflightResult } from './scannerTypes';
import { resolveNativeBarcodeTypes, scannerViewportHeight } from './scannerTypes';

/**
 * Camera capability pre-flight, native mirror.
 * Checks the expo-camera permission BEFORE the scanner surface is presented.
 * Hard-denied (denied + !canAskAgain) fails pre-flight → the field shows an
 * inline error and the surface never presents. An askable `undetermined` /
 * `denied but canAskAgain` state passes — the system prompt happens over the
 * stable scanner surface, never as a present-fail-dismiss flash.
 */
export async function preflightCamera(): Promise<CameraPreflightResult> {
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
}

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
export function BarcodeScanner({ active, onScan, onError, onClose, knobProps, formats, compact }: BarcodeScannerProps) {
  const barcodeTypes = resolveNativeBarcodeTypes(formats);
  const viewportPx = scannerViewportHeight(compact);
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!active) {
      return;
    }
    handledRef.current = false;
    setDenied(false);
    onError(null);
  }, [active]);

  useEffect(() => {
    if (!active || !permission || permission.granted) {
      return;
    }
    let stale = false;
    requestPermission().then((res) => {
      // Surface stays OPEN on denial: error renders inside with Retry + Close.
      if (!stale && !res.granted) {
        setDenied(true);
      }
    });
    return () => {
      stale = true;
    };
  }, [active, permission?.granted]);

  if (!active) {
    return null;
  }

  return (
    <YStack
      testID="barcode-scanner-popup"
      {...knobProps.borderRadius}
      {...knobProps.inputSurface}
      borderColor={formInputColors.border.base}
      overflow="hidden">
      {denied ? (
        <YStack padding="$4" gap="$3" alignItems="center" minHeight={120} justifyContent="center">
          <Text {...knobProps.body} color={formCommonColors.error} textAlign="center">
            {t('Camera permission denied. Please allow camera access.')}
          </Text>
          <XStack gap="$2">
            <Button
              size={knobProps.sizeToken}
              onPress={() => {
                setDenied(false);
                requestPermission().then((res) => {
                  if (!res.granted) {
                    setDenied(true);
                  }
                });
              }}
              aria-label={t('Retry camera')}>
              {t('Retry')}
            </Button>
            <Button size={knobProps.sizeToken} onPress={onClose} aria-label={t('Close scanner')}>
              {t('Close')}
            </Button>
          </XStack>
        </YStack>
      ) : !permission?.granted ? (
        <Text {...knobProps.body} padding="$3" textAlign="center" opacity={0.7}>
          {t('Requesting camera…')}
        </Text>
      ) : (
        <View width="100%" height={viewportPx} maxHeight={320} overflow="hidden">
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
      )}
    </YStack>
  );
}

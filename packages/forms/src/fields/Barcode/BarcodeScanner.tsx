import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Text, View, XStack, YStack, isWeb } from 'tamagui';

import { Button } from '../../Button';
import { queryPermissionState } from '../../shared/capability-preflight';
import { formCommonColors, formInputColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';

import type { BarcodeScannerProps, CameraPreflightResult } from './scanner-types';
import { resolveHtml5FormatIds, scannerViewportHeight } from './scanner-types';

interface Html5QrcodeScanner {
  start: (
    cameraIdOrConfig: { facingMode: string },
    config: { fps: number; qrbox: { width: number; height: number }; aspectRatio: number },
    onSuccess: (decodedText: string) => void,
    onError: () => void,
  ) => Promise<null>;
  stop: () => Promise<void>;
  clear: () => void;
  getState?: () => number;
}

const mapCameraError = (message: string): string => {
  if (message.includes('Permission') || message.includes('NotAllowed')) {
    return t('Camera permission denied. Please allow camera access.');
  }
  if (message.includes('NotFound') || message.includes('no camera')) {
    return t('No camera found on this device.');
  }
  if (message.includes('NotReadable') || message.includes('in use')) {
    return t('Camera is in use by another application.');
  }
  return t('Scanner error: {{message}}', { message });
};

/**
 * Camera capability pre-flight. Runs BEFORE the
 * scanner surface is presented: checks secure context, getUserMedia support,
 * that a videoinput device exists, and that permission is not hard-denied.
 * A `prompt` permission state passes — the prompt happens inside the stable
 * scanner surface, never as a mount-fail-unmount flicker.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- the pre-flight is part of the scanner's public contract; the native module exports the same name
export const preflightCamera = async (): Promise<CameraPreflightResult> => {
  // `navigator.mediaDevices` is typed as always present but is undefined in insecure contexts.
  const mediaDevices: MediaDevices | undefined = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (mediaDevices === undefined || !('getUserMedia' in mediaDevices)) {
    const insecure = typeof window !== 'undefined' && !window.isSecureContext;
    return {
      ok: false,
      reason: insecure
        ? t('Camera unavailable: insecure context (HTTPS required).')
        : t('Camera unavailable: not supported in this browser.'),
    };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!devices.some((d) => d.kind === 'videoinput')) {
      return {
        ok: false,
        reason: t('Camera unavailable: no camera found on this device.'),
      };
    }
  } catch {
    // enumerateDevices unavailable — let the permission check below decide.
  }
  const permission = await queryPermissionState('camera');
  if (permission === 'denied') {
    return {
      ok: false,
      reason: t('Camera unavailable: permission denied. Allow camera access in browser settings.'),
    };
  }
  return { ok: true };
};

/**
 * Web barcode scanner — the browser `html5-qrcode` camera (getUserMedia +
 * a DOM container). Native gets `BarcodeScanner.native.tsx` (expo-camera).
 *
 * This surface only mounts after a passing
 * `preflightCamera()`. If init still fails after that (device grabbed
 * mid-flight, prompt declined), the error renders INSIDE the still-open
 * panel with Retry + Close — the panel never self-closes on error.
 */
const loadHtml5Qrcode = async () => await import('html5-qrcode');

/** Nothing to tear down while the scanner is inactive. */
const noopCleanup = () => {
  // Intentionally empty: no scanner exists until `active` flips on.
};

const stopScannerQuietly = async (scanner: Html5QrcodeScanner): Promise<void> => {
  try {
    await scanner.stop();
  } catch {
    // Safe to continue: the scanner may already be stopped, and teardown must not throw.
  }
};

/** Stop (when running) and clear a scanner during teardown; every step tolerates an already-dead scanner. */
const teardownScanner = (scanner: Html5QrcodeScanner): void => {
  try {
    const state = scanner.getState?.();
    if (state === 2 || state === undefined) {
      void stopScannerQuietly(scanner);
    }
  } catch {
    /* ignore */
  }
  try {
    scanner.clear();
  } catch {
    /* ignore */
  }
};

export const BarcodeScanner = ({
  active,
  onScan,
  onError,
  onClose,
  knobProps,
  formats,
  compact,
}: BarcodeScannerProps) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  // Strip characters useId may emit (":", "«", "»") that are not valid in an unescaped CSS id selector.
  const containerId = `barcode-scanner-${useId().replaceAll(/[^\w-]/gu, '')}`;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'starting' | 'streaming' | 'error'>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const viewportPx = scannerViewportHeight(compact);
  const formatKey = formats?.join(',') ?? '';
  // The scan session restarts only on active/attempt/format/viewport changes; the
  // latest callbacks are read through this ref so a new inline callback never restarts the camera.
  const latestRef = useRef({ onScan, onError, onClose, formats });
  useLayoutEffect(() => {
    latestRef.current = { onScan, onError, onClose, formats };
  });

  useEffect(() => {
    if (!active) {
      return noopCleanup;
    }
    let cancelled = false;
    // oxlint-disable-next-line react/set-state-in-effect -- each (re)start of the camera session resets the visible status before the async start begins
    setStatus('starting');
    setErrorMessage(null);
    latestRef.current.onError(null);
    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await loadHtml5Qrcode();
        if (cancelled) {
          return;
        }
        const formatsToSupport = resolveHtml5FormatIds(latestRef.current.formats, Html5QrcodeSupportedFormats);
        const scanner: Html5QrcodeScanner = new Html5Qrcode(
          containerId,
          formatsToSupport ? { formatsToSupport, verbose: false } : undefined,
        );
        scannerRef.current = scanner;
        const qrbox = Math.min(220, Math.max(120, viewportPx - 40));
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: qrbox, height: Math.round(qrbox * 0.6) },
            aspectRatio: 1.5,
          },
          (decodedText: string) => {
            latestRef.current.onScan(decodedText);
            latestRef.current.onClose();
          },
          () => {
            // Per-frame decode misses are expected while scanning; only start() failures matter.
          },
        );
        if (!cancelled) {
          setStatus('streaming');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        // The panel stays OPEN: error renders inside with Retry + Close.
        setStatus('error');
        setErrorMessage(mapCameraError(error instanceof Error ? error.message : String(error)));
      }
    };
    void startScanner();
    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        teardownScanner(scanner);
        scannerRef.current = null;
      }
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- formatKey is read through latestRef; it is a dependency only so a changed format list restarts the scan session
  }, [active, attempt, formatKey, viewportPx, containerId]);

  if (!active) {
    return null;
  }

  const webViewportStyle = isWeb
    ? {
        style: {
          height: `min(40vh, ${viewportPx}px)`,
          maxHeight: 320,
        },
      }
    : undefined;

  return (
    <YStack
      testID="barcode-scanner-popup"
      {...knobProps.borderRadius}
      {...knobProps.inputSurface}
      borderColor={formInputColors.border.base}
      overflow="hidden">
      {status === 'error' ? (
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
            {errorMessage}
          </Text>
          <XStack gap="$2">
            <Button
              size={knobProps.sizeToken}
              onPress={() => {
                setAttempt((a) => a + 1);
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
      ) : (
        <>
          {status === 'starting' && (
            <Text
              {...knobProps.body}
              padding="$3"
              textAlign="center"
              opacity={0.7}>
              {t('Requesting camera…')}
            </Text>
          )}
          {/* The camera video renders at its natural aspect (portrait
              feeds exceed 1000px tall) — pin it to the panel with object-fit
              cover so the surface never paints past its frame. */}
          <style>{`#${containerId} video { width: 100%; height: 100%; object-fit: cover; }`}</style>
          <View
            id={containerId}
            width="100%"
            height={viewportPx}
            maxHeight={320}
            overflow="hidden"
            {...webViewportStyle}
          />
        </>
      )}
    </YStack>
  );
};

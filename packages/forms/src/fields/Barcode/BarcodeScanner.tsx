import { useEffect, useRef, useState } from 'react';
import { Text, View, XStack, YStack, isWeb } from 'tamagui';

import { Button } from '../../Button';
import { queryPermissionState } from '../../shared/capabilityPreflight';
import { formCommonColors, formInputColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';

import type { BarcodeScannerProps, CameraPreflightResult } from './scannerTypes';
import { resolveHtml5FormatIds, scannerViewportHeight } from './scannerTypes';

interface Html5QrcodeScanner {
  start: (
    cameraIdOrConfig: { facingMode: string },
    config: { fps: number; qrbox: { width: number; height: number }; aspectRatio: number },
    onSuccess: (decodedText: string) => void,
    onError: () => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  getState?: () => number;
}

function mapCameraError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
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
}

/**
 * Camera capability pre-flight. Runs BEFORE the
 * scanner surface is presented: checks secure context, getUserMedia support,
 * that a videoinput device exists, and that permission is not hard-denied.
 * A `prompt` permission state passes — the prompt happens inside the stable
 * scanner surface, never as a mount-fail-unmount flicker.
 */
export async function preflightCamera(): Promise<CameraPreflightResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
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
}

/**
 * Web barcode scanner — the browser `html5-qrcode` camera (getUserMedia +
 * a DOM container). Native gets `BarcodeScanner.native.tsx` (expo-camera).
 *
 * This surface only mounts after a passing
 * `preflightCamera()`. If init still fails after that (device grabbed
 * mid-flight, prompt declined), the error renders INSIDE the still-open
 * panel with Retry + Close — the panel never self-closes on error.
 */
export function BarcodeScanner({ active, onScan, onError, onClose, knobProps, formats, compact }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const containerId = useRef(`barcode-scanner-${Math.random().toString(36).slice(2, 9)}`);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'starting' | 'streaming' | 'error'>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const viewportPx = scannerViewportHeight(compact);
  const formatKey = formats?.join(',') ?? '';

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    setStatus('starting');
    setErrorMessage(null);
    onError(null);
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) {
          return;
        }
        const formatsToSupport = resolveHtml5FormatIds(
          formats,
          Html5QrcodeSupportedFormats as unknown as Record<string, number | string>,
        );
        const scanner = new Html5Qrcode(
          containerId.current,
          formatsToSupport ? { formatsToSupport, verbose: false } : undefined,
        ) as unknown as Html5QrcodeScanner;
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
            onScan(decodedText);
            onClose();
          },
          () => {},
        );
        if (!cancelled) {
          setStatus('streaming');
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        // The panel stays OPEN: error renders inside with Retry + Close.
        setStatus('error');
        setErrorMessage(mapCameraError(err));
      }
    })();
    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        try {
          const state = scanner.getState?.();
          if (state === 2 || state === undefined) {
            scanner.stop().catch(() => {});
          }
        } catch {
          /* ignore */
        }
        try {
          scanner.clear();
        } catch {
          /* ignore */
        }
        scannerRef.current = null;
      }
    };
  }, [active, attempt, formatKey, viewportPx]);

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
      {status === 'error' ? (
        <YStack padding="$4" gap="$3" alignItems="center" minHeight={120} justifyContent="center">
          <Text {...knobProps.body} color={formCommonColors.error} textAlign="center">
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
            <Button size={knobProps.sizeToken} onPress={onClose} aria-label={t('Close scanner')}>
              {t('Close')}
            </Button>
          </XStack>
        </YStack>
      ) : (
        <>
          {status === 'starting' && (
            <Text {...knobProps.body} padding="$3" textAlign="center" opacity={0.7}>
              {t('Requesting camera…')}
            </Text>
          )}
          {/* The camera video renders at its natural aspect (portrait
              feeds exceed 1000px tall) — pin it to the panel with object-fit
              cover so the surface never paints past its frame. */}
          <style>{`#${containerId.current} video { width: 100%; height: 100%; object-fit: cover; }`}</style>
          <View
            id={containerId.current}
            width="100%"
            height={viewportPx}
            maxHeight={320}
            overflow="hidden"
            {...(isWeb
              ? {
                  style: {
                    height: `min(40vh, ${viewportPx}px)`,
                    maxHeight: 320,
                  },
                }
              : undefined)}
          />
        </>
      )}
    </YStack>
  );
}

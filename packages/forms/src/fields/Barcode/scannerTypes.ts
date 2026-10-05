import type { KnobProps } from '@repo/theme';

import type { CapabilityPreflightResult } from '../../shared/capabilityPreflight';

export interface BarcodeScannerProps {
  /** When true, the camera scanner is active and rendered. */
  active: boolean;
  /** Called with the decoded barcode value. */
  onScan: (value: string) => void;
  /** Report a scanner error message (or null to clear). */
  onError: (message: string | null) => void;
  /**
   * Called after a successful scan or when the user closes the scanner.
   * Never called by the scanner itself on error — init failures render
   * INSIDE the still-open panel with Retry/Close.
   */
  onClose: () => void;
  knobProps: KnobProps;
  /** Restrict the decoder to these symbologies. Omit / empty = all supported. */
  formats?: string[];
  /** Compact density — shorter scanner viewport. */
  compact?: boolean;
}

/**
 * Result of the camera capability pre-flight.
 * `ok: false` means the scanner surface must NOT be presented; `reason` is the
 * user-facing message for the field's inline error slot. A passing pre-flight
 * may still need to prompt for permission — that prompt happens INSIDE the
 * stable scanner surface, never as a mount-fail-unmount.
 */
export type CameraPreflightResult = CapabilityPreflightResult;

/** expo-camera `barcodeTypes` the native scanner can request. */
export const NATIVE_BARCODE_TYPES = [
  'qr',
  'ean13',
  'ean8',
  'code128',
  'code39',
  'code93',
  'upc_a',
  'upc_e',
  'codabar',
  'itf14',
  'datamatrix',
  'pdf417',
  'aztec',
] as const;

export type NativeBarcodeType = (typeof NATIVE_BARCODE_TYPES)[number];

const NATIVE_FORMAT_ALIASES: Record<string, NativeBarcodeType> = {
  qr: 'qr',
  qrcode: 'qr',
  qr_code: 'qr',
  ean13: 'ean13',
  ean_13: 'ean13',
  ean8: 'ean8',
  ean_8: 'ean8',
  code128: 'code128',
  code_128: 'code128',
  code39: 'code39',
  code_39: 'code39',
  code93: 'code93',
  code_93: 'code93',
  upc_a: 'upc_a',
  upca: 'upc_a',
  upc_e: 'upc_e',
  upce: 'upc_e',
  codabar: 'codabar',
  itf: 'itf14',
  itf14: 'itf14',
  datamatrix: 'datamatrix',
  data_matrix: 'datamatrix',
  pdf417: 'pdf417',
  pdf_417: 'pdf417',
  aztec: 'aztec',
};

/** html5-qrcode `Html5QrcodeSupportedFormats` enum keys. */
const HTML5_FORMAT_ALIASES: Record<string, string> = {
  qr: 'QR_CODE',
  qrcode: 'QR_CODE',
  qr_code: 'QR_CODE',
  aztec: 'AZTEC',
  codabar: 'CODABAR',
  code39: 'CODE_39',
  code_39: 'CODE_39',
  code93: 'CODE_93',
  code_93: 'CODE_93',
  code128: 'CODE_128',
  code_128: 'CODE_128',
  datamatrix: 'DATA_MATRIX',
  data_matrix: 'DATA_MATRIX',
  itf: 'ITF',
  itf14: 'ITF',
  ean13: 'EAN_13',
  ean_13: 'EAN_13',
  ean8: 'EAN_8',
  ean_8: 'EAN_8',
  pdf417: 'PDF_417',
  pdf_417: 'PDF_417',
  upca: 'UPC_A',
  upc_a: 'UPC_A',
  upce: 'UPC_E',
  upc_e: 'UPC_E',
};

function normalizeFormatToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Resolve ONE consumer format token to its expo-camera barcode type, or
 * undefined for unknown tokens. Unlike resolveNativeBarcodeTypes this never
 * falls back to the full set — BarcodePreview uses it to decide which
 * symbology to DRAW, and an unknown token must not accidentally read as one.
 */
export function resolveNativeBarcodeType(format?: string): NativeBarcodeType | undefined {
  if (!format) {
    return undefined;
  }
  return NATIVE_FORMAT_ALIASES[normalizeFormatToken(format)];
}

/**
 * Map consumer `formats` strings onto expo-camera barcode types.
 * Unknown tokens are dropped; an empty result falls back to the full set so
 * a typo cannot silently disable scanning.
 */
export function resolveNativeBarcodeTypes(formats?: string[]): NativeBarcodeType[] {
  if (!formats?.length) {
    return [...NATIVE_BARCODE_TYPES];
  }
  const seen = new Set<NativeBarcodeType>();
  const resolved: NativeBarcodeType[] = [];
  for (const raw of formats) {
    const mapped = resolveNativeBarcodeType(raw);
    if (!mapped || seen.has(mapped)) {
      continue;
    }
    seen.add(mapped);
    resolved.push(mapped);
  }
  return resolved.length ? resolved : [...NATIVE_BARCODE_TYPES];
}

/**
 * Map consumer `formats` strings onto html5-qrcode enum numeric ids.
 * Returns `undefined` when the filter is empty/unresolved so the library
 * keeps its default (all formats).
 */
export function resolveHtml5FormatIds(
  formats: string[] | undefined,
  enumObj: Record<string, number | string>,
): number[] | undefined {
  if (!formats?.length) {
    return undefined;
  }
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const raw of formats) {
    const key = HTML5_FORMAT_ALIASES[normalizeFormatToken(raw)];
    if (!key) {
      continue;
    }
    const val = enumObj[key];
    if (typeof val !== 'number' || seen.has(val)) {
      continue;
    }
    seen.add(val);
    ids.push(val);
  }
  return ids.length ? ids : undefined;
}

/** Contained scanner viewport height. Compact steps down. */
export function scannerViewportHeight(compact?: boolean): number {
  return compact ? 180 : 240;
}

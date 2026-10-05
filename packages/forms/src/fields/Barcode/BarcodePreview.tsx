/**
 * BarcodePreview — draws a value as a real barcode symbol using plain Views
 * (cross-platform: no canvas/svg/web-only dependency). The Code 128 strip
 * uses the theme ink on the theme surface, so a scheme flip restyles it with
 * the rest of the screen. The QR face does not follow the scheme: ISO/IEC
 * 18004 specifies dark modules on a light ground and makes a reversed symbol
 * optional for a reader, so the face renders under the light theme in both
 * schemes. Polarity there is machine meaning, the Axiom 11 literal
 * class, not styling.
 *
 * Two symbologies, chosen by the `format` prop through the SAME alias table
 * the scanner resolves with (scannerTypes) so the field never draws one
 * symbology while scanning another: `qr` renders the 2-D matrix from ./qr,
 * everything else keeps the 1-D Code 128 strip from ./code128.
 *
 * Containment contract: the symbol never exceeds its host. The strip
 * caps width at 100% and bars shrink proportionally (preserving relative
 * module widths) instead of painting past the frame; the QR square is drawn at
 * a WHOLE number of pixels per module, capped by `moduleWidth` and by the
 * `height` bound — always square, never letterboxed or clipped. Hosts bound
 * the height via the `height` prop (table cells keep it under the row height).
 *
 * Honest states: an empty value renders nothing (hosts show their own empty
 * marker); a value the symbology cannot encode (non-ASCII for Code 128 B,
 * over version 10 capacity for QR), or a QR whose modules would be under one
 * whole pixel at the host's bound, falls back to the raw value as mono text —
 * never a fake, truncated or unreadable symbol.
 */

import { Text, Theme, View, XStack, YStack } from 'tamagui';

import { t } from '../../shared/t';

import { encodeCode128B } from './code128';
import { QR_QUIET_ZONE_MODULES, encodeQr, qrRowRuns } from './qr';
import { resolveNativeBarcodeType } from './scannerTypes';

export type BarcodePreviewSymbology = 'qr' | 'code128';

/**
 * Which symbology the preview draws for a consumer format token. Resolves
 * through scannerTypes' alias table (the round-trip contract: what this
 * draws, the scanner resolves back to the same format id). Absent or unknown
 * tokens keep the historical Code 128 strip.
 */
export function barcodePreviewSymbology(format?: string): BarcodePreviewSymbology {
  return resolveNativeBarcodeType(format) === 'qr' ? 'qr' : 'code128';
}

export interface BarcodePreviewProps {
  value?: string;
  /**
   * Symbol height bound in px — content geometry, bounded by the host. The
   * 1-D strip always fills it; the QR square uses it as a CEILING and draws at
   * the largest whole-pixel module that fits under it.
   */
  height?: number;
  /** Width of one barcode module in px. Fractional values floor for QR. */
  moduleWidth?: number;
  /** Render the human-readable value under the symbol. */
  showText?: boolean;
  /**
   * Consumer format token (e.g. the field's primary `formats` entry). Any
   * alias of `qr` draws the QR matrix; others draw the Code 128 strip.
   */
  format?: string;
  /**
   * Render the raw value as mono text when the symbology cannot draw it —
   * non-ASCII for Code 128 B, over capacity or under one whole pixel per
   * module for QR. Default true, which is right for a standalone preview:
   * disappearing silently would be worse than an honest string. A host that
   * ALREADY shows the value beside the symbol (FieldDisplay) passes false, so
   * an undrawable symbol contributes nothing instead of printing it twice.
   */
  textFallback?: boolean;
}

/** Mono value text — both the honest fallback for
 * unencodable values and the optional human-readable line under the symbol. */
function MonoValue({ value }: { value: string }) {
  return (
    <Text fontFamily="$mono" fontSize="$2" numberOfLines={1} color="$color" flexShrink={1}>
      {value}
    </Text>
  );
}

export function BarcodePreview({
  value,
  height = 18,
  moduleWidth = 1,
  showText = false,
  format,
  textFallback = true,
}: BarcodePreviewProps) {
  if (!value) {
    return null;
  }
  if (barcodePreviewSymbology(format) === 'qr') {
    return (
      <QrPreview
        value={value}
        height={height}
        moduleWidth={moduleWidth}
        showText={showText}
        textFallback={textFallback}
      />
    );
  }
  const runs = encodeCode128B(value);
  if (!runs) {
    return textFallback ? <MonoValue value={value} /> : null;
  }
  const quietZone = moduleWidth * 10;
  return (
    <View
      role="img"
      aria-label={t('Barcode: {{value}}', { value })}
      testID="barcode-preview"
      flexDirection="column"
      alignItems="center"
      maxWidth="100%"
      minWidth={0}
      flexShrink={1}
      overflow="hidden">
      <XStack
        height={height}
        maxWidth="100%"
        minWidth={0}
        flexShrink={1}
        overflow="hidden"
        paddingHorizontal={quietZone}
        backgroundColor="$background"
        aria-hidden>
        {runs.map((run, index) => (
          <View
            key={index}
            width={run.modules * moduleWidth}
            height="100%"
            flexShrink={1}
            backgroundColor={run.bar ? '$color' : 'transparent'}
          />
        ))}
      </XStack>
      {showText && <MonoValue value={value} />}
    </View>
  );
}

function QrPreview({
  value,
  height,
  moduleWidth,
  showText,
  textFallback,
}: {
  value: string;
  height: number;
  moduleWidth: number;
  showText: boolean;
  textFallback: boolean;
}) {
  const matrix = encodeQr(value);
  if (!matrix) {
    return textFallback ? <MonoValue value={value} /> : null;
  }
  // A module must land on a WHOLE pixel. A fractional module width rounds to
  // different widths across the grid, so a decoder cannot resample the symbol —
  // measured on the media-11 board at DPR 2: the 33px square (1.000 px/module)
  // decoded and the 44px one (1.333 px/module) did not, in either scheme. So
  // the module is the largest whole pixel that fits, capped by `moduleWidth`
  // and by the host's `height` bound (the square never exceeds its
  // host, and the bound is a ceiling, never a target).
  const totalModules = matrix.size + 2 * QR_QUIET_ZONE_MODULES;
  const cell = Math.floor(Math.min(moduleWidth, height / totalModules));
  // Under one whole pixel there is no readable symbol to draw at all. Fall
  // back to the value as text, the same honest contract the over-capacity and
  // non-ASCII cases have: a symbol no reader can resample is decoration, and
  // decoration that looks like data is the one thing this component refuses to
  // paint. This is what a `compact` bound (24) or a table-row bound does to
  // anything past a short SKU.
  if (cell < 1) {
    return textFallback ? <MonoValue value={value} /> : null;
  }
  const edge = cell * totalModules;
  const quietZone = cell * QR_QUIET_ZONE_MODULES;
  const rows = qrRowRuns(matrix);
  return (
    <View
      role="img"
      aria-label={t('QR code: {{value}}', { value })}
      testID="barcode-preview"
      flexDirection="column"
      alignItems="center"
      maxWidth="100%"
      minWidth={0}
      flexShrink={1}
      overflow="hidden">
      <Theme name="light">
        <YStack
          testID="barcode-preview-qr"
          width={edge}
          height={edge}
          padding={quietZone}
          backgroundColor="$background"
          aria-hidden>
          {rows.map((runs, rowIndex) => (
            <XStack key={rowIndex} height={cell}>
              {runs.map((run, runIndex) => (
                <View
                  key={runIndex}
                  width={run.modules * cell}
                  height="100%"
                  backgroundColor={run.dark ? '$color' : 'transparent'}
                />
              ))}
            </XStack>
          ))}
        </YStack>
      </Theme>
      {showText && <MonoValue value={value} />}
    </View>
  );
}

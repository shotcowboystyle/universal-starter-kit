import { EraserIcon } from '@phosphor-icons/react';
import {
  useTouchSurface,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  wasKeyboardFocus,
  transitionProps,
} from '@repo/theme';
import type { DisabledSurfaceProps, KnobProps } from '@repo/theme';
import { getStroke } from 'perfect-freehand';
import type { PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
// Named import (not default): under tamagui 2.7.6 the vitest/vite pipeline
// resolves this module's CJS build with node-style interop, so a default
// import binds the module object instead of the Svg component. The named
// export is identical in both react-native-svg and tamagui's web shim.
import { Path, Svg } from 'react-native-svg';
import type { SvgProps } from 'react-native-svg';
import type { LabelProps, SizeTokens } from 'tamagui';
import { isWeb, Text, XStack, YStack, styled, useTheme as useTamaguiTheme } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout, useFieldDescribedBy } from '../../FieldLayout';
import type { FieldLayoutProps } from '../../FieldLayout';
import { formCommonColors, formInputColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import {
  clampRadiusForLargeComponent,
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import type { FieldValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const base64PadIndex = 64;

// Byte <-> binary string (one char per byte), the format btoa/atob speak.
const bytesToBinary = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return binary;
};

const binaryToBytes = (binary: string): Uint8Array => Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);

// Manual base64 encoding as last resort. Bit shifts are written as integer
// arithmetic (x >> n === floor(x / 2^n), (x & m) << n === (x % (m + 1)) * 2^n
// for the 0..255 byte range).
const encodeBase64Manual = (bytes: Uint8Array): string => {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;
    result += base64Chars[Math.floor(b1 / 4)];
    result += base64Chars[(b1 % 4) * 16 + Math.floor(b2 / 16)];
    result += i + 1 < bytes.length ? base64Chars[(b2 % 16) * 4 + Math.floor(b3 / 64)] : '=';
    result += i + 2 < bytes.length ? base64Chars[b3 % 64] : '=';
  }
  return result;
};

const decodeBase64Manual = (base64: string): Uint8Array => {
  const bytes: number[] = [];
  for (let i = 0; i < base64.length; i += 4) {
    const e1 = base64Chars.indexOf(base64[i]);
    const e2 = base64Chars.indexOf(base64[i + 1]);
    const e3 = base64Chars.indexOf(base64[i + 2]);
    const e4 = base64Chars.indexOf(base64[i + 3]);
    bytes.push(e1 * 4 + Math.floor(e2 / 16));
    if (e3 !== base64PadIndex) {
      bytes.push((e2 % 16) * 16 + Math.floor(e3 / 4));
    }
    if (e4 !== base64PadIndex) {
      bytes.push((e3 % 4) * 64 + e4);
    }
  }
  return new Uint8Array(bytes);
};

// Cross-platform base64 encoding/decoding (UTF-8 aware)
const encodeBase64 = (str: string): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- feature probe: React Native runtimes may not define the btoa global
  if (typeof btoa === 'function') {
    return btoa(bytesToBinary(new TextEncoder().encode(str)));
  }
  // React Native fallback using global Buffer if available, otherwise manual encoding
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  return encodeBase64Manual(new TextEncoder().encode(str));
};

const decodeBase64 = (base64: string): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- feature probe: React Native runtimes may not define the atob global
  if (typeof atob === 'function') {
    return new TextDecoder('utf-8', { fatal: true }).decode(binaryToBytes(atob(base64)));
  }
  // React Native fallback using global Buffer if available
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
  return new TextDecoder().decode(decodeBase64Manual(base64));
};

type Point = [number, number, number];
type Stroke = Point[];

const signatureDataPrefix = 'data:application/json;base64,';

// Minimum distance between points - lower = more points = better speed capture
const minPointDistance = 1;

// Base stroke size at reference dimensions - scales with canvas
const baseStrokeSize = 8;
const referenceWidth = 500;
const referenceHeight = 200;

// Base options - size is set dynamically based on canvas dimensions for scaling
const strokeOptionsBase = {
  // Moderate pressure effect (fast=thin, slow=thick)
  thinning: 0.65,
  smoothing: 0.2,
  // No streamline = preserve point spacing for pressure
  streamline: 0,
  easing: (progress: number) => progress,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
};

// Normalize stroke to 0-1 range for resolution-independent storage
const normalizeStroke = (stroke: Stroke, width: number, height: number): Stroke => {
  if (width <= 0 || height <= 0) {
    return stroke;
  }
  return stroke.map(([x, y, p]): Point => [x / width, y / height, p]);
};

// Denormalize stroke from 0-1 to canvas dimensions
const denormalizeStroke = (stroke: Stroke, width: number, height: number): Stroke => {
  if (width <= 0 || height <= 0) {
    return stroke;
  }
  return stroke.map(([x, y, p]): Point => [x * width, y * height, p]);
};

// Stroke size scaled to canvas - maintains consistent visual thickness across screen sizes
const getScaledStrokeSize = (width: number, height: number): number => {
  const scale = Math.sqrt((width * height) / (referenceWidth * referenceHeight));
  return Math.max(4, Math.round(baseStrokeSize * scale));
};

// Calculate distance between two points
const pointDistance = (p1: Point, p2: Point): number => Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);

// Check if stroke has real stylus pressure (vs mouse/touch default 0.5)
const hasRealPressure = (points: Stroke): boolean =>
  points.some((p) => p[2] !== undefined && p[2] !== 0.5 && p[2] > 0 && p[2] < 1);

// Fixed thresholds (px) - consistent mapping regardless of stroke
// Points closer than this = slow = thick
const slowDistance = 4;
// Points farther than this = fast = thin
const fastDistance = 25;

// Infer pressure from point spacing: close = slow = thick, far = fast = thin
const pressureFromSpacing = (points: Stroke): Stroke => {
  if (points.length < 2) {
    return points;
  }
  if (hasRealPressure(points)) {
    return points;
  }

  // Fixed thresholds: d < SLOW = thick, d > FAST = thin, linear between (narrower range)
  return points.map((p, i): Point => {
    // The first point borrows the first segment's spacing (length >= 2 here).
    const d = i === 0 ? pointDistance(points[1], points[0]) : pointDistance(p, points[i - 1]);
    const speed = Math.max(0, Math.min(1, (d - slowDistance) / (fastDistance - slowDistance)));
    // 0.35 (fast) to 0.7 (slow) - subtler variation
    const pressure = 0.7 - speed * 0.35;
    return [p[0], p[1], Math.max(0.3, Math.min(0.8, pressure))];
  });
};

// Get stroke options with size scaled to canvas dimensions
const getStrokeOptions = (_points: Stroke, strokeSize: number) => ({
  ...strokeOptionsBase,
  size: strokeSize,
  simulatePressure: false,
});

const getSvgPathFromStroke = (stroke: number[][]): string => {
  if (stroke.length === 0) {
    return '';
  }

  const d: (string | number)[] = ['M', ...stroke[0], 'Q'];
  for (const [i, [x0, y0]] of stroke.entries()) {
    const [x1, y1] = stroke[(i + 1) % stroke.length];
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }

  d.push('Z');
  return d.join(' ');
};

/** Strokes decoded from a stored value; `normalized` is false for the legacy pixel-space format. */
interface DecodedSignature {
  strokes: Stroke[];
  normalized: boolean;
}

/** Decode a stored signature data URL; undefined when absent or malformed. */
const decodeSignature = (value: string): DecodedSignature | undefined => {
  if (!value.startsWith(signatureDataPrefix)) {
    return undefined;
  }
  try {
    const payload: unknown = JSON.parse(decodeBase64(value.slice(signatureDataPrefix.length)));
    if (Array.isArray(payload)) {
      // SAFETY: the legacy (v1) format stored a bare Stroke[] array in canvas pixels; malformed entries are caught by the caller.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
      return { strokes: payload as Stroke[], normalized: false };
    }
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- boundary parser for the untyped JSON payload decoded from the stored value
    if (typeof payload !== 'object' || payload === null || !('v' in payload) || !('s' in payload)) {
      return undefined;
    }
    if (payload.v !== 2 || !Array.isArray(payload.s)) {
      return undefined;
    }
    // SAFETY: v2 payloads ({ v: 2, s }) are only written by saveStrokes, which serializes normalized Stroke[] under `s`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
    return { strokes: payload.s as Stroke[], normalized: true };
  } catch {
    // Safe to continue: a malformed stored value renders as an empty pad
    return undefined;
  }
};

/** Normalized strokes of a v2 value; [] for empty, malformed or legacy values. */
const getV2Strokes = (value: string): Stroke[] => {
  const decoded = decodeSignature(value);
  return decoded?.normalized === true ? decoded.strokes : [];
};

/** Parse signature value (base64 JSON) into normalized strokes. Returns [] if invalid. */
const parseSignatureValue = (value: string): Stroke[] => {
  const decoded = decodeSignature(value);
  if (decoded === undefined) {
    return [];
  }
  if (decoded.normalized) {
    return decoded.strokes;
  }
  try {
    const legacy = decoded.strokes;
    const allX = legacy.flatMap((s) => s.map((p) => p[0]));
    const allY = legacy.flatMap((s) => s.map((p) => p[1]));
    const maxX = Math.max(...allX, 1);
    const maxY = Math.max(...allY, 1);
    return legacy.map((stroke) => stroke.map(([x, y, p]): Point => [x / maxX, y / maxY, p]));
  } catch {
    // Safe to continue: malformed legacy strokes render as an empty signature
    return [];
  }
};

/**
 * Convert a signature value (from Signature's value/onChange) to an SVG string.
 * @param value - The stored signature value (base64 JSON)
 * @param width - Output SVG width (default 500)
 * @param height - Output SVG height (default 200)
 * @param penColor - Stroke color (default currentColor so the host scheme tints ink)
 * @returns SVG string or empty string if no strokes
 */
// oxlint-disable-next-line react-doctor/only-export-components -- public helper co-located with Signature; consumers import both from this module
export const signatureValueToSvg = (value: string, width = 500, height = 200, penColor = 'currentColor'): string => {
  const strokes = parseSignatureValue(value);
  if (strokes.length === 0) {
    return '';
  }

  const strokeSize = getScaledStrokeSize(width, height);
  const paths: string[] = strokes.map((stroke) => {
    const denormalized = denormalizeStroke(stroke, width, height);
    const pointsWithPressure = pressureFromSpacing(denormalized);
    const options = getStrokeOptions(pointsWithPressure, strokeSize);
    const outlinePoints = getStroke(pointsWithPressure, options);
    return getSvgPathFromStroke(outlinePoints);
  });

  const pathElements = paths
    .filter(Boolean)
    .map((d) => `<path d="${d}" fill="${penColor}" stroke="${penColor}" stroke-width="1"/>`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${pathElements}</svg>`;
};

// Rows of field height for the signature pad (3x single-line input height)
const signatureHeightRows = 3;
/** Legal-pad aspect (width / height). Size token supplies the height; this keeps the ratio. */
const signatureAspect = 2.5;
const defaultClearIcon = <EraserIcon size={16} />;

// Large-canvas family: honor elevation on the
// pad FRAME the same way FileUpload's dropzone does — a styled surface that
// accepts the resolver token. Ink stays clipped; web box-shadow paints
// outside overflow:hidden.
const SignaturePadFrame = styled(YStack, {
  name: 'SignaturePad',
  position: 'relative',
  overflow: 'hidden',
  userSelect: 'none',
  outlineWidth: 0,
});

interface SignatureCanvasProps {
  id?: string;
  hasLabel?: boolean;
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
  readOnly?: boolean;
  width: number;
  height: number;
  penColor: string;
  backgroundColor?: string;
  knobProps: KnobProps;
  disabledSurface?: DisabledSurfaceProps;
  size?: SizeTokens;
  error?: string | boolean;
  clearIcon: ReactNode;
  required?: boolean;
  hasError?: boolean;
}

type DrawEvent = GestureResponderEvent | PointerEvent<SVGSVGElement>;

// The pad wires pointer handlers on web and responder handlers on native
// (see svgProps), so the platform alone tells which event shape arrived.
const isWebPointerEvent = (_event: DrawEvent): _event is PointerEvent<SVGSVGElement> => isWeb;

const isPrimaryDrawPointer = (event: DrawEvent): boolean => {
  if (!isWebPointerEvent(event)) {
    return true;
  }
  if (!event.isPrimary) {
    return false;
  }
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return false;
  }
  return true;
};

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

const getPadCursor = (disabled: boolean, readOnly: boolean): 'not-allowed' | 'default' | 'crosshair' => {
  if (disabled) {
    return 'not-allowed';
  }
  return readOnly ? 'default' : 'crosshair';
};

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- existing pad component; splitting its pointer/keyboard/render wiring is a refactor beyond lint cleanup
const SignatureCanvasImpl = ({
  id,
  hasLabel,
  value,
  onValueChange,
  disabled,
  readOnly,
  width,
  height,
  penColor,
  backgroundColor,
  knobProps,
  disabledSurface,
  size,
  error,
  clearIcon,
  required,
  hasError,
}: SignatureCanvasProps) => {
  const hydrationTouch = useTouchSurface();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [kbFocus, setKbFocus] = useState(false);
  const svgRef = useRef<Svg>(null);
  const isDrawing = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const describedBy = useFieldDescribedBy();
  const aspectRatio = width / height;
  // SAFETY: knobProps.sizeToken is always a size-token key ($1..$N)
  const resolvedSizeToken = (size ?? knobProps.sizeToken) as SizeTokens;
  const minHeightPx = getFieldHeight(resolvedSizeToken, signatureHeightRows, hydrationTouch);
  const cappedRadius = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius);
  const canDraw = !disabled && !readOnly;
  const canFocus = !disabled;
  const hasInk = strokes.length > 0 || currentStroke !== null;
  const borderColors = hasErrorValue(error)
    ? { base: formCommonColors.error, hover: formCommonColors.error, focus: formCommonColors.error }
    : formInputColors.border;

  if (isWeb) {
    ensureKeyboardModalityTracking();
  }

  const setCommittedStrokes = useCallback((next: Stroke[]) => {
    strokesRef.current = next;
    setStrokes(next);
  }, []);

  // Restore strokes from v2 normalized format
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- local strokes (mirrored in strokesRef for the pointer handlers) must reset when the stored value changes; deriving them from `value` would drop ink when the parent does not feed onChange back
    setCommittedStrokes(getV2Strokes(value));
  }, [value, setCommittedStrokes]);

  const saveStrokes = useCallback(
    (newStrokes: Stroke[]) => {
      if (newStrokes.length === 0) {
        onValueChange('');
        return;
      }
      const payload = { v: 2, s: newStrokes };
      const json = JSON.stringify(payload);
      const base64 = encodeBase64(json);
      onValueChange(`${signatureDataPrefix}${base64}`);
    },
    [onValueChange],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setDimensions({ width: w, height: h });
  }, []);

  const getPoint = useCallback((event: DrawEvent): Point => {
    if (isWebPointerEvent(event)) {
      const svg = event.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const pressure = event.pressure ?? 0.5;
      return [x, y, pressure];
    }
    const { nativeEvent } = event;
    return [nativeEvent.locationX, nativeEvent.locationY, 0.5];
  }, []);

  const handleStart = useCallback(
    (event: DrawEvent) => {
      if (!canDraw || !isPrimaryDrawPointer(event)) {
        return;
      }
      isDrawing.current = true;
      const point = getPoint(event);
      currentStrokeRef.current = [point];
      setCurrentStroke([point]);

      if (isWebPointerEvent(event)) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    },
    [canDraw, getPoint],
  );

  const handleMove = useCallback(
    (event: DrawEvent) => {
      if (!isDrawing.current || !canDraw) {
        return;
      }
      const point = getPoint(event);
      setCurrentStroke((prev) => {
        const base = prev ?? currentStrokeRef.current;
        if (!base) {
          currentStrokeRef.current = [point];
          return [point];
        }
        const lastPoint = base.at(-1);
        if (lastPoint !== undefined && pointDistance(point, lastPoint) < minPointDistance) {
          return prev ?? base;
        }
        const next = [...base, point];
        currentStrokeRef.current = next;
        return next;
      });
    },
    [canDraw, getPoint],
  );

  const handleEnd = useCallback(() => {
    if (!isDrawing.current) {
      return;
    }
    isDrawing.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    setCurrentStroke(null);
    if (stroke && stroke.length > 0 && dimensions.width > 0 && dimensions.height > 0) {
      const normalized = normalizeStroke(stroke, dimensions.width, dimensions.height);
      const newStrokes = [...strokesRef.current, normalized];
      setCommittedStrokes(newStrokes);
      saveStrokes(newStrokes);
    }
  }, [dimensions, saveStrokes, setCommittedStrokes]);

  const handleClear = useCallback(() => {
    isDrawing.current = false;
    currentStrokeRef.current = null;
    setCurrentStroke(null);
    setCommittedStrokes([]);
    onValueChange('');
  }, [onValueChange, setCommittedStrokes]);

  const handlePadKeyDown = useCallback(
    (e: { target: unknown; currentTarget: unknown; key?: string; preventDefault?: () => void }) => {
      if (e.target !== e.currentTarget) {
        return;
      }
      if (!canDraw) {
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Escape') {
        if (strokesRef.current.length === 0 && !currentStrokeRef.current) {
          return;
        }
        e.preventDefault?.();
        handleClear();
      }
    },
    [canDraw, handleClear],
  );

  const strokeSize = getScaledStrokeSize(dimensions.width || width, dimensions.height || height);
  const canvasW = dimensions.width || width;
  const canvasH = dimensions.height || height;

  const completedPaths = strokes.map((stroke) => {
    const denormalized = denormalizeStroke(stroke, canvasW, canvasH);
    const pointsWithPressure = pressureFromSpacing(denormalized);
    const options = getStrokeOptions(pointsWithPressure, strokeSize);
    const outlinePoints = getStroke(pointsWithPressure, options);
    return getSvgPathFromStroke(outlinePoints);
  });

  const currentPath = currentStroke
    ? (() => {
        const pointsWithPressure = pressureFromSpacing(currentStroke);
        const options = getStrokeOptions(pointsWithPressure, strokeSize);
        return getSvgPathFromStroke(getStroke(pointsWithPressure, options));
      })()
    : null;

  const paths = currentPath === null || currentPath === '' ? completedPaths : [...completedPaths, currentPath];
  const cursor = getPadCursor(disabled, readOnly === true);
  const webTabIndex = canFocus ? 0 : -1;

  const svgProps = isWeb
    ? {
        onPointerDown: handleStart,
        onPointerMove: handleMove,
        onPointerUp: handleEnd,
        onLostPointerCapture: handleEnd,
        style: {
          touchAction: 'none' as const,
          userSelect: 'none' as const,
          outline: 'none',
          cursor,
          backgroundColor: 'transparent',
        },
      }
    : {
        onStartShouldSetResponder: () => canDraw,
        onMoveShouldSetResponder: () => canDraw,
        onResponderGrant: handleStart,
        onResponderMove: handleMove,
        onResponderRelease: handleEnd,
        onResponderTerminate: handleEnd,
        style: { backgroundColor: 'transparent' },
      };

  const frameRing = kbFocus ? ensureFocusVisibleRing({ outlineOffset: -2 }) : undefined;

  return (
    <SignaturePadFrame
      id={id}
      onLayout={handleLayout}
      {...knobProps.inputSurface}
      backgroundColor={backgroundColor ?? knobProps.inputBackground}
      {...(disabled ? disabledSurface : undefined)}
      borderRadius={cappedRadius}
      borderWidth={knobProps.borderRadius.borderWidth}
      elevation={knobProps.elevation}
      borderColor={borderColors.base}
      aspectRatio={aspectRatio}
      minHeight={minHeightPx}
      cursor={cursor}
      hoverStyle={disabled ? undefined : { borderColor: borderColors.hover }}
      focusStyle={{
        outlineWidth: 0,
        borderColor: borderColors.focus,
      }}
      focusVisibleStyle={ensureFocusVisibleRing({
        outlineOffset: -2,
        borderColor: borderColors.focus,
      })}
      {...frameRing}
      {...transitionProps(knobProps.transition)}
      focusable={canFocus}
      tabIndex={isWeb ? webTabIndex : undefined}
      onFocus={() => {
        if (isWeb && wasKeyboardFocus()) {
          setKbFocus(true);
        }
      }}
      onBlur={() => {
        setKbFocus(false);
      }}
      onKeyDown={isWeb ? handlePadKeyDown : undefined}
      aria-required={required ?? undefined}
      aria-invalid={hasError ?? undefined}
      aria-readonly={readOnly ?? undefined}
      aria-disabled={disabled || undefined}
      aria-describedby={describedBy}
      aria-keyshortcuts={canDraw ? 'Delete Backspace Escape' : undefined}
      data-signature="pad"
      data-min-height={minHeightPx}
      data-signed={hasInk ? 'true' : 'false'}
      data-keyboard-ring={kbFocus ? 'true' : undefined}
      {...(hasLabel ? null : { 'aria-label': hasInk ? t('Signature, signed') : t('Signature, empty') })}>
      {/* Legal-pad baseline (DocuSign / Adobe Sign): X + rule behind ink. */}
      <XStack
        position="absolute"
        bottom="22%"
        left={knobProps.control.paddingHorizontal}
        right={knobProps.control.paddingHorizontal}
        alignItems="center"
        pointerEvents="none"
        opacity={0.55}
        {...knobProps.gap}>
        <Text
          color={formCommonColors.muted}
          fontStyle="italic"
          {...knobProps.body}
          {...knobProps.controlType}>
          {t('X')}
        </Text>
        <YStack
          flex={1}
          height={1}
          backgroundColor={formCommonColors.divider}
        />
      </XStack>
      <Svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width || 100} ${dimensions.height || 100}`}
        // SAFETY: react-native-svg forwards unknown props to the DOM <svg> on web (pointer handlers) and the responder props on native; its SvgProps type omits the web-only pointer events.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
        {...(svgProps as SvgProps)}>
        {paths.map((d, i) => (
          <Path
            // oxlint-disable-next-line react-doctor/no-array-index-as-key -- strokes are positional and carry no stable id; identical strokes would collide on a path-string key
            key={i}
            d={d}
            fill={penColor}
            stroke={penColor}
            strokeWidth={1}
          />
        ))}
      </Svg>
      {/* Hide arm: with nothing drawn (or the field
          disabled) clearing is irrelevant — hide the action instead of
          rendering a bare-disabled button. The overlay is absolutely
          positioned, so appearing at first stroke shifts no layout. */}
      {!readOnly && !disabled && strokes.length > 0 && (
        <XStack
          position="absolute"
          bottom="$2"
          insetInlineEnd="$2"
          pointerEvents="box-none"
          alignItems="flex-end"
          justifyContent="flex-end">
          <Button
            size="$2"
            onPress={handleClear}
            icon={clearIcon}>
            <Button.Text {...knobProps.body}>{t('Clear')}</Button.Text>
          </Button>
        </XStack>
      )}
    </SignaturePadFrame>
  );
};

export interface SignatureProps {
  name?: string;
  form?: AnyFormApi;
  validators?: FieldValidators;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  size?: SizeTokens;
  id?: string;
  /** Base64 data URL of the signature (JSON strokes or image) */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: FieldLayoutProps['onBlur'];
  disabled?: boolean;
  readOnly?: boolean;
  /** Canvas width in pixels for aspect ratio (default: size-derived height × 2.5) */
  width?: number;
  /** Canvas height in pixels for aspect ratio (default: size-token field height × 3) */
  height?: number;
  /** Pen color (default derived from theme) */
  penColor?: string;
  /** Background color (default derived from theme) */
  backgroundColor?: string;
  /** Icon element for the clear button */
  clearIcon?: ReactNode;
  /** When true, renders a skeleton placeholder instead of the signature pad */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
}

export const Signature = ({
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
  width,
  height,
  penColor: penColorProp,
  backgroundColor: backgroundColorProp,
  clearIcon = defaultClearIcon,
  skeleton,
  compact,
}: SignatureProps) => {
  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, disabledState, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const tamaguiTheme = useTamaguiTheme();
  // SAFETY: knobProps.sizeToken is always a size-token key ($1..$N)
  const resolvedSizeToken = (size ?? knobProps.sizeToken) as SizeTokens;
  const minHeightPx = getFieldHeight(resolvedSizeToken, signatureHeightRows, hydrationTouch);
  const padHeight = height ?? minHeightPx;
  const padWidth = width ?? Math.round(padHeight * signatureAspect);

  // Render skeleton placeholder
  if (skeleton) {
    const cappedRadius = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius);
    return (
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        <Skeleton
          variant="rounded"
          width="100%"
          height={minHeightPx}
          borderRadius={cappedRadius}
        />
      </FieldLayout>
    );
  }

  // SAFETY: theme color tokens resolve to CSS color strings
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
  const penColor = penColorProp ?? (tamaguiTheme.color12?.val as string | undefined) ?? 'currentColor';

  const canvasProps = {
    id,
    hasLabel: Boolean(label),
    disabled: !!disabled,
    readOnly: !!readOnly,
    width: padWidth,
    height: padHeight,
    penColor,
    backgroundColor: backgroundColorProp,
    knobProps,
    disabledSurface: disabledState.surfaceKnobProps,
    size,
    clearIcon,
  };

  if (resolvedForm === undefined || name === undefined || name === '') {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        <SignatureCanvasImpl
          {...canvasProps}
          value={value ?? defaultValue ?? ''}
          onValueChange={(v) => onChange?.(v)}
          error={error}
          required={required}
          hasError={hasErrorValue(error)}
        />
      </FieldLayout>
    );
  }

  return (
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            helperText={helperText}
            required={required}
            size={size}
            knobProps={knobProps}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}>
            <SignatureCanvasImpl
              {...canvasProps}
              value={field.state.value ?? ''}
              onValueChange={(v) => {
                field.handleChange(v);
                onChange?.(v);
              }}
              error={resolvedError}
              required={required}
              hasError={hasErrorValue(resolvedError)}
            />
          </FieldLayout>
        );
      }}
    </Field>
  );
};

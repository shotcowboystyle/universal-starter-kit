import { EraserIcon } from '@phosphor-icons/react';
import { useTouchSurface } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import { ensureFocusVisibleRing, ensureKeyboardModalityTracking, wasKeyboardFocus, transitionProps } from '@repo/theme';
import { getStroke } from 'perfect-freehand';
import type { PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
// Named import (not default): under tamagui 2.7.6 the vitest/vite pipeline
// resolves this module's CJS build with node-style interop, so a default
// import binds the module object instead of the Svg component. The named
// export is identical in both react-native-svg and tamagui's web shim.
import { Path, Svg } from 'react-native-svg';
import type { LabelProps, SizeTokens } from 'tamagui';
import { isWeb, Text, XStack, YStack, styled, useTheme as useTamaguiTheme } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout, useFieldDescribedBy } from '../../fieldLayout';
import { formCommonColors, formInputColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';
import {
  clampRadiusForLargeComponent,
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

// Cross-platform base64 encoding/decoding
function encodeBase64(str: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(str)));
  }
  // React Native fallback using global Buffer if available, otherwise manual encoding
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  // Manual base64 encoding as last resort
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const bytes = new TextEncoder().encode(str);
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[b3 & 63] : '=';
  }
  return result;
}

function decodeBase64(base64: string): string {
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(base64)));
  }
  // React Native fallback using global Buffer if available
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
  // Manual base64 decoding as last resort
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const bytes: number[] = [];
  for (let i = 0; i < base64.length; i += 4) {
    const e1 = chars.indexOf(base64[i]);
    const e2 = chars.indexOf(base64[i + 1]);
    const e3 = chars.indexOf(base64[i + 2]);
    const e4 = chars.indexOf(base64[i + 3]);
    bytes.push((e1 << 2) | (e2 >> 4));
    if (e3 !== 64) {
      bytes.push(((e2 & 15) << 4) | (e3 >> 2));
    }
    if (e4 !== 64) {
      bytes.push(((e3 & 3) << 6) | e4);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

type Point = [number, number, number];
type Stroke = Point[];

// Minimum distance between points - lower = more points = better speed capture
const minPointDistance = 1;

// Base stroke size at reference dimensions - scales with canvas
const baseStrokeSize = 8;
const referenceWidth = 500;
const referenceHeight = 200;

// Base options - size is set dynamically based on canvas dimensions for scaling
const strokeOptionsBase = {
  thinning: 0.65, // Moderate pressure effect (fast=thin, slow=thick)
  smoothing: 0.2,
  streamline: 0, // No streamline = preserve point spacing for pressure
  easing: (t: number) => t,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
};

// Normalize stroke to 0-1 range for resolution-independent storage
function normalizeStroke(stroke: Stroke, width: number, height: number): Stroke {
  if (width <= 0 || height <= 0) {
    return stroke;
  }
  return stroke.map(([x, y, p]) => [x / width, y / height, p] as Point);
}

// Denormalize stroke from 0-1 to canvas dimensions
function denormalizeStroke(stroke: Stroke, width: number, height: number): Stroke {
  if (width <= 0 || height <= 0) {
    return stroke;
  }
  return stroke.map(([x, y, p]) => [x * width, y * height, p] as Point);
}

// Stroke size scaled to canvas - maintains consistent visual thickness across screen sizes
function getScaledStrokeSize(width: number, height: number): number {
  const scale = Math.sqrt((width * height) / (referenceWidth * referenceHeight));
  return Math.max(4, Math.round(baseStrokeSize * scale));
}

// Calculate distance between two points
function pointDistance(p1: Point, p2: Point): number {
  return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
}

// Check if stroke has real stylus pressure (vs mouse/touch default 0.5)
function hasRealPressure(points: Stroke): boolean {
  return points.some((p) => p[2] !== undefined && p[2] !== 0.5 && p[2] > 0 && p[2] < 1);
}

// Fixed thresholds (px) - consistent mapping regardless of stroke
const slowDistance = 4; // Points closer than this = slow = thick
const fastDistance = 25; // Points farther than this = fast = thin

// Infer pressure from point spacing: close = slow = thick, far = fast = thin
function pressureFromSpacing(points: Stroke): Stroke {
  if (points.length < 2) {
    return points;
  }
  if (hasRealPressure(points)) {
    return points;
  }

  const distances: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const d =
      i === 0
        ? points.length > 1
          ? pointDistance(points[1], points[0])
          : slowDistance
        : pointDistance(points[i], points[i - 1]);
    distances.push(d);
  }

  // Fixed thresholds: d < SLOW = thick, d > FAST = thin, linear between (narrower range)
  return points.map((p, i) => {
    const d = distances[i];
    const t = Math.max(0, Math.min(1, (d - slowDistance) / (fastDistance - slowDistance)));
    const pressure = 0.7 - t * 0.35; // 0.35 (fast) to 0.7 (slow) - subtler variation
    return [p[0], p[1], Math.max(0.3, Math.min(0.8, pressure))] as Point;
  });
}

// Get stroke options with size scaled to canvas dimensions
function getStrokeOptions(_points: Stroke, strokeSize: number) {
  return {
    ...strokeOptionsBase,
    size: strokeSize,
    simulatePressure: false,
  };
}

function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) {
    return '';
  }

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q'],
  );

  d.push('Z');
  return d.join(' ');
}

/** Parse signature value (base64 JSON) into normalized strokes. Returns [] if invalid. */
function parseSignatureValue(value: string): Stroke[] {
  if (!value || !value.startsWith('data:application/json;base64,')) {
    return [];
  }
  try {
    const base64 = value.replace('data:application/json;base64,', '');
    const json = decodeBase64(base64);
    const parsed = JSON.parse(json);
    if (parsed?.v === 2 && Array.isArray(parsed.s)) {
      return parsed.s;
    }
    if (Array.isArray(parsed)) {
      const allX = parsed.flatMap((s: Stroke) => s.map((p) => p[0]));
      const allY = parsed.flatMap((s: Stroke) => s.map((p) => p[1]));
      const maxX = Math.max(...allX, 1);
      const maxY = Math.max(...allY, 1);
      return parsed.map((stroke: Stroke) => stroke.map(([x, y, p]) => [x / maxX, y / maxY, p] as Point));
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Convert a signature value (from Signature's value/onChange) to an SVG string.
 * @param value - The stored signature value (base64 JSON)
 * @param width - Output SVG width (default 500)
 * @param height - Output SVG height (default 200)
 * @param penColor - Stroke color (default currentColor so the host scheme tints ink)
 * @returns SVG string or empty string if no strokes
 */
export function signatureValueToSvg(value: string, width = 500, height = 200, penColor = 'currentColor'): string {
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
}

// Rows of field height for the signature pad (3x single-line input height)
const signatureHeightRows = 3;
/** Legal-pad aspect (width / height). Size token supplies the height; this keeps the ratio. */
const signatureAspect = 2.5;
const defaultClearIcon = <EraserIcon size={16} />;

// Large-canvas family: honour elevation on the
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
  disabledSurface?: Record<string, unknown>;
  size?: SizeTokens;
  error?: string | boolean;
  clearIcon: ReactNode;
  required?: boolean;
  hasError?: boolean;
}

function isPrimaryDrawPointer(event: GestureResponderEvent | PointerEvent<SVGSVGElement>): boolean {
  if (!isWeb) {
    return true;
  }
  const webEvent = event as PointerEvent<SVGSVGElement>;
  if (!webEvent.isPrimary) {
    return false;
  }
  if (webEvent.pointerType === 'mouse' && webEvent.button !== 0) {
    return false;
  }
  return true;
}

function SignatureCanvasImpl({
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
}: SignatureCanvasProps) {
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
  const resolvedSizeToken = (size ?? knobProps.sizeToken) as SizeTokens;
  const minHeightPx = getFieldHeight(resolvedSizeToken, signatureHeightRows, hydrationTouch);
  const cappedRadius = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius);
  const canDraw = !disabled && !readOnly;
  const canFocus = !disabled;
  const hasInk = strokes.length > 0 || !!currentStroke;

  if (isWeb) {
    ensureKeyboardModalityTracking();
  }

  const setCommittedStrokes = useCallback((next: Stroke[]) => {
    strokesRef.current = next;
    setStrokes(next);
  }, []);

  // Restore strokes from v2 normalized format
  useEffect(() => {
    if (!value) {
      setCommittedStrokes([]);
      return;
    }
    if (value.startsWith('data:application/json;base64,')) {
      try {
        const base64 = value.replace('data:application/json;base64,', '');
        const json = decodeBase64(base64);
        const parsed = JSON.parse(json);
        if (parsed?.v === 2 && Array.isArray(parsed.s)) {
          setCommittedStrokes(parsed.s);
          return;
        }
      } catch {
        // ignore
      }
    }
    setCommittedStrokes([]);
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
      onValueChange(`data:application/json;base64,${base64}`);
    },
    [onValueChange],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setDimensions({ width: w, height: h });
  }, []);

  const getPoint = useCallback((event: GestureResponderEvent | PointerEvent<SVGSVGElement>): Point => {
    if (isWeb) {
      const webEvent = event as PointerEvent<SVGSVGElement>;
      const svg = webEvent.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = webEvent.clientX - rect.left;
      const y = webEvent.clientY - rect.top;
      const pressure = (webEvent as any).pressure ?? 0.5;
      return [x, y, pressure];
    }
    const nativeEvent = (event as GestureResponderEvent).nativeEvent;
    return [nativeEvent.locationX, nativeEvent.locationY, 0.5];
  }, []);

  const handleStart = useCallback(
    (event: GestureResponderEvent | PointerEvent<SVGSVGElement>) => {
      if (!canDraw || !isPrimaryDrawPointer(event)) {
        return;
      }
      isDrawing.current = true;
      const point = getPoint(event);
      currentStrokeRef.current = [point];
      setCurrentStroke([point]);

      if (isWeb) {
        const target = (event as PointerEvent<SVGSVGElement>).currentTarget;
        const pointerId = (event as PointerEvent<SVGSVGElement>).pointerId;
        target.setPointerCapture?.(pointerId);
      }
    },
    [canDraw, getPoint],
  );

  const handleMove = useCallback(
    (event: GestureResponderEvent | PointerEvent<SVGSVGElement>) => {
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
        const lastPoint = base[base.length - 1];
        if (pointDistance(point, lastPoint) < minPointDistance) {
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

  const paths = currentPath ? [...completedPaths, currentPath] : completedPaths;
  const cursor = disabled ? 'not-allowed' : readOnly ? 'default' : 'crosshair';

  const svgProps = isWeb
    ? {
        onPointerDown: handleStart as (e: PointerEvent<SVGSVGElement>) => void,
        onPointerMove: handleMove as (e: PointerEvent<SVGSVGElement>) => void,
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
        onResponderGrant: handleStart as (e: GestureResponderEvent) => void,
        onResponderMove: handleMove as (e: GestureResponderEvent) => void,
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
      borderColor={error ? formCommonColors.error : formInputColors.border.base}
      aspectRatio={aspectRatio}
      minHeight={minHeightPx}
      cursor={cursor}
      hoverStyle={disabled ? undefined : { borderColor: error ? formCommonColors.error : formInputColors.border.hover }}
      focusStyle={{
        outlineWidth: 0,
        borderColor: error ? formCommonColors.error : formInputColors.border.focus,
      }}
      focusVisibleStyle={ensureFocusVisibleRing({
        outlineOffset: -2,
        borderColor: error ? formCommonColors.error : formInputColors.border.focus,
      })}
      {...frameRing}
      {...transitionProps(knobProps.transition)}
      focusable={canFocus}
      tabIndex={isWeb ? (canFocus ? 0 : -1) : undefined}
      onFocus={() => {
        if (isWeb && wasKeyboardFocus()) {
          setKbFocus(true);
        }
      }}
      onBlur={() => {
        setKbFocus(false);
      }}
      onKeyDown={isWeb ? handlePadKeyDown : undefined}
      aria-required={required || undefined}
      aria-invalid={hasError || undefined}
      aria-readonly={readOnly || undefined}
      aria-disabled={disabled || undefined}
      aria-describedby={describedBy}
      aria-keyshortcuts={canDraw ? 'Delete Backspace Escape' : undefined}
      data-signature="pad"
      data-min-height={minHeightPx}
      data-signed={hasInk ? 'true' : 'false'}
      data-keyboard-ring={kbFocus ? 'true' : undefined}
      {...(!hasLabel ? { 'aria-label': hasInk ? t('Signature, signed') : t('Signature, empty') } : null)}>
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
        <Text color={formCommonColors.muted} fontStyle="italic" {...knobProps.body} {...knobProps.controlType}>
          {t('X')}
        </Text>
        <YStack flex={1} height={1} backgroundColor={formCommonColors.divider} />
      </XStack>
      <Svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width || 100} ${dimensions.height || 100}`}
        {...(svgProps as any)}>
        {paths.map((d, i) => (
          <Path key={i} d={d} fill={penColor} stroke={penColor} strokeWidth={1} />
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
          <Button size="$2" onPress={handleClear} icon={clearIcon}>
            <Button.Text {...knobProps.body}>{t('Clear')}</Button.Text>
          </Button>
        </XStack>
      )}
    </SignaturePadFrame>
  );
}

export interface SignatureProps {
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
  /** Base64 data URL of the signature (JSON strokes or image) */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (...args: any[]) => void;
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

export function Signature({
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
}: SignatureProps) {
  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, disabledState, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const tamaguiTheme = useTamaguiTheme();
  const resolvedSizeToken = (size ?? knobProps.sizeToken) as SizeTokens;
  const minHeightPx = getFieldHeight(resolvedSizeToken, signatureHeightRows, hydrationTouch);
  const padHeight = height ?? minHeightPx;
  const padWidth = width ?? Math.round(padHeight * signatureAspect);

  // Render skeleton placeholder
  if (skeleton) {
    const cappedRadius = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius);
    return (
      <FieldLayout id={id} label={label} size={size} knobProps={knobProps}>
        <Skeleton variant="rounded" width="100%" height={minHeightPx} borderRadius={cappedRadius} />
      </FieldLayout>
    );
  }

  const penColor = penColorProp ?? (tamaguiTheme.color12?.val as string | undefined) ?? 'currentColor';

  const canvasProps = {
    id,
    hasLabel: !!label,
    disabled: !!disabled,
    readOnly: !!readOnly,
    width: padWidth,
    height: padHeight,
    penColor,
    backgroundColor: backgroundColorProp,
    knobProps,
    disabledSurface: disabledState.surfaceKnobProps as Record<string, unknown> | undefined,
    size,
    clearIcon,
  };

  if (!resolvedForm || !name) {
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
          value={value ?? defaultValue! ?? ''}
          onValueChange={(v) => onChange?.(v)}
          error={error}
          required={required}
          hasError={!!error}
        />
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
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
                field.handleChange(v as any);
                onChange?.(v);
              }}
              error={resolvedError}
              required={required}
              hasError={!!resolvedError}
            />
          </FieldLayout>
        );
      }}
    </Field>
  );
}

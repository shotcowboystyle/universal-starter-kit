import {
  ensureFocusVisibleRing,
  keyboardFocusRingProps,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { Check, Palette, X } from '@tamagui/lucide-icons-2';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { View, XStack, isWeb } from 'tamagui';

import { FloatingPanel } from '../../FloatingPanel';
import { Input as InputParts } from '../../InputParts';
import { formControlColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/tableCellContext';

import { AlphaBackground, HueBackground, SaturationBackground } from './gradients';

// ---------------------------------------------------------------------------
// Color conversion utilities
// ---------------------------------------------------------------------------

export function hsvToRgb(h: number, s: number, v: number) {
  const h6 = (h / 360) * 6;
  const s1 = s / 100;
  const v1 = v / 100;

  const i = Math.floor(h6);
  const f = h6 - i;
  const p = v1 * (1 - s1);
  const q = v1 * (1 - f * s1);
  const t = v1 * (1 - (1 - f) * s1);

  let r: number;
  let g: number;
  let b: number;

  switch (i % 6) {
    case 0:
      r = v1;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v1;
      b = p;
      break;
    case 2:
      r = p;
      g = v1;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v1;
      break;
    case 4:
      r = t;
      g = p;
      b = v1;
      break;
    default:
      r = v1;
      g = p;
      b = q;
      break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (x: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

/** Parse #RGB, #RRGGBB, or #RRGGBBAA. Alpha is 0–100. */
export function parseHex(hex: string): { r: number; g: number; b: number; alpha: number } | null {
  const raw = hex.startsWith('#') ? hex : `#${hex}`;
  const short = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(raw);
  if (short) {
    return {
      r: Number.parseInt(short[1] + short[1], 16),
      g: Number.parseInt(short[2] + short[2], 16),
      b: Number.parseInt(short[3] + short[3], 16),
      alpha: 100,
    };
  }
  const six = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(raw);
  if (six) {
    return {
      r: Number.parseInt(six[1], 16),
      g: Number.parseInt(six[2], 16),
      b: Number.parseInt(six[3], 16),
      alpha: 100,
    };
  }
  const eight = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(raw);
  if (eight) {
    return {
      r: Number.parseInt(eight[1], 16),
      g: Number.parseInt(eight[2], 16),
      b: Number.parseInt(eight[3], 16),
      alpha: Math.round((Number.parseInt(eight[4], 16) / 255) * 100),
    };
  }
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const parsed = parseHex(hex);
  if (!parsed) {
    return null;
  }
  return { r: parsed.r, g: parsed.g, b: parsed.b };
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;

  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  if (d !== 0) {
    switch (max) {
      case r1:
        h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) / 6;
        break;
      case g1:
        h = ((b1 - r1) / d + 2) / 6;
        break;
      case b1:
        h = ((r1 - g1) / d + 4) / 6;
        break;
    }
    h *= 360;
  }

  return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return { h: 0, s: 100, v: 100 };
  }
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

export function isValidHex(hex: string): boolean {
  return /^#([a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/i.test(hex);
}

/** RGB hex (#RRGGBB). 8-digit input drops the alpha byte (use parseHex for alpha). */
export function normalizeHex(hex: string): string {
  const parsed = parseHex(hex);
  if (!parsed) {
    const normalized = hex.startsWith('#') ? hex : `#${hex}`;
    return normalized.toUpperCase();
  }
  return rgbToHex(parsed.r, parsed.g, parsed.b);
}

export function hexAlphaByte(alpha: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(alpha)));
  return Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

export function hexChannelAlpha(hex: string): number {
  return parseHex(hex)?.alpha ?? 100;
}

// ---------------------------------------------------------------------------
// Styled sub-components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pointer geometry — web getBoundingClientRect / native measureInWindow
// ---------------------------------------------------------------------------

interface Measurable {
  getBoundingClientRect?: () => DOMRect;
  measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
}

function readPointerGeometry(
  node: Measurable | null,
  clientX: number,
  clientY: number,
  apply: (x: number, y: number, width: number, height: number) => void,
) {
  if (!node) {
    return;
  }
  if (typeof node.getBoundingClientRect === 'function') {
    const rect = node.getBoundingClientRect();
    apply(clientX - rect.left, clientY - rect.top, rect.width, rect.height);
    return;
  }
  node.measureInWindow?.((left, top, width, height) => {
    apply(clientX - left, clientY - top, width, height);
  });
}

// ---------------------------------------------------------------------------
// useDrag — shared pointer-drag state for sliders and panels
// ---------------------------------------------------------------------------

function useDrag(onUpdate: (clientX: number, clientY: number) => void) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging || !isWeb) {
      return;
    }
    const handleMove = (e: PointerEvent) => {
      e.preventDefault();
      onUpdate(e.clientX, e.clientY);
    };
    const handleUp = () => {
      setIsDragging(false);
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [isDragging, onUpdate]);

  const onPointerDown = useCallback(
    (e: { clientX: number; clientY: number }) => {
      setIsDragging(true);
      onUpdate(e.clientX, e.clientY);
    },
    [onUpdate],
  );

  // Native: track move/up on the target (no document listeners).
  const onPointerMove = useCallback(
    (e: { clientX: number; clientY: number }) => {
      if (!isDragging || isWeb) {
        return;
      }
      onUpdate(e.clientX, e.clientY);
    },
    [isDragging, onUpdate],
  );

  const onPointerUp = useCallback(() => {
    if (isWeb) {
      return;
    }
    setIsDragging(false);
  }, []);

  return {
    onPointerDown,
    ...(isWeb ? {} : { onPointerMove, onPointerUp }),
  };
}

export type ColorRailOrientation = 'horizontal' | 'vertical';

const HANDLE_SIZE = 16;
const RAIL_THICKNESS = 16;

export function binaryRadius(pointy: boolean | undefined, size: number): number {
  return pointy ? 0 : size / 2;
}

/**
 * Spectrum ColorHandle: current-color fill, white inner ring + dark outer ring
 * so the cursor stays visible on any hue. Functional contrast (same class as
 * HSV gradients) — not elevation. R-BINARY: square at radius none.
 */
function ColorHandle({
  color,
  size,
  x,
  y,
  pointy,
}: {
  color: string;
  size: number;
  x: number;
  y: number;
  pointy: boolean;
}) {
  const outer = binaryRadius(pointy, size);
  const inner = binaryRadius(pointy, Math.max(0, size - 2));
  return (
    <View
      testID="color-handle"
      position="absolute"
      left={x}
      top={y}
      width={size}
      height={size}
      borderRadius={outer}
      backgroundColor="rgba(0,0,0,0.55)"
      padding={1}
      pointerEvents="none"
      zIndex={2}>
      <View flex={1} borderRadius={inner} borderWidth={2} borderColor="#FFFFFF" backgroundColor={color} />
    </View>
  );
}

const sliderFocusReset = {
  outlineWidth: 0,
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: ensureFocusVisibleRing(),
} as const;

function ColorRail({
  orientation = 'vertical',
  length,
  ratio,
  onRatioChange,
  wrap,
  ariaLabel,
  ariaValuenow,
  ariaValuemax,
  handleColor,
  testID,
  children,
}: {
  orientation?: ColorRailOrientation;
  length: number;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  wrap?: boolean;
  ariaLabel: string;
  ariaValuenow: number;
  ariaValuemax: number;
  handleColor: string;
  testID: string;
  children: ReactNode;
}) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const railRef = useRef<Measurable | null>(null);
  const vertical = orientation === 'vertical';
  const handleSize = HANDLE_SIZE;
  const thickness = RAIL_THICKNESS;
  const width = vertical ? thickness : length;
  const height = vertical ? length : thickness;

  const updateRatio = useCallback(
    (clientX: number, clientY: number) => {
      readPointerGeometry(railRef.current, clientX, clientY, (x, y, w, h) => {
        const span = vertical ? h : w;
        const pos = vertical ? y : x;
        if (span <= 0) {
          return;
        }
        const clamped = Math.max(0, Math.min(pos, span));
        const next = clamped / span;
        onRatioChange(wrap ? next % 1 : next);
      });
    },
    [onRatioChange, vertical, wrap],
  );

  const dragProps = useDrag(updateRatio);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const step = (e.shiftKey ? 10 : 1) / ariaValuemax;
      let next = ratio;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = ratio + step;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = ratio - step;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = wrap ? 0 : 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      if (wrap) {
        next = ((next % 1) + 1) % 1;
      } else {
        next = Math.max(0, Math.min(1, next));
      }
      onRatioChange(next);
    },
    [ariaValuemax, onRatioChange, ratio, wrap],
  );

  const along = ratio * length - handleSize / 2;
  const across = (thickness - handleSize) / 2;

  return (
    <View
      ref={railRef as never}
      testID={testID}
      width={width}
      height={height}
      position="relative"
      cursor="pointer"
      userSelect="none"
      tabIndex={0}
      role="slider"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={ariaValuemax}
      aria-valuenow={ariaValuenow}
      {...sliderFocusReset}
      {...knobProps.borderRadius}
      {...dragProps}
      {...(isWeb && { onKeyDown: handleKeyDown })}
      style={isWeb ? { touchAction: 'none' } : undefined}>
      <View
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        overflow="hidden"
        pointerEvents="none"
        borderRadius={knobProps.borderRadius.borderRadius}>
        {children}
      </View>
      <ColorHandle
        color={handleColor}
        size={handleSize}
        x={vertical ? across : along}
        y={vertical ? along : across}
        pointy={knobProps.pointy}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// SaturationPanel — Spectrum ColorArea (sat × value)
// ---------------------------------------------------------------------------

interface SaturationPanelProps {
  hue: number;
  saturation: number;
  value: number;
  onChangeSV: (s: number, v: number) => void;
  size?: number;
}

export function SaturationPanel({ hue, saturation, value, onChangeSV, size = 192 }: SaturationPanelProps) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const panelRef = useRef<Measurable | null>(null);
  const handleSize = HANDLE_SIZE;
  const pointy = knobProps.pointy;

  const updateColor = useCallback(
    (clientX: number, clientY: number) => {
      readPointerGeometry(panelRef.current, clientX, clientY, (x, y, width, height) => {
        if (width <= 0 || height <= 0) {
          return;
        }
        const clampedX = Math.max(0, Math.min(x, width));
        const clampedY = Math.max(0, Math.min(y, height));
        onChangeSV(Math.round((clampedX / width) * 100), Math.round(100 - (clampedY / height) * 100));
      });
    },
    [onChangeSV],
  );

  const dragProps = useDrag(updateColor);
  const hueColor = hsvToHex(hue, 100, 100);
  const current = hsvToHex(hue, saturation, value);
  const thumbLeft = (saturation / 100) * size - handleSize / 2;
  const thumbTop = ((100 - value) / 100) * size - handleSize / 2;

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1;
      let s = saturation;
      let v = value;
      switch (e.key) {
        case 'ArrowRight':
          s = Math.min(100, s + step);
          break;
        case 'ArrowLeft':
          s = Math.max(0, s - step);
          break;
        case 'ArrowUp':
          v = Math.min(100, v + step);
          break;
        case 'ArrowDown':
          v = Math.max(0, v - step);
          break;
        case 'Home':
          s = 0;
          break;
        case 'End':
          s = 100;
          break;
        default:
          return;
      }
      e.preventDefault();
      onChangeSV(s, v);
    },
    [onChangeSV, saturation, value],
  );

  return (
    <View
      ref={panelRef as never}
      testID="color-picker-area"
      width={size}
      height={size}
      position="relative"
      cursor="crosshair"
      userSelect="none"
      tabIndex={0}
      role="slider"
      aria-label={t('Saturation and brightness')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={t('Saturation {{saturation}}%, brightness {{brightness}}%', {
        saturation,
        brightness: value,
      })}
      {...sliderFocusReset}
      {...knobProps.borderRadius}
      {...dragProps}
      {...(isWeb && { onKeyDown: handleKeyDown })}
      style={isWeb ? { touchAction: 'none' } : undefined}>
      <View
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        overflow="hidden"
        pointerEvents="none"
        borderRadius={knobProps.borderRadius.borderRadius}>
        <SaturationBackground hueColor={hueColor} width={size} height={size} />
      </View>
      <ColorHandle color={current} size={handleSize} x={thumbLeft} y={thumbTop} pointy={pointy} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// HueStrip — Spectrum ColorSlider (hue). Polaris uses vertical beside the area.
// ---------------------------------------------------------------------------

interface HueStripProps {
  hue: number;
  onChangeHue: (h: number) => void;
  width?: number;
  height?: number;
  orientation?: ColorRailOrientation;
}

export function HueStrip({ hue, onChangeHue, width = 192, height, orientation = 'horizontal' }: HueStripProps) {
  const vertical = orientation === 'vertical';
  const length = vertical ? (height ?? width) : width;
  const wrapped = ((hue % 360) + 360) % 360;
  return (
    <ColorRail
      orientation={orientation}
      length={length}
      ratio={wrapped / 360}
      wrap
      onRatioChange={(r) => {
        onChangeHue(Math.round(r * 360) % 360);
      }}
      ariaLabel={t('Hue')}
      ariaValuenow={wrapped}
      ariaValuemax={360}
      handleColor={hsvToHex(wrapped, 100, 100)}
      testID="color-picker-hue">
      <HueBackground
        orientation={orientation}
        width={vertical ? RAIL_THICKNESS : length}
        height={vertical ? length : RAIL_THICKNESS}
      />
    </ColorRail>
  );
}

// ---------------------------------------------------------------------------
// AlphaStrip — Spectrum ColorSlider (alpha)
// ---------------------------------------------------------------------------

interface AlphaStripProps {
  hue: number;
  saturation: number;
  value: number;
  alpha: number;
  onChangeAlpha: (a: number) => void;
  width?: number;
  height?: number;
  orientation?: ColorRailOrientation;
}

export function AlphaStrip({
  hue,
  saturation,
  value,
  alpha,
  onChangeAlpha,
  width = 192,
  height,
  orientation = 'horizontal',
}: AlphaStripProps) {
  const vertical = orientation === 'vertical';
  const length = vertical ? (height ?? width) : width;
  const hex = useMemo(() => hsvToHex(hue, saturation, value), [hue, saturation, value]);
  return (
    <ColorRail
      orientation={orientation}
      length={length}
      ratio={alpha / 100}
      onRatioChange={(r) => {
        onChangeAlpha(Math.round(r * 100));
      }}
      ariaLabel={t('Opacity')}
      ariaValuenow={alpha}
      ariaValuemax={100}
      handleColor={hex}
      testID="color-picker-alpha">
      <AlphaBackground
        hex={hex}
        orientation={orientation}
        width={vertical ? RAIL_THICKNESS : length}
        height={vertical ? length : RAIL_THICKNESS}
      />
    </ColorRail>
  );
}

// ---------------------------------------------------------------------------
// PresetSwatches — grid of clickable preset colors
// ---------------------------------------------------------------------------

export interface PresetSwatchEntry {
  /** Accessible name for the swatch */
  name?: string;
  /** Hex color value, or null for a "no color" swatch */
  value: string | null;
}

export interface PresetSwatchesProps {
  presetColors: (string | PresetSwatchEntry)[];
  selectedColor: string | null;
  onSelect: (color: string | null) => void;
  width?: number;
}

export const SWATCH_PX: Record<string, number> = {
  small: 20,
  medium: 24,
  large: 28,
};

export const CHIP_PX: Record<string, number> = {
  small: 14,
  medium: 18,
  large: 22,
};

function SwatchItem({
  entry,
  isSelected,
  size,
  pointy,
  tabIndex,
  onSelect,
  onFocusIndex,
}: {
  entry: PresetSwatchEntry;
  isSelected: boolean;
  size: number;
  pointy: boolean;
  tabIndex: number;
  onSelect: (color: string | null) => void;
  onFocusIndex: () => void;
}) {
  const [kbFocus, setKbFocus] = useState(false);
  const mark = useReadableTextOn(entry.value ?? formControlColors.background);
  const radius = binaryRadius(pointy, size);
  return (
    <View
      role="radio"
      aria-checked={isSelected}
      aria-label={entry.name ?? (entry.value ? t('Color {{value}}', { value: entry.value }) : t('Remove color'))}
      tabIndex={tabIndex}
      width={size}
      height={size}
      padding={0}
      alignItems="center"
      justifyContent="center"
      backgroundColor={entry.value ?? formControlColors.background}
      borderWidth={1}
      borderColor={formControlColors.boundary}
      borderRadius={radius}
      cursor="pointer"
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={{ outlineWidth: 0 }}
      {...(kbFocus ? keyboardFocusRingProps : undefined)}
      onFocus={() => {
        onFocusIndex();
        if (wasKeyboardFocus()) {
          setKbFocus(true);
        }
      }}
      onBlur={() => {
        setKbFocus(false);
      }}
      onPress={() => {
        onSelect(entry.value);
      }}
      {...(isWeb
        ? {
            onKeyDown: (e: ReactKeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(entry.value);
              }
            },
          }
        : undefined)}>
      {entry.value === null && (
        <View
          position="absolute"
          width={size - 6}
          height={2}
          backgroundColor="$red10"
          transform={[{ rotate: '45deg' }]}
        />
      )}
      {isSelected ? <Check size={Math.round(size * 0.55)} color={mark ?? '#FFFFFF'} /> : null}
    </View>
  );
}

export function PresetSwatches({ presetColors, selectedColor, onSelect, width }: PresetSwatchesProps) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const [focusIndex, setFocusIndex] = useState(0);
  const entries = useMemo(() => {
    if (!Array.isArray(presetColors)) {
      return [];
    }
    return presetColors.map((preset) => (typeof preset === 'string' ? { value: preset } : preset));
  }, [presetColors]);

  if (entries.length === 0) {
    return null;
  }

  const swatchSize = SWATCH_PX[knobProps.size] ?? 24;
  const gapPx = knobProps.control.gap;
  const cols = Math.max(1, width ? Math.floor((width + gapPx) / (swatchSize + gapPx)) : 8);

  const moveFocus = (next: number) => {
    const clamped = Math.max(0, Math.min(entries.length - 1, next));
    setFocusIndex(clamped);
    onSelect(entries[clamped].value);
  };

  return (
    <XStack
      role="radiogroup"
      aria-label={t('Color presets')}
      flexWrap="wrap"
      {...knobProps.gap}
      width={width}
      justifyContent="flex-start"
      {...(isWeb
        ? {
            onKeyDown: (e: ReactKeyboardEvent) => {
              switch (e.key) {
                case 'ArrowRight':
                  e.preventDefault();
                  moveFocus(focusIndex + 1);
                  break;
                case 'ArrowLeft':
                  e.preventDefault();
                  moveFocus(focusIndex - 1);
                  break;
                case 'ArrowDown':
                  e.preventDefault();
                  moveFocus(focusIndex + cols);
                  break;
                case 'ArrowUp':
                  e.preventDefault();
                  moveFocus(focusIndex - cols);
                  break;
                case 'Home':
                  e.preventDefault();
                  moveFocus(0);
                  break;
                case 'End':
                  e.preventDefault();
                  moveFocus(entries.length - 1);
                  break;
                default:
                  break;
              }
            },
          }
        : undefined)}>
      {entries.map((entry, index) => {
        const isSelected =
          entry.value === null
            ? selectedColor === null
            : (selectedColor ?? '').toUpperCase() === entry.value.toUpperCase();
        return (
          <SwatchItem
            key={entry.name ?? entry.value ?? 'none'}
            entry={entry}
            isSelected={isSelected}
            size={swatchSize}
            pointy={knobProps.pointy}
            tabIndex={index === focusIndex ? 0 : -1}
            onSelect={onSelect}
            onFocusIndex={() => {
              setFocusIndex(index);
            }}
          />
        );
      })}
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// ColorPickerInputTrigger — compound input with swatch + clear icon
// ---------------------------------------------------------------------------

interface ColorPickerInputTriggerProps {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onReset: () => void;
  onButtonPress: () => void;
  error?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  inputProps?: Omit<ComponentProps<typeof InputParts.Area>, 'value' | 'onChangeText' | 'ref' | 'readOnly'>;
}

export const ColorPickerInputTrigger = InputParts.Area.styleable<ColorPickerInputTriggerProps>((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  const inTableCell = useIsInTableCell();
  const {
    value,
    onButtonPress,
    onReset,
    disabled,
    placeholder,
    error,
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired,
    'aria-invalid': ariaInvalid,
  } = props;
  const chip = CHIP_PX[knobProps.size] ?? 18;
  const chipRadius = binaryRadius(knobProps.pointy, chip);
  return (
    <View ref={ref}>
      <InputParts
        cursor="pointer"
        // Native: FloatingPanel owns open — a second onPress double-toggles closed.
        onPress={isWeb && !disabled ? onButtonPress : undefined}
        size={knobProps.sizeToken}>
        <InputParts.Box
          theme={error ? 'error' : undefined}
          {...(disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined)}>
          <InputParts.Icon adornment="leading">
            <View
              testID="color-picker-trigger-swatch"
              width={chip}
              height={chip}
              borderRadius={chipRadius}
              borderWidth={1}
              borderColor={formControlColors.boundary}
              backgroundColor={value || formControlColors.background}
              aria-label={t('Color swatch')}
            />
          </InputParts.Icon>
          {!inTableCell && (
            <InputParts.Area
              readOnly
              id={id}
              value={value}
              placeholder={placeholder}
              pointerEvents="none"
              disabled={disabled}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              aria-describedby={ariaDescribedBy}
              aria-required={ariaRequired}
              aria-invalid={ariaInvalid}
            />
          )}
          <InputParts.Button
            aria-label={value ? t('Clear color') : t('Pick color')}
            onPress={(e) => {
              if (disabled) {
                return;
              }
              if (value) {
                e.stopPropagation();
                onReset();
              } else {
                onButtonPress();
              }
            }}>
            <InputParts.Icon>{value ? <X /> : <Palette />}</InputParts.Icon>
          </InputParts.Button>
        </InputParts.Box>
      </InputParts>
    </View>
  );
});

// ---------------------------------------------------------------------------
// ColorPickerPopoverShell — FloatingPanel (sheet below OVERLAY_BREAKPOINT)
// ---------------------------------------------------------------------------

interface ColorPickerPopoverShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  popoverRef?: RefObject<any>;
  /** Native trigger announcement (name / current value / hint) — see FloatingPanel. */
  triggerA11y?: { label?: string; value?: string; hint?: string };
}

export function ColorPickerPopoverShell({
  open,
  onOpenChange,
  trigger,
  children,
  disabled,
  triggerA11y,
}: ColorPickerPopoverShellProps) {
  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      disabled={disabled}
      sizing="fill"
      widthMode="at-least-trigger"
      contentPadding="none"
      triggerA11y={triggerA11y}>
      {children}
    </FloatingPanel>
  );
}

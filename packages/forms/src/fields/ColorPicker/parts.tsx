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
import type { TamaguiElement } from 'tamagui';

import { FloatingPanel } from '../../FloatingPanel';
import { Input as InputParts } from '../../InputParts';
import { formControlColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/table-cell-context';

import { hsvToHex } from './color';
import { AlphaBackground, HueBackground, SaturationBackground } from './gradients';

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

const readPointerGeometry = (
  node: Measurable | null,
  clientX: number,
  clientY: number,
  apply: (x: number, y: number, width: number, height: number) => void,
) => {
  if (!node) {
    return;
  }
  const rect = node.getBoundingClientRect?.();
  if (rect) {
    apply(clientX - rect.left, clientY - rect.top, rect.width, rect.height);
    return;
  }
  node.measureInWindow?.((left, top, width, height) => {
    apply(clientX - left, clientY - top, width, height);
  });
};

// ---------------------------------------------------------------------------
// useDrag — shared pointer-drag state for sliders and panels
// ---------------------------------------------------------------------------

const useDrag = (onUpdate: (clientX: number, clientY: number) => void) => {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging || !isWeb) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
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

  if (isWeb) {
    return { onPointerDown };
  }
  return { onPointerDown, onPointerMove, onPointerUp };
};

export type ColorRailOrientation = 'horizontal' | 'vertical';

const HANDLE_SIZE = 16;
const RAIL_THICKNESS = 16;

// oxlint-disable-next-line react-doctor/only-export-components -- radius helper shared with the ColorPicker field, which renders matching swatch chips
export const binaryRadius = (pointy: boolean, size: number): number => (pointy ? 0 : size / 2);

/**
 * Spectrum ColorHandle: current-color fill, white inner ring + dark outer ring
 * so the cursor stays visible on any hue. Functional contrast (same class as
 * HSV gradients) — not elevation. R-BINARY: square at radius none.
 */
const ColorHandle = ({
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
}) => {
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
      <View
        flex={1}
        borderRadius={inner}
        borderWidth={2}
        borderColor="#FFFFFF"
        backgroundColor={color}
      />
    </View>
  );
};

const sliderFocusReset = {
  outlineWidth: 0,
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: ensureFocusVisibleRing(),
} as const;

const ColorRail = ({
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
}) => {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const railRef = useRef<TamaguiElement>(null);
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
      let next: number;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          next = ratio + step;
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          next = ratio - step;
          break;
        }
        case 'Home': {
          next = 0;
          break;
        }
        case 'End': {
          next = wrap ? 0 : 1;
          break;
        }
        default: {
          return;
        }
      }
      e.preventDefault();
      onRatioChange(wrap ? ((next % 1) + 1) % 1 : Math.max(0, Math.min(1, next)));
    },
    [ariaValuemax, onRatioChange, ratio, wrap],
  );

  const along = ratio * length - handleSize / 2;
  const across = (thickness - handleSize) / 2;

  return (
    <View
      ref={railRef}
      testID={testID}
      width={width}
      height={height}
      position="relative"
      cursor="pointer"
      userSelect="none"
      tabIndex={0}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the rail is a tamagui View painting a gradient track and handle; a native range input cannot render it
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
};

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

export const SaturationPanel = ({ hue, saturation, value, onChangeSV, size = 192 }: SaturationPanelProps) => {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const panelRef = useRef<TamaguiElement>(null);
  const handleSize = HANDLE_SIZE;
  const { pointy } = knobProps;

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
        case 'ArrowRight': {
          s = Math.min(100, s + step);
          break;
        }
        case 'ArrowLeft': {
          s = Math.max(0, s - step);
          break;
        }
        case 'ArrowUp': {
          v = Math.min(100, v + step);
          break;
        }
        case 'ArrowDown': {
          v = Math.max(0, v - step);
          break;
        }
        case 'Home': {
          s = 0;
          break;
        }
        case 'End': {
          s = 100;
          break;
        }
        default: {
          return;
        }
      }
      e.preventDefault();
      onChangeSV(s, v);
    },
    [onChangeSV, saturation, value],
  );

  return (
    <View
      ref={panelRef}
      testID="color-picker-area"
      width={size}
      height={size}
      position="relative"
      cursor="crosshair"
      userSelect="none"
      tabIndex={0}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a 2D saturation/brightness area has no native input equivalent; role carries the slider semantics
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
        <SaturationBackground
          hueColor={hueColor}
          width={size}
          height={size}
        />
      </View>
      <ColorHandle
        color={current}
        size={handleSize}
        x={thumbLeft}
        y={thumbTop}
        pointy={pointy}
      />
    </View>
  );
};

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

export const HueStrip = ({ hue, onChangeHue, width = 192, height, orientation = 'horizontal' }: HueStripProps) => {
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
};

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

export const AlphaStrip = ({
  hue,
  saturation,
  value,
  alpha,
  onChangeAlpha,
  width = 192,
  height,
  orientation = 'horizontal',
}: AlphaStripProps) => {
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
};

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

// oxlint-disable-next-line react-doctor/only-export-components -- swatch geometry shared with the ColorPicker field preview
export const SWATCH_PX = new Map([
  ['small', 20],
  ['medium', 24],
  ['large', 28],
]);

// oxlint-disable-next-line react-doctor/only-export-components -- chip geometry shared with the ColorPicker field's read-only chip and eyedropper icon
export const CHIP_PX = new Map([
  ['small', 14],
  ['medium', 18],
  ['large', 22],
]);

const SwatchItem = ({
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
}) => {
  const [kbFocus, setKbFocus] = useState(false);
  const mark = useReadableTextOn(entry.value ?? formControlColors.background);
  const radius = binaryRadius(pointy, size);
  return (
    <View
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the swatch is a tamagui View filled with its color; a native radio input cannot render the chip
      role="radio"
      aria-checked={isSelected}
      aria-label={
        entry.name ??
        (entry.value === null || entry.value === '' ? t('Remove color') : t('Color {{value}}', { value: entry.value }))
      }
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
      {isSelected ? (
        <Check
          size={Math.round(size * 0.55)}
          color={mark ?? '#FFFFFF'}
        />
      ) : null}
    </View>
  );
};

export const PresetSwatches = ({ presetColors, selectedColor, onSelect, width }: PresetSwatchesProps) => {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const [focusIndex, setFocusIndex] = useState(0);
  const entries = useMemo(() => {
    if (!Array.isArray(presetColors)) {
      return [];
    }
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- presets mix bare hex strings and { name, value } entries with no discriminant
    return presetColors.map((preset) => (typeof preset === 'string' ? { value: preset } : preset));
  }, [presetColors]);

  if (entries.length === 0) {
    return null;
  }

  const swatchSize = SWATCH_PX.get(knobProps.size) ?? 24;
  const gapPx = knobProps.control.gap;
  const cols = Math.max(1, width === undefined || width === 0 ? 8 : Math.floor((width + gapPx) / (swatchSize + gapPx)));

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
                case 'ArrowRight': {
                  e.preventDefault();
                  moveFocus(focusIndex + 1);
                  break;
                }
                case 'ArrowLeft': {
                  e.preventDefault();
                  moveFocus(focusIndex - 1);
                  break;
                }
                case 'ArrowDown': {
                  e.preventDefault();
                  moveFocus(focusIndex + cols);
                  break;
                }
                case 'ArrowUp': {
                  e.preventDefault();
                  moveFocus(focusIndex - cols);
                  break;
                }
                case 'Home': {
                  e.preventDefault();
                  moveFocus(0);
                  break;
                }
                case 'End': {
                  e.preventDefault();
                  moveFocus(entries.length - 1);
                  break;
                }
                default: {
                  break;
                }
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
};

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

// oxlint-disable-next-line react-doctor/only-export-components -- styleable() returns a forwardRef component the rule cannot see through
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
  const chip = CHIP_PX.get(knobProps.size) ?? 18;
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
  popoverRef?: RefObject<unknown>;
  /** Native trigger announcement (name / current value / hint) — see FloatingPanel. */
  triggerA11y?: { label?: string; value?: string; hint?: string };
}

export const ColorPickerPopoverShell = ({
  open,
  onOpenChange,
  trigger,
  children,
  disabled,
  triggerA11y,
}: ColorPickerPopoverShellProps) => (
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

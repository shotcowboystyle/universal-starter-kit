import { useResolvedKnobs, useChartPalette, normalizeToHex } from '@repo/theme';
import { Pipette } from '@tamagui/lucide-icons-2';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Popover, View, XStack, YStack, isWeb, useProps, useTheme } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

import {
  AlphaStrip,
  CHIP_PX,
  ColorPickerInputTrigger,
  ColorPickerPopoverShell,
  HueStrip,
  PresetSwatches,
  SWATCH_PX,
  SaturationPanel,
  binaryRadius,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  hexAlphaByte,
  normalizeHex,
  parseHex,
  rgbToHex,
} from './parts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InputProps = ComponentProps<typeof InputParts.Area>;

export type ColorPickerProps<
  TParentData = unknown,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  // "onChange": FormFieldProps carries the DOM ChangeEventHandler from
  // YStackProps; this field exposes a canonical value callback instead.
  'children' | 'field' | 'onChange'
> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    format?: 'hex' | 'rgb' | 'hsl';
    showAlpha?: boolean;
    presetColors?: string[];
    placeholder?: string;
    inputProps?: Omit<InputProps, 'value' | 'onChangeText' | 'ref'>;
    /** Controlled value (for standalone usage without form) */
    value?: string;
    /**
     * Canonical change handler, consistent with the rest of the field family.
     * Fires in both standalone and form mode. Prefer this over `onValueChange`.
     */
    onChange?: (value: string) => void;
    /** @deprecated Use `onChange` instead. */
    onValueChange?: (value: string) => void;
    /** When true, renders a skeleton placeholder instead of the color picker */
    skeleton?: boolean;
    /** When true, applies compact density (tighter layout gaps; control size unchanged) */
    compact?: boolean;
  };

// ---------------------------------------------------------------------------
// Default preset colors
// ---------------------------------------------------------------------------

function useThemePresetColors(): string[] {
  const palette = useChartPalette();
  const theme = useTheme();
  return useMemo(() => {
    const ink = theme.color12?.val;
    const mid = theme.color8?.val;
    const paper = theme.color1?.val;
    const raw = [
      ...palette.categorical.slice(0, 8),
      palette.semantic.error,
      palette.semantic.success,
      palette.semantic.warning,
      typeof ink === 'string' ? ink : undefined,
      typeof mid === 'string' ? mid : undefined,
      typeof paper === 'string' ? paper : undefined,
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const color of raw) {
      if (typeof color !== 'string') {
        continue;
      }
      const hex = normalizeToHex(color);
      if (!hex) {
        continue;
      }
      const key = hex.toUpperCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(key);
    }
    return out;
  }, [palette, theme.color12, theme.color8, theme.color1]);
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): {
  h: number;
  s: number;
  l: number;
} {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const d = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r1:
        h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) * 60;
        break;
      case g1:
        h = ((b1 - r1) / d + 2) * 60;
        break;
      default:
        h = ((r1 - g1) / d + 4) * 60;
        break;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const h1 = ((h % 360) + 360) % 360;
  const s1 = clamp(s, 0, 100) / 100;
  const l1 = clamp(l, 0, 100) / 100;

  if (s1 === 0) {
    const gray = Math.round(l1 * 255);
    return { r: gray, g: gray, b: gray };
  }

  const c = (1 - Math.abs(2 * l1 - 1)) * s1;
  const x = c * (1 - Math.abs(((h1 / 60) % 2) - 1));
  const m = l1 - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h1 < 60) {
    rp = c;
    gp = x;
  } else if (h1 < 120) {
    rp = x;
    gp = c;
  } else if (h1 < 180) {
    gp = c;
    bp = x;
  } else if (h1 < 240) {
    gp = x;
    bp = c;
  } else if (h1 < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

interface ParsedColor {
  hex: string;
  alpha: number;
  isValid: boolean;
}

function parseColorValue(value: string | undefined, format: 'hex' | 'rgb' | 'hsl'): ParsedColor {
  if (!value) {
    return { hex: '', alpha: 100, isValid: true };
  }
  const raw = value.trim();
  if (!raw) {
    return { hex: '', alpha: 100, isValid: true };
  }

  if (format === 'hex') {
    const parsed = parseHex(raw);
    if (!parsed) {
      return { hex: '', alpha: 100, isValid: false };
    }
    return { hex: rgbToHex(parsed.r, parsed.g, parsed.b), alpha: parsed.alpha, isValid: true };
  }

  if (format === 'rgb') {
    const rgba = /^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i.exec(raw);
    if (!rgba) {
      return { hex: '', alpha: 100, isValid: false };
    }
    const r = clamp(Number.parseInt(rgba[1], 10), 0, 255);
    const g = clamp(Number.parseInt(rgba[2], 10), 0, 255);
    const b = clamp(Number.parseInt(rgba[3], 10), 0, 255);
    const alpha = rgba[4] == null ? 100 : clamp(Math.round(Number.parseFloat(rgba[4]) * 100), 0, 100);
    return { hex: rgbToHex(r, g, b), alpha, isValid: true };
  }

  const hsla =
    /^hsla?\(\s*(-?[0-9]*\.?[0-9]+)\s*,\s*([0-9]*\.?[0-9]+)%\s*,\s*([0-9]*\.?[0-9]+)%(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i.exec(
      raw,
    );
  if (!hsla) {
    return { hex: '', alpha: 100, isValid: false };
  }
  const h = Number.parseFloat(hsla[1]);
  const s = clamp(Number.parseFloat(hsla[2]), 0, 100);
  const l = clamp(Number.parseFloat(hsla[3]), 0, 100);
  const alpha = hsla[4] == null ? 100 : clamp(Math.round(Number.parseFloat(hsla[4]) * 100), 0, 100);
  const { r, g, b } = hslToRgb(h, s, l);
  return { hex: rgbToHex(r, g, b), alpha, isValid: true };
}

function formatAlpha(alpha: number): string {
  return (alpha / 100).toFixed(2).replace(/\.?0+$/, '');
}

function serializeColorValue(hex: string, format: 'hex' | 'rgb' | 'hsl', alpha: number, includeAlpha: boolean): string {
  if (!hex) {
    return '';
  }
  if (format === 'hex') {
    const rgb = normalizeHex(hex);
    if (includeAlpha) {
      return `${rgb}${hexAlphaByte(alpha)}`;
    }
    return rgb;
  }

  const rgb = hexToRgb(hex);
  if (!rgb) {
    return '';
  }

  if (format === 'rgb') {
    if (includeAlpha) {
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${formatAlpha(alpha)})`;
    }
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (includeAlpha) {
    return `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${formatAlpha(alpha)})`;
  }
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

// ---------------------------------------------------------------------------
// ColorBody — orchestrates the picker panel inside the popover
// ---------------------------------------------------------------------------

interface ColorBodyProps {
  hue: number;
  saturation: number;
  value: number;
  alpha: number;
  selectedColor: string;
  showAlpha: boolean;
  presetColors: string[];
  onChangeHue: (h: number) => void;
  onChangeSV: (s: number, v: number) => void;
  onChangeAlpha: (a: number) => void;
  onHexInput: (hex: string, alpha?: number) => void;
  onSelectPreset: (color: string) => void;
}

const panelSizeMap: Record<string, number> = {
  small: 160,
  medium: 192,
  large: 224,
};

function unrecognizedColorError(format: 'hex' | 'rgb' | 'hsl'): string {
  return t('Color must be a recognized {{format}} value', { format: format.toUpperCase() });
}

function ColorBody({
  hue,
  saturation,
  value,
  alpha,
  selectedColor,
  showAlpha,
  presetColors,
  onChangeHue,
  onChangeSV,
  onChangeAlpha,
  onHexInput,
  onSelectPreset,
}: ColorBodyProps) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const panelSize = panelSizeMap[knobProps.size] ?? 192;
  const previewSize = SWATCH_PX[knobProps.size] ?? 24;
  const [hexInputValue, setHexInputValue] = useState(selectedColor);
  const [hexEditing, setHexEditing] = useState(false);
  useEffect(() => {
    // Don't rewrite the field while the user is typing — a partial entry like
    // "#112" would commit as a 3-digit hex and clobber the rest of the input.
    if (hexEditing) {
      return;
    }
    setHexInputValue(selectedColor);
  }, [selectedColor, hexEditing]);

  const handleHexChange = useCallback(
    (text: string) => {
      setHexInputValue(text);
      const normalized = text.startsWith('#') ? text : `#${text}`;
      const parsed = parseHex(normalized);
      if (!parsed) {
        return;
      }
      const digits = normalized.startsWith('#') ? normalized.slice(1) : normalized;
      const hasAlphaByte = digits.length === 8;
      onHexInput(rgbToHex(parsed.r, parsed.g, parsed.b), hasAlphaByte ? parsed.alpha : undefined);
    },
    [onHexInput],
  );

  const handleEyeDropper = useCallback(async () => {
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      try {
        const eyeDropper = new (
          window as Window & {
            EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> };
          }
        ).EyeDropper();
        const result = await eyeDropper.open();
        onHexInput(result.sRGBHex.toUpperCase());
      } catch {
        // user cancelled
      }
    }
  }, [onHexInput]);

  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <YStack
      {...knobProps.gap}
      {...knobProps.panelPadding}
      data-testid="color-picker-panel"
      data-dismiss-class="compose">
      <XStack {...knobProps.gap} alignItems="stretch">
        <SaturationPanel hue={hue} saturation={saturation} value={value} onChangeSV={onChangeSV} size={panelSize} />
        <HueStrip hue={hue} onChangeHue={onChangeHue} height={panelSize} orientation="vertical" />
        {showAlpha && (
          <AlphaStrip
            hue={hue}
            saturation={saturation}
            value={value}
            alpha={alpha}
            onChangeAlpha={onChangeAlpha}
            height={panelSize}
            orientation="vertical"
          />
        )}
      </XStack>

      <PresetSwatches
        presetColors={presetColors}
        selectedColor={selectedColor}
        onSelect={(color) => {
          if (color !== null) {
            onSelectPreset(color);
          }
        }}
      />

      <XStack {...knobProps.gap} alignItems="center">
        <View
          width={previewSize}
          height={previewSize}
          borderRadius={binaryRadius(knobProps.pointy, previewSize)}
          borderWidth={1}
          borderColor="$color10"
          backgroundColor={selectedColor}
          flexShrink={0}
        />
        <InputParts size={knobProps.sizeToken} flex={1}>
          <InputParts.Box>
            <InputParts.Area
              value={hexInputValue}
              onChangeText={handleHexChange}
              onFocus={() => {
                setHexEditing(true);
              }}
              onBlur={() => {
                setHexEditing(false);
              }}
              placeholder="#000000"
              maxLength={showAlpha ? 9 : 7}
            />
          </InputParts.Box>
        </InputParts>
        {hasEyeDropper && (
          <Button
            size={knobProps.sizeToken}
            chromeless
            icon=<Pipette size={CHIP_PX[knobProps.size] ?? 18} />
            onPress={handleEyeDropper}
            cursor="pointer"
            aria-label={t('Eyedropper')}
            hoverStyle={{ opacity: 0.7 }}
          />
        )}
      </XStack>
    </YStack>
  );
}

interface ColorPickerControlProps {
  value: string;
  format: 'hex' | 'rgb' | 'hsl';
  showAlpha: boolean;
  presetColors: string[];
  placeholder: string;
  disabled?: boolean;
  readOnly?: boolean;
  inputProps?: Omit<InputProps, 'value' | 'onChangeText' | 'ref'>;
  hasError: boolean;
  required?: boolean;
  id?: string;
  hasLabel?: boolean;
  /** Field label as plain text, for the native trigger announcement. */
  a11yLabel?: string;
  helperText?: string;
  onValueChange: (value: string) => void;
  onBlurControl?: () => void;
}

function ColorPickerControl({
  value,
  format,
  showAlpha,
  presetColors,
  placeholder,
  disabled,
  readOnly,
  inputProps,
  hasError,
  required,
  id,
  hasLabel,
  a11yLabel,
  helperText,
  onValueChange,
  onBlurControl,
}: ColorPickerControlProps) {
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);
  const parsedInitial = parseColorValue(value, format);
  const initialColor = parsedInitial.hex;
  const [selectedColor, setSelectedColor] = useState<string>(initialColor);
  const [hsv, setHsv] = useState(() => hexToHsv(initialColor || '#000000'));
  const [alpha, setAlpha] = useState(parsedInitial.alpha);
  const popoverRef = useRef<Popover>(null);
  const triggerRef = useRef<HTMLElement>(null);

  // Return focus to the trigger when the panel closes (Escape / outside click),
  // so keyboard users are not dropped back to the top of the document.
  const restoreTriggerFocus = useCallback(() => {
    if (!isWeb || typeof document === 'undefined') {
      return;
    }
    requestAnimationFrame(() => {
      const active = document.activeElement;
      // Focus can still be parked on a control inside the closing panel while
      // it animates out — treat that the same as focus already being lost.
      const inClosingPanel =
        active instanceof HTMLElement && !!active.closest('[data-testid="floating-panel-viewport"]');
      if (active && active !== document.body && !inClosingPanel) {
        return;
      }
      triggerRef.current?.querySelector?.('input')?.focus();
    });
  }, []);

  useEffect(() => {
    const parsed = parseColorValue(value, format);
    if (parsed.hex !== selectedColor) {
      setSelectedColor(parsed.hex);
      if (parsed.hex) {
        setHsv(hexToHsv(parsed.hex));
      }
    }
    if (parsed.alpha !== alpha) {
      setAlpha(parsed.alpha);
    }
  }, [value, format]);

  const updateFromHsv = useCallback(
    (h: number, s: number, v: number) => {
      const hex = hsvToHex(h, s, v).toUpperCase();
      setHsv({ h, s, v });
      setSelectedColor(hex);
      onValueChange(serializeColorValue(hex, format, alpha, showAlpha));
    },
    [alpha, format, onValueChange, showAlpha],
  );

  const handleChangeHue = useCallback(
    (h: number) => {
      updateFromHsv(h, hsv.s, hsv.v);
    },
    [hsv.s, hsv.v, updateFromHsv],
  );

  const handleChangeSV = useCallback(
    (s: number, v: number) => {
      updateFromHsv(hsv.h, s, v);
    },
    [hsv.h, updateFromHsv],
  );

  const handleHexInput = useCallback(
    (hex: string, nextAlpha?: number) => {
      const normalized = normalizeHex(hex);
      const newHsv = hexToHsv(normalized);
      const resolvedAlpha = nextAlpha ?? alpha;
      setHsv(newHsv);
      setSelectedColor(normalized);
      if (nextAlpha !== undefined) {
        setAlpha(nextAlpha);
      }
      onValueChange(serializeColorValue(normalized, format, resolvedAlpha, showAlpha));
    },
    [alpha, format, onValueChange, showAlpha],
  );

  // Selecting a swatch is an edit, not a dismissal.
  // The panel stays open — like the sliders and hex input — and only an
  // outside click / Escape / explicit done closes it.
  const handleSelectPreset = useCallback(
    (color: string) => {
      handleHexInput(normalizeHex(color));
    },
    [handleHexInput],
  );

  const handleClear = useCallback(() => {
    setSelectedColor('');
    setHsv({ h: 0, s: 100, v: 100 });
    setAlpha(100);
    onValueChange('');
  }, [onValueChange]);

  const handleAlphaChange = useCallback(
    (nextAlpha: number) => {
      setAlpha(nextAlpha);
      if (selectedColor) {
        onValueChange(serializeColorValue(selectedColor, format, nextAlpha, showAlpha));
      }
    },
    [format, onValueChange, selectedColor, showAlpha],
  );

  const colorContent = (
    <ColorBody
      hue={hsv.h}
      saturation={hsv.s}
      value={hsv.v}
      alpha={alpha}
      selectedColor={selectedColor}
      showAlpha={showAlpha}
      presetColors={presetColors}
      onChangeHue={handleChangeHue}
      onChangeSV={handleChangeSV}
      onChangeAlpha={handleAlphaChange}
      onHexInput={handleHexInput}
      onSelectPreset={handleSelectPreset}
    />
  );

  if (readOnly) {
    const displayValue = value || selectedColor || placeholder;
    return (
      <InputParts.Box theme={hasError ? 'error' : undefined}>
        <View paddingInlineStart="$2" alignSelf="center">
          <View
            width={CHIP_PX[knobProps.size] ?? 18}
            height={CHIP_PX[knobProps.size] ?? 18}
            borderRadius={binaryRadius(knobProps.pointy, CHIP_PX[knobProps.size] ?? 18)}
            borderWidth={1}
            borderColor="$color10"
            backgroundColor={displayValue || 'transparent'}
          />
        </View>
        <InputParts.Area
          value={displayValue}
          readOnly
          placeholder={placeholder}
          aria-readonly="true"
          aria-required={required || undefined}
          aria-invalid={hasError || undefined}
        />
      </InputParts.Box>
    );
  }

  return (
    <ColorPickerPopoverShell
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled && nextOpen) {
          return;
        }
        setOpen(nextOpen);
        if (!nextOpen) {
          onBlurControl?.();
          restoreTriggerFocus();
        }
      }}
      disabled={disabled}
      popoverRef={popoverRef}
      // "Color, #EF4444": VO gets the field name + current hex on the native
      // trigger (mirrors the DatePicker/Select triggerA11y pattern).
      triggerA11y={{
        label: a11yLabel || t('Color'),
        value: value || selectedColor || placeholder,
        hint: helperText,
      }}
      trigger={
        <ColorPickerInputTrigger
          ref={triggerRef as never}
          value={value || selectedColor}
          placeholder={placeholder}
          disabled={disabled}
          onReset={handleClear}
          onButtonPress={() => {
            if (!disabled) {
              setOpen(true);
            }
          }}
          error={hasError}
          id={id}
          // Labelled: the sibling Label wires `aria-labelledby` onto this id
          // itself — naming it here too doubles the spoken name.
          aria-label={hasLabel ? undefined : t('Color')}
          aria-describedby={
            [helperText && id ? `${id}-description` : undefined, hasError && id ? `${id}-error` : undefined]
              .filter(Boolean)
              .join(' ') || undefined
          }
          aria-required={required || undefined}
          aria-invalid={hasError || undefined}
          inputProps={inputProps}
        />
      }>
      {colorContent}
    </ColorPickerPopoverShell>
  );
}

// ---------------------------------------------------------------------------
// ColorPicker — main exported component
// ---------------------------------------------------------------------------

export function ColorPicker<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: ColorPickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const {
    defaultValue,
    form,
    format: _format = 'hex',
    showAlpha = false,
    presetColors: presetColorsProp,
    placeholder = t('Select color'),
    inputProps,
    mode,
    name,
    preserveValue,
    validators,
    disabled,
    readOnly,
    label,
    labelProps,
    error: errorProp,
    helperText,
    required,
    size,
    onBlur,
    value: controlledValue,
    onChange,
    onValueChange,
    skeleton,
    compact,
    id: idProp,
  } = useProps(props);

  const themePresets = useThemePresetColors();
  const presetColors = presetColorsProp ?? themePresets;

  // Canonical `onChange` and the alias `onValueChange` both fire from a
  // single emit per change (same reconciliation as Switch).
  const emitValueChange = useCallback(
    (newValue: string) => {
      onChange?.(newValue);
      onValueChange?.(newValue);
    },
    [onChange, onValueChange],
  );

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const [standaloneValue, setStandaloneValue] = useState<string>(
    () => (controlledValue ?? (defaultValue as string)) || '',
  );

  // Sync internal state when controlled value changes
  useEffect(() => {
    if (controlledValue !== undefined) {
      setStandaloneValue(controlledValue);
    }
  }, [controlledValue]);

  // Combined handler for standalone mode
  const handleStandaloneChange = useCallback(
    (newValue: string) => {
      setStandaloneValue(newValue);
      emitValueChange(newValue);
    },
    [emitValueChange],
  );

  // Render skeleton placeholder
  if (skeleton) {
    // Mirror the live anatomy: the control is a shrink-wrapped
    // sizeToken square (not a stretch-width bar), so the label MUST be a
    // deterministic px width — never % — or it resolves against a width
    // computed without the % child and overflows. Radius matches the live
    // ColorPickerInputTrigger / swatch (`knobProps.borderRadius`).
    const cellSize = size || knobProps.sizeToken;
    return (
      <InputParts size={cellSize}>
        {label && <Skeleton variant="text" width={96} height={14} />}
        <Skeleton
          variant="rounded"
          width={cellSize}
          height={cellSize}
          borderRadius={knobProps.borderRadius.borderRadius}
        />
      </InputParts>
    );
  }

  if (!resolvedForm || !name) {
    const effectiveValue = controlledValue ?? standaloneValue;
    const parsedStandalone = parseColorValue(effectiveValue, _format);
    const standaloneFormatError =
      effectiveValue.trim() && !parsedStandalone.isValid ? unrecognizedColorError(_format) : undefined;

    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={errorProp || standaloneFormatError}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        <InputParts size={size || knobProps.sizeToken}>
          <ColorPickerControl
            value={effectiveValue}
            format={_format}
            showAlpha={showAlpha}
            presetColors={presetColors}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            inputProps={inputProps}
            hasError={!!errorProp || !!standaloneFormatError}
            id={id}
            hasLabel={Boolean(label)}
            a11yLabel={typeof label === 'string' ? label : undefined}
            helperText={helperText}
            onValueChange={handleStandaloneChange}
            required={required}
            onBlurControl={() => onBlur?.(undefined as never)}
          />
        </InputParts>
      </FieldLayout>
    );
  }

  return (
    <Field
      defaultValue={defaultValue}
      form={resolvedForm}
      mode={mode}
      name={name}
      preserveValue={preserveValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, errorProp);
        const fieldValue = (field.state.value as string) || '';
        const parsedField = parseColorValue(fieldValue, _format);
        const fieldFormatError =
          fieldValue.trim() && !parsedField.isValid ? unrecognizedColorError(_format) : undefined;

        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError || fieldFormatError}
            helperText={helperText}
            required={required}
            size={size}
            knobProps={knobProps}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}>
            <InputParts size={size || knobProps.sizeToken}>
              <ColorPickerControl
                value={fieldValue}
                format={_format}
                showAlpha={showAlpha}
                presetColors={presetColors}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                inputProps={inputProps}
                hasError={!!resolvedError || !!fieldFormatError}
                id={id}
                hasLabel={Boolean(label)}
                a11yLabel={typeof label === 'string' ? label : undefined}
                helperText={helperText}
                onValueChange={(newValue) => {
                  field.handleChange(newValue as TData);
                  // Form mode also notifies user callbacks (family norm).
                  emitValueChange(newValue);
                }}
                required={required}
                onBlurControl={mergeFieldHandler(field, 'handleBlur', onBlur)}
              />
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
}

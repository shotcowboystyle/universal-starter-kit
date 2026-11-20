import { useResolvedKnobs, useChartPalette, normalizeToHex } from '@repo/theme';
import { Pipette } from '@tamagui/lucide-icons-2';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { View, XStack, YStack, isWeb, useProps, useTheme } from 'tamagui';
import type { Popover, TamaguiElement } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout } from '../../FieldLayout';
import type { FormFieldProps } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

import { hexAlphaByte, hexToHsv, hexToRgb, hsvToHex, normalizeHex, parseHex, rgbToHex } from './color';
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
} from './parts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InputProps = ComponentProps<typeof InputParts.Area>;

type ColorFormat = 'hex' | 'rgb' | 'hsl';

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
    format?: ColorFormat;
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

// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof -- parse boundary: tamagui theme values are untyped (`any`); only string colors are usable
const asColor = (val: unknown): string | undefined => (typeof val === 'string' ? val : undefined);

const useThemePresetColors = (): string[] => {
  const palette = useChartPalette();
  const theme = useTheme();
  return useMemo(() => {
    const raw = [
      ...palette.categorical.slice(0, 8),
      palette.semantic.error,
      palette.semantic.success,
      palette.semantic.warning,
      asColor(theme.color12?.val),
      asColor(theme.color8?.val),
      asColor(theme.color1?.val),
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const color of raw) {
      const key = color === undefined ? undefined : normalizeToHex(color)?.toUpperCase();
      if (key !== undefined && key !== '' && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    return out;
  }, [palette, theme.color12, theme.color8, theme.color1]);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const rgbToHsl = (r: number, g: number, b: number) => {
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
      case r1: {
        h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) * 60;
        break;
      }
      case g1: {
        h = ((b1 - r1) / d + 2) * 60;
        break;
      }
      default: {
        h = ((r1 - g1) / d + 4) * 60;
        break;
      }
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const hslToRgb = (h: number, s: number, l: number) => {
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
};

interface ParsedColor {
  hex: string;
  alpha: number;
  isValid: boolean;
}

const COLOR_FN = /^(?<name>rgba?|hsla?)\((?<args>[^()]*)\)$/iu;
const UNSIGNED_INT = /^\d+$/u;
const UNSIGNED_NUM = /^(?:\d+|\d*\.\d+)$/u;
const SIGNED_NUM = /^-?(?:\d+|\d*\.\d+)$/u;

/** Split `rgb(...)` / `hsl(...)` (and the `a` forms) into 3–4 trimmed arguments. */
const colorFnArgs = (raw: string, fn: 'rgb' | 'hsl'): string[] | null => {
  const groups = COLOR_FN.exec(raw)?.groups;
  if (!groups?.name.toLowerCase().startsWith(fn)) {
    return null;
  }
  const args = groups.args.split(',').map((arg) => arg.trim());
  return args.length === 3 || args.length === 4 ? args : null;
};

const percentValue = (arg: string): string | null => {
  const num = arg.endsWith('%') ? arg.slice(0, -1) : '';
  return UNSIGNED_NUM.test(num) ? num : null;
};

const alphaFromArg = (arg: string | undefined): number =>
  arg === undefined ? 100 : clamp(Math.round(Number(arg) * 100), 0, 100);

const INVALID_COLOR: ParsedColor = { hex: '', alpha: 100, isValid: false };

const isOptionalAlpha = (arg: string | undefined): boolean => arg === undefined || UNSIGNED_NUM.test(arg);

const parseRgbFn = (raw: string): ParsedColor => {
  const args = colorFnArgs(raw, 'rgb');
  if (args === null) {
    return INVALID_COLOR;
  }
  const [rArg, gArg, bArg] = args;
  const aArg = args.at(3);
  if (![rArg, gArg, bArg].every((arg) => UNSIGNED_INT.test(arg)) || !isOptionalAlpha(aArg)) {
    return INVALID_COLOR;
  }
  const r = clamp(Number(rArg), 0, 255);
  const g = clamp(Number(gArg), 0, 255);
  const b = clamp(Number(bArg), 0, 255);
  return { hex: rgbToHex(r, g, b), alpha: alphaFromArg(aArg), isValid: true };
};

const parseHslFn = (raw: string): ParsedColor => {
  const args = colorFnArgs(raw, 'hsl');
  if (args === null) {
    return INVALID_COLOR;
  }
  const [hArg, sArg, lArg] = args;
  const aArg = args.at(3);
  const sNum = percentValue(sArg);
  const lNum = percentValue(lArg);
  if (!SIGNED_NUM.test(hArg) || sNum === null || lNum === null || !isOptionalAlpha(aArg)) {
    return INVALID_COLOR;
  }
  const { r, g, b } = hslToRgb(Number(hArg), clamp(Number(sNum), 0, 100), clamp(Number(lNum), 0, 100));
  return { hex: rgbToHex(r, g, b), alpha: alphaFromArg(aArg), isValid: true };
};

const parseColorValue = (value: string | undefined, format: ColorFormat): ParsedColor => {
  const raw = value?.trim() ?? '';
  if (raw === '') {
    return { hex: '', alpha: 100, isValid: true };
  }
  if (format === 'rgb') {
    return parseRgbFn(raw);
  }
  if (format === 'hsl') {
    return parseHslFn(raw);
  }
  const parsed = parseHex(raw);
  if (!parsed) {
    return INVALID_COLOR;
  }
  return { hex: rgbToHex(parsed.r, parsed.g, parsed.b), alpha: parsed.alpha, isValid: true };
};

const formatAlpha = (alpha: number): string => String(Number((alpha / 100).toFixed(2)));

const serializeColorValue = (hex: string, format: ColorFormat, alpha: number, includeAlpha: boolean): string => {
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
};

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

const panelSizeMap = new Map([
  ['small', 160],
  ['medium', 192],
  ['large', 224],
]);

const unrecognizedColorError = (format: ColorFormat): string =>
  t('Color must be a recognized {{format}} value', { format: format.toUpperCase() });

const ColorBody = ({
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
}: ColorBodyProps) => {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const panelSize = panelSizeMap.get(knobProps.size) ?? 192;
  const previewSize = SWATCH_PX.get(knobProps.size) ?? 24;
  const [hexInputValue, setHexInputValue] = useState(selectedColor);
  const [hexEditing, setHexEditing] = useState(false);
  useEffect(() => {
    // Don't rewrite the field while the user is typing — a partial entry like
    // "#112" would commit as a 3-digit hex and clobber the rest of the input.
    if (hexEditing) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-chain-state-updates -- mirrors the committed color into the hex draft only once the user stops editing
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
        // SAFETY: `'EyeDropper' in window` was checked above; the DOM lib does not type the EyeDropper API yet
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
        const { EyeDropper } = window as Window & {
          EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> };
        };
        const eyeDropper = new EyeDropper();
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
      <XStack
        {...knobProps.gap}
        alignItems="stretch">
        <SaturationPanel
          hue={hue}
          saturation={saturation}
          value={value}
          onChangeSV={onChangeSV}
          size={panelSize}
        />
        <HueStrip
          hue={hue}
          onChangeHue={onChangeHue}
          height={panelSize}
          orientation="vertical"
        />
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

      <XStack
        {...knobProps.gap}
        alignItems="center">
        <View
          width={previewSize}
          height={previewSize}
          borderRadius={binaryRadius(knobProps.pointy, previewSize)}
          borderWidth={1}
          borderColor="$color10"
          backgroundColor={selectedColor}
          flexShrink={0}
        />
        <InputParts
          size={knobProps.sizeToken}
          flex={1}>
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
            icon=<Pipette size={CHIP_PX.get(knobProps.size) ?? 18} />
            onPress={() => {
              void handleEyeDropper();
            }}
            cursor="pointer"
            aria-label={t('Eyedropper')}
            hoverStyle={{ opacity: 0.7 }}
          />
        )}
      </XStack>
    </YStack>
  );
};

interface ColorPickerControlProps {
  value: string;
  format: ColorFormat;
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

const describedByFor = (id: string | undefined, helperText: string | undefined, hasError: boolean) => {
  const hasId = id !== undefined && id !== '';
  const ids: string[] = [];
  if (hasId && helperText !== undefined && helperText !== '') {
    ids.push(`${id}-description`);
  }
  if (hasId && hasError) {
    ids.push(`${id}-error`);
  }
  return ids.length > 0 ? ids.join(' ') : undefined;
};

const ColorPickerControl = ({
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
}: ColorPickerControlProps) => {
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);
  const parsedInitial = parseColorValue(value, format);
  const initialColor = parsedInitial.hex;
  const [selectedColor, setSelectedColor] = useState<string>(initialColor);
  const [hsv, setHsv] = useState(() => hexToHsv(initialColor || '#000000'));
  const [alpha, setAlpha] = useState(parsedInitial.alpha);
  const popoverRef = useRef<Popover>(null);
  const triggerRef = useRef<TamaguiElement>(null);

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
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.querySelector('input')?.focus();
      }
    });
  }, []);

  useEffect(() => {
    const parsed = parseColorValue(value, format);
    if (parsed.hex !== selectedColor) {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- adopts the controlled `value` prop into picker state; local edits must not round-trip through it
      setSelectedColor(parsed.hex);
      if (parsed.hex) {
        setHsv(hexToHsv(parsed.hex));
      }
    }
    if (parsed.alpha !== alpha) {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- see setSelectedColor above
      setAlpha(parsed.alpha);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- sync only on prop changes; re-running on local selectedColor/alpha edits would snap lossy (hsl) picks back to the parsed prop
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
        <View
          paddingInlineStart="$2"
          alignSelf="center">
          <View
            width={CHIP_PX.get(knobProps.size) ?? 18}
            height={CHIP_PX.get(knobProps.size) ?? 18}
            borderRadius={binaryRadius(knobProps.pointy, CHIP_PX.get(knobProps.size) ?? 18)}
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
          aria-required={required ?? undefined}
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
        label: a11yLabel ?? t('Color'),
        value: value || selectedColor || placeholder,
        hint: helperText,
      }}
      trigger={
        <ColorPickerInputTrigger
          ref={triggerRef}
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
          // Labeled: the sibling Label wires `aria-labelledby` onto this id
          // itself — naming it here too doubles the spoken name.
          aria-label={hasLabel ? undefined : t('Color')}
          aria-describedby={describedByFor(id, helperText, hasError)}
          aria-required={required ?? undefined}
          aria-invalid={hasError || undefined}
          inputProps={inputProps}
        />
      }>
      {colorContent}
    </ColorPickerPopoverShell>
  );
};

// ---------------------------------------------------------------------------
// ColorPicker — main exported component
// ---------------------------------------------------------------------------

export const ColorPicker = <
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(
  props: ColorPickerProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
) => {
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
    // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is still honored for back-compat
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
  const [standaloneValue, setStandaloneValue] = useState<string>(() => {
    // SAFETY: a ColorPicker field stores its serialized color string, or nothing before a pick
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
    const seed = controlledValue ?? (defaultValue as string | undefined);
    return seed ?? '';
  });

  // Sync internal state when controlled value changes
  useEffect(() => {
    if (controlledValue !== undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- adopts the controlled `value` prop into display state
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
    const cellSize = size ?? knobProps.sizeToken;
    return (
      <InputParts size={cellSize}>
        {Boolean(label) && (
          <Skeleton
            variant="text"
            width={96}
            height={14}
          />
        )}
        <Skeleton
          variant="rounded"
          width={cellSize}
          height={cellSize}
          borderRadius={knobProps.borderRadius.borderRadius}
        />
      </InputParts>
    );
  }

  if (!resolvedForm || name === undefined || name === '') {
    const effectiveValue = controlledValue ?? standaloneValue;
    const parsedStandalone = parseColorValue(effectiveValue, _format);
    const standaloneFormatError =
      effectiveValue.trim() && !parsedStandalone.isValid ? unrecognizedColorError(_format) : undefined;

    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={errorProp ?? standaloneFormatError}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        <InputParts size={size ?? knobProps.sizeToken}>
          <ColorPickerControl
            value={effectiveValue}
            format={_format}
            showAlpha={showAlpha}
            presetColors={presetColors}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            inputProps={inputProps}
            hasError={Boolean(errorProp) || standaloneFormatError !== undefined}
            id={id}
            hasLabel={Boolean(label)}
            // oxlint-disable-next-line anti-slop/no-runtime-typeof -- label is a ReactNode; only a plain string can serve as the native announcement
            a11yLabel={typeof label === 'string' ? label : undefined}
            helperText={helperText}
            onValueChange={handleStandaloneChange}
            required={required}
            onBlurControl={() => {
              // SAFETY: a panel close has no DOM FocusEvent; FieldLayout blur handlers never read the event
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
              onBlur?.(undefined as never);
            }}
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
        // SAFETY: a ColorPicker field stores its serialized color string, or nothing before a pick
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
        const fieldValue = (field.state.value as string | undefined) ?? '';
        const parsedField = parseColorValue(fieldValue, _format);
        const fieldFormatError =
          fieldValue.trim() && !parsedField.isValid ? unrecognizedColorError(_format) : undefined;

        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError ?? fieldFormatError}
            helperText={helperText}
            required={required}
            size={size}
            knobProps={knobProps}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}>
            <InputParts size={size ?? knobProps.sizeToken}>
              <ColorPickerControl
                value={fieldValue}
                format={_format}
                showAlpha={showAlpha}
                presetColors={presetColors}
                placeholder={placeholder}
                disabled={disabled}
                readOnly={readOnly}
                inputProps={inputProps}
                hasError={Boolean(resolvedError) || fieldFormatError !== undefined}
                id={id}
                hasLabel={Boolean(label)}
                // oxlint-disable-next-line anti-slop/no-runtime-typeof -- label is a ReactNode; only a plain string can serve as the native announcement
                a11yLabel={typeof label === 'string' ? label : undefined}
                helperText={helperText}
                onValueChange={(newValue) => {
                  // SAFETY: the picker only emits serialized color strings, which is this field's value type
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TData is a deferred generic; the picker only emits strings
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
};

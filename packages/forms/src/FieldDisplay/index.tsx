/**
 * FieldDisplay — read-only render variants for every field type.
 *
 * DataTable cells mount this (cheap, view-only) when a cell is read-only, and
 * the full Field only while editing. Heavy fields get a compact type-specific
 * face rather than a disabled edit control (Spectrum S15 / Carbon C27: read
 * mode is copyable and full-contrast, never a dimmed input).
 *
 * Knob contract (SHARED recipes): complete `knobProps` fragments —
 * standalone frames take `surface` + `borderRadius` + space padding; table
 * cells stay chromeless (the cell already owns SP-EDGE). DescriptionList
 * slots are also chromeless (the list paints no surface) and
 * start-align every value (align-by-type is a COLUMN rule — each
 * list row is its own class). Type chrome (check box, swatch, thumb, meter)
 * follows the same radius/size channel as the editable twin. `sizeToken` is
 * control height, never fontSize — type uses `label` + `body`.
 */

import { CheckIcon, FileIcon, ImageSquareIcon, StarIcon } from '@phosphor-icons/react';
import { useReadableTextOn, useResolvedKnobs, type KnobProps } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SizeTokens } from 'tamagui';
import { Image, Text, View, XStack, getVariableValue, isWeb, useTheme } from 'tamagui';

import { Chip, type ChipColor, type ChipSize } from '../Chip';
import { BarcodePreview } from '../fields/Barcode/BarcodePreview';
import { useReverseGeocodedLabel } from '../fields/Geolocation/geocoderContext';
import { parseGeoValue } from '../fields/Geolocation/geoValue';
import { formControlColors, formSelectedColors } from '../shared/colorRamps';
import { t } from '../shared/t';
import { useIsInTableCell } from '../shared/tableCellContext';
import { clampRadiusForControl } from '../shared/utils';

import { asText, EMPTY, formatDateText, formatNumericText } from './formatters';

/** Checkbox glyph rides the scale but NEVER h/2 (a radio). */
const CHECKBOX_GLYPH_MAX_RADIUS_TOKEN = 2;

export type FieldDisplayType =
  | 'input'
  | 'textarea'
  | 'mentioninput'
  | 'stepper'
  | 'slider'
  | 'select'
  | 'combobox'
  | 'radiogroup'
  | 'togglegroup'
  | 'checkbox'
  | 'switch'
  | 'datepicker'
  | 'datetimepicker'
  | 'timepicker'
  | 'daterangepicker'
  | 'multidatepicker'
  | 'duration'
  | 'colorpicker'
  | 'phoneinput'
  | 'otp'
  | 'barcode'
  | 'rating'
  | 'progress'
  | 'fileupload'
  | 'image'
  | 'signature'
  | 'geolocation'
  | 'richtexteditor'
  | 'markdowneditor'
  | 'codeeditor'
  | 'custom';

export type FieldDisplayAlign = 'left' | 'right' | 'center';

export interface FieldDisplayProps {
  field?: FieldDisplayType;
  value: any;
  fieldProps?: Record<string, any>;
  /** For linked daterange columns. */
  linkedValue?: any;
  /**
   * Chromeless slot (table cell / DescriptionList). The host already owns
   * the surface; FieldDisplay paints no frame.
   */
  chromeless?: boolean;
  /**
   * Horizontal alignment override. DescriptionList start-aligns every value.
   * Table numeric columns still default to end-align.
   */
  align?: FieldDisplayAlign;
  /** Per-row opt-in ellipsis (DG-OVF). Default is wrap outside table cells. */
  truncate?: boolean;
}

const DescriptionListSlotContext = createContext(false);

/** True when FieldDisplay is mounted as a DescriptionList value. */
export function useIsInDescriptionList(): boolean {
  return useContext(DescriptionListSlotContext);
}

export function DescriptionListSlotProvider({ children }: { children: ReactNode }) {
  return <DescriptionListSlotContext.Provider value={true}>{children}</DescriptionListSlotContext.Provider>;
}

interface DisplaySlot {
  chromeless: boolean;
  align?: FieldDisplayAlign;
  truncate: boolean;
  inDescriptionList: boolean;
}

const DisplaySlotContext = createContext<DisplaySlot>({
  chromeless: false,
  truncate: false,
  inDescriptionList: false,
});

function useDisplaySlot(): DisplaySlot {
  return useContext(DisplaySlotContext);
}

const CHIP_COLORS = new Set<ChipColor>(['gray', 'red', 'green', 'blue', 'yellow', 'orange', 'purple']);

const INTENT_CHIP: Record<string, ChipColor> = {
  success: 'green',
  error: 'red',
  warning: 'yellow',
  accent: 'blue',
  info: 'blue',
};

function chipSizeFor(size: string): ChipSize {
  if (size === 'small') {
    return '$2';
  }
  if (size === 'large') {
    return '$4';
  }
  return '$3';
}

function resolveChipColor(
  value: any,
  fieldProps?: Record<string, any>,
  opt?: { color?: string; intent?: string },
): ChipColor {
  const raw = opt?.color ?? opt?.intent ?? fieldProps?.colors?.[value] ?? fieldProps?.intents?.[value];
  if (typeof raw === 'string') {
    if (CHIP_COLORS.has(raw as ChipColor)) {
      return raw as ChipColor;
    }
    if (INTENT_CHIP[raw]) {
      return INTENT_CHIP[raw];
    }
  }
  return 'gray';
}

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function useDisplayChrome() {
  const { knobProps } = useResolvedKnobs();
  const inTableCell = useIsInTableCell();
  const slot = useDisplaySlot();
  const glyphSize = Math.max(12, Math.round(getVariableValue(getSize(knobProps.sizeToken as SizeTokens)) * 0.45));
  return {
    knobProps,
    inTableCell,
    inDescriptionList: slot.inDescriptionList,
    chromeless: slot.chromeless || inTableCell,
    align: slot.align,
    truncate: slot.truncate,
    glyphSize,
  };
}

function DisplayFrame({ field, children }: { field: FieldDisplayType; children: ReactNode }) {
  const { knobProps, chromeless } = useDisplayChrome();
  if (chromeless) {
    return (
      <XStack
        data-component="FieldDisplay"
        data-field={field}
        data-chromeless=""
        alignItems="center"
        justifyContent="flex-start"
        minWidth={0}
        flex={1}
        width="100%">
        {children}
      </XStack>
    );
  }
  return (
    <XStack
      data-component="FieldDisplay"
      data-field={field}
      data-space={knobProps.space}
      data-size={knobProps.size}
      alignItems="center"
      minWidth={0}
      width="100%"
      {...knobProps.surface}
      {...knobProps.borderRadius}
      {...knobProps.panelPadding}
      {...(knobProps.outlined ? { backgroundColor: 'transparent' } : undefined)}>
      {children}
    </XStack>
  );
}

function ValueText({
  children,
  mono = false,
  align = 'left',
  lines = 1,
  wrap = false,
  empty = false,
  title,
}: {
  children: ReactNode;
  mono?: boolean;
  align?: FieldDisplayAlign;
  lines?: number;
  wrap?: boolean;
  empty?: boolean;
  title?: string;
}) {
  const { knobProps } = useResolvedKnobs();
  return (
    <Text
      {...(wrap ? undefined : { numberOfLines: lines })}
      {...knobProps.body}
      {...knobProps.label}
      fontFamily={mono ? '$mono' : knobProps.body.fontFamily}
      textAlign={align}
      color={empty ? '$color10' : knobProps.textAccentColor}
      userSelect="text"
      flexShrink={1}
      minWidth={0}
      width={wrap ? '100%' : undefined}
      display={wrap ? 'block' : undefined}
      whiteSpace={wrap ? 'pre-wrap' : undefined}
      {...(isWeb && title ? ({ title } as Record<string, unknown>) : undefined)}>
      {children}
    </Text>
  );
}

function TextCell({
  children,
  mono = false,
  align,
  lines = 1,
  wrap,
}: {
  children: ReactNode;
  mono?: boolean;
  align?: FieldDisplayAlign;
  lines?: number;
  wrap?: boolean;
}) {
  const { inDescriptionList, truncate, align: slotAlign } = useDisplayChrome();
  const empty = children === EMPTY;
  const resolvedAlign = align ?? slotAlign ?? 'left';
  const resolvedWrap = wrap ?? (inDescriptionList && !truncate);
  const title = truncate && !resolvedWrap && typeof children === 'string' && children !== EMPTY ? children : undefined;
  return (
    <ValueText
      mono={mono}
      align={resolvedAlign}
      lines={truncate ? 1 : lines}
      wrap={resolvedWrap}
      empty={empty}
      title={title}>
      {children}
    </ValueText>
  );
}

function InputDisplay({
  value,
  href,
  multiline,
  mono,
}: {
  value: any;
  href?: string;
  multiline?: boolean;
  mono?: boolean;
}) {
  const { knobProps, inTableCell, truncate } = useDisplayChrome();
  const text = asText(value);
  const link = href || (isSafeHttpUrl(value) ? value : undefined);
  if (link && text !== EMPTY) {
    return (
      <Text
        numberOfLines={1}
        {...knobProps.body}
        {...knobProps.label}
        color="$accentColor"
        textDecorationLine="underline"
        // Render as an anchor on web; `tag`/`href` are applied by Tamagui at
        // runtime though the Text prop type omits them.
        {...({ tag: 'a', href: link } as Record<string, unknown>)}
        role="link"
        cursor="pointer"
        userSelect="text"
        flexShrink={1}
        minWidth={0}>
        {text}
      </Text>
    );
  }
  return (
    <TextCell mono={mono} wrap={Boolean(multiline && !inTableCell && !truncate)}>
      {text}
    </TextCell>
  );
}

function NumericDisplay({ value, fieldProps }: { value: any; fieldProps?: Record<string, any> }) {
  const { align } = useDisplayChrome();
  const numericAlign = align ?? 'right';
  if (value == null || value === '') {
    return <TextCell align={numericAlign}>{EMPTY}</TextCell>;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return <TextCell align={numericAlign}>{asText(value)}</TextCell>;
  }
  const formatted = formatNumericText(num, {
    precision: fieldProps?.precision,
    currency: fieldProps?.currency,
  });
  return (
    <TextCell mono align={numericAlign}>
      {formatted}
    </TextCell>
  );
}

function DateDisplay({
  value,
  fieldProps,
  withTime,
}: {
  value: any;
  fieldProps?: Record<string, any>;
  withTime?: boolean;
}) {
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return <TextCell>{formatDateText(value, { withTime, dateFormat: fieldProps?.dateFormat })}</TextCell>;
}

function DateRangeDisplay({ value, linkedValue }: { value: any; linkedValue?: any }) {
  const start = value;
  const end = linkedValue ?? (Array.isArray(value) ? value[1] : value?.end);
  const startFmt = start && !(start instanceof Date && Number.isNaN(start.getTime())) ? formatDateText(start) : null;
  const endFmt = end && !(end instanceof Date && Number.isNaN(end.getTime())) ? formatDateText(end) : null;
  if (!startFmt && !endFmt) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return <TextCell>{t('{{start}} – {{end}}', { start: startFmt ?? '?', end: endFmt ?? '?' })}</TextCell>;
}

function ChoiceDisplay({ value, fieldProps }: { value: any; fieldProps?: Record<string, any> }) {
  const { knobProps } = useDisplayChrome();
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const options: Array<{ label: string; value: any; color?: string; intent?: string }> = fieldProps?.options ?? [];
  const size = chipSizeFor(knobProps.size);
  const values = Array.isArray(value) ? value : [value];
  return (
    <XStack alignItems="center" flexWrap="wrap" minWidth={0} {...knobProps.gap}>
      {values.map((item, index) => {
        const opt = options.find((o) => o.value === item || String(o.value) === String(item));
        return (
          <Chip key={`${String(item)}-${index}`} size={size} color={resolveChipColor(item, fieldProps, opt)}>
            {opt?.label ?? asText(item)}
          </Chip>
        );
      })}
    </XStack>
  );
}

function BooleanDisplay({ value }: { value: any }) {
  const { knobProps, glyphSize, align } = useDisplayChrome();
  const onMark = useReadableTextOn(formSelectedColors.mark);
  if (value == null) {
    return <TextCell align={align ?? 'center'}>{EMPTY}</TextCell>;
  }
  const marked = Boolean(value);
  const glyphRadius = clampRadiusForControl(knobProps.borderRadius.borderRadius, CHECKBOX_GLYPH_MAX_RADIUS_TOKEN);
  const boxBorderWidth = Math.max(Number(knobProps.inputSurface.borderWidth) || 1, 2);
  return (
    <View
      data-checkbox-box=""
      data-checkbox-radius={String(glyphRadius)}
      width={glyphSize}
      height={glyphSize}
      {...knobProps.inputSurface}
      borderWidth={boxBorderWidth}
      borderRadius={glyphRadius}
      backgroundColor={
        marked ? formSelectedColors.mark : knobProps.outlined ? 'transparent' : formControlColors.background
      }
      borderColor={marked ? formSelectedColors.mark : formControlColors.boundary}
      alignItems="center"
      justifyContent="center"
      aria-hidden>
      {marked ? (
        <CheckIcon size={Math.round(glyphSize * 0.65)} weight="bold" color={onMark ?? knobProps.textAccentColor} />
      ) : null}
    </View>
  );
}

function ColorDisplay({ value }: { value: any }) {
  const { knobProps, glyphSize } = useDisplayChrome();
  const hex = typeof value === 'string' && value ? value : null;
  if (!hex) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return (
    <XStack alignItems="center" minWidth={0} {...knobProps.gap}>
      <View
        width={glyphSize}
        height={glyphSize}
        {...knobProps.inputSurface}
        {...knobProps.borderRadius}
        borderColor="$borderColor"
        backgroundColor={hex}
      />
      <ValueText mono>{hex.toUpperCase()}</ValueText>
    </XStack>
  );
}

function DurationDisplay({ value }: { value: any }) {
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const seconds = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(seconds)) {
    return <TextCell>{asText(value)}</TextCell>;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h) {
    parts.push(t('{{hours}}h', { hours: h }));
  }
  if (m) {
    parts.push(t('{{minutes}}m', { minutes: m }));
  }
  if (s && !h) {
    parts.push(t('{{seconds}}s', { seconds: s }));
  }
  return <TextCell mono>{parts.length ? parts.join(' ') : t('0s')}</TextCell>;
}

function FileUploadDisplay({ value }: { value: any }) {
  const { knobProps, glyphSize } = useDisplayChrome();
  const files = Array.isArray(value) ? value : value ? [value] : [];
  if (!files.length) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const label =
    files.length === 1
      ? typeof files[0] === 'string'
        ? files[0]
        : (files[0]?.name ?? t('1 file'))
      : t('{{count}} files', { count: files.length });
  return (
    <XStack alignItems="center" minWidth={0} {...knobProps.gap}>
      <FileIcon size={glyphSize} />
      <TextCell>{label}</TextCell>
    </XStack>
  );
}

function Thumb({ src, alt, knobProps }: { src: string; alt: string; knobProps: KnobProps }) {
  const [broken, setBroken] = useState(false);
  const { px } = knobProps.nestedControl;
  if (broken) {
    return (
      <View
        width={px}
        height={px}
        {...knobProps.borderRadius}
        backgroundColor="$color3"
        alignItems="center"
        justifyContent="center"
        overflow="hidden">
        <ImageSquareIcon size={Math.round(px * 0.45)} />
      </View>
    );
  }
  return (
    <View width={px} height={px} {...knobProps.borderRadius} overflow="hidden" backgroundColor="$color3">
      <Image
        src={src}
        alt={alt}
        width={px}
        height={px}
        objectFit="cover"
        onError={() => {
          setBroken(true);
        }}
      />
    </View>
  );
}

function ImageDisplay({ value }: { value: any }) {
  const { knobProps } = useDisplayChrome();
  const src = typeof value === 'string' && value ? value : null;
  if (!src) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return <Thumb src={src} alt="" knobProps={knobProps} />;
}

function BarcodeDisplay({ value, fieldProps }: { value: any; fieldProps?: Record<string, any> }) {
  const { knobProps, glyphSize } = useDisplayChrome();
  const text = String(value ?? '');
  if (!text) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const formats = fieldProps?.formats;
  const format = Array.isArray(formats)
    ? formats[0]
    : typeof fieldProps?.format === 'string'
      ? fieldProps.format
      : undefined;
  return (
    <XStack alignItems="center" minWidth={0} flexShrink={1} {...knobProps.gap}>
      <ValueText mono>{text}</ValueText>
      {/* The value is already printed beside the symbol, so an undrawable one
          contributes NOTHING rather than a second copy of the string. At this
          bound that is every QR past a short value at a large size — a display
          cell cannot hold 33 whole-pixel modules without growing the row. */}
      <BarcodePreview
        value={text}
        height={Math.max(12, glyphSize)}
        moduleWidth={1}
        format={typeof format === 'string' ? format : undefined}
        textFallback={false}
      />
    </XStack>
  );
}

function SignatureDisplay({ value }: { value: any }) {
  const { knobProps } = useDisplayChrome();
  const src = typeof value === 'string' && value.startsWith('data:image') ? value : null;
  if (src) {
    return <Thumb src={src} alt={t('signed')} knobProps={knobProps} />;
  }
  const hasInk = (typeof value === 'string' && value.length > 0) || (Array.isArray(value) && value.length > 0);
  return <TextCell>{hasInk ? t('signed') : EMPTY}</TextCell>;
}

function geoPair(value: unknown): { lat: number; lng: number } | null {
  if (typeof value === 'string') {
    return parseGeoValue(value);
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const lat = record.lat ?? record.latitude;
  const lng = record.lng ?? record.lon ?? record.longitude;
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
}

function GeolocationDisplay({ value }: { value: any }) {
  const pair = geoPair(value);
  const address = useReverseGeocodedLabel(pair);
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  if (!pair) {
    return <TextCell>{asText(value)}</TextCell>;
  }
  if (address) {
    return <TextCell>{address}</TextCell>;
  }
  return (
    <TextCell mono>
      {pair.lat.toFixed(4)}, {pair.lng.toFixed(4)}
    </TextCell>
  );
}

function RichTextDisplay({ value }: { value: any }) {
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const text =
    typeof value === 'string'
      ? value
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : asText(value);
  if (!text) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return <TextCell>{text}</TextCell>;
}

function MeterDisplay({ value, fieldProps }: { value: any; fieldProps?: Record<string, any> }) {
  const { knobProps, glyphSize } = useDisplayChrome();
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return <TextCell>{asText(value)}</TextCell>;
  }
  const max = typeof fieldProps?.max === 'number' ? fieldProps.max : num <= 1 ? 1 : 100;
  const ratio = Math.min(1, Math.max(0, max === 0 ? 0 : num / max));
  const trackHeight = Math.max(4, Math.round(glyphSize / 4));
  return (
    <XStack alignItems="center" minWidth={0} flex={1} {...knobProps.gap}>
      <View
        flex={1}
        minWidth={48}
        maxWidth={160}
        height={trackHeight}
        overflow="hidden"
        backgroundColor={knobProps.outlined ? 'transparent' : formControlColors.background}
        {...knobProps.inputSurface}
        {...knobProps.borderRadius}>
        <View width={`${Math.round(ratio * 100)}%`} height="100%" backgroundColor={formSelectedColors.mark} />
      </View>
      <TextCell mono>{formatNumericText(num, { precision: fieldProps?.precision })}</TextCell>
    </XStack>
  );
}

function RatingDisplay({ value, fieldProps }: { value: any; fieldProps?: Record<string, any> }) {
  const { knobProps, glyphSize } = useDisplayChrome();
  const theme = useTheme();
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return <TextCell>{asText(value)}</TextCell>;
  }
  const maxStars = typeof fieldProps?.maxStars === 'number' ? fieldProps.maxStars : 5;
  const filled = num > 1 ? Math.round(Math.min(maxStars, num)) : Math.round(num * maxStars);
  const filledColor = theme.accentBackground?.val ?? theme.color10?.val;
  const emptyColor = theme.color8?.val;
  return (
    <XStack
      alignItems="center"
      {...knobProps.gap}
      aria-label={t('{{star}} of {{max}} stars', { star: filled, max: maxStars })}>
      {Array.from({ length: maxStars }, (_, i) => (
        <StarIcon
          key={i}
          size={glyphSize}
          weight={i < filled ? 'fill' : 'regular'}
          color={i < filled ? filledColor : emptyColor}
        />
      ))}
    </XStack>
  );
}

export function FieldDisplay({
  field = 'input',
  value,
  fieldProps,
  linkedValue,
  chromeless = false,
  align,
  truncate = false,
}: FieldDisplayProps) {
  const inTableCell = useIsInTableCell();
  const inDescriptionList = useIsInDescriptionList();
  const slot = useMemo<DisplaySlot>(
    () => ({
      chromeless: chromeless || inTableCell || inDescriptionList,
      align: align ?? (inDescriptionList ? 'left' : undefined),
      truncate,
      inDescriptionList,
    }),
    [chromeless, inTableCell, inDescriptionList, align, truncate],
  );
  let body: ReactNode;
  switch (field) {
    case 'input':
    case 'mentioninput':
    case 'phoneinput':
      body = <InputDisplay value={value} href={fieldProps?.href} />;
      break;

    case 'otp':
      body = <InputDisplay value={value} mono />;
      break;

    case 'textarea':
      body = <InputDisplay value={value} multiline />;
      break;

    case 'barcode':
      body = <BarcodeDisplay value={value} fieldProps={fieldProps} />;
      break;

    case 'stepper':
      body = <NumericDisplay value={value} fieldProps={fieldProps} />;
      break;

    case 'slider':
    case 'progress':
      body = <MeterDisplay value={value} fieldProps={fieldProps} />;
      break;

    case 'rating':
      body = <RatingDisplay value={value} fieldProps={fieldProps} />;
      break;

    case 'select':
    case 'combobox':
    case 'radiogroup':
    case 'togglegroup':
      body = <ChoiceDisplay value={value} fieldProps={fieldProps} />;
      break;

    case 'checkbox':
    case 'switch':
      body = <BooleanDisplay value={value} />;
      break;

    case 'datepicker':
    case 'multidatepicker':
      body = <DateDisplay value={value} fieldProps={fieldProps} />;
      break;

    case 'datetimepicker':
    case 'timepicker':
      body = <DateDisplay value={value} fieldProps={fieldProps} withTime />;
      break;

    case 'daterangepicker':
      body = <DateRangeDisplay value={value} linkedValue={linkedValue} />;
      break;

    case 'colorpicker':
      body = <ColorDisplay value={value} />;
      break;

    case 'duration':
      body = <DurationDisplay value={value} />;
      break;

    case 'fileupload':
      body = <FileUploadDisplay value={value} />;
      break;

    case 'image':
      body = <ImageDisplay value={value} />;
      break;

    case 'signature':
      body = <SignatureDisplay value={value} />;
      break;

    case 'geolocation':
      body = <GeolocationDisplay value={value} />;
      break;

    case 'richtexteditor':
    case 'markdowneditor':
    case 'codeeditor':
      body = <RichTextDisplay value={value} />;
      break;

    case 'custom':
    default:
      body = <InputDisplay value={value} href={fieldProps?.href} />;
      break;
  }

  return (
    <DisplaySlotContext.Provider value={slot}>
      <DisplayFrame field={field}>{body}</DisplayFrame>
    </DisplaySlotContext.Provider>
  );
}

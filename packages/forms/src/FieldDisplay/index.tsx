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
import { useReadableTextOn, useResolvedKnobs } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Image, Text, View, XStack, getVariableValue, isWeb, useTheme } from 'tamagui';

import { Chip } from '../Chip';
import type { ChipColor, ChipSize } from '../Chip';
import { BarcodePreview } from '../fields/Barcode/BarcodePreview';
import { parseGeoValue } from '../fields/Geolocation/geo-value';
import { useReverseGeocodedLabel } from '../fields/Geolocation/geocoder-context';
import { formControlColors, formSelectedColors } from '../shared/color-ramps';
import { t } from '../shared/t';
import { useIsInTableCell } from '../shared/table-cell-context';
import { clampRadiusForControl } from '../shared/utils';

import {
  asText,
  EMPTY,
  formatDateText,
  formatNumericText,
  isBoolean,
  isNumber,
  isObject,
  isString,
  toCellValue,
} from './formatters';
import type { CellValue } from './formatters';

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

/** One selectable option as the display faces read it. */
export interface FieldDisplayOption {
  label: string;
  value: CellValue;
  color?: string;
  intent?: string;
}

/** The slice of a field's props that the read-only faces consume. */
export interface FieldDisplayFieldProps {
  href?: string;
  precision?: number;
  currency?: string;
  dateFormat?: string;
  options?: FieldDisplayOption[];
  /** Chip color keyed by the stringified value. */
  colors?: Partial<Record<string, string>>;
  /** Chip intent keyed by the stringified value. */
  intents?: Partial<Record<string, string>>;
  max?: number;
  maxStars?: number;
  formats?: string[];
  format?: string;
}

export interface FieldDisplayProps {
  field?: FieldDisplayType;
  value: unknown;
  fieldProps?: FieldDisplayFieldProps;
  /** For linked daterange columns. */
  linkedValue?: unknown;
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
export const useIsInDescriptionList = (): boolean => useContext(DescriptionListSlotContext);

export const DescriptionListSlotProvider = ({ children }: { children: ReactNode }) => (
  <DescriptionListSlotContext.Provider value={true}>{children}</DescriptionListSlotContext.Provider>
);

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

const useDisplaySlot = (): DisplaySlot => useContext(DisplaySlotContext);

const CHIP_COLORS: readonly ChipColor[] = ['gray', 'red', 'green', 'blue', 'yellow', 'orange', 'purple'];

const INTENT_CHIP = new Map<string, ChipColor>(
  Object.entries({
    success: 'green',
    error: 'red',
    warning: 'yellow',
    accent: 'blue',
    info: 'blue',
  } satisfies Record<string, ChipColor>),
);

/** Lookup key for a scalar value, so `colors` / `intents` / option matching agree on how values stringify. */
const scalarKey = (value: CellValue): string | undefined =>
  isString(value) || isNumber(value) || isBoolean(value) ? String(value) : undefined;

const toNumber = (value: CellValue): number => (isNumber(value) ? value : Number(value));

const chipSizeFor = (size: string): ChipSize => {
  if (size === 'small') {
    return '$2';
  }
  if (size === 'large') {
    return '$4';
  }
  return '$3';
};

const resolveChipColor = (
  value: CellValue,
  fieldProps?: FieldDisplayFieldProps,
  opt?: FieldDisplayOption,
): ChipColor => {
  const key = scalarKey(value);
  const keyed = key === undefined ? undefined : (fieldProps?.colors?.[key] ?? fieldProps?.intents?.[key]);
  const raw = opt?.color ?? opt?.intent ?? keyed;
  if (raw === undefined) {
    return 'gray';
  }
  return CHIP_COLORS.find((color) => color === raw) ?? INTENT_CHIP.get(raw) ?? 'gray';
};

const isSafeHttpUrl = (value: CellValue): value is string => {
  if (!isString(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const useDisplayChrome = () => {
  const { knobProps } = useResolvedKnobs();
  const inTableCell = useIsInTableCell();
  const slot = useDisplaySlot();
  const glyphSize = Math.max(12, Math.round(getVariableValue(getSize(knobProps.sizeToken)) * 0.45));
  return {
    knobProps,
    inTableCell,
    inDescriptionList: slot.inDescriptionList,
    chromeless: slot.chromeless || inTableCell,
    align: slot.align,
    truncate: slot.truncate,
    glyphSize,
  };
};

const DisplayFrame = ({ field, children }: { field: FieldDisplayType; children: ReactNode }) => {
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
};

const ValueText = ({
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
}) => {
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
      {...(isWeb && title !== undefined && title !== '' ? { title } : undefined)}>
      {children}
    </Text>
  );
};

const hoverTitle = (children: ReactNode, truncated: boolean): string | undefined =>
  truncated && isString(children) && children !== EMPTY ? children : undefined;

const TextCell = ({
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
}) => {
  const { inDescriptionList, truncate, align: slotAlign } = useDisplayChrome();
  const empty = children === EMPTY;
  const resolvedAlign = align ?? slotAlign ?? 'left';
  const resolvedWrap = wrap ?? (inDescriptionList && !truncate);
  const title = hoverTitle(children, truncate && !resolvedWrap);
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
};

const resolveLink = (href: string | undefined, value: CellValue): string | undefined => {
  if (href !== undefined && href !== '') {
    return href;
  }
  return isSafeHttpUrl(value) ? value : undefined;
};

const InputDisplay = ({
  value,
  href,
  multiline,
  mono,
}: {
  value: CellValue;
  href?: string;
  multiline?: boolean;
  mono?: boolean;
}) => {
  const { knobProps, inTableCell, truncate } = useDisplayChrome();
  const text = asText(value);
  const link = resolveLink(href, value);
  if (link !== undefined && text !== EMPTY) {
    return (
      <Text
        numberOfLines={1}
        {...knobProps.body}
        {...knobProps.label}
        color="$accentColor"
        textDecorationLine="underline"
        // Render as an anchor on web; `tag`/`href` are applied by Tamagui at
        // runtime though the Text prop type omits them.
        {...{ tag: 'a', href: link }}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Text renders as an anchor via the runtime `tag` prop; the role keeps native and the type surface consistent
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
    <TextCell
      mono={mono}
      wrap={Boolean(multiline && !inTableCell && !truncate)}>
      {text}
    </TextCell>
  );
};

const NumericDisplay = ({ value, fieldProps }: { value: CellValue; fieldProps?: FieldDisplayFieldProps }) => {
  const { align } = useDisplayChrome();
  const numericAlign = align ?? 'right';
  if (value == null || value === '') {
    return <TextCell align={numericAlign}>{EMPTY}</TextCell>;
  }
  const num = toNumber(value);
  if (Number.isNaN(num)) {
    return <TextCell align={numericAlign}>{asText(value)}</TextCell>;
  }
  const formatted = formatNumericText(num, {
    precision: fieldProps?.precision,
    currency: fieldProps?.currency,
  });
  return (
    <TextCell
      mono
      align={numericAlign}>
      {formatted}
    </TextCell>
  );
};

const DateDisplay = ({
  value,
  fieldProps,
  withTime,
}: {
  value: CellValue;
  fieldProps?: FieldDisplayFieldProps;
  withTime?: boolean;
}) => {
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return <TextCell>{formatDateText(value, { withTime, dateFormat: fieldProps?.dateFormat })}</TextCell>;
};

const rangeEnd = (value: CellValue, linkedValue: CellValue): CellValue => {
  if (linkedValue != null) {
    return linkedValue;
  }
  if (Array.isArray(value)) {
    return value[1];
  }
  return isObject(value) && 'end' in value ? value.end : undefined;
};

/** Formats one end of a range; falsy values and invalid dates read as absent. */
const formatRangeEdge = (edge: CellValue): string | null =>
  Boolean(edge) && !(edge instanceof Date && Number.isNaN(edge.getTime())) ? formatDateText(edge) : null;

const DateRangeDisplay = ({ value, linkedValue }: { value: CellValue; linkedValue?: CellValue }) => {
  const startFmt = formatRangeEdge(value);
  const endFmt = formatRangeEdge(rangeEnd(value, linkedValue));
  if (startFmt === null && endFmt === null) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return <TextCell>{t('{{start}} – {{end}}', { start: startFmt ?? '?', end: endFmt ?? '?' })}</TextCell>;
};

/** Pairs each value with a React key that stays unique when the same value repeats. */
const keyedValues = (values: CellValue[]): { item: CellValue; key: string }[] => {
  const seen = new Map<string, number>();
  return values.map((item) => {
    const base = asText(item);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return { item, key: `${base}-${occurrence}` };
  });
};

const sameOptionValue = (optionValue: CellValue, item: CellValue): boolean => {
  const optionKey = scalarKey(optionValue);
  return optionValue === item || (optionKey !== undefined && optionKey === scalarKey(item));
};

const ChoiceDisplay = ({ value, fieldProps }: { value: CellValue; fieldProps?: FieldDisplayFieldProps }) => {
  const { knobProps } = useDisplayChrome();
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const options = fieldProps?.options ?? [];
  const size = chipSizeFor(knobProps.size);
  const values: CellValue[] = Array.isArray(value) ? value : [value];
  return (
    <XStack
      alignItems="center"
      flexWrap="wrap"
      minWidth={0}
      {...knobProps.gap}>
      {keyedValues(values).map(({ item, key }) => {
        const opt = options.find((o) => sameOptionValue(o.value, item));
        return (
          <Chip
            key={key}
            size={size}
            color={resolveChipColor(item, fieldProps, opt)}>
            {opt?.label ?? asText(item)}
          </Chip>
        );
      })}
    </XStack>
  );
};

const BooleanDisplay = ({ value }: { value: CellValue }) => {
  const { knobProps, glyphSize, align } = useDisplayChrome();
  const onMark = useReadableTextOn(formSelectedColors.mark);
  if (value == null) {
    return <TextCell align={align ?? 'center'}>{EMPTY}</TextCell>;
  }
  const marked = Boolean(value);
  const glyphRadius = clampRadiusForControl(knobProps.borderRadius.borderRadius, CHECKBOX_GLYPH_MAX_RADIUS_TOKEN);
  const boxBorderWidth = Math.max(knobProps.inputSurface.borderWidth, 2);
  const restingFill = knobProps.outlined ? 'transparent' : formControlColors.background;
  return (
    <View
      data-checkbox-box=""
      data-checkbox-radius={String(glyphRadius)}
      width={glyphSize}
      height={glyphSize}
      {...knobProps.inputSurface}
      borderWidth={boxBorderWidth}
      borderRadius={glyphRadius}
      backgroundColor={marked ? formSelectedColors.mark : restingFill}
      borderColor={marked ? formSelectedColors.mark : formControlColors.boundary}
      alignItems="center"
      justifyContent="center"
      aria-hidden>
      {marked ? (
        <CheckIcon
          size={Math.round(glyphSize * 0.65)}
          weight="bold"
          color={onMark ?? knobProps.textAccentColor}
        />
      ) : null}
    </View>
  );
};

const ColorDisplay = ({ value }: { value: CellValue }) => {
  const { knobProps, glyphSize } = useDisplayChrome();
  const hex = isString(value) && value !== '' ? value : null;
  if (hex === null) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return (
    <XStack
      alignItems="center"
      minWidth={0}
      {...knobProps.gap}>
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
};

const DurationDisplay = ({ value }: { value: CellValue }) => {
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const seconds = toNumber(value);
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
};

const toFiles = (value: CellValue): CellValue[] => {
  if (Array.isArray(value)) {
    return value;
  }
  const present = Boolean(value);
  return present ? [value] : [];
};

const fileLabel = (files: CellValue[]): string => {
  if (files.length !== 1) {
    return t('{{count}} files', { count: files.length });
  }
  const [first] = files;
  if (isString(first)) {
    return first;
  }
  const name = isObject(first) && 'name' in first ? first.name : undefined;
  return isString(name) ? name : t('1 file');
};

const FileUploadDisplay = ({ value }: { value: CellValue }) => {
  const { knobProps, glyphSize } = useDisplayChrome();
  const files = toFiles(value);
  if (files.length === 0) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return (
    <XStack
      alignItems="center"
      minWidth={0}
      {...knobProps.gap}>
      <FileIcon size={glyphSize} />
      <TextCell>{fileLabel(files)}</TextCell>
    </XStack>
  );
};

const Thumb = ({ src, alt, knobProps }: { src: string; alt: string; knobProps: KnobProps }) => {
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
    <View
      width={px}
      height={px}
      {...knobProps.borderRadius}
      overflow="hidden"
      backgroundColor="$color3">
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
};

const ImageDisplay = ({ value }: { value: CellValue }) => {
  const { knobProps } = useDisplayChrome();
  const src = isString(value) && value !== '' ? value : null;
  if (src === null) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return (
    <Thumb
      src={src}
      alt=""
      knobProps={knobProps}
    />
  );
};

const BarcodeDisplay = ({ value, fieldProps }: { value: CellValue; fieldProps?: FieldDisplayFieldProps }) => {
  const { knobProps, glyphSize } = useDisplayChrome();
  // oxlint-disable-next-line typescript/no-base-to-string -- barcode payloads are scalars; String() keeps the legacy rendering for anything else
  const text = String(value ?? '');
  if (text === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const formats = fieldProps?.formats;
  const format = formats === undefined ? fieldProps?.format : formats[0];
  return (
    <XStack
      alignItems="center"
      minWidth={0}
      flexShrink={1}
      {...knobProps.gap}>
      <ValueText mono>{text}</ValueText>
      {/* The value is already printed beside the symbol, so an undrawable one
          contributes NOTHING rather than a second copy of the string. At this
          bound that is every QR past a short value at a large size — a display
          cell cannot hold 33 whole-pixel modules without growing the row. */}
      <BarcodePreview
        value={text}
        height={Math.max(12, glyphSize)}
        moduleWidth={1}
        format={format}
        textFallback={false}
      />
    </XStack>
  );
};

const SignatureDisplay = ({ value }: { value: CellValue }) => {
  const { knobProps } = useDisplayChrome();
  const src = isString(value) && value.startsWith('data:image') ? value : null;
  if (src !== null) {
    return (
      <Thumb
        src={src}
        alt={t('signed')}
        knobProps={knobProps}
      />
    );
  }
  const hasInk = (isString(value) && value.length > 0) || (Array.isArray(value) && value.length > 0);
  return <TextCell>{hasInk ? t('signed') : EMPTY}</TextCell>;
};

/** The loosely-keyed coordinate shapes a geolocation cell may hold. */
interface GeoLike {
  [key: string]: CellValue;
  lat?: CellValue;
  latitude?: CellValue;
  lng?: CellValue;
  lon?: CellValue;
  longitude?: CellValue;
}

const isGeoLike = (value: CellValue): value is GeoLike => isObject(value);

const geoPair = (value: CellValue): { lat: number; lng: number } | null => {
  if (isString(value)) {
    return parseGeoValue(value);
  }
  if (!isGeoLike(value)) {
    return null;
  }
  const lat = value.lat ?? value.latitude;
  const lng = value.lng ?? value.lon ?? value.longitude;
  return isNumber(lat) && isNumber(lng) ? { lat, lng } : null;
};

const GeolocationDisplay = ({ value }: { value: CellValue }) => {
  const pair = geoPair(value);
  const address = useReverseGeocodedLabel(pair);
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  if (!pair) {
    return <TextCell>{asText(value)}</TextCell>;
  }
  if (address != null && address !== '') {
    return <TextCell>{address}</TextCell>;
  }
  return (
    <TextCell mono>
      {pair.lat.toFixed(4)}, {pair.lng.toFixed(4)}
    </TextCell>
  );
};

const RichTextDisplay = ({ value }: { value: CellValue }) => {
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const text = isString(value)
    ? value
        // oxlint-disable-next-line sonarjs/super-linear-regex -- display-only tag stripper; a lone `<` without `>` is the only slow shape and the cell value is short
        .replaceAll(/<[^>]+>/gu, ' ')
        .replaceAll(/\s+/gu, ' ')
        .trim()
    : asText(value);
  if (!text) {
    return <TextCell>{EMPTY}</TextCell>;
  }
  return <TextCell>{text}</TextCell>;
};

const MeterDisplay = ({ value, fieldProps }: { value: CellValue; fieldProps?: FieldDisplayFieldProps }) => {
  const { knobProps, glyphSize } = useDisplayChrome();
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const num = toNumber(value);
  if (Number.isNaN(num)) {
    return <TextCell>{asText(value)}</TextCell>;
  }
  const fallbackMax = num <= 1 ? 1 : 100;
  const max = fieldProps?.max ?? fallbackMax;
  const ratio = Math.min(1, Math.max(0, max === 0 ? 0 : num / max));
  const trackHeight = Math.max(4, Math.round(glyphSize / 4));
  return (
    <XStack
      alignItems="center"
      minWidth={0}
      flex={1}
      {...knobProps.gap}>
      <View
        flex={1}
        minWidth={48}
        maxWidth={160}
        height={trackHeight}
        overflow="hidden"
        backgroundColor={knobProps.outlined ? 'transparent' : formControlColors.background}
        {...knobProps.inputSurface}
        {...knobProps.borderRadius}>
        <View
          width={`${Math.round(ratio * 100)}%`}
          height="100%"
          backgroundColor={formSelectedColors.mark}
        />
      </View>
      <TextCell mono>{formatNumericText(num, { precision: fieldProps?.precision })}</TextCell>
    </XStack>
  );
};

const RatingDisplay = ({ value, fieldProps }: { value: CellValue; fieldProps?: FieldDisplayFieldProps }) => {
  const { knobProps, glyphSize } = useDisplayChrome();
  const theme = useTheme();
  if (value == null || value === '') {
    return <TextCell>{EMPTY}</TextCell>;
  }
  const num = toNumber(value);
  if (Number.isNaN(num)) {
    return <TextCell>{asText(value)}</TextCell>;
  }
  const maxStars = fieldProps?.maxStars ?? 5;
  const filled = num > 1 ? Math.round(Math.min(maxStars, num)) : Math.round(num * maxStars);
  const filledRaw: unknown = theme.accentBackground?.val ?? theme.color10?.val;
  const emptyRaw: unknown = theme.color8?.val;
  const filledColor = isString(filledRaw) ? filledRaw : undefined;
  const emptyColor = isString(emptyRaw) ? emptyRaw : undefined;
  const stars = Array.from({ length: maxStars }, (_, position) => ({ position, isFilled: position < filled }));
  return (
    <XStack
      alignItems="center"
      {...knobProps.gap}
      aria-label={t('{{star}} of {{max}} stars', { star: filled, max: maxStars })}>
      {stars.map((star) => (
        <StarIcon
          key={`star-${star.position}`}
          size={glyphSize}
          weight={star.isFilled ? 'fill' : 'regular'}
          color={star.isFilled ? filledColor : emptyColor}
        />
      ))}
    </XStack>
  );
};

interface DisplayInput {
  value: CellValue;
  fieldProps?: FieldDisplayFieldProps;
  linkedValue: CellValue;
}

const renderInput = ({ value, fieldProps }: DisplayInput) => (
  <InputDisplay
    value={value}
    href={fieldProps?.href}
  />
);

const renderNumeric = ({ value, fieldProps }: DisplayInput) => (
  <NumericDisplay
    value={value}
    fieldProps={fieldProps}
  />
);

const renderMeter = ({ value, fieldProps }: DisplayInput) => (
  <MeterDisplay
    value={value}
    fieldProps={fieldProps}
  />
);

const renderChoice = ({ value, fieldProps }: DisplayInput) => (
  <ChoiceDisplay
    value={value}
    fieldProps={fieldProps}
  />
);

const renderDate = ({ value, fieldProps }: DisplayInput) => (
  <DateDisplay
    value={value}
    fieldProps={fieldProps}
  />
);

const renderDateTime = ({ value, fieldProps }: DisplayInput) => (
  <DateDisplay
    value={value}
    fieldProps={fieldProps}
    withTime
  />
);

const renderRichText = ({ value }: DisplayInput) => <RichTextDisplay value={value} />;

const DISPLAY_RENDERERS: Record<FieldDisplayType, (input: DisplayInput) => ReactNode> = {
  input: renderInput,
  mentioninput: renderInput,
  phoneinput: renderInput,
  custom: renderInput,
  otp: ({ value }) => (
    <InputDisplay
      value={value}
      mono
    />
  ),
  textarea: ({ value }) => (
    <InputDisplay
      value={value}
      multiline
    />
  ),
  barcode: ({ value, fieldProps }) => (
    <BarcodeDisplay
      value={value}
      fieldProps={fieldProps}
    />
  ),
  stepper: renderNumeric,
  slider: renderMeter,
  progress: renderMeter,
  rating: ({ value, fieldProps }) => (
    <RatingDisplay
      value={value}
      fieldProps={fieldProps}
    />
  ),
  select: renderChoice,
  combobox: renderChoice,
  radiogroup: renderChoice,
  togglegroup: renderChoice,
  checkbox: ({ value }) => <BooleanDisplay value={value} />,
  switch: ({ value }) => <BooleanDisplay value={value} />,
  datepicker: renderDate,
  multidatepicker: renderDate,
  datetimepicker: renderDateTime,
  timepicker: renderDateTime,
  daterangepicker: ({ value, linkedValue }) => (
    <DateRangeDisplay
      value={value}
      linkedValue={linkedValue}
    />
  ),
  colorpicker: ({ value }) => <ColorDisplay value={value} />,
  duration: ({ value }) => <DurationDisplay value={value} />,
  fileupload: ({ value }) => <FileUploadDisplay value={value} />,
  image: ({ value }) => <ImageDisplay value={value} />,
  signature: ({ value }) => <SignatureDisplay value={value} />,
  geolocation: ({ value }) => <GeolocationDisplay value={value} />,
  richtexteditor: renderRichText,
  markdowneditor: renderRichText,
  codeeditor: renderRichText,
};

export const FieldDisplay = ({
  field = 'input',
  value,
  fieldProps,
  linkedValue,
  chromeless = false,
  align,
  truncate = false,
}: FieldDisplayProps) => {
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
  // Unknown `field` strings from untyped callers fall back to the plain-text face.
  const render = DISPLAY_RENDERERS[field] ?? renderInput;

  return (
    <DisplaySlotContext.Provider value={slot}>
      <DisplayFrame field={field}>
        {render({ value: toCellValue(value), fieldProps, linkedValue: toCellValue(linkedValue) })}
      </DisplayFrame>
    </DisplaySlotContext.Provider>
  );
};

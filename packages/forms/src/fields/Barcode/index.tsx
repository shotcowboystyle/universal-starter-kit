import { BarcodeIcon, CameraIcon, XIcon } from '@phosphor-icons/react';
import { ensureFocusVisibleRing } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { Text } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import type { FieldLayoutProps } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formButtonColors, formCommonColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/table-cell-context';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import type { FieldValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

import { BarcodePreview } from './BarcodePreview';
import { BarcodeScanner, preflightCamera } from './BarcodeScanner';
import type { CameraPreflightResult } from './scanner-types';

const adornmentRing = ensureFocusVisibleRing({ outlineOffset: -2 });

/** True when a ReactNode would actually render something (React drops null/undefined/booleans/empty string). */
const hasContent = (node: ReactNode): boolean => node != null && node !== false && node !== '' && node !== 0;

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

/** One pre-flight at a time: undefined means one was already in flight and this call did nothing. */
const preflightOnce = async (inFlight: RefObject<boolean>): Promise<CameraPreflightResult | undefined> => {
  if (inFlight.current) {
    return undefined;
  }
  inFlight.current = true;
  try {
    return await preflightCamera();
  } finally {
    inFlight.current = false;
  }
};

const ScanToggleButton = ({
  isScanning,
  icon,
  disabled,
  onPress,
}: {
  isScanning: boolean;
  icon: ReactNode;
  disabled: boolean;
  onPress: () => void;
}) => {
  const hasIcon = hasContent(icon);
  let content: ReactNode;
  if (hasIcon) {
    content = <InputParts.Icon>{icon}</InputParts.Icon>;
  } else {
    content = isScanning ? t('Stop') : t('Scan');
  }
  return (
    <InputParts.Button
      tabIndex={0}
      disabled={disabled}
      onPress={onPress}
      aria-label={isScanning ? t('Stop scanning') : t('Scan barcode')}
      aria-pressed={isScanning ? true : undefined}
      aria-expanded={isScanning ? true : undefined}
      focusVisibleStyle={adornmentRing}
      backgroundColor={isScanning ? formButtonColors.background.active : 'transparent'}
      {...(hasIcon ? undefined : { width: 'auto', paddingHorizontal: '$3' })}>
      {content}
    </InputParts.Button>
  );
};

const ClearButton = ({ disabled, onPress }: { disabled: boolean; onPress: () => void }) => (
  <InputParts.Button
    tabIndex={0}
    aria-label={t('Clear barcode')}
    disabled={disabled}
    focusVisibleStyle={adornmentRing}
    onPress={onPress}>
    <InputParts.Icon>
      <XIcon />
    </InputParts.Icon>
  </InputParts.Button>
);

const BarcodeArea = ({
  id,
  value,
  onValueChange,
  readOnly,
  disabled,
  required,
  hasError,
  hasLabel,
  onEscape,
}: {
  id?: string;
  value: string;
  onValueChange: (v: string) => void;
  readOnly: boolean;
  disabled: boolean;
  required?: boolean;
  hasError?: boolean;
  hasLabel?: boolean;
  onEscape: () => void;
}) => (
  <InputParts.Area
    id={id}
    value={value}
    onChangeText={readOnly ? undefined : onValueChange}
    readOnly={readOnly}
    aria-readonly={readOnly ? true : undefined}
    placeholder={t('Enter or scan barcode')}
    disabled={disabled}
    aria-label={hasLabel ? undefined : t('Barcode')}
    aria-required={required ? true : undefined}
    aria-invalid={hasError ? true : undefined}
    autoComplete="off"
    autoCapitalize="none"
    spellCheck={false}
    fontFamily="$mono"
    onKeyDown={
      readOnly || disabled
        ? undefined
        : (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Escape' && value !== '') {
              e.preventDefault();
              onEscape();
            }
          }
    }
  />
);

const BarcodeInput = ({
  value,
  onValueChange,
  disabled,
  readOnly,
  enableScan,
  formats,
  compact,
  knobProps,
  barcodeIcon,
  scanIcon,
  stopIcon,
  required,
  hasError,
  id,
  hasLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
  readOnly: boolean;
  enableScan: boolean;
  formats?: string[];
  compact?: boolean;
  knobProps: KnobProps;
  barcodeIcon?: ReactNode;
  scanIcon?: ReactNode;
  stopIcon?: ReactNode;
  required?: boolean;
  hasError?: boolean;
  id?: string;
  hasLabel?: boolean;
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const preflightingRef = useRef(false);
  const inTableCell = useIsInTableCell();
  const activeScanIcon = isScanning ? stopIcon : scanIcon;
  const showScan = enableScan && !readOnly;
  const showClear = Boolean(value) && !readOnly && !disabled && !isScanning;
  const showPreview = Boolean(value) && !isScanning && !inTableCell;

  // Verify camera availability BEFORE presenting
  // the scanner surface. Pre-flight failure renders an inline error at the
  // field and the surface never mounts (no mount-fail-unmount flicker). The
  // scan button stays enabled — pressing it again re-runs the pre-flight.
  const handleScanPress = async () => {
    if (isScanning) {
      setIsScanning(false);
      return;
    }
    const result = await preflightOnce(preflightingRef);
    if (result === undefined) {
      return;
    }
    if (result.ok) {
      setScanError(null);
      setIsScanning(true);
    } else {
      setScanError(result.reason);
    }
  };

  const handleClear = () => {
    if (disabled || readOnly) {
      return;
    }
    onValueChange('');
  };

  return (
    <>
      <InputParts size={knobProps.sizeToken}>
        {/* Scan (and Clear) live inside Input.Box so the composite ring
            wraps the whole perceived control — never a sibling house Button
            that the inner-Area ring would leave outside. */}
        <InputParts.Box
          testID="barcode-field"
          disabled={disabled}
          theme={hasError ? 'error' : undefined}>
          {hasContent(barcodeIcon) ? <InputParts.Icon adornment="leading">{barcodeIcon}</InputParts.Icon> : null}
          <BarcodeArea
            id={id}
            value={value}
            onValueChange={onValueChange}
            readOnly={readOnly}
            disabled={disabled}
            required={required}
            hasError={hasError}
            hasLabel={hasLabel}
            onEscape={handleClear}
          />
          {showClear ? (
            <ClearButton
              disabled={disabled}
              onPress={handleClear}
            />
          ) : null}
          {showScan ? (
            <ScanToggleButton
              isScanning={isScanning}
              icon={activeScanIcon}
              disabled={disabled}
              onPress={() => {
                void handleScanPress();
              }}
            />
          ) : null}
        </InputParts.Box>
        {showPreview ? (
          // The primary format token drives which symbology the preview draws
          // (any `qr` alias → QR matrix); the scanner resolves the same token
          // through the same alias table, so draw and decode stay in lockstep.
          <BarcodePreview
            value={value}
            height={compact ? 24 : 36}
            moduleWidth={1}
            format={formats?.[0]}
          />
        ) : null}
      </InputParts>
      <BarcodeScanner
        active={isScanning}
        onScan={onValueChange}
        onError={setScanError}
        onClose={() => {
          setIsScanning(false);
        }}
        knobProps={knobProps}
        formats={formats}
        compact={compact}
      />
      {scanError !== null && scanError !== '' && (
        <Text
          {...knobProps.body}
          color={formCommonColors.error}
          fontSize="$2">
          {scanError}
        </Text>
      )}
    </>
  );
};

export interface BarcodeProps {
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
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: FieldLayoutProps['onBlur'];
  disabled?: boolean;
  readOnly?: boolean;
  enableScan?: boolean;
  formats?: string[];
  /**
   * Leading input adornment. Optional — bare use falls back to the package
   * barcode glyph (Phosphor, the house icon set) so core affordances render
   * without icon wiring (Axiom 13 ONE BODY). Pass `null` to opt out of the
   * adornment slot entirely.
   */
  barcodeIcon?: ReactNode;
  /**
   * Scan/stop button icons. Optional — default to the package camera/close
   * glyphs. Pass `null` to fall back to the text-label button.
   */
  scanIcon?: ReactNode;
  stopIcon?: ReactNode;
  /** When true, renders a skeleton placeholder instead of the barcode field */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
}

// Package icon defaults (UX-010): React elements are immutable descriptors,
// so module-level sharing is safe. `undefined` picks these up; explicit
// `null` opts out (adornment slot / text-label button).
const defaultBarcodeIcon = <BarcodeIcon size={18} />;
const defaultScanIcon = <CameraIcon size={18} />;
const defaultStopIcon = <XIcon size={18} />;

export const Barcode = ({
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
  enableScan = true,
  formats,
  barcodeIcon = defaultBarcodeIcon,
  scanIcon = defaultScanIcon,
  stopIcon = defaultStopIcon,
  skeleton,
  compact,
}: BarcodeProps) => {
  const { resolvedForm, knobProps, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(() => defaultValue ?? '');

  const iconProps = { barcodeIcon, scanIcon, stopIcon };

  const standaloneValue = isControlled ? (value ?? '') : uncontrolled;
  const onStandaloneChange = (next: string) => {
    if (disabled || readOnly) {
      return;
    }
    if (!isControlled) {
      setUncontrolled(next);
    }
    onChange?.(next);
  };

  // Render skeleton placeholder
  if (skeleton) {
    return (
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        <Skeleton
          variant="rounded"
          width="100%"
          height={knobProps.sizeToken}
        />
      </FieldLayout>
    );
  }

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
        <BarcodeInput
          value={standaloneValue}
          onValueChange={onStandaloneChange}
          disabled={!!disabled}
          readOnly={!!readOnly}
          enableScan={enableScan}
          formats={formats}
          compact={compact}
          knobProps={knobProps}
          required={required}
          hasError={hasErrorValue(error)}
          id={id}
          hasLabel={hasContent(label)}
          {...iconProps}
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
            <BarcodeInput
              value={field.state.value ?? ''}
              onValueChange={(v) => {
                if (disabled || readOnly) {
                  return;
                }
                field.handleChange(v);
                onChange?.(v);
              }}
              disabled={!!disabled}
              readOnly={!!readOnly}
              enableScan={enableScan}
              formats={formats}
              compact={compact}
              knobProps={knobProps}
              required={required}
              hasError={hasErrorValue(resolvedError)}
              id={id}
              hasLabel={hasContent(label)}
              {...iconProps}
            />
          </FieldLayout>
        );
      }}
    </Field>
  );
};

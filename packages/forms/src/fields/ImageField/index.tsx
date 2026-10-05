/**
 * ImageField — Frappe Attach Image: one preview frame that attaches, replaces,
 * and drops; Remove is a sibling action. Keyboard ring on the frame
 * (outer painted box) and a second ring on Remove — never on the hidden input.
 *
 * The preview is a live-media tile. No status pip
 * on the media. State chrome (Remove) lives outside the tile, or the tile is
 * replaced wholesale (broken-load fallback). Radius stays UNCLAMPED — spread
 * the borderRadius fragment, never clampRadiusForControl / containerRadius.
 */

import { ImageSquareIcon, XIcon } from '@phosphor-icons/react';
import {
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  wasKeyboardFocus,
  type DisabledSurfaceProps,
  type KnobProps,
} from '@repo/theme';
import type { DragEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { Image, Text, View, YStack, isWeb, styled } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout, useFieldA11y, useFieldDescribedBy } from '../../fieldLayout';
import { formCommonColors, formInputColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/tableCellContext';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

const IMAGE_EXT = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i;
const CAPTION_MIN_EDGE = 56;

export interface ImageFieldProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  /** Current value - can be a URL string or File object */
  value?: string | File | null;
  defaultValue?: string | File | null;
  /**
   * Canonical change handler, consistent with the rest of the field family.
   * Fires in both standalone and form mode. Prefer this over `onValueChange`.
   */
  onChange?: (value: string | File | null) => void;
  /** @deprecated Use `onChange` instead. */
  onValueChange?: (value: string | File | null) => void;
  onBlur?: (...args: any[]) => void;
  /** Accepted image types (default: "image/*") */
  accept?: string;
  /** Max file size in bytes */
  maxSize?: number;
  /** Width of the image area (default: 48) */
  imageWidth?: number;
  /** Height of the image area (default: 48) */
  imageHeight?: number;
  /** Whether to show a remove action when there's an image */
  showRemove?: boolean;
  /** Placeholder text when no image. Empty string hides the caption. */
  placeholder?: string;
  /** How the preview fits the frame (Frappe Attach Image uses contain for logos). */
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  /** When true, renders a skeleton placeholder instead of the image field */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
}

const ImageFrame = styled(View, {
  name: 'ImageFieldFrame',
  position: 'relative',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  outlineWidth: 0,
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { outlineWidth: 0 },
});

interface ImageControlProps {
  id: string;
  label?: ReactNode;
  currentValue: string | File | null | undefined;
  errorProp?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  accept: string;
  maxSize?: number;
  imageWidth: number;
  imageHeight: number;
  showRemove: boolean;
  placeholder?: string;
  objectFit: NonNullable<ImageFieldProps['objectFit']>;
  knobProps: KnobProps;
  disabledSurface?: DisabledSurfaceProps;
  onChange?: (val: string | File | null) => void;
  onChangeProp?: (val: string | File | null) => void;
  onValueChange?: (val: string | File | null) => void;
  onInvalid?: (message: string | undefined) => void;
  blurHandler?: (...args: any[]) => void;
}

function isImageFile(file: File, accept: string): boolean {
  if (file.type.startsWith('image/')) {
    return true;
  }
  if (IMAGE_EXT.test(file.name)) {
    return true;
  }
  if (!accept) {
    return false;
  }
  const accepted = accept.split(',').map((type) => type.trim().toLowerCase());
  const name = file.name.toLowerCase();
  return accepted.some((type) => {
    if (type.startsWith('.')) {
      return name.endsWith(type);
    }
    if (type.endsWith('/*')) {
      return file.type.startsWith(type.slice(0, -1));
    }
    return file.type === type || file.type.match(type.replace('*', '.*'));
  });
}

function ImageControl({
  id,
  label,
  currentValue,
  errorProp,
  required,
  disabled,
  readOnly,
  accept,
  maxSize,
  imageWidth,
  imageHeight,
  showRemove,
  placeholder,
  objectFit,
  knobProps,
  disabledSurface,
  onChange,
  onChangeProp,
  onValueChange,
  onInvalid,
  blurHandler,
}: ImageControlProps) {
  const describedBy = useFieldDescribedBy();
  const fieldA11y = useFieldA11y();
  const inTableCell = useIsInTableCell();
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [kbFrameFocus, setKbFrameFocus] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const canInteract = !disabled && !readOnly;

  useEffect(() => {
    setBroken(false);
    if (!(currentValue instanceof File) || !isWeb) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(currentValue);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [currentValue]);

  const displayUrl =
    typeof currentValue === 'string' && currentValue ? currentValue : currentValue instanceof File ? previewUrl : null;
  const hasValue = currentValue instanceof File || (typeof currentValue === 'string' && !!currentValue);
  const hasPreview = !!displayUrl && !broken;
  const minEdge = Math.min(imageWidth, imageHeight);
  const caption = placeholder === undefined ? t('Add image') : placeholder;
  const showCaption = Boolean(caption) && !hasPreview && (placeholder !== undefined || minEdge >= CAPTION_MIN_EDGE);
  const iconSize = Math.max(14, Math.min(32, Math.round(minEdge * 0.28)));

  const emit = useCallback(
    (next: string | File | null) => {
      onInvalid?.(undefined);
      onChange?.(next);
      onChangeProp?.(next);
      onValueChange?.(next);
      blurHandler?.();
    },
    [onChange, onChangeProp, onValueChange, onInvalid, blurHandler],
  );

  const validateFile = useCallback(
    (file: File): string | null => {
      if (maxSize && file.size > maxSize) {
        const sizeMB = (maxSize / 1024 / 1024).toFixed(1);
        return t('Image must be less than {{size}}MB', { size: sizeMB });
      }
      if (!isImageFile(file, accept)) {
        return t('File must be an image');
      }
      return null;
    },
    [maxSize, accept],
  );

  const applyFile = useCallback(
    (file: File) => {
      const invalid = validateFile(file);
      if (invalid) {
        setBroken(false);
        onInvalid?.(invalid);
        return;
      }
      setBroken(false);
      emit(file);
    },
    [validateFile, emit, onInvalid],
  );

  const openFileDialog = useCallback(() => {
    if (!canInteract) {
      return;
    }
    fileInputRef.current?.click();
  }, [canInteract]);

  const isInteractiveChild = useCallback((e: { target: unknown; currentTarget: unknown }) => {
    const target = e.target as HTMLElement | null;
    const current = e.currentTarget as HTMLElement | null;
    if (!target?.closest || !current) {
      return false;
    }
    const interactive = target.closest('button, a, input, select, textarea, [role="button"]');
    return !!interactive && interactive !== current;
  }, []);

  const handleFramePress = useCallback(
    (e: { target: unknown; currentTarget: unknown }) => {
      if (isInteractiveChild(e)) {
        return;
      }
      openFileDialog();
    },
    [isInteractiveChild, openFileDialog],
  );

  const handleFrameKeyDown = useCallback(
    (e: { target: unknown; currentTarget: unknown; key?: string; preventDefault?: () => void }) => {
      if (e.target !== e.currentTarget) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault?.();
        openFileDialog();
      }
    },
    [openFileDialog],
  );

  const handleRemove = useCallback(
    (e?: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      setBroken(false);
      emit(null);
    },
    [emit],
  );

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (!canInteract) {
        return;
      }
      dragDepthRef.current += 1;
      setIsDragOver(true);
    },
    [canInteract],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOver(false);
      if (!canInteract) {
        return;
      }
      const file = e.dataTransfer.files?.[0];
      if (file) {
        applyFile(file);
      }
    },
    [canInteract, applyFile],
  );

  const restBorderWidth = knobProps.inputSurface.borderWidth;
  const frameBorderWidth = isDragOver && canInteract ? Math.max(restBorderWidth, 2) : restBorderWidth;
  const frameBorderColor =
    errorProp || (isDragOver && canInteract)
      ? errorProp
        ? formCommonColors.error
        : formCommonColors.text
      : formInputColors.border.base;
  const altText = typeof label === 'string' && label ? label : fieldA11y?.label || t('Selected image');
  const emptyName = typeof label === 'string' && label ? t('{{label}}: add image', { label }) : t('Add image');

  return (
    <YStack alignItems="flex-start" {...knobProps.gap}>
      <ImageFrame
        id={id}
        data-media-tile=""
        data-radius-class="R-SCALE"
        data-radius-unclamped=""
        width={imageWidth}
        height={imageHeight}
        {...knobProps.borderRadius}
        {...knobProps.inputSurface}
        borderStyle={hasPreview ? 'solid' : 'dashed'}
        borderWidth={frameBorderWidth}
        borderColor={frameBorderColor}
        backgroundColor={
          inTableCell || knobProps.outlined || hasPreview ? 'transparent' : formInputColors.background.base
        }
        elevation={inTableCell ? undefined : knobProps.elevation}
        transition={knobProps.transition}
        {...(disabled ? disabledSurface : undefined)}
        aria-required={required || undefined}
        aria-invalid={!!errorProp || undefined}
        aria-readonly={readOnly || undefined}
        aria-disabled={disabled || undefined}
        aria-describedby={describedBy}
        {...(!isWeb
          ? {
              accessibilityRole: canInteract ? 'button' : undefined,
              accessibilityLabel: fieldA11y?.label ?? (typeof label === 'string' ? label : emptyName),
              accessibilityHint: fieldA11y?.description,
              accessibilityState: { disabled: !!disabled },
            }
          : {})}
        {...(kbFrameFocus ? ensureFocusVisibleRing({ outlineOffset: -2 }) : undefined)}
        {...(canInteract
          ? ({
              role: 'button',
              tabIndex: 0,
              cursor: 'pointer',
              onFocus: () => {
                if (wasKeyboardFocus()) {
                  setKbFrameFocus(true);
                }
              },
              onBlur: () => {
                setKbFrameFocus(false);
              },
              ...(label && id ? null : { 'aria-label': emptyName }),
              onPress: handleFramePress,
              onKeyDown: handleFrameKeyDown,
              onDragEnter: handleDragEnter,
              onDragOver: handleDragOver,
              onDragLeave: handleDragLeave,
              onDrop: handleDrop,
            } as any)
          : {})}>
        {hasPreview ? (
          <Image
            src={displayUrl}
            alt={altText}
            width={imageWidth}
            height={imageHeight}
            objectFit={objectFit}
            onError={() => {
              setBroken(true);
            }}
          />
        ) : (
          <View alignItems="center" justifyContent="center" gap="$1" padding="$1">
            <ImageSquareIcon size={iconSize} color="var(--color11)" />
            {showCaption ? (
              <Text {...knobProps.body} color={formCommonColors.muted} textAlign="center" numberOfLines={2}>
                {hasValue && broken ? t('Image failed to load') : caption}
              </Text>
            ) : hasValue && broken ? (
              <Text color={formCommonColors.muted} textAlign="center" fontSize="$1">
                {t('Image failed to load')}
              </Text>
            ) : null}
          </View>
        )}

        {isWeb && (
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            tabIndex={-1}
            aria-hidden={true}
            onChange={(e) => {
              const files = e.target.files;
              e.target.value = '';
              if (!files || files.length === 0) {
                return;
              }
              applyFile(files[0]);
            }}
            style={{ display: 'none' }}
            disabled={!canInteract}
          />
        )}
      </ImageFrame>

      {showRemove && hasValue && canInteract && !inTableCell && (
        <Button
          chromeless
          size="$2"
          icon={XIcon}
          aria-label={t('Remove image')}
          onPress={() => {
            handleRemove();
          }}>
          {t('Remove')}
        </Button>
      )}
    </YStack>
  );
}

export function ImageField({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  readOnly,
  size,
  id: idProp,
  value,
  defaultValue,
  onChange: onChangeProp,
  onValueChange,
  onBlur,
  accept = 'image/*',
  maxSize,
  imageWidth = 48,
  imageHeight = 48,
  showRemove = true,
  placeholder,
  objectFit = 'cover',
  skeleton,
  compact,
}: ImageFieldProps) {
  const { resolvedForm, knobProps, disabledState, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const [validationError, setValidationError] = useState<string | undefined>();

  if (skeleton) {
    return (
      <FieldLayout id={id} label={label} size={size} knobProps={knobProps}>
        <Skeleton variant="rounded" width={imageWidth} height={imageHeight} />
      </FieldLayout>
    );
  }

  const controlProps = {
    id,
    label,
    required,
    disabled,
    readOnly,
    accept,
    maxSize,
    imageWidth,
    imageHeight,
    showRemove,
    placeholder,
    objectFit,
    knobProps,
    disabledSurface: disabled ? disabledState.surfaceKnobProps : undefined,
    onChangeProp,
    onValueChange,
    onInvalid: setValidationError,
  };

  if (!resolvedForm || !name) {
    const standaloneError = error ?? validationError;
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={standaloneError}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        disabled={disabled}>
        <ImageControl {...controlProps} currentValue={value ?? defaultValue} errorProp={standaloneError} />
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue as any} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error) ?? validationError;
        const fieldValue = field.state.value as string | File | null;
        const blurHandler = mergeFieldHandler(field, 'handleBlur', onBlur);

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
            disabled={disabled}>
            <ImageControl
              {...controlProps}
              currentValue={value !== undefined ? value : fieldValue}
              errorProp={resolvedError}
              onChange={(val) => {
                field.handleChange(val as any);
              }}
              blurHandler={blurHandler}
            />
          </FieldLayout>
        );
      }}
    </Field>
  );
}

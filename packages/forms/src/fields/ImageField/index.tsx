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
import { ensureFocusVisibleRing, ensureKeyboardModalityTracking, wasKeyboardFocus } from '@repo/theme';
import type { DisabledSurfaceProps, KnobProps } from '@repo/theme';
import type { ComponentProps, DragEvent, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { Image, Text, View, YStack, isWeb, styled } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout, useFieldA11y, useFieldDescribedBy } from '../../FieldLayout';
import type { FieldLayoutProps } from '../../FieldLayout';
import { formCommonColors, formInputColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/table-cell-context';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import type { FieldValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

const IMAGE_EXT = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/iu;
const CAPTION_MIN_EDGE = 56;

type ImageValue = string | File | null;
type ObjectFit = 'cover' | 'contain' | 'fill' | 'none';

export interface ImageFieldProps {
  name?: string;
  form?: AnyFormApi;
  validators?: FieldValidators;
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
  value?: ImageValue;
  defaultValue?: ImageValue;
  /**
   * Canonical change handler, consistent with the rest of the field family.
   * Fires in both standalone and form mode. Prefer this over `onValueChange`.
   */
  onChange?: (value: ImageValue) => void;
  /** @deprecated Use `onChange` instead. */
  onValueChange?: (value: ImageValue) => void;
  onBlur?: FieldLayoutProps['onBlur'];
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
  objectFit?: ObjectFit;
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
  currentValue: ImageValue | undefined;
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
  objectFit: ObjectFit;
  knobProps: KnobProps;
  disabledSurface?: DisabledSurfaceProps;
  onChange?: (val: ImageValue) => void;
  onChangeProp?: (val: ImageValue) => void;
  onValueChange?: (val: ImageValue) => void;
  onInvalid?: (message?: string) => void;
  blurHandler?: () => void;
}

const isImageFile = (file: File, accept: string): boolean => {
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
    return file.type === type || new RegExp(type.replace('*', '.*'), 'u').test(file.type);
  });
};

/** True when a ReactNode would actually render something. */
const hasContent = (node: ReactNode): boolean => node != null && node !== false && node !== '' && node !== 0;

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

const nonEmpty = (text: string | undefined): string | undefined => (text === '' ? undefined : text);

// oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode has no discriminant; only a string label is usable as alt/aria text
const stringLabel = (label: ReactNode): string | undefined => (typeof label === 'string' ? label : undefined);

const hasImageValue = (value: ImageValue | undefined): boolean =>
  value instanceof File || (value !== null && value !== undefined && value !== '');

const displayUrlFor = (value: ImageValue | undefined, previewUrl: string | null): string | null => {
  if (value instanceof File) {
    return previewUrl;
  }
  return value === null || value === undefined || value === '' ? null : value;
};

const describePreview = (currentValue: ImageValue | undefined, previewUrl: string | null, broken: boolean) => {
  const displayUrl = displayUrlFor(currentValue, previewUrl);
  return {
    hasValue: hasImageValue(currentValue),
    previewSrc: displayUrl !== null && displayUrl !== '' && !broken ? displayUrl : null,
  };
};

/** Empty-state caption, whether it shows, and the placeholder icon size. */
const describeCaption = (
  placeholder: string | undefined,
  hasPreview: boolean,
  imageWidth: number,
  imageHeight: number,
) => {
  const minEdge = Math.min(imageWidth, imageHeight);
  const caption = placeholder ?? t('Add image');
  return {
    caption,
    showCaption: Boolean(caption) && !hasPreview && (placeholder !== undefined || minEdge >= CAPTION_MIN_EDGE),
    iconSize: Math.max(14, Math.min(32, Math.round(minEdge * 0.28))),
  };
};

/** Accessible names: the label text when it is a string, else the field's a11y label, else a generic one. */
const describeNames = (label: ReactNode, fieldLabel: string | undefined) => {
  const labelText = stringLabel(label);
  return {
    labelText,
    altText: nonEmpty(labelText) ?? nonEmpty(fieldLabel) ?? t('Selected image'),
    emptyName: nonEmpty(labelText) === undefined ? t('Add image') : t('{{label}}: add image', { label: labelText }),
  };
};

const frameBorderColorFor = (hasError: boolean, dragActive: boolean): string => {
  if (hasError) {
    return formCommonColors.error;
  }
  return dragActive ? formCommonColors.text : formInputColors.border.base;
};

/** Object-URL preview for a File value on web, plus the broken-load flag that resets with the value. */
const useFilePreview = (currentValue: ImageValue | undefined) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the preview URL is an external object-URL resource derived from the value and must be created and revoked in an effect
    setBroken(false);
    const url = currentValue instanceof File && isWeb ? URL.createObjectURL(currentValue) : null;
    setPreviewUrl(url);
    return () => {
      if (url !== null) {
        URL.revokeObjectURL(url);
      }
    };
  }, [currentValue]);

  return { previewUrl, broken, setBroken };
};

/** Drag-over tracking for the frame; depth counting keeps child enter/leave pairs from flickering it. */
const useFrameDrop = (canInteract: boolean, onFile: (file: File) => void) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

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
      if (file !== undefined) {
        onFile(file);
      }
    },
    [canInteract, onFile],
  );

  return { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop };
};

const FramePlaceholder = ({
  iconSize,
  caption,
  showCaption,
  loadFailed,
  knobProps,
}: {
  iconSize: number;
  caption: string;
  showCaption: boolean;
  loadFailed: boolean;
  knobProps: KnobProps;
}) => {
  let captionNode: ReactNode = null;
  if (showCaption) {
    captionNode = (
      <Text
        {...knobProps.body}
        color={formCommonColors.muted}
        textAlign="center"
        numberOfLines={2}>
        {loadFailed ? t('Image failed to load') : caption}
      </Text>
    );
  } else if (loadFailed) {
    captionNode = (
      <Text
        color={formCommonColors.muted}
        textAlign="center"
        fontSize="$1">
        {t('Image failed to load')}
      </Text>
    );
  }
  return (
    <View
      alignItems="center"
      justifyContent="center"
      gap="$1"
      padding="$1">
      <ImageSquareIcon
        size={iconSize}
        color="var(--color11)"
      />
      {captionNode}
    </View>
  );
};

interface DomNode {
  closest?: (selector: string) => object | null;
}

const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]';

/** True when a press landed on a control nested in the frame (e.g. Remove), not on the frame itself. */
const isInteractiveChild = (e: { target: unknown; currentTarget: unknown }): boolean => {
  // SAFETY: on web, press events carry DOM nodes as target/currentTarget; on native they are plain instances without `closest`, which the optional chain below treats as non-interactive.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
  const { target, currentTarget } = e as { target: DomNode | null; currentTarget: unknown };
  if (!target?.closest || currentTarget == null) {
    return false;
  }
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  return interactive != null && interactive !== currentTarget;
};

interface ImageFileActionsInput {
  accept: string;
  maxSize: number | undefined;
  canInteract: boolean;
  setBroken: (broken: boolean) => void;
  onChange: ((val: ImageValue) => void) | undefined;
  onChangeProp: ((val: ImageValue) => void) | undefined;
  onValueChange: ((val: ImageValue) => void) | undefined;
  onInvalid: ((message?: string) => void) | undefined;
  blurHandler: (() => void) | undefined;
}

/** Validate/commit/clear a chosen image and the frame's open-dialog press and key handlers. */
const useImageFileActions = ({
  accept,
  maxSize,
  canInteract,
  setBroken,
  onChange,
  onChangeProp,
  onValueChange,
  onInvalid,
  blurHandler,
}: ImageFileActionsInput) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emit = useCallback(
    (next: ImageValue) => {
      onInvalid?.();
      onChange?.(next);
      onChangeProp?.(next);
      onValueChange?.(next);
      blurHandler?.();
    },
    [onChange, onChangeProp, onValueChange, onInvalid, blurHandler],
  );

  const validateFile = useCallback(
    (file: File): string | null => {
      if (maxSize !== undefined && maxSize !== 0 && file.size > maxSize) {
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
      if (invalid !== null) {
        setBroken(false);
        onInvalid?.(invalid);
        return;
      }
      setBroken(false);
      emit(file);
    },
    [validateFile, emit, onInvalid, setBroken],
  );

  const openFileDialog = useCallback(() => {
    if (!canInteract) {
      return;
    }
    fileInputRef.current?.click();
  }, [canInteract]);

  const handleFramePress = useCallback(
    (e: { target: unknown; currentTarget: unknown }) => {
      if (isInteractiveChild(e)) {
        return;
      }
      openFileDialog();
    },
    [openFileDialog],
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

  const handleRemove = useCallback(() => {
    setBroken(false);
    emit(null);
  }, [emit, setBroken]);

  return { fileInputRef, applyFile, handleFramePress, handleFrameKeyDown, handleRemove };
};

const HiddenFileInput = ({
  inputRef,
  accept,
  canInteract,
  onFile,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  accept: string;
  canInteract: boolean;
  onFile: (file: File) => void;
}) =>
  isWeb ? (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      tabIndex={-1}
      aria-hidden={true}
      onChange={(e) => {
        const { files } = e.target;
        e.target.value = '';
        if (files === null || files.length === 0) {
          return;
        }
        onFile(files[0]);
      }}
      style={{ display: 'none' }}
      disabled={!canInteract}
    />
  ) : null;

interface FrameInteractionInput {
  canInteract: boolean;
  hasVisibleLabel: boolean;
  id: string;
  emptyName: string;
  setKbFrameFocus: (focused: boolean) => void;
  onPress: (e: { target: unknown; currentTarget: unknown }) => void;
  onKeyDown: (e: { target: unknown; currentTarget: unknown; key?: string; preventDefault?: () => void }) => void;
  drop: ReturnType<typeof useFrameDrop>;
}

/** Keyboard, focus, press and drop wiring that makes the frame a button; nothing when it cannot be interacted with. */
const frameInteractionProps = ({
  canInteract,
  hasVisibleLabel,
  id,
  emptyName,
  setKbFrameFocus,
  onPress,
  onKeyDown,
  drop,
}: FrameInteractionInput) =>
  canInteract
    ? {
        role: 'button' as const,
        tabIndex: 0,
        cursor: 'pointer' as const,
        onFocus: () => {
          if (wasKeyboardFocus()) {
            setKbFrameFocus(true);
          }
        },
        onBlur: () => {
          setKbFrameFocus(false);
        },
        ...(hasVisibleLabel && id !== '' ? null : { 'aria-label': emptyName }),
        onPress,
        onKeyDown,
        onDragEnter: drop.handleDragEnter,
        onDragOver: drop.handleDragOver,
        onDragLeave: drop.handleDragLeave,
        onDrop: drop.handleDrop,
      }
    : {};

type FrameProps = ComponentProps<typeof ImageFrame>;

interface FrameSurfaceInput {
  knobProps: KnobProps;
  hasPreview: boolean;
  dragActive: boolean;
  hasError: boolean;
  inTableCell: boolean;
  disabled: boolean | undefined;
  disabledSurface: DisabledSurfaceProps | undefined;
}

/** Border, ground, elevation and disabled treatment of the frame. */
const frameSurfaceProps = ({
  knobProps,
  hasPreview,
  dragActive,
  hasError,
  inTableCell,
  disabled,
  disabledSurface,
}: FrameSurfaceInput): FrameProps => {
  const restBorderWidth = knobProps.inputSurface.borderWidth;
  const transparentGround = inTableCell || knobProps.outlined || hasPreview;
  return {
    ...knobProps.borderRadius,
    ...knobProps.inputSurface,
    borderStyle: hasPreview ? 'solid' : 'dashed',
    borderWidth: dragActive ? Math.max(restBorderWidth, 2) : restBorderWidth,
    borderColor: frameBorderColorFor(hasError, dragActive),
    backgroundColor: transparentGround ? 'transparent' : formInputColors.background.base,
    ...(inTableCell ? undefined : { elevation: knobProps.elevation }),
    transition: knobProps.transition,
    ...(disabled ? disabledSurface : undefined),
  };
};

interface NativeA11yInput {
  canInteract: boolean;
  disabled: boolean | undefined;
  nativeLabel: string;
  nativeHint: string | undefined;
}

/** The native accessibility role/label/hint/state (web carries aria-* instead). */
const nativeA11yProps = ({ canInteract, disabled, nativeLabel, nativeHint }: NativeA11yInput): FrameProps =>
  isWeb
    ? {}
    : {
        accessibilityRole: canInteract ? 'button' : undefined,
        accessibilityLabel: nativeLabel,
        accessibilityHint: nativeHint,
        accessibilityState: { disabled: !!disabled },
      };

const ImageControl = ({
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
}: ImageControlProps) => {
  const describedBy = useFieldDescribedBy();
  const fieldA11y = useFieldA11y();
  const inTableCell = useIsInTableCell();
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }
  const [kbFrameFocus, setKbFrameFocus] = useState(false);
  const canInteract = !disabled && !readOnly;
  const { previewUrl, broken, setBroken } = useFilePreview(currentValue);
  const { fileInputRef, applyFile, handleFramePress, handleFrameKeyDown, handleRemove } = useImageFileActions({
    accept,
    maxSize,
    canInteract,
    setBroken,
    onChange,
    onChangeProp,
    onValueChange,
    onInvalid,
    blurHandler,
  });
  const drop = useFrameDrop(canInteract, applyFile);

  const { hasValue, previewSrc } = describePreview(currentValue, previewUrl, broken);
  const hasPreview = previewSrc !== null;
  const { caption, showCaption, iconSize } = describeCaption(placeholder, hasPreview, imageWidth, imageHeight);
  const { labelText, altText, emptyName } = describeNames(label, fieldA11y?.label);
  const hasError = hasErrorValue(errorProp);
  const removable = hasValue && canInteract && !inTableCell;

  return (
    <YStack
      alignItems="flex-start"
      {...knobProps.gap}>
      <ImageFrame
        id={id}
        data-media-tile=""
        data-radius-class="R-SCALE"
        data-radius-unclamped=""
        width={imageWidth}
        height={imageHeight}
        {...frameSurfaceProps({
          knobProps,
          hasPreview,
          dragActive: drop.isDragOver && canInteract,
          hasError,
          inTableCell,
          disabled,
          disabledSurface,
        })}
        aria-required={required ? true : undefined}
        aria-invalid={hasError ? true : undefined}
        aria-readonly={readOnly ? true : undefined}
        aria-disabled={disabled ? true : undefined}
        aria-describedby={describedBy}
        {...nativeA11yProps({
          canInteract,
          disabled,
          nativeLabel: fieldA11y?.label ?? labelText ?? emptyName,
          nativeHint: fieldA11y?.description,
        })}
        {...(kbFrameFocus ? ensureFocusVisibleRing({ outlineOffset: -2 }) : undefined)}
        {...frameInteractionProps({
          canInteract,
          hasVisibleLabel: hasContent(label),
          id,
          emptyName,
          setKbFrameFocus,
          onPress: handleFramePress,
          onKeyDown: handleFrameKeyDown,
          drop,
        })}>
        {previewSrc === null ? (
          <FramePlaceholder
            iconSize={iconSize}
            caption={caption}
            showCaption={showCaption}
            loadFailed={hasValue && broken}
            knobProps={knobProps}
          />
        ) : (
          <Image
            src={previewSrc}
            alt={altText}
            width={imageWidth}
            height={imageHeight}
            objectFit={objectFit}
            onError={() => {
              setBroken(true);
            }}
          />
        )}

        <HiddenFileInput
          inputRef={fileInputRef}
          accept={accept}
          canInteract={canInteract}
          onFile={applyFile}
        />
      </ImageFrame>

      {showRemove && removable && (
        <Button
          chromeless
          size="$2"
          icon={XIcon}
          aria-label={t('Remove image')}
          onPress={handleRemove}>
          {t('Remove')}
        </Button>
      )}
    </YStack>
  );
};

export const ImageField = ({
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
  // oxlint-disable-next-line typescript/no-deprecated -- this field implements the deprecated onValueChange prop until it is removed
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
}: ImageFieldProps) => {
  const { resolvedForm, knobProps, disabledState, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const [validationError, setValidationError] = useState<string | undefined>();

  if (skeleton) {
    return (
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        <Skeleton
          variant="rounded"
          width={imageWidth}
          height={imageHeight}
        />
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

  if (resolvedForm === undefined || name === undefined || name === '') {
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
        <ImageControl
          {...controlProps}
          currentValue={value ?? defaultValue}
          errorProp={standaloneError}
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
        const resolvedError = getFieldError(field, error) ?? validationError;
        const fieldValue = field.state.value;
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
              currentValue={value === undefined ? fieldValue : value}
              errorProp={resolvedError}
              onChange={(val) => {
                field.handleChange(val);
              }}
              blurHandler={blurHandler}
            />
          </FieldLayout>
        );
      }}
    </Field>
  );
};

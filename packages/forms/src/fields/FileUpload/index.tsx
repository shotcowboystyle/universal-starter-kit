import { FileIcon, UploadIcon, XIcon } from '@phosphor-icons/react';
import { useTouchSurface } from '@repo/theme';
import { ensureFocusVisibleRing, ensureKeyboardModalityTracking, wasKeyboardFocus } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useProps, type SizeTokens } from 'tamagui';
import { Image, isWeb, Text, XStack, YStack, styled } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { formCommonColors, formDropzoneColors, formInputColors } from '../../shared/colorRamps';
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
import type { FieldComponentProps, Validator } from '../../types';

import type { NativePickedFile, NativePickerMode } from './filePickerTypes';
// Platform-split: the web twin is inert, the `.native` twin opens
// expo-document-picker / expo-image-picker (Geolocation map-surface pattern).
import { pickFilesNatively } from './nativeFilePicker';

/** Structured per-file transport error. */
export interface FileTransferError {
  problem: string;
  action: string;
  cta?: string;
}

export type FileUploadHandler = (
  file: File,
  ctx: { onProgress: (percent: number) => void; signal: AbortSignal },
) => Promise<void>;

type TransferStatus = 'uploading' | 'failed';

interface TransferItem {
  id: string;
  file: File;
  status: TransferStatus;
  progress: number;
  error?: FileTransferError;
  controller: AbortController;
}

export type FileUploadProps<
  TParentData = any,
  TName extends DeepKeys<TParentData> = any,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children' | 'field'> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    accept?: string;
    maxSize?: number; // in bytes
    multiple?: boolean;
    dragDrop?: boolean;
    showPreview?: boolean;
    placeholder?: string;
    buttonText?: string;
    onFileSelect?: (files: FileList | null) => void;
    onFileRemove?: (file: File) => void;
    /**
     * Transport. When set, a chosen file enters the uploading row (name,
     * size, progress, cancel) and only joins the committed list when this
     * resolves. A rejection keeps the file visible with retry + remove
     * and does not clear siblings. Omit to commit
     * immediately — there is no transport.
     */
    onUpload?: FileUploadHandler;
    /**
     * Canonical change handler, consistent with the rest of the field family.
     * Fires in both standalone and form mode. Prefer this over `onValueChange`.
     */
    onChange?: (value: TData) => void;
    /** @deprecated Use `onChange` instead. */
    onValueChange?: (value: TData) => void;
    /**
     * Which native picker the field opens (no effect on web, which always
     * uses `<input type="file">`). `auto` sends an image-only `accept` to the
     * photo library and everything else to the document browser.
     * @default "auto"
     */
    pickerMode?: NativePickerMode;
    /** When true, renders a skeleton placeholder instead of the file upload */
    skeleton?: boolean;
    /** When true, applies compact density (tighter layout gaps; control size unchanged) */
    compact?: boolean;
    /**
     * Extra controls in the CTA row (Attach "From Library"). The dropzone
     * stays the OS-picker target; these are the carve-out children.
     */
    actions?: ReactNode;
  };

const UploadAreaFrame = styled(YStack, {
  width: '100%',
  position: 'relative',
  overflow: 'hidden',
  borderStyle: 'dashed',
  // BENTO-DERIVED: the zone ground
  // is TRANSPARENT — the page shows through and the dashed edge is the whole
  // control. Only the disabled wash paints the ground at rest; the
  // hover/drag $color4 flood is a held mpo state, not a ground.
  backgroundColor: 'transparent',
  // The dash is the legible $color9 step (boards media-01..04: 1px dashed
  // rgb(77,77,77) light / rgb(133,133,133) dark) — formInputColors.border.base
  // ($borderColor) measured near-invisible as a dashed edge.
  borderColor: formDropzoneColors.border,
  // Kill UA :focus-visible on the dropzone. House ring is painted
  // only on keyboard-origin focus via wasKeyboardFocus() below — never the
  // 1px browser outline (forms-fileupload--standalone audit Cluster C).
  outlineWidth: 0,
  outlineStyle: 'none' as any,
  focusStyle: { outlineWidth: 0, outlineStyle: 'none' as any },
  focusVisibleStyle: { outlineWidth: 0, outlineStyle: 'none' as any },
});

/**
 * The house ring, applied so it survives the frame's own focus-visible kill.
 *
 * The kill above is what suppresses the 1px UA outline on a POINTER focus,
 * and it has to stay. But it is a `:focus-visible` rule, and a keyboard-origin
 * focus matches `:focus-visible` too — so spreading the ring as base props
 * only loses on specificity and the zone paints no ring at all. Restating the
 * same fragment in `focusStyle`/`focusVisibleStyle` beats the kill in exactly
 * the state that should carry a ring, and leaves pointer focus alone (the
 * caller only spreads this while `kbZoneFocus` is true).
 */
function withZoneFocusRing() {
  const ring = ensureFocusVisibleRing({ outlineOffset: 0 });
  return { ...ring, focusStyle: ring, focusVisibleStyle: ring };
}

const DropOverlayFrame = styled(YStack, {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  zIndex: 2,
  backgroundColor: formInputColors.background.focus,
  borderStyle: 'solid',
  borderColor: formInputColors.border.focus,
});

// Bento: picked files live IN the zone, parted by the SAME dashed hairline
// as the frame edge — the solid 1px $color8 divider was the pre-Bento
// residue (bento-pickers-measured.md §5).
const UploadFileListFrame = styled(YStack, {
  width: '100%',
  borderTopWidth: 1,
  // A side with a declared style and no declared width is NOT a side with no
  // border: it takes the CSS initial `medium` (3px) in `currentColor`, which
  // boxed the picked files in a heavy $color12 dash.
  borderBottomWidth: 0,
  borderLeftWidth: 0,
  borderRightWidth: 0,
  borderStyle: 'dashed',
  borderTopColor: formDropzoneColors.border,
});

// BENTO-DERIVED (Image Picker): picked IMAGES populate a tile grid, not the
// file-row list — each tile is the thumb itself with the remove disc riding
// its top-right corner. Non-image picks and in-flight transfers keep the row.
const UploadTileGridFrame = styled(XStack, {
  width: '100%',
  flexWrap: 'wrap',
});

export function FileUpload<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: FileUploadProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const hydrationTouch = useTouchSurface();
  const {
    defaultValue,
    form,
    accept,
    maxSize,
    multiple = false,
    dragDrop = true,
    showPreview = true,
    // Bento caption on web; native has nothing to drag so the same slot is the tap hint.
    placeholder = isWeb ? t('Drag a file into this area') : t('or tap to browse'),
    buttonText = t('Choose File'),
    onFileSelect,
    onFileRemove,
    onUpload,
    onChange: onChangeProp,
    onValueChange: onValueChangeProp,
    pickerMode = 'auto',
    mode,
    name,
    preserveValue,
    validators,
    disabled,
    readOnly,
    skeleton,
    compact,
    actions,
    id: idProp,
    ...fieldProps
  } = useProps(props);

  const { resolvedForm, knobProps, disabledState, id } = useFormField({
    form,
    id: idProp,
    compact,
  });
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const [kbZoneFocus, setKbZoneFocus] = useState(false);
  // Canonical `onChange` and the alias `onValueChange` both fire once per
  // change through the internal handler chain (same reconciliation as Switch).
  const emitChange = useCallback(
    (nextValue: TData) => {
      onChangeProp?.(nextValue);
      onValueChangeProp?.(nextValue);
    },
    [onChangeProp, onValueChangeProp],
  );
  const resolvedValidators = useResolvedValidators(fieldProps.required, validators, fieldProps.label, name);
  // Intentional: extract raw radius token to pass to clampRadiusForLargeComponent utility function.
  // The utility needs the token string (e.g. "$4") to clamp it, not a fragment.
  const cappedRadius = clampRadiusForLargeComponent(knobProps.borderRadius.borderRadius);
  // Intentional: extract the nested-chrome step (32 at medium) for the row
  // thumb/glyph boxes — in-zone previews are nested chrome, not press
  // targets, so they take the px without the fragment's hitSlop. Compact
  // is a space-only dial, so the old `compact ? 24 : 32` size fork drops.
  const rowMediaPx = knobProps.nestedControl.px;
  // Intentional: extract the recipe icon step (16 at the 44 control) for the
  // row file glyph — same held "icon 16" exception the CTA carries.
  const rowGlyphSize = knobProps.controlIcon.width;
  // Intentional: the image TILE edge is two control steps (88 at medium) —
  // the same getFieldHeight ladder the 220 frame floor sits on, so tile and
  // frame move together per size. The corner remove disc hangs a quarter of
  // its own nestedControl step (8 at medium) outside the tile's top-right,
  // which is the Bento Image Picker overlap read under the house tokens.
  const tilePx = getFieldHeight(knobProps.sizeToken as SizeTokens, 2, hydrationTouch);
  const tileRemoveInset = -Math.round(knobProps.nestedControl.px / 4);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoneCleanupRef = useRef<(() => void) | null>(null);
  const lastZoneInputWasKeyboardRef = useRef(false);
  const previewUrlsRef = useRef(new Map<File, string>());
  const transferSeqRef = useRef(0);
  const transfersRef = useRef<TransferItem[]>([]);
  const onUploadRef = useRef(onUpload);
  onUploadRef.current = onUpload;
  const emitFieldRef = useRef<((nextValue: TData) => void) | undefined>(undefined);
  const multipleRef = useRef(multiple);
  multipleRef.current = multiple;

  const setTransfersAndRef = useCallback((updater: (prev: TransferItem[]) => TransferItem[]) => {
    setTransfers((prev) => {
      const next = updater(prev);
      transfersRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isWeb) {
      return;
    }
    ensureKeyboardModalityTracking();
    const onKey = () => {
      lastZoneInputWasKeyboardRef.current = true;
    };
    const onPointer = () => {
      lastZoneInputWasKeyboardRef.current = false;
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      previewUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      previewUrlsRef.current.clear();
      transfersRef.current.forEach((item) => {
        item.controller.abort();
      });
      zoneCleanupRef.current?.();
      zoneCleanupRef.current = null;
    };
  }, []);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) {
      return t('0 Bytes');
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${t(sizes[i])}`;
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (maxSize && file.size > maxSize) {
        return t('File size must be less than {{size}}', { size: formatFileSize(maxSize) });
      }
      if (accept) {
        const acceptedTypes = accept.split(',').map((type) => type.trim());
        const isAccepted = acceptedTypes.some((type) => {
          if (type.startsWith('.')) {
            return file.name.toLowerCase().endsWith(type.toLowerCase());
          }
          return file.type.match(type.replace('*', '.*'));
        });
        if (!isAccepted) {
          return t('File type not accepted. Accepted types: {{types}}', { types: accept });
        }
      }
      return null;
    },
    [maxSize, accept, formatFileSize],
  );

  const syncFieldValue = useCallback(
    (nextFiles: File[], onValueChange?: (nextValue: TData) => void) => {
      if (!onValueChange) {
        return;
      }
      if (multiple) {
        onValueChange(nextFiles as TData);
        return;
      }
      onValueChange((nextFiles[0] ?? null) as TData);
    },
    [multiple],
  );

  const runTransfer = useCallback(
    async (id: string, file: File, controller: AbortController) => {
      const upload = onUploadRef.current;
      if (!upload) {
        return;
      }
      try {
        await upload(file, {
          onProgress: (percent) => {
            const n = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
            setTransfersAndRef((prev) => prev.map((item) => (item.id === id ? { ...item, progress: n } : item)));
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        setTransfersAndRef((prev) => prev.filter((item) => item.id !== id));
        setSelectedFiles((prev) => {
          const nextFiles = multipleRef.current ? [...prev, file] : [file];
          syncFieldValue(nextFiles, emitFieldRef.current);
          return nextFiles;
        });
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          setTransfersAndRef((prev) => prev.filter((item) => item.id !== id));
          return;
        }
        const problem = err instanceof Error && err.message ? err.message : t('Upload failed');
        setTransfersAndRef((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'failed' as const,
                  error: {
                    problem,
                    action: t('Try again or remove the file'),
                    cta: t('Retry'),
                  },
                }
              : item,
          ),
        );
      }
    },
    [setTransfersAndRef, syncFieldValue],
  );

  const startTransfer = useCallback(
    (file: File) => {
      if (!multipleRef.current) {
        transfersRef.current.forEach((item) => {
          item.controller.abort();
        });
        setTransfersAndRef(() => []);
      }
      const id = `xfer-${++transferSeqRef.current}`;
      const controller = new AbortController();
      const item: TransferItem = {
        id,
        file,
        status: 'uploading',
        progress: 0,
        controller,
      };
      setTransfersAndRef((prev) => [...prev, item]);
      void runTransfer(id, file, controller);
    },
    [runTransfer, setTransfersAndRef],
  );

  const handleCancelTransfer = useCallback(
    (id: string) => {
      const item = transfersRef.current.find((row) => row.id === id);
      item?.controller.abort();
      setTransfersAndRef((prev) => prev.filter((row) => row.id !== id));
    },
    [setTransfersAndRef],
  );

  const handleRetryTransfer = useCallback(
    (id: string) => {
      const item = transfersRef.current.find((row) => row.id === id);
      if (!item) {
        return;
      }
      item.controller.abort();
      const controller = new AbortController();
      setTransfersAndRef((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, status: 'uploading', progress: 0, error: undefined, controller } : row,
        ),
      );
      void runTransfer(id, item.file, controller);
    },
    [runTransfer, setTransfersAndRef],
  );

  const handleRemoveTransfer = useCallback(
    (id: string) => {
      const item = transfersRef.current.find((row) => row.id === id);
      item?.controller.abort();
      if (isWeb && item) {
        const previewUrl = previewUrlsRef.current.get(item.file);
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrlsRef.current.delete(item.file);
        }
      }
      setTransfersAndRef((prev) => prev.filter((row) => row.id !== id));
    },
    [setTransfersAndRef],
  );

  const handleFileSelect = useCallback(
    (files: FileList | File[] | null, onValueChange?: (nextValue: TData) => void, rawFileList?: FileList | null) => {
      if (!files) {
        return;
      }

      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const validFiles: File[] = [];
      const errors: string[] = [];

      fileArray.forEach((file) => {
        const error = validateFile(file);
        if (error) {
          errors.push(`${file.name}: ${error}`);
        } else {
          validFiles.push(file);
        }
      });

      // Surface every rejected file (even when other files passed); clear only on a fully valid selection
      setValidationError(errors.length > 0 ? errors.join('\n') : undefined);

      if (validFiles.length > 0) {
        emitFieldRef.current = onValueChange;
        if (onUploadRef.current) {
          validFiles.forEach((file) => {
            startTransfer(file);
          });
        } else {
          setSelectedFiles((prev) => {
            const nextFiles = multiple ? [...prev, ...validFiles] : validFiles.slice(0, 1);
            syncFieldValue(nextFiles, onValueChange);
            return nextFiles;
          });
        }
        onFileSelect?.(rawFileList ?? (Array.isArray(files) ? null : files));
      }
    },
    [multiple, validateFile, onFileSelect, syncFieldValue, startTransfer],
  );

  const handleFileRemove = useCallback(
    (fileToRemove: File, onValueChange?: (nextValue: TData) => void) => {
      if (isWeb) {
        const previewUrl = previewUrlsRef.current.get(fileToRemove);
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrlsRef.current.delete(fileToRemove);
        }
      }

      setSelectedFiles((prev) => {
        const nextFiles = prev.filter((file) => file !== fileToRemove);
        syncFieldValue(nextFiles, onValueChange);
        return nextFiles;
      });

      onFileRemove?.(fileToRemove);
    },
    [onFileRemove, syncFieldValue],
  );

  // Depth counter so dragenter/dragleave pairs from nested children don't cancel the highlight
  const dragDepthRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (dragDrop) {
        dragDepthRef.current += 1;
        setIsDragOver(true);
      }
    },
    [dragDrop],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (dragDrop) {
        setIsDragOver(true);
      }
    },
    [dragDrop],
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent, onValueChange?: (nextValue: TData) => void) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOver(false);
      if (dragDrop && e.dataTransfer.files) {
        handleFileSelect(e.dataTransfer.files, onValueChange, e.dataTransfer.files);
      }
    },
    [dragDrop, handleFileSelect],
  );

  const openFileDialog = useCallback(() => {
    if (disabled || readOnly) {
      return;
    }
    fileInputRef.current?.click();
  }, [disabled, readOnly]);

  // Native has no <input type="file">. The same press opens the OS picker and
  // routes its result through the identical validate → setState → field path,
  // so `accept`, `maxSize`, `multiple` and the removal list behave as on web.
  const nativePickInFlightRef = useRef(false);
  const openNativePicker = useCallback(
    async (onValueChange?: (nextValue: TData) => void, onBlurHandler?: () => void) => {
      if (disabled || readOnly || nativePickInFlightRef.current) {
        return;
      }
      nativePickInFlightRef.current = true;
      try {
        const outcome = await pickFilesNatively({ accept, multiple, mode: pickerMode });
        if (outcome.unavailable) {
          setValidationError(t('No file picker is available on this device.'));
          return;
        }
        if (outcome.denied) {
          setValidationError(t('Permission to open your photo library was denied.'));
          return;
        }
        // A dismissed picker is not an interaction: leave the value, the error
        // and the touched state exactly as they were (web cancels the same way).
        if (outcome.canceled || outcome.files.length === 0) {
          return;
        }
        // The picked shape is `{ uri, name, type, size }` — what React Native's
        // FormData accepts for a multipart upload — not a DOM File. Everything
        // downstream reads name/size/type only, so this cast is the whole bridge.
        handleFileSelect(outcome.files as unknown as File[], onValueChange);
        onBlurHandler?.();
      } finally {
        nativePickInFlightRef.current = false;
      }
    },
    [accept, disabled, handleFileSelect, multiple, pickerMode, readOnly],
  );

  // DROPZONE-FULL-TARGET: the whole dropzone surface opens the file chooser.
  // Interactive children (Choose File button, per-file remove buttons, links)
  // handle their own press and are excluded here so remove never opens the chooser.
  const isInteractiveChild = useCallback((e: { target: unknown; currentTarget: unknown }) => {
    const target = e.target as HTMLElement | null;
    const current = e.currentTarget as HTMLElement | null;
    if (!target?.closest || !current) {
      return false;
    }
    const interactive = target.closest('button, a, input, select, textarea, [role="button"]');
    return !!interactive && interactive !== current;
  }, []);

  const handleZoneClick = useCallback(
    (e: { target: unknown; currentTarget: unknown }) => {
      if (isInteractiveChild(e)) {
        return;
      }
      openFileDialog();
    },
    [isInteractiveChild, openFileDialog],
  );

  const handleZoneKeyDown = useCallback(
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

  const paintZoneRing = useCallback(() => {
    if (lastZoneInputWasKeyboardRef.current || wasKeyboardFocus()) {
      setKbZoneFocus(true);
    }
  }, []);

  const bindZoneNode = useCallback(
    (node: HTMLElement | null) => {
      zoneCleanupRef.current?.();
      zoneCleanupRef.current = null;
      if (!node || !isWeb) {
        return;
      }
      const onFocus = () => {
        paintZoneRing();
      };
      const onBlur = () => {
        setKbZoneFocus(false);
      };
      node.addEventListener('focus', onFocus);
      node.addEventListener('blur', onBlur);
      zoneCleanupRef.current = () => {
        node.removeEventListener('focus', onFocus);
        node.removeEventListener('blur', onBlur);
      };
    },
    [paintZoneRing],
  );

  const handleZoneFocus = paintZoneRing;

  const handleZoneBlur = useCallback(() => {
    setKbZoneFocus(false);
  }, []);

  const getFilePreview = useCallback((file: File) => {
    if (!isWeb) {
      // Native picks carry a device URI instead of a blob; tamagui's Image
      // takes it through the same `src` prop the web preview uses.
      const uri = (file as Partial<NativePickedFile>).uri;
      return uri && file.type?.startsWith('image/') ? uri : null;
    }
    if (file.type.startsWith('image/')) {
      const existingUrl = previewUrlsRef.current.get(file);
      if (existingUrl) {
        return existingUrl;
      }
      const nextUrl = URL.createObjectURL(file);
      previewUrlsRef.current.set(file, nextUrl);
      return nextUrl;
    }
    return null;
  }, []);

  // Render skeleton placeholder
  if (skeleton) {
    const minHeightPx = getFieldHeight((fieldProps.size || knobProps.sizeToken) as SizeTokens, 5, hydrationTouch);
    return (
      <FieldLayout id={id} label={fieldProps.label} size={fieldProps.size} knobProps={knobProps}>
        <Skeleton variant="rounded" width="100%" height={minHeightPx} />
      </FieldLayout>
    );
  }

  const canInteract = !disabled && !readOnly;
  const hasRows = selectedFiles.length > 0 || transfers.length > 0;

  const renderRemoveDisc = (ariaLabel: string, onPress: () => void) =>
    canInteract ? (
      <Button
        // Bento remove: a filled $color12 disc with the inverse
        // ✕ — painted at nestedControl (32) with hitSlop
        // restoring the 44 floor via `nested` (held exception);
        // the nested icon step lands the board's 14px ✕.
        nested
        circular
        icon={XIcon}
        aria-label={ariaLabel}
        backgroundColor={formDropzoneColors.removeDisc.background.base}
        color={formDropzoneColors.removeDisc.ink}
        hoverStyle={{
          backgroundColor: formDropzoneColors.removeDisc.background.hover,
        }}
        pressStyle={{
          backgroundColor: formDropzoneColors.removeDisc.background.press,
        }}
        onPress={(e) => {
          e.stopPropagation();
          onPress();
        }}
      />
    ) : null;

  const renderFileMeta = (file: File, preview: string | null, extra?: ReactNode) => (
    <XStack flex={1} gap="$2" alignItems="center">
      {preview ? (
        <Image
          borderRadius={cappedRadius}
          // src (string), not source: the RN source object leaks
          // onto the DOM <img> as source="[object Object]" on web
          src={preview}
          alt={file.name}
          width={rowMediaPx}
          height={rowMediaPx}
          objectFit="cover"
        />
      ) : (
        <XStack width={rowMediaPx} height={rowMediaPx} justifyContent="center" alignItems="center">
          <FileIcon size={rowGlyphSize} />
        </XStack>
      )}
      <YStack flex={1} gap="$1">
        <Text numberOfLines={1} {...knobProps.body}>
          {file.name}
        </Text>
        {/* Bento (bento-pickers-measured.md §2): the size is a
            SECOND LINE, BOLD, one type step down (the label
            tier — 13/24 at medium). The 700 is the Bento
            treatment, a deliberate eject over the weight knob. */}
        <Text numberOfLines={1} color={formCommonColors.text} {...knobProps.label} fontWeight="700">
          {formatFileSize(file.size)}
        </Text>
        {extra}
      </YStack>
    </XStack>
  );

  const renderImageTile = (file: File, preview: string, onValueChange?: (nextValue: TData) => void) => (
    <YStack
      key={`${file.name}-${file.size}-${file.lastModified}`}
      data-file-upload="tile"
      position="relative"
      width={tilePx}
      height={tilePx}>
      <Image
        borderRadius={cappedRadius}
        // src (string), not source: the RN source object leaks
        // onto the DOM <img> as source="[object Object]" on web
        src={preview}
        alt={file.name}
        width={tilePx}
        height={tilePx}
        objectFit="cover"
      />
      {canInteract ? (
        <YStack
          data-file-upload="tile-remove"
          position="absolute"
          top={tileRemoveInset}
          right={tileRemoveInset}
          zIndex={1}>
          {renderRemoveDisc(t('Remove {{name}}', { name: file.name }), () => {
            handleFileRemove(file, onValueChange);
          })}
        </YStack>
      ) : null}
    </YStack>
  );

  const renderUploadArea = (
    errorProp?: string | boolean,
    onValueChange?: (nextValue: TData) => void,
    onBlurHandler?: () => void,
  ) => {
    emitFieldRef.current = onValueChange;
    // The press that opens a picker: the hidden <input> on web, the OS sheet
    // on native. Both land in the same handleFileSelect pipeline.
    const requestFiles = isWeb
      ? openFileDialog
      : () => {
          void openNativePicker(onValueChange, onBlurHandler);
        };

    // Drag-and-drop, keyboard activation and the focus ring are DOM concerns;
    // native gets a plain press target on the same surface instead.
    const zoneInteractionProps = canInteract
      ? isWeb
        ? ({
            // DROPZONE-FULL-TARGET: the entire surface is the click target.
            role: 'button',
            tabIndex: 0,
            onFocus: handleZoneFocus,
            onBlur: handleZoneBlur,
            cursor: 'pointer',
            onClick: handleZoneClick,
            onKeyDown: handleZoneKeyDown,
            ...(dragDrop
              ? {
                  onDragEnter: handleDragEnter,
                  onDragOver: handleDragOver,
                  onDragLeave: handleDragLeave,
                  onDrop: (e: DragEvent) => {
                    handleDrop(e, onValueChange);
                    onBlurHandler?.();
                  },
                }
              : null),
          } as any)
        : ({ role: 'button', onPress: requestFiles } as any)
      : { cursor: disabled ? 'not-allowed' : undefined };

    // Committed image picks become tiles; everything else stays a row.
    const imageTiles: { file: File; preview: string }[] = [];
    const fileRows: { file: File; preview: string | null; index: number }[] = [];
    selectedFiles.forEach((file, index) => {
      const preview = showPreview ? getFilePreview(file) : null;
      if (preview) {
        imageTiles.push({ file, preview });
      } else {
        fileRows.push({ file, preview, index });
      }
    });

    return (
      <UploadAreaFrame
        // The dropzone is this field's control: it carries the FieldLayout id
        // so the rendered `<label htmlFor>` resolves (family pattern — see
        // Barcode / ColorPicker for other non-native-input controls).
        id={id}
        ref={bindZoneNode as any}
        data-file-upload="dropzone"
        data-drag-over={isDragOver && canInteract && dragDrop ? 'true' : undefined}
        data-kb-ring={kbZoneFocus ? 'true' : undefined}
        // No `outlined` here: UploadAreaFrame declares no such variant, so the
        // prop styled nothing and went straight to the DOM host ("Received
        // `false` for a non-boolean attribute"). The zone's ground is
        // TRANSPARENT by contract (see the frame), which is what an outlined
        // treatment would have asked for anyway.
        // Text-bearing chrome — surface wash, not an opacity dim
        // (a dim here stacks with the inner Button's treatment). This is the
        // ONLY treatment that paints the transparent zone ground at rest.
        {...(disabled ? disabledState.surfaceKnobProps : undefined)}
        borderRadius={cappedRadius}
        // Keep width stable on drag (Polaris overlay, not a 1→2 layout shift).
        borderWidth={knobProps.borderRadius.borderWidth ?? 1}
        {...(errorProp ? { borderColor: formCommonColors.error } : undefined)}
        elevation={knobProps.elevation}
        transition={knobProps.transition}
        // CONTRACT (boards media-01..03): the getFieldHeight floor sits on
        // the FRAME, so the frame border-box measures 220 — hanging it on
        // the inner stack painted 222, a number no token expresses.
        minHeight={getFieldHeight((fieldProps.size || knobProps.sizeToken) as SizeTokens, 5, hydrationTouch)}
        aria-required={fieldProps.required || undefined}
        aria-invalid={!!errorProp || undefined}
        aria-readonly={readOnly || undefined}
        aria-disabled={disabled || undefined}
        // One family ring rule (boards media-01 dz-ring): 2px $outlineColor at
        // offset 0. The old -2 inset was the F1 defect — an element's own
        // outline is never clipped by its own overflow:hidden.
        //
        // The ring must ALSO be spread into focusStyle/focusVisibleStyle. The
        // base props alone lose: the frame's ring kill is a :focus-visible
        // rule, the browser matches :focus-visible on a keyboard-origin focus,
        // and a pseudo-class rule outranks the plain-class atom — the zone
        // carried `_outlineWidth-2px` AND `_outlineWidth-0focus-visible-0px`
        // and computed outline-width 0px. Measured on the harness, not read off
        // the source: the pre-fix spec asserted the atom's PRESENCE, which was
        // true while nothing painted.
        {...(kbZoneFocus ? withZoneFocusRing() : undefined)}
        hoverStyle={
          canInteract
            ? {
                borderColor: errorProp ? formCommonColors.error : formInputColors.border.hover,
                // Held exception: the measured mpo $color4 hover flood stays
                // (Bento's hover/drag states were not measurable headlessly).
                backgroundColor: formInputColors.background.focus,
              }
            : undefined
        }
        {...zoneInteractionProps}
        {...(canInteract
          ? // Labeled fields get aria-labelledby auto-wired by the FieldLayout
            // Label (tamagui Label htmlFor → this id); the aria-label fallback
            // covers label-less usage, and is what a screen reader announces
            // for the native press target too.
            fieldProps.label && id
            ? null
            : {
                'aria-label':
                  typeof fieldProps.label === 'string'
                    ? t('{{label}}: choose file', { label: fieldProps.label })
                    : t('Choose file'),
              }
          : null)}>
        {isDragOver && canInteract && dragDrop ? (
          <DropOverlayFrame
            data-file-upload="overlay"
            borderRadius={cappedRadius}
            borderWidth={knobProps.borderRadius.borderWidth ?? 1}
            {...(errorProp ? { borderColor: formCommonColors.error } : undefined)}
            {...knobProps.gap}
            {...knobProps.panelPadding}>
            <XStack
              width={rowMediaPx}
              height={rowMediaPx}
              alignItems="center"
              justifyContent="center"
              // `color` tints the phosphor glyph via currentColor; Tamagui applies
              // it on web Stacks though the RN-flavored View type omits it.
              {...({ color: formCommonColors.text } as Record<string, unknown>)}>
              <UploadIcon size={rowMediaPx} aria-hidden />
            </XStack>
            <Text color={formCommonColors.text} textAlign="center" {...knobProps.body}>
              {multiple ? t('Drop files to upload') : t('Drop a file to upload')}
            </Text>
          </DropOverlayFrame>
        ) : null}

        <YStack
          {...knobProps.panelPadding}
          flexGrow={1}
          width="100%"
          alignItems="center"
          justifyContent="center"
          {...knobProps.gap}>
          <XStack alignItems="center" {...knobProps.gap}>
            <Button
              onPress={requestFiles}
              disabled={!canInteract}
              size={knobProps.sizeToken}
              tabIndex={-1}
              // BENTO-DERIVED (bento-pickers-measured.md §2/§4): NO standalone
              // glyph exists — the upload mark rides INSIDE the CTA. Held at
              // the house 44 control with the recipe's 16px icon (Bento draws
              // 14 on its own 36/$3 button — ruled exception).
              icon={UploadIcon}>
              <Button.Text {...knobProps.body}>{buttonText}</Button.Text>
            </Button>
            {actions}
          </XStack>

          {selectedFiles.length === 0 && transfers.length === 0 && (
            <Text color={formCommonColors.muted} textAlign="center" {...knobProps.body}>
              {placeholder}
            </Text>
          )}

          {isWeb ? (
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              tabIndex={-1}
              onChange={(e) => {
                handleFileSelect(e.target.files, onValueChange, e.target.files);
                onBlurHandler?.();
              }}
              style={{ display: 'none' }}
              disabled={!canInteract}
            />
          ) : null}
        </YStack>

        {hasRows && (
          <UploadFileListFrame
            data-file-upload="files"
            // The hairline tracks the frame edge's knob width — one dash voice.
            borderTopWidth={knobProps.borderRadius.borderWidth ?? 1}>
            {imageTiles.length > 0 ? (
              <UploadTileGridFrame data-file-upload="tiles" {...knobProps.gap} {...knobProps.panelPadding}>
                {imageTiles.map(({ file, preview }) => renderImageTile(file, preview, onValueChange))}
              </UploadTileGridFrame>
            ) : null}
            {fileRows.map(({ file, preview, index }) => {
              return (
                <XStack
                  key={`${file.name}-${index}`}
                  width="100%"
                  {...knobProps.gap}
                  alignItems="center"
                  justifyContent="space-between"
                  {...knobProps.panelPadding}>
                  {renderFileMeta(file, preview)}
                  {renderRemoveDisc(t('Remove {{name}}', { name: file.name }), () => {
                    handleFileRemove(file, onValueChange);
                  })}
                </XStack>
              );
            })}
            {transfers.map((item) => {
              const preview = showPreview ? getFilePreview(item.file) : null;
              const isUploading = item.status === 'uploading';
              const failed = item.status === 'failed' ? item.error : undefined;
              return (
                <XStack
                  key={item.id}
                  data-transfer-status={item.status}
                  width="100%"
                  {...knobProps.gap}
                  alignItems="center"
                  justifyContent="space-between"
                  {...knobProps.panelPadding}>
                  {renderFileMeta(
                    item.file,
                    preview,
                    <>
                      {isUploading ? (
                        <YStack
                          data-file-upload="progress"
                          role="progressbar"
                          aria-label={t('Uploading {{name}}', { name: item.file.name })}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={item.progress}
                          height={11}
                          width="100%"
                          borderRadius={1000}
                          backgroundColor={formDropzoneColors.progress.track}
                          overflow="hidden">
                          <YStack
                            height="100%"
                            width={`${item.progress}%`}
                            backgroundColor={formDropzoneColors.progress.fill}
                          />
                        </YStack>
                      ) : null}
                      {failed ? (
                        <YStack gap="$1">
                          <Text color={formCommonColors.error} {...knobProps.label}>
                            {failed.problem}
                          </Text>
                          <Text color={formCommonColors.muted} {...knobProps.label}>
                            {failed.action}
                          </Text>
                        </YStack>
                      ) : null}
                    </>,
                  )}
                  <XStack {...knobProps.gap} alignItems="center">
                    {canInteract && failed ? (
                      <Button
                        outlined
                        size="$2"
                        aria-label={t('Retry {{name}}', { name: item.file.name })}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleRetryTransfer(item.id);
                        }}>
                        {failed.cta ?? t('Retry')}
                      </Button>
                    ) : null}
                    {isUploading
                      ? renderRemoveDisc(t('Cancel {{name}}', { name: item.file.name }), () => {
                          handleCancelTransfer(item.id);
                        })
                      : renderRemoveDisc(t('Remove {{name}}', { name: item.file.name }), () => {
                          handleRemoveTransfer(item.id);
                        })}
                  </XStack>
                </XStack>
              );
            })}
          </UploadFileListFrame>
        )}
      </UploadAreaFrame>
    );
  };

  if (!resolvedForm || !name) {
    const standaloneError = fieldProps.error ?? validationError;
    return (
      <FieldLayout
        id={id}
        label={fieldProps.label}
        labelProps={fieldProps.labelProps}
        error={standaloneError}
        helperText={fieldProps.helperText}
        required={fieldProps.required}
        size={fieldProps.size}
        knobProps={knobProps}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        {renderUploadArea(standaloneError, emitChange)}
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
        const error = getFieldError(field, fieldProps.error) ?? validationError;

        return (
          <FieldLayout
            id={id}
            label={fieldProps.label}
            labelProps={fieldProps.labelProps}
            error={error}
            helperText={fieldProps.helperText}
            required={fieldProps.required}
            size={fieldProps.size}
            knobProps={knobProps}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}>
            {renderUploadArea(
              error,
              (nextValue) => {
                field.handleChange(nextValue as any);
                // Form mode also notifies user callbacks (family norm).
                emitChange(nextValue);
              },
              mergeFieldHandler(field, 'handleBlur', fieldProps.onBlur),
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
}

/**
 * The value shape a native pick binds. `{ uri, name, type, size }` is what
 * React Native's FormData accepts for a multipart upload, so a form value can
 * be posted straight through; on web the value stays a DOM `File`.
 */
export type { NativePickedFile, NativePickerMode } from './filePickerTypes';

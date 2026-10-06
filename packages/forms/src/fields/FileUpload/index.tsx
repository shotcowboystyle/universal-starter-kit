import { FileIcon, UploadIcon, XIcon } from '@phosphor-icons/react';
import { useTouchSurface, ensureFocusVisibleRing, ensureKeyboardModalityTracking, wasKeyboardFocus } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { useProps, Image, isWeb, Text, XStack, YStack, styled } from 'tamagui';
import type { SizeTokens, TamaguiElement } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout } from '../../FieldLayout';
import type { FormFieldProps } from '../../FieldLayout';
import { formCommonColors, formDropzoneColors, formInputColors } from '../../shared/color-ramps';
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

import type { NativePickedFile, NativePickerMode } from './file-picker-types';
// Platform-split: the web twin is inert, the `.native` twin opens
// expo-document-picker / expo-image-picker (Geolocation map-surface pattern).
import { pickFilesNatively } from './native-file-picker';

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
  error?: FileTransferError | null;
  controller: AbortController;
}

export type FileUploadProps<
  TParentData = unknown,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children' | 'field'> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    accept?: string;
    /** In bytes. */
    maxSize?: number;
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

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: web-only CSS value; RN's style type omits 'none' but react-native-web forwards it to the DOM.
const noOutlineStyle = 'none' as ViewStyle['outlineStyle'];

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
  outlineStyle: noOutlineStyle,
  focusStyle: { outlineWidth: 0, outlineStyle: noOutlineStyle },
  focusVisibleStyle: { outlineWidth: 0, outlineStyle: noOutlineStyle },
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
const withZoneFocusRing = () => {
  const ring = ensureFocusVisibleRing({ outlineOffset: 0 });
  return { ...ring, focusStyle: ring, focusVisibleStyle: ring };
};

const overlayGlyphColor = { color: formCommonColors.text };

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

// Native owns no listeners or object URLs, so its effect cleanup has nothing to release.
const noopCleanup = () => {
  // intentionally empty
};

/** Holds `flag` true for the duration of `task`, releasing it even when `task` throws. */
const holdFlag = async (flag: { current: boolean }, task: () => Promise<void>): Promise<void> => {
  flag.current = true;
  try {
    await task();
  } finally {
    flag.current = false;
  }
};

// `errorProp` is a message or a bare flag; '' / false / undefined mean no error.
const isErrorShown = (errorProp?: string | boolean): boolean =>
  errorProp !== undefined && errorProp !== false && errorProp !== '';

const getErrorBorder = (hasError: boolean) => (hasError ? { borderColor: formCommonColors.error } : undefined);

const getHoverStyle = (canInteract: boolean, hasError: boolean) =>
  canInteract
    ? {
        borderColor: hasError ? formCommonColors.error : formInputColors.border.hover,
        // Held exception: the measured mpo $color4 hover flood stays
        // (Bento's hover/drag states were not measurable headlessly).
        backgroundColor: formInputColors.background.focus,
      }
    : undefined;

const removeLabel = (fileName: string): string => t('Remove {{name}}', { name: fileName });

export const FileUpload = <
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(
  props: FileUploadProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
) => {
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
    // oxlint-disable-next-line typescript/no-deprecated -- `onValueChange` is a supported alias that must keep firing alongside `onChange`
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
  // SAFETY: knobProps.sizeToken is always one of the size tokens the field-height ladder is keyed by.
  const knobSizeToken = knobProps.sizeToken as SizeTokens;
  const tilePx = getFieldHeight(knobSizeToken, 2, hydrationTouch);
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
  const emitFieldRef = useRef<((nextValue: TData) => void) | null>(null);
  const multipleRef = useRef(multiple);
  useEffect(() => {
    onUploadRef.current = onUpload;
    multipleRef.current = multiple;
  }, [onUpload, multiple]);

  const setTransfersAndRef = useCallback((updater: (prev: TransferItem[]) => TransferItem[]) => {
    setTransfers((prev) => {
      const next = updater(prev);
      transfersRef.current = next;
      return next;
    });
  }, []);

  const releasePreviewUrls = useCallback(() => {
    for (const url of previewUrlsRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    previewUrlsRef.current.clear();
  }, []);

  const abortAllTransfers = useCallback(() => {
    for (const item of transfersRef.current) {
      item.controller.abort();
    }
  }, []);

  const releaseZoneListeners = useCallback(() => {
    zoneCleanupRef.current?.();
    zoneCleanupRef.current = null;
  }, []);

  useEffect(() => {
    if (!isWeb) {
      return noopCleanup;
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
      releasePreviewUrls();
      abortAllTransfers();
      releaseZoneListeners();
    };
  }, [releasePreviewUrls, abortAllTransfers, releaseZoneListeners]);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) {
      return t('0 Bytes');
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number((bytes / k ** i).toFixed(2))} ${t(sizes[i])}`;
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (maxSize !== undefined && maxSize !== 0 && file.size > maxSize) {
        return t('File size must be less than {{size}}', { size: formatFileSize(maxSize) });
      }
      if (accept !== undefined && accept !== '') {
        const acceptedTypes = accept.split(',').map((type) => type.trim());
        const isAccepted = acceptedTypes.some((type) => {
          if (type.startsWith('.')) {
            return file.name.toLowerCase().endsWith(type.toLowerCase());
          }
          return new RegExp(type.replace('*', '.*'), 'u').test(file.type);
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
    (nextFiles: File[], onValueChange?: ((nextValue: TData) => void) | null) => {
      if (onValueChange == null) {
        return;
      }
      // SAFETY: the bound field value is File[] in multiple mode and File | null otherwise.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TData is the caller's field value type; File shapes cannot be expressed against a generic DeepValue
      onValueChange((multiple ? nextFiles : (nextFiles[0] ?? null)) as TData);
    },
    [multiple],
  );

  const removeTransferRow = useCallback(
    (transferId: string) => {
      setTransfersAndRef((prev) => prev.filter((item) => item.id !== transferId));
    },
    [setTransfersAndRef],
  );

  const patchTransferRow = useCallback(
    (transferId: string, patch: Partial<TransferItem>) => {
      setTransfersAndRef((prev) => prev.map((item) => (item.id === transferId ? { ...item, ...patch } : item)));
    },
    [setTransfersAndRef],
  );

  const runTransfer = useCallback(
    async (transferId: string, file: File, controller: AbortController) => {
      const upload = onUploadRef.current;
      if (!upload) {
        return;
      }
      try {
        await upload(file, {
          onProgress: (percent) => {
            patchTransferRow(transferId, { progress: Math.min(100, Math.max(0, Math.round(percent || 0))) });
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        removeTransferRow(transferId);
        setSelectedFiles((prev) => {
          const nextFiles = multipleRef.current ? [...prev, file] : [file];
          syncFieldValue(nextFiles, emitFieldRef.current);
          return nextFiles;
        });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          removeTransferRow(transferId);
          return;
        }
        const problem = error instanceof Error && error.message !== '' ? error.message : t('Upload failed');
        patchTransferRow(transferId, {
          status: 'failed',
          error: {
            problem,
            action: t('Try again or remove the file'),
            cta: t('Retry'),
          },
        });
      }
    },
    [patchTransferRow, removeTransferRow, syncFieldValue],
  );

  const startTransfer = useCallback(
    (file: File) => {
      if (!multipleRef.current) {
        abortAllTransfers();
        setTransfersAndRef(() => []);
      }
      transferSeqRef.current += 1;
      const transferId = `xfer-${transferSeqRef.current}`;
      const controller = new AbortController();
      const item: TransferItem = {
        id: transferId,
        file,
        status: 'uploading',
        progress: 0,
        controller,
      };
      setTransfersAndRef((prev) => [...prev, item]);
      void runTransfer(transferId, file, controller);
    },
    [abortAllTransfers, runTransfer, setTransfersAndRef],
  );

  const handleCancelTransfer = useCallback(
    (transferId: string) => {
      const item = transfersRef.current.find((row) => row.id === transferId);
      item?.controller.abort();
      removeTransferRow(transferId);
    },
    [removeTransferRow],
  );

  const handleRetryTransfer = useCallback(
    (transferId: string) => {
      const item = transfersRef.current.find((row) => row.id === transferId);
      if (!item) {
        return;
      }
      item.controller.abort();
      const controller = new AbortController();
      patchTransferRow(transferId, { status: 'uploading', progress: 0, error: null, controller });
      void runTransfer(transferId, item.file, controller);
    },
    [patchTransferRow, runTransfer],
  );

  const revokePreviewUrl = useCallback((file: File) => {
    const previewUrl = previewUrlsRef.current.get(file);
    if (previewUrl !== undefined) {
      URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(file);
    }
  }, []);

  const handleRemoveTransfer = useCallback(
    (transferId: string) => {
      const item = transfersRef.current.find((row) => row.id === transferId);
      item?.controller.abort();
      if (isWeb && item) {
        revokePreviewUrl(item.file);
      }
      removeTransferRow(transferId);
    },
    [removeTransferRow, revokePreviewUrl],
  );

  const handleFileSelect = useCallback(
    (files: FileList | File[] | null, onValueChange?: (nextValue: TData) => void, rawFileList?: FileList | null) => {
      if (!files) {
        return;
      }

      const fileArray = Array.isArray(files) ? files : [...files];
      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error === null) {
          validFiles.push(file);
        } else {
          errors.push(`${file.name}: ${error}`);
        }
      }

      // Surface every rejected file (even when other files passed); clear only on a fully valid selection
      setValidationError(errors.length > 0 ? errors.join('\n') : undefined);

      if (validFiles.length > 0) {
        emitFieldRef.current = onValueChange ?? null;
        if (onUploadRef.current) {
          for (const file of validFiles) {
            startTransfer(file);
          }
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
        revokePreviewUrl(fileToRemove);
      }

      setSelectedFiles((prev) => {
        const nextFiles = prev.filter((file) => file !== fileToRemove);
        syncFieldValue(nextFiles, onValueChange);
        return nextFiles;
      });

      onFileRemove?.(fileToRemove);
    },
    [onFileRemove, revokePreviewUrl, syncFieldValue],
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
      if (dragDrop && e.dataTransfer.files != null) {
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
      await holdFlag(nativePickInFlightRef, async () => {
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
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- SAFETY: NativePickedFile and File share no type overlap; downstream reads only name/size/type/uri (see above)
        handleFileSelect(outcome.files as unknown as File[], onValueChange);
        onBlurHandler?.();
      });
    },
    [accept, disabled, handleFileSelect, multiple, pickerMode, readOnly],
  );

  // DROPZONE-FULL-TARGET: the whole dropzone surface opens the file chooser.
  // Interactive children (Choose File button, per-file remove buttons, links)
  // handle their own press and are excluded here so remove never opens the chooser.
  // Only wired on web (see `zoneInteractionProps`), so the targets are DOM nodes.
  const isInteractiveChild = useCallback((e: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
    const { target, currentTarget: current } = e;
    if (!(target instanceof Element) || current == null) {
      return false;
    }
    const interactive = target.closest('button, a, input, select, textarea, [role="button"]');
    return interactive !== null && interactive !== current;
  }, []);

  const handleZoneClick = useCallback(
    (e: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
      if (isInteractiveChild(e)) {
        return;
      }
      openFileDialog();
    },
    [isInteractiveChild, openFileDialog],
  );

  const handleZoneKeyDown = useCallback(
    (e: {
      target: EventTarget | null;
      currentTarget: EventTarget | null;
      key?: string;
      preventDefault?: () => void;
    }) => {
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
    (node: TamaguiElement | null) => {
      releaseZoneListeners();
      if (!isWeb || !(node instanceof HTMLElement)) {
        return;
      }
      const onFocus = () => {
        paintZoneRing();
      };
      const onBlur = () => {
        setKbZoneFocus(false);
      };
      // oxlint-disable-next-line react-doctor/effect-needs-cleanup -- the matching removeEventListener calls are stored in zoneCleanupRef and run by releaseZoneListeners (rebind and unmount)
      node.addEventListener('focus', onFocus);
      node.addEventListener('blur', onBlur);
      zoneCleanupRef.current = () => {
        node.removeEventListener('focus', onFocus);
        node.removeEventListener('blur', onBlur);
      };
    },
    [paintZoneRing, releaseZoneListeners],
  );

  const handleZoneFocus = paintZoneRing;

  const handleZoneBlur = useCallback(() => {
    setKbZoneFocus(false);
  }, []);

  const getFilePreview = useCallback((file: File) => {
    if (!isWeb) {
      // Native picks carry a device URI instead of a blob; tamagui's Image
      // takes it through the same `src` prop the web preview uses.
      // SAFETY: native picks are NativePickedFile objects (see openNativePicker), so `uri` is present or the object is a plain File without it.
      const { uri } = file as Partial<NativePickedFile>;
      return uri !== undefined && uri !== '' && file.type?.startsWith('image/') ? uri : null;
    }
    if (file.type.startsWith('image/')) {
      const existingUrl = previewUrlsRef.current.get(file);
      if (existingUrl !== undefined) {
        return existingUrl;
      }
      const nextUrl = URL.createObjectURL(file);
      previewUrlsRef.current.set(file, nextUrl);
      return nextUrl;
    }
    return null;
  }, []);

  const frameMinHeight = getFieldHeight(fieldProps.size ?? knobSizeToken, 5, hydrationTouch);

  // Render skeleton placeholder
  if (skeleton) {
    const minHeightPx = frameMinHeight;
    return (
      <FieldLayout
        id={id}
        label={fieldProps.label}
        size={fieldProps.size}
        knobProps={knobProps}>
        <Skeleton
          variant="rounded"
          width="100%"
          height={minHeightPx}
        />
      </FieldLayout>
    );
  }

  const canInteract = !disabled && !readOnly;
  const showDropOverlay = isDragOver && canInteract && dragDrop;
  const edgeWidth = knobProps.borderRadius.borderWidth ?? 1;
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
    <XStack
      flex={1}
      gap="$2"
      alignItems="center">
      {preview !== null && preview !== '' ? (
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
        <XStack
          width={rowMediaPx}
          height={rowMediaPx}
          justifyContent="center"
          alignItems="center">
          <FileIcon size={rowGlyphSize} />
        </XStack>
      )}
      <YStack
        flex={1}
        gap="$1">
        <Text
          numberOfLines={1}
          {...knobProps.body}>
          {file.name}
        </Text>
        {/* Bento (bento-pickers-measured.md §2): the size is a
            SECOND LINE, BOLD, one type step down (the label
            tier — 13/24 at medium). The 700 is the Bento
            treatment, a deliberate eject over the weight knob. */}
        <Text
          numberOfLines={1}
          color={formCommonColors.text}
          {...knobProps.label}
          fontWeight="700">
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
          {renderRemoveDisc(removeLabel(file.name), () => {
            handleFileRemove(file, onValueChange);
          })}
        </YStack>
      ) : null}
    </YStack>
  );

  // Drag-and-drop, keyboard activation and the focus ring are DOM concerns;
  // native gets a plain press target on the same surface instead.
  const getZoneInteractionProps = (
    requestFiles: () => void,
    onValueChange?: (nextValue: TData) => void,
    onBlurHandler?: () => void,
  ) => {
    if (!canInteract) {
      return { cursor: disabled ? ('not-allowed' as const) : undefined };
    }
    if (!isWeb) {
      return { role: 'button' as const, onPress: requestFiles };
    }
    return {
      // DROPZONE-FULL-TARGET: the entire surface is the click target.
      role: 'button' as const,
      tabIndex: 0,
      onFocus: handleZoneFocus,
      onBlur: handleZoneBlur,
      cursor: 'pointer' as const,
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
    };
  };

  // Labeled fields get aria-labelledby auto-wired by the FieldLayout Label
  // (tamagui Label htmlFor → this id); the aria-label fallback covers
  // label-less usage, and is what a screen reader announces for the native
  // press target too.
  const getZoneAriaLabelProps = () => {
    const { label } = fieldProps;
    const hasLabel = Boolean(label);
    if (!canInteract || hasLabel) {
      return null;
    }
    // An empty-string label is the only string that reaches here; it keeps its labeled phrasing.
    return { 'aria-label': label === '' ? t('{{label}}: choose file', { label }) : t('Choose file') };
  };

  const renderTransferRow = (item: TransferItem) => {
    const preview = showPreview ? getFilePreview(item.file) : null;
    const isUploading = item.status === 'uploading';
    const failed = item.status === 'failed' ? item.error : undefined;
    const removeDisc = isUploading
      ? renderRemoveDisc(t('Cancel {{name}}', { name: item.file.name }), () => {
          handleCancelTransfer(item.id);
        })
      : renderRemoveDisc(removeLabel(item.file.name), () => {
          handleRemoveTransfer(item.id);
        });
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
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- tamagui YStack renders a div; a native <progress> cannot take the styled track/fill children
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
                <Text
                  color={formCommonColors.error}
                  {...knobProps.label}>
                  {failed.problem}
                </Text>
                <Text
                  color={formCommonColors.muted}
                  {...knobProps.label}>
                  {failed.action}
                </Text>
              </YStack>
            ) : null}
          </>,
        )}
        <XStack
          {...knobProps.gap}
          alignItems="center">
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
          {removeDisc}
        </XStack>
      </XStack>
    );
  };

  const renderDropOverlay = (hasError: boolean) => (
    <DropOverlayFrame
      data-file-upload="overlay"
      borderRadius={cappedRadius}
      borderWidth={edgeWidth}
      {...getErrorBorder(hasError)}
      {...knobProps.gap}
      {...knobProps.panelPadding}>
      <XStack
        width={rowMediaPx}
        height={rowMediaPx}
        alignItems="center"
        justifyContent="center"
        // `color` tints the phosphor glyph via currentColor; Tamagui applies
        // it on web Stacks though the RN-flavored View type omits it.
        {...overlayGlyphColor}>
        <UploadIcon
          size={rowMediaPx}
          aria-hidden
        />
      </XStack>
      <Text
        color={formCommonColors.text}
        textAlign="center"
        {...knobProps.body}>
        {multiple ? t('Drop files to upload') : t('Drop a file to upload')}
      </Text>
    </DropOverlayFrame>
  );

  const renderFileList = (onValueChange?: (nextValue: TData) => void) => {
    // Committed image picks become tiles; everything else stays a row.
    const imageTiles: { file: File; preview: string }[] = [];
    const fileRows: { file: File; preview: string | null; index: number }[] = [];
    for (const [index, file] of selectedFiles.entries()) {
      const preview = showPreview ? getFilePreview(file) : null;
      if (preview !== null && preview !== '') {
        imageTiles.push({ file, preview });
      } else {
        fileRows.push({ file, preview, index });
      }
    }
    return (
      <UploadFileListFrame
        data-file-upload="files"
        // The hairline tracks the frame edge's knob width — one dash voice.
        borderTopWidth={edgeWidth}>
        {imageTiles.length > 0 ? (
          <UploadTileGridFrame
            data-file-upload="tiles"
            {...knobProps.gap}
            {...knobProps.panelPadding}>
            {imageTiles.map(({ file, preview }) => renderImageTile(file, preview, onValueChange))}
          </UploadTileGridFrame>
        ) : null}
        {fileRows.map(({ file, preview, index }) => (
          <XStack
            key={`${file.name}-${index}`}
            width="100%"
            {...knobProps.gap}
            alignItems="center"
            justifyContent="space-between"
            {...knobProps.panelPadding}>
            {renderFileMeta(file, preview)}
            {renderRemoveDisc(removeLabel(file.name), () => {
              handleFileRemove(file, onValueChange);
            })}
          </XStack>
        ))}
        {transfers.map((item) => renderTransferRow(item))}
      </UploadFileListFrame>
    );
  };

  const renderPicker = (
    requestFiles: () => void,
    onValueChange?: (nextValue: TData) => void,
    onBlurHandler?: () => void,
  ) => (
    <YStack
      {...knobProps.panelPadding}
      flexGrow={1}
      width="100%"
      alignItems="center"
      justifyContent="center"
      {...knobProps.gap}>
      <XStack
        alignItems="center"
        {...knobProps.gap}>
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
        <Text
          color={formCommonColors.muted}
          textAlign="center"
          {...knobProps.body}>
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
  );

  const renderUploadArea = (
    errorProp?: string | boolean,
    onValueChange?: (nextValue: TData) => void,
    onBlurHandler?: () => void,
  ) => {
    emitFieldRef.current = onValueChange ?? null;
    const hasError = isErrorShown(errorProp);
    // The press that opens a picker: the hidden <input> on web, the OS sheet
    // on native. Both land in the same handleFileSelect pipeline.
    const requestFiles = isWeb
      ? openFileDialog
      : () => {
          void openNativePicker(onValueChange, onBlurHandler);
        };

    const zoneInteractionProps = getZoneInteractionProps(requestFiles, onValueChange, onBlurHandler);

    return (
      <UploadAreaFrame
        // The dropzone is this field's control: it carries the FieldLayout id
        // so the rendered `<label htmlFor>` resolves (family pattern — see
        // Barcode / ColorPicker for other non-native-input controls).
        id={id}
        ref={bindZoneNode}
        data-file-upload="dropzone"
        data-drag-over={showDropOverlay ? 'true' : undefined}
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
        borderWidth={edgeWidth}
        {...getErrorBorder(hasError)}
        elevation={knobProps.elevation}
        transition={knobProps.transition}
        // CONTRACT (boards media-01..03): the getFieldHeight floor sits on
        // the FRAME, so the frame border-box measures 220 — hanging it on
        // the inner stack painted 222, a number no token expresses.
        minHeight={frameMinHeight}
        aria-required={fieldProps.required ? true : undefined}
        aria-invalid={hasError || undefined}
        aria-readonly={readOnly ? true : undefined}
        aria-disabled={disabled ? true : undefined}
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
        hoverStyle={getHoverStyle(canInteract, hasError)}
        {...zoneInteractionProps}
        {...getZoneAriaLabelProps()}>
        {showDropOverlay ? renderDropOverlay(hasError) : null}

        {renderPicker(requestFiles, onValueChange, onBlurHandler)}

        {hasRows ? renderFileList(onValueChange) : null}
      </UploadAreaFrame>
    );
  };

  if (resolvedForm == null || name === undefined || name === '') {
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
        {/* oxlint-disable-next-line react/refs -- renderUploadArea publishes the latest field handler to a ref that the async upload completion reads; it has no render-phase access to it otherwise */}
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
                field.handleChange(nextValue);
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
};

/**
 * The value shape a native pick binds. `{ uri, name, type, size }` is what
 * React Native's FormData accepts for a multipart upload, so a form value can
 * be posted straight through; on web the value stays a DOM `File`.
 */
export type { NativePickedFile, NativePickerMode } from './file-picker-types';

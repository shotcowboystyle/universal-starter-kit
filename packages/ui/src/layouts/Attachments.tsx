import {
  DownloadSimpleIcon,
  EyeIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  PaperclipIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { downloadFile } from '@repo/platform';
import {
  containerCapProps,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  getGroupPosition,
  hairline,
  stackRadiusProps,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Dialog, Image, Label, Separator, Text, XStack, YStack, isWeb, type YStackProps } from 'tamagui';

import { Button } from '../Button';
import { componentColors, sectionHeading } from '../componentColors';
import { useTranslation } from '../shared/i18n';
import { useReturnFocusOnClose } from '../shared/useReturnFocusOnClose';
import { Skeleton } from '../Skeleton';
import { DialogContent, DialogOverlay } from '../surfaces';

import { AsyncBoundary, resolveAsyncStatus } from './AsyncBoundary';

// ---------------------------------------------------------------------------
// Types  (generic -- no Frappe dependency)
// ---------------------------------------------------------------------------

/**
 * Generic attachment item.
 * Replaces FrappeFile with a framework-agnostic type.
 */
export interface AttachmentItem {
  /** Unique identifier */
  id: string;
  /** Display name for the file */
  fileName: string;
  /** URL to access the file */
  fileUrl: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type or file type string */
  fileType?: string;
  /** Whether the file is an image */
  isImage?: boolean;
  /** Human-readable file size (pre-formatted) */
  formattedSize?: string;
}

export interface AttachmentsProps extends Omit<YStackProps, 'children'> {
  /** Attachment items to display */
  items: AttachmentItem[];

  /** Label for the attachments section */
  label?: string;
  /** Whether interactions are disabled */
  disabled?: boolean;
  /** Maximum number of attachments allowed (0 = unlimited) */
  maxAttachments?: number;

  /** Whether attachment data is loading — renders a row-shaped skeleton twin */
  isLoading?: boolean;
  /**
   * Failed load (Axiom 6). Wins over the empty chrome so a failed
   * File load never masquerades as "no attachments". Pass a string, Error,
   * custom node, or `true` for the default error UI.
   */
  error?: boolean | string | Error | React.ReactNode | null;
  /** Retry handler for the default error chrome */
  onRetry?: () => void;

  /** Called when an attachment is clicked */
  onAttachmentClick?: (attachment: AttachmentItem) => void;
  /** Called when the user wants to add/upload an attachment */
  onAdd?: (file: File) => void;
  /** Called when the user wants to remove an attachment */
  onRemove?: (attachment: AttachmentItem) => void;
  /** Called when the user wants to download an attachment */
  onDownload?: (attachment: AttachmentItem) => void;

  /** Custom empty state renderer */
  renderEmpty?: () => React.ReactNode;
  /** Custom attachment item renderer */
  renderAttachment?: (
    attachment: AttachmentItem,
    defaultContent: React.ReactNode,
    actions: {
      onPreview: () => void;
      onDownload: () => void;
      onRemove: () => void;
    },
  ) => React.ReactNode;

  /** Accepted file types for upload (e.g., "image/*", ".pdf,.doc") */
  accept?: string;
  /** Maximum file size in bytes (default 10MB) */
  maxFileSize?: number;

  /** Show file preview on click */
  enablePreview?: boolean;
  /** Show download button */
  enableDownload?: boolean;
  /** Show delete/remove button */
  enableRemove?: boolean;
  /** Show upload/add button */
  enableAdd?: boolean;
  /** Compact mode - smaller UI */
  compact?: boolean;

  /** Labels for i18n -- consumers pass pre-translated strings */
  labels?: {
    upload?: string;
    uploading?: string;
    noAttachments?: string;
    preview?: string;
    download?: string;
    remove?: string;
    close?: string;
    fileTooLarge?: string;
    loadFailed?: string;
    previewUnavailable?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FileKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'archive' | 'file';

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function isImageFile(attachment: AttachmentItem): boolean {
  if (attachment.isImage !== undefined) {
    return attachment.isImage;
  }

  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (attachment.fileType && imageTypes.includes(attachment.fileType)) {
    return true;
  }

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const url = attachment.fileUrl || attachment.fileName || '';
  const ext = url.substring(url.lastIndexOf('.')).toLowerCase();
  return imageExtensions.includes(ext);
}

function getFileExtension(attachment: AttachmentItem): string {
  const name = attachment.fileName || '';
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toUpperCase();
  }
  const mime = attachment.fileType?.split('/')[1];
  return mime ? mime.toUpperCase() : '';
}

function getFileKind(attachment: AttachmentItem): FileKind {
  if (isImageFile(attachment)) {
    return 'image';
  }
  const ext = getFileExtension(attachment).toLowerCase();
  const mime = (attachment.fileType || '').toLowerCase();
  if (ext === 'pdf' || mime.includes('pdf')) {
    return 'pdf';
  }
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(ext) || mime.includes('word') || mime.includes('text')) {
    return 'doc';
  }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return 'sheet';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mime.includes('zip')) {
    return 'archive';
  }
  return 'file';
}

/** Notion-style type scan: the well hue IS the file class, not a decoration. */
const FILE_KIND_TONE: Record<FileKind, { bg: string; fg: string }> = {
  image: { bg: '$color3', fg: '$color11' },
  pdf: { bg: '$red3', fg: '$red11' },
  doc: { bg: '$blue3', fg: '$blue11' },
  sheet: { bg: '$green3', fg: '$green11' },
  archive: { bg: '$orange3', fg: '$orange11' },
  file: { bg: '$color3', fg: '$color11' },
};

function getFileIcon(attachment: AttachmentItem, size: number): React.ReactNode {
  const kind = getFileKind(attachment);
  if (kind === 'image') {
    return <ImageIcon size={size} />;
  }
  if (kind === 'pdf' || kind === 'doc') {
    return <FileTextIcon size={size} />;
  }
  return <FileIcon size={size} />;
}

interface AttachmentThumbnailProps {
  attachment: AttachmentItem;
  size: number;
  fallback: React.ReactNode;
}

/**
 * Image thumbnail that falls back to the file-type icon when the image URL
 * fails to load (auth-gated, relative, or broken URLs would otherwise render
 * an empty square).
 */
function AttachmentThumbnail({ attachment, size, fallback }: AttachmentThumbnailProps) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return <>{fallback}</>;
  }
  return (
    <Image
      // src (string) + objectFit, not source/resizeMode: the RN-only props
      // leak onto the DOM <img> on web (React unknown-prop warning); tamagui
      // maps src/objectFit back to source/resizeMode on native.
      src={attachment.fileUrl}
      alt={attachment.fileName}
      width={size}
      height={size}
      objectFit="cover"
      onError={() => {
        setErrored(true);
      }}
    />
  );
}

/**
 * Skeleton twin of the attachment rows: the media square
 * and the name + size text column mirror the live row anatomy so the layout
 * doesn't jump when data lands. Hairlines sit BETWEEN placeholders only.
 */
function AttachmentsSkeleton({
  thumbSize,
  loadingLabel,
  rowPad,
}: {
  thumbSize: number;
  loadingLabel: string;
  rowPad: string | number | undefined;
}) {
  return (
    <YStack width="100%" data-async-skeleton="attachments" aria-busy aria-label={loadingLabel}>
      {Array.from({ length: 3 }).map((_, i) => (
        <YStack key={i}>
          {i > 0 ? <Separator {...hairline.line} /> : null}
          <XStack gap="$3" alignItems="center" paddingVertical="$2" paddingHorizontal={rowPad} minHeight={44}>
            <Skeleton variant="rounded" width={thumbSize} height={thumbSize} />
            <YStack flex={1} gap="$1">
              <Skeleton width="55%" height={14} />
              <Skeleton width="25%" height={12} />
            </YStack>
          </XStack>
        </YStack>
      ))}
    </YStack>
  );
}

interface AttachmentRowProps {
  attachment: AttachmentItem;
  index: number;
  count: number;
  compact: boolean;
  disabled: boolean;
  thumbSize: number;
  rowPad: string | number | undefined;
  enablePreview: boolean;
  enableDownload: boolean;
  enableRemove: boolean;
  previewLabel: string;
  downloadLabel: string;
  removeLabel: string;
  onAttachmentClick?: (attachment: AttachmentItem) => void;
  onPreview: (attachment: AttachmentItem) => void;
  onDownload: (attachment: AttachmentItem) => void;
  onRemove?: (attachment: AttachmentItem) => void;
  renderAttachment?: AttachmentsProps['renderAttachment'];
}

/**
 * One flush stacked row: first rounds leading corners, last trailing,
 * interiors square. Hover/press/focus inherit that geometry. Desk = filename
 * as the subject + inline actions; Notion = type well / image thumb + size.
 */
function AttachmentRow({
  attachment,
  index,
  count,
  compact,
  disabled,
  thumbSize,
  rowPad,
  enablePreview,
  enableDownload,
  enableRemove,
  previewLabel,
  downloadLabel,
  removeLabel,
  onAttachmentClick,
  onPreview,
  onDownload,
  onRemove,
  renderAttachment,
}: AttachmentRowProps) {
  const { knobProps, control } = useResolvedKnobs({ compact });
  const [kbFocus, setKbFocus] = useState(false);
  const isImage = isImageFile(attachment);
  const kind = getFileKind(attachment);
  const tone = FILE_KIND_TONE[kind];
  const ext = getFileExtension(attachment);
  const iconSize = compact ? 14 : 16;
  const position = getGroupPosition(index, count);
  const corners = stackRadiusProps(position, knobProps.containerRadius.borderRadius);

  const actions = {
    onPreview: () => {
      onPreview(attachment);
    },
    onDownload: () => {
      onDownload(attachment);
    },
    onRemove: () => onRemove?.(attachment),
  };

  const mediaSlot = (
    <YStack
      width={thumbSize}
      height={thumbSize}
      flexShrink={0}
      overflow="hidden"
      backgroundColor={tone.bg}
      borderRadius={knobProps.borderRadius.borderRadius}
      alignItems="center"
      justifyContent="center"
      // `color` sets the icon's inherited color; Tamagui forwards it at runtime
      // but the RN-flavored View prop type omits it (house Record cast).
      {...({ color: tone.fg } as Record<string, unknown>)}>
      {isImage ? (
        <AttachmentThumbnail attachment={attachment} size={thumbSize} fallback={getFileIcon(attachment, iconSize)} />
      ) : (
        getFileIcon(attachment, iconSize)
      )}
    </YStack>
  );

  const actionButtons = (
    <XStack gap="$1" alignItems="center">
      {enablePreview && isImage && (
        <Button
          size="$2"
          chromeless
          nested
          icon={EyeIcon}
          aria-label={previewLabel}
          onPress={(e) => {
            e.stopPropagation();
            actions.onPreview();
          }}
        />
      )}
      {enableDownload && (
        <Button
          size="$2"
          chromeless
          nested
          icon={DownloadSimpleIcon}
          aria-label={downloadLabel}
          onPress={(e) => {
            e.stopPropagation();
            actions.onDownload();
          }}
        />
      )}
      {enableRemove && !disabled && onRemove && (
        <Button
          size="$2"
          chromeless
          nested
          icon={TrashIcon}
          aria-label={removeLabel}
          onPress={(e) => {
            e.stopPropagation();
            actions.onRemove();
          }}
        />
      )}
    </XStack>
  );

  const defaultContent = (
    <YStack>
      {index > 0 ? <Separator {...hairline.line} /> : null}
      <XStack
        role="listitem"
        data-stack-position={position}
        {...containerCapProps('StackedRow', knobProps.borderRadius.borderRadius, knobProps.space)}
        alignItems="center"
        paddingVertical="$2"
        paddingHorizontal={rowPad}
        minHeight={44}
        overflow="hidden"
        cursor="pointer"
        {...corners}
        transition={knobProps.transition}
        hoverStyle={{
          backgroundColor: componentColors.interactive.background,
          ...control.hoverKnobProps,
          ...corners,
        }}
        pressStyle={{
          backgroundColor: componentColors.interactive.hover,
          ...control.pressKnobProps,
          ...corners,
        }}
        {...(kbFocus ? ensureFocusVisibleRing({ outlineOffset: -2 }) : { outlineWidth: 0 })}
        onPress={() => {
          onAttachmentClick?.(attachment);
          if (enablePreview) {
            onPreview(attachment);
          }
        }}
        onFocus={() => {
          if (wasKeyboardFocus()) {
            setKbFocus(true);
          }
        }}
        onBlur={() => {
          setKbFocus(false);
        }}>
        <XStack flex={1} alignItems="center" minWidth={0} gap="$3">
          {mediaSlot}
          <YStack flex={1} minWidth={0}>
            <Text {...knobProps.body} fontSize={compact ? '$3' : '$4'} numberOfLines={1}>
              {attachment.fileName}
            </Text>
            <XStack gap="$2" alignItems="center">
              <Text fontSize="$2" color={knobProps.textAccentColor}>
                {attachment.formattedSize || formatFileSize(attachment.fileSize)}
              </Text>
              {ext ? (
                <>
                  <Text fontSize="$2" color={componentColors.text.subtle}>
                    ·
                  </Text>
                  <Text fontSize="$2" color={componentColors.text.subtle}>
                    {ext}
                  </Text>
                </>
              ) : null}
            </XStack>
          </YStack>
          {actionButtons}
        </XStack>
      </XStack>
    </YStack>
  );

  if (renderAttachment) {
    return renderAttachment(attachment, defaultContent, actions);
  }

  return defaultContent;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Generic Attachments component for displaying and managing file attachments.
 * Stacked flush rows: outer corners only, hairlines BETWEEN items,
 * hover/press/focus inherit that geometry. Fully data-agnostic — accepts
 * items via props and emits callbacks.
 */
export function Attachments({
  items,
  label,
  disabled = false,
  maxAttachments = 0,
  isLoading = false,
  error = null,
  onRetry,
  onAttachmentClick,
  onAdd,
  onRemove,
  onDownload,
  renderEmpty,
  renderAttachment,
  accept,
  maxFileSize = 10 * 1024 * 1024,
  enablePreview = true,
  enableDownload = true,
  enableRemove = true,
  enableAdd = true,
  compact = false,
  labels = {},
  ...stackProps
}: AttachmentsProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<AttachmentItem | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  useReturnFocusOnClose(!!previewFile);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }

  const {
    upload: uploadLabel = 'Upload',
    noAttachments: noAttachmentsLabel = 'No attachments',
    preview: previewLabel = 'Preview',
    download: downloadLabel = 'Download',
    remove: removeLabel = 'Remove',
    close: closeLabel = 'Close',
    fileTooLarge: fileTooLargeLabel = 'File too large',
    loadFailed: loadFailedLabel = t("Couldn't load attachments"),
    previewUnavailable: previewUnavailableLabel = t('Preview not available for this file type.'),
  } = labels;

  // Error wins: a failed load must never look like "no attachments".
  const hasError = resolveAsyncStatus({ error }) === 'error';
  const showSkeleton = !hasError && isLoading && items.length === 0;

  const canAdd = useMemo(() => {
    // Hide the upload affordance while the list is failed: the max-attachment
    // guard can't be honestly evaluated against data that didn't load.
    if (disabled || !enableAdd || !onAdd || hasError) {
      return false;
    }
    if (maxAttachments > 0 && items.length >= maxAttachments) {
      return false;
    }
    return true;
  }, [disabled, enableAdd, onAdd, maxAttachments, items.length, hasError]);

  const acceptFile = useCallback(
    (file: File) => {
      if (maxFileSize && file.size > maxFileSize) {
        setUploadError(`${fileTooLargeLabel} (${formatFileSize(maxFileSize)})`);
        return;
      }
      setUploadError(null);
      onAdd?.(file);
    },
    [maxFileSize, onAdd, fileTooLargeLabel],
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      acceptFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [acceptFile],
  );

  const handlePreview = useCallback((attachment: AttachmentItem) => {
    setPreviewFile(attachment);
  }, []);

  const handleDownload = useCallback(
    (attachment: AttachmentItem) => {
      if (onDownload) {
        onDownload(attachment);
      } else {
        downloadFile(attachment.fileUrl, attachment.fileName);
      }
    },
    [onDownload],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const dropHandlers =
    canAdd && isWeb
      ? {
          onDragOver: (event: { preventDefault: () => void }) => {
            event.preventDefault();
            setDragOver(true);
          },
          onDragLeave: () => {
            setDragOver(false);
          },
          onDrop: (event: { preventDefault: () => void; dataTransfer?: { files?: FileList } }) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer?.files?.[0];
            if (file) {
              acceptFile(file);
            }
          },
        }
      : undefined;

  const emptyState = renderEmpty ? (
    renderEmpty()
  ) : (
    <YStack
      {...(compact ? { padding: '$2' } : knobProps.panelPadding)}
      alignItems="center"
      gap="$2"
      {...knobProps.borderRadius}
      borderWidth={canAdd ? 1 : 0}
      borderStyle={canAdd ? 'dashed' : undefined}
      borderColor={dragOver ? componentColors.interactive.border : componentColors.surface.border}
      backgroundColor={dragOver ? componentColors.interactive.background : 'transparent'}
      cursor={canAdd ? 'pointer' : 'default'}
      opacity={canAdd ? 1 : 0.5}
      hoverStyle={canAdd ? { backgroundColor: componentColors.interactive.background } : undefined}
      onPress={canAdd ? handleUploadClick : undefined}
      {...dropHandlers}>
      <PaperclipIcon size={compact ? 20 : 28} />
      <Text color={knobProps.textAccentColor} fontSize={compact ? '$2' : '$3'}>
        {noAttachmentsLabel}
      </Text>
    </YStack>
  );

  // Shared by the live rows and their skeleton twin so geometry matches.
  const sz = knobProps.sizeToken;
  const thumbSize = compact ? (sz === '$3' ? 24 : sz === '$5' ? 40 : 32) : sz === '$3' ? 32 : sz === '$5' ? 48 : 40;
  const rowPad = knobProps.panelPadding.padding;

  return (
    <YStack {...knobProps.gap} {...stackProps}>
      {(label || canAdd) && (
        <XStack alignItems="center" justifyContent={label ? 'space-between' : 'flex-end'}>
          {label && (
            <Label {...(compact ? { fontSize: '$3', fontWeight: '400' } : sectionHeading)}>
              {label}
              {/* Count hides on error so the badge can't lie */}
              {maxAttachments > 0 && !hasError && (
                <Text color={knobProps.textAccentColor} fontSize="$2">
                  {' '}
                  ({items.length}/{maxAttachments})
                </Text>
              )}
            </Label>
          )}
          {canAdd && (
            <Button size={compact ? '$2' : '$3'} icon={PlusIcon} onPress={handleUploadClick}>
              <Text fontWeight="400">{uploadLabel}</Text>
            </Button>
          )}
        </XStack>
      )}

      {/* DOM file input is web-only; on native the ref stays null and the
          upload button no-ops (native picking needs a document-picker surface). */}
      {isWeb && (
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          disabled={disabled || !canAdd}
        />
      )}

      {uploadError && (
        <XStack
          backgroundColor="$red2"
          padding="$2"
          borderRadius={knobProps.borderRadius.borderRadius}
          alignItems="center"
          gap="$2">
          <Text color={componentColors.semantic.error} fontSize="$2" flex={1}>
            {uploadError}
          </Text>
          <Button
            size="$1"
            chromeless
            icon={XIcon}
            onPress={() => {
              setUploadError(null);
            }}
          />
        </XStack>
      )}

      {/* Exactly one of: error → loading skeleton → empty → rows */}
      <AsyncBoundary
        compact
        error={error}
        onRetry={onRetry}
        errorTitle={loadFailedLabel}
        loading={
          showSkeleton ? (
            <AttachmentsSkeleton thumbSize={thumbSize} loadingLabel={t('Loading')} rowPad={rowPad} />
          ) : (
            false
          )
        }
        empty={!hasError && items.length === 0 ? emptyState : false}>
        <YStack
          role="list"
          backgroundColor={dragOver ? componentColors.interactive.background : 'transparent'}
          {...dropHandlers}>
          {items.map((attachment, index) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment}
              index={index}
              count={items.length}
              compact={compact}
              disabled={disabled}
              thumbSize={thumbSize}
              rowPad={rowPad}
              enablePreview={enablePreview}
              enableDownload={enableDownload}
              enableRemove={enableRemove}
              previewLabel={previewLabel}
              downloadLabel={downloadLabel}
              removeLabel={removeLabel}
              onAttachmentClick={onAttachmentClick}
              onPreview={handlePreview}
              onDownload={handleDownload}
              onRemove={onRemove}
              renderAttachment={renderAttachment}
            />
          ))}
        </YStack>
      </AsyncBoundary>

      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <Dialog.Portal>
          <DialogOverlay opacity={0.5} />
          <DialogContent maxWidth={800} maxHeight="80vh">
            <Dialog.Title>{previewFile?.fileName}</Dialog.Title>
            {previewFile && isImageFile(previewFile) ? (
              <Image
                src={previewFile.fileUrl}
                alt={previewFile.fileName}
                width="100%"
                maxHeight="70vh"
                objectFit="contain"
              />
            ) : previewFile ? (
              <YStack alignItems="center" {...knobProps.gap} paddingVertical="$4">
                {getFileIcon(previewFile, 40)}
                <Text color={knobProps.textAccentColor} textAlign="center">
                  {previewUnavailableLabel}
                </Text>
              </YStack>
            ) : null}
            {previewFile ? (
              <XStack gap="$2">
                <Button
                  icon={DownloadSimpleIcon}
                  onPress={() => {
                    handleDownload(previewFile);
                  }}>
                  <Text fontWeight="400">{downloadLabel}</Text>
                </Button>
                <Button
                  outlined
                  onPress={() => {
                    setPreviewFile(null);
                  }}>
                  <Text fontWeight="400">{closeLabel}</Text>
                </Button>
              </XStack>
            ) : null}
          </DialogContent>
        </Dialog.Portal>
      </Dialog>
    </YStack>
  );
}

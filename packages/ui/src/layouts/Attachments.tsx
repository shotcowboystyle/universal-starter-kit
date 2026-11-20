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
import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { Dialog, Image, Label, Separator, Text, XStack, YStack, isWeb } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { Button } from '../Button';
import { componentColors, sectionHeading } from '../component-colors';
import { useTranslation } from '../shared/i18n';
import { useReturnFocusOnClose } from '../shared/use-return-focus-on-close';
import { Skeleton } from '../Skeleton';
import { DialogContent, DialogOverlay } from '../surfaces';

import { AsyncBoundary, resolveAsyncStatus } from './AsyncBoundary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Generic attachment item.
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
  error?: Error | React.ReactNode;
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

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
};

const isImageFile = (attachment: AttachmentItem): boolean => {
  if (attachment.isImage !== undefined) {
    return attachment.isImage;
  }

  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (imageTypes.includes(attachment.fileType ?? '')) {
    return true;
  }

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const url = attachment.fileUrl === '' ? attachment.fileName : attachment.fileUrl;
  const ext = url.slice(Math.max(url.lastIndexOf('.'), 0)).toLowerCase();
  return imageExtensions.includes(ext);
};

const getFileExtension = (attachment: AttachmentItem): string => {
  const name = attachment.fileName || '';
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toUpperCase();
  }
  const mime = attachment.fileType?.split('/')[1];
  return (mime ?? '').toUpperCase();
};

const getFileKind = (attachment: AttachmentItem): FileKind => {
  if (isImageFile(attachment)) {
    return 'image';
  }
  const ext = getFileExtension(attachment).toLowerCase();
  const mime = (attachment.fileType ?? '').toLowerCase();
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
};

/** Notion-style type scan: the well hue IS the file class, not a decoration. */
const FILE_KIND_TONE: Record<FileKind, { bg: string; fg: string }> = {
  image: { bg: '$color3', fg: '$color11' },
  pdf: { bg: '$red3', fg: '$red11' },
  doc: { bg: '$blue3', fg: '$blue11' },
  sheet: { bg: '$green3', fg: '$green11' },
  archive: { bg: '$orange3', fg: '$orange11' },
  file: { bg: '$color3', fg: '$color11' },
};

const getSizeLabel = (attachment: AttachmentItem): string =>
  attachment.formattedSize === undefined || attachment.formattedSize === ''
    ? formatFileSize(attachment.fileSize)
    : attachment.formattedSize;

const getFileIcon = (attachment: AttachmentItem, size: number): React.ReactElement => {
  const kind = getFileKind(attachment);
  if (kind === 'image') {
    return <ImageIcon size={size} />;
  }
  if (kind === 'pdf' || kind === 'doc') {
    return <FileTextIcon size={size} />;
  }
  return <FileIcon size={size} />;
};

interface AttachmentThumbnailProps {
  attachment: AttachmentItem;
  size: number;
  fallback: React.ReactElement;
}

/**
 * Image thumbnail that falls back to the file-type icon when the image URL
 * fails to load (auth-gated, relative, or broken URLs would otherwise render
 * an empty square).
 */
const AttachmentThumbnail = ({ attachment, size, fallback }: AttachmentThumbnailProps) => {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return fallback;
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
};

/**
 * Skeleton twin of the attachment rows: the media square
 * and the name + size text column mirror the live row anatomy so the layout
 * doesn't jump when data lands. Hairlines sit BETWEEN placeholders only.
 */
const AttachmentsSkeleton = ({
  thumbSize,
  loadingLabel,
  rowPad,
}: {
  thumbSize: number;
  loadingLabel: string;
  rowPad: string | number | undefined;
}) => (
  <YStack
    width="100%"
    data-async-skeleton="attachments"
    aria-busy
    aria-label={loadingLabel}>
    {Array.from({ length: 3 }).map((_, i) => (
      <YStack key={i}>
        {i > 0 ? <Separator {...hairline.line} /> : null}
        <XStack
          gap="$3"
          alignItems="center"
          paddingVertical="$2"
          paddingHorizontal={rowPad}
          minHeight={44}>
          <Skeleton
            variant="rounded"
            width={thumbSize}
            height={thumbSize}
          />
          <YStack
            flex={1}
            gap="$1">
            <Skeleton
              width="55%"
              height={14}
            />
            <Skeleton
              width="25%"
              height={12}
            />
          </YStack>
        </XStack>
      </YStack>
    ))}
  </YStack>
);

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
// oxlint-disable-next-line typescript/promise-function-async -- returns the consumer's renderAttachment ReactNode, whose React 19 type includes Promise; the component cannot be async
const AttachmentRow = ({
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
}: AttachmentRowProps) => {
  const { knobProps, control } = useResolvedKnobs({ compact });
  const [kbFocus, setKbFocus] = useState(false);
  const isImage = isImageFile(attachment);
  const kind = getFileKind(attachment);
  const tone = FILE_KIND_TONE[kind];
  const ext = getFileExtension(attachment);
  const toneColorProps = { color: tone.fg };
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
    onRemove: () => {
      onRemove?.(attachment);
    },
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
      // but the RN-flavored View prop type omits it, so it rides an index-signature spread.
      {...toneColorProps}>
      {isImage ? (
        <AttachmentThumbnail
          attachment={attachment}
          size={thumbSize}
          fallback={getFileIcon(attachment, iconSize)}
        />
      ) : (
        getFileIcon(attachment, iconSize)
      )}
    </YStack>
  );

  const actionButtons = (
    <XStack
      gap="$1"
      alignItems="center">
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
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack row inside the Tamagui role="list" YStack; the stacked-row geometry is not a native <li>
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
        <XStack
          flex={1}
          alignItems="center"
          minWidth={0}
          gap="$3">
          {mediaSlot}
          <YStack
            flex={1}
            minWidth={0}>
            <Text
              {...knobProps.body}
              fontSize={compact ? '$3' : '$4'}
              numberOfLines={1}>
              {attachment.fileName}
            </Text>
            <XStack
              gap="$2"
              alignItems="center">
              <Text
                fontSize="$2"
                color={knobProps.textAccentColor}>
                {getSizeLabel(attachment)}
              </Text>
              {ext ? (
                <>
                  <Text
                    fontSize="$2"
                    color={componentColors.text.subtle}>
                    ·
                  </Text>
                  <Text
                    fontSize="$2"
                    color={componentColors.text.subtle}>
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
};

// ---------------------------------------------------------------------------
// Component helpers
// ---------------------------------------------------------------------------

type ResolvedKnobProps = ReturnType<typeof useResolvedKnobs>['knobProps'];

type TranslateFn = ReturnType<typeof useTranslation>['t'];

type AttachmentLabels = NonNullable<AttachmentsProps['labels']>;

const NO_LABELS: AttachmentLabels = {};
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

const resolveAttachmentLabels = (labels: AttachmentLabels, t: TranslateFn) => ({
  uploadLabel: labels.upload ?? 'Upload',
  noAttachmentsLabel: labels.noAttachments ?? 'No attachments',
  previewLabel: labels.preview ?? 'Preview',
  downloadLabel: labels.download ?? 'Download',
  removeLabel: labels.remove ?? 'Remove',
  closeLabel: labels.close ?? 'Close',
  fileTooLargeLabel: labels.fileTooLarge ?? 'File too large',
  loadFailedLabel: labels.loadFailed ?? t("Couldn't load attachments"),
  previewUnavailableLabel: labels.previewUnavailable ?? t('Preview not available for this file type.'),
});

/** Shared by the live rows and their skeleton twin so geometry matches. */
const thumbSizeFor = (compact: boolean, sizeToken: string): number => {
  if (sizeToken === '$3') {
    return compact ? 24 : 32;
  }
  if (sizeToken === '$5') {
    return compact ? 40 : 48;
  }
  return compact ? 32 : 40;
};

interface CanAddArgs {
  disabled: boolean;
  enableAdd: boolean;
  hasOnAdd: boolean;
  hasError: boolean;
  maxAttachments: number;
  itemCount: number;
}

const computeCanAdd = ({ disabled, enableAdd, hasOnAdd, hasError, maxAttachments, itemCount }: CanAddArgs): boolean => {
  // Hide the upload affordance while the list is failed: the max-attachment
  // guard can't be honestly evaluated against data that didn't load.
  if (disabled || !enableAdd || !hasOnAdd || hasError) {
    return false;
  }
  if (maxAttachments > 0 && itemCount >= maxAttachments) {
    return false;
  }
  return true;
};

interface UploadArgs {
  canAdd: boolean;
  maxFileSize: number;
  fileTooLargeLabel: string;
  onAdd?: (file: File) => void;
}

const useAttachmentUpload = ({ canAdd, maxFileSize, fileTooLargeLabel, onAdd }: UploadArgs) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  return { fileInputRef, uploadError, setUploadError, dragOver, handleFileSelect, handleUploadClick, dropHandlers };
};

interface AttachmentsEmptyStateProps {
  compact: boolean;
  canAdd: boolean;
  dragOver: boolean;
  knobProps: ResolvedKnobProps;
  label: string;
  onPress?: () => void;
  dropHandlers?: ReturnType<typeof useAttachmentUpload>['dropHandlers'];
}

const AttachmentsEmptyState = ({
  compact,
  canAdd,
  dragOver,
  knobProps,
  label,
  onPress,
  dropHandlers,
}: AttachmentsEmptyStateProps) => (
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
    onPress={onPress}
    {...dropHandlers}>
    <PaperclipIcon size={compact ? 20 : 28} />
    <Text
      color={knobProps.textAccentColor}
      fontSize={compact ? '$2' : '$3'}>
      {label}
    </Text>
  </YStack>
);

interface AttachmentsHeaderProps {
  label?: string;
  compact: boolean;
  canAdd: boolean;
  hasError: boolean;
  maxAttachments: number;
  itemCount: number;
  uploadLabel: string;
  textAccentColor: ResolvedKnobProps['textAccentColor'];
  onUpload: () => void;
}

const AttachmentsHeader = ({
  label,
  compact,
  canAdd,
  hasError,
  maxAttachments,
  itemCount,
  uploadLabel,
  textAccentColor,
  onUpload,
}: AttachmentsHeaderProps) => {
  const hasLabel = label !== undefined && label !== '';
  if (!hasLabel && !canAdd) {
    return null;
  }
  return (
    <XStack
      alignItems="center"
      justifyContent={hasLabel ? 'space-between' : 'flex-end'}>
      {hasLabel && (
        <Label {...(compact ? { fontSize: '$3', fontWeight: '400' } : sectionHeading)}>
          {label}
          {/* Count hides on error so the badge can't lie */}
          {maxAttachments > 0 && !hasError && (
            <Text
              color={textAccentColor}
              fontSize="$2">
              {' '}
              ({itemCount}/{maxAttachments})
            </Text>
          )}
        </Label>
      )}
      {canAdd && (
        <Button
          size={compact ? '$2' : '$3'}
          icon={PlusIcon}
          onPress={onUpload}>
          <Text fontWeight="400">{uploadLabel}</Text>
        </Button>
      )}
    </XStack>
  );
};

interface AttachmentPreviewDialogProps {
  file: AttachmentItem | null;
  knobProps: ResolvedKnobProps;
  previewUnavailableLabel: string;
  downloadLabel: string;
  closeLabel: string;
  onDownload: (attachment: AttachmentItem) => void;
  onClose: () => void;
}

const AttachmentPreviewBody = ({
  file,
  knobProps,
  previewUnavailableLabel,
}: Pick<AttachmentPreviewDialogProps, 'file' | 'knobProps' | 'previewUnavailableLabel'> & { file: AttachmentItem }) => {
  if (isImageFile(file)) {
    return (
      <Image
        src={file.fileUrl}
        alt={file.fileName}
        width="100%"
        maxHeight="70vh"
        objectFit="contain"
      />
    );
  }
  return (
    <YStack
      alignItems="center"
      {...knobProps.gap}
      paddingVertical="$4">
      {getFileIcon(file, 40)}
      <Text
        color={knobProps.textAccentColor}
        textAlign="center">
        {previewUnavailableLabel}
      </Text>
    </YStack>
  );
};

const AttachmentPreviewDialog = ({
  file,
  knobProps,
  previewUnavailableLabel,
  downloadLabel,
  closeLabel,
  onDownload,
  onClose,
}: AttachmentPreviewDialogProps) => (
  <Dialog
    open={file !== null}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
    <Dialog.Portal>
      <DialogOverlay opacity={0.5} />
      <DialogContent
        maxWidth={800}
        maxHeight="80vh">
        <Dialog.Title>{file?.fileName}</Dialog.Title>
        {file !== null && (
          <>
            <AttachmentPreviewBody
              file={file}
              knobProps={knobProps}
              previewUnavailableLabel={previewUnavailableLabel}
            />
            <XStack gap="$2">
              <Button
                icon={DownloadSimpleIcon}
                onPress={() => {
                  onDownload(file);
                }}>
                <Text fontWeight="400">{downloadLabel}</Text>
              </Button>
              <Button
                outlined
                onPress={onClose}>
                <Text fontWeight="400">{closeLabel}</Text>
              </Button>
            </XStack>
          </>
        )}
      </DialogContent>
    </Dialog.Portal>
  </Dialog>
);

interface UploadErrorBannerProps {
  message: string;
  borderRadius: ResolvedKnobProps['borderRadius']['borderRadius'];
  onDismiss: () => void;
}

const UploadErrorBanner = ({ message, borderRadius, onDismiss }: UploadErrorBannerProps) => (
  <XStack
    backgroundColor="$red2"
    padding="$2"
    borderRadius={borderRadius}
    alignItems="center"
    gap="$2">
    <Text
      color={componentColors.semantic.error}
      fontSize="$2"
      flex={1}>
      {message}
    </Text>
    <Button
      size="$1"
      chromeless
      icon={XIcon}
      onPress={onDismiss}
    />
  </XStack>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type DefaultedAttachmentProp =
  | 'disabled'
  | 'maxAttachments'
  | 'isLoading'
  | 'error'
  | 'maxFileSize'
  | 'enablePreview'
  | 'enableDownload'
  | 'enableRemove'
  | 'enableAdd'
  | 'compact'
  | 'labels';

type ResolvedAttachmentsProps = Omit<AttachmentsProps, DefaultedAttachmentProp> &
  Required<Pick<AttachmentsProps, DefaultedAttachmentProp>>;

const AttachmentsContent = ({
  items,
  label,
  disabled,
  maxAttachments,
  isLoading,
  error,
  onRetry,
  onAttachmentClick,
  onAdd,
  onRemove,
  onDownload,
  renderEmpty,
  renderAttachment,
  accept,
  maxFileSize,
  enablePreview,
  enableDownload,
  enableRemove,
  enableAdd,
  compact,
  labels,
  ...stackProps
}: ResolvedAttachmentsProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact });
  const [previewFile, setPreviewFile] = useState<AttachmentItem | null>(null);
  useReturnFocusOnClose(previewFile !== null);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }

  const {
    uploadLabel,
    noAttachmentsLabel,
    previewLabel,
    downloadLabel,
    removeLabel,
    closeLabel,
    fileTooLargeLabel,
    loadFailedLabel,
    previewUnavailableLabel,
  } = resolveAttachmentLabels(labels, t);

  // Error wins: a failed load must never look like "no attachments".
  const hasError = resolveAsyncStatus({ error }) === 'error';
  const showSkeleton = !hasError && isLoading && items.length === 0;

  const canAdd = computeCanAdd({
    disabled,
    enableAdd,
    hasOnAdd: onAdd != null,
    hasError,
    maxAttachments,
    itemCount: items.length,
  });

  const { fileInputRef, uploadError, setUploadError, dragOver, handleFileSelect, handleUploadClick, dropHandlers } =
    useAttachmentUpload({ canAdd, maxFileSize, fileTooLargeLabel, onAdd });

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

  const emptyState = renderEmpty ? (
    renderEmpty()
  ) : (
    <AttachmentsEmptyState
      compact={compact}
      canAdd={canAdd}
      dragOver={dragOver}
      knobProps={knobProps}
      label={noAttachmentsLabel}
      onPress={canAdd ? handleUploadClick : undefined}
      dropHandlers={dropHandlers}
    />
  );

  const thumbSize = thumbSizeFor(compact, knobProps.sizeToken);
  const rowPad = knobProps.panelPadding.padding;

  return (
    <YStack
      {...knobProps.gap}
      {...stackProps}>
      <AttachmentsHeader
        label={label}
        compact={compact}
        canAdd={canAdd}
        hasError={hasError}
        maxAttachments={maxAttachments}
        itemCount={items.length}
        uploadLabel={uploadLabel}
        textAccentColor={knobProps.textAccentColor}
        onUpload={handleUploadClick}
      />

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

      {uploadError !== null && uploadError !== '' && (
        <UploadErrorBanner
          message={uploadError}
          borderRadius={knobProps.borderRadius.borderRadius}
          onDismiss={() => {
            setUploadError(null);
          }}
        />
      )}

      {/* Exactly one of: error → loading skeleton → empty → rows */}
      <AsyncBoundary
        compact
        error={error}
        onRetry={onRetry}
        errorTitle={loadFailedLabel}
        loading={
          showSkeleton ? (
            <AttachmentsSkeleton
              thumbSize={thumbSize}
              loadingLabel={t('Loading')}
              rowPad={rowPad}
            />
          ) : (
            false
          )
        }
        empty={!hasError && items.length === 0 ? emptyState : false}>
        <YStack
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui YStack list of Tamagui rows; there is no native <ul> host for this stack
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

      <AttachmentPreviewDialog
        file={previewFile}
        knobProps={knobProps}
        previewUnavailableLabel={previewUnavailableLabel}
        downloadLabel={downloadLabel}
        closeLabel={closeLabel}
        onDownload={handleDownload}
        onClose={() => {
          setPreviewFile(null);
        }}
      />
    </YStack>
  );
};

/**
 * Generic Attachments component for displaying and managing file attachments.
 * Stacked flush rows: outer corners only, hairlines BETWEEN items,
 * hover/press/focus inherit that geometry. Fully data-agnostic — accepts
 * items via props and emits callbacks.
 */
export const Attachments = ({
  disabled = false,
  maxAttachments = 0,
  isLoading = false,
  error = null,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  enablePreview = true,
  enableDownload = true,
  enableRemove = true,
  enableAdd = true,
  compact = false,
  labels = NO_LABELS,
  ...rest
}: AttachmentsProps) => (
  <AttachmentsContent
    {...rest}
    disabled={disabled}
    maxAttachments={maxAttachments}
    isLoading={isLoading}
    error={error}
    maxFileSize={maxFileSize}
    enablePreview={enablePreview}
    enableDownload={enableDownload}
    enableRemove={enableRemove}
    enableAdd={enableAdd}
    compact={compact}
    labels={labels}
  />
);

import { FileIcon, UploadIcon, XIcon } from '@phosphor-icons/react';
import { Skeleton } from '@repo/forms';
import { useFrappeCollection } from '@repo/frappe';
import { sizeRecipeForToken, useResolvedKnobs } from '@repo/theme';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Image, Label, Text, XStack, YStack } from 'tamagui';

import type { FrappeConfig } from '../FrappeProvider';
import { useFrappeConfig } from '../FrappeProvider';

export type FrappeFileUploadHandler = (
  file: File,
  ctx: { onProgress: (percent: number) => void; signal: AbortSignal },
) => Promise<string>;

export interface FileUploadProps {
  label?: string;
  value?: string;
  onChange: (fileUrl: string) => void;
  accept?: string;
  isImage?: boolean;
  disabled?: boolean;
  required?: boolean;
  maxSize?: number;
  baseURL?: string;
  auth?: FrappeConfig['auth'];
  helperText?: string;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
  /**
   * Override the File-doctype transport. Same progress/abort contract as
   * forms FileUpload; resolve with the committed URL. Tests and custom
   * desks inject this; the default reads the file and inserts a File doc.
   */
  onUpload?: FrappeFileUploadHandler;
}

type TransferStatus = 'uploading' | 'failed';

interface TransferState {
  file: File;
  status: TransferStatus;
  progress: number;
  problem?: string;
  action?: string;
  controller: AbortController;
}

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

const readFileAsDataUrl = async (
  file: File,
  { onProgress, signal }: { onProgress: (percent: number) => void; signal: AbortSignal },
): Promise<string> =>
  // oxlint-disable-next-line promise/avoid-new -- wraps the callback-based FileReader API
  await new Promise((resolve, reject) => {
    const reader = new FileReader();
    const onAbort = () => {
      reader.abort();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort);
    reader.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    reader.addEventListener('load', () => {
      signal.removeEventListener('abort', onAbort);
      onProgress(100);
      // SAFETY: readAsDataURL always yields a string result on load
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      resolve(reader.result as string);
    });
    reader.addEventListener('error', () => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error('Failed to read file'));
    });
    reader.addEventListener('abort', () => {
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    });
    reader.readAsDataURL(file);
  });

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity, sonarjs/cognitive-complexity -- one transfer state machine (pick, progress, fail, retry, replace) and its three render states; splitting it is a separate refactor
export const FileUpload = (props: FileUploadProps) => {
  const {
    label,
    value,
    onChange,
    accept,
    isImage = false,
    disabled = false,
    required = false,
    maxSize = DEFAULT_MAX_SIZE,
    baseURL,
    auth,
    helperText,
    readOnly = false,
    skeleton = false,
    compact = false,
    onUpload,
  } = props;
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const config = useFrappeConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const transferRef = useRef<TransferState | null>(null);
  const onUploadRef = useRef(onUpload);
  // oxlint-disable-next-line react/refs -- latest-value ref synced during render; read only inside runTransfer
  onUploadRef.current = onUpload;
  const isLocked = disabled || readOnly;
  const minHeight = compact ? 40 : 56;
  const previewSize = compact ? 120 : 200;
  const uploading = transfer?.status === 'uploading';

  const finalBaseURL = baseURL ?? config?.baseURL ?? '';
  const finalConfig = finalBaseURL
    ? {
        baseURL: finalBaseURL,
        socketPort: config?.socketPort,
        siteName: config?.siteName,
        socketBaseURL: config?.socketBaseURL,
        auth: auth ?? config?.auth,
        syncOptions: config?.syncOptions,
        realtime: config?.realtime,
        fixtures: config?.fixtures,
      }
    : undefined;

  const fileCollection = useFrappeCollection<{
    name: string;
    doctype: string;
    file_name: string;
    file_url: string;
    is_private: 0 | 1;
  }>(finalConfig, 'File', {
    fields: ['name', 'file_name', 'file_url', 'is_private'],
  });

  useEffect(
    () => () => {
      transferRef.current?.controller.abort();
    },
    [],
  );

  const defaultUpload = useCallback<FrappeFileUploadHandler>(
    async (file, ctx) => {
      const base64 = await readFileAsDataUrl(file, ctx);
      if (fileCollection) {
        const tx = fileCollection.insert({
          doctype: 'File',
          name: `new-${Date.now()}`,
          file_name: file.name,
          file_url: base64,
          is_private: 0,
        });
        await tx.isPersisted.promise;
      }
      return base64;
    },
    [fileCollection],
  );

  const runTransfer = useCallback(
    async (file: File, controller: AbortController) => {
      const upload = onUploadRef.current ?? defaultUpload;
      try {
        const url = await upload(file, {
          onProgress: (percent) => {
            const n = Math.min(100, Math.max(0, Math.round(Number.isNaN(percent) ? 0 : percent)));
            setTransfer((prev) => (prev ? { ...prev, progress: n } : prev));
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        setTransfer(null);
        transferRef.current = null;
        setFileError(null);
        onChange(url);
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        const problem = error instanceof Error && error.message ? error.message : t('Upload failed');
        setTransfer((prev) =>
          prev
            ? {
                ...prev,
                status: 'failed',
                problem,
                action: t('Try again or remove the file'),
              }
            : prev,
        );
        // Per-file failure stays on the row (DG-VAL-04). Do not clear `value`.
        setFileError(null);
      }
    },
    [defaultUpload, onChange, t],
  );

  const startTransfer = useCallback(
    (file: File) => {
      transferRef.current?.controller.abort();
      const controller = new AbortController();
      const next: TransferState = {
        file,
        status: 'uploading',
        progress: 0,
        controller,
      };
      transferRef.current = next;
      setTransfer(next);
      setFileError(null);
      void runTransfer(file, controller);
    },
    [runTransfer],
  );

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (maxSize && file.size > maxSize) {
      setFileError(`File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`);
      return;
    }

    startTransfer(file);
  };

  const handleCancel = () => {
    transferRef.current?.controller.abort();
    transferRef.current = null;
    setTransfer(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRetry = () => {
    if (!transfer) {
      return;
    }
    startTransfer(transfer.file);
  };

  const handleRemove = () => {
    if (isLocked) {
      return;
    }
    handleCancel();
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFailed = () => {
    handleCancel();
  };

  const handleClick = () => {
    if (isLocked || uploading) {
      return;
    }
    fileInputRef.current?.click();
  };

  const hasLabel = label !== undefined && label !== '';
  const hasValue = value !== undefined && value !== '';
  const hasError = fileError !== null && fileError !== '';
  const hasHelperText = helperText !== undefined && helperText !== '';

  if (skeleton) {
    return (
      <YStack {...knobProps.gap}>
        {hasLabel && (
          <Skeleton
            variant="text"
            width="30%"
            height={sizeRecipeForToken(knobProps.sizeToken).fontSize}
          />
        )}
        <Skeleton
          variant="rounded"
          width="100%"
          height={minHeight}
        />
      </YStack>
    );
  }

  return (
    <YStack {...knobProps.gap}>
      {hasLabel && (
        <Label>
          {label}
          {required && <Text color="$red10"> *</Text>}
        </Label>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept ?? (isImage ? 'image/*' : undefined)}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        disabled={isLocked || uploading}
      />

      {transfer ? (
        <YStack
          data-file-upload="transfer"
          data-transfer-status={transfer.status}
          {...knobProps.gap}
          {...knobProps.panelPadding}>
          <XStack
            gap="$2"
            alignItems="center">
            <FileIcon size={20} />
            <YStack
              flex={1}
              gap="$1">
              <Text numberOfLines={1}>{transfer.file.name}</Text>
              <Text
                numberOfLines={1}
                fontWeight="700"
                fontSize="$2">
                {formatFileSize(transfer.file.size)}
              </Text>
            </YStack>
            {transfer.status === 'uploading' ? (
              <Button
                size="$2"
                variant="outlined"
                icon={XIcon}
                aria-label={t('Cancel {{name}}', { name: transfer.file.name })}
                disabled={isLocked}
                onPress={handleCancel}
                {...knobProps.borderRadius}>
                {t('Cancel')}
              </Button>
            ) : null}
          </XStack>
          {transfer.status === 'uploading' ? (
            <YStack
              data-file-upload="progress"
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a Tamagui YStack draws the bar on native too, where there is no <progress> element
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={transfer.progress}
              aria-label={t('Uploading {{name}}', { name: transfer.file.name })}
              height={11}
              width="100%"
              borderRadius={1000}
              backgroundColor="$color4"
              overflow="hidden">
              <YStack
                height="100%"
                width={`${transfer.progress}%`}
                backgroundColor="$color11"
              />
            </YStack>
          ) : null}
          {transfer.status === 'failed' ? (
            <YStack {...knobProps.gap}>
              <Text
                color="$red11"
                fontSize="$2">
                {transfer.problem}
              </Text>
              <Text
                color="$color11"
                fontSize="$2">
                {transfer.action}
              </Text>
              <XStack {...knobProps.gap}>
                <Button
                  size="$2"
                  variant="outlined"
                  aria-label={t('Retry {{name}}', { name: transfer.file.name })}
                  disabled={isLocked}
                  onPress={handleRetry}
                  {...knobProps.borderRadius}>
                  {t('Retry')}
                </Button>
                <Button
                  size="$2"
                  variant="outlined"
                  icon={XIcon}
                  aria-label={t('Remove {{name}}', { name: transfer.file.name })}
                  disabled={isLocked}
                  onPress={handleRemoveFailed}
                  {...knobProps.borderRadius}>
                  {t('Remove')}
                </Button>
              </XStack>
            </YStack>
          ) : null}
        </YStack>
      ) : null}

      {!hasValue && !transfer ? (
        <Button
          size="$3"
          icon={UploadIcon}
          disabled={isLocked}
          onPress={handleClick}
          {...knobProps.borderRadius}>
          {t('Choose File')}
        </Button>
      ) : null}

      {hasValue ? (
        <YStack {...knobProps.gap}>
          {isImage ? (
            <Image
              // src (string), not source: the RN source object leaks onto the
              // DOM <img> as source="[object Object]" on web
              src={value}
              alt={t('Uploaded file preview')}
              width={previewSize}
              height={previewSize}
              {...knobProps.borderRadius}
              objectFit="cover"
            />
          ) : (
            <XStack
              gap="$2"
              alignItems="center"
              {...knobProps.panelPadding}
              {...{ backgroundColor: '$color2' }}>
              <FileIcon size={20} />
              <Text
                flex={1}
                numberOfLines={1}>
                {value.split('/').pop() ?? value}
              </Text>
            </XStack>
          )}

          {!readOnly && !transfer ? (
            <XStack {...knobProps.gap}>
              <Button
                size="$2"
                variant="outlined"
                icon={UploadIcon}
                disabled={isLocked}
                onPress={handleClick}
                {...knobProps.borderRadius}>
                {t('Replace')}
              </Button>
              <Button
                size="$2"
                variant="outlined"
                icon={XIcon}
                disabled={isLocked}
                onPress={handleRemove}
                {...knobProps.borderRadius}>
                {t('Remove')}
              </Button>
            </XStack>
          ) : null}
        </YStack>
      ) : null}

      {hasHelperText && !hasError && !transfer ? (
        <Text
          color="$color11"
          fontSize="$2">
          {helperText}
        </Text>
      ) : null}
      {hasError ? (
        <Text
          color="$red11"
          fontSize="$2">
          {fileError}
        </Text>
      ) : null}
    </YStack>
  );
};

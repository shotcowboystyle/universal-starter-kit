import { Attachments as BaseAttachments } from '@repo/ui';
import type { AttachmentItem, AttachmentsProps } from '@repo/ui';
import { useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { YStack } from 'tamagui';

import { useFrappeConfig } from '../FrappeProvider';
import { FrappeReconnectIndicator } from '../FrappeReconnectIndicator';
import { toLiveLoadError } from '../liveErrors';

export interface FrappeFile {
  name: string;
  doctype: string;
  file_name: string;
  file_url: string;
  file_size: number;
  file_type?: string;
  is_private?: number | boolean;
  attached_to_doctype?: string;
  attached_to_name?: string;
  attached_to_field?: string;
  creation?: string;
  modified?: string;
}

export interface FrappeAttachmentsProps extends Omit<AttachmentsProps, 'items'> {
  doctype: string;
  docname: string;
  /** If provided, only show attachments for this field */
  fieldname?: string;
}

function frappeFileToItem(file: FrappeFile): AttachmentItem {
  return {
    id: file.name,
    fileName: file.file_name,
    fileUrl: file.file_url,
    fileSize: file.file_size,
    fileType: file.file_type,
  };
}

function AttachmentsBody({ doctype, docname, fieldname, onRetry, ...props }: FrappeAttachmentsProps) {
  const config = useFrappeConfig();
  const { t } = useTranslation();
  // Honest error state (DG-ST-01 / Axiom 6): the collection swallows failed
  // subscription fetches (the list would just look empty) — onSyncError
  // reports them here so the base component can render its error chrome.
  // Plain setState is safe: the shared-collection cache HOLDS an errored
  // entry while consumers are mounted (the re-render this causes re-acquires
  // the same entry — no fresh failing sync), and starts exactly one fresh
  // attempt on the Retry remount. The error latch that used to bound the old
  // evict-on-error refetch loop is no longer needed.
  const [syncError, setSyncError] = useState<unknown>(null);

  const filters = useMemo(() => {
    const base: [string, string, unknown][] = [
      ['attached_to_doctype', '=', doctype],
      ['attached_to_name', '=', docname],
    ];
    if (fieldname) {
      base.push(['attached_to_field', '=', fieldname]);
    }
    return base;
  }, [doctype, docname, fieldname]);

  const collectionConfig = useMemo(
    () =>
      config
        ? {
            baseURL: config.baseURL,
            socketPort: config.socketPort,
            siteName: config.siteName,
            socketBaseURL: config.socketBaseURL,
            auth: config.auth,
            syncOptions: config.syncOptions,
            realtime: config.realtime,
            fixtures: config.fixtures,
          }
        : undefined,
    [config],
  );

  const collection = useFrappeCollection<FrappeFile>(collectionConfig, 'File', {
    filters,
    fields: [
      'name',
      'file_name',
      'file_url',
      'file_size',
      'file_type',
      'is_private',
      'attached_to_doctype',
      'attached_to_name',
      'attached_to_field',
      'creation',
      'modified',
    ],
    onSyncError: setSyncError,
  });

  const { data, isLoading } = useLiveQuery((q) => (collection ? q.from({ _list: collection }) : null), [collection]);

  const items = useMemo(() => ((data as FrappeFile[] | undefined) ?? []).map(frappeFileToItem), [data]);

  const loadError =
    syncError === null
      ? null
      : toLiveLoadError(syncError, {
          permissionMessage: t('You do not have permission to view attachments'),
          genericMessage: t('Failed to load attachments'),
        });

  return (
    <YStack gap="$2">
      <FrappeReconnectIndicator config={collectionConfig} />
      {/* Honest first-load state: skeleton until the File subscription is
          live; a failed subscription renders error chrome, never "no
          attachments". Consumer props spread last (explicit eject). */}
      <BaseAttachments
        items={items}
        isLoading={!!collection && isLoading}
        error={loadError}
        onRetry={onRetry}
        {...props}
      />
    </YStack>
  );
}

export function Attachments(props: FrappeAttachmentsProps) {
  // Retry re-creates the File collection (fresh initial sync) by remounting
  // the body — useFrappeCollection has no refetch surface of its own.
  const [retryNonce, setRetryNonce] = useState(0);
  const handleRetry = useCallback(() => {
    setRetryNonce((nonce) => nonce + 1);
  }, []);
  return (
    <AttachmentsBody
      key={retryNonce}
      onRetry={handleRetry}
      {...props}
    />
  );
}

import { Button, Text, XStack, YStack, useTheme } from '@repo/ui';
/**
 * Desk-style compact attachment rows for the form sidebar: private files get
 * a lock glyph, filenames open the file via the platform openUrl (new tab on
 * web, system browser/viewer elsewhere), each row removes, and an upload
 * affordance uses the web file picker (hidden on platforms without one;
 * document-picker gap).
 */
import { useResolvedKnobs } from '@repo/theme';
import { LockSimpleIcon, PaperclipIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { canOpenUrl, canPickFile, openUrl, pickFile, toAbsoluteUrl } from './sidebar-utils';

export interface SidebarAttachmentItem {
  /** File doc name (remove_attach fid). */
  id: string;
  fileName: string;
  /** Raw file_url from docinfo (may be relative to the bench). */
  fileUrl: string;
  isPrivate?: boolean;
}

export interface SidebarAttachmentsProps {
  items: SidebarAttachmentItem[];
  /** Bench base URL used to absolutize relative file_urls. */
  baseURL?: string;
  /** meta.max_attachments (0/undefined = unlimited). */
  maxAttachments?: number;
  disabled?: boolean;
  onUpload?: (file: File) => void;
  onRemove?: (item: SidebarAttachmentItem) => void;
}

export function SidebarAttachments({
  items,
  baseURL,
  maxAttachments,
  disabled,
  onUpload,
  onRemove,
}: SidebarAttachmentsProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  // Phosphor icons take a resolved color string, not a tamagui token —
  // read the theme value so native/GTK get a real color (not a CSS var).
  const iconColor = typeof theme.color11?.val === 'string' ? theme.color11.val : undefined;
  const sz = knobProps.sizeToken;
  const fontSize = sz === '$3' ? '$1' : sz === '$5' ? '$4' : '$2';
  const iconSize = sz === '$3' ? 12 : sz === '$5' ? 16 : 14;
  const linkable = canOpenUrl();

  const atLimit = typeof maxAttachments === 'number' && maxAttachments > 0 && items.length >= maxAttachments;
  const showUpload = Boolean(onUpload) && canPickFile();

  const handlePick = async () => {
    const file = await pickFile();
    if (file) {
      onUpload?.(file);
    }
  };

  return (
    <YStack {...knobProps.gap}>
      {items.length === 0 ? (
        <Text
          fontSize="$1"
          color="$color11">
          {t('noAttachments', 'No attachments')}
        </Text>
      ) : (
        <YStack gap="$1.5">
          {items.map((item) => {
            const url = toAbsoluteUrl(baseURL, item.fileUrl);
            return (
              <XStack
                key={item.id}
                gap="$2"
                alignItems="center">
                {item.isPrivate ? (
                  <LockSimpleIcon
                    size={iconSize}
                    color={iconColor}
                  />
                ) : (
                  <PaperclipIcon
                    size={iconSize}
                    color={iconColor}
                  />
                )}
                <Text
                  flex={1}
                  minWidth={0}
                  fontSize={fontSize}
                  color={linkable ? '$blue11' : '$color12'}
                  numberOfLines={1}
                  {...(linkable
                    ? {
                        cursor: 'pointer',
                        textDecorationLine: 'underline',
                        role: 'link' as const,
                        onPress: () => openUrl(url),
                      }
                    : {})}>
                  {item.fileName}
                </Text>
                {onRemove && (
                  <Button
                    size="$1"
                    chromeless
                    icon={XIcon}
                    disabled={disabled}
                    aria-label={t('removeAttachment', 'Remove {{name}}', {
                      name: item.fileName,
                    })}
                    onPress={() => {
                      onRemove(item);
                    }}
                  />
                )}
              </XStack>
            );
          })}
        </YStack>
      )}

      {showUpload && (
        <XStack
          alignItems="center"
          gap="$2">
          <Button
            size="$2"
            icon={UploadSimpleIcon}
            disabled={disabled ?? atLimit}
            {...(atLimit
              ? {
                  disabledReason: t('attachmentLimit', 'Attachment limit reached'),
                }
              : {})}
            onPress={() => void handlePick()}>
            {t('attachFile', 'Attach File')}
          </Button>
          {typeof maxAttachments === 'number' && maxAttachments > 0 && (
            <Text
              fontSize="$1"
              color="$color11">
              {items.length}/{maxAttachments}
            </Text>
          )}
        </XStack>
      )}
    </YStack>
  );
}

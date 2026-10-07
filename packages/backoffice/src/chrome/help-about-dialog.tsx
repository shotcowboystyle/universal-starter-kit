/**
 * About dialog (desk "About" parity): backoffice tagline + installed app
 * versions from `frappe.utils.change_log.get_versions`.
 *
 * RPC shape: { message: Record<appKey, { title, description, branch, version }> }
 * Versions are fetched lazily on first open and kept for the dialog's
 * lifetime; a failed fetch retries on the next open.
 */
import {
  Button,
  Dialog,
  DialogContent,
  Paragraph,
  SizableText,
  Spinner,
  XStack,
  YStack,
} from '@repo/ui';
import { sizeRecipeEscape } from '@repo/theme';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { useFrappeApp } from '../shared/useFrappeApp';

export interface FrappeAppVersion {
  title?: string;
  description?: string;
  branch?: string;
  version?: string;
}

interface GetVersionsPayload {
  message?: Record<string, FrappeAppVersion>;
}

export interface HelpAboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpAboutDialog({ open, onOpenChange }: HelpAboutDialogProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const app = useFrappeApp();
  const [versions, setVersions] = useState<Record<string, FrappeAppVersion> | undefined>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !app || versions) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    app
      .call()
      .get<GetVersionsPayload>('frappe.utils.change_log.get_versions')
      .then((response) => {
        if (cancelled) {
          return;
        }
        setVersions(response.payload?.message ?? {});
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, app, versions]);

  const entries = versions ? Object.entries(versions) : [];
  const unavailable = !app || failed || (versions !== undefined && entries.length === 0);

  return (
    <Dialog
      modal
      open={open}
      onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          key="overlay"
          backgroundColor="$shadow6"
        />
        <DialogContent
          key="content"
          width={sizeRecipeEscape(420, 'about dialog: a fixed reading width, held to 90% on narrow screens')}
          maxWidth="90%"
          data-testid="backoffice-help-about-dialog">
          <Dialog.Title size="$6">{t('help.aboutTitle', 'About')}</Dialog.Title>
          <Dialog.Description asChild>
            <Paragraph
              size="$3"
              color="$color11">
              {t(
                'help.aboutTagline',
                'Backoffice is the universal starter kit recreation of the Frappe Desk — one codebase across web, mobile, and desktop.',
              )}
            </Paragraph>
          </Dialog.Description>
          <YStack
            gap="$2"
            paddingTop="$2">
            <SizableText
              size="$2"
              fontWeight="400"
              color="$color10"
              textTransform="uppercase">
              {t('help.installedApps', 'Installed Apps')}
            </SizableText>
            {loading && (
              <XStack
                padding="$3"
                justifyContent="center">
                <Spinner size="small" />
              </XStack>
            )}
            {!loading && unavailable && (
              <Paragraph
                size="$3"
                color="$color10">
                {t('help.versionsUnavailable', 'Version information is unavailable.')}
              </Paragraph>
            )}
            {!loading &&
              entries.map(([key, info]) => (
                <XStack
                  key={key}
                  gap="$3"
                  alignItems="baseline"
                  justifyContent="space-between">
                  <SizableText
                    size="$3"
                    fontWeight="400"
                    flex={1}
                    numberOfLines={1}>
                    {info.title ?? key}
                  </SizableText>
                  <SizableText
                    size="$3"
                    color="$color11"
                    flexShrink={0}>
                    {info.version ? `v${info.version}${info.branch ? ` (${info.branch})` : ''}` : (info.branch ?? '—')}
                  </SizableText>
                </XStack>
              ))}
          </YStack>
          <XStack
            justifyContent="flex-end"
            paddingTop="$4">
            <Dialog.Close asChild>
              <Button size="$3">{t('help.close', 'Close')}</Button>
            </Dialog.Close>
          </XStack>
        </DialogContent>
      </Dialog.Portal>
    </Dialog>
  );
}

/**
 * About dialog (desk "About" parity): backoffice tagline + installed app
 * versions from `frappe.utils.change_log.get_versions`.
 *
 * RPC shape: { message: Record<appKey, { title, description, branch, version }> }
 * Versions are fetched lazily on first open and kept for the dialog's
 * lifetime; a failed fetch retries on the next open.
 */
import { sizeRecipeEscape } from '@repo/theme';
import { Button, Dialog, DialogContent, Paragraph, SizableText, Spinner, XStack, YStack } from '@repo/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { useFrappeApp } from '../shared/use-frappe-app';

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

/** "v1.2.3 (main)", "v1.2.3", the bare branch, or an em dash when neither is known. */
const formatVersion = (info: FrappeAppVersion): string => {
  const version = info.version ?? '';
  const branch = info.branch ?? '';
  if (version === '') {
    return info.branch ?? '—';
  }
  return branch === '' ? `v${version}` : `v${version} (${branch})`;
};

export const HelpAboutDialog = ({ open, onOpenChange }: HelpAboutDialogProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const app = useFrappeApp();
  const [versions, setVersions] = useState<Record<string, FrappeAppVersion> | undefined>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !app || versions) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    // oxlint-disable-next-line react/set-state-in-effect -- opening the dialog starts the versions fetch; the loading/failed flags reset with it
    setLoading(true);
    setFailed(false);
    const load = async () => {
      try {
        const response = await app.call().get<GetVersionsPayload>('frappe.utils.change_log.get_versions');
        if (!cancelled) {
          setVersions(response.payload?.message ?? {});
          setLoading(false);
        }
      } catch {
        // The dialog renders an "unavailable" state instead of surfacing the error.
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    };
    void load();
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
                    {formatVersion(info)}
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
};

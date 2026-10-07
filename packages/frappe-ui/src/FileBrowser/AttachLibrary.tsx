import { Dialog, DialogContent, DialogOverlay, Tabs } from '@repo/ui';
import { FileUpload } from '@repo/forms';
import { OVERLAY_BREAKPOINT } from '@repo/theme';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, YStack, useWindowDimensions } from 'tamagui';

import type { FileBrowserFile } from './types';

import { FileBrowser } from './index';

export interface AttachLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: unknown;
  onPick: (file: FileBrowserFile) => void;
  onUpload?: (file: File) => unknown;
  files?: FileBrowserFile[];
  currentFolder?: string;
  accept?: string;
}

export function AttachLibrary({
  open,
  onOpenChange,
  value,
  onPick,
  onUpload,
  files,
  currentFolder,
  accept,
}: AttachLibraryProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const drill = width < OVERLAY_BREAKPOINT;
  const [tab, setTab] = useState('library');
  const current = typeof value === 'string' ? value : undefined;

  return (
    <Dialog
      modal
      open={open}
      onOpenChange={onOpenChange}>
      {/* Dialog.Portal is what gates mounting on `open`. Without it Tamagui
          mounts Dialog.Content unconditionally, so a CLOSED AttachLibrary still
          put role="dialog" in the a11y tree and kept the whole FileBrowser
          subtree live. Every other house dialog (ConfirmDialog, CellModalEditor,
          HelpAboutDialog) already wraps overlay + content this way. */}
      {/* Explicit keys: Tamagui wraps every Portal child in AnimatePresence's
          PresenceChild, whose key is `child.key || ""`. Two keyless siblings
          therefore both land on "" and React logs a duplicate-key error per
          commit — and two presence children sharing a key can swap identity
          when the dialog toggles. Naming them is the fix on our side of the
          boundary (MPO-197). */}
      <Dialog.Portal>
        <DialogOverlay
          key="attach-scrim"
          backgroundColor="$background"
          opacity={0.5}
          data-filebrowser-attach-scrim
        />
        <DialogContent
          key="attach-content"
          aria-label={t('Attach file')}
          data-filebrowser-attach-dialog
          width={drill ? '100%' : 820}
          maxWidth="100%">
          <Text
            fontSize={20}
            lineHeight={32}
            fontFamily="$mono">
            {t('Attach file')}
          </Text>
          <Tabs
            variant="contained"
            value={tab}
            onChange={setTab}
            items={[
              {
                value: 'upload',
                label: t('Upload'),
                content: (
                  <YStack paddingTop="$4">
                    <FileUpload accept={accept} />
                  </YStack>
                ),
              },
              {
                value: 'library',
                label: t('From library'),
                content: (
                  <YStack
                    paddingTop="$4"
                    data-filebrowser-attach-library>
                    <FileBrowser
                      files={files}
                      layout={drill ? 'drill' : 'split'}
                      selectionMode="single"
                      currentValue={current}
                      currentFolder={currentFolder}
                      surfaceId="attach-library"
                      onPick={(file) => {
                        onPick(file);
                        onOpenChange(false);
                      }}
                      accept={accept}
                      onUpload={onUpload}
                    />
                  </YStack>
                ),
              },
            ]}
          />
        </DialogContent>
      </Dialog.Portal>
    </Dialog>
  );
}

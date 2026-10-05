import { ensureKeyboardModalityTracking, useResolvedKnobs, warnCancelDisabled, wasKeyboardFocus } from '@repo/theme';
import { useEffect } from 'react';
import { Dialog, Paragraph, XStack } from 'tamagui';

import { Button } from '../Button';
import { formCommonColors } from '../shared/colorRamps';
import { DialogShowFocus, useReturnFocusOnClose } from '../shared/focusManagement';
import { t } from '../shared/t';

export interface UnsavedChangesDialogProps {
  open: boolean;
  fieldCount: number;
  onKeepEditing: () => void;
  onDiscard: () => void;
}

/**
 * Opens on Keep editing, the least destructive action, as tamagui's
 * AlertDialog.Cancel does. Without it Chromium and WebKit's `<dialog>.show()`
 * parks focus on the tabIndex -1 panel and Firefox on Keep editing.
 * WebKit's show() also marks the panel :focus-visible, which a plain focus()
 * would carry onto the button after a pointer open; the ring is keyboard-only.
 */
function focusKeepEditing(event: Event) {
  const root = event.currentTarget as HTMLElement | null;
  const keep = root?.querySelector<HTMLElement>('[data-mp-savebar-keep]');
  if (!keep) {
    return;
  }
  event.preventDefault();
  keep.focus({ preventScroll: true, focusVisible: wasKeyboardFocus() } as FocusOptions);
}

/**
 * Route-leave / Discard confirm. Lives in forms so ContextualSaveBar
 * does not import `@repo/ui` (ConfirmDialog → forms Button
 * would cycle).
 */
export function UnsavedChangesDialog({ open, fieldCount, onKeepEditing, onDiscard }: UnsavedChangesDialogProps) {
  const { knobProps } = useResolvedKnobs();
  ensureKeyboardModalityTracking();
  useReturnFocusOnClose(open);

  useEffect(() => {
    warnCancelDisabled({ disabled: false, component: 'ContextualSaveBar' });
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onKeepEditing();
    }
  };

  const body =
    fieldCount === 1
      ? t("1 field on this page has edits that aren't saved. Leaving discards them.")
      : t("{{count}} fields on this page have edits that aren't saved. Leaving discards them.", {
          count: fieldCount,
        });

  return (
    <Dialog modal open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          key="overlay"
          backgroundColor="$background"
          opacity={0.5}
          transition={knobProps.transition}
          enterStyle={knobProps.transition ? { opacity: 0 } : undefined}
          exitStyle={knobProps.transition ? { opacity: 0 } : undefined}
        />
        <Dialog.Content
          key="content"
          role="alertdialog"
          tabIndex={-1}
          width="90%"
          maxWidth={440}
          padding="$4"
          gap="$4"
          {...knobProps.elevatedSurface}
          elevate={false}
          backgroundColor="$background"
          borderColor="$borderColor"
          borderWidth={1}
          {...knobProps.containerRadius}
          outlineWidth={0}
          focusStyle={{ outlineWidth: 0 }}
          focusVisibleStyle={{ outlineWidth: 0 }}
          data-mp-savebar-guard=""
          onPointerDownOutside={(e) => {
            e.preventDefault();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          onOpenAutoFocus={focusKeepEditing}>
          <Dialog.Title {...knobProps.body} fontSize="$4">
            {t('Discard unsaved changes?')}
          </Dialog.Title>
          <Dialog.Description asChild>
            <Paragraph {...knobProps.body} size="$3" color={formCommonColors.muted}>
              {body}
            </Paragraph>
          </Dialog.Description>
          <XStack {...knobProps.gap} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
            <Button
              outlined
              data-mp-savebar-keep=""
              onPress={() => {
                onKeepEditing();
              }}>
              {t('Keep editing')}
            </Button>
            <Button
              error
              actionRole="primary"
              data-mp-savebar-discard-confirm=""
              onPress={() => {
                onDiscard();
              }}>
              {t('Discard changes')}
            </Button>
          </XStack>
          <DialogShowFocus onOpenAutoFocus={focusKeepEditing} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

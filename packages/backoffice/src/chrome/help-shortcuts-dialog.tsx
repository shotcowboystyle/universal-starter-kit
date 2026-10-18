/**
 * Keyboard Shortcuts dialog (desk "Keyboard Shortcuts" parity, scoped to what
 * the backoffice actually implements — keep this list honest:
 *   - Mod+K / Mod+G focus the search bar (chrome/shortcuts.ts, shell-wired)
 *   - Mod+S saves the open document (form save shortcut)
 *   - Esc closes dialogs and menus (overlay default + shell drawer)
 */
import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { Button, Dialog, DialogContent, Paragraph, SizableText, XStack, YStack } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

export interface HelpShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Platform modifier label; SSR/native-safe (defaults to "Ctrl"). */
const getModLabel = (): string => {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/iu.test(navigator.platform ?? '')) {
    return '\u2318';
  }
  return 'Ctrl';
};

const KeyChip = ({ label }: { label: string }) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <XStack
      {...knobProps.borderRadius}
      borderColor="$borderColor"
      backgroundColor="$color2"
      paddingHorizontal="$2"
      paddingVertical="$1"
      minWidth="$2"
      justifyContent="center">
      <SizableText
        size="$1"
        fontWeight="400">
        {label}
      </SizableText>
    </XStack>
  );
};

interface ShortcutRowProps {
  /** Alternative key combos, e.g. [["Ctrl","K"],["Ctrl","G"]]. */
  combos: string[][];
  description: string;
}

const ShortcutRow = ({ combos, description }: ShortcutRowProps) => (
  <XStack
    gap="$3"
    alignItems="center">
    <XStack
      width={sizeRecipeEscape(
        150,
        'shortcuts dialog: a fixed width and key column so every description starts at one edge',
      )}
      gap="$1"
      alignItems="center"
      flexWrap="wrap"
      flexShrink={0}>
      {combos.map((combo, comboIndex) => (
        <XStack
          key={combo.join('+')}
          gap="$1"
          alignItems="center">
          {comboIndex > 0 && (
            <SizableText
              size="$2"
              color="$color10">
              /
            </SizableText>
          )}
          {combo.map((key, keyIndex) => (
            <XStack
              key={key}
              gap="$1"
              alignItems="center">
              {keyIndex > 0 && (
                <SizableText
                  size="$2"
                  color="$color10">
                  +
                </SizableText>
              )}
              <KeyChip label={key} />
            </XStack>
          ))}
        </XStack>
      ))}
    </XStack>
    <SizableText
      size="$3"
      flex={1}>
      {description}
    </SizableText>
  </XStack>
);

export const HelpShortcutsDialog = ({ open, onOpenChange }: HelpShortcutsDialogProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const mod = getModLabel();

  const rows: ShortcutRowProps[] = [
    {
      combos: [
        [mod, 'K'],
        [mod, 'G'],
      ],
      description: t('help.shortcutFocusSearch', 'Open the command palette'),
    },
    {
      combos: [[mod, 'S']],
      description: t('help.shortcutSaveForm', 'Save the open document'),
    },
    {
      combos: [['Esc']],
      description: t('help.shortcutCloseOverlays', 'Close dialogs and menus'),
    },
  ];

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
          width={sizeRecipeEscape(
            440,
            'shortcuts dialog: a fixed width and key column so every description starts at one edge',
          )}
          maxWidth="90%"
          data-testid="backoffice-help-shortcuts-dialog">
          <Dialog.Title size="$6">{t('help.shortcutsTitle', 'Keyboard Shortcuts')}</Dialog.Title>
          <Dialog.Description asChild>
            <Paragraph
              size="$3"
              color="$color11">
              {t('help.shortcutsIntro', 'Shortcuts available across the backoffice (web).')}
            </Paragraph>
          </Dialog.Description>
          <YStack
            gap="$3"
            paddingTop="$2">
            {rows.map((row) => (
              <ShortcutRow
                key={row.description}
                {...row}
              />
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

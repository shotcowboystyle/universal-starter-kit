import { Button, SizableText, Text, XStack, isWeb } from '@repo/ui';
import { useLayoutSizeClass } from '@repo/theme';
// The navbar search affordance for the backoffice desk chrome. Since MOD-01
// the results surface is a first-class command palette (CommandPalette):
// this component renders the TRIGGER — a search-input-styled button with the
// platform shortcut hint — and mounts the palette. The shell's global
// shortcuts (Mod+K / Mod+G, chrome/shortcuts.ts) land here through
// `focusRef` and open the same palette.
//
// The old input-anchored dropdown (unusable at phone widths — clamped to the
// ~110px input) is gone; the palette presents as a centered overlay ≥sm and
// a full-height sheet <sm, both fed by one section model
// (chrome/command-palette-model.ts).
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import type { Ref } from 'react';
import { useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { CommandPalette } from './CommandPalette';

/** Imperative surface for the shell's global shortcuts (Mod+K / Mod+G). */
export interface BackofficeAwesomebarHandle {
  /** Open the command palette (focus lands in its search input on web). */
  focus: () => void;
}

export interface BackofficeAwesomebarProps {
  /** Populated for the shell so useBackofficeShortcuts can open the palette. */
  focusRef?: Ref<BackofficeAwesomebarHandle>;
}

/** Platform modifier label; SSR/native-safe (defaults to "Ctrl"). */
function getModLabel(): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(String(navigator.platform ?? ''))) {
    return '\u2318';
  }
  return 'Ctrl';
}

export function BackofficeAwesomebar({ focusRef }: BackofficeAwesomebarProps = {}) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const isCompact = useLayoutSizeClass() === 'compact';
  const [open, setOpen] = useState(false);

  useImperativeHandle(
    focusRef,
    () => ({
      focus: () => {
        setOpen(true);
      },
    }),
    [],
  );

  const label = t('awesomebar.triggerLabel', 'Search');
  const showShortcutHint = isWeb && !isCompact;

  return (
    <>
      <Button
        size="$3"
        flex={1}
        minWidth={0}
        justifyContent="flex-start"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts={showShortcutHint ? 'Meta+K Control+K' : undefined}
        onPress={() => {
          setOpen(true);
        }}
        data-testid="backoffice-awesomebar">
        <MagnifyingGlassIcon size={16} />
        <Text
          flex={1}
          minWidth={0}
          numberOfLines={1}
          textAlign="left"
          color="$color10">
          {label}
        </Text>
        {showShortcutHint && (
          <XStack
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$color2"
            borderRadius="$2"
            paddingHorizontal="$1.5"
            flexShrink={0}
            aria-hidden>
            <SizableText
              size="$1"
              fontWeight="600"
              color="$color11">
              {`${getModLabel()} K`}
            </SizableText>
          </XStack>
        )}
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

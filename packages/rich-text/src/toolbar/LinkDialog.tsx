/**
 * Link dialog popover for inserting and editing links
 */

import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { PopoverContent } from '@repo/ui';
import { useCallback, useState } from 'react';
import { Input, Popover, Text, XStack, YStack } from 'tamagui';

import { t } from '../shared/t';
import { normalizeUrl } from '../shared/url';
import type { EditorState, RichEditorRef } from '../types';

import { LinkIcon } from './icons';
import { SHORTCUTS } from './shortcuts';
import { ToolbarButton } from './ToolbarButton';

export { normalizeUrl } from '../shared/url';

// ===========================================================================
// Types
// ===========================================================================

export interface LinkDialogProps {
  /** Reference to the editor */
  editorRef: React.RefObject<RichEditorRef | null>;
  /** Current editor state */
  state: EditorState;
  /** Whether the dialog is disabled */
  disabled?: boolean;
  /** Controlled open state (internal when omitted) — Mod+K wiring */
  open?: boolean;
  /** Called when the open state changes */
  onOpenChange?: (open: boolean) => void;
}

// ===========================================================================
// LinkDialog
// ===========================================================================

export const LinkDialog = ({ editorRef, state, disabled, open: openProp, onOpenChange }: LinkDialogProps) => {
  const { knobProps } = useResolvedKnobs();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const [linkUrl, setLinkUrl] = useState('');

  const handleSubmit = useCallback(() => {
    const normalized = normalizeUrl(linkUrl);
    if (normalized) {
      editorRef.current?.executeCommand('link', { href: normalized });
    }
    setLinkUrl('');
    setOpen(false);
  }, [linkUrl, editorRef, setOpen]);

  const handleRemove = useCallback(() => {
    editorRef.current?.executeCommand('link', { href: null });
    setOpen(false);
  }, [editorRef, setOpen]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start">
      <Popover.Trigger asChild>
        <ToolbarButton
          active={state.isLink}
          disabled={disabled}
          onPress={() => {
            setOpen(true);
          }}
          aria-label={t('Link')}
          tooltip={SHORTCUTS.link}>
          <LinkIcon />
        </ToolbarButton>
      </Popover.Trigger>
      <PopoverContent {...knobProps.panelPadding}>
        <Popover.Arrow
          borderColor="$borderColor"
          backgroundColor="$background"
        />
        <YStack
          gap="$2"
          minWidth={250}>
          <Text
            fontSize={knobProps.sizeToken}
            fontWeight="600">
            {state.isLink ? t('Edit Link') : t('Add Link')}
          </Text>
          <Input
            size="$3"
            placeholder="https://example.com"
            value={linkUrl}
            onChangeText={setLinkUrl}
            onSubmitEditing={handleSubmit}
            autoFocus
          />
          <XStack
            gap="$2"
            justifyContent="flex-end">
            {state.isLink && (
              <Button
                size="$2"
                error
                onPress={handleRemove}
                aria-label={t('Remove link')}>
                {t('Remove')}
              </Button>
            )}
            <Button
              size="$2"
              theme="active"
              onPress={handleSubmit}
              disabled={!linkUrl.trim()}
              aria-label={state.isLink ? t('Update link') : t('Add link')}>
              {state.isLink ? t('Update') : t('Add')}
            </Button>
          </XStack>
        </YStack>
      </PopoverContent>
    </Popover>
  );
};
